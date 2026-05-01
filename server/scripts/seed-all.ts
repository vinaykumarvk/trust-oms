#!/usr/bin/env tsx
/**
 * seed-all.ts — TrustOMS Philippines: Consolidated Seed Runner
 *
 * Executes all seed scripts in the correct dependency order:
 *
 *   1. seed-demo-data       — users, clients, securities, portfolios, positions,
 *                              pricing, orders, CRM basics, service requests, etc.
 *   2. seed-reference-data   — countries, currencies, asset classes, branches,
 *                              exchanges, TrustFees Pro reference + operational data
 *   3. seed-entity-registry  — entity registry + field configs for generic CRUD
 *   4. seed-group-a          — system config, notifications, SLA, GL structure,
 *                              questionnaires, risk appetite, model portfolios
 *   5. seed-group-b          — feature demo data: beneficial owners, FATCA/CRS,
 *                              risk profiles, proposals, handovers, delegations, etc.
 *   6. seed-group-c          — remaining operational / transactional tables
 *   7. seed-crm-data         — full CRM: campaigns, leads, prospects, enrichment,
 *                              meeting invitees, call report feedback, tasks, etc.
 *
 * All scripts are idempotent (skip existing data). Safe to run repeatedly.
 *
 * Usage:
 *   npx tsx server/scripts/seed-all.ts
 *   # or
 *   npm run seed
 *
 * Environment:
 *   DATABASE_URL must be set (via .env or explicitly).
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';

// ─── Imports ──────────────────────────────────────────────────────────────────

import { seedDemoData } from './seed-demo-data';
import { seedReferenceData } from './seed-reference-data';
import { seedEntityRegistry } from './seed-entity-registry';
import { seedGroupA } from './seed-group-a';
import { seedGroupB } from './seed-group-b';
import { seedGroupC } from './seed-group-c';
import { seedCrmData } from './seed-crm-data';
import { seedLoanData } from './seed-loan-data';
import { seedEbtData } from './seed-ebt-data';

// ─── Step runner with timing ──────────────────────────────────────────────────

interface SeedStep {
  name: string;
  fn: () => Promise<void>;
}

async function runStep(step: SeedStep, index: number, total: number): Promise<void> {
  const label = `[${index + 1}/${total}] ${step.name}`;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(70)}`);

  const start = Date.now();
  try {
    await step.fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n  [OK] ${step.name} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  [FAIL] ${step.name} failed after ${elapsed}s: ${message}`);
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS Philippines — Full Database Seed                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  Target : ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@') ?? '(not set)'}`);
  console.log(`  Started: ${new Date().toISOString()}`);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Please set it in .env or provide it explicitly.');
  }

  const steps: SeedStep[] = [
    {
      name: 'Demo Data (users, clients, securities, portfolios, orders, CRM basics)',
      fn: seedDemoData,
    },
    {
      name: 'Reference Data (countries, currencies, asset classes, TrustFees Pro)',
      fn: seedReferenceData,
    },
    {
      name: 'Entity Registry (entity definitions + field configs)',
      fn: seedEntityRegistry,
    },
    {
      name: 'Group A (system config, GL structure, questionnaires, risk appetite)',
      fn: seedGroupA,
    },
    {
      name: 'Group B (feature data: risk profiles, proposals, handovers, PERA)',
      fn: seedGroupB,
    },
    {
      name: 'Group C (operational / transactional tables)',
      fn: seedGroupC,
    },
    {
      name: 'CRM Data (campaigns, leads, prospects, tasks, expenses)',
      fn: seedCrmData,
    },
    {
      name: 'Loan Data (corporate trust: facilities, payments, collaterals, MPCs)',
      fn: seedLoanData,
    },
    {
      name: 'EBT Data (plans, members, contributions, gratuity rules, tax rules)',
      fn: seedEbtData,
    },
  ];

  const totalStart = Date.now();
  let completed = 0;

  const failures: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    try {
      await runStep(steps[i], i, steps.length);
      completed++;
    } catch (err) {
      failures.push(steps[i].name);
      console.error(`  ↳ Continuing to next step despite failure...`);
    }
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

  console.log(`\n${'═'.repeat(70)}`);
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   Full seed completed successfully!                                  ║');
  console.log(`║   ${completed}/${steps.length} steps completed in ${totalElapsed}s${' '.repeat(Math.max(0, 39 - totalElapsed.length))}║`);
  console.log('║                                                                      ║');
  console.log('║   Login credentials (password: password123):                         ║');
  console.log('║   admin / bo_head / bo_maker / bo_checker                            ║');
  console.log('║   trust_officer_1 / trust_officer_2 / trust_officer_3                ║');
  console.log('║   rm_1 / rm_2 / rm_3 / compliance_officer / portfolio_mgr            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log(`\n  [WARN] ${failures.length} step(s) had errors:`);
    failures.forEach((f) => console.log(`    - ${f}`));
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[FATAL] Seed-all failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
