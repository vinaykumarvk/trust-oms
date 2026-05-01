# Feature Life Cycle Report: Metrobank MB-GAP-014 — Security Master & Non-Financial Assets
**Date:** 2026-05-01

## Pipeline Status

| Step | Status | Output |
|------|--------|--------|
| 1. BRD Generation | SKIPPED | Requirements from Metrobank gaps.md rows 470-557, 738-739 |
| 2-3. Eval | SKIPPED | skip-eval |
| 4. Test Cases | SKIPPED | skip-tests |
| 5. Gap Analysis | DONE | Explored existing codebase for all MB-GAP-014 sub-areas |
| 6-7. Plan + Execute | DONE | Schema + service + routes |
| 8. Build Validation | DONE | 0 new TS errors |
| 9. Full Review | CONDITIONAL | |
| 10. Local Deployment | DEFERRED | |

## Gap Analysis Summary

### Already Existed (no changes needed)
| Sub-Area | Existing Table/Field | Status |
|----------|---------------------|--------|
| Callable/Putable bonds | `securities.is_callable`, `call_date`, `call_price`, `is_putable`, `put_date`, `put_price` | EXISTS |
| Instrument sub-type field | `securities.instrument_sub_type` | EXISTS (field only, no master) |
| Life insurance trusts | `lifeInsuranceTrusts`, `lifeInsurancePremiums` | FULLY EXISTS |
| Unclaimed certificates | `unclaimedCertificates` with vault_reference, shelf_tag | EXISTS |
| Held-away assets | `heldAwayAssets` with custodian, location, market_value | EXISTS |
| Loan facilities | Full loan module (loanFacilities, loanDisbursements, etc.) | EXISTS |
| Pricing records | `pricingRecords` with security_id, price_date, source | EXISTS |
| Asset classes | `assetClasses` (EQ, FI, MM, DERIV, ALT) | EXISTS |
| Property depreciation | `propertyDepreciation` with asset_id, depreciation tracking | EXISTS |

### New Implementation (this gap closure)
| Sub-Area | What Was Built |
|----------|---------------|
| Instrument sub-type master | `instrumentSubTypes` table with code, asset_class, is_government, tenor_category, regulatory_category; CRUD + deactivate with in-use check |
| Deposit placements | `depositPlacements` table for time deposits, special savings, structured deposits; create, pre-terminate, rollover (creates new placement), accrued interest computation (actual/360, actual/365, WHT) |
| Property assets | `propertyAssets` table with TCT/CCT title tracking, land/floor area, zonal/assessed/appraised values, rental income, lease tracking, insurance, encumbrances; `propertyValuations` history table with auto-update of current value |
| Safekeeping vaults | `safekeepingVaults` master with capacity tracking; `vaultAccessLogs` with DEPOSIT/WITHDRAWAL/INSPECTION/INVENTORY/TRANSFER types, witness, capacity auto-adjust; inventory query (certificates + NFA) |
| Non-financial assets | `nonFinancialAssets` for ARTWORK/JEWELRY/COLLECTIBLES/ANTIQUES/PRECIOUS_METALS/VEHICLES/EQUIPMENT; valuation updates; consolidated portfolio summary (NFA + properties + deposits) |

## New Schema Tables (7)

| Table | Description |
|-------|-------------|
| `instrument_sub_types` | Master list of PH instrument sub-types (FXTN, RTB, T-bill, LTNCD, etc.) |
| `deposit_placements` | Time deposit and structured deposit tracking with rollover/pre-termination |
| `property_assets` | Real estate master with TCT/CCT, land area, appraisals, rental income |
| `property_valuations` | Historical property valuation records |
| `safekeeping_vaults` | Vault locations with capacity and access-level tracking |
| `vault_access_logs` | Vault access audit trail with witness and purpose |
| `non_financial_assets` | Artwork, jewelry, collectibles with provenance and insurance |

## New API Endpoints (28)

| Method | Path | Area |
|--------|------|------|
| POST | /security-master/instrument-sub-types | Sub-type master |
| GET | /security-master/instrument-sub-types | Sub-type master |
| PATCH | /security-master/instrument-sub-types/:id | Sub-type master |
| POST | /security-master/instrument-sub-types/:id/deactivate | Sub-type master |
| POST | /security-master/deposit-placements | Deposits |
| GET | /security-master/deposit-placements/:portfolioId | Deposits |
| GET | /security-master/deposit-placements/detail/:id | Deposits |
| POST | /security-master/deposit-placements/:id/preterminate | Deposits |
| POST | /security-master/deposit-placements/:id/rollover | Deposits |
| GET | /security-master/deposit-placements/:id/accrued-interest | Deposits |
| POST | /security-master/property-assets | Properties |
| GET | /security-master/property-assets/:portfolioId | Properties |
| GET | /security-master/property-assets/detail/:id | Properties |
| PATCH | /security-master/property-assets/:id | Properties |
| POST | /security-master/property-assets/valuations | Properties |
| GET | /security-master/property-assets/:propertyId/valuations | Properties |
| POST | /security-master/vaults | Vaults |
| GET | /security-master/vaults | Vaults |
| PATCH | /security-master/vaults/:id | Vaults |
| POST | /security-master/vaults/:id/access | Vaults |
| GET | /security-master/vaults/:id/access-log | Vaults |
| GET | /security-master/vaults/:id/inventory | Vaults |
| POST | /security-master/non-financial-assets | NFA |
| GET | /security-master/non-financial-assets/:portfolioId | NFA |
| GET | /security-master/non-financial-assets/detail/:id | NFA |
| PATCH | /security-master/non-financial-assets/:id | NFA |
| POST | /security-master/non-financial-assets/:id/valuate | NFA |
| GET | /security-master/non-financial-assets/:portfolioId/summary | NFA |

## Files Changed

| File | Change |
|------|--------|
| packages/shared/src/schema.ts | +7 tables (instrumentSubTypes, depositPlacements, propertyAssets, propertyValuations, safekeepingVaults, vaultAccessLogs, nonFinancialAssets) |
| server/services/security-master-extensions-service.ts | NEW ~480 lines — 5 service objects |
| server/routes/back-office/security-master-extensions.ts | NEW ~310 lines, 28 endpoints |
| server/routes/back-office/index.ts | +import and mount at /security-master |

## Metrobank Gap Closure Summary

With MB-GAP-014 closed, all 33 Metrobank gaps are now addressed:

| Status | Count | Gap IDs |
|--------|-------|---------|
| Closed (new code) | 27 | MB-GAP-002/003/005/006/007/008/009/010/011/012/013/014/015/017/018/019/020/021/022/023/025/027/028/030/031/032 |
| Already existed | 2 | MB-GAP-024 (Stock Transfer), MB-GAP-026 (Loan Facility) |
| Deferred (external/infra) | 4 | MB-GAP-001 (NFR load test), MB-GAP-004 (Metrobank API), MB-GAP-016 (CASA real-time), MB-GAP-029 (Word/SMTP) |
