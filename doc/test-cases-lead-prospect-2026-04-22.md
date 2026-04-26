# Test Cases: Lead & Prospect Management Module — Phase 1

**Document**: Trust OMS — Lead & Prospect Management BRD v1.0
**Scope**: Phase 1 FRs only (Foundation + Privacy)
**Date**: 2026-04-22
**Total Test Cases**: ~185

---

## 1. FR-001: Manual Lead Creation (Individual)

### TC-FR001-001: Happy path — create Individual lead with all mandatory fields
- **Priority**: P0
- **Preconditions**: RM user logged in; no matching records in leads/prospects tables
- **Steps**: 1. Click Create Lead. 2. Select "Individual" type, click Continue. 3. Fill mandatory fields: first_name="Rajesh", last_name="Kumar", email="rajesh.kumar@test.com", country_code="+63", primary_contact_no="9171234567", assigned_rm_id=self, branch_id=current branch. 4. Navigate through all 7 tabs (Lead Info, Family, Address, ID, Lifestyle, Documents, Preferences). 5. Click Confirm.
- **Expected**: Lead saved with status=NEW, auto-generated lead_number matching L-XXXXXXXX format, assigned_rm_id=current user. Lead appears at top of My Leads grid within 2 seconds. Audit record created for lead creation.

### TC-FR001-002: Validation — missing mandatory first_name
- **Priority**: P0
- **Preconditions**: RM user on Individual lead creation form
- **Steps**: 1. Leave first_name blank. 2. Fill all other mandatory fields. 3. Click Confirm.
- **Expected**: Inline validation error on first_name: "First name is required." Save blocked.

### TC-FR001-003: Validation — invalid email format
- **Priority**: P0
- **Preconditions**: RM user on Individual lead creation form
- **Steps**: 1. Enter email="not-an-email". 2. Fill all other mandatory fields. 3. Click Confirm.
- **Expected**: Inline validation error: "Please enter a valid email address." Save blocked.

### TC-FR001-004: Validation — phone number not 7-15 digits
- **Priority**: P0
- **Preconditions**: RM user on Individual lead creation form
- **Steps**: 1. Enter primary_contact_no="12345" (5 digits). 2. Click Confirm.
- **Expected**: Validation error: "Phone number must be 7-15 digits." Save blocked.

### TC-FR001-005: Validation — DOB under 18 years old
- **Priority**: P1
- **Preconditions**: RM user on Individual lead creation form
- **Steps**: 1. Enter date_of_birth as a date making the person 16 years old. 2. Fill all mandatory fields. 3. Click Confirm.
- **Expected**: Validation error: "Lead must be at least 18 years old for Individual type." Save blocked.

### TC-FR001-006: 7-section tab navigation
- **Priority**: P1
- **Preconditions**: RM user past dedupe check, lead form open
- **Steps**: 1. Verify all 7 tabs visible: Lead Information, Family Members, Address/Contact, Identification, Lifestyle, Documents, Preferences. 2. Click each tab. 3. Enter data in optional fields across multiple tabs. 4. Click Confirm.
- **Expected**: All tabs navigable without losing data. Data saved correctly across all sections.

### TC-FR001-007: Lead number auto-generation uniqueness
- **Priority**: P1
- **Preconditions**: Existing leads in the system
- **Steps**: 1. Create a new Individual lead with valid data. 2. Note the lead_number. 3. Create another Individual lead. 4. Note the lead_number.
- **Expected**: Both lead_numbers follow L-XXXXXXXX format. Numbers are unique and sequential.

### TC-FR001-008: Authorization — Compliance Officer cannot create leads
- **Priority**: P0
- **Preconditions**: User logged in with Compliance Officer role
- **Steps**: 1. Attempt to access Create Lead function.
- **Expected**: Create Lead action is hidden or returns HTTP 403 Forbidden. Compliance Officers do not have Lead Create permission.

---

## 2. FR-002: Manual Lead Creation (Non-Individual)

### TC-FR002-001: Happy path — create Non-Individual lead
- **Priority**: P0
- **Preconditions**: RM user logged in; no matching records
- **Steps**: 1. Click Create Lead. 2. Select "Non-Individual", click Continue. 3. Fill mandatory fields: entity_name="Acme Trust Corp", email="info@acmetrust.com", country_code="+1", primary_contact_no="2125551234". 4. Click Confirm.
- **Expected**: Lead saved with status=NEW, lead_type=NON_INDIVIDUAL, entity_name stored. lead_number auto-generated. Family Members tab not visible.

### TC-FR002-002: Validation — entity_name mandatory for Non-Individual
- **Priority**: P0
- **Preconditions**: RM user on Non-Individual lead creation form
- **Steps**: 1. Leave entity_name blank. 2. Fill all other mandatory fields. 3. Click Confirm.
- **Expected**: Validation error: "Entity name is required for Non-Individual leads." Save blocked.

### TC-FR002-003: Validation — entity_name minimum 2 characters
- **Priority**: P1
- **Preconditions**: RM user on Non-Individual lead creation form
- **Steps**: 1. Enter entity_name="A" (1 char). 2. Click Confirm.
- **Expected**: Validation error: entity_name must be at least 2 characters. Save blocked.

### TC-FR002-004: Family Members tab hidden for Non-Individual
- **Priority**: P1
- **Preconditions**: RM user on Non-Individual lead creation form
- **Steps**: 1. Verify visible tabs after selecting Non-Individual type.
- **Expected**: Family Members tab is not displayed. Only 6 tabs visible (Lead Information, Address/Contact, Identification, Lifestyle, Documents, Preferences).

### TC-FR002-005: Non-Individual dedupe — entity_name + email hard stop
- **Priority**: P0
- **Preconditions**: Existing lead with entity_name="Acme Trust Corp", email="info@acmetrust.com". Dedupe rule for Non-Individual: entity_name+email = HARD_STOP active.
- **Steps**: 1. Create Non-Individual lead with same entity_name and email. 2. Click Continue after type selection.
- **Expected**: Hard-stop modal: "Duplicate found -- cannot proceed" with details of matching existing lead. No override option.

### TC-FR002-006: Non-Individual dedupe — entity_name alone soft stop with override
- **Priority**: P1
- **Preconditions**: Existing lead with entity_name="Acme Trust Corp". Dedupe rule: entity_name alone = SOFT_STOP active.
- **Steps**: 1. Create Non-Individual lead with entity_name="Acme Trust Corp" but different email/phone. 2. Click Continue. 3. See soft-stop warning. 4. Click Override, enter reason (min 10 chars). 5. Submit.
- **Expected**: Warning modal shows potential match. Override accepted with reason text. dedupe_overrides record created. Lead form opens.

---

## 3. FR-003: Dedupe Engine

### TC-FR003-001: Hard stop — exact match on campaign_id + first_name + last_name + email
- **Priority**: P0
- **Preconditions**: Existing Individual lead: first_name="Maria", last_name="Santos", email="maria@test.com", campaign_id=C1. Active HARD_STOP dedupe rule with field_combination=["campaign_id","first_name","last_name","email"], priority=1.
- **Steps**: 1. Create Individual lead with same campaign_id, first_name, last_name, email. 2. Click Continue.
- **Expected**: Blocking modal: "Duplicate found -- cannot proceed." Shows matched record details (lead_number, name, email). No Override button. Cancel returns to type selection.

### TC-FR003-002: Soft stop — name match only with override + reason
- **Priority**: P0
- **Preconditions**: Existing Individual lead: first_name="Maria", last_name="Santos". Active SOFT_STOP rule with field_combination=["campaign_id","first_name","last_name"], priority=3. No hard-stop rule matches.
- **Steps**: 1. Create Individual lead with same name but different email/phone. 2. Click Continue. 3. See soft-stop warning. 4. Click Override. 5. Enter reason "Different person confirmed by RM." (>10 chars). 6. Submit.
- **Expected**: Warning modal shown with match details. Override accepted. dedupe_overrides record created with entity_id, rule_id, reason, override user, timestamp. Form opens normally.

### TC-FR003-003: Soft stop override — reason under 10 characters rejected
- **Priority**: P1
- **Preconditions**: Soft-stop match triggered
- **Steps**: 1. Click Override on soft-stop modal. 2. Enter reason "short" (5 chars). 3. Click Submit.
- **Expected**: Validation error: reason must be at least 10 characters. Override not accepted.

### TC-FR003-004: Priority ordering — hard stop evaluated before soft stop
- **Priority**: P1
- **Preconditions**: Existing lead matches both a HARD_STOP rule (priority=1) and a SOFT_STOP rule (priority=3).
- **Steps**: 1. Create lead matching both rules.
- **Expected**: Hard-stop modal displayed (not soft-stop). Blocks creation entirely.

### TC-FR003-005: No match — form opens without delay
- **Priority**: P0
- **Preconditions**: No existing leads/prospects matching the new lead's fields
- **Steps**: 1. Create Individual lead with unique first_name, last_name, email, phone. 2. Click Continue.
- **Expected**: No dedupe modal appears. Lead creation form opens immediately. Dedupe check completes within 2 seconds.

### TC-FR003-006: Dedupe checks against both leads and prospects tables
- **Priority**: P1
- **Preconditions**: No matching lead exists, but a prospect with matching email exists. Active HARD_STOP rule on email field.
- **Steps**: 1. Create a new lead with the same email as the existing prospect. 2. Click Continue.
- **Expected**: Hard-stop modal shows the matching prospect record. Creation blocked.

### TC-FR003-007: Only active rules are evaluated
- **Priority**: P1
- **Preconditions**: A HARD_STOP dedupe rule exists with is_active=false. Matching data in leads table.
- **Steps**: 1. Create lead matching the inactive rule's field_combination. 2. Click Continue.
- **Expected**: No dedupe match triggered. Form opens normally.

### TC-FR003-008: Performance — single-record dedupe within 2 seconds
- **Priority**: P1
- **Preconditions**: leads table contains 500,000 records. Multiple active dedupe rules.
- **Steps**: 1. Create a new lead. 2. Click Continue. 3. Measure time from click to form display (or modal).
- **Expected**: Dedupe check completes and result displayed in under 2 seconds.

---

## 4. FR-004: Negative/Blacklist Screening

### TC-FR004-001: Hard stop — exact email match against active negative list
- **Priority**: P0
- **Preconditions**: Active negative_list record with email="blocked@bad.com", is_active=true, expiry_date=NULL.
- **Steps**: 1. Create Individual lead with email="blocked@bad.com". 2. Pass dedupe check. 3. System runs negative list screening.
- **Expected**: Hard-stop modal: "Negative list match found -- lead cannot be created." Shows list_type, reason, and source from the negative_list record. No override possible.

### TC-FR004-002: Hard stop — exact phone match
- **Priority**: P0
- **Preconditions**: Active negative_list record with phone_number="9171111111", is_active=true.
- **Steps**: 1. Create lead with primary_contact_no="9171111111". 2. Pass dedupe.
- **Expected**: Hard-stop blocking modal showing negative list match on phone number.

### TC-FR004-003: Hard stop — exact ID number match
- **Priority**: P0
- **Preconditions**: Active negative_list record with id_number="ABC123456".
- **Steps**: 1. Create lead and enter identification document_number="ABC123456". 2. Pass dedupe.
- **Expected**: Hard-stop blocking modal showing negative list match on ID number.

### TC-FR004-004: Fuzzy name match — Levenshtein distance <= 2
- **Priority**: P0
- **Preconditions**: Active negative_list record with first_name="Mohammed", last_name="Ali". pg_trgm extension enabled with GIN indexes.
- **Steps**: 1. Create lead with first_name="Mohamad" (Levenshtein distance=2 from "Mohammed"). 2. Pass dedupe.
- **Expected**: Hard-stop modal triggered by fuzzy name match. Matched negative list entry shown with details.

### TC-FR004-005: Fuzzy name match — Levenshtein distance > 2 does NOT match
- **Priority**: P1
- **Preconditions**: Active negative_list record with first_name="Mohammed".
- **Steps**: 1. Create lead with first_name="Michael" (Levenshtein distance >2).
- **Expected**: No negative list match. Screening passes. Lead creation form opens.

### TC-FR004-006: Expired negative list entry not checked
- **Priority**: P1
- **Preconditions**: Negative_list record with email="expired@bad.com", expiry_date="2025-01-01" (past date), is_active=true.
- **Steps**: 1. Create lead with email="expired@bad.com".
- **Expected**: No negative list match (entry expired). Screening passes normally.

### TC-FR004-007: Inactive negative list entry not checked
- **Priority**: P1
- **Preconditions**: Negative_list record with email="inactive@bad.com", is_active=false.
- **Steps**: 1. Create lead with email="inactive@bad.com".
- **Expected**: No match. is_active=false entries are excluded from screening.

### TC-FR004-008: Audit trail logged for both match and no-match
- **Priority**: P1
- **Preconditions**: Any lead creation attempt
- **Steps**: 1. Create lead that passes screening (no match). 2. Create lead that fails screening (match). 3. Check audit_records table.
- **Expected**: Both screening results logged in audit_records: one with "screening_passed" outcome, one with "screening_blocked" outcome including matched record details.

---

## 5. FR-005 & FR-019: My Leads / My Prospects Dashboards

### TC-FR005-001: RM sees only own assigned leads
- **Priority**: P0
- **Preconditions**: RM-A has 5 leads, RM-B has 3 leads. RM-A is logged in.
- **Steps**: 1. Navigate to My Leads tab.
- **Expected**: Grid shows exactly 5 leads, all with assigned_rm_id=RM-A. None of RM-B's leads visible.

### TC-FR005-002: SRM sees all team leads
- **Priority**: P0
- **Preconditions**: SRM supervises RM-A and RM-B. Both have leads.
- **Steps**: 1. SRM logs in. 2. Navigate to My Leads.
- **Expected**: Grid shows leads for all RMs in the SRM's team (RM-A + RM-B leads visible).

### TC-FR005-003: Search by lead_number
- **Priority**: P1
- **Preconditions**: Lead L-00000042 exists assigned to current RM.
- **Steps**: 1. Enter "L-00000042" in search bar. 2. Press Enter or wait for auto-search.
- **Expected**: Search returns the matching lead within 1 second. Only L-00000042 displayed.

### TC-FR005-004: Filter by multiple statuses
- **Priority**: P1
- **Preconditions**: RM has leads in NEW, CONTACTED, and QUALIFIED statuses.
- **Steps**: 1. Open Status filter. 2. Select NEW and QUALIFIED. 3. Apply filter.
- **Expected**: Grid shows only leads with status NEW or QUALIFIED. CONTACTED leads hidden.

### TC-FR005-005: Pagination — 20 cards per page
- **Priority**: P2
- **Preconditions**: RM has 45 leads.
- **Steps**: 1. Load My Leads. 2. Count visible cards. 3. Click Next Page.
- **Expected**: First page shows 20 cards. Second page shows 20 cards. Third page shows 5 cards. No full page reload on pagination.

### TC-FR005-006: Card displays key info fields
- **Priority**: P1
- **Preconditions**: Lead exists with all fields populated.
- **Steps**: 1. View lead card in My Leads grid.
- **Expected**: Card displays: lead_number, full name, status (color-coded badge), source, estimated_aum, phone, email, created_at.

### TC-FR019-001: My Prospects grid — RM sees own prospects only
- **Priority**: P0
- **Preconditions**: RM has 3 active prospects. Other RMs have prospects.
- **Steps**: 1. Navigate to My Prospects tab.
- **Expected**: Grid shows only the 3 prospects assigned to current RM.

### TC-FR019-002: Ageing color indicator
- **Priority**: P1
- **Preconditions**: Prospects created at different dates: 10 days ago, 50 days ago, 100 days ago.
- **Steps**: 1. View My Prospects grid. 2. Check ageing indicators.
- **Expected**: 10-day prospect shows Green indicator. 50-day shows Yellow. 100-day shows Red.

### TC-FR019-003: Dropped prospects in separate sub-tab
- **Priority**: P1
- **Preconditions**: RM has 2 ACTIVE and 1 DROPPED prospect.
- **Steps**: 1. View main My Prospects grid. 2. Switch to Dropped sub-tab.
- **Expected**: Main grid shows 2 prospects (no DROPPED). Dropped sub-tab shows 1 prospect with reactivation option.

### TC-FR019-004: Action buttons on prospect card
- **Priority**: P1
- **Preconditions**: ACTIVE prospect exists in My Prospects.
- **Steps**: 1. View prospect card.
- **Expected**: Card shows action buttons: View Details, Edit, Drop, Recommend for Client, Schedule Meeting, File Call Report.

---

## 6. FR-006: Lead Status Update

### TC-FR006-001: Valid transition NEW to CONTACTED
- **Priority**: P0
- **Preconditions**: Lead in NEW status.
- **Steps**: 1. Open lead detail. 2. Select status=CONTACTED from dropdown. 3. Confirm.
- **Expected**: Status updated to CONTACTED. Audit record created with old_status=NEW, new_status=CONTACTED.

### TC-FR006-002: Valid transition NEW to QUALIFIED
- **Priority**: P0
- **Preconditions**: Lead in NEW status.
- **Steps**: 1. Change status to QUALIFIED.
- **Expected**: Status updated successfully. Audit record logged.

### TC-FR006-003: Status dropdown shows only valid transitions
- **Priority**: P0
- **Preconditions**: Lead in CONTACTED status.
- **Steps**: 1. Open status dropdown.
- **Expected**: Dropdown shows only: QUALIFIED, NOT_INTERESTED, DO_NOT_CONTACT. Does NOT show NEW, CLIENT_ACCEPTED, or CONVERTED.

### TC-FR006-004: NOT_INTERESTED requires mandatory drop_reason
- **Priority**: P0
- **Preconditions**: Lead in CONTACTED status.
- **Steps**: 1. Select status=NOT_INTERESTED. 2. Leave drop_reason blank. 3. Attempt to save.
- **Expected**: Validation error: drop_reason is mandatory when setting NOT_INTERESTED. Save blocked.

### TC-FR006-005: DO_NOT_CONTACT is terminal — no further transitions
- **Priority**: P0
- **Preconditions**: Lead in DO_NOT_CONTACT status.
- **Steps**: 1. Open lead detail. 2. Check status dropdown.
- **Expected**: Status dropdown is disabled or shows no valid transitions. No status change possible.

### TC-FR006-006: NOT_INTERESTED to CONTACTED (reactivation)
- **Priority**: P1
- **Preconditions**: Lead in NOT_INTERESTED status.
- **Steps**: 1. Change status to CONTACTED.
- **Expected**: Status updated to CONTACTED. Audit record captures reactivation.

### TC-FR006-007: CONVERTED status only via conversion action
- **Priority**: P0
- **Preconditions**: Lead in CLIENT_ACCEPTED status.
- **Steps**: 1. Open status dropdown.
- **Expected**: CONVERTED is NOT in the dropdown. CONVERTED can only be set via the Lead-to-Prospect conversion action (FR-023).

### TC-FR006-008: Invalid transition QUALIFIED to NEW rejected
- **Priority**: P1
- **Preconditions**: Lead in QUALIFIED status.
- **Steps**: 1. Attempt to set status=NEW via API (PATCH /leads/:id with status=NEW).
- **Expected**: HTTP 400 or 422 with error: "Invalid status transition from QUALIFIED to NEW."

---

## 7. FR-007: Lead Edit/Modify

### TC-FR007-001: Happy path — edit own lead fields
- **Priority**: P0
- **Preconditions**: RM owns a lead in NEW status.
- **Steps**: 1. Open lead detail. 2. Edit email, phone, occupation, notes. 3. Click Save.
- **Expected**: Fields updated. updated_at and updated_by refreshed. Audit record captures old and new values for each changed field.

### TC-FR007-002: Read-only fields cannot be edited
- **Priority**: P0
- **Preconditions**: RM editing own lead.
- **Steps**: 1. Verify lead_number, created_at, created_by fields.
- **Expected**: These fields are displayed as read-only (disabled/non-editable). Cannot be modified.

### TC-FR007-003: CONVERTED lead — only notes editable
- **Priority**: P0
- **Preconditions**: Lead in CONVERTED status.
- **Steps**: 1. Open lead detail for editing. 2. Try to edit first_name, email, phone. 3. Edit notes field.
- **Expected**: All fields except notes are locked/read-only. Notes field is editable and saves successfully.

### TC-FR007-004: Mandatory field validation on edit save
- **Priority**: P1
- **Preconditions**: RM editing own lead.
- **Steps**: 1. Clear email field (mandatory). 2. Click Save.
- **Expected**: Validation error: "Email is required." Save blocked.

### TC-FR007-005: RM cannot edit another RM's lead
- **Priority**: P0
- **Preconditions**: RM-A's lead exists. RM-B logged in (not SRM/Manager).
- **Steps**: 1. RM-B attempts to edit RM-A's lead via API.
- **Expected**: HTTP 403 Forbidden. RM can only modify own leads.

### TC-FR007-006: SRM can edit team member's lead
- **Priority**: P1
- **Preconditions**: SRM supervises RM-A. RM-A has a lead.
- **Steps**: 1. SRM opens RM-A's lead for editing. 2. Modifies occupation field. 3. Saves.
- **Expected**: Edit succeeds. updated_by=SRM user ID. Audit trail recorded.

### TC-FR007-007: Field-level audit trail on edit
- **Priority**: P1
- **Preconditions**: Lead with email="old@test.com".
- **Steps**: 1. Edit email to "new@test.com". 2. Save. 3. Check audit_records.
- **Expected**: Audit record shows: entity_type=LEAD, entity_id=lead UUID, field="email", old_value="old@test.com", new_value="new@test.com", changed_by=RM, timestamp.

---

## 8. FR-018: Manual Prospect Creation

### TC-FR018-001: Happy path — create Individual prospect with wealth fields
- **Priority**: P0
- **Preconditions**: RM logged in. No matching records in leads/prospects.
- **Steps**: 1. Click Create Prospect. 2. Select "Individual". 3. Pass dedupe + negative screening. 4. Fill mandatory fields plus classification=GOLD, risk_profile=BALANCED, estimated_aum=8000000, trv=10000000. 5. Click Confirm.
- **Expected**: Prospect saved with status=ACTIVE. prospect_number auto-generated in P-XXXXXXXX format. Wealth fields (classification, risk_profile, TRV) stored. Prospect appears in My Prospects grid.

### TC-FR018-002: Dedupe runs against both prospects AND leads tables
- **Priority**: P0
- **Preconditions**: Existing lead with email="exists@test.com". Prospect HARD_STOP dedupe rule on email.
- **Steps**: 1. Create prospect with email="exists@test.com". 2. Click Continue.
- **Expected**: Dedupe hard-stop triggered from lead table match. Blocking modal shown.

### TC-FR018-003: Negative/blacklist screening runs after dedupe passes
- **Priority**: P0
- **Preconditions**: No dedupe match. Active negative_list record with matching name (fuzzy).
- **Steps**: 1. Create prospect with name matching negative list entry. 2. Pass dedupe (no match). 3. System runs negative screening.
- **Expected**: Negative list hard-stop modal displayed after dedupe passes.

### TC-FR018-004: Non-Individual prospect — entity_name mandatory
- **Priority**: P0
- **Preconditions**: RM on prospect creation, Non-Individual type selected.
- **Steps**: 1. Leave entity_name blank. 2. Fill other mandatory fields. 3. Click Confirm.
- **Expected**: Validation error: entity_name required for Non-Individual prospects.

### TC-FR018-005: Classification AUM threshold guidance
- **Priority**: P2
- **Preconditions**: RM entering prospect with estimated_aum=6000000.
- **Steps**: 1. Enter AUM=6,000,000. 2. Check classification options.
- **Expected**: System suggests GOLD classification (5M-25M range) based on configured thresholds. RM can override.

### TC-FR018-006: Prospect-specific fields present in form
- **Priority**: P1
- **Preconditions**: RM on prospect creation form.
- **Steps**: 1. Check form fields.
- **Expected**: Prospect form includes: classification dropdown, TRV field, risk_profile dropdown, risk_profile_comments textarea, cif_number field. These are not present in lead form.

---

## 9. FR-020: Prospect Drop & Reactivation

### TC-FR020-001: Drop prospect — mandatory reason (min 10 chars)
- **Priority**: P0
- **Preconditions**: RM has an ACTIVE prospect.
- **Steps**: 1. Click Drop on prospect card. 2. Enter drop_reason="Client not qualified for wealth products." 3. Click Submit.
- **Expected**: Status changed to DROPPED. drop_date set. drop_reason stored. Prospect moved to Dropped sub-tab. Audit trail entry created.

### TC-FR020-002: Drop reason too short
- **Priority**: P1
- **Preconditions**: RM clicking Drop on ACTIVE prospect.
- **Steps**: 1. Enter drop_reason="No fit" (6 chars). 2. Click Submit.
- **Expected**: Validation error: "Drop reason must be at least 10 characters." Drop not processed.

### TC-FR020-003: Reactivate dropped prospect
- **Priority**: P0
- **Preconditions**: Prospect in DROPPED status, in Dropped sub-tab.
- **Steps**: 1. Click Reactivate on dropped prospect. 2. Confirm in dialog.
- **Expected**: Status changed to REACTIVATED. reactivation_date set. Prospect returns to main active grid. Audit trail entry created.

### TC-FR020-004: Cannot drop RECOMMENDED prospect
- **Priority**: P0
- **Preconditions**: Prospect in RECOMMENDED status.
- **Steps**: 1. Attempt to click Drop.
- **Expected**: Drop action is disabled or hidden. RECOMMENDED prospects cannot be dropped.

### TC-FR020-005: Cannot drop CONVERTED prospect
- **Priority**: P0
- **Preconditions**: Prospect in CONVERTED status.
- **Steps**: 1. Attempt to click Drop.
- **Expected**: Drop action disabled. CONVERTED prospects cannot be dropped.

### TC-FR020-006: Only assigned RM or SRM can drop
- **Priority**: P1
- **Preconditions**: Prospect assigned to RM-A. RM-B logged in (not SRM of RM-A).
- **Steps**: 1. RM-B attempts to drop RM-A's prospect via API.
- **Expected**: HTTP 403 Forbidden. Only assigned RM or their SRM can drop.

---

## 10. FR-021: Prospect Recommend for Client

### TC-FR021-001: Happy path — recommend ACTIVE prospect
- **Priority**: P0
- **Preconditions**: Prospect in ACTIVE status with first_name, last_name, email, primary_contact_no all populated.
- **Steps**: 1. Click Recommend on prospect card. 2. Confirm in dialog: "Recommend [Name] for client creation?"
- **Expected**: Status changed to RECOMMENDED. Audit trail created. Prospect visible in prospect-to-customer linking search.

### TC-FR021-002: Recommend REACTIVATED prospect
- **Priority**: P1
- **Preconditions**: Prospect in REACTIVATED status with all required fields populated.
- **Steps**: 1. Click Recommend. 2. Confirm.
- **Expected**: Status changed to RECOMMENDED. Valid since ACTIVE and REACTIVATED are allowed source statuses.

### TC-FR021-003: Cannot recommend DROPPED prospect
- **Priority**: P0
- **Preconditions**: Prospect in DROPPED status.
- **Steps**: 1. Check if Recommend button is available.
- **Expected**: Recommend action hidden or disabled. Only ACTIVE/REACTIVATED prospects can be recommended.

### TC-FR021-004: Missing mandatory field blocks recommendation
- **Priority**: P0
- **Preconditions**: Prospect in ACTIVE status with email=NULL (missing).
- **Steps**: 1. Click Recommend.
- **Expected**: Validation error listing missing mandatory fields: "Cannot recommend: email is required." Recommend blocked.

### TC-FR021-005: Missing multiple mandatory fields — all listed
- **Priority**: P1
- **Preconditions**: Prospect with email=NULL and primary_contact_no=NULL.
- **Steps**: 1. Click Recommend.
- **Expected**: Validation error lists all missing fields: "Cannot recommend: email, primary_contact_no are required."

---

## 11. FR-022: Bulk Prospect Upload

### TC-FR022-001: Happy path — CSV upload with valid data
- **Priority**: P0
- **Preconditions**: Operations user logged in. CSV file with 50 valid records (First Name, Last Name, Email, Phone, AUM).
- **Steps**: 1. Navigate to Batch Monitoring > File Upload. 2. Select Upload Type: Prospect Upload. 3. Choose CSV file. 4. Click Upload File.
- **Expected**: Upload processes. upload_logs created with status=COMPLETED, success_count=50, error_count=0. 50 prospect records created with status=ACTIVE. Each assigned to RM from file or default branch manager.

### TC-FR022-002: File exceeds 10MB
- **Priority**: P1
- **Preconditions**: CSV file larger than 10MB.
- **Steps**: 1. Select oversized file. 2. Click Upload.
- **Expected**: Error: "File exceeds maximum size of 10MB." Upload rejected.

### TC-FR022-003: File exceeds 10,000 records
- **Priority**: P1
- **Preconditions**: CSV file with 10,001 records.
- **Steps**: 1. Upload the file.
- **Expected**: Error: "File exceeds maximum of 10,000 records." Upload rejected.

### TC-FR022-004: Missing required columns
- **Priority**: P0
- **Preconditions**: CSV file missing Last Name column.
- **Steps**: 1. Upload the file.
- **Expected**: Validation error: "Required column 'Last Name' is missing." Upload rejected or all records marked as error.

### TC-FR022-005: Dedupe within upload catches duplicates
- **Priority**: P1
- **Preconditions**: CSV with rows 5 and 15 having same email.
- **Steps**: 1. Upload file.
- **Expected**: First occurrence (row 5) succeeds. Row 15 marked as error with dedupe violation. Error details viewable in Upload Error Log.

### TC-FR022-006: Dedupe against existing prospects/leads
- **Priority**: P0
- **Preconditions**: Existing prospect with email="exists@test.com". CSV contains a row with same email.
- **Steps**: 1. Upload file.
- **Expected**: Row with matching email flagged as dedupe error. Other rows succeed. Error log shows dedupe match details.

### TC-FR022-007: RM assignment defaults to branch manager when not specified
- **Priority**: P1
- **Preconditions**: CSV rows without RM column populated.
- **Steps**: 1. Upload file without RM assignments.
- **Expected**: Created prospects have assigned_rm_id set to the branch manager of the uploading user's branch.

### TC-FR022-008: Error report downloadable as Excel
- **Priority**: P2
- **Preconditions**: Upload completed with some errors.
- **Steps**: 1. Navigate to Upload Error Log. 2. Click Download Error Report.
- **Expected**: Excel file downloaded with columns: Row Number, Field, Error Message, Record Data.

---

## 12. FR-023: Lead-to-Prospect Conversion

### TC-FR023-001: Happy path — convert CLIENT_ACCEPTED lead to prospect
- **Priority**: P0
- **Preconditions**: Lead in CLIENT_ACCEPTED status with full data in all 7 sections (including family, addresses, identifications, lifestyle, documents).
- **Steps**: 1. Open lead card. 2. Click "Convert to Prospect". 3. Review auto-populated prospect form with all lead data. 4. Confirm without modifications.
- **Expected**: New prospect created with status=ACTIVE, auto-generated prospect_number. All lead data copied: personal info, family members, addresses, identifications, lifestyle, documents. Lead status updated to CONVERTED. lead.converted_prospect_id set to new prospect ID. conversion_history record created. Success message: "Lead [L-XXXXXXXX] converted to Prospect [P-XXXXXXXX]."

### TC-FR023-002: Convert button not visible for non-CLIENT_ACCEPTED status
- **Priority**: P0
- **Preconditions**: Lead in QUALIFIED status.
- **Steps**: 1. Open lead card.
- **Expected**: "Convert to Prospect" button is NOT visible. Only CLIENT_ACCEPTED leads can be converted.

### TC-FR023-003: RM modifies data during conversion before confirming
- **Priority**: P1
- **Preconditions**: Lead in CLIENT_ACCEPTED status.
- **Steps**: 1. Click Convert. 2. Modify risk_profile, classification, and notes in the pre-populated form. 3. Confirm.
- **Expected**: Prospect created with modified values (not original lead values for those fields). All other fields carry forward from lead.

### TC-FR023-004: Atomicity — prospect creation failure rolls back lead status
- **Priority**: P0
- **Preconditions**: Lead in CLIENT_ACCEPTED status. Database constraint will cause prospect insert to fail (e.g., simulate DB error).
- **Steps**: 1. Click Convert. 2. Confirm. 3. Prospect creation fails due to DB error.
- **Expected**: Lead status remains CLIENT_ACCEPTED (not changed to CONVERTED). No orphan prospect record. Error message displayed to user.

### TC-FR023-005: Sub-table records copied (family, addresses, identifications, lifestyle, documents)
- **Priority**: P0
- **Preconditions**: Lead has 2 family members, 2 addresses, 1 identification, lifestyle data, and 1 document.
- **Steps**: 1. Convert lead to prospect. 2. Open new prospect detail.
- **Expected**: Prospect has: 2 prospect_family_members, 2 prospect_addresses, 1 prospect_identifications, 1 prospect_lifestyle, 1 prospect_documents. Data matches original lead sub-table records.

### TC-FR023-006: Conversion history record contents
- **Priority**: P1
- **Preconditions**: Lead conversion completed.
- **Steps**: 1. Query conversion_history for the conversion.
- **Expected**: Record contains: source_entity_type=LEAD, source_entity_id=lead UUID, target_entity_type=PROSPECT, target_entity_id=prospect UUID, campaign_id (if lead was campaign-sourced), converted_by=RM user ID, conversion_date=timestamp.

### TC-FR023-007: Authorization — only RM/SRM/Branch Manager/Admin can convert
- **Priority**: P1
- **Preconditions**: Operations Maker user logged in. Lead in CLIENT_ACCEPTED status.
- **Steps**: 1. Attempt to convert the lead.
- **Expected**: Convert action hidden or HTTP 403. Ops Maker does not have Lead Convert permission.

---

## 13. FR-024: Prospect-to-Customer Mapping

### TC-FR024-001: Happy path — link RECOMMENDED prospect to existing customer
- **Priority**: P0
- **Preconditions**: Customer with CIF exists. RECOMMENDED prospect exists with additional data not on customer profile.
- **Steps**: 1. Navigate to My Customers. 2. Select customer card. 3. Click Link Prospect. 4. Search for prospect by name in type-ahead. 5. Select prospect. 6. Review merge preview. 7. Click Link/Confirm.
- **Expected**: Prospect data copied to customer profile ONLY for empty fields (no overwrite). Prospect status=CONVERTED. prospect.linked_customer_id set. conversion_history record created. Success message with both numbers.

### TC-FR024-002: Non-destructive merge — existing customer data preserved
- **Priority**: P0
- **Preconditions**: Customer has email="customer@bank.com". Prospect has email="prospect@new.com".
- **Steps**: 1. Link prospect to customer. 2. Check customer email after merge.
- **Expected**: Customer email remains "customer@bank.com" (NOT overwritten). Prospect email shown as "suggested update" for RM to manually review.

### TC-FR024-003: Type-ahead search shows only RECOMMENDED prospects
- **Priority**: P0
- **Preconditions**: Prospects exist in ACTIVE, DROPPED, RECOMMENDED, and CONVERTED statuses.
- **Steps**: 1. Click Link Prospect on customer. 2. Type in search field.
- **Expected**: Only RECOMMENDED prospects appear in search results. ACTIVE, DROPPED, and CONVERTED prospects are excluded.

### TC-FR024-004: Merged fields highlighted for review
- **Priority**: P1
- **Preconditions**: Customer has some empty fields. Prospect has data in those fields.
- **Steps**: 1. Select prospect to link. 2. View merge preview.
- **Expected**: Fields that will be populated from prospect data are highlighted. Fields where customer already has data show prospect data as "suggested update" but NOT auto-applied.

### TC-FR024-005: Selectively apply suggested updates
- **Priority**: P1
- **Preconditions**: Customer has occupation="Lawyer". Prospect has occupation="Senior Partner, Law Firm".
- **Steps**: 1. Link prospect. 2. In merge preview, see "suggested update" for occupation. 3. Choose to apply the suggested update.
- **Expected**: Customer occupation updated to "Senior Partner, Law Firm". Only explicitly selected suggestions applied.

### TC-FR024-006: Prospect already CONVERTED cannot be linked again
- **Priority**: P1
- **Preconditions**: Prospect in CONVERTED status (already linked to a customer).
- **Steps**: 1. Try to search for this prospect in Link Prospect.
- **Expected**: CONVERTED prospect does not appear in search results.

---

## 14. FR-038: Communication Preferences / Consent

### TC-FR038-001: Consent section displayed during lead creation
- **Priority**: P0
- **Preconditions**: RM creating a new Individual lead (MANUAL source).
- **Steps**: 1. Navigate through lead form to Preferences section. 2. Check consent checkboxes.
- **Expected**: "Communication Consent" section displayed with checkboxes for Email, SMS, Phone channels. All checkboxes default to unchecked (opted-out) for MANUAL source.

### TC-FR038-002: CAMPAIGN source — email defaults to opted-in
- **Priority**: P0
- **Preconditions**: Lead being created from a campaign (source=CAMPAIGN).
- **Steps**: 1. Check consent defaults during lead creation from campaign.
- **Expected**: Email checkbox defaults to checked (opted-in, implied consent from campaign participation). SMS and Phone default to unchecked.

### TC-FR038-003: MANUAL source — all channels default to opted-out
- **Priority**: P0
- **Preconditions**: Lead created manually (source=MANUAL).
- **Steps**: 1. Check consent defaults.
- **Expected**: All channel checkboxes (Email, SMS, Phone) default to unchecked. GDPR requires explicit opt-in.

### TC-FR038-004: Communication preferences records created on save
- **Priority**: P0
- **Preconditions**: RM opts in to Email, opts out of SMS and Phone.
- **Steps**: 1. Check Email consent. 2. Leave SMS and Phone unchecked. 3. Save lead.
- **Expected**: Three communication_preferences records created: Email (is_opted_in=true, consent_date=NOW, consent_source=FORM), SMS (is_opted_in=false), Phone (is_opted_in=false).

### TC-FR038-005: Consent visible on lead/prospect detail view
- **Priority**: P1
- **Preconditions**: Lead created with Email opted-in, SMS opted-out.
- **Steps**: 1. Open lead detail view.
- **Expected**: Consent status displayed for each channel: Email=Opted In, SMS=Opted Out, Phone=Opted Out. Dates and sources visible.

### TC-FR038-006: GDPR compliance — no pre-checked boxes for MANUAL/UPLOAD
- **Priority**: P0
- **Preconditions**: Lead with source=MANUAL or UPLOAD.
- **Steps**: 1. Verify consent checkboxes on creation form.
- **Expected**: No consent checkboxes are pre-checked. Labels clearly state: "I agree to receive [marketing communications / updates] via [channel]."

### TC-FR038-007: Consent during prospect creation
- **Priority**: P1
- **Preconditions**: RM creating prospect manually.
- **Steps**: 1. Fill prospect form. 2. Check consent section. 3. Opt in to SMS. 4. Save.
- **Expected**: communication_preferences records created for the prospect entity. SMS is_opted_in=true. Entity_type=PROSPECT in records.

### TC-FR038-008: Update consent preferences after creation
- **Priority**: P1
- **Preconditions**: Lead exists with Email opted-in.
- **Steps**: 1. Open lead detail. 2. Navigate to preferences. 3. Uncheck Email consent. 4. Save.
- **Expected**: communication_preferences record updated: is_opted_in=false, opted_out_date=NOW, opt_out_source=RM_RECORDED.

---

## 15. FR-041: Data Retention Policies

### TC-FR041-001: ANONYMIZE action — PII replaced, structure preserved
- **Priority**: P0
- **Preconditions**: Active retention policy: entity_type=LEAD, status_filter=DO_NOT_CONTACT, retention_days=30, trigger_field=updated_at, action=ANONYMIZE. Lead in DO_NOT_CONTACT status with updated_at 31 days ago.
- **Steps**: 1. Run daily retention enforcement job. 2. Query the lead record.
- **Expected**: Lead record still exists. PII fields (first_name, last_name, email, phone, DOB) replaced with anonymized placeholders (e.g., "REDACTED", "anonymous@redacted.com"). Non-PII fields (status, source, estimated_aum) preserved. Audit record logged.

### TC-FR041-002: HARD_DELETE action — cascades to sub-tables
- **Priority**: P0
- **Preconditions**: Active retention policy: entity_type=LEAD, status_filter=NOT_INTERESTED, retention_days=365, action=HARD_DELETE. Lead with sub-table records (family, addresses, identifications, lifestyle, documents) past retention.
- **Steps**: 1. Run retention job.
- **Expected**: Lead record and ALL sub-table records (lead_family_members, lead_addresses, lead_identifications, lead_lifestyle, lead_documents) deleted. Audit record logs deletion.

### TC-FR041-003: ARCHIVE action — moves to archive schema
- **Priority**: P1
- **Preconditions**: Active retention policy with action=ARCHIVE. Lead past retention period.
- **Steps**: 1. Run retention job. 2. Query main schema. 3. Query archive schema.
- **Expected**: Lead no longer in main public schema. Lead exists in archive schema. Accessible to Compliance Officers only.

### TC-FR041-004: Legal hold prevents retention action
- **Priority**: P0
- **Preconditions**: Retention policy: action=ANONYMIZE for lead past retention. Active data_subject_request with status=REJECTED and rejection_reason containing "legal hold" for this lead.
- **Steps**: 1. Run retention job.
- **Expected**: Lead is SKIPPED. PII not anonymized. Audit log entry: "Skipped entity [ID] due to active legal hold."

### TC-FR041-005: Scheduled job runs daily at 02:00 UTC
- **Priority**: P1
- **Preconditions**: Retention policies configured.
- **Steps**: 1. Verify cron schedule of retention job.
- **Expected**: Job is configured to run at 02:00 UTC daily.

### TC-FR041-006: Summary report generated after run
- **Priority**: P1
- **Preconditions**: Retention job processes multiple entity types.
- **Steps**: 1. Run retention job. 2. Check generated report.
- **Expected**: Summary report shows: "X records anonymized, Y deleted, Z archived" broken down per entity type.

### TC-FR041-007: Records within retention period NOT processed
- **Priority**: P0
- **Preconditions**: Retention policy: retention_days=30. Lead in DO_NOT_CONTACT with updated_at 15 days ago.
- **Steps**: 1. Run retention job.
- **Expected**: Lead is NOT processed. Record unchanged. Still within 30-day retention window.

### TC-FR041-008: Only active policies processed
- **Priority**: P1
- **Preconditions**: Retention policy with is_active=false. Matching records past retention.
- **Steps**: 1. Run retention job.
- **Expected**: Inactive policy skipped. Matching records not processed.

---

## 16. Optimistic Locking

### TC-OL-001: Successful update with correct version
- **Priority**: P0
- **Preconditions**: Lead exists with version=1.
- **Steps**: 1. RM-A reads lead (receives version=1). 2. RM-A sends PATCH with version=1 and updated fields.
- **Expected**: Update succeeds. version incremented to 2. Response includes new version=2.

### TC-OL-002: Conflict — HTTP 409 when version mismatch
- **Priority**: P0
- **Preconditions**: Lead exists with version=1.
- **Steps**: 1. RM-A reads lead (version=1). 2. RM-B reads lead (version=1). 3. RM-A saves changes (version becomes 2). 4. RM-B saves changes with version=1.
- **Expected**: RM-B receives HTTP 409 Conflict with body: {"error": {"code": "CONFLICT", "message": "This record has been modified by another user. Please refresh and retry.", "current_version": 2}}.

### TC-OL-003: UI conflict modal displayed on 409
- **Priority**: P0
- **Preconditions**: Two users editing same lead, conflict triggered.
- **Steps**: 1. Second user's save returns 409. 2. Check UI behavior.
- **Expected**: Modal displayed: "This record was modified by [other_user] at [timestamp]. Your changes could not be saved." Two buttons: "Refresh & Retry" and "Discard My Changes."

### TC-OL-004: Refresh & Retry preserves unsaved changes in diff view
- **Priority**: P1
- **Preconditions**: 409 Conflict received, modal displayed.
- **Steps**: 1. Click "Refresh & Retry".
- **Expected**: Record reloaded with latest data from server. User's unsaved changes shown in a diff view (side-by-side or highlighted). User can re-apply their changes and save.

### TC-OL-005: Discard My Changes reloads clean record
- **Priority**: P1
- **Preconditions**: 409 Conflict received, modal displayed.
- **Steps**: 1. Click "Discard My Changes".
- **Expected**: Record reloaded with latest server data. User's unsaved changes discarded. Form shows current DB state.

### TC-OL-006: Version field in hidden form field
- **Priority**: P1
- **Preconditions**: Lead edit form open.
- **Steps**: 1. Inspect form payload on save.
- **Expected**: Version field is included as a hidden field in the edit form. Submitted with every PATCH/PUT request.

### TC-OL-007: Optimistic locking on prospects
- **Priority**: P0
- **Preconditions**: Prospect exists with version=3.
- **Steps**: 1. User A reads prospect (version=3). 2. User B updates prospect (version becomes 4). 3. User A saves with version=3.
- **Expected**: HTTP 409 Conflict for User A.

### TC-OL-008: Version increments on every update
- **Priority**: P1
- **Preconditions**: Lead with version=1.
- **Steps**: 1. Update lead. 2. Update lead again. 3. Update lead again.
- **Expected**: version progresses: 1 -> 2 -> 3 -> 4. Each successful update increments by 1.

---

## 17. Cross-Cutting: Authorization Matrix

### TC-AUTH-001: RM can create leads
- **Priority**: P0
- **Preconditions**: RM user logged in.
- **Steps**: 1. POST /api/back-office/leads with valid data.
- **Expected**: HTTP 201 Created. Lead created successfully.

### TC-AUTH-002: Compliance Officer cannot create leads
- **Priority**: P0
- **Preconditions**: Compliance Officer user logged in.
- **Steps**: 1. POST /api/back-office/leads with valid data.
- **Expected**: HTTP 403 Forbidden. Lead not created.

### TC-AUTH-003: Ops Checker cannot modify leads
- **Priority**: P1
- **Preconditions**: Ops Checker user logged in.
- **Steps**: 1. PATCH /api/back-office/leads/:id with updates.
- **Expected**: HTTP 403 Forbidden.

### TC-AUTH-004: RM can view only own leads
- **Priority**: P0
- **Preconditions**: RM user logged in. Leads exist for multiple RMs.
- **Steps**: 1. GET /api/back-office/leads (My Leads).
- **Expected**: Response contains only leads where assigned_rm_id matches current user.

### TC-AUTH-005: Admin can view all leads
- **Priority**: P1
- **Preconditions**: Admin user logged in. Leads exist across branches.
- **Steps**: 1. GET /api/back-office/leads?scope=all.
- **Expected**: Response contains leads from all RMs and branches.

### TC-AUTH-006: Only Compliance/Admin can manage negative lists
- **Priority**: P0
- **Preconditions**: RM user logged in.
- **Steps**: 1. POST /api/back-office/negative-list with new entry.
- **Expected**: HTTP 403 Forbidden. Only Compliance Officer and Admin have Negative/Blacklist Manage permission.

### TC-AUTH-007: Only Operations Maker can bulk upload prospects
- **Priority**: P1
- **Preconditions**: RM user logged in.
- **Steps**: 1. POST /api/back-office/prospects/bulk-upload with file.
- **Expected**: HTTP 403 Forbidden. Only Ops Maker and Admin have Prospect Bulk Upload permission.

### TC-AUTH-008: Branch Manager can view all branch leads
- **Priority**: P1
- **Preconditions**: Branch Manager logged in. Multiple RMs in branch with leads.
- **Steps**: 1. GET /api/back-office/leads.
- **Expected**: Response includes all leads from RMs in the manager's branch.

---

## 18. Cross-Cutting: Audit Trail

### TC-AUDIT-001: Lead creation creates audit record
- **Priority**: P0
- **Preconditions**: No prior leads.
- **Steps**: 1. Create a new lead. 2. Query audit_records for entity_type=LEAD, action=CREATE.
- **Expected**: Audit record exists with entity_id=new lead's UUID, action=CREATE, performed_by=RM user ID, timestamp.

### TC-AUDIT-002: Lead status change creates audit record
- **Priority**: P0
- **Preconditions**: Lead in NEW status.
- **Steps**: 1. Change status to CONTACTED. 2. Query audit_records.
- **Expected**: Audit record with action=STATUS_CHANGE, old_value=NEW, new_value=CONTACTED.

### TC-AUDIT-003: Lead field edit creates field-level audit
- **Priority**: P1
- **Preconditions**: Lead with email="old@email.com".
- **Steps**: 1. Edit email to "new@email.com". 2. Query audit_records.
- **Expected**: Audit record with field=email, old_value="old@email.com", new_value="new@email.com".

### TC-AUDIT-004: Prospect drop/reactivation audited
- **Priority**: P1
- **Preconditions**: ACTIVE prospect.
- **Steps**: 1. Drop prospect. 2. Reactivate prospect. 3. Query audit trail.
- **Expected**: Two audit records: one for ACTIVE->DROPPED, one for DROPPED->REACTIVATED.

### TC-AUDIT-005: Conversion events audited
- **Priority**: P1
- **Preconditions**: Lead in CLIENT_ACCEPTED status.
- **Steps**: 1. Convert lead to prospect. 2. Query audit_records.
- **Expected**: Audit record for lead status change (CLIENT_ACCEPTED->CONVERTED) and prospect creation.

---

## 19. Cross-Cutting: Soft Delete

### TC-SOFTDEL-001: Deleted lead has deleted_at set, not physically removed
- **Priority**: P1
- **Preconditions**: Lead exists.
- **Steps**: 1. Delete lead via API. 2. Query database directly.
- **Expected**: Lead record still in DB with deleted_at=timestamp. Not returned by standard GET queries.

### TC-SOFTDEL-002: Soft-deleted records excluded from dedupe checks
- **Priority**: P1
- **Preconditions**: Lead with email="test@test.com" soft-deleted (deleted_at set). New lead being created with same email.
- **Steps**: 1. Create new lead with email="test@test.com".
- **Expected**: No dedupe match against the soft-deleted record. New lead created successfully.

---

## Appendix: Test Case Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| P0       | ~65   | Must-pass for release; blocks deployment |
| P1       | ~85   | Important; regression risks; should pass before UAT |
| P2       | ~10   | Nice-to-have; cosmetic or minor UX concerns |

## Appendix: Traceability Matrix

| FR | Test Cases | Count |
|----|-----------|-------|
| FR-001 | TC-FR001-001 to TC-FR001-008 | 8 |
| FR-002 | TC-FR002-001 to TC-FR002-006 | 6 |
| FR-003 | TC-FR003-001 to TC-FR003-008 | 8 |
| FR-004 | TC-FR004-001 to TC-FR004-008 | 8 |
| FR-005 | TC-FR005-001 to TC-FR005-006 | 6 |
| FR-006 | TC-FR006-001 to TC-FR006-008 | 8 |
| FR-007 | TC-FR007-001 to TC-FR007-007 | 7 |
| FR-018 | TC-FR018-001 to TC-FR018-006 | 6 |
| FR-019 | TC-FR019-001 to TC-FR019-004 | 4 |
| FR-020 | TC-FR020-001 to TC-FR020-006 | 6 |
| FR-021 | TC-FR021-001 to TC-FR021-005 | 5 |
| FR-022 | TC-FR022-001 to TC-FR022-008 | 8 |
| FR-023 | TC-FR023-001 to TC-FR023-007 | 7 |
| FR-024 | TC-FR024-001 to TC-FR024-006 | 6 |
| FR-038 | TC-FR038-001 to TC-FR038-008 | 8 |
| FR-041 | TC-FR041-001 to TC-FR041-008 | 8 |
| Optimistic Locking | TC-OL-001 to TC-OL-008 | 8 |
| Authorization | TC-AUTH-001 to TC-AUTH-008 | 8 |
| Audit Trail | TC-AUDIT-001 to TC-AUDIT-005 | 5 |
| Soft Delete | TC-SOFTDEL-001 to TC-SOFTDEL-002 | 2 |
| **Total** | | **~138 + cross-cutting** |
