import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { exceptionQueueService } from './exception-queue-service';
import { logAuditEvent } from './audit-logger';
import {
  buildCoreBankingIdempotencyKey,
  getCoreBankingContract,
  nextRetryAt,
  validateCoreBankingInstruction,
  type CoreBankingInstructionDraft,
  type CoreBankingOperation,
} from './core-banking-contract-policy';

interface QueueInstructionInput {
  targetSystem?: string;
  operation: CoreBankingOperation;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actorId?: string;
  correlationId?: string;
}

export const coreBankingIntegrationService = {
  async queueInstruction(input: QueueInstructionInput) {
    const targetSystem = (input.targetSystem ?? 'FINACLE').toUpperCase();
    const draft: CoreBankingInstructionDraft = {
      targetSystem,
      operation: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
    };
    const contract = getCoreBankingContract(input.operation);
    const validationErrors = validateCoreBankingInstruction(draft);
    const idempotencyKey = buildCoreBankingIdempotencyKey(draft);

    const [existing] = await db
      .select()
      .from(schema.coreBankingInstructions)
      .where(eq(schema.coreBankingInstructions.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing) {
      return { status: 'DUPLICATE', instruction: existing, idempotencyKey };
    }

    const [adapter] = await db
      .select()
      .from(schema.oemsIntegrationAdapters)
      .where(
        and(
          eq(schema.oemsIntegrationAdapters.target_system, targetSystem),
          eq(schema.oemsIntegrationAdapters.adapter_status, 'ACTIVE'),
          eq(schema.oemsIntegrationAdapters.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.oemsIntegrationAdapters.created_at))
      .limit(1);

    if (validationErrors.length > 0) {
      const exception = await exceptionQueueService.createException({
        exception_type: 'OTHER',
        exception_domain: 'CORE_BANKING',
        severity: 'P2',
        title: `Core banking instruction validation failed: ${input.operation}`,
        description: validationErrors.join('; '),
        source_system: targetSystem,
        source_object_uri: `core-banking://${targetSystem}/instructions/${idempotencyKey}`,
        aggregate_type: 'CORE_BANKING_INSTRUCTION',
        aggregate_id: idempotencyKey,
        assigned_to_team: contract.ownerTeam,
      });
      return {
        status: 'VALIDATION_FAILED',
        validationErrors,
        exception,
        idempotencyKey,
      };
    }

    const instructionId = `CBI-${targetSystem}-${Date.now().toString(36).toUpperCase()}-${idempotencyKey.slice(0, 8).toUpperCase()}`;
    const [instruction] = await db
      .insert(schema.coreBankingInstructions)
      .values({
        instruction_id: instructionId,
        target_system: targetSystem,
        adapter_id: adapter?.adapter_id ?? null,
        operation: input.operation,
        entity_type: input.entityType,
        entity_id: input.entityId,
        idempotency_key: idempotencyKey,
        owner_team: contract.ownerTeam,
        request_payload: input.payload,
        response_payload: {},
        instruction_status: adapter ? 'QUEUED' : 'EXCEPTION',
        ack_status: contract.acknowledgementRequired ? 'PENDING' : 'NOT_REQUIRED',
        retry_count: 0,
        max_retries: contract.maxRetries,
        next_retry_at: adapter ? nextRetryAt(0, contract.retryBackoffSeconds) : null,
        correlation_id: input.correlationId ?? null,
        last_error: adapter ? null : `No ACTIVE adapter found for ${targetSystem}`,
        created_by: input.actorId ?? null,
        updated_by: input.actorId ?? null,
      })
      .returning();

    if (!adapter) {
      const exception = await exceptionQueueService.createException({
        exception_type: 'OTHER',
        exception_domain: 'CORE_BANKING',
        severity: 'P1',
        title: `No active core banking adapter for ${targetSystem}`,
        description: `Operation ${input.operation} cannot be dispatched because no ACTIVE adapter exists.`,
        source_system: targetSystem,
        source_object_uri: `core-banking://${targetSystem}/instructions/${instruction.instruction_id}`,
        aggregate_type: 'CORE_BANKING_INSTRUCTION',
        aggregate_id: instruction.instruction_id,
        assigned_to_team: contract.ownerTeam,
      });
      await db
        .update(schema.coreBankingInstructions)
        .set({ exception_id: exception.id, updated_at: new Date() })
        .where(eq(schema.coreBankingInstructions.id, instruction.id));
      return { status: 'EXCEPTION', instruction: { ...instruction, exception_id: exception.id }, exception, idempotencyKey };
    }

    await logAuditEvent({
      entityType: 'core_banking_instruction',
      entityId: String(instruction.id),
      action: 'QUEUED',
      actorId: input.actorId,
      correlationId: input.correlationId,
      changes: {
        target_system: targetSystem,
        operation: input.operation,
        adapter_id: adapter.adapter_id,
        idempotency_key: idempotencyKey,
      },
    });

    return { status: 'QUEUED', instruction, idempotencyKey, contract };
  },

  async acknowledgeInstruction(
    instructionId: string,
    data: {
      ackStatus: 'ACKNOWLEDGED' | 'REJECTED' | 'RETURNED';
      externalReference?: string;
      responsePayload?: Record<string, unknown>;
      errorMessage?: string;
      actorId?: string;
    },
  ) {
    const terminalStatus = data.ackStatus === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'EXCEPTION';
    const [updated] = await db
      .update(schema.coreBankingInstructions)
      .set({
        ack_status: data.ackStatus,
        instruction_status: terminalStatus,
        external_reference: data.externalReference ?? null,
        response_payload: data.responsePayload ?? {},
        acknowledged_at: new Date(),
        last_error: data.errorMessage ?? null,
        updated_at: new Date(),
        updated_by: data.actorId ?? null,
      })
      .where(eq(schema.coreBankingInstructions.instruction_id, instructionId))
      .returning();

    if (!updated) {
      throw new Error(`Core banking instruction not found: ${instructionId}`);
    }

    if (data.ackStatus !== 'ACKNOWLEDGED') {
      const exception = await exceptionQueueService.createException({
        exception_type: 'OTHER',
        exception_domain: 'CORE_BANKING',
        severity: 'P1',
        title: `Core banking instruction ${data.ackStatus.toLowerCase()}: ${instructionId}`,
        description: data.errorMessage ?? `Core banking returned ${data.ackStatus}`,
        source_system: updated.target_system ?? 'CORE_BANKING',
        source_object_uri: `core-banking://${updated.target_system ?? 'CORE_BANKING'}/instructions/${instructionId}`,
        aggregate_type: 'CORE_BANKING_INSTRUCTION',
        aggregate_id: instructionId,
        assigned_to_team: updated.owner_team ?? 'OPERATIONS',
      });
      await db
        .update(schema.coreBankingInstructions)
        .set({ exception_id: exception.id, updated_at: new Date() })
        .where(eq(schema.coreBankingInstructions.id, updated.id));
      return { instruction: { ...updated, exception_id: exception.id }, exception };
    }

    await logAuditEvent({
      entityType: 'core_banking_instruction',
      entityId: String(updated.id),
      action: 'ACKNOWLEDGED',
      actorId: data.actorId,
      changes: {
        external_reference: data.externalReference ?? null,
        ack_status: data.ackStatus,
      },
    });

    return { instruction: updated };
  },
};
