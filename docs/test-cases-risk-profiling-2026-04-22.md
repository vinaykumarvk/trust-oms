# Risk Profiling & Proposal Generation -- Functional Test Cases

**Module**: Risk Profiling & Proposal Generation Management (RP-PGM)
**BRD Version**: 2.0 (Post-Adversarial Review)
**Date**: 2026-04-22
**Functional Requirements Covered**: FR-001 through FR-042
**Total Test Cases**: 247

---

## Roles Reference

| Role | Description |
|------|-------------|
| OPS_ADMIN | Operations Administrator -- Maker for questionnaire, mapping, and allocation config CRUD |
| OPS_SUPERVISOR | Operations Supervisor -- Checker for config authorization/rejection |
| RM | Relationship Manager -- conducts risk profiling, creates proposals |
| RM_SUPERVISOR | RM Supervisor / Team Lead -- approves risk profiles, L1 proposal approval, dashboard |
| COMPLIANCE | Compliance Officer -- compliance-level proposal approval, reports, audit trail |
| CLIENT | Client Portal user -- views risk profile, accepts/rejects proposals |

## Status Lifecycle Reference

### Configuration Entities (Questionnaire, Risk Appetite Mapping, Asset Allocation)
```
(New) --> UNAUTHORIZED --> AUTHORIZED
                       |-> REJECTED --> (Modify & Resubmit) --> UNAUTHORIZED
AUTHORIZED --> (Modify) --> MODIFIED --> AUTHORIZED
                                     |-> REJECTED
```

### Customer Risk Profile
```
(None) --> IN_PROGRESS --> COMPUTED --> PENDING_APPROVAL --> ACTIVE --> EXPIRED
                                    |-> DEVIATED_PENDING --> ACTIVE
                                                         |-> COMPUTED (rejected)
```

### Investment Proposal
```
DRAFT --> SUBMITTED --> L1_APPROVED --> COMPLIANCE_APPROVED --> SENT_TO_CLIENT --> CLIENT_ACCEPTED
                     |-> L1_REJECTED (terminal)                                |-> CLIENT_REJECTED
                     |-> DRAFT (returned)                                      |-> EXPIRED
                                    |-> COMPLIANCE_REJECTED (terminal)
                                    |-> DRAFT (returned)
```

---

## 1. Questionnaire CRUD with Maker-Checker (FR-001 through FR-008)

### FR-001: List Questionnaires

#### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-001 | FR-001 | Happy Path | Display paginated questionnaire grid with default settings | OPS_ADMIN logged in; 15+ questionnaire records exist for the user's entity | 1. Navigate to Risk Assessor menu. 2. Click 'Risk Questionnaire' card. | Grid displays with columns: Questionnaire Name, Customer Category, Questionnaire Type, Status, Maker ID/Name, Actions. Default pagination shows 10 records. Total count visible. | P0 |
| TC-RP-002 | FR-001 | Happy Path | Sort questionnaires by column | OPS_ADMIN logged in; multiple questionnaires with different names | 1. Click on 'Questionnaire Name' column header. 2. Click again to reverse sort. | Records sort ascending on first click, descending on second click. Sort indicator (arrow) shown. | P1 |
| TC-RP-003 | FR-001 | Happy Path | Filter questionnaires by status | OPS_ADMIN logged in; questionnaires exist in UNAUTHORIZED, AUTHORIZED, MODIFIED, REJECTED statuses | 1. Apply status filter = 'AUTHORIZED'. 2. Clear filter. 3. Apply status filter = 'UNAUTHORIZED'. | Grid shows only records matching the selected status. Clearing filter restores full list. | P1 |
| TC-RP-004 | FR-001 | Happy Path | Status badges are color-coded correctly | OPS_ADMIN logged in; questionnaires in all four statuses exist | 1. View grid without filters. | UNAUTHORIZED badge = grey, MODIFIED = amber, AUTHORIZED = green, REJECTED = red. | P1 |
| TC-RP-005 | FR-001 | Happy Path | Action icons display based on status | OPS_ADMIN logged in; UNAUTHORIZED, AUTHORIZED, and MODIFIED records exist | 1. Observe action icons per row. | UNAUTHORIZED/MODIFIED rows show View (eye), Edit (pencil), Delete (trash). AUTHORIZED rows show only View (eye). REJECTED rows show View (eye) only. | P0 |
| TC-RP-006 | FR-001 | Happy Path | Pagination with different page sizes | OPS_ADMIN logged in; 60+ questionnaire records exist | 1. Change page size to 25. 2. Navigate to page 2. 3. Change page size to 50. | Page size changes correctly. Navigation between pages works. Records per page match selected size. | P1 |
| TC-RP-007 | FR-001 | Happy Path | Column-based search/filter | OPS_ADMIN logged in; questionnaires with various names and categories exist | 1. Enter search text 'SAF' in the Questionnaire Name filter. 2. Select 'Individual' in Customer Category filter. | Grid filters results matching search criteria in the respective columns. | P1 |

#### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-008 | FR-001 | Negative | Soft-deleted records are excluded from grid | OPS_ADMIN logged in; some questionnaires have is_deleted=true in the database | 1. View grid. 2. Search for the name of a deleted questionnaire. | Deleted records do not appear in the grid. Search returns no results for deleted records. | P0 |
| TC-RP-009 | FR-001 | Negative | Grid shows only records for user's entity | OPS_ADMIN logged in to Entity-A; questionnaires exist for Entity-A and Entity-B | 1. View grid. | Only questionnaires belonging to Entity-A are displayed. Entity-B records are not visible. | P0 |

#### Permission Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-010 | FR-001 | Permission | RM cannot access questionnaire grid | RM logged in | 1. Attempt to navigate to Risk Questionnaire grid. | Access denied (HTTP 403). Grid is not accessible to RM role. | P0 |
| TC-RP-011 | FR-001 | Permission | CLIENT cannot access questionnaire grid | CLIENT logged in | 1. Attempt to access /api/back-office/risk-profiling/questionnaires. | Access denied (HTTP 403). | P0 |

---

### FR-002: Add Questionnaire

#### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-012 | FR-002 | Happy Path | Create a scored questionnaire with all mandatory fields | OPS_ADMIN logged in; no overlapping questionnaire for same category/type/dates | 1. Click 'Add Questionnaire'. 2. Fill: Name='SAF Q1 2026', Category='Both', Type='SAF', Start Date=today, End Date=today+365, Valid Period=2, Is Score=true. 3. Click 'Add Question'. 4. Fill question: Description='What is your annual income?', Mandatory=true, Multi Select=No, Scoring Type=NONE, Computation Type=SUM. 5. Add 3 answer options with weightages (1, 3, 5). 6. Click Save. | Record created with status=UNAUTHORIZED, version=1. Success toast 'Record Modified Successfully' displayed. Grid refreshes showing new record. | P0 |
| TC-RP-013 | FR-002 | Happy Path | Create a non-scored questionnaire | OPS_ADMIN logged in | 1. Click 'Add Questionnaire'. 2. Fill header with Is Score=false. 3. Add questions with no weightages. 4. Save. | Record created with is_score=false, status=UNAUTHORIZED. Weightage fields are still present but irrelevant for scoring. | P0 |
| TC-RP-014 | FR-002 | Happy Path | Add multiple questions with answer options | OPS_ADMIN logged in | 1. Create questionnaire header. 2. Add 5 questions using 'Add Question' button. 3. Each question has 3-5 answer options. 4. Save. | All 5 questions saved with their respective answer options. Question numbers auto-assigned sequentially (1-5). | P0 |
| TC-RP-015 | FR-002 | Happy Path | Add multi-select question with RANGE scoring | OPS_ADMIN logged in | 1. Add question with Multi Select=Yes, Scoring Type=RANGE. 2. Add 4 answer options with weightages (1, 2, 3, 4). 3. Click 'Add Range'. 4. Add ranges: 0-5 -> score 1, 6-10 -> score 3, 11-15 -> score 5. 5. Save. | Question saved with scoring_type=RANGE. Three ScoreNormalizationRange records created. | P0 |
| TC-RP-016 | FR-002 | Happy Path | Add Warning, Acknowledgement, and Disclaimer text | OPS_ADMIN logged in; creating new questionnaire | 1. Fill questionnaire header and questions. 2. Expand Warning section, enter rich text. 3. Expand Acknowledgement section, enter rich text. 4. Expand Disclaimer section, enter rich text. 5. Save. | All three text fields saved. Content retrievable via View action. | P1 |
| TC-RP-017 | FR-002 | Happy Path | Effective Start Date defaults to today | OPS_ADMIN logged in | 1. Click 'Add Questionnaire'. 2. Observe Start Date field. | Start Date field is pre-populated with today's date. | P1 |

#### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-018 | FR-002 | Negative | Missing mandatory field -- questionnaire name blank | OPS_ADMIN logged in | 1. Leave questionnaire name empty. 2. Fill other mandatory fields. 3. Click Save. | Validation error: 'Questionnaire name is required.' Form does not submit. | P0 |
| TC-RP-019 | FR-002 | Negative | Questionnaire name below minimum length (< 3 chars) | OPS_ADMIN logged in | 1. Enter name = 'AB'. 2. Fill other fields. 3. Save. | Validation error: 'Questionnaire name must be at least 3 characters.' | P0 |
| TC-RP-020 | FR-002 | Negative | End Date before Start Date | OPS_ADMIN logged in | 1. Set Start Date = 2026-06-01. 2. Set End Date = 2026-05-01. 3. Save. | Validation error: 'End Date must be after Start Date.' | P0 |
| TC-RP-021 | FR-002 | Negative | Duplicate questionnaire -- overlapping date range for same category and type | OPS_ADMIN logged in; AUTHORIZED questionnaire exists for Category='Both', Type='SAF', dates 2026-01-01 to 2026-12-31 | 1. Create new questionnaire with Category='Both', Type='SAF', Start=2026-06-01, End=2027-06-01. 2. Save. | Validation error: 'A questionnaire for this category and type already exists for the specified date range.' | P0 |
| TC-RP-022 | FR-002 | Negative | Category 'Both' conflicts with existing Individual questionnaire | OPS_ADMIN logged in; AUTHORIZED questionnaire for Category='Individual', Type='SAF', dates 2026-01-01 to 2026-12-31 exists | 1. Create questionnaire with Category='Both', Type='SAF', overlapping dates. 2. Save. | Validation error: 'An Individual questionnaire already exists for this type and overlapping period. Cannot create a Both questionnaire.' | P0 |
| TC-RP-023 | FR-002 | Negative | Score normalization ranges overlap | OPS_ADMIN logged in; adding multi-select RANGE question | 1. Add range 0-5 -> 1. 2. Add range 3-10 -> 3 (overlaps with first). 3. Save. | Validation error: 'Score normalization ranges must not overlap.' | P0 |
| TC-RP-024 | FR-002 | Negative | Score normalization ranges have gaps | OPS_ADMIN logged in; adding multi-select RANGE question with max possible raw score of 10 | 1. Add range 0-3 -> 1. 2. Add range 6-10 -> 3 (gap at 4-5). 3. Save. | Validation error: 'Score normalization ranges must cover the full possible score range with no gaps.' | P1 |
| TC-RP-025 | FR-002 | Negative | Valid period out of bounds | OPS_ADMIN logged in | 1. Enter Valid Period = 0 (or 11). 2. Save. | Validation error: 'Valid period must be between 1 and 10 years.' | P1 |
| TC-RP-026 | FR-002 | Negative | Question without any answer options | OPS_ADMIN logged in | 1. Add a question with is_mandatory=true. 2. Do not add any answer options. 3. Save. | Validation error: 'Mandatory questions must have at least 1 answer option defined.' | P0 |

#### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-027 | FR-002 | Edge Case | Questionnaire name at exactly 200 characters (max) | OPS_ADMIN logged in | 1. Enter name with exactly 200 characters. 2. Fill other fields. 3. Save. | Questionnaire created successfully. Boundary value accepted. | P2 |
| TC-RP-028 | FR-002 | Edge Case | Single-select question auto-sets scoring_type to NONE | OPS_ADMIN logged in | 1. Add question with Multi Select=No. 2. Observe Scoring Type field. | Scoring Type auto-set to NONE and is non-editable (greyed out). | P1 |
| TC-RP-029 | FR-002 | Edge Case | Questionnaire with no questions | OPS_ADMIN logged in | 1. Fill header fields only. 2. Do not add any questions. 3. Save. | System should either prevent saving (validation error: 'At least one question is required') or save as empty questionnaire depending on design. | P1 |

---

### FR-003: View Questionnaire

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-030 | FR-003 | Happy Path | View questionnaire in read-only mode | OPS_ADMIN logged in; AUTHORIZED questionnaire exists | 1. Click View (eye icon) on an AUTHORIZED record. | All fields displayed but non-editable. Questions shown as collapsible sections. No Save/Reset buttons. Back button present. | P0 |
| TC-RP-031 | FR-003 | Happy Path | View questionnaire with all statuses | OPS_ADMIN logged in; records in UNAUTHORIZED, MODIFIED, AUTHORIZED, REJECTED statuses | 1. Click View on each status type. | View works for all statuses. All data displayed correctly in read-only mode. | P1 |
| TC-RP-032 | FR-003 | Happy Path | View questionnaire displays score normalization ranges | OPS_ADMIN logged in; questionnaire with RANGE questions exists | 1. View the questionnaire. 2. Expand the multi-select RANGE question. | Score normalization ranges (From, To, Score) displayed in a sub-table within the question section. | P1 |

---

### FR-004: Modify Questionnaire

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-033 | FR-004 | Happy Path | Modify an UNAUTHORIZED questionnaire | OPS_ADMIN logged in; UNAUTHORIZED questionnaire exists | 1. Click Edit on UNAUTHORIZED record. 2. Change question description. 3. Add a new answer option. 4. Save. | Record updated. Status remains UNAUTHORIZED. Version incremented. Success toast shown. | P0 |
| TC-RP-034 | FR-004 | Happy Path | Modify an AUTHORIZED questionnaire | OPS_ADMIN logged in; AUTHORIZED questionnaire exists | 1. Click Edit on AUTHORIZED record. 2. Add a new question. 3. Save. | Status changes to MODIFIED. Version incremented. Record requires re-authorization. | P0 |
| TC-RP-035 | FR-004 | Happy Path | Form pre-populates with existing data | OPS_ADMIN logged in; questionnaire with 3 questions, each with options | 1. Click Edit. | All header fields, questions, answer options, and normalization ranges pre-populated with existing data. | P0 |
| TC-RP-036 | FR-004 | Happy Path | Add and remove questions during edit | OPS_ADMIN logged in; questionnaire with 3 questions | 1. Click Edit. 2. Remove question 2. 3. Add a new question. 4. Save. | Question 2 soft-deleted. New question added. Question numbers re-sequenced. | P1 |
| TC-RP-037 | FR-004 | Negative | Cannot modify REJECTED questionnaire | OPS_ADMIN logged in; REJECTED questionnaire exists | 1. Attempt to click Edit on REJECTED record. | Edit action not available (pencil icon not shown). Must create new questionnaire instead. | P0 |
| TC-RP-038 | FR-004 | Negative | Questionnaire Name not editable for AUTHORIZED records | OPS_ADMIN logged in; AUTHORIZED record being edited | 1. Click Edit on AUTHORIZED record. 2. Attempt to change Questionnaire Name field. | Questionnaire Name field is disabled/read-only for AUTHORIZED records. | P1 |

---

### FR-005: Delete Questionnaire

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-039 | FR-005 | Happy Path | Soft-delete an UNAUTHORIZED questionnaire | OPS_ADMIN logged in; UNAUTHORIZED questionnaire exists | 1. Click Delete (trash icon) on UNAUTHORIZED record. 2. Confirm in dialog: 'Are you sure you want to delete this questionnaire?' | Record soft-deleted (is_deleted=true). Removed from grid. Success toast displayed. | P0 |
| TC-RP-040 | FR-005 | Happy Path | Soft-delete a MODIFIED questionnaire | OPS_ADMIN logged in; MODIFIED questionnaire exists | 1. Click Delete on MODIFIED record. 2. Confirm deletion. | Record soft-deleted. Removed from grid. | P0 |
| TC-RP-041 | FR-005 | Negative | Cannot delete AUTHORIZED questionnaire | OPS_ADMIN logged in; AUTHORIZED questionnaire exists | 1. Observe actions column on AUTHORIZED record. | Delete (trash) icon not displayed. AUTHORIZED records cannot be deleted. | P0 |
| TC-RP-042 | FR-005 | Negative | Cancel deletion dialog | OPS_ADMIN logged in; UNAUTHORIZED questionnaire exists | 1. Click Delete. 2. Click 'Cancel' in confirmation dialog. | Record not deleted. Grid unchanged. | P1 |

---

### FR-006: Authorize/Reject Questionnaire

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-043 | FR-006 | Happy Path | Authorize an UNAUTHORIZED questionnaire | OPS_SUPERVISOR logged in; UNAUTHORIZED questionnaire created by different user exists | 1. Open authorization queue. 2. Select the pending questionnaire. 3. View full details. 4. Click 'Authorize'. | Status = AUTHORIZED. checker_id = supervisor's ID. authorized_at timestamp set. Email/in-app notification sent to maker. | P0 |
| TC-RP-044 | FR-006 | Happy Path | Reject an UNAUTHORIZED questionnaire with reason | OPS_SUPERVISOR logged in; UNAUTHORIZED questionnaire exists | 1. Open authorization queue. 2. Select pending questionnaire. 3. Click 'Reject'. 4. Enter mandatory rejection reason. 5. Confirm. | Status = REJECTED. Rejection reason stored. Notification sent to maker. | P0 |
| TC-RP-045 | FR-006 | Happy Path | Authorize a MODIFIED questionnaire | OPS_SUPERVISOR logged in; MODIFIED questionnaire exists | 1. Open authorization queue. 2. Select MODIFIED record. 3. Click 'Authorize'. | Status = AUTHORIZED. Re-authorized with updated version. | P0 |
| TC-RP-046 | FR-006 | Negative | Maker cannot authorize own record (four-eyes) | OPS_SUPERVISOR logged in; questionnaire where maker_id = supervisor's user ID | 1. Attempt to authorize own record. | Error: 'You cannot authorize your own records (four-eyes principle).' Action blocked. | P0 |
| TC-RP-047 | FR-006 | Negative | Reject without mandatory reason | OPS_SUPERVISOR logged in; UNAUTHORIZED questionnaire selected | 1. Click 'Reject'. 2. Leave reason field blank. 3. Confirm. | Validation error: 'Rejection reason is required.' | P0 |
| TC-RP-048 | FR-006 | Happy Path | Rejected record can be modified and resubmitted | OPS_ADMIN logged in; REJECTED questionnaire exists | 1. OPS_ADMIN modifies the rejected record (creates new version). 2. Saves. | Status changes to UNAUTHORIZED. Record reappears in authorization queue for supervisor review. | P1 |

---

### FR-007: Score Normalization for Multi-Select

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-049 | FR-007 | Happy Path | Define score normalization ranges for RANGE question | OPS_ADMIN logged in; editing questionnaire with multi-select question | 1. Set scoring_type=RANGE on a multi-select question. 2. Click 'Add Range'. 3. Define: 0-5 -> 1, 6-10 -> 3, 11-15 -> 5. 4. Save. | Ranges saved. No overlap, no gaps. From < To for each. Score >= 0 for each. | P0 |
| TC-RP-050 | FR-007 | Negative | Range From >= Range To | OPS_ADMIN logged in | 1. Add range with From=10, To=5. 2. Save. | Validation error: 'Range From must be less than Range To.' | P0 |
| TC-RP-051 | FR-007 | Negative | Negative normalized score | OPS_ADMIN logged in | 1. Add range with Score=-1. 2. Save. | Validation error: 'Normalized score must be >= 0.' | P1 |
| TC-RP-052 | FR-007 | Edge Case | 'Add Range' button only appears for RANGE scoring type | OPS_ADMIN logged in; question with scoring_type=NONE | 1. Observe question form. | 'Add Range' button is not visible when scoring_type != RANGE. | P1 |

---

### FR-008: Warning/Acknowledgement/Disclaimer Config

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-053 | FR-008 | Happy Path | Configure warning, acknowledgement, and disclaimer as rich text | OPS_ADMIN logged in; creating/editing questionnaire | 1. Expand Warning section. 2. Enter formatted text (bold, lists). 3. Expand Acknowledgement. 4. Enter text. 5. Expand Disclaimer. 6. Enter text. 7. Save. | All three rich-text fields saved. Content preserved with formatting on View. | P1 |
| TC-RP-054 | FR-008 | Happy Path | Content sections are optional | OPS_ADMIN logged in | 1. Create questionnaire without entering any Warning/Acknowledgement/Disclaimer. 2. Save. | Questionnaire saved successfully. Optional fields stored as NULL. | P1 |

---

## 2. Risk Appetite Mapping CRUD + Maker-Checker (FR-009 through FR-011)

### FR-009: List Risk Appetite Mappings

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-055 | FR-009 | Happy Path | Display risk appetite mapping grid | OPS_ADMIN logged in; multiple risk appetite mappings exist | 1. Navigate to Risk Assessor menu. 2. Click 'Risk Appetite' card. | Grid displays: Mapping Name, Effective Start/End Date, Status, Maker, Actions. Sortable, filterable, paginated. View/Edit/Delete based on status. | P0 |

### FR-010: Add/Modify Risk Appetite Mapping

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-056 | FR-010 | Happy Path | Create risk appetite mapping with 6 contiguous bands | OPS_ADMIN logged in | 1. Click Add. 2. Enter Name='Risk Map 2026', Start=2026-01-01, End=2026-12-31. 3. Add 6 bands: 0-5=Conservative(1), 6-10=Low to Moderate(2), 11-15=Moderate(3), 16-20=Moderately High(4), 21-25=Aggressive(5), 26-30=Very Aggressive(6). 4. Save. | Mapping created with status=UNAUTHORIZED. 6 RiskAppetiteBand records created. Risk codes auto-assigned 1-6. | P0 |
| TC-RP-057 | FR-010 | Happy Path | Modify existing risk appetite mapping | OPS_ADMIN logged in; UNAUTHORIZED mapping exists | 1. Click Edit. 2. Change band boundaries (adjust score ranges). 3. Save. | Mapping updated. Version incremented. Bands updated accordingly. | P0 |
| TC-RP-058 | FR-010 | Negative | Overlapping score bands | OPS_ADMIN logged in | 1. Add band 0-10=Conservative. 2. Add band 8-15=Moderate (overlaps at 8-10). 3. Save. | Validation error: 'Score bands must not overlap.' | P0 |
| TC-RP-059 | FR-010 | Negative | Non-contiguous score bands (gaps) | OPS_ADMIN logged in | 1. Add band 0-5=Conservative. 2. Add band 10-15=Moderate (gap at 6-9). 3. Save. | Validation error: 'Score bands must be contiguous with no gaps.' | P0 |
| TC-RP-060 | FR-010 | Negative | Bands do not start from 0 | OPS_ADMIN logged in | 1. Add bands starting from 5 instead of 0. 2. Save. | Validation error: 'Score bands must cover the entire score range starting from 0.' | P1 |
| TC-RP-061 | FR-010 | Edge Case | Band boundary semantics -- inclusive-lower, exclusive-upper | OPS_ADMIN logged in; mapping with band 0-5 (Conservative) and 5-10 (Low to Moderate) | 1. Save mapping. 2. Compute score = 5.00 for a customer. | Score 5.00 maps to 'Low to Moderate' (band 5-10) since band semantics are score_from <= score < score_to, except last band is inclusive on both ends. | P0 |
| TC-RP-062 | FR-010 | Edge Case | Last band is inclusive on both ends | OPS_ADMIN logged in; last band = 26-30 (Very Aggressive) | 1. Compute score = 30.00 for a customer. | Score 30.00 maps to 'Very Aggressive'. Last band uses inclusive upper bound (score_from <= score <= score_to). | P0 |

### FR-011: Authorize Risk Appetite Mapping

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-063 | FR-011 | Happy Path | Authorize risk appetite mapping | OPS_SUPERVISOR logged in; UNAUTHORIZED mapping by different user | 1. Open authorization queue. 2. Select mapping. 3. Click Authorize. | Status=AUTHORIZED. Checker ID and timestamp recorded. Maker notified. | P0 |
| TC-RP-064 | FR-011 | Negative | Four-eyes principle enforced | OPS_SUPERVISOR who is also the maker of the mapping | 1. Attempt to authorize own mapping. | Error: four-eyes principle violation. Authorization blocked. | P0 |

---

## 3. Asset Allocation Config CRUD + Maker-Checker (FR-012 through FR-014)

### FR-012: List Asset Allocation Configs

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-065 | FR-012 | Happy Path | Display asset allocation config grid | OPS_ADMIN logged in; asset allocation configs exist | 1. Navigate to Risk Assessor menu. 2. Click 'Asset Allocation' card. | Grid with Config Name, Effective Dates, Status, Maker, Actions displayed. Same CRUD pattern as other maintenance entities. | P0 |

### FR-013: Add/Modify Asset Allocation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-066 | FR-013 | Happy Path | Create asset allocation config with all 6 risk categories | OPS_ADMIN logged in; risk appetite mapping with 6 categories exists | 1. Click Add. 2. For Conservative: add Equity=15%, Fixed Income=70%, Cash=15%. 3. For each of the remaining 5 categories: add asset class rows summing to 100%. 4. Enter expected_return_pct and standard_deviation_pct per line. 5. Save. | Config created with status=UNAUTHORIZED. 6 sets of AssetAllocationLine records. All allocations per category sum to 100%. | P0 |
| TC-RP-067 | FR-013 | Happy Path | Donut chart preview renders in real-time | OPS_ADMIN logged in; editing allocation percentages | 1. Adjust Equity from 15% to 25%. 2. Adjust Fixed Income from 70% to 60%. | Donut chart updates in real-time reflecting the new percentages. | P1 |
| TC-RP-068 | FR-013 | Negative | Allocation percentages do not sum to 100% | OPS_ADMIN logged in | 1. For Conservative category: Equity=20%, Fixed Income=60%, Cash=15% (total=95%). 2. Save. | Validation error: 'Allocation percentages for Conservative must sum to exactly 100%. Current total: 95%.' | P0 |
| TC-RP-069 | FR-013 | Negative | Missing allocation for one or more risk categories | OPS_ADMIN logged in | 1. Define allocations for only 4 out of 6 risk categories. 2. Save. | Validation error: 'All six risk categories must have an allocation defined.' | P0 |
| TC-RP-070 | FR-013 | Negative | Allocation percentage out of range | OPS_ADMIN logged in | 1. Enter allocation percentage = 110% for one asset class. 2. Save. | Validation error: 'Allocation percentage must be between 0 and 100.' | P1 |

### FR-014: Authorize Asset Allocation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-071 | FR-014 | Happy Path | Authorize asset allocation config | OPS_SUPERVISOR logged in; UNAUTHORIZED config by different user | 1. Open authorization queue. 2. Select asset allocation config. 3. Authorize. | Status=AUTHORIZED. Same workflow as FR-006 and FR-011. | P0 |
| TC-RP-072 | FR-014 | Negative | Four-eyes principle enforced for asset allocation | OPS_SUPERVISOR who created the config | 1. Attempt to authorize own config. | Authorization blocked. | P0 |

---

## 4. Customer Risk Assessment (FR-015 through FR-018)

### FR-015: Initiate Risk Profiling

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-073 | FR-015 | Happy Path | Initiate risk profiling for customer with no existing profile | RM logged in; customer exists with no active risk profile; authorized questionnaire exists for customer's category | 1. Search for customer by name/ID. 2. Click risk assessment icon. | 3-step wizard loads. Step indicator: Edit Profile -> Assess Risk (active) -> Transact. Navigates directly to Assess Risk step. | P0 |
| TC-RP-074 | FR-015 | Happy Path | Initiate risk profiling for customer with active non-expired profile | RM logged in; customer has active risk profile expiring in 6 months | 1. Search for customer. 2. Click risk assessment icon. | Current risk profile displayed with option to re-assess. RM can choose to proceed with re-assessment. | P0 |
| TC-RP-075 | FR-015 | Happy Path | Initiate risk profiling for customer with expired profile | RM logged in; customer's risk profile has expired (expiry_date < today) | 1. Search for customer. 2. Click risk assessment icon. | Navigates directly to Assess Risk step (same as no profile). Expired profile shown as reference. | P0 |
| TC-RP-076 | FR-015 | Negative | Customer search yields no results | RM logged in | 1. Search for non-existent customer ID. | 'No customer found' message displayed. Cannot proceed to wizard. | P1 |
| TC-RP-077 | FR-015 | Negative | Customer has not completed Edit Profile (Step 1) | RM logged in; customer exists but mandatory profile fields incomplete | 1. Search for customer. 2. Click risk assessment icon. | System redirects to Edit Profile step or shows error: 'Please complete Step 1 (Edit Profile) before proceeding to risk assessment.' | P0 |

### FR-016: Display Risk Questionnaire

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-078 | FR-016 | Happy Path | Display appropriate questionnaire based on customer category and date | RM logged in; customer category='Individual'; authorized questionnaire for 'Individual' type exists within current effective date range | 1. Initiate risk profiling for the customer. | Correct questionnaire loaded based on customer_category + questionnaire_type + current date within effective range. Three collapsible sections displayed (Part A, Part B, Part C). | P0 |
| TC-RP-079 | FR-016 | Happy Path | First section auto-expanded, others collapsed | RM logged in; questionnaire with 3 parts | 1. View questionnaire in wizard. | Part A auto-expanded. Part B and Part C collapsed. Clicking section header toggles expand/collapse. | P1 |
| TC-RP-080 | FR-016 | Happy Path | Single-select renders as radio buttons; multi-select as checkboxes | RM logged in; questionnaire has both single and multi-select questions | 1. View questionnaire. | Single-select questions display radio buttons (only one selectable). Multi-select questions display checkboxes (multiple selectable). | P0 |
| TC-RP-081 | FR-016 | Happy Path | Mandatory questions marked with asterisk | RM logged in; questionnaire with mandatory and optional questions | 1. View questionnaire. | Mandatory questions show * indicator. Optional questions do not. | P1 |
| TC-RP-082 | FR-016 | Happy Path | Warning/Acknowledgement/Disclaimer sections displayed | RM logged in; questionnaire has all three content sections configured | 1. Scroll to bottom of questionnaire. | Warning, Acknowledgement, and Disclaimer sections displayed with configured rich text content. | P1 |
| TC-RP-083 | FR-016 | Negative | No authorized questionnaire found for customer category and date | RM logged in; no questionnaire exists for customer_category='Non-Individual' within current date range | 1. Initiate risk profiling for Non-Individual customer. | Error displayed: 'No active questionnaire configuration found. Please contact Operations.' | P0 |
| TC-RP-084 | FR-016 | Negative | Submit without answering mandatory questions | RM logged in; questionnaire with mandatory questions | 1. Skip mandatory questions. 2. Click 'Confirm'. | Validation error highlighting unanswered mandatory questions. Submission blocked. | P0 |
| TC-RP-085 | FR-016 | Edge Case | Category='Both' questionnaire serves Individual customers | RM logged in; only 'Both' category questionnaire exists (no separate Individual) | 1. Initiate risk profiling for Individual customer. | 'Both' category questionnaire correctly loaded and served to Individual customer. | P1 |

### FR-017: Compute Risk Score

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-086 | FR-017 | Happy Path | Compute score for single-select scored questions | RM logged in; questionnaire submitted with 5 single-select questions, options selected with weightages: 3, 4, 2, 5, 4 | 1. Submit questionnaire responses. | Total score = 3+4+2+5+4 = 18. System looks up RiskAppetiteBand. If 16-20 = Moderately High, computed_risk_category = 'Moderately High', computed_risk_code = 4. | P0 |
| TC-RP-087 | FR-017 | Happy Path | Compute score with multi-select NONE scoring | RM logged in; multi-select question (scoring_type=NONE), customer selects options with weightages 1, 3, 4 | 1. Submit responses. | Score for that question = 1+3+4 = 8. Added to total with other question scores. | P0 |
| TC-RP-088 | FR-017 | Happy Path | Compute score with multi-select RANGE normalization | RM logged in; multi-select RANGE question, customer selects options with weightages 1, 2, 4 (raw sum = 7); normalization range 6-10 -> score 3 | 1. Submit responses. | Raw sum = 7. Lookup normalization range: 6-10 maps to normalized score 3. Question contributes 3 to total (not 7). | P0 |
| TC-RP-089 | FR-017 | Happy Path | Non-scored parts (Part A, Part B) recorded but not scored | RM logged in; questionnaire has Part A (Financial Profiling, non-scored) and Part C (SAF, scored) | 1. Complete all parts. 2. Submit. | Part A and Part B responses recorded in CustomerRiskResponse. Only Part C (scored) questions contribute to total_raw_score. | P0 |
| TC-RP-090 | FR-017 | Happy Path | Risk category correctly mapped from total score | RM logged in; total score = 8; mapping bands: 0-5=Conservative, 6-10=Low to Moderate | 1. Submit questionnaire. | Score 8 falls in band 6-10 (score_from=6 <= 8 < score_to=10). Computed category = 'Low to Moderate', code = 2. | P0 |
| TC-RP-091 | FR-017 | Negative | Total score outside all defined bands | RM logged in; total score = 35; max band ends at 30 | 1. Submit questionnaire. | Error: 'Score out of range -- contact Operations to update Risk Appetite Mapping.' Assessment cannot complete. | P0 |
| TC-RP-092 | FR-017 | Edge Case | Skipped non-mandatory question contributes 0 | RM logged in; optional question skipped | 1. Leave optional question unanswered. 2. Submit. | Skipped question contributes 0 to total score. It is included with score=0, NOT excluded from calculation. | P0 |
| TC-RP-093 | FR-017 | Edge Case | Score exactly at band boundary (inclusive-lower) | RM logged in; total score = 6; band 6-10 = Low to Moderate | 1. Submit questionnaire with computed score = 6. | Score 6 maps to 'Low to Moderate' (6 is >= score_from=6). | P0 |
| TC-RP-094 | FR-017 | Edge Case | Score exactly at band upper boundary (exclusive-upper, not last band) | RM logged in; total score = 10; band 6-10 = Low to Moderate, band 11-15 = Moderate | 1. Submit with score = 10. | Score 10: since band uses exclusive upper (score < 10 for 6-10 band), score 10 falls into the next band 11-15 = Moderate. Verify exact boundary semantics per BRD. | P0 |
| TC-RP-095 | FR-017 | Edge Case | Score exactly at last band upper boundary (inclusive) | RM logged in; total score = 30; last band 26-30 = Very Aggressive | 1. Submit with score = 30. | Score 30 maps to 'Very Aggressive'. Last band is inclusive on both ends. | P0 |
| TC-RP-096 | FR-017 | Edge Case | All questions scored as 0 | RM logged in; all answers selected have weightage=0 | 1. Submit questionnaire. | Total score = 0. Maps to lowest band (0-5 = Conservative, code=1). | P1 |

### FR-018: Display Recommended Risk Profile

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-097 | FR-018 | Happy Path | Display computed risk profile with all elements | RM logged in; risk assessment just completed with score=18, category=Moderately High | 1. View recommended risk profile screen. | Risk Score displayed prominently (18). Risk Category 'Moderately High' with color coding. Interactive donut chart showing model asset allocation. Expected Return % and Standard Deviation % displayed. Risk Profile Date = today. Expiry Date = today + valid_period_years. 'Continue' button available. | P0 |
| TC-RP-098 | FR-018 | Happy Path | Model asset allocation loaded from AssetAllocationConfig | RM logged in; risk category = 'Conservative'; config has Equity=15%, Fixed Income=70%, Cash=15% | 1. View recommended risk profile. | Donut chart shows 3 segments: Equity 15%, Fixed Income 70%, Cash 15%. Asset class labels visible. | P0 |
| TC-RP-099 | FR-018 | Happy Path | Expiry date computed correctly | RM logged in; questionnaire valid_period_years = 2; assessment date = 2026-04-22 | 1. View profile. | Expiry Date = 2028-04-22 (assessment_date + 2 years). | P0 |
| TC-RP-100 | FR-018 | Edge Case | No asset allocation config for computed risk category | RM logged in; risk category computed but no AssetAllocationConfig has lines for that category | 1. View recommended risk profile. | Warning or incomplete data displayed. Donut chart may show empty or placeholder. System should not crash. | P1 |

---

## 5. Risk Deviation Handling (FR-019, FR-020)

### FR-019: Risk Profile Deviation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-101 | FR-019 | Happy Path | Customer deviates from computed risk profile | RM logged in; risk deviation enabled for entity; computed category = 'Moderate' | 1. Dialog: 'Do you agree on your Risk Profile?' 2. Select 'No'. 3. Select alternative category = 'Aggressive' from dropdown. 4. Enter mandatory reason text. 5. Confirm. | CustomerRiskProfile updated: is_deviated=true, deviated_risk_category='Aggressive', deviation_reason stored. Deviation requires supervisor approval before activation. | P0 |
| TC-RP-102 | FR-019 | Happy Path | Customer agrees with computed risk profile (no deviation) | RM logged in; risk deviation enabled for entity | 1. Dialog: 'Do you agree on your Risk Profile?' 2. Select 'Yes'. | No deviation recorded. is_deviated=false. Proceed to next step. Profile pending supervisor approval. | P0 |
| TC-RP-103 | FR-019 | Happy Path | Deviation feature disabled for entity | RM logged in; entity config: risk_deviation_enabled=false (e.g., SBI) | 1. Complete risk assessment. | Deviation dialog is skipped entirely. is_deviated=false. Proceed directly to next step. | P0 |
| TC-RP-104 | FR-019 | Negative | Deviate without entering reason | RM logged in; customer selects 'No' for deviation | 1. Select 'No'. 2. Choose alternative category. 3. Leave reason blank. 4. Confirm. | Validation error: 'Deviation reason is required.' | P0 |
| TC-RP-105 | FR-019 | Negative | Deviate without selecting alternative category | RM logged in | 1. Select 'No'. 2. Do not select alternative category. 3. Confirm. | Validation error: 'Please select an alternative risk category.' | P0 |

### FR-020: Supervisor Risk Profile Approval

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-106 | FR-020 | Happy Path | Supervisor approves non-deviated risk profile | RM_SUPERVISOR logged in; pending risk profile (non-deviated) exists | 1. Navigate to Customer Onboarding dropdown. 2. Select pending risk profile. 3. View questionnaire responses, score, category. 4. Click 'Approve'. | CustomerRiskProfile.supervisor_approved = true. supervisor_id and supervisor_approved_at set. Previous active profile deactivated (is_active=false). New profile becomes is_active=true. Notification sent to RM. | P0 |
| TC-RP-107 | FR-020 | Happy Path | Supervisor approves deviated risk profile | RM_SUPERVISOR logged in; deviated profile pending approval | 1. View profile. Deviation highlighted with reason. 2. Click 'Approve' with comments. | Profile approved. effective_risk_category = deviated_risk_category. Client can transact. | P0 |
| TC-RP-108 | FR-020 | Happy Path | Supervisor rejects deviated risk profile | RM_SUPERVISOR logged in; deviated profile pending | 1. Click 'Reject'. 2. Enter rejection comments. | Deviation rejected. Profile reverts to COMPUTED state. Client must accept computed profile or re-assess. RM notified. | P0 |
| TC-RP-109 | FR-020 | Negative | Deviated profile cannot be used for transactions before approval | Client or RM attempts to transact; deviated profile not yet approved by supervisor | 1. Attempt to place order or create proposal. | System blocks: 'Risk profile pending supervisor approval. Cannot transact.' | P0 |
| TC-RP-110 | FR-020 | Edge Case | Previous active profile deactivated on new approval | Customer has active profile (assessment 2025). New assessment approved. | 1. Supervisor approves new risk profile. | Old profile: is_active=false. New profile: is_active=true. Only one active profile per customer at a time. | P0 |

---

## 6. Product Risk Deviation & Compliance (FR-021 through FR-023)

### FR-021: Product Rating Alert

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-111 | FR-021 | Happy Path | Product risk alert triggered when product risk > client risk | RM logged in; client effective_risk_code=3 (Moderate); product selected has risk_code=5 (Aggressive) | 1. Select the product in Product Selection screen. | Alert popup: 'ALERT! Selected product(s) has (have) Higher Risk than the Customer Risk Appetite as an Investor.' Table shows Product Name and Product Risk Class (5). Disclaimer about 1-6 scale. Buttons: Cancel, 'Confirm Notified to Customer'. | P0 |
| TC-RP-112 | FR-021 | Happy Path | Acknowledge deviation and proceed | RM logged in; product risk alert displayed | 1. Click 'Confirm Notified to Customer'. | Deviation recorded in ProductRiskDeviation table with deviation_acknowledged=true. Product added to selection. | P0 |
| TC-RP-113 | FR-021 | Happy Path | Cancel deviation and remove product | RM logged in; product risk alert displayed | 1. Click 'Cancel'. | Product removed from selection. No ProductRiskDeviation record created. | P0 |
| TC-RP-114 | FR-021 | Happy Path | No alert when product risk <= client risk | RM logged in; client risk_code=4; product risk_code=3 | 1. Select the product. | No alert popup. Product added normally. | P0 |
| TC-RP-115 | FR-021 | Happy Path | Alert triggered in Client Portal | CLIENT logged in; selecting product with risk_code > effective_risk_code | 1. Select high-risk product in Client Portal. | Same Product Rating Alert popup displayed. Deviation context recorded as 'CLIENT_PORTAL'. | P0 |
| TC-RP-116 | FR-021 | Edge Case | Product risk equals client risk (no alert) | Client risk_code=4; product risk_code=4 | 1. Select product. | No alert. Product risk is not greater than client risk. | P1 |
| TC-RP-117 | FR-021 | Edge Case | Multiple products trigger alert simultaneously | RM selects 3 products, 2 have risk_code > client risk_code | 1. Select all 3 products. | Alert shows table with 2 products that exceed client risk. Acknowledging covers both deviations. | P1 |

### FR-022: Risk Rating Filter

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-118 | FR-022 | Happy Path | Filter products by risk rating | RM logged in; product list with various risk ratings (1-6) | 1. Open Risk Rating dropdown. 2. Select 'Moderate' (code 3) and 'Low to Moderate' (code 2) checkboxes. | Products filtered to show only those with risk_code 2 or 3. Real-time filtering. | P1 |
| TC-RP-119 | FR-022 | Happy Path | Clear risk rating filter | RM logged in; filter applied showing risk codes 1-2 only | 1. Click 'Clear filter'. | All products displayed regardless of risk rating. | P1 |

### FR-023: Risk Profile Display Across Screens

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-120 | FR-023 | Happy Path | Product risk displayed as numeric badge 1-6 with color coding | RM logged in; products with various risk codes | 1. Navigate to Product Selection screen. 2. Observe risk badges. | Risk displayed as badge: 1-2=green, 3-4=amber, 5-6=red. Tooltip on hover: 'Risk Rating: {code}'. | P1 |
| TC-RP-121 | FR-023 | Happy Path | Consistent display across RM Office and Client Portal | Both RM and CLIENT logged in; viewing same products | 1. RM views Product Selection. 2. CLIENT views products in portal. | Same numeric risk code badges and color coding on both platforms. | P1 |

---

## 7. Investment Proposal Lifecycle (FR-024, FR-027, FR-029)

### FR-024: Create Investment Proposal

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-122 | FR-024 | Happy Path | Create a new investment proposal with model portfolio auto-suggestion | RM logged in; customer has active, non-expired, supervisor-approved risk profile (category=Moderate); asset allocation config exists | 1. Select client from customer search. 2. System loads risk profile and auto-suggests model portfolio for 'Moderate'. 3. Enter title, objective=GROWTH, time horizon=5 years, amount=5,000,000. 4. Customize allocations (adjust percentages, add products). 5. Validate allocations sum to 100%. 6. Click 'Save as Draft'. | Proposal created: proposal_number auto-generated (PROP-YYYYMMDD-XXXX), status=DRAFT. Suitability check runs and results stored. ProposalLineItem records created. | P0 |
| TC-RP-123 | FR-024 | Happy Path | Submit proposal for approval | RM logged in; DRAFT proposal exists with suitability_check_passed=true | 1. Open DRAFT proposal. 2. Click 'Submit'. | Status changes to SUBMITTED. L1 Supervisor notified via in-app + email. | P0 |
| TC-RP-124 | FR-024 | Negative | Create proposal for customer without active risk profile | RM logged in; customer has no active/non-expired risk profile | 1. Select client. 2. Attempt to create proposal. | Error: 'Client must have an active, non-expired risk profile. Please complete risk assessment first.' Proposal creation blocked. | P0 |
| TC-RP-125 | FR-024 | Negative | Create proposal for customer with unapproved profile | RM logged in; customer risk profile pending supervisor approval | 1. Select client. 2. Attempt to create proposal. | Error: 'Client risk profile pending supervisor approval. Cannot create proposal.' | P0 |
| TC-RP-126 | FR-024 | Negative | Allocation percentages do not sum to 100% | RM logged in; creating proposal | 1. Set Equity=40%, Fixed Income=30%, Cash=20% (total=90%). 2. Save. | Validation error: 'Allocation percentages must sum to 100%. Current total: 90%.' | P0 |
| TC-RP-127 | FR-024 | Negative | Concentration limit violated -- single asset class > 40% | RM logged in | 1. Set Equity=45%. 2. Save. | Validation warning: 'Concentration limit exceeded: max 40% in single asset class (Equity=45%).' | P0 |
| TC-RP-128 | FR-024 | Negative | Concentration limit violated -- single issuer > 10% | RM logged in | 1. Add product from same issuer with allocation > 10%. 2. Save. | Validation warning: 'Concentration limit exceeded: max 10% in single issuer.' | P1 |
| TC-RP-129 | FR-024 | Negative | Proposed amount <= 0 | RM logged in | 1. Enter proposed_amount = 0. 2. Save. | Validation error: 'Proposed amount must be greater than 0.' | P0 |
| TC-RP-130 | FR-024 | Negative | No asset class allocated | RM logged in | 1. Do not add any asset class rows. 2. Save. | Validation error: 'At least one asset class must be allocated.' | P0 |
| TC-RP-131 | FR-024 | Edge Case | Client risk profile expires between proposal creation and submission | RM creates DRAFT proposal. Client's risk profile expires before RM submits. | 1. Attempt to submit DRAFT proposal. | System should re-validate risk profile status. Error if expired: 'Client risk profile has expired. Please re-assess before submitting proposal.' | P1 |

### FR-027: Proposal Approval Workflow

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-132 | FR-027 | Happy Path | L1 Supervisor approves proposal | RM_SUPERVISOR logged in; SUBMITTED proposal exists | 1. Receive notification. 2. Open proposal. 3. Review details. 4. Click 'Approve'. 5. Enter comments. | Status = L1_APPROVED. ProposalApproval record: level=L1_SUPERVISOR, action=APPROVED, comments, timestamp. Compliance Officer notified. | P0 |
| TC-RP-133 | FR-027 | Happy Path | Compliance approves proposal | COMPLIANCE logged in; L1_APPROVED proposal exists | 1. Receive notification. 2. Open proposal. 3. Review suitability check results. 4. Click 'Approve'. | Status = COMPLIANCE_APPROVED, then auto-transitions to SENT_TO_CLIENT. PDF generated. Client notified via in-app + email + SMS. | P0 |
| TC-RP-134 | FR-027 | Happy Path | L1 Supervisor rejects proposal | RM_SUPERVISOR logged in; SUBMITTED proposal | 1. Click 'Reject'. 2. Enter rejection reason. | Status = L1_REJECTED (terminal). RM notified. ProposalApproval record created. | P0 |
| TC-RP-135 | FR-027 | Happy Path | L1 Supervisor returns proposal for revision | RM_SUPERVISOR logged in; SUBMITTED proposal | 1. Click 'Return for Revision'. 2. Enter revision comments. | Status reverts to DRAFT. RM notified with revision comments. RM can modify and resubmit. | P0 |
| TC-RP-136 | FR-027 | Happy Path | Compliance rejects proposal | COMPLIANCE logged in; L1_APPROVED proposal | 1. Click 'Reject'. 2. Enter reason. | Status = COMPLIANCE_REJECTED (terminal). RM and Supervisor notified. | P0 |
| TC-RP-137 | FR-027 | Happy Path | Compliance returns proposal for revision | COMPLIANCE logged in; L1_APPROVED proposal | 1. Click 'Return for Revision'. 2. Enter comments. | Status reverts to DRAFT. RM notified. Must go through full approval cycle again. | P0 |
| TC-RP-138 | FR-027 | Happy Path | SLA breach escalation after 24h | SUBMITTED proposal; 24+ hours without L1 action | 1. Wait 24 hours (or simulate via time manipulation). | Escalation notification sent to approver and escalation chain. 'Proposal {number} approval is overdue. Please take action.' | P1 |
| TC-RP-139 | FR-027 | Negative | RM cannot approve own proposal | RM logged in; RM is assigned as L1_SUPERVISOR for their own proposal | 1. Attempt to approve. | This scenario should not occur per role separation. If somehow accessed, system blocks: 'Cannot approve own proposal.' | P1 |
| TC-RP-140 | FR-027 | Edge Case | Approval history is immutable | Any user; proposal with approval history | 1. Attempt to modify or delete a ProposalApproval record via API. | Operation rejected. Approval records are append-only and immutable. | P0 |

### FR-029: Client Proposal View & Accept/Reject

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-141 | FR-029 | Happy Path | Client views SENT_TO_CLIENT proposals in portal | CLIENT logged in; 2 proposals with status SENT_TO_CLIENT exist | 1. Navigate to Proposals section in Client Portal. | Both proposals displayed with details: proposal number, title, amount, status, dates. | P0 |
| TC-RP-142 | FR-029 | Happy Path | Client views proposal detail with interactive charts | CLIENT logged in; opens proposal detail | 1. Click on a proposal. | Full portfolio detail: pie chart of asset allocation, product table (name, class, %, amount, risk code), expected return, std dev, Sharpe ratio, disclaimers. | P0 |
| TC-RP-143 | FR-029 | Happy Path | Client accepts proposal with acknowledgement and e-signature | CLIENT logged in; SENT_TO_CLIENT proposal | 1. Click 'Accept'. 2. Check digital acknowledgement checkbox. 3. Complete e-signature. 4. Confirm. | Status = CLIENT_ACCEPTED. client_accepted_at timestamp set. RM notified. Downstream order generation triggered. | P0 |
| TC-RP-144 | FR-029 | Happy Path | Client rejects proposal with mandatory reason | CLIENT logged in; SENT_TO_CLIENT proposal | 1. Click 'Reject'. 2. Enter rejection reason. 3. Confirm. | Status = CLIENT_REJECTED. client_rejected_at and client_rejection_reason set. RM notified with reason. | P0 |
| TC-RP-145 | FR-029 | Negative | Client rejects without providing reason | CLIENT logged in | 1. Click 'Reject'. 2. Leave reason blank. 3. Confirm. | Validation error: 'Rejection reason is required.' | P0 |
| TC-RP-146 | FR-029 | Happy Path | Client downloads proposal PDF | CLIENT logged in; SENT_TO_CLIENT proposal with PDF generated | 1. Click 'Download PDF'. | PDF file downloads. Contains bank logo, client details, risk summary, allocation charts, product table, disclaimers. | P1 |
| TC-RP-147 | FR-029 | Edge Case | Proposal expires after configurable period (30 days default) | SENT_TO_CLIENT proposal; 30+ days elapsed | 1. System auto-checks expiry. | Status auto-transitions to EXPIRED. Client can no longer accept. RM notified. | P0 |
| TC-RP-148 | FR-029 | Negative | Client attempts to accept EXPIRED proposal | CLIENT logged in; proposal status = EXPIRED | 1. Click 'Accept'. | Error: 'This proposal has expired. Please contact your RM for a new proposal.' | P0 |

---

## 8. Suitability Checks (FR-026)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-149 | FR-026 | Happy Path | All suitability checks pass | RM logged in; proposal where all products risk_code <= client risk_code; experience matches; concentration within limits | 1. Save proposal. | suitability_check_passed = true. suitability_check_details (JSONB) shows all 4 checks passed. No warnings. | P0 |
| TC-RP-150 | FR-026 | Happy Path | Product risk exceeds client risk (WARNING) | RM logged in; one product has risk_code 5, client risk_code = 3 | 1. Save proposal. | suitability_check_passed = true (with warnings). suitability_check_details shows Check 1 as WARNING for the product. Can submit with acknowledgement. | P0 |
| TC-RP-151 | FR-026 | Happy Path | Product type mismatch with investment experience | RM logged in; client Part B indicates no equity experience; proposal includes equity products | 1. Save proposal. | Check 2 flagged. Warning or blocker displayed depending on severity configuration. | P0 |
| TC-RP-152 | FR-026 | Negative | BLOCKER-level failure prevents submission | RM logged in; proposal has a critical suitability violation (e.g., discretionary mandate violation) | 1. Save proposal. 2. Attempt to submit. | Submit button disabled. BLOCKER-level failure message: specific violation details. Cannot proceed until resolved. | P0 |
| TC-RP-153 | FR-026 | Happy Path | WARNING-level allows submission with acknowledgement | RM logged in; proposal with WARNING-level findings only | 1. Save. 2. Review warnings. 3. Acknowledge warnings. 4. Submit. | Submission proceeds. Warnings logged in suitability_check_details. | P0 |
| TC-RP-154 | FR-026 | Happy Path | Concentration limit check (max 40% single asset class) | RM logged in; Equity allocation = 42% | 1. Save proposal. | Check 3 flagged: 'Concentration limit exceeded: Equity at 42% exceeds max 40%.' Severity depends on config. | P0 |
| TC-RP-155 | FR-026 | Happy Path | Suitability check results stored as JSONB | RM logged in; proposal saved with mixed check results | 1. Save proposal. 2. Query suitability_check_details. | JSONB contains structured data: array of check results, each with check_name, status (PASS/FAIL/WARNING), details, severity. | P1 |

---

## 9. What-If Analysis (FR-025)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-156 | FR-025 | Happy Path | Adjust allocation and see real-time metric recalculation | RM logged in; proposal builder open with model portfolio loaded | 1. Adjust Equity from 40% to 50% (reduce Fixed Income from 40% to 30%). 2. Observe metrics panel. | Expected Return %, Standard Deviation %, Sharpe Ratio, and Max Drawdown % recalculate in real-time. | P0 |
| TC-RP-157 | FR-025 | Happy Path | Visual bar chart comparing current vs model allocation | RM logged in; allocations adjusted from model | 1. Adjust allocations. 2. View comparison chart. | Bar chart shows side-by-side: current allocation vs model allocation per asset class. Differences visually apparent. | P1 |
| TC-RP-158 | FR-025 | Happy Path | Warning for significant drift from model portfolio (>15%) | RM logged in; model has Equity=30%; RM sets Equity=50% (20% drift) | 1. Adjust Equity to 50%. | Warning displayed: 'Equity allocation deviates >15% from model portfolio (Model: 30%, Current: 50%).' | P1 |
| TC-RP-159 | FR-025 | Happy Path | Reset to Model restores original allocation | RM logged in; allocations modified from model | 1. Click 'Reset to Model'. | All sliders/inputs revert to model portfolio percentages. Metrics recalculate to model values. | P1 |
| TC-RP-160 | FR-025 | Happy Path | Sharpe Ratio computation | RM logged in; expected return=12%, risk-free rate=6.5% (INR entity default), std dev=15% | 1. Observe Sharpe Ratio. | Sharpe Ratio = (12 - 6.5) / 15 = 0.37. Displayed in metrics panel. | P0 |
| TC-RP-161 | FR-025 | Edge Case | Std deviation = 0 (Sharpe ratio undefined) | RM logged in; all allocation in Cash/Money Market (std dev ~ 0) | 1. Set 100% Cash. 2. Observe Sharpe Ratio. | System handles division by zero gracefully. Sharpe Ratio shown as 'N/A' or infinity symbol. | P1 |

---

## 10. Supervisor Dashboard (FR-032)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-162 | FR-032 | Happy Path | Level 1 bar chart displays 5 lead status categories | RM_SUPERVISOR logged in; active campaign leads exist for supervised RMs | 1. Navigate to Supervisor Dashboard. 2. View Leads Widget. | Bar chart with 5 color-coded bars: In Progress (yellow), New (blue), Client Rejected (red), Ready for Follow-up (teal), Client Accepted (pink). | P0 |
| TC-RP-163 | FR-032 | Happy Path | Drill down to Level 2 detail table | RM_SUPERVISOR logged in; leads widget visible | 1. Click drill-down icon (3 dots) on Level 1 chart. | Level 2 table: RM Name, Total Leads, Client Accepted, Client Rejected, In Progress, Ready for Follow-up, New. Sorted by Client Accepted ascending. | P0 |
| TC-RP-164 | FR-032 | Happy Path | Level 2 sorting with tie-breakers | RM_SUPERVISOR logged in; multiple RMs with same Client Accepted count | 1. View Level 2 table. | Primary sort: Client Accepted ascending. Tie-breakers cascade: In Progress, Ready for Follow-up, New, Client Rejected. | P1 |
| TC-RP-165 | FR-032 | Happy Path | Search Level 2 by RM name | RM_SUPERVISOR logged in; Level 2 table open | 1. Enter RM name in search bar. | Table filters to show only matching RM(s). | P1 |
| TC-RP-166 | FR-032 | Negative | Supervisor sees only own reporting hierarchy | RM_SUPERVISOR-A logged in; RM-1 and RM-2 report to Supervisor-A; RM-3 reports to Supervisor-B | 1. View leads widget. | Only leads for RM-1 and RM-2 displayed. RM-3's data not visible. | P0 |
| TC-RP-167 | FR-032 | Negative | Only active campaign leads included | Campaign C1=Active, C2=Closed; leads exist for both | 1. View leads widget. | Only leads from campaign C1 (Active) counted. C2 (Closed) leads excluded. | P0 |

---

## 11. Reporting (FR-033 through FR-037)

### FR-033: Risk Profiling Completion Report

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-168 | FR-033 | Happy Path | Generate risk profiling completion report | COMPLIANCE logged in; risk profiles exist across RMs and branches | 1. Navigate to Reports. 2. Select Risk Profiling Completion Report. 3. Set filters: Date range, RM, Branch, Entity. 4. Generate. | Report shows: RM Name, Total Clients, Profiled, Pending, Expired, Completion %. Profiled = active non-expired. Expired = past expiry. | P1 |
| TC-RP-169 | FR-033 | Happy Path | Export to CSV/Excel | COMPLIANCE logged in; report generated | 1. Click 'Export to CSV'. | CSV file downloads with all report data. Columns match on-screen display. | P1 |
| TC-RP-170 | FR-033 | Happy Path | Drill-down to individual client list | COMPLIANCE logged in; report shows RM with 50 profiled clients | 1. Click on RM row to drill down. | Detail view shows individual clients: name, profile date, expiry date, risk category, status. | P2 |

### FR-034: Transaction by Product Rating Report

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-171 | FR-034 | Happy Path | Generate transaction by product rating report | COMPLIANCE logged in; transactions with product ratings exist | 1. Select date range and filters. 2. Generate. | Columns: Primary RM Name, RM Employee ID, Account Name, Client Risk Profile, Product Rating (1-6), Product Name. Mismatches (product > client risk) highlighted. | P1 |
| TC-RP-172 | FR-034 | Happy Path | Filter by Product Rating | COMPLIANCE logged in; report generated | 1. Filter by Product Rating = 5. | Only transactions involving products with risk code 5 shown. | P1 |

### FR-035: Product Risk Mismatch Report

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-173 | FR-035 | Happy Path | Generate risk mismatch report | COMPLIANCE logged in; ProductRiskDeviation records exist | 1. Generate risk mismatch report. | Pre-filtered to show only mismatches. Columns include Deviation Acknowledged (Yes/No), Acknowledged Date. Summary stats: total mismatches, acknowledged %, unacknowledged count. | P1 |
| TC-RP-174 | FR-035 | Happy Path | Summary statistics accurate | COMPLIANCE logged in; 20 deviations, 15 acknowledged | 1. View summary statistics. | Total mismatches = 20. Acknowledged % = 75%. Unacknowledged = 5. | P1 |

### FR-036: Proposal Pipeline Dashboard

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-175 | FR-036 | Happy Path | View proposal pipeline funnel chart | RM_SUPERVISOR logged in; proposals in various statuses | 1. Navigate to Proposal Pipeline Dashboard. | Funnel chart: DRAFT -> SUBMITTED -> L1_APPROVED -> COMPLIANCE_APPROVED -> SENT_TO_CLIENT -> ACCEPTED. Cards: Total proposals, Avg time-to-accept, Conversion rate, Proposals pending approval. | P1 |
| TC-RP-176 | FR-036 | Happy Path | Conversion rate calculation | RM_SUPERVISOR logged in; 10 SENT_TO_CLIENT, 7 CLIENT_ACCEPTED | 1. View conversion rate card. | Conversion rate = 7/10 * 100 = 70%. | P1 |

### FR-037: Risk Distribution Analytics

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-177 | FR-037 | Happy Path | View risk category distribution pie chart | COMPLIANCE logged in; clients with various risk categories | 1. Navigate to Risk Distribution Analytics. | Pie chart: % of clients per risk category (Conservative, Low to Moderate, Moderate, etc.). | P1 |
| TC-RP-178 | FR-037 | Happy Path | Bar chart by branch/entity | COMPLIANCE logged in; multi-branch data | 1. View bar chart. | Risk category distribution broken down by branch/entity. | P2 |
| TC-RP-179 | FR-037 | Happy Path | Trend line over time | COMPLIANCE logged in | 1. Select date range. 2. View trend line. | Trend shows risk category changes over time. Based on effective_risk_category from active CustomerRiskProfile records. | P2 |

---

## 12. PDF Generation (FR-028)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-180 | FR-028 | Happy Path | Generate proposal PDF with all required elements | RM logged in; COMPLIANCE_APPROVED proposal | 1. Download PDF or system auto-generates on compliance approval. | PDF contains: bank logo, RM contact details, client name/ID, risk profile summary, proposed asset allocation (pie chart), product details table, projected performance (bar chart), disclaimers. | P0 |
| TC-RP-181 | FR-028 | Happy Path | Entity-specific PDF template | Two entities with different branding; proposals for each | 1. Generate PDFs for both entities. | Each PDF uses entity-specific template: correct logo, branding colors, disclaimers, jurisdiction-specific content. | P1 |
| TC-RP-182 | FR-028 | Happy Path | PDF downloadable from RM Office | RM logged in; proposal with PDF generated | 1. Open proposal. 2. Click 'Download PDF'. | PDF downloads successfully from RM Office. | P0 |
| TC-RP-183 | FR-028 | Happy Path | PDF downloadable from Client Portal | CLIENT logged in; SENT_TO_CLIENT proposal | 1. Open proposal. 2. Click 'Download PDF'. | PDF downloads successfully from Client Portal. Same content as RM Office version. | P0 |
| TC-RP-184 | FR-028 | Happy Path | PDF regenerated on proposal modification | RM logged in; DRAFT proposal with existing PDF | 1. Modify proposal (change allocations). 2. Save. | New PDF generated replacing previous version. Old PDF archived. | P1 |
| TC-RP-185 | FR-028 | Edge Case | PDF generation performance within SLA | Large proposal with 20+ line items | 1. Generate PDF. | PDF generated within 5 seconds (NFR requirement). | P1 |

---

## 13. Client Portal (FR-029, FR-031)

### Client Risk Profile View

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-186 | FR-029 | Happy Path | Client views own risk profile in portal | CLIENT logged in; active risk profile exists | 1. Navigate to Risk Profile section. | Client sees: risk score, risk category, asset allocation chart, expiry date. Read-only view. | P0 |
| TC-RP-187 | FR-029 | Negative | Client cannot view other clients' profiles | CLIENT-A logged in | 1. Attempt to access CLIENT-B's risk profile via API manipulation. | Access denied (HTTP 403). Clients can only view own data. | P0 |

### FR-031: Proposal Comparison

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-188 | FR-031 | Happy Path | Compare 2 proposals side-by-side | CLIENT logged in; 2 SENT_TO_CLIENT proposals exist | 1. Select 2 proposals. 2. Click 'Compare'. | Side-by-side view: asset allocation, expected return, risk metrics, product list. Visual chart overlay. Differences highlighted. | P1 |
| TC-RP-189 | FR-031 | Happy Path | Compare 3 proposals | CLIENT logged in; 3 SENT_TO_CLIENT proposals | 1. Select 3 proposals. 2. Compare. | Three-column comparison displayed. | P2 |
| TC-RP-190 | FR-031 | Negative | Cannot compare proposals not in SENT_TO_CLIENT status | CLIENT logged in; one proposal is EXPIRED | 1. Attempt to select EXPIRED proposal for comparison. | EXPIRED proposal not selectable. Only SENT_TO_CLIENT proposals can be compared. | P1 |
| TC-RP-191 | FR-031 | Negative | Cannot select more than 3 proposals | CLIENT logged in; 5 SENT_TO_CLIENT proposals | 1. Select 4 proposals. | System limits selection to 3. Error or disabled checkbox after 3rd selection. | P2 |

---

## 14. Optimistic Locking / Concurrency Control (Section 7.2.1)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-192 | 7.2.1 | Happy Path | Successful update with correct version | OPS_ADMIN logged in; questionnaire at version 3 | 1. Load questionnaire (version=3). 2. Modify fields. 3. PUT request with version=3 in body. | Update succeeds. Version incremented to 4. | P0 |
| TC-RP-193 | 7.2.1 | Negative | Version conflict on concurrent edit | User-A and User-B both load questionnaire at version 3. User-A saves first (version becomes 4). | 1. User-B attempts PUT with version=3 (stale). | HTTP 409 Conflict. Response: { "error": { "code": "VERSION_CONFLICT", "message": "Record was modified by another user", "current_version": 4, "current_record": {...} } }. | P0 |
| TC-RP-194 | 7.2.1 | Happy Path | UI handles 409 gracefully | User sees version conflict response | 1. UI receives 409. | Notification: 'This record was modified by another user. Please review the changes.' Record reloaded with current data. Changed fields highlighted. User must manually re-apply changes. | P0 |
| TC-RP-195 | 7.2.1 | Happy Path | Optimistic locking on RiskAppetiteMapping | OPS_ADMIN updates mapping with stale version | 1. Load mapping (v2). 2. Another user modifies (v3). 3. First user submits with version=2. | HTTP 409 Conflict returned. | P0 |
| TC-RP-196 | 7.2.1 | Happy Path | Optimistic locking on AssetAllocationConfig | Same pattern as TC-RP-195 for AssetAllocationConfig | Same steps. | HTTP 409 with current version and record. | P0 |
| TC-RP-197 | 7.2.1 | Happy Path | Optimistic locking on InvestmentProposal | RM-A and RM-B edit same proposal concurrently | 1. Both load version 1. 2. RM-A saves (v2). 3. RM-B saves with version=1. | HTTP 409 for RM-B. | P0 |
| TC-RP-198 | 7.2.1 | Happy Path | Authorization validates version | OPS_SUPERVISOR opens record for review (v5). Maker modifies (v6) before supervisor acts. | 1. Supervisor clicks 'Authorize'. | System validates version. If version changed since supervisor opened, return 409. Supervisor must re-review. | P0 |
| TC-RP-199 | 7.2.1 | Edge Case | Read during authorization is non-blocking | OPS_SUPERVISOR opens record for review. No lock acquired. | 1. Multiple supervisors open same record. 2. Both read simultaneously. | Both can read. No blocking. Only the Authorize/Reject action validates version. | P1 |

---

## 15. Cascading Config Validation (FR-040)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-200 | FR-040 | Happy Path | Warning on RiskAppetiteMapping authorization when AssetAllocation missing for a category | OPS_SUPERVISOR authorizing mapping with 6 categories; AssetAllocationConfig exists for only 5 categories (missing 'Very Aggressive') | 1. Authorize mapping. | Warning (non-blocking): 'Asset Allocation not yet configured for category: Very Aggressive. Risk profiling will work but Recommended Risk Profile screen will show incomplete data.' Authorization proceeds. | P0 |
| TC-RP-201 | FR-040 | Happy Path | Warning on AssetAllocationConfig authorization for unmatched categories | OPS_SUPERVISOR authorizing allocation config; config has lines for 'Ultra Aggressive' category not in active mapping | 1. Authorize allocation config. | Warning: 'Category Ultra Aggressive not found in active Risk Appetite Mapping.' Authorization proceeds (advisory). | P1 |
| TC-RP-202 | FR-040 | Negative | Blocker on questionnaire authorization when mandatory question has no options | OPS_SUPERVISOR authorizing questionnaire; Question 3 (is_mandatory=true) has 0 answer options | 1. Attempt to authorize. | BLOCKER: 'Mandatory question "Question 3" has no answer options defined. Authorization cannot proceed.' Authorization blocked. | P0 |
| TC-RP-203 | FR-040 | Happy Path | All validations pass -- clean authorization | OPS_SUPERVISOR authorizing mapping; all categories have corresponding allocations; all mandatory questions have options | 1. Authorize. | No warnings. Authorization succeeds cleanly. | P0 |
| TC-RP-204 | FR-040 | Edge Case | Multiple warnings on single authorization | OPS_SUPERVISOR authorizing mapping with 3 categories missing allocations | 1. Authorize. | Multiple warnings displayed: one per missing category. Supervisor can review all and still proceed. | P1 |

---

## 16. Compliance Escalation for Repeat Deviations (FR-038)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-205 | FR-038 | Happy Path | Auto-escalation triggered when threshold exceeded | Customer has 4 product risk deviations in last 30 days; threshold = 5 deviations in 30 days | 1. Customer transacts in 5th higher-risk product. 2. ProductRiskDeviation record created. | 5th deviation triggers threshold check. ComplianceEscalation created: status=OPEN, deviation_count=5, deviation_ids array, window dates. Compliance Officer notified. | P0 |
| TC-RP-206 | FR-038 | Happy Path | Compliance Officer acknowledges escalation | COMPLIANCE logged in; OPEN escalation exists | 1. View escalation notification. 2. Click 'Acknowledge'. 3. Add notes. | Escalation status = ACKNOWLEDGED. Notes stored. | P0 |
| TC-RP-207 | FR-038 | Happy Path | Compliance Officer flags for review | COMPLIANCE logged in; OPEN escalation | 1. Select 'Flag for Review'. | resolution_action = FLAGGED_FOR_REVIEW. Triggers RM meeting. | P0 |
| TC-RP-208 | FR-038 | Happy Path | Compliance Officer restricts client | COMPLIANCE logged in; escalation with severe pattern | 1. Select 'Restrict'. | resolution_action = CLIENT_RESTRICTED. Client temporarily blocked from further high-risk product transactions. | P0 |
| TC-RP-209 | FR-038 | Happy Path | Resolve escalation | COMPLIANCE logged in; ACKNOWLEDGED escalation | 1. Add resolution notes. 2. Mark as Resolved. | status = RESOLVED. resolved_at timestamp set. | P1 |
| TC-RP-210 | FR-038 | Negative | Below threshold does not trigger escalation | Customer has 3 deviations in 30 days; threshold = 5 | 1. Customer transacts in 4th higher-risk product (4 total). | No ComplianceEscalation created. 4 < 5 threshold. | P0 |
| TC-RP-211 | FR-038 | Edge Case | Rolling window check (not calendar-based) | Customer had 5 deviations: 3 from 35 days ago (outside window) + 2 recent | 1. Customer makes new deviation (3 within window). | Window is rolling 30 days. Only deviations in last 30 days count (2 + 1 = 3). Below threshold. No escalation. | P0 |
| TC-RP-212 | FR-038 | Edge Case | Configurable threshold per entity | Entity-A threshold = 3 deviations/30 days; Entity-B threshold = 5 deviations/30 days | 1. Customer in Entity-A gets 3 deviations. | Escalation triggered for Entity-A at 3. Same count in Entity-B would not trigger. | P1 |

---

## 17. Audit Trail (FR-039)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-213 | FR-039 | Happy Path | Audit log created on risk profiling initiation | RM logged in; initiates risk profiling for customer | 1. RM clicks risk assessment icon for a customer. | RiskProfilingAuditLog entry created: session_id, customer_id, initiated_by=RM user_id, initiated_at=now, device_type, user_agent, IP address, entity_id. | P0 |
| TC-RP-214 | FR-039 | Happy Path | Audit log updated on completion | RM logged in; assessment completed | 1. RM submits questionnaire. 2. Risk profile computed and saved. | Log updated: completed_at timestamp, duration_seconds computed, outcome=COMPLETED, risk_profile_id linked. | P0 |
| TC-RP-215 | FR-039 | Happy Path | Audit log records ABANDONED outcome | RM logged in; starts assessment but navigates away without completing | 1. RM initiates profiling. 2. Navigates away or closes browser. | Log entry: outcome=ABANDONED. completed_at set (or null depending on implementation). duration_seconds if determinable. | P0 |
| TC-RP-216 | FR-039 | Happy Path | Client self-service audit log | CLIENT logged in; completes self-service risk profiling | 1. Client initiates and completes risk profiling. | Log: initiated_by = client_id. All other fields populated. | P1 |
| TC-RP-217 | FR-039 | Negative | Audit logs are immutable -- no UPDATE/DELETE | Any user; attempt to modify audit log via API | 1. Send PUT/DELETE request to audit log endpoint. | Operation rejected. Audit logs are write-only. HTTP 405 Method Not Allowed. | P0 |
| TC-RP-218 | FR-039 | Negative | Only Compliance and Audit roles can read audit logs | RM logged in | 1. Attempt to access /api/audit/risk-profiling endpoint. | Access denied (HTTP 403). Only COMPLIANCE and AUDIT roles have read access. | P0 |
| TC-RP-219 | FR-039 | Happy Path | Audit log captures device metadata | RM on desktop; Client on mobile | 1. RM initiates assessment from desktop Chrome. 2. Client initiates from mobile Safari. | RM log: device_type=desktop, user_agent=Chrome/..., ip_address set. Client log: device_type=mobile, user_agent=Safari/..., ip_address set. | P1 |
| TC-RP-220 | FR-039 | Edge Case | ERROR outcome recorded | System error during risk score computation | 1. Assessment starts. 2. Score computation fails (e.g., missing normalization range). | Log updated: outcome=ERROR. Session recorded for debugging. | P1 |

---

## 18. Notifications (Section 10)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-221 | S10 | Happy Path | Questionnaire authorized notification sent to maker | OPS_SUPERVISOR authorizes questionnaire made by OPS_ADMIN | 1. Authorize questionnaire. | In-app + email notification to maker: 'Your questionnaire {name} has been authorized by {checker_name}.' | P1 |
| TC-RP-222 | S10 | Happy Path | Questionnaire rejected notification sent to maker | OPS_SUPERVISOR rejects questionnaire | 1. Reject with reason. | In-app + email: 'Your questionnaire {name} has been rejected. Reason: {reason}.' | P1 |
| TC-RP-223 | S10 | Happy Path | Risk profile pending approval notification to supervisor | RM submits customer risk profile | 1. Submit risk profile. | In-app notification to RM_SUPERVISOR: 'Risk profile for customer {name} (ID: {id}) is pending your approval.' | P0 |
| TC-RP-224 | S10 | Happy Path | Risk profile approved notification to RM | RM_SUPERVISOR approves risk profile | 1. Approve profile. | In-app + email to RM: 'Risk profile for {customer_name} has been approved.' | P1 |
| TC-RP-225 | S10 | Happy Path | Risk profile expiring notification (30 days before) | Customer risk profile expiry_date = today + 30 days | 1. System daily job runs. | In-app + email to RM: 'Risk profile for {customer_name} expires on {date}. Please schedule re-assessment.' | P1 |
| TC-RP-226 | S10 | Happy Path | Proposal pending L1 approval notification | RM submits proposal | 1. Submit proposal. | In-app + email to RM_SUPERVISOR: 'Proposal {number} for {customer} is pending your review.' | P0 |
| TC-RP-227 | S10 | Happy Path | Proposal pending compliance notification | L1 approves proposal | 1. L1 approve. | In-app + email to COMPLIANCE: 'Proposal {number} requires compliance review.' | P0 |
| TC-RP-228 | S10 | Happy Path | Proposal sent to client notification | Compliance approves proposal | 1. Compliance approve. | In-app + email + SMS to CLIENT: 'A new investment proposal is available in your portal. Please review.' | P0 |
| TC-RP-229 | S10 | Happy Path | Proposal accepted notification to RM | Client accepts proposal | 1. Client clicks Accept. | In-app + email to RM: 'Client {name} has accepted proposal {number}.' | P1 |
| TC-RP-230 | S10 | Happy Path | Proposal rejected notification to RM | Client rejects proposal | 1. Client clicks Reject with reason. | In-app + email to RM: 'Client {name} has rejected proposal {number}. Reason: {reason}.' | P1 |
| TC-RP-231 | S10 | Happy Path | Approval SLA breach escalation (24h) | Proposal SUBMITTED > 24h without L1 action | 1. SLA timer expires. | In-app + email to approver + escalation: 'Proposal {number} approval is overdue. Please take action.' | P1 |
| TC-RP-232 | S10 | Edge Case | User opted out of email notifications | RM has disabled email notifications in Settings | 1. Trigger notification event for the RM. | In-app notification delivered. Email NOT sent (user opted out). In-app cannot be disabled. | P1 |
| TC-RP-233 | S10 | Edge Case | SMS requires client opt-in | Client has NOT opted in to SMS | 1. Compliance approves proposal (triggers client notification). | In-app + email sent. SMS NOT sent (no opt-in). | P1 |
| TC-RP-234 | S10 | Happy Path | Product risk deviation logged for compliance batch | RM confirms product deviation via alert popup | 1. Click 'Confirm Notified to Customer'. | ProductRiskDeviation record logged. No real-time notification. Logged for batch compliance reporting. | P1 |

---

## 19. Model Portfolio Management (FR-030)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-235 | FR-030 | Happy Path | Create model portfolio | OPS_ADMIN logged in | 1. Create model portfolio: name='Conservative Income Model', risk_category='Conservative', benchmark='CRISIL Composite Bond', rebalance_frequency=QUARTERLY, drift_threshold=3%. 2. Add line items: asset classes with target allocations and product lists. 3. Save. | Model portfolio created with status=UNAUTHORIZED. Requires authorization. | P1 |
| TC-RP-236 | FR-030 | Happy Path | Drift alert when allocation deviates beyond threshold | Model portfolio with drift_threshold=5%; actual equity = 28% vs target 20% (8% drift) | 1. System detects drift > threshold. | Alert generated: 'Portfolio drift detected: Equity at 28% vs target 20% (8% drift, threshold 5%).' Rebalancing recommended. | P1 |
| TC-RP-237 | FR-030 | Happy Path | Bulk proposal refresh when model changes | OPS_ADMIN modifies authorized model portfolio; 3 DRAFT proposals use this model | 1. Model portfolio updated and re-authorized. | All 3 DRAFT proposals flagged for RM review: 'Model portfolio has been updated. Please review your proposal.' | P1 |
| TC-RP-238 | FR-030 | Negative | Active proposals using old model flagged for review | Model changed; 2 proposals in SUBMITTED status | 1. Model authorized. | SUBMITTED proposals flagged for RM review but not automatically modified (since they are in approval workflow). | P1 |

---

## 20. Data Archival (FR-042)

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-239 | FR-042 | Happy Path | Monthly archival job moves old records | CustomerRiskResponse and RiskProfilingAuditLog records older than 7 years exist | 1. Archival job runs (monthly). | Records older than 7 years moved to archive schema. Source records removed. Archive schema mirrors source. | P2 |
| TC-RP-240 | FR-042 | Happy Path | Archived records remain queryable | Records archived to cold storage | 1. Query archive API endpoint. | Archived records returned (read-only, slower SLA acceptable). | P2 |
| TC-RP-241 | FR-042 | Negative | Active risk profiles never archived regardless of age | CustomerRiskProfile with is_active=true, created 8 years ago | 1. Archival job runs. | Active profile NOT archived. Rule: 'Active profiles are NEVER archived regardless of age.' | P0 |
| TC-RP-242 | FR-042 | Happy Path | Archival logged in system audit trail | Archival job completes | 1. Check audit trail. | Audit entry: number of records archived, source tables, timestamp, outcome. | P2 |

---

## 21. API Error Handling & Security

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-RP-243 | S7.2 | Happy Path | Standardized error response format | Any user; invalid API request | 1. Send POST to create questionnaire with missing required field. | HTTP 400. Response: { "error": { "code": "VALIDATION_ERROR", "message": "Questionnaire name is required", "field": "questionnaire_name", "details": [] } }. | P0 |
| TC-RP-244 | S7.1 | Negative | Unauthenticated request | No JWT cookie; request to protected endpoint | 1. Send GET /api/back-office/risk-profiling/questionnaires without auth. | HTTP 401 Unauthorized. | P0 |
| TC-RP-245 | S7.1 | Negative | Unauthorized role accessing restricted endpoint | RM role; request to /api/back-office/risk-profiling/questionnaires (POST) | 1. RM attempts to create questionnaire. | HTTP 403 Forbidden. | P0 |
| TC-RP-246 | S7.2 | Negative | Resource not found | Any user; request for non-existent questionnaire ID | 1. GET /api/back-office/risk-profiling/questionnaires/{non-existent-uuid}. | HTTP 404 Not Found. | P1 |
| TC-RP-247 | S7.2 | Negative | Duplicate resource conflict | OPS_ADMIN; create questionnaire with duplicate category/type/date | 1. POST questionnaire duplicating existing config. | HTTP 409 Conflict. Error code: 'DUPLICATE_ENTITY' or 'VALIDATION_ERROR' with details. | P0 |

---

## Summary by Category

| Category | Count |
|----------|-------|
| Questionnaire CRUD + Maker-Checker (FR-001 to FR-008) | 54 |
| Risk Appetite Mapping CRUD + Maker-Checker (FR-009 to FR-011) | 10 |
| Asset Allocation Config CRUD + Maker-Checker (FR-012 to FR-014) | 8 |
| Customer Risk Assessment (FR-015 to FR-018) | 28 |
| Risk Deviation Handling (FR-019, FR-020) | 10 |
| Product Risk Deviation & Compliance (FR-021 to FR-023) | 11 |
| Investment Proposal Lifecycle (FR-024, FR-027, FR-029) | 27 |
| Suitability Checks (FR-026) | 7 |
| What-If Analysis (FR-025) | 6 |
| Supervisor Dashboard (FR-032) | 6 |
| Reporting (FR-033 to FR-037) | 12 |
| PDF Generation (FR-028) | 6 |
| Client Portal (FR-029, FR-031) | 6 |
| Optimistic Locking (S7.2.1) | 8 |
| Cascading Config Validation (FR-040) | 5 |
| Compliance Escalation (FR-038) | 8 |
| Audit Trail (FR-039) | 8 |
| Notifications (S10) | 14 |
| Model Portfolio Management (FR-030) | 4 |
| Data Archival (FR-042) | 4 |
| API Error Handling & Security (S7) | 5 |
| **Total** | **247** |

## Priority Distribution

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 119 | Critical -- Must pass for release. Core functionality, data integrity, security, authorization. |
| P1 | 98 | Important -- Should pass. UX, notifications, reporting, edge cases with business impact. |
| P2 | 30 | Nice-to-have -- Lower risk. Cosmetic, archival, advanced analytics, boundary values. |
