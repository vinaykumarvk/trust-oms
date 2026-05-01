# BRD: Trust Account Enrichment Module
**Date:** 2026-05-01
**Gaps:** MB-GAP-006, MB-GAP-007, MB-GAP-008, MB-GAP-009

## 1. Overview

Enrich the existing trust account infrastructure to meet Metrobank Annex A workbook requirements for account build-up metadata, joint accounts, special instructions, and account lifecycle management (dormancy, hold-out, garnishment, closure validation).

## 2. Data Model Changes

### 2.1 trust_accounts — New Columns (MB-GAP-006)

| Column | Type | Description |
|--------|------|-------------|
| sales_officer_id | integer FK users.id | Sales officer who sourced the account |
| account_officer_id | integer FK users.id | Account officer responsible |
| portfolio_manager_id | integer FK users.id | Portfolio manager assigned |
| referring_unit | text | Referring unit/branch/department |
| tbg_division | text | TBG division code |
| sa_no | text | Settlement account number |
| sa_name | text | Settlement account name |
| mailing_instructions | jsonb | Mailing address and delivery preferences |
| statement_frequency | text | MONTHLY/QUARTERLY/SEMI_ANNUAL/ANNUAL/ON_DEMAND |
| amla_type | text | AMLA classification (LOW/NORMAL/HIGH/PEP) |
| discretion_flag | boolean | Whether account is discretionary |
| tax_status | text | Tax classification (TAXABLE/TAX_EXEMPT/REDUCED_RATE) |
| escrow_contract_expiry | date | Escrow contract expiry date |
| joint_account_type | text | SOLE/JOINT_AND/JOINT_OR (MB-GAP-007) |
| max_joint_holders | integer | Maximum number of joint holders |

### 2.2 New Table: trust_special_instructions (MB-GAP-008)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| trust_account_id | text FK | References trust_accounts |
| instruction_type | text | BIRTHDAY/ANNIVERSARY/ESCROW_EXPIRY/MATURITY/RECURRING/ONE_TIME/CUSTOM |
| title | text | Short instruction title |
| description | text | Full instruction text |
| trigger_date | date | Date the instruction triggers |
| recurrence_rule | text | NONE/ANNUAL/MONTHLY/QUARTERLY |
| next_trigger_date | date | Next computed trigger date |
| is_active | boolean | Whether instruction is active |
| notified_at | timestamp | Last notification sent |
| assigned_to | integer FK users.id | User to notify |
| ...auditFields | | |

### 2.3 New Table: trust_account_status_history (MB-GAP-009)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| trust_account_id | text FK | References trust_accounts |
| previous_status | text | Status before change |
| new_status | text | Status after change |
| change_reason | text | Reason for status change |
| changed_by | integer FK users.id | User who made change |
| effective_date | date | When change takes effect |
| approval_required | boolean | Whether change needed approval |
| approved_by | integer FK users.id | Approver if required |
| approved_at | timestamp | When approved |
| ...auditFields | | |

### 2.4 New Table: trust_hold_history (MB-GAP-009)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| hold_id | text FK | References account_holds |
| trust_account_id | text FK | References trust_accounts |
| action | text | PLACED/MODIFIED/LIFTED/EXPIRED |
| previous_state | jsonb | Snapshot before change |
| change_reason | text | |
| changed_by | integer FK users.id | |
| approved_by | integer FK users.id | For lifting |
| approved_at | timestamp | |
| ...auditFields | | |

## 3. Functional Requirements

### FR-TAE-001: Account Metadata (MB-GAP-006)
Accept and store all enrichment fields during trust account creation and update.

### FR-TAE-002: Joint Account Setup (MB-GAP-007)
Support SOLE/JOINT_AND/JOINT_OR account types with configurable max holders and relationship classification.

### FR-TAE-003: Relationship Graph (MB-GAP-007)
Query all related parties across trust accounts for a client, showing party type, ownership, and authority.

### FR-TAE-004: Special Instructions CRUD (MB-GAP-008)
Create, read, update, delete special instructions with trigger dates and recurrence.

### FR-TAE-005: Special Instruction Notifications (MB-GAP-008)
Check for due special instructions and return pending notifications.

### FR-TAE-006: Closure Validation (MB-GAP-009)
Block account closure if holdings > 0, pending orders exist, or unposted accruals remain.

### FR-TAE-007: Hold/Garnishment Multi-Tagging (MB-GAP-009)
Link account_holds to trust_accounts; support multiple concurrent holds per account.

### FR-TAE-008: Hold Lifting Approval (MB-GAP-009)
Require approval to lift a hold; record in hold history.

### FR-TAE-009: Status History (MB-GAP-009)
Record every trust account status change with reason, actor, and optional approval.

### FR-TAE-010: Dormancy Integration (MB-GAP-009)
Link existing account_dormancy to trust accounts; add configurable dormancy_check_days.

## 4. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| PATCH | /trust-accounts/:id | Update trust account metadata |
| GET | /trust-accounts/:id/relationship-graph | Get relationship graph |
| POST | /trust-accounts/:id/special-instructions | Create special instruction |
| GET | /trust-accounts/:id/special-instructions | List special instructions |
| PATCH | /trust-accounts/special-instructions/:instrId | Update instruction |
| DELETE | /trust-accounts/special-instructions/:instrId | Delete instruction |
| GET | /trust-accounts/special-instructions/pending | Get pending notifications |
| POST | /trust-accounts/:id/validate-closure | Validate if account can close |
| POST | /trust-accounts/:id/close | Close account with validation |
| GET | /trust-accounts/:id/holds | List holds for account |
| POST | /trust-accounts/:id/holds | Place hold on account |
| POST | /trust-accounts/holds/:holdId/lift | Lift hold (requires approval) |
| GET | /trust-accounts/:id/status-history | Get status change history |
| GET | /trust-accounts/:id/hold-history | Get hold change history |
