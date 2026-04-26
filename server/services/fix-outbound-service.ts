/**
 * FIX Outbound Service (FR-EXE-003)
 *
 * Builds and sends FIX 4.4 messages for order routing to exchanges/brokers.
 * Supports NewOrderSingle (35=D), OrderCancelRequest (35=F),
 * and handles inbound ExecutionReport (35=8) processing.
 *
 * Messages are persisted to `fixOutboundMessages` for audit/replay.
 */

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import * as schema from '@shared/schema';

// =============================================================================
// FIX Tag Constants
// =============================================================================

const FIX_VERSION = 'FIX.4.4';
const SENDER_COMP_ID = 'TRUSTOMS';

// Standard FIX tags used in message building
const TAG = {
  BeginString: 8,
  BodyLength: 9,
  MsgType: 35,
  SenderCompID: 49,
  TargetCompID: 56,
  MsgSeqNum: 34,
  SendingTime: 52,
  ClOrdID: 11,
  Symbol: 55,
  Side: 54,
  TransactTime: 60,
  OrderQty: 38,
  OrdType: 40,
  Price: 44,
  StopPx: 99,
  Currency: 15,
  TimeInForce: 59,
  OrigClOrdID: 41,
  ExecID: 17,
  ExecType: 150,
  OrdStatus: 39,
  LeavesQty: 151,
  CumQty: 14,
  AvgPx: 6,
  CheckSum: 10,
} as const;

// FIX side mapping
const SIDE_MAP: Record<string, string> = {
  BUY: '1',
  SELL: '2',
  SHORT_SELL: '5',
};

// FIX order type mapping
const ORD_TYPE_MAP: Record<string, string> = {
  MARKET: '1',
  LIMIT: '2',
  STOP: '3',
  STOP_LIMIT: '4',
};

// FIX time-in-force mapping
const TIF_MAP: Record<string, string> = {
  DAY: '0',
  GTC: '1',
  IOC: '3',
  FOK: '4',
  GTD: '6',
};

// =============================================================================
// Types
// =============================================================================

interface FIXField {
  tag: number;
  value: string;
}

interface ExecutionReportData {
  clOrdId: string;
  execId: string;
  execType: string;
  ordStatus: string;
  leavesQty: number;
  cumQty: number;
  avgPx: number;
  targetCompId: string;
}

// =============================================================================
// Service
// =============================================================================

export const fixOutboundService = {
  /**
   * Build and send a FIX 4.4 NewOrderSingle (35=D) for an order.
   */
  async sendNewOrderSingle(
    orderId: string,
    targetCompId: string,
  ): Promise<{ messageId: number; clOrdId: string; status: string }> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const clOrdId = `${orderId}-${Date.now()}`;
    const now = new Date();

    const fields: FIXField[] = [
      { tag: TAG.MsgType, value: 'D' },
      { tag: TAG.SenderCompID, value: SENDER_COMP_ID },
      { tag: TAG.TargetCompID, value: targetCompId },
      { tag: TAG.ClOrdID, value: clOrdId },
      { tag: TAG.Symbol, value: String(order.security_id ?? '') },
      { tag: TAG.Side, value: SIDE_MAP[order.side ?? 'BUY'] ?? '1' },
      { tag: TAG.TransactTime, value: now.toISOString() },
      { tag: TAG.OrderQty, value: String(order.quantity ?? '0') },
      { tag: TAG.OrdType, value: ORD_TYPE_MAP[order.type ?? 'MARKET'] ?? '1' },
      { tag: TAG.Currency, value: order.currency ?? 'PHP' },
      { tag: TAG.TimeInForce, value: TIF_MAP[order.time_in_force ?? 'DAY'] ?? '0' },
    ];

    // Add price for limit orders
    if (order.limit_price) {
      fields.push({ tag: TAG.Price, value: String(order.limit_price) });
    }
    if (order.stop_price) {
      fields.push({ tag: TAG.StopPx, value: String(order.stop_price) });
    }

    const payload = buildFIXMessage(fields);

    const [msg] = await db
      .insert(schema.fixOutboundMessages)
      .values({
        order_id: orderId,
        msg_type: 'NEW_ORDER_SINGLE',
        fix_version: FIX_VERSION,
        target_comp_id: targetCompId,
        sender_comp_id: SENDER_COMP_ID,
        payload: { clOrdId, fields, raw: payload },
        ack_status: 'PENDING',
        sent_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: schema.fixOutboundMessages.id });

    return {
      messageId: msg.id,
      clOrdId,
      status: 'PENDING',
    };
  },

  /**
   * Build and send a FIX 4.4 OrderCancelRequest (35=F).
   */
  async sendCancelRequest(
    orderId: string,
    targetCompId: string,
    originalClOrdId: string,
  ): Promise<{ messageId: number; clOrdId: string; status: string }> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const clOrdId = `CXL-${orderId}-${Date.now()}`;
    const now = new Date();

    const fields: FIXField[] = [
      { tag: TAG.MsgType, value: 'F' },
      { tag: TAG.SenderCompID, value: SENDER_COMP_ID },
      { tag: TAG.TargetCompID, value: targetCompId },
      { tag: TAG.ClOrdID, value: clOrdId },
      { tag: TAG.OrigClOrdID, value: originalClOrdId },
      { tag: TAG.Symbol, value: String(order.security_id ?? '') },
      { tag: TAG.Side, value: SIDE_MAP[order.side ?? 'BUY'] ?? '1' },
      { tag: TAG.TransactTime, value: now.toISOString() },
      { tag: TAG.OrderQty, value: String(order.quantity ?? '0') },
    ];

    const payload = buildFIXMessage(fields);

    const [msg] = await db
      .insert(schema.fixOutboundMessages)
      .values({
        order_id: orderId,
        msg_type: 'ORDER_CANCEL_REQUEST',
        fix_version: FIX_VERSION,
        target_comp_id: targetCompId,
        sender_comp_id: SENDER_COMP_ID,
        payload: { clOrdId, originalClOrdId, fields, raw: payload },
        ack_status: 'PENDING',
        sent_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: schema.fixOutboundMessages.id });

    return {
      messageId: msg.id,
      clOrdId,
      status: 'PENDING',
    };
  },

  /**
   * Process an inbound ExecutionReport (35=8) — update message ack and order state.
   */
  async handleExecutionReport(report: ExecutionReportData): Promise<{
    orderId: string;
    execType: string;
    ordStatus: string;
    cumQty: number;
    avgPx: number;
  }> {
    // Find the outbound message by clOrdId
    const messages = await db
      .select()
      .from(schema.fixOutboundMessages)
      .where(eq(schema.fixOutboundMessages.ack_status, 'PENDING'));

    const matchedMsg = messages.find((m: Record<string, unknown>) => {
      const p = m.payload as Record<string, unknown>;
      return p?.clOrdId === report.clOrdId;
    });

    if (!matchedMsg) {
      throw new Error(`No pending outbound message found for clOrdId: ${report.clOrdId}`);
    }

    const now = new Date();
    const ackStatus = report.execType === '8' ? 'REJECTED' : 'ACKNOWLEDGED';

    // Update the outbound message ack
    await db
      .update(schema.fixOutboundMessages)
      .set({
        ack_status: ackStatus,
        ack_at: now,
        updated_at: now,
      })
      .where(eq(schema.fixOutboundMessages.id, matchedMsg.id));

    // Map FIX OrdStatus to internal order status
    const orderId = matchedMsg.order_id!;
    const orderStatusMap: Record<string, string> = {
      '0': 'OPEN',       // New
      '1': 'EXECUTED',    // Partially filled
      '2': 'EXECUTED',    // Filled
      '4': 'CANCELLED',   // Cancelled
      '8': 'REJECTED',    // Rejected
    };

    const newStatus = orderStatusMap[report.ordStatus];
    if (newStatus) {
      await db
        .update(schema.orders)
        .set({
          order_status: newStatus as 'OPEN' | 'EXECUTED' | 'CANCELLED' | 'REJECTED',
          updated_at: now,
        })
        .where(eq(schema.orders.order_id, orderId));
    }

    // Log the execution report as an inbound message
    await db
      .insert(schema.fixOutboundMessages)
      .values({
        order_id: orderId,
        msg_type: 'EXECUTION_REPORT',
        fix_version: FIX_VERSION,
        target_comp_id: SENDER_COMP_ID,
        sender_comp_id: report.targetCompId,
        payload: report,
        ack_status: 'ACKNOWLEDGED',
        sent_at: now,
        ack_at: now,
        created_at: now,
        updated_at: now,
      });

    return {
      orderId,
      execType: report.execType,
      ordStatus: report.ordStatus,
      cumQty: report.cumQty,
      avgPx: report.avgPx,
    };
  },

  /**
   * Get all FIX messages for a given order.
   */
  async getMessagesForOrder(orderId: string) {
    return db
      .select()
      .from(schema.fixOutboundMessages)
      .where(eq(schema.fixOutboundMessages.order_id, orderId))
      .orderBy(schema.fixOutboundMessages.sent_at);
  },

  /**
   * Retry a timed-out or pending message.
   */
  async retryMessage(messageId: number): Promise<{ status: string }> {
    const [msg] = await db
      .select()
      .from(schema.fixOutboundMessages)
      .where(
        and(
          eq(schema.fixOutboundMessages.id, messageId),
          eq(schema.fixOutboundMessages.ack_status, 'TIMED_OUT'),
        ),
      )
      .limit(1);

    if (!msg) {
      throw new Error(`No timed-out message found with id: ${messageId}`);
    }

    await db
      .update(schema.fixOutboundMessages)
      .set({
        ack_status: 'PENDING',
        sent_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.fixOutboundMessages.id, messageId));

    return { status: 'RETRIED' };
  },

  /**
   * Mark stale pending messages as timed out (called by EOD or scheduler).
   */
  async timeoutStaleMessages(maxAgeMs: number = 300_000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const pending = await db
      .select()
      .from(schema.fixOutboundMessages)
      .where(eq(schema.fixOutboundMessages.ack_status, 'PENDING'));

    const stale = pending.filter(
      (m: Record<string, unknown>) => m.sent_at && new Date(m.sent_at as string).getTime() < cutoff.getTime(),
    );

    for (const msg of stale) {
      await db
        .update(schema.fixOutboundMessages)
        .set({ ack_status: 'TIMED_OUT', updated_at: new Date() })
        .where(eq(schema.fixOutboundMessages.id, msg.id));
    }

    return stale.length;
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a FIX-like message string from fields (simplified — real FIX uses SOH delimiters).
 */
function buildFIXMessage(fields: FIXField[]): string {
  const body = fields.map((f) => `${f.tag}=${f.value}`).join('|');
  const header = `${TAG.BeginString}=${FIX_VERSION}|${TAG.BodyLength}=${body.length}`;
  const checksum = computeChecksum(`${header}|${body}`);
  return `${header}|${body}|${TAG.CheckSum}=${checksum}|`;
}

function computeChecksum(message: string): string {
  let sum = 0;
  for (let i = 0; i < message.length; i++) {
    sum += message.charCodeAt(i);
  }
  return String(sum % 256).padStart(3, '0');
}
