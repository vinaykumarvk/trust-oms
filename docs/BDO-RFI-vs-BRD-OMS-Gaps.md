# BDO RFI vs. TrustOMS-Philippines-BRD-FINAL — OMS Gap Analysis

**Source RFI:** BDO RFI.xlsx (Sheet1, 715 requirement rows)
**Source BRD:** TrustOMS-Philippines-BRD-FINAL.md (v1.0-FIN, 17 April 2026)
**Scope of this comparison:** Features from the BDO RFI that are **directly or indirectly related to the Order Management System** and are **not explicitly covered** in the BRD.
**Date:** 18 April 2026

---

## Summary

The BRD already covers a great deal — the full order lifecycle (Capture → Authorize → Aggregate → Place → Execute → Confirm → Settle), tiered maker-checker, bulk upload with batch rollback, reversal, corporate actions, fund accounting/NAV, fee & billing, cash/FX, trade surveillance, kill-switch, ORE, AML/KYC, and tax engine. However, the BDO RFI surfaces a meaningful set of OMS and OMS-adjacent capabilities that the BRD either omits entirely or handles only at a high, non-actionable level. These gaps cluster into eight themes.

---

## 1. Order-Type and Time-in-Force Coverage

Features the BRD does not specify:

- **Market vs. target-price orders** placed as **Day orders or GTC (Good-Till-Cancelled)** — RFI R302, R328, R342. BRD only exposes `LIMIT` in the sample payload; no Market/Stop types, no time-in-force field.
- **Future-dated / pre-deal orders** for both cash and trade transactions (buy/sell on a future trade date; contributions/withdrawals with future value date beyond the standard T+n) — RFI R303, R347.
- **Switch-In / Switch-Out order type** (e.g., switching between UITFs without a full redeem-then-subscribe cycle) — RFI R308.
- **Scheduled / recurring orders**: scheduled withdrawals, scheduled income-payment auto-withdrawals with trigger — RFI R288, R348.
- **Subsequent-allocation** orders (adding to an already-placed block) — RFI R304.
- **Inter-account / inter-portfolio block transactions**: one-to-one, one-to-many, many-to-one, many-to-many with bulk import — RFI R306.

## 2. Order Maintenance / Lifecycle Operations

- **Back-dating of contributions / withdrawals** with authorised override — RFI R310, R437.
- **Edit an order post-submission** gated by an explicit "allowed order status" matrix — RFI R312, R319.
- **Partial liquidation** of an investment driven by the **required cash proceeds of the selling account** or **investible funds of the buying account** — RFI R313.
- **Changes in funding accounts** on a captured order — RFI R315.
- **Revert / un-cancel** an order (status-change based on specific criteria) — RFI R323.
- **Unmatched-inventory view** showing available lots/folios for portfolio officers to pick from, with live volume decrement as matches are posted — RFI R314.
- **Auto-compute missing field**: "give me units & price → compute gross amount" or "give me units & gross → compute price" — RFI R309.
- **Full/Partial redemption by disposal method**: pick-and-choose, FIFO, weighted-average, per COP / DS / lot / folio — RFI R298, R301.

## 3. Execution, Allocation & Fill Handling

- **Automated combining** of similar open orders (same security, same price) prior to placement for better execution — RFI R336.
- **Time-receipt allocation** with a **waitlist queue** for residual fills and re-allocation on back-outs/returns — RFI R331.
- **Automated allocation for primary issuances** (IPO/new-issue allocation engine) — RFI R332.
- **IMA/TA IPO Order Taking**: capture advance IPO orders, track cumulative volume, cap at issue limit, settle post-allocation — RFI R715, R716.
- **Rounding-off / calculation adjustments** editable pre-posting (charges, taxes, transaction charges) — RFI R337.
- **Ability to override minimum/required transaction charges/fees** — RFI R340.
- **Daily distribution of transaction charges per broker** (e.g., PDTC) — RFI R339.
- **Stock transaction-charge computation and net settlement amount** calculator — RFI R341.

## 4. Order Validation & Pre/Post-Trade Compliance

BRD mentions "real-time suitability check" and "mandate breach" but does not specify the following granular validations:

- **Pre-trade compliance engine** with limit taxonomy: **trader limit, counterparty, broker, issuer, asset class, borrower, SBL (Single Borrower's Limit), sector/industry, group, outlet/security** — RFI R356, R357, R358, R361, R373.
- **Real-time multi-portfolio post-trade compliance analysis** and **scheduled post-trade reviews with reminder/alarm for expiring lines** — RFI R376, R377, R499.
- **Hard vs. Soft validation** distinction: soft breaches require documented override by a designated authoriser with RBAC rights for the override path — RFI R374, R375, R378, R379, R500.
- **Short-sell flag/alert** when account is selling a security not currently held — RFI R360.
- **Overselling validation** against actual positions — RFI R354.
- **Hold-out flags**: block sale of a security that is under hold-out or is a stock-dividend receivable — RFI R352, R355.
- **IMA-specific validations**:
  - Minimum face amount **PHP 1M** for IMA trades (warn + prohibit) — RFI R364, R367.
  - **No co-mingling** between IMA trust accounts — RFI R368.
  - Minimum-participation / minimum-balance rules — RFI R366.
- **Tax-status validation**: Inter-Portfolio Transactions (IPT) at **T+0 only between same tax status** buyer/seller — RFI R369.
- **Portfolio-currency vs. security-currency mismatch** warning — RFI R365.
- **Trade-date vs. settle-date holdings accounting**: update holdings on trade date; tag unsettled as **receivables** — RFI R370.
- **FATCA / Non-Resident product restriction**: disallow specific products based on residency flag — RFI R371.
- **Unsettled-pending-orders prompt** when capturing a new related order — RFI R372.
- **Outstanding-document-deficiency blocker**: reject orders/transactions where the client/account has missing Letters of Instruction or other mandated docs — RFI R344, R362.
- **Cut-off-time enforcement per order/transaction type** with automatic rejection after cut-off — RFI R351, R363, R380.
- **Volume-not-available rejection** (auto-reject when primary issuance exhausts) — RFI R381.
- **Unfunded-order rejection** with override path for **"funding in transit"** — RFI R382, R383.
- **Withdrawal hierarchy rule**: income first, then principal (as default, overridable) — RFI R346.
- **Minimum-balance check** on contribution/withdrawal — RFI R349.
- **Higher-risk product prompt**: explicit "CSA waiver" action to continue order when client's risk profile is breached — RFI R343.

## 5. Portfolio Modeling & Rebalancing

The BRD has **no Portfolio Modeling module** at all. The RFI specifies a full suite:

- **Simulation & what-if analysis** on portfolios — RFI R274.
- **Portfolio simulation**: ROI / yield / duration impact of asset switches, trading gain/loss projection, quarterly ROI forecast for Discretionary, Directional and UITF — RFI R275.
- **Stress-test modelling / scenarios** — RFI R276.
- **Constant-mix portfolio rebalancing** (simulation only) — RFI R277.
- **Model-portfolio asset allocation with compliance checks** — RFI R278.
- **Compare / rebalance portfolio(s) vs. a benchmark or model portfolio**; multi-stock modelling across all clients — RFI R279.
- **Rebalance on existing holdings or on new cash contribution / withdrawal** — RFI R280.
- **Rebalance a group of portfolios** (investor / family / related accounts) against a **single model** in one action — RFI R281.
- **Include held-away assets** in rebalancing considerations — RFI R282.
- **Trade-blotter generation** from rebalancing run, with post-generation edit — RFI R283.
- **Rebalancing vs. client restrictions** (investor-specific rules, audit and compliance measures) — RFI R284, R286.

## 6. Order-Adjacent Risk & Asset-Management Features

- **VAR computation and back-testing**: VAR calc, back-testing of VAR vs. Theoretical and Actual Income — RFI R483, R484, R485.
- **Macaulay / modified duration** for weighted portfolio and benchmark, as of any date — RFI R486, R487.
- **Stress-test downloads** per portfolio for specified periods — RFI R482.
- **IREP (Investment Risk Escalation Process)**: RM input of client disposition to price-movement % thresholds — RFI R478.
- **Price-movement % threshold check** on client holdings — RFI R471.
- **Embedded-derivative tagging** on a security — RFI R479.
- **Derivative-security setup** (Asset Swap, CCS, IRS, Options, Forwards) with mark-to-market capability — RFI R469, R480.
- **Aging / curing-period monitoring** on breaches — RFI R490.
- **Consent-fee setup** on securities (possibly midstream, for selected accounts) — RFI R137.
- **Held-away assets booking and monitoring** (asset class, location, reporting) — RFI R297.
- **Asset transfer / contribution of assets from / to other Trustee banks** (in-kind, cross-institution) — RFI R295, R307.

## 7. Channel, Portal, Branch & Client Dashboard (Client-Facing OMS)

- **Portability**: an order captured via branch must be **visible and actionable via the online portal and vice versa** (cross-channel order lineage) — RFI R671.
- **Branch search**: search client by **CIF No. or Account Name** — RFI R675.
- **Branch visibility rules**: a branch user only sees transactions of clients booked to that specific branch — RFI R677.
- **Branch quick-view dashboard**: IMA/TA maturities due today, quick-links to Trust products, Trust advisories — RFI R676.
- **Client dashboard personalisation**: hide/unhide widgets per preference — RFI R673.
- **Client download of COP / Disclosure Statement** in **PDF, read-only CSV, and Excel** — RFI R674.
- **Client restricted-account view for redemption**: portal must show **only existing/outstanding accounts available for redemption/withdrawal** — RFI R325.
- **Trader-ID tagging** on every captured / uploaded / executed transaction, with filter-by-Trader — RFI R316, R317.
- **View orders with filter by Client / Account / Account Officer / Branch** gated by RBAC — RFI R324.
- **System-generated chronological transaction reference number** with date & time stamp — RFI R670.

## 8. Cash, Payment Modes & Settlement (Order-Driven)

- **Online FOREX conversion** embedded in order capture for clients without a dollar account investing in USD securities (and vice versa) — RFI R667.
- **Payment-mode enumeration**: **Debit CA/SA, Cash, Cheque, Wire Transfer** as first-class order fields with real-time CA/SA debit on contribution — RFI R668, R669.
- **Multi-currency transaction handling** on a single order — RFI R666.
- **"Book-only" settlement** (GL update only, no SWIFT / RTGS movement) for Private-Bank cases — RFI R400.
- **Bulk settlement** processing — RFI R401.
- **Clearing and admin current accounts** with automatic sweep into Trust settlement accounts — RFI R392, R393.
- **Official Receipt (OR) generation** on every cash-receipt transaction — RFI R394.
- **Coupon / maturity processing per-custodian** (processing grouped by custodian bank / PDTC / registry) — RFI R398.
- **Trust settlement accounts at account-level or portfolio-level**, multi-currency — RFI R395.

## 9. Scheduled-Investment & Retirement Product Lifecycles (all OMS-driven)

These are full product lifecycles in the BDO RFI with no equivalent FRs in the BRD:

- **EIP (Easy Investment Plan)**: Enrollment, Modification, Unsubscription, Core-system transmission for auto-debit of nominated CA/SA — RFI R682–R687.
- **ERP (Easy Redemption Plan)**: Enrollment, Unsubscription, auto-credit of nominated CA/SA — RFI R706–R708.
- **PERA (Personal Equity Retirement Account)** — a regulated BSP product entirely absent from the BRD:
  - Max-PERA-products-per-contributor validation, cut-off by product, fees by transaction type, bulk upload — RFI R688–R694.
  - **Onboarding** (New to PERA or Transfer from another PERA administrator), e-Learning in English + Taglish — RFI R695, R698.
  - **BSP PERA-Sys / ePERA-Sys API integration** (TIN existence check, duplicate-PERA check) — RFI R696, R697 *(RFI self-scored 1/4 — the weakest capability the RFI vendor offers; a gap worth BDO owning itself).*
  - Transaction-status notifications — RFI R699.
  - Transfer to Another Product, Transfer to Another PERA Administrator — RFI R700, R702.
  - Qualified / Unqualified Withdrawals with penalty application — RFI R701.
  - Generation of **BSP PERA System Contributor File** and **Transaction File** — RFI R703, R704.
  - Modify PERA Contributor and Beneficiary details — RFI R705.
  - **Tax Credit Certificate (TCC)** processing and viewing — RFI R690.
  - **Tax-Free Distribution** rule compliance — RFI R689.
- **IMA / TA lifecycle specifics**:
  - **Acceptances** with **Standing Instructions** (auto-roll, auto-credit, auto-withdrawal) — RFI R709, R710.
  - **Pretermination** workflow with proceeds payout — RFI R713, R714.

---

## Severity-Tagged Priority List

| # | Gap | Severity | Rationale |
|---|-----|----------|-----------|
| 1 | Portfolio Modeling / Rebalancing module | **Critical** | Entirely absent from BRD; core discretionary-mandate capability. |
| 2 | Full PERA lifecycle + BSP PERA-Sys API | **Critical** | Regulated product; compliance & reporting required by BSP. |
| 3 | EIP / ERP scheduled-plan lifecycles | **High** | Retail client-acquisition channel; in-scope product. |
| 4 | Pre-trade limit taxonomy (trader / counterparty / broker / issuer / SBL / sector / group) | **High** | Current BRD only names "limits" at a summary level. |
| 5 | Hard-vs-Soft validation + override workflow | **High** | Fiduciary control; auditable override path distinct from 2/4/6-eyes. |
| 6 | IMA-specific validations (PHP 1M minimum face, no co-mingling, IPT T+0 tax-status rule) | **High** | BSP/SEC IMA rules are enforceable at order-gate. |
| 7 | IPO allocation engine & advance-order volume cap | **High** | Primary-issuance flow; no equivalent in BRD. |
| 8 | Order time-in-force (Day, GTC, Future-dated) & Switch-In/Out order types | **High** | Fundamental OMS order-type coverage. |
| 9 | Channel-portability, Branch visibility, COP/DS download, Trader-ID tagging | **Medium** | User-experience and control gaps affecting STP and audit. |
| 10 | VAR / back-test / duration analytics | **Medium** | Risk-office reporting expectation. |
| 11 | Asset transfer to / from other Trustee banks, Held-Away assets booking | **Medium** | Onboarding and consolidated-view requirement. |
| 12 | Book-only / bulk settlement, Multi-currency orders, Online FX at order-capture | **Medium** | Private-bank-client specific flows; reduce manual work. |
| 13 | Order-maintenance nuances (back-date, revert, un-cancel, unmatched-inventory view) | **Low-Medium** | Operational convenience but frequent break-fix patterns. |

---

## Recommendation

These gaps fall into three action buckets for the BRD:

1. **Add two new modules to the BRD** — a **Portfolio Modeling & Rebalancing Module** (Section 5.21) and a **Scheduled-Plan & PERA Module** (Section 5.22, with sub-sections for EIP, ERP, PERA, IMA/TA SI).
2. **Expand existing FR-ORD, FR-VAL and FR-SRV** to cover the validation taxonomy, time-in-force, hard/soft override, and IMA-specific rules — these can be appended to Section 5.3 and 5.4 without structural change.
3. **Expand Section 6 (UI)** with explicit Branch Dashboard, Client Portal refinements, and a Trader-ID-tagged Order Explorer; **expand Section 11 (Reporting)** with the broker-charge-distribution and IREP dashboards.

— End of Gap Analysis —
