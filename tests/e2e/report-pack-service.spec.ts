import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectQueues: [] as any[][],
  insertValues: [] as any[],
  updateValues: [] as any[],
  generatedReports: [] as any[],
}));

vi.mock('../../server/db', () => {
  function selectChain(): any {
    return {
      from: () => selectChain(),
      where: () => selectChain(),
      orderBy: () => selectChain(),
      limit: async () => mockState.selectQueues.shift() ?? [],
      offset: () => selectChain(),
      then: (resolve: any, reject: any) => Promise.resolve(mockState.selectQueues.shift() ?? []).then(resolve, reject),
    };
  }

  function insertChain(): any {
    return {
      values: (values: any) => {
        mockState.insertValues.push(values);
        const id = values.run_id ? 501 : values.report_type ? 701 : mockState.insertValues.length;
        return {
          returning: async () => [{ id, ...values }],
          then: (resolve: any, reject: any) => Promise.resolve([{ id, ...values }]).then(resolve, reject),
        };
      },
    };
  }

  function updateChain(): any {
    return {
      set: (values: any) => {
        mockState.updateValues.push(values);
        return {
          where: () => ({
            returning: async () => [{ id: 999, ...values }],
            then: (resolve: any, reject: any) => Promise.resolve([{ id: 999, ...values }]).then(resolve, reject),
          }),
        };
      },
    };
  }

  return {
    db: {
      select: () => selectChain(),
      insert: () => insertChain(),
      update: () => updateChain(),
    },
  };
});

vi.mock('@shared/schema', () => {
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, prop: string | symbol) {
          if (typeof prop === 'symbol') return undefined;
          return `${name}.${prop}`;
        },
      },
    );

  return {
    reportPackTemplates: table('report_pack_templates'),
    reportPackRuns: table('report_pack_runs'),
    reportPackOutputs: table('report_pack_outputs'),
    reportGenerationLog: table('report_generation_log'),
    notificationLog: table('notification_log'),
    exceptionItems: table('exception_items'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (...args: any[]) => args,
  desc: (value: any) => value,
}));

vi.mock('../../server/services/report-generator-service', () => ({
  reportGeneratorService: {
    generateReport: vi.fn(async (reportType: string) => {
      const report = {
        reportType,
        data: {
          rows: [
            { client_id: 'C-001', tin: '123-456', amount: 1000 },
            { client_id: 'C-002', tin: '987-654', amount: 2000 },
          ],
        },
      };
      mockState.generatedReports.push(report);
      return report;
    }),
  },
}));

vi.mock('../../server/services/exception-queue-service', () => ({
  exceptionQueueService: {
    createException: vi.fn(async () => ({ id: 77 })),
  },
}));

import { reportPackService } from '../../server/services/report-pack-service';

describe('report pack service', () => {
  beforeEach(() => {
    mockState.selectQueues.length = 0;
    mockState.insertValues.length = 0;
    mockState.updateValues.length = 0;
    mockState.generatedReports.length = 0;
  });

  it('creates durable run and output records with masked payloads', async () => {
    mockState.selectQueues.push([
      {
        id: 7,
        pack_name: 'Monthly Trust Pack',
        report_types: ['AUM_SUMMARY'],
        output_formats: ['JSON'],
        default_delivery_channels: ['IN_APP'],
        default_recipients: [{ recipient_type: 'CLIENT', recipient_id: 'C-001' }],
        retention_years: 7,
        masking_policy: { fields: ['tin'] },
        is_active: true,
      },
    ]);

    const result = await reportPackService.generatePack(7, {
      params: { period: '2026-04' },
      requestedBy: 'ops.user1',
    });

    expect(result.outputs).toHaveLength(1);
    const runInsert = mockState.insertValues.find((value) => value.run_id);
    expect(runInsert).toMatchObject({
      template_id: 7,
      pack_name: 'Monthly Trust Pack',
      run_status: 'RUNNING',
      requested_by: 'ops.user1',
    });
    const outputInsert = mockState.insertValues.find((value) => value.report_type === 'AUM_SUMMARY');
    expect(outputInsert.delivery_status).toBe('PENDING');
    expect(outputInsert.content_hash).toHaveLength(64);
    expect(outputInsert.generation_payload.report.data.rows[0].tin).toBe('***MASKED***');
    expect(mockState.updateValues.at(-1)).toMatchObject({ run_status: 'COMPLETED', output_count: 1 });
  });

  it('dispatches generated outputs and records delivery audit', async () => {
    mockState.selectQueues.push(
      [{ id: 501, run_id: 'RPK-7-ABC', run_status: 'COMPLETED' }],
      [{ id: 701, content_hash: 'abc123', report_type: 'AUM_SUMMARY' }],
    );

    const result = await reportPackService.dispatchRun('RPK-7-ABC', {
      deliveryChannels: ['EMAIL'],
      recipients: [{ recipient_type: 'CLIENT', recipient_id: 'C-001' }],
      actorId: 'ops.user1',
    });

    expect(result.delivered_count).toBe(1);
    expect(mockState.updateValues[0]).toMatchObject({
      delivery_channel: 'EMAIL',
      recipient_type: 'CLIENT',
      recipient_id: 'C-001',
      delivery_status: 'DELIVERED',
    });
    expect(mockState.insertValues[0]).toMatchObject({
      event_type: 'REPORT_PACK_DELIVERED',
      recipient_id: 'C-001',
      notification_status: 'DELIVERED',
    });
  });

  it('schedules retry attempts with incremented retry count', async () => {
    mockState.selectQueues.push([
      {
        id: 701,
        report_type: 'AUM_SUMMARY',
        retry_count: 1,
        max_retries: 3,
      },
    ]);

    const result = await reportPackService.retryOutputDelivery(701, 'ops.user1');

    expect(result).toBeDefined();
    expect(mockState.updateValues[0].delivery_status).toBe('PENDING');
    expect(mockState.updateValues[0].retry_count).toBe(2);
    expect(mockState.updateValues[0].next_retry_at).toBeInstanceOf(Date);
  });
});
