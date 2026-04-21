/**
 * Fee Reports Routes (TrustFees Pro -- Phase 10)
 *
 *   GET    /catalog   -- Available report types with metadata
 *   POST   /generate  -- Generate report data
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, and, gte, lte, sql, like, or, desc } from 'drizzle-orm';

const router = Router();

/* ---------- Report Catalog ---------- */
const REPORT_CATALOG = [
  {
    id: 'fee_plan_register',
    name: 'Fee Plan Register',
    description: 'All fee plans with status, type, jurisdiction, and effective dates',
    required_params: [],
    optional_params: ['jurisdiction_id'],
  },
  {
    id: 'daily_accrual_summary',
    name: 'Daily Accrual Summary',
    description: 'Aggregate accruals by date and fee type',
    required_params: [],
    optional_params: ['date_from', 'date_to', 'fee_type'],
  },
  {
    id: 'invoice_register',
    name: 'Invoice Register',
    description: 'All invoices with line counts and payment status',
    required_params: [],
    optional_params: ['date_from', 'date_to', 'customer_id'],
  },
  {
    id: 'overdue_ageing',
    name: 'Overdue Ageing',
    description: 'Overdue invoices with ageing buckets',
    required_params: [],
    optional_params: ['customer_id'],
  },
  {
    id: 'override_register',
    name: 'Override Register',
    description: 'All fee overrides with delta percentage and status',
    required_params: [],
    optional_params: ['date_from', 'date_to'],
  },
  {
    id: 'reversal_log',
    name: 'Reversal Log',
    description: 'Reversed accruals and cancelled invoices',
    required_params: [],
    optional_params: ['date_from', 'date_to'],
  },
  {
    id: 'tax_summary',
    name: 'Tax Summary',
    description: 'Tax amounts by tax code and period',
    required_params: [],
    optional_params: ['date_from', 'date_to', 'jurisdiction_id'],
  },
  {
    id: 'exception_kpi',
    name: 'Exception KPI',
    description: 'Exception metrics with SLA adherence calculation',
    required_params: [],
    optional_params: ['date_from', 'date_to'],
  },
  {
    id: 'adhoc_fee_register',
    name: 'Ad-hoc Fee Register',
    description: 'All ad-hoc fees captured outside regular accrual cycles',
    required_params: [],
    optional_params: ['date_from', 'date_to', 'customer_id'],
  },
];

/* ---------- Helpers ---------- */
function buildDateConditions(
  table: { created_at: any },
  date_from?: string,
  date_to?: string
) {
  const conditions: any[] = [];
  if (date_from) {
    conditions.push(gte(table.created_at, new Date(date_from)));
  }
  if (date_to) {
    const endDate = new Date(date_to);
    endDate.setDate(endDate.getDate() + 1);
    conditions.push(lte(table.created_at, endDate));
  }
  return conditions;
}

/* ---------- Routes ---------- */

/** GET /catalog -- Available report types */
router.get(
  '/catalog',
  asyncHandler(async (_req, res) => {
    res.json({ data: REPORT_CATALOG });
  }),
);

/** POST /generate -- Generate report data */
router.post(
  '/generate',
  asyncHandler(async (req: any, res: any) => {
    const { report_type, params = {} } = req.body;

    if (!report_type) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'report_type is required' },
      });
    }

    const catalogEntry = REPORT_CATALOG.find((r) => r.id === report_type);
    if (!catalogEntry) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REPORT_TYPE',
          message: `Unknown report type: ${report_type}`,
        },
      });
    }

    let columns: string[] = [];
    let rows: (string | number | null)[][] = [];

    try {
      switch (report_type) {
        case 'fee_plan_register': {
          const conditions: any[] = [];
          if (params.jurisdiction_id) {
            conditions.push(
              eq(
                schema.feePlans.jurisdiction_id,
                parseInt(params.jurisdiction_id, 10)
              )
            );
          }

          const data = await db
            .select()
            .from(schema.feePlans)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.feePlans.created_at));

          columns = [
            'id',
            'fee_plan_code',
            'fee_plan_name',
            'fee_type',
            'charge_basis',
            'jurisdiction_id',
            'plan_status',
            'effective_date',
            'expiry_date',
            'rate_type',
            'created_at',
          ];
          rows = data.map((r: any) => [
            r.id,
            r.fee_plan_code,
            r.fee_plan_name,
            r.fee_type,
            r.charge_basis,
            r.jurisdiction_id,
            r.plan_status,
            r.effective_date,
            r.expiry_date,
            r.rate_type,
            r.created_at ? new Date(r.created_at).toISOString() : null,
          ]);
          break;
        }

        case 'daily_accrual_summary': {
          const conditions: any[] = [];
          if (params.date_from) {
            conditions.push(gte(schema.tfpAccruals.accrual_date, params.date_from));
          }
          if (params.date_to) {
            conditions.push(lte(schema.tfpAccruals.accrual_date, params.date_to));
          }
          if (params.fee_type) {
            // Join with feePlans to filter by fee_type
          }

          const data = await db
            .select({
              accrual_date: schema.tfpAccruals.accrual_date,
              fee_type: schema.feePlans.fee_type,
              count: sql<number>`count(*)::int`,
              total_computed_fee: sql<string>`sum(${schema.tfpAccruals.computed_fee})`,
              total_applied_fee: sql<string>`sum(${schema.tfpAccruals.applied_fee})`,
            })
            .from(schema.tfpAccruals)
            .leftJoin(
              schema.feePlans,
              eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id)
            )
            .where(
              conditions.length > 0
                ? and(
                    ...conditions,
                    ...(params.fee_type
                      ? [eq(schema.feePlans.fee_type, params.fee_type)]
                      : [])
                  )
                : params.fee_type
                  ? eq(schema.feePlans.fee_type, params.fee_type)
                  : undefined
            )
            .groupBy(schema.tfpAccruals.accrual_date, schema.feePlans.fee_type)
            .orderBy(desc(schema.tfpAccruals.accrual_date));

          columns = [
            'accrual_date',
            'fee_type',
            'count',
            'total_computed_fee',
            'total_applied_fee',
          ];
          rows = data.map((r: any) => [
            r.accrual_date,
            r.fee_type,
            r.count,
            r.total_computed_fee,
            r.total_applied_fee,
          ]);
          break;
        }

        case 'invoice_register': {
          const conditions: any[] = [];
          if (params.date_from) {
            conditions.push(gte(schema.tfpInvoices.invoice_date, params.date_from));
          }
          if (params.date_to) {
            conditions.push(lte(schema.tfpInvoices.invoice_date, params.date_to));
          }
          if (params.customer_id) {
            conditions.push(eq(schema.tfpInvoices.customer_id, params.customer_id));
          }

          const data = await db
            .select({
              id: schema.tfpInvoices.id,
              invoice_number: schema.tfpInvoices.invoice_number,
              customer_id: schema.tfpInvoices.customer_id,
              currency: schema.tfpInvoices.currency,
              total_amount: schema.tfpInvoices.total_amount,
              tax_amount: schema.tfpInvoices.tax_amount,
              grand_total: schema.tfpInvoices.grand_total,
              invoice_date: schema.tfpInvoices.invoice_date,
              due_date: schema.tfpInvoices.due_date,
              invoice_status: schema.tfpInvoices.invoice_status,
              line_count: sql<number>`(SELECT count(*) FROM tfp_invoice_lines WHERE invoice_id = ${schema.tfpInvoices.id})::int`,
            })
            .from(schema.tfpInvoices)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.tfpInvoices.invoice_date));

          columns = [
            'id',
            'invoice_number',
            'customer_id',
            'currency',
            'total_amount',
            'tax_amount',
            'grand_total',
            'invoice_date',
            'due_date',
            'invoice_status',
            'line_count',
          ];
          rows = data.map((r: any) => [
            r.id,
            r.invoice_number,
            r.customer_id,
            r.currency,
            r.total_amount,
            r.tax_amount,
            r.grand_total,
            r.invoice_date,
            r.due_date,
            r.invoice_status,
            r.line_count,
          ]);
          break;
        }

        case 'overdue_ageing': {
          const conditions: any[] = [
            or(
              eq(schema.tfpInvoices.invoice_status, 'OVERDUE'),
              eq(schema.tfpInvoices.invoice_status, 'ISSUED')
            )!,
          ];
          if (params.customer_id) {
            conditions.push(eq(schema.tfpInvoices.customer_id, params.customer_id));
          }

          const data = await db
            .select()
            .from(schema.tfpInvoices)
            .where(and(...conditions))
            .orderBy(schema.tfpInvoices.due_date);

          const today = new Date();
          columns = [
            'invoice_number',
            'customer_id',
            'grand_total',
            'currency',
            'due_date',
            'days_overdue',
            'ageing_bucket',
            'invoice_status',
          ];
          rows = data.map((r: any) => {
            const due = new Date(r.due_date);
            const daysOverdue = Math.max(
              0,
              Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
            );
            let bucket = 'Current';
            if (daysOverdue > 90) bucket = '90+';
            else if (daysOverdue > 60) bucket = '61-90';
            else if (daysOverdue > 30) bucket = '31-60';
            else if (daysOverdue > 0) bucket = '1-30';

            return [
              r.invoice_number,
              r.customer_id,
              r.grand_total,
              r.currency,
              r.due_date,
              daysOverdue,
              bucket,
              r.invoice_status,
            ];
          });
          break;
        }

        case 'override_register': {
          const conditions: any[] = [];
          const dateConditions = buildDateConditions(
            schema.feeOverrides,
            params.date_from,
            params.date_to
          );
          conditions.push(...dateConditions);

          const data = await db
            .select()
            .from(schema.feeOverrides)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.feeOverrides.created_at));

          columns = [
            'id',
            'stage',
            'accrual_id',
            'invoice_id',
            'original_amount',
            'overridden_amount',
            'delta_pct',
            'reason_code',
            'reason_notes',
            'requested_by',
            'approved_by',
            'override_status',
            'created_at',
          ];
          rows = data.map((r: any) => [
            r.id,
            r.stage,
            r.accrual_id,
            r.invoice_id,
            r.original_amount,
            r.overridden_amount,
            r.delta_pct,
            r.reason_code,
            r.reason_notes,
            r.requested_by,
            r.approved_by,
            r.override_status,
            r.created_at ? new Date(r.created_at).toISOString() : null,
          ]);
          break;
        }

        case 'reversal_log': {
          const conditions: any[] = [
            eq(schema.tfpAccruals.accrual_status, 'REVERSED'),
          ];
          if (params.date_from) {
            conditions.push(gte(schema.tfpAccruals.accrual_date, params.date_from));
          }
          if (params.date_to) {
            conditions.push(lte(schema.tfpAccruals.accrual_date, params.date_to));
          }

          const data = await db
            .select({
              id: schema.tfpAccruals.id,
              fee_plan_id: schema.tfpAccruals.fee_plan_id,
              customer_id: schema.tfpAccruals.customer_id,
              portfolio_id: schema.tfpAccruals.portfolio_id,
              computed_fee: schema.tfpAccruals.computed_fee,
              applied_fee: schema.tfpAccruals.applied_fee,
              currency: schema.tfpAccruals.currency,
              accrual_date: schema.tfpAccruals.accrual_date,
              accrual_status: schema.tfpAccruals.accrual_status,
              idempotency_key: schema.tfpAccruals.idempotency_key,
              fee_plan_code: schema.feePlans.fee_plan_code,
            })
            .from(schema.tfpAccruals)
            .leftJoin(
              schema.feePlans,
              eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id)
            )
            .where(and(...conditions))
            .orderBy(desc(schema.tfpAccruals.accrual_date));

          columns = [
            'id',
            'fee_plan_code',
            'customer_id',
            'portfolio_id',
            'computed_fee',
            'applied_fee',
            'currency',
            'accrual_date',
            'accrual_status',
            'idempotency_key',
          ];
          rows = data.map((r: any) => [
            r.id,
            r.fee_plan_code,
            r.customer_id,
            r.portfolio_id,
            r.computed_fee,
            r.applied_fee,
            r.currency,
            r.accrual_date,
            r.accrual_status,
            r.idempotency_key,
          ]);
          break;
        }

        case 'tax_summary': {
          const conditions: any[] = [];
          if (params.date_from) {
            conditions.push(
              gte(
                schema.tfpInvoices.invoice_date,
                params.date_from
              )
            );
          }
          if (params.date_to) {
            conditions.push(
              lte(
                schema.tfpInvoices.invoice_date,
                params.date_to
              )
            );
          }
          if (params.jurisdiction_id) {
            conditions.push(
              eq(
                schema.tfpInvoices.jurisdiction_id,
                parseInt(params.jurisdiction_id, 10)
              )
            );
          }

          const data = await db
            .select({
              tax_code: schema.tfpInvoiceLines.tax_code,
              count: sql<number>`count(*)::int`,
              total_tax_amount: sql<string>`sum(${schema.tfpInvoiceLines.tax_amount})`,
              total_line_amount: sql<string>`sum(${schema.tfpInvoiceLines.line_amount})`,
            })
            .from(schema.tfpInvoiceLines)
            .innerJoin(
              schema.tfpInvoices,
              eq(schema.tfpInvoiceLines.invoice_id, schema.tfpInvoices.id)
            )
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(schema.tfpInvoiceLines.tax_code)
            .orderBy(schema.tfpInvoiceLines.tax_code);

          columns = ['tax_code', 'count', 'total_tax_amount', 'total_line_amount'];
          rows = data.map((r: any) => [
            r.tax_code,
            r.count,
            r.total_tax_amount,
            r.total_line_amount,
          ]);
          break;
        }

        case 'exception_kpi': {
          const conditions: any[] = [];
          const dateConditions = buildDateConditions(
            schema.exceptionItems,
            params.date_from,
            params.date_to
          );
          conditions.push(...dateConditions);

          const data = await db
            .select({
              exception_type: schema.exceptionItems.exception_type,
              severity: schema.exceptionItems.severity,
              exception_status: schema.exceptionItems.exception_status,
              count: sql<number>`count(*)::int`,
              sla_breached: sql<number>`count(*) filter (where ${schema.exceptionItems.resolved_at} > ${schema.exceptionItems.sla_due_at} or (${schema.exceptionItems.resolved_at} is null and ${schema.exceptionItems.sla_due_at} < now()))::int`,
              avg_resolution_hours: sql<string>`round(avg(extract(epoch from (${schema.exceptionItems.resolved_at} - ${schema.exceptionItems.created_at})) / 3600)::numeric, 2)`,
            })
            .from(schema.exceptionItems)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(
              schema.exceptionItems.exception_type,
              schema.exceptionItems.severity,
              schema.exceptionItems.exception_status
            )
            .orderBy(
              schema.exceptionItems.severity,
              schema.exceptionItems.exception_type
            );

          columns = [
            'exception_type',
            'severity',
            'exception_status',
            'count',
            'sla_breached',
            'avg_resolution_hours',
          ];
          rows = data.map((r: any) => [
            r.exception_type,
            r.severity,
            r.exception_status,
            r.count,
            r.sla_breached,
            r.avg_resolution_hours,
          ]);
          break;
        }

        case 'adhoc_fee_register': {
          const conditions: any[] = [
            like(schema.tfpAccruals.idempotency_key, 'ADHOC:%'),
          ];
          if (params.date_from) {
            conditions.push(gte(schema.tfpAccruals.accrual_date, params.date_from));
          }
          if (params.date_to) {
            conditions.push(lte(schema.tfpAccruals.accrual_date, params.date_to));
          }
          if (params.customer_id) {
            conditions.push(eq(schema.tfpAccruals.customer_id, params.customer_id));
          }

          const data = await db
            .select({
              id: schema.tfpAccruals.id,
              customer_id: schema.tfpAccruals.customer_id,
              portfolio_id: schema.tfpAccruals.portfolio_id,
              base_amount: schema.tfpAccruals.base_amount,
              computed_fee: schema.tfpAccruals.computed_fee,
              applied_fee: schema.tfpAccruals.applied_fee,
              currency: schema.tfpAccruals.currency,
              accrual_date: schema.tfpAccruals.accrual_date,
              accrual_status: schema.tfpAccruals.accrual_status,
              idempotency_key: schema.tfpAccruals.idempotency_key,
              fee_plan_code: schema.feePlans.fee_plan_code,
              fee_plan_name: schema.feePlans.fee_plan_name,
            })
            .from(schema.tfpAccruals)
            .leftJoin(
              schema.feePlans,
              eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id)
            )
            .where(and(...conditions))
            .orderBy(desc(schema.tfpAccruals.accrual_date));

          columns = [
            'id',
            'fee_plan_code',
            'fee_plan_name',
            'customer_id',
            'portfolio_id',
            'base_amount',
            'computed_fee',
            'applied_fee',
            'currency',
            'accrual_date',
            'accrual_status',
          ];
          rows = data.map((r: any) => [
            r.id,
            r.fee_plan_code,
            r.fee_plan_name,
            r.customer_id,
            r.portfolio_id,
            r.base_amount,
            r.computed_fee,
            r.applied_fee,
            r.currency,
            r.accrual_date,
            r.accrual_status,
          ]);
          break;
        }

        default:
          return res.status(400).json({
            error: {
              code: 'UNSUPPORTED_REPORT',
              message: `Report type ${report_type} is not implemented`,
            },
          });
      }
    } catch (err: any) {
      console.error(`[fee-reports] Error generating ${report_type}:`, err);
      return res.status(500).json({
        error: {
          code: 'REPORT_GENERATION_ERROR',
          message: err.message ?? 'Failed to generate report',
        },
      });
    }

    res.json({
      data: {
        report_type,
        generated_at: new Date().toISOString(),
        params,
        columns,
        rows,
      },
    });
  }),
);

export default router;
