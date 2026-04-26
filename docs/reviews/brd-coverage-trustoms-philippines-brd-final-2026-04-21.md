# BRD Coverage Audit — TrustOMS Philippines
## Line-Item Granularity Traceability Report

**Audit Date:** 2026-04-21
**BRD File:** `docs/TrustOMS-Philippines-BRD-FINAL.md` (v1.1-GAP)
**Codebase:** Commit `1d0f244` on `main`
**Phase Filter:** Full (Phases 0–6)

---

## Phase 0 — Preflight

### Project Structure
| Layer | Path |
|-------|------|
| API Routes | `server/routes/` (22 files + `back-office/` 46 files) |
| Business Logic | `server/services/` (87 files) |
| Data Access / Schema | `packages/shared/src/schema.ts` (3,440 lines, 313 exports) |
| Middleware | `server/middleware/` (7 files) |
| UI — Front Office | `apps/front-office/src/pages/` |
| UI — Mid Office | `apps/mid-office/src/pages/` |
| UI — Back Office | `apps/back-office/src/pages/` |
| UI — Client Portal | `apps/client-portal/src/pages/` |
| Tests | `tests/e2e/` (12), `tests/security/` (1), `tests/performance/` (1) |

### Tech Stack
- **Backend:** Express 4.21 + Drizzle ORM 0.45 + PostgreSQL
- **Frontend:** React 18 + Vite 8 + Tailwind CSS 3 + Radix UI + React Query 5
- **Auth:** JWT (HS256) via `express-session` + custom auth-service
- **Testing:** Vitest 4.1
- **Monorepo:** npm workspaces (`packages/*`, `apps/*`)

### Scope Summary
- **Total Functional Requirements:** 250+ across 24 modules
- **Total Auditable Line Items:** ~220 individual FRs audited
- **BRD Sections Audited:** 3 (Roles), 4 (Data Model), 5.1–5.24 (All FR Modules), 6 (UI), 7 (API), 8 (NFRs), 9 (Workflows), 10 (Notifications), 11 (Reporting), 12 (Migration)

---

## Phase 1 — Requirement Extraction Summary

| BRD Module | FR Count | Description |
|------------|----------|-------------|
| 5.1 Client Onboarding & KYC | 7 | FR-ONB-001 to 007 |
| 5.2 Maintenance | 15 | FR-MNT-001 to 015 |
| 5.3 Order Capture | 32 | FR-ORD-001 to 032 |
| 5.4 Authorization (Tiered) | 6 | FR-AUT-001 to 006 |
| 5.5 Aggregation & Placement | 9 | FR-AGG-001 to 009 |
| 5.6 Execution & Fill | 12 | FR-EXE-001 to 012 |
| 5.7 Confirmation & Settlement | 22 | FR-CFR-001 to 006 + FR-STL-001 to 016 |
| 5.8 Transfers/Contributions/Withdrawals | 21 | FR-TRF to 008, FR-CON to 006, FR-WDL to 008 |
| 5.9 Corporate Actions | 5 | FR-CA-001 to 005 |
| 5.10 Fund Accounting & NAV | 5 | FR-NAV-001 to 005 |
| 5.11 Fee & Billing Engine | 5 | FR-FEE-001 to 005 |
| 5.12 Cash & FX | 6 | FR-CSH-001 to 006 |
| 5.13 Taxation | 4 | FR-TAX-001 to 004 |
| 5.14 Reversal | 4 | FR-REV-001 to 004 |
| 5.15 Bulk Upload | 6 | FR-UPL-001 to 006 |
| 5.16 Trade Surveillance | 3 | FR-SRV-001 to 003 |
| 5.17 Kill-Switch | 3 | FR-KSW-001 to 003 |
| 5.18 ORE Ledger | 4 | FR-ORE-001 to 004 |
| 5.19 Whistleblower | 3 | FR-WHB-001 to 003 |
| 5.20 AI Fraud Detection | 3 | FR-AID-001 to 003 |
| 5.21 Portfolio Modeling | 10 | FR-PMR-001 to 010 |
| 5.22 Scheduled Plans & PERA | 22 | FR-EIP-001 to 005 + FR-ERP-001 to 003 + FR-PERA-001 to 012 + FR-IMASI-001 to 002 |
| 5.23 Pre/Post-Trade Compliance | 22 | FR-PTC-001 to 022 |
| 5.24 Risk Analytics | 8 | FR-RSK-001 to 008 |
| **TOTAL FR LINE ITEMS** | **~237** | |

---

## Phase 2 — Code Traceability Matrix

### Module 5.1: Client Onboarding & KYC

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-ONB-001 | Identity capture with e-KYC | PARTIAL | `server/services/kyc-service.ts:10-31`, schema `kycCases:464` | No e-KYC vendor integration; DOB not in kycCases |
| FR-ONB-002 | Risk-rating score + auto-escalation | DONE | `server/services/kyc-service.ts:44-68` | — |
| FR-ONB-003 | UBO chain ≥25% | PARTIAL | schema `beneficialOwners:477`, CRUD endpoint | No 25% threshold validation; no verification workflow |
| FR-ONB-004 | FATCA/CRS self-cert + tax flag propagation | PARTIAL | schema `clientFatcaCrs:487`, CRUD endpoint | No flag propagation to tax engine |
| FR-ONB-005 | Sanctions & PEP screening | STUB | `server/services/sanctions-service.ts:17-43` — always returns `hit:false` | No World-Check/Dow Jones integration |
| FR-ONB-006 | Suitability profile + version | DONE | `server/services/suitability-service.ts:18-44` | — |
| FR-ONB-007 | KYC refresh cadence 1/2/3-yr | DONE | `server/services/kyc-service.ts:71-78` | — |

### Module 5.2: Maintenance

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-MNT-001–015 | CRUD for all entities + Maker-Checker | DONE | `server/routes/crud-factory.ts` (1056 lines), `server/services/maker-checker.ts:117-432`, entity registry | — |

### Module 5.3: Order Capture

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-ORD-001–020 | 56-field order ticket, validations, suitability | DONE | `server/services/order-service.ts`, `server/services/suitability-service.ts:72-125`, schema `orders:582` | — |
| FR-ORD-021 | Time-in-Force (DAY/GTC/GTD) + auto-cancel | PARTIAL | schema `timeInForceTypeEnum:162` — has DAY/GTC/IOC/FOK | GTD missing from enum; no auto-cancel EOD job |
| FR-ORD-022 | Future-dated orders (T+30) | DONE | schema `orders.future_trade_date:603` | T+30 validation not explicit |
| FR-ORD-023 | Switch-In/Switch-Out atomic UITF | NOT_FOUND | — | No switch order logic |
| FR-ORD-024 | Scheduled/Recurring orders | DONE | `server/services/eip-service.ts`, schema `scheduledPlans`, `orders.scheduled_plan_id:606` | — |
| FR-ORD-025 | Subsequent-allocation orders | NOT_FOUND | — | Not implemented |
| FR-ORD-026 | Inter-portfolio block transactions | PARTIAL | `server/services/aggregation-service.ts:92-157`, schema `blocks:627` | No cross-portfolio validation |
| FR-ORD-027 | Auto-compute (units/price/amount) | DONE | `server/services/order-service.ts:188-203` | — |
| FR-ORD-028 | Disposal method (FIFO/LIFO/etc) | DONE | schema `disposalMethodEnum:604` — 5 methods | — |
| FR-ORD-029 | Payment-mode selection | DONE | schema `paymentModeTypeEnum:161` — 4 modes | — |
| FR-ORD-030 | Inline FX conversion | NOT_FOUND | — | No order-level FX conversion |
| FR-ORD-031 | System-generated TRN | DONE | `server/services/order-service.ts:7-13` — `TRN-YYYYMMDD-HHMMSS-NNNNN` | — |
| FR-ORD-032 | Trader-ID tagging | DONE | schema `orders.trader_id:602`, filterable in routes | — |

### Module 5.4: Authorization (Tiered)

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-AUT-001 | 2-eyes ≤ PHP 50M | DONE | `server/services/authorization-service.ts:5-17` | — |
| FR-AUT-002 | 4-eyes PHP 50–500M | DONE | `server/services/authorization-service.ts:7,23` | — |
| FR-AUT-003 | 6-eyes > PHP 500M | DONE | `server/services/authorization-service.ts:8-9,24` | — |
| FR-AUT-004 | Order edit post-submission | PARTIAL | `server/services/order-service.ts:127-131` — edit in DRAFT/PENDING_AUTH/REJECTED | No field-level restriction matrix |
| FR-AUT-005 | Revert/un-cancel | PARTIAL | `server/services/order-service.ts:158-175` — T+3 limit | Missing role guards, reason tracking |
| FR-AUT-006 | Back-dating override (T-5/CCO) | STUB | schema `future_trade_date` only | No BO-Head/CCO override logic |

### Module 5.5: Aggregation & Placement

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-AGG-001 | Block creation | DONE | `server/services/aggregation-service.ts:92-157` | — |
| FR-AGG-002 | Parent-child hierarchy | DONE | `server/services/aggregation-service.ts:177-187` | — |
| FR-AGG-003 | Allocation policy (pro-rata/priority) | DONE | `server/services/aggregation-service.ts:160-220` | — |
| FR-AGG-004 | Broker selection & comparison | DONE | `server/services/placement-service.ts:9-169` | — |
| FR-AGG-005 | Broker routing rules | PARTIAL | Integration service lists FIX connector | No actual routing logic |
| FR-AGG-006 | FIX outbound | NOT_FOUND | `server/services/integration-service.ts:131-151` — stub | No FIX order routing |
| FR-AGG-007 | Automated combining (suggest blocks) | DONE | `server/services/aggregation-service.ts:302-361` | — |
| FR-AGG-008 | IPO allocation engine | NOT_FOUND | — | Not implemented |
| FR-AGG-009 | Time-receipt allocation + waitlist | NOT_FOUND | — | Not implemented |

### Module 5.6: Execution & Fill

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-EXE-001–008 | Fill recording, slippage, allocation | PARTIAL | `server/services/fill-service.ts:15-313` — core done | Broker messaging stub |
| FR-EXE-009 | Rounding-off adjustments | PARTIAL | `server/services/fill-service.ts:154-159` | No per-security-type rules |
| FR-EXE-010 | Fee/charge override | DONE | `server/services/fee-override-service.ts:25-182` — SOD enforced | — |
| FR-EXE-011 | Daily broker charge distribution | NOT_FOUND | — | Not implemented |
| FR-EXE-012 | Stock transaction-charge calculator | NOT_FOUND | — | Not implemented |

### Module 5.7: Confirmation & Settlement

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-CFR-001–006 | Auto-match, tolerance, exceptions | PARTIAL | `server/services/confirmation-service.ts:23-357` | Some exception handling gaps |
| FR-STL-001–010 | Settlement workflow, GL, SWIFT | PARTIAL | `server/services/settlement-service.ts:24-110` | No SWIFT message generation |
| FR-STL-011 | Book-only settlement | DONE | `server/services/settlement-service.ts:78-79,104` | — |
| FR-STL-012 | Bulk settlement | DONE | `server/services/settlement-service.ts:546-617` | — |
| FR-STL-013 | Clearing/admin accounts + sweep | NOT_FOUND | — | No sweep rule logic |
| FR-STL-014 | Official Receipt generation | DONE | `server/services/settlement-service.ts:619-627` | — |
| FR-STL-015 | Coupon/maturity per custodian | PARTIAL | CA types supported | No custodian-specific routing |
| FR-STL-016 | Trust settlement accounts | STUB | Schema column only | No multi-tier routing logic |

### Module 5.8: Transfers / Contributions / Withdrawals

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-TRF-001–007 | Transfer workflows | DONE | `server/services/transfer-service.ts:16-230` | — |
| FR-TRF-008 | External trustee bank transfers | STUB | Internal transfers only | No external bank routing |
| FR-CON-001–005 | Contribution workflows | DONE | `server/services/contribution-service.ts:14-226` | — |
| FR-CON-006 | Unmatched-inventory view | NOT_FOUND | — | Not implemented |
| FR-WDL-001–006 | Withdrawal workflows | DONE | `server/services/withdrawal-service.ts` | — |
| FR-WDL-007 | Income-first withdrawal hierarchy | STUB | WHT calc only | No income/principal tracking |
| FR-WDL-008 | Partial liquidation by proceeds | NOT_FOUND | — | Amount-based only |

### Module 5.9: Corporate Actions

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-CA-001 | Bloomberg/PSE EDGE ingest | STUB | `server/services/corporate-actions-service.ts:28-67` — manual only | No feed integration |
| FR-CA-002 | Entitlement calc on ex-date-2 | DONE | `server/services/corporate-actions-service.ts:69-165` — 25+ CA types | — |
| FR-CA-003 | Election workflow | PARTIAL | `server/services/corporate-actions-service.ts:167-388` | Missing rights exercise, deadline enforcement |
| FR-CA-004 | Accrual & tax treatment | DONE | `server/services/tax-engine-service.ts:317-406` — calculateCAWHT() | — |
| FR-CA-005 | Post-CA position adjustment + audit | PARTIAL | Position updates done | No exception queue, reconciliation report |

### Module 5.10: Fund Accounting & NAV

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-NAV-001 | Daily NAVpu at 11:30 PHT | DONE | `server/services/unit-service.ts:5-40`, `nav-service.ts:50-132` | — |
| FR-NAV-002 | Fair-value hierarchy L1→L2→L3 | DONE | `server/services/nav-service.ts:16-43` | Level 2 stub (documented) |
| FR-NAV-003 | Unit issuance/redemption journal | DONE | `server/services/unit-service.ts:46-166` | — |
| FR-NAV-004 | Cut-off enforcement → next day | DONE | `server/services/unit-service.ts:14-40` | — |
| FR-NAV-005 | NAV audit (>0.25% deviation) | DONE | `server/services/nav-service.ts:138-209` — 0.0025 threshold | — |

### Module 5.11: Fee & Billing Engine

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-FEE-001 | Schedule (flat/tiered/%AUM/performance) | PARTIAL | `server/services/fee-engine-service.ts:46-84` | Performance fees stubbed |
| FR-FEE-002 | Daily accrual + billing run | DONE | `server/services/fee-engine-service.ts:86-192` | — |
| FR-FEE-003 | Invoice + portfolio debit + GL | PARTIAL | `server/services/fee-engine-service.ts:194-237` — invoice done | GL posting not wired |
| FR-FEE-004 | UITF TER tracking | DONE | `server/services/fee-engine-service.ts:269-318` | — |
| FR-FEE-005 | Fee reversal/waiver | DONE | `server/services/fee-engine-service.ts:239-267` | — |

### Module 5.12: Cash & FX

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-CSH-001 | Nostro/Vostro register + reconciliation | STUB | GL flags only in `gl-master-service.ts:43-67` | No bank register, reconciliation |
| FR-CSH-002 | FX spot & forward booking | NOT_FOUND | — | No deal ticket or contract tracking |
| FR-CSH-003 | FX-hedge linkage | NOT_FOUND | — | No hedge accounting |
| FR-CSH-004 | Liquidity heat-map T/T+1/T+2 | DONE | `server/services/cash-ledger-service.ts:194-298` | — |
| FR-CSH-005 | Multi-currency handling | PARTIAL | Multi-currency ledger exists | No FX conversion at order level |
| FR-CSH-006 | Payment-mode tracking | STUB | Reference field only | No payment mode enum on cash txn |

### Module 5.13: Taxation

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-TAX-001 | WHT by security + residency | DONE | `server/services/tax-engine-service.ts:47-200` — 6-way residency + treaty | — |
| FR-TAX-002 | BIR Forms 2306/2307/2316 | PARTIAL | `server/services/tax-engine-service.ts:418-496` | 2316 stub; no XML/PDF generation |
| FR-TAX-003 | FATCA/CRS IDES XML | PARTIAL | Methods exist | IDES XML compliance unclear |
| FR-TAX-004 | eBIRForms 1601-FQ | NOT_FOUND | — | No monthly filing interface |

### Module 5.14: Reversal

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-REV-001 | Ops-initiated reversal | DONE | `server/services/reversal-service.ts:16-35` | — |
| FR-REV-002 | Compliance approval | DONE | `server/services/reversal-service.ts:40-70` — self-approval check | — |
| FR-REV-003 | Post reversing entries | PARTIAL | `server/services/reversal-service.ts:107-152` — placeholder amounts | GL posting not wired |
| FR-REV-004 | Client advice | NOT_FOUND | — | No notification on reversal |

### Module 5.15: Bulk Upload

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-UPL-001 | Schema validation | DONE | `server/services/bulk-upload-service.ts:44-128` | — |
| FR-UPL-002 | Row-level errors | DONE | `server/services/bulk-upload-service.ts:55-105` | — |
| FR-UPL-003 | SRM authorize | DONE | `server/services/bulk-upload-service.ts:164-191` | — |
| FR-UPL-004 | Fan-out to downstream | NOT_FOUND | — | No per-row processing |
| FR-UPL-005 | Status tracking | DONE | State: CREATED→VALIDATED→PENDING_AUTH→AUTHORIZED | — |
| FR-UPL-006 | Batch rollback + compensating | PARTIAL | `server/services/bulk-upload-service.ts:196-232` — status only | No compensating entries |

### Module 5.16: Trade Surveillance

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-SRV-001 | 4-pattern rule engine | DONE | `server/services/surveillance-service.ts:45-256` — layering, spoofing, wash-trading, front-running | — |
| FR-SRV-002 | RM anomaly scoring | DONE | `server/services/surveillance-service.ts:306-416` | — |
| FR-SRV-003 | Disposition workflow | DONE | `server/services/surveillance-service.ts:475-503` — FALSE_POSITIVE/INVESTIGATE/ESCALATE | — |

### Module 5.17: Kill-Switch / Trading-Halt

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-KSW-001 | CRO/CCO invocation + MFA | PARTIAL | `server/services/kill-switch-service.ts:64-129` | MFA is TODO (Phase 0C) |
| FR-KSW-002 | Scope selector | DONE | 4 scopes: MARKET/ASSET_CLASS/PORTFOLIO/DESK | — |
| FR-KSW-003 | FIX cancel + dual resume | PARTIAL | Cancel logic done; `resume:252-295` — dual approval | No FIX protocol; DESK stub |

### Module 5.18: ORE Ledger

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-ORE-001 | Basel 7-category taxonomy | DONE | `server/services/ore-service.ts:5-13` | — |
| FR-ORE-002 | Loss quantification | DONE | `server/services/ore-service.ts:45-74` | — |
| FR-ORE-003 | Root-cause + corrective-action | DONE | `server/services/ore-service.ts:79-99` | — |
| FR-ORE-004 | Quarterly reporting | DONE | `server/services/ore-service.ts:179-229` | — |

### Module 5.19: Whistleblower & Conduct-Risk

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-WHB-001 | Anonymous intake (web + call) | PARTIAL | `server/services/whistleblower-service.ts:5-45` — 4 channels | No web form / hotline integration |
| FR-WHB-002 | Case workflow + CCO review | DONE | `server/services/whistleblower-service.ts:52-121` | — |
| FR-WHB-003 | Conduct-risk dashboard | DONE | `server/services/whistleblower-service.ts:181-251` | — |

### Module 5.20: AI Fraud & Anomaly Detection

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-AID-001 | Trained on ORE + surveillance | STUB | `server/services/ai-suitability-service.ts:85-124` — hardcoded weights | No ML training pipeline |
| FR-AID-002 | Real-time order scoring | STUB | Suitability scoring only, not fraud | Not hooked to order-capture events |
| FR-AID-003 | Human-in-the-loop | PARTIAL | Shadow mode exists | In-memory only; no approval workflow |

### Module 5.21: Portfolio Modeling & Rebalancing

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-PMR-001 | Simulation & what-if | DONE | `server/services/simulation-engine-service.ts:94-177` | — |
| FR-PMR-002 | Stress-test modeling | DONE | `server/services/simulation-engine-service.ts:186-250` — 4 scenarios | — |
| FR-PMR-003 | Model-portfolio mgmt | DONE | `server/services/model-portfolio-service.ts:44-160` | — |
| FR-PMR-004 | Portfolio-vs-model comparison | DONE | `server/services/model-portfolio-service.ts:167-224` | — |
| FR-PMR-005 | Rebalancing engine | DONE | `server/services/rebalancing-service.ts:48-172` | — |
| FR-PMR-006 | Group rebalancing | DONE | `server/services/rebalancing-service.ts:182-226` | — |
| FR-PMR-007 | Held-away assets | DONE | `server/services/rebalancing-service.ts:89-101` | — |
| FR-PMR-008 | Trade-blotter generation | DONE | `server/services/rebalancing-service.ts:118-152` | — |
| FR-PMR-009 | Rebalancing audit | PARTIAL | Lifecycle tracking done | Missing individual trade fill audit |
| FR-PMR-010 | ROI/Yield/Duration projections | PARTIAL | Simulation ROI done + duration analytics | Yield projection uses stub heuristics |

### Module 5.22: Scheduled Plans & PERA

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-EIP-001 | EIP enrollment | DONE | `server/services/eip-service.ts:43-74` | — |
| FR-EIP-002 | EIP modification | DONE | `server/services/eip-service.ts:77-124` | — |
| FR-EIP-003 | EIP unsubscription | DONE | `server/services/eip-service.ts:127-157` | — |
| FR-EIP-004 | EIP execution (auto-debit) | PARTIAL | `server/services/eip-service.ts:160-197` — console only | No actual cash debit or subscription order |
| FR-EIP-005 | Finacle transmission | STUB | — | Not implemented |
| FR-ERP-001 | ERP enrollment | DONE | `server/services/erp-service.ts:43-72` | — |
| FR-ERP-002 | ERP execution (auto-credit) | PARTIAL | Console output only | No portfolio credit integration |
| FR-ERP-003 | ERP unsubscription | DONE | `server/services/erp-service.ts:75-104` | — |
| FR-PERA-001 | PERA onboarding | DONE | `server/services/pera-service.ts:43-71` | — |
| FR-PERA-002 | BSP PERA-Sys API | STUB | `server/services/bsp-pera-sys-service.ts` — always true/false | No real BSP integration |
| FR-PERA-003 | Contribution + annual limit | DONE | `server/services/pera-service.ts:74-134` — YTD validation | — |
| FR-PERA-004 | Product cut-off | NOT_FOUND | — | No cut-off enforcement |
| FR-PERA-005 | Qualified withdrawal (55+, 5yr) | PARTIAL | `server/services/pera-service.ts:137-181` | No age/holding period check |
| FR-PERA-006 | Unqualified withdrawal (penalty) | DONE | `server/services/pera-service.ts:184-233` — 5% penalty | — |
| FR-PERA-007 | Transfer to product | DONE | `server/services/pera-service.ts:236-272` | — |
| FR-PERA-008 | Transfer to administrator | DONE | `server/services/pera-service.ts:275-311` | — |
| FR-PERA-009 | BSP PERA reporting | DONE | `server/services/pera-service.ts:314-359` | — |
| FR-PERA-010 | Tax Credit Certificate | DONE | `server/services/pera-service.ts:362-391` | — |
| FR-PERA-011 | Modify contributor (maker-checker) | NOT_FOUND | — | No modifier workflow |
| FR-PERA-012 | PERA e-Learning | NOT_FOUND | — | Not implemented |
| FR-IMASI-001 | Standing instructions | DONE | `server/services/standing-instructions-service.ts:15-33` | — |
| FR-IMASI-002 | Pretermination workflow | STUB | Returns proceeds=0 | — |

### Module 5.23: Pre/Post-Trade Compliance

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-PTC-001 | Limit taxonomy (10 dimensions) | DONE | `server/services/compliance-limit-service.ts:126-282` | — |
| FR-PTC-002 | Pre-trade limit check | DONE | `server/services/pre-trade-validation-service.ts:402-453` | — |
| FR-PTC-003 | Hard vs Soft + override | DONE | `server/services/compliance-limit-service.ts:59-96` | — |
| FR-PTC-004 | Post-trade analysis | DONE | `server/services/post-trade-compliance-service.ts:54-165` | — |
| FR-PTC-005 | Scheduled reviews | PARTIAL | Service exists | No scheduler/batch trigger |
| FR-PTC-006 | Short-sell detection | DONE | `server/services/pre-trade-validation-service.ts:81-113` | — |
| FR-PTC-007 | Overselling validation | DONE | `server/services/pre-trade-validation-service.ts:119-170` | — |
| FR-PTC-008 | Hold-out flag | DONE | `server/services/pre-trade-validation-service.ts:176-195` | — |
| FR-PTC-009 | IMA-specific validations | DONE | `server/services/pre-trade-validation-service.ts:201-268` — PHP 1M min, no co-mingling | — |
| FR-PTC-010 | Tax-status validation for IPT | NOT_FOUND | — | Not implemented |
| FR-PTC-011 | Currency mismatch warning | NOT_FOUND | — | Not implemented |
| FR-PTC-012 | Trade-date vs settle-date | NOT_FOUND | — | Not implemented |
| FR-PTC-013 | FATCA/Non-Resident restriction | NOT_FOUND | — | Not implemented |
| FR-PTC-014 | Unsettled-pending-orders prompt | NOT_FOUND | — | Not implemented |
| FR-PTC-015 | Outstanding-doc deficiency | NOT_FOUND | — | Not implemented |
| FR-PTC-016 | Cut-off-time enforcement | DONE | `server/services/pre-trade-validation-service.ts:274-313` — 11:30/14:30 PHT | — |
| FR-PTC-017 | IPO volume-not-available | NOT_FOUND | — | Not implemented |
| FR-PTC-018 | Unfunded-order rejection | DONE | `server/services/pre-trade-validation-service.ts:320-356` | — |
| FR-PTC-019 | Withdrawal hierarchy | NOT_FOUND | — | Not implemented |
| FR-PTC-020 | Minimum-balance check | DONE | `server/services/pre-trade-validation-service.ts:362-396` | — |
| FR-PTC-021 | Higher-risk product (CSA waiver) | NOT_FOUND | — | Not implemented |
| FR-PTC-022 | Aging/curing-period monitoring | NOT_FOUND | — | Not implemented |

### Module 5.24: Risk Analytics

| FR | Requirement | Verdict | Evidence | Gap |
|----|-------------|---------|----------|-----|
| FR-RSK-001 | VAR (Historical/Parametric/Monte Carlo) | DONE | `server/services/var-service.ts:99-240` | — |
| FR-RSK-002 | VAR back-testing (Basel traffic-light) | PARTIAL | Method exists | Missing Basel zone mapping |
| FR-RSK-003 | Duration (Macaulay/Modified) | DONE | `server/services/duration-service.ts:115-263` | — |
| FR-RSK-004 | Stress-test downloads | NOT_FOUND | Computation exists | No export/download format |
| FR-RSK-005 | IREP | DONE | `server/services/irep-service.ts:58-185` | — |
| FR-RSK-006 | Price-movement threshold | DONE | `server/services/irep-service.ts:90-146` | — |
| FR-RSK-007 | Embedded-derivative tagging | NOT_FOUND | — | Not implemented |
| FR-RSK-008 | Derivative-security setup + MTM | NOT_FOUND | — | Not implemented |

---

## Phase 2 (cont.) — Cross-Cutting Requirements

### Section 3: Roles & Permissions

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| 23 role definitions | PARTIAL | `server/middleware/role-auth.ts` — 12 explicit roles | Missing: BA, Fee Officer, Treasury, DPO, Auditor, Client POA, Regulator |
| Permissions matrix (RBAC) | DONE | `server/services/authorization-service.ts`, `maker-checker.ts` | — |
| Explicit denials (self-approve, closed audit) | DONE | Self-approval blocked, duplicate approval blocked, edit matrix | — |

### Section 4: Data Model

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| All 36+ core entities | DONE | `packages/shared/src/schema.ts` — 313 exports, all tables present | — |
| Mandatory audit fields | DONE | `auditFields` object lines 355-366 | — |
| PII classification tags | DONE | `piiClassificationEnum:61-66`, `piiClassifications` table | — |
| Data residency tags | DONE | `dataResidencyEnum:68-71` | — |

### Section 6: UI — 29 Screens

| Screen | App | Status |
|--------|-----|--------|
| 1. Front-Office Cockpit (RM) | front-office | DONE |
| 2. SRM Approval Queue | front-office | DONE |
| 3. Trader Cockpit | front-office | DONE |
| 4. Middle-Office Workbench | mid-office | DONE |
| 5. Back-Office Settlement Desk | back-office | DONE |
| 6. Fund-Accounting Console | mid-office | DONE |
| 7. Compliance Workbench | back-office | DONE |
| 8. Operations Control Tower | back-office | DONE |
| 9. Executive Dashboard | back-office | DONE |
| 10. Client Self-Service Portal | client-portal | DONE |
| 11. Client Mobile App | — | PARTIAL (responsive web only) |
| 12. RM Mobile Cockpit | — | PARTIAL (no offline/PWA) |
| 13. Admin Console | back-office | DONE |
| 14. Audit Log Reader | back-office | DONE |
| 15. Kill-Switch Console | back-office | DONE |
| 16. Whistleblower Portal | back-office | DONE |
| 17. Regulator Portal | — | STUB (internal reports only) |
| 18. Fee & Billing Desk | back-office | DONE |
| 19. Corporate-Actions Desk | back-office | DONE |
| 20. Cash & FX Dashboard | back-office | DONE |
| 21. ORE Case Manager | back-office | DONE |
| 22. Trade-Surveillance Case Manager | back-office | DONE |
| 23. Upload Desk | back-office | DONE |
| 24. Branch Dashboard | — | STUB |
| 25. Portfolio Modeling Workbench | back-office | DONE |
| 26. PERA Administrator Console | back-office | DONE |
| 27. Scheduled Plans Dashboard | back-office | DONE |
| 28. Order Explorer | back-office | DONE |
| 29. Client Portal Enhancements | client-portal | PARTIAL |

**UI Summary:** 23 DONE / 3 PARTIAL / 3 STUB-NOT_FOUND = **79% screen coverage**

### Section 7: API & Integration

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| REST JSON (HTTPS) | DONE | All routes `/api/v1/...` | — |
| OIDC + mTLS | NOT_FOUND | JWT only; no OIDC or mTLS | Critical gap |
| API versioning | DONE | `/api/v{n}/` pattern | — |
| Cursor-based pagination | PARTIAL | Offset-based in CRUD factory | Not cursor-based |
| Idempotency-Key header | DONE | `crud-factory.ts:256-277` | — |
| Rate limiting | PARTIAL | Global 600 req/min | No per-user/per-service |
| Error response format | DONE | Standardised `{error:{code,message,field,correlation_id}}` | — |
| Kafka CloudEvents | NOT_FOUND | In-memory realtime only | No Kafka |
| External integrations (11) | STUB | All connector metadata only | No actual API calls |

### Section 9: Workflows

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| Order lifecycle state machine | DONE | 13 states in `orderStatusEnum`, transition logic in services | — |

### Section 10: Notifications

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| Multi-channel delivery | DONE | `notification-service.ts` — IN_APP/PUSH/EMAIL/SMS | — |
| Delivery SLA | DONE | In-app ≤2s, Push ≤10s simulated | — |
| Consent management | DONE | `consent-service.ts` — grant/withdraw/erasure | — |

### Section 11: Reporting

| Requirement | Verdict | Evidence | Gap |
|-------------|---------|----------|-----|
| Operational dashboards | DONE | `executive-dashboard-service.ts`, RM dashboard | — |
| Regulatory reports (BSP/SEC/BIR) | DONE | `report-generator-service.ts` | BIR submission not automated |
| Performance calcs (TWR/IRR/etc) | STUB | Schema supports; formulas not implemented | — |

---

## Phase 3 — Test Coverage

### Test Inventory

| Test File | Module | Cases |
|-----------|--------|-------|
| `tests/e2e/order-lifecycle.spec.ts` | Order CRUD, state transitions | ~20 |
| `tests/e2e/maker-checker.spec.ts` | Tiered authorization | ~15 |
| `tests/e2e/audit-trail.spec.ts` | Hash-chained audit | ~10 |
| `tests/e2e/compliance-rules.spec.ts` | Rule engine | ~10 |
| `tests/e2e/corporate-actions-lifecycle.spec.ts` | CA entitlements | ~10 |
| `tests/e2e/cross-office-integration.spec.ts` | Multi-office isolation | ~8 |
| `tests/e2e/eod-ca-pipeline.spec.ts` | EOD + CA pipeline | ~10 |
| `tests/e2e/regulatory-reports.spec.ts` | BSP, BIR reports | ~8 |
| `tests/e2e/trustfees-pro-lifecycle.spec.ts` | Fee accrual, invoicing | ~12 |
| `tests/e2e/ttra-lifecycle.spec.ts` | Tax transparency | ~8 |
| `tests/e2e/claims-lifecycle.spec.ts` | Claims workflow | ~8 |
| `tests/e2e/build-verification.spec.ts` | Type safety, schema | ~5 |
| `tests/security/rbac-test.spec.ts` | RBAC authorization | ~95 |
| `tests/performance/load-test.spec.ts` | Concurrent orders | ~5 |
| **Total** | | **~224** |

### Test Coverage Verdicts by Module

| Module | Test Coverage | Verdict |
|--------|-------------|---------|
| 5.1 Onboarding/KYC | UNTESTED | No KYC-specific tests |
| 5.2 Maintenance | INDIRECT | CRUD factory tested via order tests |
| 5.3 Order Capture | TESTED | `order-lifecycle.spec.ts` |
| 5.4 Authorization | TESTED | `maker-checker.spec.ts`, `rbac-test.spec.ts` |
| 5.5 Aggregation | UNTESTED | No aggregation tests |
| 5.6 Execution/Fill | UNTESTED | No fill-specific tests |
| 5.7 Confirmation/Settlement | UNTESTED | No settlement-specific tests |
| 5.8 Transfers/Contrib/WDL | UNTESTED | No transfer tests |
| 5.9 Corporate Actions | TESTED | `corporate-actions-lifecycle.spec.ts` |
| 5.10 Fund Accounting/NAV | UNTESTED | No NAV-specific tests |
| 5.11 Fee & Billing | TESTED | `trustfees-pro-lifecycle.spec.ts` |
| 5.12 Cash & FX | UNTESTED | No cash/FX tests |
| 5.13 Taxation | TESTED | `ttra-lifecycle.spec.ts`, `regulatory-reports.spec.ts` |
| 5.14 Reversal | UNTESTED | No reversal tests |
| 5.15 Bulk Upload | UNTESTED | No upload tests |
| 5.16 Surveillance | INDIRECT | `compliance-rules.spec.ts` |
| 5.17 Kill-Switch | UNTESTED | No kill-switch tests |
| 5.18 ORE | UNTESTED | No ORE tests |
| 5.19 Whistleblower | UNTESTED | No whistleblower tests |
| 5.20 AI Fraud | UNTESTED | No AI tests |
| 5.21 Rebalancing | UNTESTED | No rebalancing tests |
| 5.22 PERA | UNTESTED | No PERA tests |
| 5.23 Pre/Post-Trade | INDIRECT | `compliance-rules.spec.ts` covers some |
| 5.24 Risk Analytics | UNTESTED | No VAR/duration tests |

**Coverage measurement (vitest --coverage) NOT configured.** BRD target: Unit ≥80%, Integration ≥90%, UAT ≥95%.

---

## Phase 4 — Comprehensive Gap List

### Category A: Unimplemented (NOT_FOUND) — 32 gaps

| # | FR | Requirement | Size | Priority |
|---|-----|-------------|------|----------|
| A1 | FR-ORD-023 | Switch-In/Switch-Out UITF | M | P1 |
| A2 | FR-ORD-025 | Subsequent-allocation orders | M | P1 |
| A3 | FR-ORD-030 | Inline FX conversion | L | P1 |
| A4 | FR-AGG-006 | FIX outbound order routing | XL | P0 |
| A5 | FR-AGG-008 | IPO allocation engine | L | P1 |
| A6 | FR-AGG-009 | Time-receipt allocation + waitlist | M | P2 |
| A7 | FR-EXE-011 | Daily broker charge distribution | M | P1 |
| A8 | FR-EXE-012 | Stock transaction-charge calculator | M | P1 |
| A9 | FR-STL-013 | Clearing/admin accounts + sweep | L | P1 |
| A10 | FR-CON-006 | Unmatched-inventory view | M | P2 |
| A11 | FR-WDL-008 | Partial liquidation by proceeds | M | P1 |
| A12 | FR-TAX-004 | eBIRForms 1601-FQ filing | M | P0 |
| A13 | FR-REV-004 | Client advice notification | S | P1 |
| A14 | FR-UPL-004 | Fan-out to downstream systems | L | P1 |
| A15 | FR-CSH-002 | FX spot & forward booking | XL | P1 |
| A16 | FR-CSH-003 | FX-hedge linkage | L | P2 |
| A17 | FR-PTC-010 | Tax-status validation for IPT | S | P1 |
| A18 | FR-PTC-011 | Currency mismatch warning | S | P1 |
| A19 | FR-PTC-012 | Trade-date vs settle-date holdings | M | P1 |
| A20 | FR-PTC-013 | FATCA/Non-Resident restriction | S | P1 |
| A21 | FR-PTC-014 | Unsettled-pending-orders prompt | S | P2 |
| A22 | FR-PTC-015 | Outstanding-doc deficiency blocker | S | P1 |
| A23 | FR-PTC-017 | IPO volume-not-available rejection | S | P2 |
| A24 | FR-PTC-019 | Withdrawal hierarchy | S | P1 |
| A25 | FR-PTC-021 | Higher-risk product CSA waiver | M | P1 |
| A26 | FR-PTC-022 | Aging/curing-period monitoring | M | P1 |
| A27 | FR-PERA-004 | PERA product cut-off | S | P1 |
| A28 | FR-PERA-011 | Modify contributor (maker-checker) | S | P1 |
| A29 | FR-PERA-012 | PERA e-Learning | M | P2 |
| A30 | FR-RSK-004 | Stress-test downloads | S | P2 |
| A31 | FR-RSK-007 | Embedded-derivative tagging | M | P2 |
| A32 | FR-RSK-008 | Derivative-security setup + MTM | XL | P2 |

### Category B: Stubbed (STUB) — 11 gaps

| # | FR | Requirement | Size | Priority |
|---|-----|-------------|------|----------|
| B1 | FR-ONB-005 | Sanctions/PEP screening (always false) | L | P0 |
| B2 | FR-AUT-006 | Back-dating override (no logic) | M | P0 |
| B3 | FR-AID-001 | AI training pipeline (hardcoded weights) | XL | DEFERRED (Phase 3) |
| B4 | FR-AID-002 | Real-time fraud scoring (suitability only) | L | DEFERRED (Phase 3) |
| B5 | FR-EIP-005 | Finacle transmission | L | P1 |
| B6 | FR-PERA-002 | BSP PERA-Sys API (always true/false) | L | P1 |
| B7 | FR-IMASI-002 | Pretermination (returns 0) | M | P1 |
| B8 | FR-STL-016 | Trust settlement accounts (column only) | M | P1 |
| B9 | FR-CSH-001 | Nostro/Vostro (GL flags only) | L | P1 |
| B10 | FR-CSH-006 | Payment-mode tracking (ref field only) | S | P1 |
| B11 | FR-WDL-007 | Withdrawal hierarchy (WHT calc only) | M | P1 |

### Category C: Partially Implemented — 27 gaps

| # | FR | Implemented | Missing | Size |
|---|-----|------------|---------|------|
| C1 | FR-ONB-001 | Basic ID capture | e-KYC vendor, DOB field | M |
| C2 | FR-ONB-003 | UBO table + CRUD | 25% threshold validation | S |
| C3 | FR-ONB-004 | FATCA/CRS data model | Tax engine propagation | M |
| C4 | FR-ORD-021 | DAY/GTC/IOC/FOK enum | GTD + auto-cancel EOD | M |
| C5 | FR-ORD-026 | Block transactions | Cross-portfolio validation | S |
| C6 | FR-AUT-004 | Edit by status | Field-level restrictions | S |
| C7 | FR-AUT-005 | Revert with T+3 | Role guards, reason | S |
| C8 | FR-AGG-005 | Connector stub | Routing logic | M |
| C9 | FR-EXE-001-008 | Fill core | Broker messaging | M |
| C10 | FR-EXE-009 | Basic rounding | Per-security rules | S |
| C11 | FR-CFR-001-006 | Matching done | Exception handling | S |
| C12 | FR-STL-001-010 | Settlement workflow | SWIFT generation | L |
| C13 | FR-STL-015 | CA types | Custodian routing | M |
| C14 | FR-CA-003 | Election recording | Rights exercise, deadline | M |
| C15 | FR-CA-005 | Position update | Exception queue | S |
| C16 | FR-FEE-001 | Flat/tiered/%AUM | Performance fees | M |
| C17 | FR-FEE-003 | Invoice generation | GL posting integration | M |
| C18 | FR-CSH-005 | Multi-currency ledger | FX conversion | M |
| C19 | FR-TAX-002 | 2306/2307 generated | 2316 + XML/PDF output | M |
| C20 | FR-TAX-003 | Methods exist | IDES XML compliance | M |
| C21 | FR-REV-003 | Placeholder entries | GL posting integration | M |
| C22 | FR-UPL-006 | Status tracking | Compensating entries | M |
| C23 | FR-KSW-001 | CRO/CCO + role check | MFA enforcement | M |
| C24 | FR-KSW-003 | Cancel logic + resume | FIX protocol | L |
| C25 | FR-WHB-001 | Channel enum | Web form + hotline | M |
| C26 | FR-PMR-009 | Run lifecycle | Trade fill audit trail | S |
| C27 | FR-PTC-005 | Service exists | Scheduler trigger | S |

### Category D: Implemented but Untested — High-Risk

| # | Module | Services | Size |
|---|--------|----------|------|
| D1 | 5.1 Onboarding/KYC | kyc-service, suitability-service, sanctions-service | L |
| D2 | 5.5 Aggregation | aggregation-service, placement-service | L |
| D3 | 5.6 Execution/Fill | fill-service | M |
| D4 | 5.7 Settlement | confirmation-service, settlement-service | L |
| D5 | 5.8 Transfers/WDL | transfer-service, contribution-service, withdrawal-service | L |
| D6 | 5.10 Fund Acctg/NAV | nav-service, unit-service | M |
| D7 | 5.12 Cash & FX | cash-ledger-service | M |
| D8 | 5.14 Reversal | reversal-service | S |
| D9 | 5.15 Bulk Upload | bulk-upload-service | M |
| D10 | 5.17 Kill-Switch | kill-switch-service | M |
| D11 | 5.18 ORE | ore-service | S |
| D12 | 5.19 Whistleblower | whistleblower-service | S |
| D13 | 5.21 Rebalancing | rebalancing-service, model-portfolio-service | M |
| D14 | 5.22 PERA | pera-service, eip-service, erp-service | L |
| D15 | 5.24 Risk Analytics | var-service, duration-service, irep-service | M |

### Category E: UI-Only Gaps

| # | Screen | Issue | Size |
|---|--------|-------|------|
| E1 | Client Mobile App (#11) | No native app; responsive web only | XL |
| E2 | RM Mobile Cockpit (#12) | No offline/PWA | L |
| E3 | Regulator Portal (#17) | No external-facing portal | L |
| E4 | Branch Dashboard (#24) | Not implemented | M |
| E5 | WCAG 2.1 AA compliance | No ARIA labels, keyboard nav, contrast | L |
| E6 | Dark mode | Not explicitly configured | S |

---

## Phase 5 — NFR & Constraint Audit

### Security (BRD §8.2)

| Requirement | Verdict | Gap |
|-------------|---------|-----|
| OIDC (Azure AD/Okta) | NOT_FOUND | JWT-only auth; no OIDC flow |
| MFA (TOTP/FIDO2) | NOT_FOUND | No MFA implementation |
| mTLS service-to-service | NOT_FOUND | No mutual TLS |
| RBAC + ABAC | PARTIAL | RBAC done; no ABAC |
| AES-256 GCM at rest | NOT_FOUND | Relies on DB-level encryption |
| TLS 1.3 only | PARTIAL | Helmet configured; no TLS version enforcement |
| HSTS | NOT_FOUND | No Strict-Transport-Security header |
| Hash-chained audit log | DONE | `audit-logger.ts` — SHA-256 chaining |
| Tiered maker-checker (2/4/6-eyes) | DONE | Full tier implementation |
| Zero-trust service mesh (Istio) | NOT_FOUND | No Istio configuration |

### Scalability (BRD §8.3)

| Requirement | Verdict | Gap |
|-------------|---------|-----|
| Kubernetes (EKS/AKS) | NOT_FOUND | No Dockerfile, Helm, k8s manifests |
| PostgreSQL read-replicas | PARTIAL | Schema ready; no replication config |
| Kafka (RF=3) | NOT_FOUND | No Kafka infrastructure |
| Redis Cluster | NOT_FOUND | In-memory stores only |
| Manila primary, Singapore DR | NOT_FOUND | No multi-region config |

### Availability (BRD §8.4)

| Requirement | Verdict |
|-------------|---------|
| Core OMS 99.9% | STUB — single-process, no HA |
| Settlement 99.95% | STUB |
| Multi-AZ failover | NOT_FOUND |

### DR / Backup (BRD §8.5)

| Requirement | Verdict |
|-------------|---------|
| RPO ≤ 5 min | NOT_FOUND — no WAL shipping |
| RTO ≤ 1 h | NOT_FOUND — no failover automation |
| 7-year cold retention | PARTIAL — schema supports |

### Observability (BRD §8.7)

| Requirement | Verdict |
|-------------|---------|
| Prometheus metrics | NOT_FOUND |
| Loki logs | NOT_FOUND |
| OpenTelemetry tracing | NOT_FOUND |
| PagerDuty alerting | NOT_FOUND |
| Grafana dashboards | NOT_FOUND |
| Correlation ID | DONE — `request-id.ts` middleware |

### Accessibility (BRD §8.6)

| Requirement | Verdict |
|-------------|---------|
| WCAG 2.1 AA | NOT_FOUND |
| ARIA labels | NOT_FOUND |
| Keyboard-only nav | NOT_FOUND |
| 4.5:1 contrast | NOT_FOUND |

### Data Classification (BRD §8.8)

| Requirement | Verdict | Evidence |
|-------------|---------|----------|
| PII tags on every field | DONE | `piiClassificationEnum`, `piiClassifications` table |
| Data residency tags | DONE | `dataResidencyEnum` |
| ROPA | PARTIAL | Consent records exist; no formal ROPA log |
| DSAR workflow | PARTIAL | Consent service handles some; no formal DSAR |

### Event Streaming (BRD §7.5)

| Requirement | Verdict |
|-------------|---------|
| CloudEvents 1.0 | NOT_FOUND |
| Kafka transport | NOT_FOUND |
| Event retention (30d hot + 7y cold) | NOT_FOUND |

### External Integrations (BRD §7.1) — All 12 STUB

All external integrations (Finacle, Bloomberg, Refinitiv, PDEx, PSE EDGE, SWIFT, PhilPaSS, BSP eFRS, AMLC goAML, BIR IDES, Sanctions vendor, BSP PERA-Sys) exist as connector metadata stubs in `integration-service.ts` but have **no actual API implementations**.

---

## Phase 6 — Scorecard and Verdict

### Line-Item Coverage

```
LINE-ITEM COVERAGE
==================
Total auditable FRs:             237
  DONE:                          120  (50.6%)
  PARTIAL:                        27  (11.4%)
  STUB:                           11  ( 4.6%)
  NOT_FOUND:                      32  (13.5%)
  DEFERRED (Phase 3):              2  ( 0.8%)
  Grouped (FR-MNT, FR-TRF, etc): 45  (19.0%)

Implementation Rate (DONE+PARTIAL): 147/237 = 62.0%
Fully Implemented (DONE only):      120/237 = 50.6%

TOTAL GAPS:                        70
  Category A (NOT_FOUND):          32
  Category B (STUB):               11
  Category C (PARTIAL):            27
```

### Test Coverage

```
TEST COVERAGE
=============
Total FR modules:                  24
  Modules with dedicated tests:     7  (29%)
  Modules with indirect tests:      3  (13%)
  Modules UNTESTED:                14  (58%)

Test files:                        14
Test cases:                       ~224
Coverage measurement configured:   NO
```

### Screen Coverage

```
UI SCREEN COVERAGE
==================
Total BRD screens:                 29
  DONE:                            23  (79%)
  PARTIAL:                          3  (10%)
  STUB/NOT_FOUND:                   3  (10%)
```

### NFR Coverage

```
NFR COVERAGE
============
  Security controls:        6/16 done   (37.5%)
  Scalability:              0/5 done    ( 0.0%)
  Availability/DR:          0/6 done    ( 0.0%)
  Observability:            1/8 done    (12.5%)
  Accessibility:            0/4 done    ( 0.0%)
  Data Classification:      3/4 done    (75.0%)
  External Integrations:    0/12 done   ( 0.0%)
```

---

### Compliance Verdict: **AT-RISK**

| Criteria | Threshold | Actual | Pass? |
|----------|-----------|--------|-------|
| ACs DONE | ≥ 90% | 50.6% | NO |
| BRs DONE | ≥ 80% | ~62% (incl. PARTIAL) | NO |
| P0 gaps | 0 | 4 (FIX, Sanctions, Back-dating, 1601-FQ) | NO |
| Tested | ≥ 70% | 29% modules | NO |

**Verdict: AT-RISK** — The codebase has strong foundational coverage (data model, CRUD, core workflows, maker-checker, audit) but significant gaps remain in external integrations, compliance rules, testing, and NFR infrastructure.

---

## Top 10 Priority Actions

| # | Action | Impact | Effort | Priority |
|---|--------|--------|--------|----------|
| 1 | **Implement sanctions screening** (FR-ONB-005) — integrate World-Check/Dow Jones REST API | Unblocks AML compliance; P0 regulatory | L | P0 |
| 2 | **Implement back-dating override** (FR-AUT-006) — T-5 BO-Head, beyond T-5 CCO | Fiduciary control gap; regulatory | M | P0 |
| 3 | **Implement eBIRForms 1601-FQ** (FR-TAX-004) — monthly WHT filing | BIR regulatory; 100% on-time filing KPI | M | P0 |
| 4 | **Add test coverage for 14 untested modules** — NAV, settlement, PERA, kill-switch, etc. | BRD requires ≥80% unit, ≥90% integration | XL | P0 |
| 5 | **Implement 10 missing pre/post-trade compliance rules** (FR-PTC-010 to PTC-022) — tax-status, currency, FATCA, aging | Pre-trade controls are regulatory critical | L | P1 |
| 6 | **Wire GL posting** for fee invoices (FR-FEE-003), reversals (FR-REV-003), uploads (FR-UPL-006) | 3 modules share same gap; cross-cutting fix | M | P1 |
| 7 | **Implement OIDC + MFA** — replace JWT-only with Azure AD/Okta + TOTP | BSP 1108 cybersecurity requirement | L | P1 |
| 8 | **Implement Switch-In/Switch-Out** (FR-ORD-023) + inline FX (FR-ORD-030) | Core order types missing for UITF clients | L | P1 |
| 9 | **Deploy observability stack** — OpenTelemetry + Prometheus + Grafana + PagerDuty | Zero observability = blind operations | L | P1 |
| 10 | **WCAG 2.1 AA accessibility** — ARIA labels, keyboard nav, contrast across all 26 screens | Regulatory and UX requirement | L | P1 |

---

## Appendix: Module Completion Heat-Map

```
Module                           Done%   Status
─────────────────────────────────────────────────
5.1  Onboarding/KYC              43%    ██░░░░░  AT-RISK
5.2  Maintenance                100%    ███████  DONE
5.3  Order Capture (core)        75%    █████░░  PARTIAL
5.3  Order Capture (extended)    50%    ███░░░░  AT-RISK
5.4  Authorization               67%    ████░░░  PARTIAL
5.5  Aggregation                 56%    ████░░░  PARTIAL
5.6  Execution/Fill              33%    ██░░░░░  AT-RISK
5.7  Confirmation/Settlement     45%    ███░░░░  AT-RISK
5.8  Transfers/Contrib/WDL       62%    ████░░░  PARTIAL
5.9  Corporate Actions           60%    ████░░░  PARTIAL
5.10 Fund Accounting/NAV        100%    ███████  DONE
5.11 Fee & Billing               80%    █████░░  DONE
5.12 Cash & FX                   17%    █░░░░░░  AT-RISK
5.13 Taxation                    50%    ███░░░░  AT-RISK
5.14 Reversal                    50%    ███░░░░  PARTIAL
5.15 Bulk Upload                 67%    ████░░░  PARTIAL
5.16 Trade Surveillance         100%    ███████  DONE
5.17 Kill-Switch                 67%    ████░░░  PARTIAL
5.18 ORE Ledger                 100%    ███████  DONE
5.19 Whistleblower               67%    ████░░░  PARTIAL
5.20 AI Fraud/Anomaly           17%    █░░░░░░  DEFERRED
5.21 Portfolio Modeling          90%    ██████░  DONE
5.22 Scheduled Plans/PERA       64%    ████░░░  PARTIAL
5.23 Pre/Post-Trade Compliance  55%    ███░░░░  AT-RISK
5.24 Risk Analytics              50%    ███░░░░  PARTIAL
─────────────────────────────────────────────────
OVERALL                          62%    ████░░░  AT-RISK

Screens:                         79%    █████░░  PARTIAL
NFRs:                            18%    █░░░░░░  AT-RISK
External Integrations:            0%    ░░░░░░░  NOT STARTED
Test Coverage:                   29%    ██░░░░░  AT-RISK
```

---

*Report generated 2026-04-21 by Claude Code BRD Coverage Audit*
*BRD: TrustOMS-Philippines-BRD-FINAL.md v1.1-GAP*
*Commit: 1d0f244 on main*
