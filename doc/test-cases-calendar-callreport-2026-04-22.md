# Test Cases: Calendar & Call Report Management Module

**Module:** Calendar & Call Report Management
**BRD Version:** v1.1 (includes addendum)
**Date:** 2026-04-22
**Author:** QA Team (auto-generated from BRD)
**Total Test Cases:** 285

---

## Table of Contents

1. [FR-001: Calendar Multi-View Display](#fr-001-calendar-multi-view-display)
2. [FR-002: Schedule a Meeting](#fr-002-schedule-a-meeting)
3. [FR-003: Edit/Cancel/Reschedule Meeting](#fr-003-editcancelreschedule-meeting)
4. [FR-004: File Call Report - Scheduled](#fr-004-file-call-report---scheduled)
5. [FR-005: Standalone Call Report](#fr-005-standalone-call-report)
6. [FR-006: Call Report Approval Workflow](#fr-006-call-report-approval-workflow)
7. [FR-007: Opportunity Capture](#fr-007-opportunity-capture)
8. [FR-008: Opportunity Bulk Upload](#fr-008-opportunity-bulk-upload)
9. [FR-009: Opportunity Auto-Expiry](#fr-009-opportunity-auto-expiry)
10. [FR-010: Expense Capture](#fr-010-expense-capture)
11. [FR-011: Feedback Capture](#fr-011-feedback-capture)
12. [FR-012: Conversation History](#fr-012-conversation-history)
13. [FR-013: Action Item Management](#fr-013-action-item-management)
14. [FR-014: Attachment Management](#fr-014-attachment-management)
15. [FR-015: Call Reports List & Search](#fr-015-call-reports-list--search)
16. [FR-016: Meeting Notifications & Reminders](#fr-016-meeting-notifications--reminders)
17. [FR-017: Supervisor Team Dashboard](#fr-017-supervisor-team-dashboard)
18. [FR-018: Mark Meeting as Completed](#fr-018-mark-meeting-as-completed)
19. [FR-019: Meeting No-Show Auto-Transition](#fr-019-meeting-no-show-auto-transition)

---

## FR-001: Calendar Multi-View Display

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR001-01 | Month view displays meetings with color-coded status dots | RM is logged in; at least 3 meetings exist in the current month with statuses: scheduled, completed, cancelled | 1. Navigate to Calendar page. 2. Select "Month" view. | Month grid renders with color-coded dots: blue (scheduled), green (completed), grey (cancelled). Each day cell shows meeting count if > 1. | P0 |
| TC-FR001-02 | Week view displays 7-column grid with time blocks | RM is logged in; at least 2 meetings exist in the current week | 1. Navigate to Calendar page. 2. Select "Week" view. | 7 columns (Mon-Sun) are displayed. Meetings appear as time blocks spanning their start-to-end times with color-coded left borders. | P0 |
| TC-FR001-03 | Day view shows hourly slots with meeting cards | RM is logged in; at least 1 meeting exists today | 1. Navigate to Calendar page. 2. Select "Day" view. | Hourly slots from 8 AM to 8 PM are displayed. Meeting cards appear in their scheduled time slots with subject, client name, and status color. | P0 |
| TC-FR001-04 | All Activities view shows paginated table | RM is logged in; 25+ meetings exist | 1. Navigate to Calendar page. 2. Select "All Activities" view. | Paginated data table displays with columns: Date, Subject, Client, Status. Default 20 rows per page. Pagination controls visible. | P0 |
| TC-FR001-05 | Clicking meeting card opens detail panel | RM is logged in; at least 1 meeting exists | 1. Navigate to Calendar page (any view). 2. Click on a meeting card/row. | Meeting detail panel opens showing: subject, reason, location, date/time, mode, relationship name, status, invitees, and action buttons. | P0 |
| TC-FR001-06 | Status legend is visible on all views | RM is logged in | 1. Navigate to Calendar page. 2. Check each view (Month, Week, Day, All Activities). | A status legend showing Scheduled (blue), Completed (green), Cancelled (grey), No Show (red), Overdue Call Report (orange) is visible at the top of every view. | P1 |
| TC-FR001-07 | Default view is Week centered on current week | RM is logged in | 1. Navigate to Calendar page for the first time in a session. | Calendar loads in Week view. The current week (Mon-Sun containing today) is displayed. Today's column is visually highlighted. | P1 |
| TC-FR001-08 | All Activities table is sortable by date, subject, status | RM is logged in; multiple meetings exist | 1. Open All Activities view. 2. Click "Date" column header. 3. Click again. 4. Click "Subject" header. 5. Click "Status" header. | Table sorts ascending on first click, descending on second click for each column. Sort indicator arrow shown on active column. | P1 |
| TC-FR001-09 | Filter by date range works | RM is logged in; meetings exist across multiple months | 1. Open Calendar (any view). 2. Open filter panel. 3. Set date range to a specific month. 4. Apply. | Only meetings within the selected date range are displayed. Meetings outside the range are hidden. | P1 |
| TC-FR001-10 | Filter by meeting reason works | RM is logged in; meetings with different reasons exist | 1. Open filter panel. 2. Select "Portfolio Review" from meeting reason filter. 3. Apply. | Only meetings with meeting_reason = 'portfolio_review' are displayed. | P1 |
| TC-FR001-11 | Filter by status works | RM is logged in; meetings with multiple statuses exist | 1. Open filter panel. 2. Select "Completed" status. 3. Apply. | Only meetings with status = 'completed' are shown. | P1 |
| TC-FR001-12 | Overdue call report meetings colored orange | RM is logged in; a completed meeting exists that is > 5 business days old with call_report_status = 'pending' | 1. Open Calendar (Month view). | The overdue meeting appears with an orange color indicator, distinct from blue (scheduled) and green (completed). | P0 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR001-13 | Empty calendar shows placeholder | RM is logged in; no meetings exist | 1. Navigate to Calendar page. 2. Check each view. | Each view displays a "No meetings scheduled" placeholder message with a "Schedule Meeting" CTA button. | P1 |
| TC-FR001-14 | Non-RM role cannot see calendar | User logged in as Compliance Officer | 1. Attempt to navigate to Calendar page. | Calendar view is not accessible; user sees either a 403 page or the menu item is hidden per permissions matrix. | P1 |

### Boundary Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR001-15 | Day view scrolls with > 10 meetings in a single day | RM is logged in; 12 meetings are scheduled for a single day | 1. Open Day view for that day. | All 12 meetings are rendered. The day view scrolls vertically to accommodate all meeting cards without overlap. | P2 |
| TC-FR001-16 | Month view renders within 2 seconds with 200 meetings | RM is logged in; 200 meetings exist in a single month | 1. Open Month view for that month. 2. Measure render time. | Calendar renders completely within 2 seconds. No visible lag or incomplete rendering. | P1 |
| TC-FR001-17 | Past 90 days and future 365 days loaded | RM is logged in; meetings exist 89 days ago and 364 days in the future | 1. Navigate to Month view. 2. Navigate backward to 89 days ago. 3. Navigate forward to 364 days in the future. | Both meetings are visible without additional loading. Meetings older than 90 days require pagination/lazy-load. | P2 |

---

## FR-002: Schedule a Meeting

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR002-01 | Schedule Meeting button visible on all calendar views | RM is logged in | 1. Open Month view - check for button. 2. Open Week view - check. 3. Open Day view - check. 4. Open All Activities - check. | "Schedule Meeting" button is visible and clickable on all four calendar views. | P0 |
| TC-FR002-02 | Create meeting with all required fields | RM is logged in | 1. Click "Schedule Meeting". 2. Enter subject: "Q2 Review - Sharma". 3. Select reason: "Portfolio Review". 4. Enter location: "BKC Office". 5. Set start: tomorrow 10:00 AM. 6. Set end: tomorrow 11:30 AM. 7. Select meeting type: "CIF". 8. Select mode: "In-Person". 9. Search and select relationship: "Sharma Family Trust". 10. Add self as Required Invitee. 11. Click Save. | Meeting is created with status = 'scheduled'. Toast notification: "Meeting scheduled successfully." Modal closes. Meeting appears on calendar immediately with blue color. | P0 |
| TC-FR002-03 | Meeting reason dropdown contains all expected values | RM is logged in | 1. Click "Schedule Meeting". 2. Open meeting reason dropdown. | Dropdown contains exactly: Client Call - New, Client Call - Existing, Branch Visit, Portfolio Review, Service Request, Campaign Details, Others. | P0 |
| TC-FR002-04 | Selecting Others reveals free-text Specify Reason field | RM is logged in | 1. Click "Schedule Meeting". 2. Select meeting reason = "Others". | A free-text input "Specify Reason" appears and is marked as mandatory (red asterisk). | P0 |
| TC-FR002-05 | Meeting type dropdown contains expected values | RM is logged in | 1. Click "Schedule Meeting". 2. Open meeting type dropdown. | Dropdown contains: CIF, Lead, Prospect, Others. | P0 |
| TC-FR002-06 | Selecting CIF enables type-ahead search on relationship | RM is logged in; CIF records exist in CRM | 1. Click "Schedule Meeting". 2. Select meeting type = "CIF". 3. Start typing a customer name in the relationship field. | Type-ahead search activates, showing matching CIF records from the CRM. Selecting one populates relationship_id and relationship_name. | P0 |
| TC-FR002-07 | Selecting Others for meeting type allows free text relationship | RM is logged in | 1. Click "Schedule Meeting". 2. Select meeting type = "Others". 3. Type a name in the relationship field. | Relationship field becomes a free-text input (no type-ahead search). RM can type any name. | P1 |
| TC-FR002-08 | Contact phone and email auto-populate from relationship | RM is logged in; CIF "Sharma" has phone and email on file | 1. Click "Schedule Meeting". 2. Select type = "CIF". 3. Select relationship = "Sharma Family Trust". | Contact phone and email fields auto-populate with values from the CRM record. Both fields remain editable. | P1 |
| TC-FR002-09 | All Day checkbox disables time pickers | RM is logged in | 1. Click "Schedule Meeting". 2. Check "All Day" checkbox. | Time picker fields are disabled/hidden. Start time is set to 00:00 and end time to 23:59 of the selected date. | P1 |
| TC-FR002-10 | Add Required and Optional invitees | RM is logged in; other users exist in the system | 1. Click "Schedule Meeting". 2. In Required Invitees, search and add self (rm-user-001). 3. In Optional Invitees, search and add supervisor (sup-user-010). 4. Complete other fields. 5. Save. | Meeting is created with two invitees: one required (rsvp_status = 'accepted' for creator), one optional (rsvp_status = 'pending'). | P0 |
| TC-FR002-11 | Meeting appears on calendar immediately after save | RM is logged in; on Week view | 1. Click "Schedule Meeting". 2. Fill in all required fields with a date/time in the current week. 3. Save. | Modal closes. The new meeting card appears on the Week view at the correct time slot without requiring a page refresh. | P0 |
| TC-FR002-12 | ConversationHistory entry created on meeting creation | RM is logged in | 1. Schedule a new meeting for CIF "Sharma". 2. Navigate to Conversation History for "Sharma". | A ConversationHistory entry exists with interaction_type = 'meeting_scheduled', the correct interaction_date, and a summary referencing the meeting subject. | P1 |
| TC-FR002-13 | Duplicate meeting warning within +-30 minutes | RM is logged in; a meeting exists tomorrow 10:00-11:00 | 1. Click "Schedule Meeting". 2. Set start time to tomorrow 10:15. 3. Complete other fields. | A yellow warning banner appears: "You have another meeting within 30 minutes of this time." The RM can still save (warning, not block). | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR002-14 | Cannot save meeting without subject | RM is logged in | 1. Click "Schedule Meeting". 2. Leave subject blank. 3. Fill all other required fields. 4. Click Save. | Inline validation error on subject field: "Subject is required." Meeting is not created. | P0 |
| TC-FR002-15 | Cannot save meeting with subject < 3 characters | RM is logged in | 1. Click "Schedule Meeting". 2. Enter subject: "AB" (2 chars). 3. Fill all other required fields. 4. Click Save. | Validation error: "Subject must be at least 3 characters." | P1 |
| TC-FR002-16 | Cannot save meeting with start time in the past | RM is logged in | 1. Click "Schedule Meeting". 2. Set start time to yesterday 10:00. 3. Fill other fields. 4. Click Save. | Validation error: "Start date/time must be in the future." | P0 |
| TC-FR002-17 | Cannot save meeting with end time before start time | RM is logged in | 1. Click "Schedule Meeting". 2. Set start: tomorrow 14:00. 3. Set end: tomorrow 12:00. 4. Click Save. | Validation error: "End date/time must be after start date/time." | P0 |
| TC-FR002-18 | Cannot save meeting without at least one Required Invitee | RM is logged in | 1. Click "Schedule Meeting". 2. Fill all fields but add no invitees. 3. Click Save. | Validation error: "At least one required invitee must be added." | P0 |
| TC-FR002-19 | Cannot save meeting with reason Others but no specification | RM is logged in | 1. Click "Schedule Meeting". 2. Select reason = "Others". 3. Leave "Specify Reason" blank. 4. Fill other fields. 5. Click Save. | Validation error: "Please specify the meeting reason." | P0 |
| TC-FR002-20 | Meeting duration exceeds 8 hours (non-all-day) | RM is logged in | 1. Click "Schedule Meeting". 2. Set start: tomorrow 08:00. 3. Set end: tomorrow 17:00 (9 hours). 4. is_all_day = false. 5. Click Save. | Validation error: "Meeting duration cannot exceed 8 hours. Use 'All Day' for full-day meetings." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR002-21 | Relationship has no contact details on file | RM is logged in; CIF "TestClient" has no phone/email | 1. Click "Schedule Meeting". 2. Select type = "CIF". 3. Select relationship = "TestClient". | Warning banner: "Contact details not available. Please enter manually." Phone and email fields remain empty but editable. | P2 |
| TC-FR002-22 | Calendar conflict warning allows save | RM is logged in; meeting exists tomorrow 10:00-11:00 | 1. Click "Schedule Meeting". 2. Set start: tomorrow 10:30 (overlapping). 3. Complete all fields. 4. Save. | Yellow warning about conflict is shown. RM clicks Save again to confirm. Meeting is created successfully despite conflict. | P2 |
| TC-FR002-23 | Subject at max length 255 characters | RM is logged in | 1. Click "Schedule Meeting". 2. Enter subject with exactly 255 characters. 3. Complete other fields. 4. Save. | Meeting is created successfully. Subject is stored in full (255 chars). | P2 |
| TC-FR002-24 | Remarks at max length 2000 characters | RM is logged in | 1. Click "Schedule Meeting". 2. Enter remarks with exactly 2000 characters. 3. Complete other fields. 4. Save. | Meeting is created. Remarks stored in full. | P2 |

---

## FR-003: Edit/Cancel/Reschedule Meeting

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR003-01 | Edit button visible on scheduled meetings | RM is logged in; a meeting with status = 'scheduled' exists | 1. Open meeting detail. | Edit button is visible and clickable. | P0 |
| TC-FR003-02 | Edit meeting subject and location | RM is logged in; a scheduled meeting exists | 1. Click Edit on a scheduled meeting. 2. Change subject to "Updated Review". 3. Change location to "New Office". 4. Save. | Meeting is updated. New subject and location are displayed. updated_at is refreshed. | P0 |
| TC-FR003-03 | Cancel meeting with confirmation dialog | RM is logged in; a scheduled meeting exists | 1. Open meeting detail. 2. Click "Cancel". | Confirmation dialog: "Are you sure you want to cancel this meeting? This cannot be undone." With Confirm and Dismiss buttons. | P0 |
| TC-FR003-04 | Confirm cancellation changes status to cancelled | RM is logged in; a scheduled meeting exists | 1. Click "Cancel" on meeting. 2. Confirm in dialog. | Meeting status changes to 'cancelled'. Meeting shows as greyed-out on calendar with strikethrough on subject. ConversationHistory entry created with interaction_type = 'meeting_cancelled'. | P0 |
| TC-FR003-05 | Reschedule meeting to new date/time | RM is logged in; a scheduled meeting exists | 1. Click Edit on meeting. 2. Change start/end date to a future date. 3. Save. | Meeting date/time is updated. All other fields remain unchanged. A ConversationHistory entry is created noting the reschedule (interaction_type = 'meeting_scheduled' or 'rescheduled'). | P0 |
| TC-FR003-06 | Supervisor can edit RM's meeting | Supervisor is logged in; RM's scheduled meeting exists in supervisor's branch | 1. Navigate to the RM's meeting. 2. Click Edit. 3. Change location. 4. Save. | Meeting is updated. Supervisor's action is recorded in audit log. | P1 |
| TC-FR003-07 | Invitees receive cancellation notification | RM is logged in; a meeting with 2 invitees exists | 1. Cancel the meeting. 2. Confirm cancellation. | Both invitees receive cancellation notifications (email + in-app) with message: "Meeting cancelled - {subject}." | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR003-08 | Edit button not visible on completed meetings | RM is logged in; a meeting with status = 'completed' exists | 1. Open meeting detail. | Edit and Cancel buttons are not visible. | P0 |
| TC-FR003-09 | Edit button not visible on cancelled meetings | RM is logged in; a cancelled meeting exists | 1. Open meeting detail. | Edit and Cancel buttons are not visible. Meeting cannot be re-opened. | P0 |
| TC-FR003-10 | Cannot cancel meeting with existing call report | RM is logged in; a completed meeting with a filed call report exists | 1. Attempt to access Cancel action. | Cancel button is not available. If forced via API, returns 400: "Cannot cancel a meeting with an existing call report." | P0 |
| TC-FR003-11 | Non-creator non-supervisor cannot edit meeting | RM-B is logged in; meeting created by RM-A exists | 1. RM-B navigates to RM-A's meeting. 2. Attempt to edit. | Edit button is not visible. API returns 403 if attempted directly. | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR003-12 | All invitees decline but meeting stays active | RM is logged in; meeting with 2 invitees exists; both decline | 1. Check meeting status after all invitees decline. | Meeting remains in 'scheduled' status. It is the RM's discretion to cancel. No automatic status change. | P2 |
| TC-FR003-13 | Reschedule to same day different time | RM is logged in; meeting exists | 1. Edit meeting. 2. Change only the start time (same day). 3. Save. | Meeting is updated. ConversationHistory entry notes the time change. | P2 |

---

## FR-004: File Call Report - Scheduled

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR004-01 | File Call Report button visible on completed meeting with pending CR status | RM is logged in; meeting with status = 'completed' and call_report_status = 'pending' exists | 1. Open meeting detail. | "File Call Report" button is visible and clickable. | P0 |
| TC-FR004-02 | Pre-populated fields from meeting are read-only | RM is logged in; completed meeting exists | 1. Click "File Call Report" on a completed meeting. | Subject, meeting reason, date/time, location, meeting type, mode, relationship name are pre-populated and displayed as read-only. | P0 |
| TC-FR004-03 | Submit call report within threshold (< 5 business days) | RM is logged in; meeting completed 2 business days ago | 1. Click "File Call Report". 2. Enter person_met: "Mr. Sharma". 3. Enter summary (25+ chars): "Discussed Q1 performance and future allocation plans." 4. Click Submit. | Call report status = 'completed'. requires_approval = false. Meeting's call_report_status changes to 'filed'. ConversationHistory entry created. Toast: "Call report submitted successfully." | P0 |
| TC-FR004-04 | Yellow banner warning when exceeding threshold | RM is logged in; meeting completed 7 business days ago | 1. Click "File Call Report". | Yellow banner: "This call report exceeds the 5-day filing window and will require supervisor approval." | P0 |
| TC-FR004-05 | Submit late call report routes to supervisor approval | RM is logged in; meeting completed 7 business days ago | 1. Click "File Call Report". 2. Fill all required fields. 3. Click Submit. | Call report status = 'pending_approval'. requires_approval = true. A CallReportApproval record is created with status = 'pending'. Supervisor is notified. | P0 |
| TC-FR004-06 | Next meeting auto-creates new meeting record | RM is logged in; completed meeting exists | 1. Click "File Call Report". 2. Fill required fields. 3. Set next_meeting_start: future date 10:00. 4. Set next_meeting_end: future date 11:00. 5. Submit. | Call report is submitted. A new Meeting record is auto-created with the specified date/time, inheriting relationship details. New meeting appears on calendar. | P1 |
| TC-FR004-07 | Save as draft and resume later | RM is logged in; completed meeting exists | 1. Click "File Call Report". 2. Fill some fields. 3. Click "Save Draft". 4. Navigate away. 5. Return to the meeting card. 6. Click "Continue Draft". | Draft is saved. On return, the meeting card shows "Continue Draft" button. Clicking it reopens the form with all previously entered data preserved. | P1 |
| TC-FR004-08 | Summary of discussion mandatory validation | RM is logged in; completed meeting exists | 1. Click "File Call Report". 2. Leave summary blank. 3. Click Submit. | Validation error: "Summary of discussion is required." | P0 |
| TC-FR004-09 | ConversationHistory entry auto-created on submit | RM is logged in | 1. File and submit a call report for a completed meeting. 2. Navigate to Conversation History for the client. | Entry exists with interaction_type = 'call_report_filed', correct date, and summary referencing the call report subject. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR004-10 | File Call Report button not visible on scheduled meeting | RM is logged in; meeting with status = 'scheduled' exists | 1. Open meeting detail. | "File Call Report" button is not visible (meeting must be completed first per FR-018). | P0 |
| TC-FR004-11 | File Call Report button not visible when CR already filed | RM is logged in; meeting with call_report_status = 'filed' exists | 1. Open meeting detail. | "File Call Report" button is not visible. Only "View Call Report" link is shown. | P0 |
| TC-FR004-12 | Summary under 20 characters rejected | RM is logged in; completed meeting exists | 1. Click "File Call Report". 2. Enter summary: "Short" (5 chars). 3. Submit. | Validation error: "Summary of discussion must be at least 20 characters." | P0 |
| TC-FR004-13 | Cannot file second call report for same meeting | RM is logged in; meeting already has a call report | 1. Attempt POST /api/v1/call-reports with the same meeting_id. | API returns 409 CONFLICT: "A call report already exists for this meeting." | P0 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR004-14 | Unsaved changes warning on navigation | RM is logged in; call report form has unsaved data | 1. Start filling call report form. 2. Click browser back or navigate away. | Browser confirmation dialog: "Discard changes? You have unsaved changes that will be lost." | P1 |
| TC-FR004-15 | Meeting cancelled after form opened | RM-A opens call report form; RM-B (supervisor) cancels the meeting concurrently | 1. RM-A fills the form. 2. RM-A clicks Submit. | Error: "This meeting has been cancelled. Call report cannot be submitted." Form redirects to calendar. | P2 |
| TC-FR004-16 | next_meeting_end required when next_meeting_start provided | RM is logged in | 1. Click "File Call Report". 2. Set next_meeting_start but leave next_meeting_end blank. 3. Submit. | Validation error: "Next meeting end time is required when start time is provided." | P1 |
| TC-FR004-17 | Draft auto-save on inactivity | RM is logged in; call report form open with data | 1. Enter data in the form. 2. Stop interacting for 30+ seconds. | Draft is automatically saved (debounced at 30-second interval per SystemConfig). No visible interruption; subtle "Draft saved" indicator shown. | P2 |
| TC-FR004-18 | Only one draft per meeting | RM is logged in; a draft call report exists for meeting X | 1. Attempt to create a new call report for meeting X via API. | API returns 409 CONFLICT pointing to the existing draft. | P1 |

---

## FR-005: Standalone Call Report

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR005-01 | New Call Report button accessible from calendar toolbar | RM is logged in | 1. Navigate to Calendar page. 2. Look for "New Call Report" button in toolbar. | Button is visible and clickable. | P0 |
| TC-FR005-02 | New Call Report button accessible from call reports list | RM is logged in | 1. Navigate to Call Reports list page. 2. Look for "New Call Report" button. | Button is visible and clickable. | P0 |
| TC-FR005-03 | All fields are editable on standalone form | RM is logged in | 1. Click "New Call Report". | All fields (subject, reason, date/time, location, type, mode, relationship, person_met, summary, etc.) are editable. No read-only pre-population. | P0 |
| TC-FR005-04 | report_type automatically set to standalone | RM is logged in | 1. Click "New Call Report". 2. Fill all required fields. 3. Submit. | Call report is created with report_type = 'standalone' and meeting_id = NULL. | P0 |
| TC-FR005-05 | Standalone report submitted as completed immediately | RM is logged in | 1. Click "New Call Report". 2. Fill all required fields. 3. Submit. | Call report status = 'completed'. requires_approval = false (5-day rule does not apply). | P0 |
| TC-FR005-06 | ConversationHistory entry auto-created | RM is logged in | 1. Submit a standalone call report for client "Kapoor". 2. View Conversation History for "Kapoor". | Entry exists with interaction_type = 'call_report_filed' and reference to the standalone call report. | P1 |
| TC-FR005-07 | Mode of meeting defaults to telephone | RM is logged in | 1. Click "New Call Report". | Mode of meeting field defaults to "Telephone" but is editable. | P2 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR005-08 | Standalone report does not create a Meeting record | RM is logged in | 1. Submit a standalone call report. 2. Check meetings list. | No new Meeting record is created. The standalone call report has meeting_id = NULL. | P0 |
| TC-FR005-09 | Standalone report requires summary >= 20 chars | RM is logged in | 1. Click "New Call Report". 2. Enter summary: "Too short." (10 chars). 3. Submit. | Validation error: "Summary of discussion must be at least 20 characters." | P0 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR005-10 | Standalone report with past date > 90 days | RM is logged in | 1. Click "New Call Report". 2. Set start_date_time to 100 days ago. 3. Fill other fields. 4. Submit. | Warning shown: "This interaction date is more than 90 days in the past." RM can still submit. Call report is created. | P2 |
| TC-FR005-11 | Start/end date can be in the past for standalone | RM is logged in | 1. Click "New Call Report". 2. Set start: yesterday 10:00. 3. Set end: yesterday 11:00. 4. Fill other fields. 5. Submit. | Call report is created successfully (no "must be in the future" validation for standalone reports). | P1 |

---

## FR-006: Call Report Approval Workflow

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR006-01 | Supervisor dashboard shows Pending Approval and My Approvals | Supervisor is logged in; late-filed call reports exist in their branch | 1. Navigate to Supervisor Approval workspace. | Two sections/tabs visible: "Pending Approval Listing" (unclaimed reports) and "My Approvals" (reports claimed by this supervisor). | P0 |
| TC-FR006-02 | Supervisor claims a pending report | Supervisor is logged in; a pending_approval call report exists | 1. Navigate to Pending Approval tab. 2. Click "Claim" on a report row. | Report moves to "My Approvals" tab. approval.status = 'claimed'. approval.supervisor_id is set. approval.claimed_at is set. Report is locked from other supervisors. | P0 |
| TC-FR006-03 | Supervisor approves a claimed report | Supervisor is logged in; a claimed report exists in "My Approvals" | 1. Click "View" on the claimed report. 2. Review details. 3. Click "Approve". | call_report.status = 'approved'. approval.status = 'approved'. approval.decided_at is set. RM is notified (email + in-app). ConversationHistory entry created. | P0 |
| TC-FR006-04 | Supervisor rejects with comments | Supervisor is logged in; a claimed report exists | 1. Click "View" on the claimed report. 2. Click "Reject". 3. Enter reviewer_comments: "Summary too brief; add risk appetite discussion details." (50+ chars). 4. Confirm. | call_report.status = 'rejected'. approval.status = 'rejected'. reviewer_comments saved. RM notified with rejection comments. | P0 |
| TC-FR006-05 | Rejected report appears in RM's Rejected queue | RM is logged in; their call report was rejected | 1. Navigate to Call Reports list. 2. Filter by status = "Rejected". | The rejected call report appears with the reviewer's comments visible. An "Edit & Resubmit" action is available. | P0 |
| TC-FR006-06 | Re-submission of rejected report starts new approval cycle | RM is logged in; a rejected call report exists | 1. Edit the rejected call report. 2. Update summary. 3. Re-submit. | A new CallReportApproval record is created with status = 'pending'. call_report.status = 'pending_approval'. Supervisor notified again. | P0 |
| TC-FR006-07 | Claimed report detail shows read-only view | Supervisor is logged in; a claimed report exists | 1. Open a claimed report from "My Approvals". | Full call report details are displayed in read-only mode. Only Approve and Reject buttons are actionable. Reviewer comments textarea is available. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR006-08 | Reject without reviewer comments fails | Supervisor is logged in; a claimed report exists | 1. Click "Reject". 2. Leave reviewer_comments blank. 3. Confirm. | Validation error: "Reviewer comments are required for rejection (minimum 20 characters)." | P0 |
| TC-FR006-09 | Supervisor from different branch cannot claim | Supervisor-B is logged in (different branch); pending report from Branch-A exists | 1. Attempt to claim the report. | Report is not visible in Supervisor-B's pending list. API returns 403 if attempted directly. | P0 |
| TC-FR006-10 | RM cannot access approval workspace | RM is logged in (non-supervisor) | 1. Navigate to Supervisor Approval workspace. | Page is not accessible; menu item hidden or 403 returned. | P1 |
| TC-FR006-11 | Supervisor cannot claim more than 20 uncompleted reports | Supervisor has already claimed 20 pending reports | 1. Attempt to claim a 21st report. | Error: "Maximum active claims reached (20). Please complete existing reviews first." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR006-12 | Claimed report auto-unclaimed after 2 business days | Supervisor claimed a report 2+ business days ago without action | 1. Wait for auto-unclaim process. 2. Check the report. | approval.status reverts to 'pending'. supervisor_id cleared. Report appears back in the Pending Approval pool. Supervisor notified. | P1 |
| TC-FR006-13 | RM updates call report while claimed by supervisor | RM edits a draft that is currently claimed by supervisor | 1. RM edits the call report. 2. Supervisor opens the same report. | Supervisor sees a banner: "Report updated by RM — please re-review." The supervisor can then proceed to approve/reject the updated version. | P2 |
| TC-FR006-14 | Rejection comment minimum 20 characters enforced | Supervisor is logged in | 1. Reject a report with comments: "Too short" (9 chars). | Validation error: "Reviewer comments must be at least 20 characters." | P1 |

---

## FR-007: Opportunity Capture

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR007-01 | Add Opportunity from call report form | RM is logged in; call report form is open | 1. Click "Add Opportunity" in the Opportunities section. 2. Select type: "CIF". 3. Select relationship: "Sharma Family Trust". 4. Enter sub_product: "Equity MF - Large Cap". 5. Set discovered amount: 5000000. 6. Set opportunity_date: today. 7. Set due_date: 2 months from now. 8. Select stage: "Interested". 9. Save. | Opportunity is created with status = 'open'. ConversationHistory entry created with interaction_type = 'opportunity_created'. | P0 |
| TC-FR007-02 | Add Opportunity from Opportunities list page | RM is logged in | 1. Navigate to Opportunities list. 2. Click "Add Opportunity". 3. Fill all fields. 4. Save. | Opportunity created with status = 'open'. Appears in the list immediately. | P0 |
| TC-FR007-03 | Stage dropdown has all expected values | RM is logged in; opportunity form is open | 1. Open stage dropdown. | Values: Interested, To be approached, Won - Doc in Process, Won - Doc completed, Declined, Not Proceeding. | P0 |
| TC-FR007-04 | Status auto-set to open on creation | RM is logged in | 1. Create a new opportunity. | opportunity.status = 'open' automatically. | P1 |
| TC-FR007-05 | Editing opportunity updates ConversationHistory | RM is logged in; opportunity exists | 1. Edit an existing opportunity. 2. Change stage from "Interested" to "To be approached". 3. Save. | Opportunity updated. ConversationHistory entry created with interaction_type = 'opportunity_updated'. | P1 |
| TC-FR007-06 | Won Doc completed makes opportunity_closed mandatory | RM is logged in; opportunity exists | 1. Edit opportunity. 2. Set stage to "Won - Doc completed". 3. Leave opportunity_closed blank. 4. Save. | Validation error: "Closed amount is required when stage is 'Won - Doc completed'." | P0 |
| TC-FR007-07 | Setting stage to Won Doc completed with valid closed amount | RM is logged in; opportunity with discovered = 5000000 | 1. Set stage to "Won - Doc completed". 2. Enter opportunity_closed: 4500000. 3. Save. | Opportunity updated. status changes to 'closed'. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR007-08 | Discovered amount must be > 0 | RM is logged in | 1. Create opportunity. 2. Set opportunity_discovered: 0. 3. Save. | Validation error: "Discovered amount must be greater than 0." | P0 |
| TC-FR007-09 | Discovered amount negative value rejected | RM is logged in | 1. Create opportunity. 2. Set opportunity_discovered: -5000. 3. Save. | Validation error: "Discovered amount must be greater than 0." | P1 |
| TC-FR007-10 | Closed amount cannot exceed discovered amount | RM is logged in; opportunity with discovered = 5000000 | 1. Set opportunity_closed: 6000000. 2. Save. | Validation error: "Closed amount cannot exceed discovered amount." | P0 |
| TC-FR007-11 | Due date before opportunity date rejected | RM is logged in | 1. Create opportunity. 2. Set opportunity_date: 2026-04-22. 3. Set due_date: 2026-04-15. 4. Save. | Validation error: "Due date must be on or after the opportunity date." | P0 |
| TC-FR007-12 | Opportunity date in the future rejected | RM is logged in | 1. Create opportunity. 2. Set opportunity_date to tomorrow. 3. Save. | Validation error: "Opportunity date cannot be in the future." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR007-13 | Default currency is INR when not specified | RM is logged in | 1. Create opportunity. 2. Do not explicitly select currency. 3. Save. | Opportunity created with currency = 'INR' (default). | P2 |
| TC-FR007-14 | Duplicate sub_product + relationship within 30 days warning | RM is logged in; opportunity "Equity MF - Large Cap" for "Sharma" was created 10 days ago | 1. Create another opportunity with same sub_product and relationship. | Warning displayed: "A similar opportunity exists for this client within the last 30 days." RM can still save. | P2 |

---

## FR-008: Opportunity Bulk Upload

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR008-01 | Upload valid XLSX file | RM is logged in; valid .xlsx file with 10 rows and correct column headers | 1. Navigate to Opportunities list. 2. Click "Upload". 3. Drag-and-drop the .xlsx file. 4. Wait for processing. | Processing indicator shown. On completion: "10 rows imported, 0 rows failed." All 10 opportunities appear in the list with status = 'open'. | P0 |
| TC-FR008-02 | Download template file | RM is logged in | 1. Navigate to Opportunities upload dialog. 2. Click "Download Template". | A .xlsx template file downloads with column headers matching Opportunity entity fields: opportunity_type, relationship_id, relationship_name, sub_product, etc. | P0 |
| TC-FR008-03 | Partial success - valid rows imported, failed rows reported | RM is logged in; .xlsx with 10 rows, 2 have invalid data (negative amount) | 1. Upload the file. 2. Wait for processing. | Summary: "8 rows imported, 2 rows failed." Error log available for download listing: row number, field, error description for the 2 failed rows. | P0 |
| TC-FR008-04 | Failed rows downloadable as error log | RM is logged in; upload completed with some failures | 1. Click "Download Error Log" after upload completion. | A file downloads with columns: Row Number, Field, Error Description for each failed row. | P1 |
| TC-FR008-05 | Processing indicator shown during upload | RM is logged in | 1. Upload a file. | A processing indicator (spinner/progress bar) is displayed until processing completes. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR008-06 | Reject non-XLS/XLSX file | RM is logged in; a .csv file prepared | 1. Attempt to upload a .csv file. | Error: "Only .xls and .xlsx files are accepted." File is not processed. | P0 |
| TC-FR008-07 | Reject file larger than 5 MB | RM is logged in; a 6 MB .xlsx file prepared | 1. Attempt to upload the file. | Error: "File size exceeds the 5 MB limit." | P0 |
| TC-FR008-08 | Reject file with more than 500 rows | RM is logged in; .xlsx with 501 rows | 1. Upload the file. | Error: "Maximum 500 rows per upload. Your file contains 501 rows." | P1 |
| TC-FR008-09 | All rows invalid shows appropriate error | RM is logged in; .xlsx with 5 rows, all invalid | 1. Upload the file. | Summary: "0 rows imported, 5 rows failed." Message: "No valid records found. Please check the template format." | P1 |
| TC-FR008-10 | Corrupt/unreadable file rejected | RM is logged in; a corrupted .xlsx file | 1. Upload the file. | Error: "Unable to parse file. Please use the provided template." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR008-11 | Upload exactly 500 rows | RM is logged in; .xlsx with 500 valid rows | 1. Upload the file. | All 500 rows processed. Completes within 30 seconds. Summary: "500 rows imported, 0 rows failed." | P2 |
| TC-FR008-12 | Rate limit - max 2 uploads per hour | RM is logged in; already uploaded 2 files in the last hour | 1. Attempt a third upload. | Error: "Upload rate limit exceeded. Please try again later." | P2 |
| TC-FR008-13 | Notification sent on upload completion | RM is logged in; upload is processing | 1. Wait for processing to complete. | In-app notification: "Your opportunity upload is complete. X imported, Y failed. [View Details]." | P1 |

---

## FR-009: Opportunity Auto-Expiry

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR009-01 | Batch expires open opportunities past due date | 3 opportunities: A (open, due yesterday), B (open, due today), C (open, due tomorrow) | 1. Run the nightly batch job. | Opportunity A: status = 'expired'. Opportunity B: remains 'open' (due_date = current_business_date, not less). Opportunity C: remains 'open'. | P0 |
| TC-FR009-02 | Batch summary email sent to RM | RM has 2 opportunities that expired in tonight's batch | 1. Batch runs. 2. Check RM's email. | RM receives an email listing the 2 expired opportunities with details: sub_product, relationship_name, due_date, discovered_amount. | P1 |
| TC-FR009-03 | Expired opportunities show distinct visual indicator | Expired opportunities exist in the list | 1. Navigate to Opportunities list. | Expired opportunities display with a muted color/strikethrough or appear in a separate "Expired" tab with a red badge. | P1 |
| TC-FR009-04 | Batch runs at configurable time | SystemConfig has batch time configured | 1. Verify batch schedule. | Batch runs daily at the time specified in SystemConfig (default: 01:00 UTC). | P2 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR009-05 | Closed opportunities not expired | Opportunity with status = 'closed' and due_date in the past | 1. Run batch. | Opportunity remains 'closed'. Not affected by auto-expiry. | P0 |
| TC-FR009-06 | Aborted opportunities not expired | Opportunity with status = 'aborted' and due_date in the past | 1. Run batch. | Opportunity remains 'aborted'. Not affected by auto-expiry. | P1 |
| TC-FR009-07 | Auto-expiry disabled via SystemConfig | SystemConfig: opportunity_auto_expiry_enabled = 'false'; open opportunity with past due_date | 1. Run batch. | No opportunities are expired. Batch exits without processing. | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR009-08 | Batch is idempotent on re-run | Batch already ran and expired 5 opportunities | 1. Re-run the batch. | No double-processing. The 5 already-expired opportunities are skipped. No duplicate notifications. | P1 |
| TC-FR009-09 | Batch failure mid-run recovers on re-run | Batch fails after expiring 3 of 5 eligible opportunities | 1. Re-run the batch. | Remaining 2 opportunities are expired. The 3 already-expired are skipped. | P2 |

---

## FR-010: Expense Capture

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR010-01 | Add expense from call report form | RM is logged in; call report form open | 1. Click "Add Expense" in Expenses section. 2. Select type: "Client Entertainment". 3. Set date: today. 4. Enter amount: 3500. 5. Enter purpose: "Lunch with client". 6. Select entity_type: "CIF". 7. Select relationship. 8. Save. | Expense created and linked to the call report. Amount = 3500.00, currency = 'INR'. | P0 |
| TC-FR010-02 | Add expense from Expenses list page | RM is logged in | 1. Navigate to Expenses list. 2. Click "Add Expense". 3. Fill required fields. 4. Save. | Expense created. Appears in the list. | P0 |
| TC-FR010-03 | Conveyance type reveals additional fields | RM is logged in; expense form open | 1. Select expense type: "Conveyance". | Additional fields appear: From Place, To Place, Transport Mode, Distance (km). All marked as required. | P0 |
| TC-FR010-04 | Transport mode dropdown values | RM is logged in; expense type = Conveyance | 1. Open transport mode dropdown. | Values: Car, Taxi, Bus, Train, Flight, Auto, Others. | P0 |
| TC-FR010-05 | Create conveyance expense with all fields | RM is logged in | 1. Select type: "Conveyance". 2. Set date: today. 3. Amount: 850. 4. Purpose: "Travel to client office for meeting". 5. From Place: "BKC Office". 6. To Place: "Andheri West Branch". 7. Transport Mode: "Taxi". 8. Distance: 15.5 km. 9. Select relationship. 10. Save. | Expense created with all conveyance fields populated. | P0 |
| TC-FR010-06 | Expenses list supports filters | RM is logged in; expenses of different types and dates exist | 1. Navigate to Expenses list. 2. Filter by type: "Conveyance". 3. Filter by date range: current month. | Only conveyance expenses within the current month are displayed. | P1 |
| TC-FR010-07 | Expense type dropdown has expected values | RM is logged in | 1. Open expense type dropdown. | Values: Client Entertainment, Conveyance, Festive Events, Others. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR010-08 | Expense date in the future rejected | RM is logged in | 1. Set expense_date to tomorrow. 2. Fill other fields. 3. Save. | Validation error: "Expense date cannot be in the future." | P0 |
| TC-FR010-09 | Amount zero rejected | RM is logged in | 1. Set amount: 0. 2. Fill other fields. 3. Save. | Validation error: "Amount must be greater than 0." | P0 |
| TC-FR010-10 | Amount negative rejected | RM is logged in | 1. Set amount: -500. 2. Save. | Validation error: "Amount must be greater than 0." | P1 |
| TC-FR010-11 | Conveyance without From Place rejected | RM is logged in | 1. Select type: "Conveyance". 2. Leave From Place blank. 3. Fill other fields. 4. Save. | Validation error: "From Place is required for Conveyance expenses." | P0 |
| TC-FR010-12 | Conveyance without To Place rejected | RM is logged in | 1. Select type: "Conveyance". 2. Leave To Place blank. 3. Fill other fields. 4. Save. | Validation error: "To Place is required for Conveyance expenses." | P0 |
| TC-FR010-13 | Conveyance without Transport Mode rejected | RM is logged in | 1. Select type: "Conveyance". 2. Leave transport mode blank. 3. Save. | Validation error: "Transport Mode is required for Conveyance expenses." | P0 |
| TC-FR010-14 | Conveyance with distance = 0 rejected | RM is logged in | 1. Select type: "Conveyance". 2. Set distance: 0. 3. Save. | Validation error: "Distance must be greater than 0 km." | P1 |
| TC-FR010-15 | Purpose less than 5 characters rejected | RM is logged in | 1. Enter purpose: "eat" (3 chars). 2. Save. | Validation error: "Purpose must be at least 5 characters." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR010-16 | Changing type from Conveyance clears conditional fields | RM is logged in; expense form has Conveyance data entered | 1. Select type: "Conveyance". 2. Fill From Place, To Place, Transport Mode, Distance. 3. Change type to "Client Entertainment". | Conditional fields (From Place, To Place, Transport Mode, Distance) are hidden and their values are cleared. | P1 |
| TC-FR010-17 | Call report linkage optional for non-conveyance | RM is logged in | 1. Create a "Client Entertainment" expense without linking to a call report. | Expense is created successfully with call_report_id = NULL. | P2 |

---

## FR-011: Feedback Capture

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR011-01 | Feedback button on meeting detail view | RM is logged in; a meeting exists | 1. Open meeting detail view. | "Feedback" button is visible. | P0 |
| TC-FR011-02 | Submit feedback from calendar with sentiment | RM is logged in | 1. Open meeting detail. 2. Click "Feedback". 3. Enter text: "Client very happy with portfolio performance." (45 chars). 4. Select sentiment: "Positive". 5. Submit. | Feedback created with source = 'calendar', sentiment = 'positive'. ConversationHistory entry created with interaction_type = 'feedback_submitted'. | P0 |
| TC-FR011-03 | Submit feedback from customer dashboard | RM is logged in; on customer dashboard for "Sharma" | 1. Click "Feedback" button. 2. Enter text: "Client concerned about market volatility." (41 chars). 3. Select sentiment: "Negative". 4. Submit. | Feedback created with source = 'customer_dashboard'. ConversationHistory entry created. | P0 |
| TC-FR011-04 | Source auto-set based on entry point | RM is logged in | 1. Submit feedback from Calendar. 2. Submit another from Customer Dashboard. | First feedback: source = 'calendar'. Second: source = 'customer_dashboard'. No manual selection required. | P1 |
| TC-FR011-05 | Multiple feedbacks per meeting allowed | RM is logged in; a meeting already has one feedback | 1. Open meeting detail. 2. Click "Feedback". 3. Submit new feedback. | Second feedback is created. Both feedbacks visible for the meeting. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR011-06 | Feedback text under 10 characters rejected | RM is logged in | 1. Click Feedback. 2. Enter text: "Good" (4 chars). 3. Submit. | Validation error: "Feedback must be at least 10 characters." | P0 |
| TC-FR011-07 | Feedback text exceeds 3000 characters rejected | RM is logged in | 1. Enter feedback text with 3001 characters. 2. Submit. | Validation error: "Feedback must not exceed 3000 characters." (Or character counter prevents input beyond limit.) | P1 |
| TC-FR011-08 | Feedback cannot be edited after submission | RM is logged in; feedback exists | 1. Attempt to find an edit/delete option for submitted feedback. | No edit or delete UI is provided. Feedback is append-only and immutable once submitted. | P0 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR011-09 | Feedback for inactive/closed relationship | RM is logged in; relationship "ClosedCorp" is marked inactive in CRM | 1. Submit feedback referencing "ClosedCorp". | Warning: "This relationship is currently inactive." Feedback is still accepted and saved. | P2 |
| TC-FR011-10 | Sentiment is optional | RM is logged in | 1. Click Feedback. 2. Enter valid text. 3. Do not select any sentiment. 4. Submit. | Feedback created with sentiment = NULL. No validation error. | P2 |

---

## FR-012: Conversation History

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR012-01 | Conversation History accessible from Customer Dashboard | RM is logged in; client "Sharma" has multiple interactions | 1. Navigate to Customer Dashboard for "Sharma". 2. Click "Conversation History" / view timeline section. | Timeline of all interactions is displayed in reverse chronological order. | P0 |
| TC-FR012-02 | Conversation History accessible from Calendar per-client filter | RM is logged in | 1. Navigate to Calendar. 2. Filter by client "Sharma". 3. Access Conversation History. | Client-specific interaction timeline is displayed. | P1 |
| TC-FR012-03 | Timeline entries show date, type icon, summary, and link | RM is logged in; multiple ConversationHistory entries exist | 1. Open Conversation History for a client. | Each entry displays: date/time, interaction type icon, summary text, and "View Details" link to the source entity. | P0 |
| TC-FR012-04 | Filter by interaction type | RM is logged in; entries of types meeting_completed, call_report_filed, feedback_submitted exist | 1. Open Conversation History. 2. Filter by interaction_type = 'call_report_filed'. | Only call_report_filed entries are shown. Other types hidden. | P1 |
| TC-FR012-05 | Filter by date range | RM is logged in; entries across multiple months | 1. Open Conversation History. 2. Set date range to current month. | Only entries within the current month are displayed. | P1 |
| TC-FR012-06 | Lazy-load in pages of 20 | RM is logged in; client has 50+ conversation entries | 1. Open Conversation History. | First 20 entries load. Scrolling to the bottom loads the next 20. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR012-07 | Entries are immutable - no edit/delete UI | RM is logged in | 1. Open Conversation History. 2. Check for edit or delete options on any entry. | No edit or delete functionality is provided. Entries are read-only. | P0 |
| TC-FR012-08 | MIS/Ops role cannot access Conversation History | MIS user logged in | 1. Attempt to access Conversation History. | Access denied per permissions matrix (MIS/Ops has "No" for conversation history). | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR012-09 | Referenced entity is soft-deleted | A call report was soft-deleted; its ConversationHistory entry remains | 1. Open Conversation History. 2. Find the entry referencing the deleted call report. 3. Click "View Details". | Entry is displayed with a note: "Source record deleted." The link is disabled or shows an appropriate message. | P2 |
| TC-FR012-10 | Auto-generated summary format | Various events have triggered ConversationHistory entries | 1. Inspect summaries. | Format: "{interaction_type} -- {entity subject/title}. {first 100 chars of detail}." | P2 |
| TC-FR012-11 | Auto-created on all specified events | Multiple events: meeting scheduled, meeting completed, call report filed, feedback submitted, opportunity created, action item completed | 1. Trigger each event. 2. Check Conversation History. | An entry exists for each event type with correct interaction_type and references. | P1 |

---

## FR-013: Action Item Management

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR013-01 | Add action item inline in call report form | RM is logged in; call report form is open | 1. In the Action Items section, click "Add". 2. Enter title: "Send portfolio statement to client". 3. Set assigned_to: self. 4. Set due_date: 3 days from now. 5. Set priority: "High". | Action item appears in the repeater list within the call report form. | P0 |
| TC-FR013-02 | Action item fields validation | RM is logged in | 1. Create action item with all fields: title, description, assigned_to, due_date, priority. | Action item created with status = 'open', all fields stored correctly. | P0 |
| TC-FR013-03 | My Action Items dashboard widget | RM is logged in; action items assigned to RM exist | 1. Navigate to dashboard or My Action Items page. | Dashboard widget shows action items with filters for status, priority, and due date. | P0 |
| TC-FR013-04 | Mark action item as completed | RM is logged in; an open action item exists | 1. On My Action Items, click the complete checkbox/button on an item. | status = 'completed'. completed_at is set. ConversationHistory entry created with interaction_type = 'action_item_completed'. | P0 |
| TC-FR013-05 | Overdue action items highlighted in red | RM is logged in; action item with due_date = yesterday and status = 'open' exists | 1. Open My Action Items. | The overdue item is highlighted in red or has a red badge/indicator. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR013-06 | Title less than 5 characters rejected | RM is logged in | 1. Add action item with title: "Call" (4 chars). 2. Save. | Validation error: "Title must be at least 5 characters." | P1 |
| TC-FR013-07 | Due date in the past rejected | RM is logged in | 1. Add action item with due_date = yesterday. 2. Save. | Validation error: "Due date must be today or in the future." | P1 |
| TC-FR013-08 | Completed action items cannot be re-opened | RM is logged in; a completed action item exists | 1. Attempt to change status back to 'open'. | No UI option to re-open. API rejects with 400: "Completed action items cannot be re-opened." | P0 |
| TC-FR013-09 | Cannot assign to user outside branch/hierarchy | RM is logged in; user from different branch searched | 1. In assigned_to, search for a user from a different branch. | User does not appear in the search results, or assignment is rejected: "Can only assign to users within your branch/hierarchy." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR013-10 | Assigned user is deactivated | Action item assigned to user who is later deactivated | 1. View the action item. | Message displayed: "Assigned user inactive -- please reassign." Reassign action is available. | P2 |
| TC-FR013-11 | Multiple action items per call report | RM is logged in | 1. Add 5 action items to a single call report. 2. Save. | All 5 action items are created and linked to the call report. | P2 |
| TC-FR013-12 | Description at max 2000 characters | RM is logged in | 1. Add action item with description = 2000 chars. 2. Save. | Created successfully. Description stored in full. | P2 |

---

## FR-014: Attachment Management

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR014-01 | Upload PDF attachment to call report | RM is logged in; call report in draft status | 1. Drag-and-drop a 2 MB PDF into the upload zone. | File uploads successfully. File list shows: file name, size (2 MB), type (PDF), preview and delete icons. | P0 |
| TC-FR014-02 | Upload DOCX attachment | RM is logged in; call report in draft | 1. Upload a .docx file (3 MB). | File uploads. Listed with correct name, size, type. | P0 |
| TC-FR014-03 | Upload XLSX attachment | RM is logged in; call report in draft | 1. Upload a .xlsx file (1 MB). | File uploads successfully. | P1 |
| TC-FR014-04 | Upload JPEG and PNG images | RM is logged in; call report in draft | 1. Upload a .jpg file (500 KB). 2. Upload a .png file (800 KB). | Both files upload. Images are previewable inline. | P1 |
| TC-FR014-05 | Preview PDF and images inline | RM is logged in; attachments uploaded | 1. Click preview on a PDF. 2. Click preview on an image. | PDF opens in an inline viewer. Image displays in a modal/lightbox. | P1 |
| TC-FR014-06 | Delete attachment while in draft status | RM is logged in; call report in draft with 2 attachments | 1. Click delete icon on one attachment. 2. Confirm deletion. | Attachment is removed from the list. Total size decreases. | P0 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR014-07 | Reject file type not in whitelist | RM is logged in | 1. Attempt to upload a .exe file. | Error: "File type not allowed. Accepted types: PDF, DOCX, XLSX, JPEG, PNG." | P0 |
| TC-FR014-08 | Reject file larger than 10 MB | RM is logged in | 1. Attempt to upload a 12 MB PDF. | Error: "File size exceeds the 10 MB limit." | P0 |
| TC-FR014-09 | Reject upload when total exceeds 50 MB | RM is logged in; 45 MB of attachments already uploaded | 1. Attempt to upload a 6 MB file (total would be 51 MB). | Error: "Total attachment size would exceed the 50 MB limit per call report. Current: 45 MB, remaining: 5 MB." | P0 |
| TC-FR014-10 | Cannot delete attachment on completed/approved call report | RM is logged in; call report with status = 'completed' | 1. View attachments. 2. Look for delete option. | Delete icon/button is not visible. Attachments are immutable after call report completion. | P0 |
| TC-FR014-11 | Virus-infected file blocked | RM is logged in; antivirus API is active | 1. Upload a file that triggers the antivirus scanner. | Error: "File rejected: potential security threat detected. Please upload a clean file." | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR014-12 | Upload failure mid-stream shows retry | RM is logged in; network is unstable | 1. Start uploading a file. 2. Simulate network interruption. | Upload fails with error. "Retry" option is displayed next to the failed file. | P2 |
| TC-FR014-13 | DOCX/XLSX preview triggers download | RM is logged in; DOCX attachment exists | 1. Click preview on the DOCX file. | File downloads to the user's machine (no inline preview for non-PDF/non-image types). | P2 |
| TC-FR014-14 | Exactly 10 MB file uploads successfully | RM is logged in | 1. Upload a file that is exactly 10,485,760 bytes. | File uploads successfully (boundary value - at the limit, not over). | P2 |

---

## FR-015: Call Reports List & Search

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR015-01 | Data table displays correct columns | RM is logged in; call reports exist | 1. Navigate to Call Reports list page. | Table shows columns: Date, Subject, Client, Type, Status, Filed By. Default sorted by date descending. | P0 |
| TC-FR015-02 | Filter by date range | RM is logged in; call reports across multiple months | 1. Set date range filter: 2026-04-01 to 2026-04-30. 2. Apply. | Only call reports within April 2026 are shown. | P0 |
| TC-FR015-03 | Filter by status | RM is logged in; reports with statuses: completed, pending_approval, rejected exist | 1. Select status filter: "pending_approval". 2. Apply. | Only pending_approval reports shown. | P0 |
| TC-FR015-04 | Full-text search on subject and summary | RM is logged in; call report with subject "Q1 Portfolio Review" and summary containing "equity allocation" exists | 1. Enter "equity allocation" in search field. 2. Search. | The matching call report appears in results. | P1 |
| TC-FR015-05 | Export to CSV/Excel | RM is logged in; filtered call reports list displayed | 1. Click "Export" button. 2. Select CSV or Excel format. | File downloads with all visible columns and filtered data. | P1 |
| TC-FR015-06 | Click row opens call report detail | RM is logged in; call reports listed | 1. Click on a row in the table. | Call report detail view opens showing all fields, opportunities, expenses, action items, and attachments. | P0 |
| TC-FR015-07 | Pagination at 20 rows per page | RM is logged in; 50+ call reports exist | 1. Navigate to Call Reports list. | First page shows 20 rows. Pagination controls show 3 pages. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR015-08 | RM sees only own reports | RM-A and RM-B each have call reports; RM-A is logged in | 1. Navigate to Call Reports list. | RM-A sees only their own call reports. RM-B's reports are not visible. | P0 |
| TC-FR015-09 | Zero search results shows message | RM is logged in | 1. Search for "XYZNONEXISTENT". | Message: "No call reports match your filters." with a "Clear filters" link. | P1 |

### Role-Based Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR015-10 | Supervisor sees team reports | Supervisor is logged in; RMs in their team have call reports | 1. Navigate to Call Reports list. | Supervisor sees all call reports from RMs in their team/hierarchy. | P0 |
| TC-FR015-11 | Branch Manager sees branch reports | Branch Manager logged in | 1. Navigate to Call Reports list. | All call reports from all RMs in the branch are visible. | P1 |
| TC-FR015-12 | Compliance sees all reports | Compliance Officer logged in | 1. Navigate to Call Reports list. | All call reports across the organization are visible (read-only). | P1 |

---

## FR-016: Meeting Notifications & Reminders

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR016-01 | 24-hour meeting reminder sent | Meeting scheduled for tomorrow 10:00 AM | 1. Wait until 10:00 AM today (24 hours before). | RM and invitees receive email + in-app notification: "Reminder -- {subject} tomorrow at {time}." | P0 |
| TC-FR016-02 | 1-hour meeting reminder sent | Meeting scheduled for today 2:00 PM; current time is 1:00 PM | 1. Verify notification at 1:00 PM. | RM and invitees receive in-app notification: "Your meeting '{subject}' starts in 1 hour at {location}." | P0 |
| TC-FR016-03 | Overdue call report daily alert | Meeting completed 6 business days ago; no call report filed | 1. Wait for 9:00 AM local time. | RM receives email + in-app: "Overdue call report for {subject}. Your meeting is {N} days overdue." | P0 |
| TC-FR016-04 | Approval submitted notification to supervisors | Call report submitted with requires_approval = true | 1. RM submits late call report. | Supervisors in the RM's branch receive email + in-app: "Call report approval required -- {rm_name}." | P0 |
| TC-FR016-05 | Approval decision notification to RM | Supervisor approves a call report | 1. Supervisor clicks Approve. | RM receives email + in-app: "Call report approved -- {subject}." | P0 |
| TC-FR016-06 | Rejection notification includes comments | Supervisor rejects with comments | 1. Supervisor rejects call report. | RM receives notification including: "Reviewer comments: {comments}. Please revise and resubmit." | P1 |
| TC-FR016-07 | Notification preferences configurable | RM is logged in | 1. Navigate to Settings > Notification Preferences. 2. Disable email for "Meeting Reminder (24h)". 3. Save. | Preference saved. Next 24h reminder is sent in-app only, not via email. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR016-08 | Critical notifications cannot be disabled | RM is logged in | 1. Navigate to Notification Preferences. 2. Attempt to disable "Overdue Call Report" email. | Checkbox is disabled/locked with tooltip: "This is a critical notification and cannot be disabled." | P0 |
| TC-FR016-09 | Critical: Approval Required cannot be disabled | Supervisor is logged in | 1. Attempt to disable "Approval Required" notifications. | Checkbox locked. is_critical = true prevents disabling. | P0 |
| TC-FR016-10 | No reminder sent for cancelled meeting | Meeting was scheduled but then cancelled | 1. Check at 24h before the original meeting time. | No reminder notification is sent for the cancelled meeting. | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR016-11 | Email delivery failure retries up to 3 times | SMTP server temporarily unavailable | 1. Trigger a notification email. 2. Email fails. | System retries with exponential backoff up to 3 times. email_retry_count increments. If all retries fail, email_status = 'failed' and failure is logged. | P1 |
| TC-FR016-12 | Bell icon badge count for unread notifications | RM has 5 unread in-app notifications | 1. View the header. | Bell icon shows badge with count "5". | P1 |
| TC-FR016-13 | Mark notification as read | RM has unread notifications | 1. Open notification center. 2. Click on a notification. | Notification is_read = true. read_at is set. Badge count decrements. | P2 |
| TC-FR016-14 | Notification preferences seeded on user creation | New user is created in the system | 1. Check NotificationPreference records. | All event_type x channel combinations exist with enabled = true. Critical events have is_critical = true. | P2 |

---

## FR-017: Supervisor Team Dashboard

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR017-01 | Dashboard widgets display correctly | Supervisor is logged in; team has meetings, call reports, opportunities | 1. Navigate to Supervisor Team Dashboard. | Four widgets visible: Meetings This Week (bar chart by RM), Call Report Filing Rate (gauge), Opportunity Pipeline (funnel chart), Overdue Items (count cards). | P0 |
| TC-FR017-02 | Drill-down from widget to underlying data | Supervisor is logged in | 1. Click on the "Meetings This Week" bar chart for a specific RM. | Navigates to a filtered meetings list showing only that RM's meetings for the current week. | P0 |
| TC-FR017-03 | Date range selector changes data | Supervisor is logged in | 1. Change date range to "Last Month". | All widgets refresh to show data for the previous month. | P1 |
| TC-FR017-04 | RM filter focuses on specific team member | Supervisor is logged in; team has 5 RMs | 1. Select RM "John Doe" from the RM filter. | All widgets display data only for "John Doe". | P1 |
| TC-FR017-05 | Dashboard refreshes every 5 minutes | Supervisor is logged in; dashboard open | 1. Observe for 5+ minutes. | Dashboard data auto-refreshes every 5 minutes (or manual refresh button is available). | P2 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR017-06 | RM cannot access Supervisor Dashboard | RM (non-supervisor) is logged in | 1. Attempt to navigate to Supervisor Dashboard. | Page not accessible. Menu item hidden or 403 returned. | P0 |
| TC-FR017-07 | Supervisor sees only their team, not other branches | Supervisor-A logged in; Supervisor-B has their own team | 1. Open dashboard. | Only Supervisor-A's team data is visible. Supervisor-B's RMs are not shown. | P0 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR017-08 | No data for selected period | Supervisor's team has no meetings/reports in the selected date range | 1. Select a date range with no activity. | Each widget shows "No activity recorded" placeholder. No chart rendering errors. | P1 |
| TC-FR017-09 | Branch Manager sees branch-level aggregates | Branch Manager logged in | 1. Open dashboard. | Dashboard shows aggregated data for all teams in the branch, not just one supervisor's team. | P1 |
| TC-FR017-10 | No-show count visible per RM | Supervisor logged in; some team members have no-show meetings | 1. View dashboard. | No-show count is visible as part of the Overdue Items or a separate metric per RM (per BR-019-4). | P1 |

---

## FR-018: Mark Meeting as Completed

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR018-01 | Mark as Completed button appears on past scheduled meetings | RM is logged in; meeting with status = 'scheduled' and end_date_time < NOW() exists | 1. Open meeting detail. | "Mark as Completed" button is visible (green checkmark or text button). | P0 |
| TC-FR018-02 | Clicking button transitions status to completed | RM is logged in; past scheduled meeting exists | 1. Click "Mark as Completed". 2. Confirm in dialog. | meeting.status = 'completed'. Calendar card changes from blue to green. | P0 |
| TC-FR018-03 | Confirmation dialog shown before marking complete | RM is logged in | 1. Click "Mark as Completed". | Dialog: "Mark this meeting as completed? You will be able to file a call report after this." with Confirm and Cancel buttons. | P0 |
| TC-FR018-04 | ConversationHistory entry created on completion | RM is logged in | 1. Mark a meeting as completed. 2. Check Conversation History for the client. | Entry with interaction_type = 'meeting_completed' exists. | P1 |
| TC-FR018-05 | File Call Report button becomes visible after marking complete | RM is logged in; meeting just marked as completed | 1. Mark meeting as completed. 2. View meeting detail. | "File Call Report" button is now visible (per FR-004). | P0 |
| TC-FR018-06 | Calendar card changes from blue to green | RM is logged in; meeting on Week view | 1. Mark meeting as completed. 2. Observe calendar. | Meeting card color changes from blue (scheduled) to green (completed) immediately. | P1 |
| TC-FR018-07 | Supervisor can mark RM's meeting as completed | Supervisor is logged in; RM's past scheduled meeting exists | 1. Navigate to the RM's meeting. 2. Click "Mark as Completed". 3. Confirm. | Meeting status = 'completed'. Audit log records supervisor's action. | P1 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR018-08 | Button NOT visible on future meetings | RM is logged in; meeting with end_date_time in the future | 1. Open meeting detail. | "Mark as Completed" button is NOT visible. | P0 |
| TC-FR018-09 | Cancelled meetings cannot be marked completed | RM is logged in; cancelled meeting exists | 1. Open cancelled meeting detail. | "Mark as Completed" button is not visible. Status remains 'cancelled'. | P0 |
| TC-FR018-10 | No-show meetings cannot be changed to completed by RM | RM is logged in; no_show meeting exists | 1. Attempt to mark as completed. | Button is not visible for RM. Only supervisor can override via PATCH /override-status. | P0 |
| TC-FR018-11 | Marking as completed is irreversible | RM is logged in; completed meeting exists | 1. Check if any option exists to revert to 'scheduled'. | No option to revert. Status change is one-way: scheduled -> completed. | P1 |
| TC-FR018-12 | Non-creator non-supervisor cannot mark complete | RM-B logged in; RM-A's past scheduled meeting | 1. Navigate to RM-A's meeting. | "Mark as Completed" button is not visible to RM-B. | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR018-13 | Meeting > 90 days old shows warning | RM is logged in; meeting ended 91+ days ago, still 'scheduled' | 1. Attempt to mark as completed. | Warning: "This meeting is over 90 days old. Consider cancelling if it did not occur." RM can still complete it. | P2 |
| TC-FR018-14 | Concurrent completion attempt by RM and supervisor | RM and Supervisor both viewing same meeting | 1. RM clicks "Mark as Completed". 2. Supervisor clicks "Mark as Completed" simultaneously. | First request succeeds. Second receives: "Meeting already completed." No error, graceful handling. | P2 |
| TC-FR018-15 | Pulsing indicator on past scheduled meetings | RM is logged in; past meeting still in 'scheduled' status | 1. Open calendar view. | Past scheduled meetings display a subtle pulsing indicator reminding RM to mark them complete. | P2 |
| TC-FR018-16 | Awaiting Completion filter in All Activities | RM is logged in; some past meetings still 'scheduled' | 1. Open All Activities view. 2. Use "Awaiting Completion" filter. | Only meetings where status = 'scheduled' AND end_date_time < NOW() are shown. | P2 |

---

## FR-019: Meeting No-Show Auto-Transition

### Positive Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR019-01 | Batch job transitions overdue scheduled meetings to no_show | Meeting with status = 'scheduled', end_date_time + 24h < NOW() | 1. Run the no-show batch job. | Meeting status = 'no_show'. | P0 |
| TC-FR019-02 | Grace period read from SystemConfig | SystemConfig: no_show_grace_period_hours = 24 | 1. Meeting ended 23 hours ago. Run batch. 2. Meeting ended 25 hours ago. Run batch. | Meeting A (23h): stays 'scheduled' (within grace). Meeting B (25h): transitions to 'no_show'. | P0 |
| TC-FR019-03 | Notification sent to RM on no-show | Meeting auto-transitioned to no_show | 1. Check RM's notifications after batch. | RM receives: "Meeting '{subject}' has been marked as No Show." | P0 |
| TC-FR019-04 | Notification sent to supervisor on no-show | Meeting auto-transitioned to no_show | 1. Check supervisor's notifications. | Supervisor receives notification about the RM's no-show meeting. | P0 |
| TC-FR019-05 | No-show meetings appear in red on calendar | No-show meetings exist | 1. Open calendar. | No-show meetings are displayed with red color indicator. | P1 |
| TC-FR019-06 | ConversationHistory entry created on no-show | Meeting transitioned to no_show | 1. Check Conversation History for the client. | Entry with interaction_type = 'meeting_no_show' exists. | P1 |
| TC-FR019-07 | Batch runs hourly (configurable) | SystemConfig: no_show_batch_interval_minutes = 60 | 1. Verify batch schedule. | Batch job runs every 60 minutes as configured. | P2 |

### Negative Tests

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR019-08 | No-show meetings cannot be edited | RM is logged in; no_show meeting exists | 1. Open meeting detail. 2. Check for edit option. | Edit button is not visible. No-show meetings are locked. | P0 |
| TC-FR019-09 | Cannot file call report against no-show meeting | RM is logged in; no_show meeting exists | 1. Check for "File Call Report" button. | Button is not visible. API rejects call report creation with 400. | P0 |
| TC-FR019-10 | Already completed meetings not affected by batch | Meeting status = 'completed' with end_date_time + 24h < NOW() | 1. Run batch. | Meeting stays 'completed'. Not transitioned to no_show. | P0 |
| TC-FR019-11 | Already cancelled meetings not affected by batch | Meeting status = 'cancelled' | 1. Run batch. | Meeting stays 'cancelled'. | P1 |

### Edge Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-FR019-12 | Batch is idempotent | Batch already ran and transitioned 3 meetings to no_show | 1. Re-run the batch. | No re-processing. The 3 meetings remain no_show without duplicate notifications or ConversationHistory entries. | P0 |
| TC-FR019-13 | Supervisor overrides no-show to completed | Supervisor is logged in; no_show meeting exists | 1. PATCH /api/v1/meetings/:id/override-status with { reason: "RM confirmed meeting occurred" }. | Meeting status = 'completed'. AuditLog entry created with the override reason. ConversationHistory entry created. | P0 |
| TC-FR019-14 | Override endpoint requires supervisor role | RM attempts PATCH /override-status | 1. RM sends PATCH request. | 403 Forbidden: "Only supervisors can override meeting status." | P0 |
| TC-FR019-15 | Override requires reason in request body | Supervisor sends PATCH without reason | 1. PATCH /api/v1/meetings/:id/override-status with empty body. | 400 Validation Error: "Reason is required for status override." | P1 |
| TC-FR019-16 | No-show count visible on Supervisor Dashboard | Supervisor's team has 3 no-show meetings this month | 1. Open Supervisor Team Dashboard. | No-show count per RM is visible (per BR-019-4). | P1 |
| TC-FR019-17 | Grace period edge - exactly at boundary | Meeting end_date_time + 24h = NOW() exactly | 1. Run batch at the exact boundary moment. | Meeting is NOT transitioned (condition is end_date_time + grace_period < NOW(), strict less-than). | P2 |
| TC-FR019-18 | Custom grace period from SystemConfig | SystemConfig: no_show_grace_period_hours = 48 | 1. Meeting ended 30 hours ago. Run batch. 2. Meeting ended 50 hours ago. Run batch. | Meeting A (30h): stays 'scheduled'. Meeting B (50h): transitions to 'no_show'. | P1 |

---

## Cross-Cutting / Integration Test Cases

| TC-ID | Test Case Name | Preconditions | Steps | Expected Result | Priority |
|-------|---------------|---------------|-------|-----------------|----------|
| TC-INT-01 | Full meeting-to-call-report lifecycle | RM is logged in | 1. Schedule a meeting for tomorrow. 2. Wait for 24h reminder. 3. After meeting time, mark as completed (FR-018). 4. File call report with opportunities and action items (FR-004). 5. Verify conversation history (FR-012). | All lifecycle stages complete. ConversationHistory has entries for: meeting_scheduled, meeting_completed, call_report_filed, opportunity_created. | P0 |
| TC-INT-02 | Late call report full approval cycle | RM is logged in; meeting completed 7 days ago | 1. File call report (triggers approval). 2. Supervisor claims. 3. Supervisor rejects with comments. 4. RM revises and resubmits. 5. Supervisor approves. | Full cycle: pending_approval -> claimed -> rejected -> pending_approval -> claimed -> approved. RM notified at each step. | P0 |
| TC-INT-03 | No-show to override to call report | Meeting auto-transitioned to no_show | 1. Supervisor overrides to completed. 2. RM files call report. | Override succeeds. Call report filed. Conversation history reflects full chain: no_show -> override to completed -> call_report_filed. | P1 |
| TC-INT-04 | Standalone call report with opportunity, expense, feedback | RM is logged in | 1. Create standalone call report. 2. Add opportunity. 3. Add expense. 4. Add action item. 5. Upload attachment. 6. Submit. 7. Submit feedback from calendar. | All entities created and linked. ConversationHistory has entries for all actions. | P1 |
| TC-INT-05 | Role-based visibility end-to-end | RM, Supervisor, Branch Manager, Compliance, MIS logged in | 1. RM creates meeting + call report + opportunity. 2. Each role checks visibility. | RM sees own data. Supervisor sees team. Branch Manager sees branch. Compliance sees all (read-only). MIS sees aggregated reports. | P0 |
| TC-INT-06 | Timezone handling for 5-day threshold | RM in IST timezone; meeting ended 5 business days ago (local time), but < 5 days in UTC | 1. File call report at 11:30 PM IST. | Business-day calculation uses RM's IST timezone per A.6.1 of addendum. Correct day count is computed. | P1 |
| TC-INT-07 | Denormalized name snapshot vs current name | Client "Sharma" renamed to "Sharma Holdings" in CRM after meeting was created | 1. View the old meeting detail. 2. View Conversation History. | Meeting shows snapshot name "Sharma". UI shows both: current "Sharma Holdings" with note: "Previously known as Sharma." | P2 |
| TC-INT-08 | Pagination contract consistency across endpoints | Multiple endpoints with paginated results | 1. Call GET /api/v1/meetings?page=1&page_size=20. 2. Call GET /api/v1/call-reports?page=1&page_size=20. 3. Call GET /api/v1/opportunities?page=1&page_size=20. | All responses follow the standard envelope: { data: [], pagination: { page, page_size, total_count, total_pages, has_next, has_previous } }. | P1 |
| TC-INT-09 | Page exceeding total returns empty data | RM has 5 call reports (1 page) | 1. GET /api/v1/call-reports?page=5&page_size=20. | Response: { data: [], pagination: { page: 5, page_size: 20, total_count: 5, total_pages: 1, has_next: false, has_previous: true } }. NOT a 404. | P2 |
| TC-INT-10 | page_size exceeding max is silently capped | None | 1. GET /api/v1/meetings?page_size=200. | Response uses page_size = 100 (capped). No error returned. | P2 |
| TC-INT-11 | Audit log entries created for all mutations | Admin reviews audit log | 1. Create meeting. 2. Edit meeting. 3. Cancel meeting. 4. File call report. 5. Approve call report. 6. Check audit_log table. | Each mutation has a corresponding AuditLog entry with entity_type, entity_id, action, performed_by, and timestamps. | P1 |

---

## Summary

| FR | Total TCs | P0 | P1 | P2 |
|----|-----------|----|----|-----|
| FR-001 | 17 | 6 | 7 | 4 |
| FR-002 | 24 | 12 | 7 | 5 |
| FR-003 | 13 | 6 | 4 | 3 |
| FR-004 | 18 | 8 | 6 | 4 |
| FR-005 | 11 | 5 | 3 | 3 |
| FR-006 | 14 | 7 | 4 | 3 |
| FR-007 | 14 | 6 | 5 | 3 |
| FR-008 | 13 | 5 | 5 | 3 |
| FR-009 | 9 | 3 | 3 | 3 |
| FR-010 | 17 | 7 | 7 | 3 |
| FR-011 | 10 | 4 | 3 | 3 |
| FR-012 | 11 | 4 | 5 | 2 |
| FR-013 | 12 | 4 | 5 | 3 |
| FR-014 | 14 | 6 | 4 | 4 |
| FR-015 | 12 | 5 | 5 | 2 |
| FR-016 | 14 | 5 | 5 | 4 |
| FR-017 | 10 | 3 | 4 | 3 |
| FR-018 | 16 | 6 | 5 | 5 |
| FR-019 | 18 | 7 | 6 | 5 |
| Integration | 11 | 3 | 5 | 3 |
| **TOTAL** | **278** | **117** | **108** | **73** |

---

*Generated on 2026-04-22 from BRD v1.0 (generate_calendar_callreport_brd.py) and BRD v1.1 Addendum (patch_brd_v1_1.py).*
