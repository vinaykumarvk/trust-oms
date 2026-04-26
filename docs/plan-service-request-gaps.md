# Development Plan: Service Request Module — Gap Closure (21 Gaps)

## Overview
Close all 21 gaps identified in the BRD coverage audit (`docs/reviews/brd-coverage-servicerequest-taskmanagement-brd-v2-final-2026-04-23.md`) for the Service Request / Task Management module. Gaps range from critical (missing audit table, zero tests) to trivial (missing warning text). The plan is organized into 7 phases with maximum parallelism.

## Architecture Decisions

- **Status History Table**: Follow the `handoverAuditLog` pattern from schema.ts (lines 5800-5821) — append-only table with event type, actor, timestamp, and notes. This matches the closest functional analogy (state transitions with actor tracking).
- **Request ID Generation**: Replace COUNT(*) with a Drizzle `sql` raw query using `COALESCE(MAX(...), 0) + 1` with a retry-on-unique-violation loop (true PostgreSQL SEQUENCE would require raw DDL outside Drizzle's schema builder). The existing UNIQUE index on `request_id` serves as the concurrency guard.
- **DB-Level Filtering**: Use Drizzle's `and()`, `or()`, `ilike()`, `eq()` composable conditions array pattern. Build conditions dynamically and pass to `.where(and(...conditions))`.
- **Pagination**: Return `{ data, total, page, pageSize }` matching the existing claims-service.ts pattern (lines 378-383), but compute total via a separate `COUNT(*)` query at DB level instead of `array.length`.
- **User Identity**: Extract from `req.user?.id` (set by auth middleware). For client portal, use `req.user?.clientId`. Never fall back to hardcoded values.
- **Document Upload**: Frontend-only file input storing filenames in the existing `documents` JSONB column. No separate file upload API needed (documents are metadata references, not binary storage — matching current JSONB `string[]` type).

## Conventions

- **Service pattern**: Object-literal export (`export const serviceRequestService = { ... }`). See `server/services/service-request-service.ts`.
- **Route pattern**: Express Router with `asyncHandler()` wrapper and `requireBackOfficeRole()` guard. See `server/routes/back-office/service-requests.ts`.
- **Drizzle queries**: `db.select().from(table).where(and(...conditions))`. Use `eq()`, `ilike()`, `sql` from `drizzle-orm`.
- **Frontend mutations**: `useMutation` with `onSuccess` invalidating query keys + `toast.success()`. See workbench pattern.
- **Dialog pattern**: `Dialog` for multi-field forms, `AlertDialog` for destructive confirmations. See workbench (Dialog) vs detail page (AlertDialog).
- **Status-conditional rendering**: Compute boolean flags upfront (`isEditable`, `canClose`, etc.) and use in JSX conditionals.
- **Test pattern**: Vitest with `vi.mock()` for DB/schema/drizzle-orm. Chainable async proxies for DB calls. See `tests/e2e/settlement-service.spec.ts`.

---

## Dependency Graph

```
Phase 1 (Schema + Service) ──> Phase 4 (Routes) ──> Phase 6 (Badge + Timeline UI)
                                       │
                                       └──> Phase 5 (Pagination)
Phase 2 (Minor UI Fixes) ─────────────────────────────────────────┐
Phase 3 (Document Upload) ────────────────────────────────────────┤
                                                                  v
                                                          Phase 7 (E2E Tests)
```

Parallel execution opportunities:
- **Phases 1, 2, 3** can all start simultaneously (Phase 1 is backend, Phases 2-3 are frontend-only)
- **Phases 4, 5** depend on Phase 1 completing
- **Phase 6** depends on Phase 4 (needs new API endpoints)
- **Phase 7** depends on all previous phases

---

## Phase 1: Schema + Service Layer Core Refactoring
**Dependencies:** none

**Description:**
Foundation phase — adds the `sr_status_history` table to the schema, refactors the service layer for concurrency-safe ID generation, DB-level filtering, authenticated user tracking, and status history inserts on every transition. All subsequent backend work depends on this phase.

**Tasks:**

1. **Add `sr_status_history` table to schema** (`packages/shared/src/schema.ts`):
   - Add `srHistoryActionEnum` pgEnum after `srTypeEnum` (~line 5999): `'CREATED', 'STATUS_CHANGE', 'UPDATED', 'REASSIGNED', 'CLOSED'`
   - Add `srStatusHistory` table after `serviceRequests` table (~line 6033):
     - `id`: serial, primary key
     - `sr_id`: integer, FK to `serviceRequests.id`, not null
     - `from_status`: `srStatusEnum` (nullable for CREATED action)
     - `to_status`: `srStatusEnum`, not null
     - `action`: `srHistoryActionEnum`, not null
     - `changed_by`: text, not null
     - `changed_at`: timestamp, defaultNow, not null
     - `notes`: text (nullable)
   - Add index on `sr_id` for fast lookups
   - Add relations: `srStatusHistory` → `serviceRequests` (many-to-one)
   - Update `serviceRequestsRelations` to include `history: many(srStatusHistory)`

2. **Refactor request ID generation** (`server/services/service-request-service.ts`):
   - Replace the COUNT(*)-based approach (lines 44-52) with:
     ```
     SELECT COALESCE(MAX(CAST(SUBSTRING(request_id FROM 9) AS INTEGER)), 0) + 1
     FROM service_requests WHERE request_id LIKE 'SR-{YEAR}-%'
     ```
   - Wrap the INSERT in a retry loop (max 3 attempts) catching unique constraint violations
   - On collision, re-query MAX and retry

3. **Refactor `getServiceRequests()` to DB-level filtering** (`server/services/service-request-service.ts`):
   - Replace in-memory filtering (lines 91-117) with dynamic `where()` conditions:
     - `client_id`: `eq(serviceRequests.client_id, filters.client_id)`
     - `status`: `eq(serviceRequests.sr_status, filters.status)`
     - `priority`: `eq(serviceRequests.priority, filters.priority)`
     - `search`: `or(ilike(serviceRequests.request_id, '%'+search+'%'), ilike(serviceRequests.sr_type, '%'+search+'%'), ilike(serviceRequests.sr_details, '%'+search+'%'))`
     - Always include: `eq(serviceRequests.is_deleted, false)`
   - Compose with `and(...conditions.filter(Boolean))`
   - Add `LIMIT` and `OFFSET` to the query: `.limit(pageSize).offset((page - 1) * pageSize)`
   - Add separate COUNT(*) query with same WHERE for total: `db.select({ count: sql<number>\`count(*)\` }).from(serviceRequests).where(and(...conditions))`
   - Compute `request_age` on the selected page of results (not all records)

4. **Add `userId` parameter to all state-transition methods** (`server/services/service-request-service.ts`):
   - `closeRequest(id, reason, userId)` — set `updated_by: userId` (remove `'system'` at line 199)
   - `sendForVerification(id, data, userId)` — set `updated_by: userId` (remove `'system'` at line 229)
   - `resubmitForVerification(id, data, userId)` — set `updated_by: userId` (remove `'system'` at line 297)
   - `rejectRequest(id, reason, userId)` — set `updated_by: userId` (remove `'system'` at line 322)
   - `updateServiceRequest(id, updates, userId)` — pass `userId` for `updated_by`
   - `createServiceRequest(data)` — ensure `created_by` is required (not optional with `|| 'system'`)

5. **Add `insertStatusHistory()` helper and call on all transitions** (`server/services/service-request-service.ts`):
   - Add private helper: `async function insertStatusHistory(srId, fromStatus, toStatus, action, changedBy, notes?)`
   - Call after every status change:
     - `createServiceRequest`: insert with action='CREATED', from_status=null, to_status='APPROVED'
     - `closeRequest`: action='CLOSED', from=current, to='CLOSED'
     - `sendForVerification`: action='STATUS_CHANGE', from='APPROVED', to='READY_FOR_TELLER'
     - `completeRequest`: action='STATUS_CHANGE', from='READY_FOR_TELLER', to='COMPLETED'
     - `markIncomplete`: action='STATUS_CHANGE', from='READY_FOR_TELLER', to='INCOMPLETE'
     - `resubmitForVerification`: action='STATUS_CHANGE', from='INCOMPLETE', to='READY_FOR_TELLER'
     - `rejectRequest`: action='STATUS_CHANGE', from='READY_FOR_TELLER', to='REJECTED'

6. **Add `reassignRM()` method** (`server/services/service-request-service.ts`):
   - Parameters: `(id, newRmId, changedBy)`
   - Guard: reject if status is terminal (COMPLETED, REJECTED, CLOSED)
   - Update `assigned_rm_id` and `updated_by`
   - Insert history: action='REASSIGNED'
   - Return updated record

7. **Add `getActionCount()` method** (`server/services/service-request-service.ts`):
   - Parameters: `(clientId)`
   - Query: `SELECT COUNT(*) FROM service_requests WHERE client_id = clientId AND sr_status = 'INCOMPLETE' AND is_deleted = false`
   - Return `{ count: number }`

8. **Add `getStatusHistory()` method** (`server/services/service-request-service.ts`):
   - Parameters: `(srId)`
   - Query all history entries for given SR, ordered by `changed_at ASC`
   - Return array of history records

9. **Auto-populate `assigned_rm_id`** in `createServiceRequest` (`server/services/service-request-service.ts`):
   - If `data.assigned_rm_id` is not provided, attempt to look up the client's mapped RM from the `users` table or default to null
   - This is a best-effort enhancement — don't block creation if lookup fails

**Files to create/modify:**
- `packages/shared/src/schema.ts` — Add `srHistoryActionEnum`, `srStatusHistory` table, relations, index
- `server/services/service-request-service.ts` — Refactor ID gen, filtering, add userId params, add insertStatusHistory/reassignRM/getActionCount/getStatusHistory methods

**Acceptance criteria:**
- `sr_status_history` table defined in schema with correct columns and FK
- `getServiceRequests()` uses SQL WHERE/LIMIT/OFFSET (no in-memory filtering)
- All state-transition methods accept `userId` parameter and write it to `updated_by`
- Every status transition inserts a history record
- `reassignRM()`, `getActionCount()`, `getStatusHistory()` methods exist and work
- `npx tsc --noEmit` passes

---

## Phase 2: Minor Frontend UI Fixes
**Dependencies:** none

**Description:**
Quick UI fixes that close 6 gaps without requiring any backend changes. These are purely frontend modifications to existing dialog and form components.

**Tasks:**

1. **Add "cannot be undone" warning to reject dialog** (G-014) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - In the reject dialog (~line 604-639), add a warning paragraph before the textarea:
     ```tsx
     <p className="text-sm text-destructive font-medium">This action cannot be undone. The service request will be permanently rejected.</p>
     ```

2. **Add min 10-char validation on verification notes** (G-015) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - In the incomplete dialog (~line 567-601), change the submit button disabled condition:
     ```tsx
     disabled={incompleteNotes.trim().length < 10 || actionMutation.isPending}
     ```
   - Add helper text below textarea: `<p className="text-xs text-muted-foreground">Minimum 10 characters required ({incompleteNotes.trim().length}/10)</p>`

3. **Add min 10-char validation on rejection reason** (G-016) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - Same pattern as Task 2 for the reject dialog textarea:
     ```tsx
     disabled={rejectReason.trim().length < 10 || actionMutation.isPending}
     ```
   - Add helper text: `<p className="text-xs text-muted-foreground">Minimum 10 characters required ({rejectReason.trim().length}/10)</p>`

4. **Add confirmation dialog before completing** (G-017) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - Add `completeDialogOpen` state and `selectedCompleteId` state
   - Replace the direct Complete button onClick with opening a confirmation AlertDialog:
     ```tsx
     <AlertDialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
       <AlertDialogContent>
         <AlertDialogHeader>
           <AlertDialogTitle>Complete Service Request?</AlertDialogTitle>
           <AlertDialogDescription>
             This will mark the service request as completed and set the actual closure date.
           </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
           <AlertDialogCancel>Cancel</AlertDialogCancel>
           <AlertDialogAction onClick={() => { actionMutation.mutate({...}); setCompleteDialogOpen(false); }}>
             Complete
           </AlertDialogAction>
         </AlertDialogFooter>
       </AlertDialogContent>
     </AlertDialog>
     ```
   - Import `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle` from `@/components/ui/alert-dialog` (check if these already exist in the workbench imports; if not, add them)

5. **Show RM-filled fields in client detail page** (G-019) (`apps/client-portal/src/pages/service-request-detail.tsx`):
   - After the existing info grid section, add a conditional section for RM fields:
     ```tsx
     {(sr.service_branch || sr.resolution_unit || sr.sales_date || sr.appointed_start_date || sr.appointed_end_date) && (
       <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
         {sr.service_branch && <div><Label>Service Branch</Label><p>{sr.service_branch}</p></div>}
         {sr.resolution_unit && <div><Label>Resolution Unit</Label><p>{sr.resolution_unit}</p></div>}
         {sr.sales_date && <div><Label>Sales Date</Label><p>{format(new Date(sr.sales_date), 'MMM d, yyyy')}</p></div>}
         {sr.appointed_start_date && <div><Label>Appointed Start</Label><p>{format(...)}</p></div>}
         {sr.appointed_end_date && <div><Label>Appointed End</Label><p>{format(...)}</p></div>}
       </div>
     )}
     ```

6. **Add closure_date editability for READY_FOR_TELLER** (G-011) (`apps/client-portal/src/pages/service-request-detail.tsx`):
   - Make the closure_date field an editable date input when status is `READY_FOR_TELLER`:
     ```tsx
     {sr.sr_status === "READY_FOR_TELLER" ? (
       <Input type="date" value={closureDate} onChange={(e) => setClosureDate(e.target.value)} />
     ) : (
       <p>{sr.closure_date ? format(...) : "—"}</p>
     )}
     ```
   - Add `closureDate` state initialized from `sr.closure_date`
   - Include `closure_date` in the save mutation body when changed

**Files to create/modify:**
- `apps/back-office/src/pages/service-request-workbench.tsx` — Tasks 1-4 (warnings, validations, confirm dialog)
- `apps/client-portal/src/pages/service-request-detail.tsx` — Tasks 5-6 (RM fields, closure date edit)

**Acceptance criteria:**
- Reject dialog shows "cannot be undone" warning text
- Incomplete notes and reject reason require minimum 10 characters (button disabled + counter shown)
- Complete action shows confirmation dialog before executing
- Client detail shows service_branch, resolution_unit, sales_date, appointed dates when present
- Closure date is editable when status is READY_FOR_TELLER
- `npx tsc --noEmit` passes

---

## Phase 3: Document Upload UI
**Dependencies:** none

**Description:**
Add document upload capability to the create form and document display/re-upload to the detail page. The `documents` JSONB column already exists in the schema — these are frontend-only changes storing filenames.

**Tasks:**

1. **Add file input to create form** (G-007) (`apps/client-portal/src/pages/service-request-create.tsx`):
   - Add state: `const [files, setFiles] = useState<File[]>([]);`
   - Add file input after the remarks field:
     ```tsx
     <div>
       <Label>Documents (Optional)</Label>
       <p className="text-xs text-muted-foreground mb-2">PDF files only, max 10MB each</p>
       <Input
         type="file"
         accept=".pdf"
         multiple
         onChange={(e) => {
           const selected = Array.from(e.target.files || []);
           const valid = selected.filter(f => f.size <= 10 * 1024 * 1024 && f.type === 'application/pdf');
           if (valid.length < selected.length) toast.error("Some files were rejected (must be PDF, max 10MB)");
           setFiles(prev => [...prev, ...valid]);
         }}
       />
       {files.length > 0 && (
         <ul className="mt-2 space-y-1">
           {files.map((f, i) => (
             <li key={i} className="flex items-center justify-between text-sm">
               <span>{f.name} ({(f.size/1024/1024).toFixed(1)}MB)</span>
               <Button variant="ghost" size="sm" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
             </li>
           ))}
         </ul>
       )}
     </div>
     ```
   - Include filenames in the create mutation body: `documents: files.map(f => f.name)`

2. **Add documents display to detail page** (G-012) (`apps/client-portal/src/pages/service-request-detail.tsx`):
   - After the remarks section, add a documents section:
     ```tsx
     {sr.documents && sr.documents.length > 0 && (
       <div>
         <Label>Attached Documents</Label>
         <ul className="mt-2 space-y-1">
           {sr.documents.map((doc: string, i: number) => (
             <li key={i} className="flex items-center gap-2 text-sm">
               <FileText className="h-4 w-4 text-muted-foreground" />
               <span>{doc}</span>
             </li>
           ))}
         </ul>
       </div>
     )}
     ```

3. **Add document re-upload in INCOMPLETE status** (G-013) (`apps/client-portal/src/pages/service-request-detail.tsx`):
   - When status is INCOMPLETE, show an additional file input below the documents list:
     ```tsx
     {sr.sr_status === "INCOMPLETE" && (
       <div className="mt-2">
         <Input type="file" accept=".pdf" multiple onChange={handleFileUpload} />
         <p className="text-xs text-muted-foreground">Upload additional documents to address verification notes</p>
       </div>
     )}
     ```
   - Include new document filenames in the resubmit mutation body

**Files to create/modify:**
- `apps/client-portal/src/pages/service-request-create.tsx` — File input with PDF/size validation
- `apps/client-portal/src/pages/service-request-detail.tsx` — Document list display + re-upload for INCOMPLETE

**Acceptance criteria:**
- Create form has a file input accepting PDF only, max 10MB per file
- Selected files are listed with remove buttons
- File names are sent in the create request body as `documents` array
- Detail page displays document filenames with FileText icon when present
- INCOMPLETE status shows additional file upload input
- `npx tsc --noEmit` passes

---

## Phase 4: Route Layer Updates + New Endpoints
**Dependencies:** Phase 1

**Description:**
Update all route handlers to pass authenticated user identity, add new endpoints for reassignment, action count, and status history.

**Tasks:**

1. **Pass `req.user?.id` to all service methods** (`server/routes/back-office/service-requests.ts`):
   - Update PUT `/:id` (update): pass `req.user?.id` as 3rd arg to `updateServiceRequest`
   - Update PUT `/:id/send-for-verification`: pass `req.user?.id` as 3rd arg to `sendForVerification`
   - Update PUT `/:id/complete`: use `req.user?.id` for teller (remove `|| 1` fallback)
   - Update PUT `/:id/incomplete`: use `req.user?.id` for teller (remove `|| 1` fallback)
   - Update PUT `/:id/reject`: pass `req.user?.id` as 3rd arg to `rejectRequest`

2. **Extract client_id from JWT in client portal** (G-009) (`server/routes/client-portal.ts`):
   - POST `/service-requests` (~line 228): change `client_id: req.body.client_id` to `client_id: req.user?.clientId || req.body.client_id`
   - POST: pass `created_by: req.user?.id || req.user?.clientId` to service
   - PUT `/:id/close`: pass `req.user?.id` to `closeRequest`
   - PUT `/:id/resubmit`: pass `req.user?.id` to `resubmitForVerification`
   - PUT `/:id` (update): pass `req.user?.id` to `updateServiceRequest`

3. **Add RM reassignment endpoint** (G-006) (`server/routes/back-office/service-requests.ts`):
   - Add `PUT /:id/reassign`:
     ```typescript
     router.put('/:id/reassign', asyncHandler(async (req, res) => {
       const { new_rm_id } = req.body;
       if (!new_rm_id) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'new_rm_id is required' } });
       const result = await serviceRequestService.reassignRM(Number(req.params.id), new_rm_id, String(req.user?.id));
       res.json({ data: result });
     }));
     ```
   - Role restriction: this route is already under `requireBackOfficeRole()` which includes BO_HEAD and SYSTEM_ADMIN

4. **Add action-count endpoint** (G-005) (`server/routes/client-portal.ts`):
   - Add `GET /service-requests/action-count/:clientId`:
     ```typescript
     router.get('/service-requests/action-count/:clientId', asyncHandler(async (req, res) => {
       const result = await serviceRequestService.getActionCount(req.params.clientId);
       res.json({ data: result });
     }));
     ```
   - Place this BEFORE the `/service-requests/detail/:id` route to avoid path conflict

5. **Add status history endpoint** (G-002) — both portals:
   - Back-office (`server/routes/back-office/service-requests.ts`):
     ```typescript
     router.get('/:id/history', asyncHandler(async (req, res) => {
       const history = await serviceRequestService.getStatusHistory(Number(req.params.id));
       res.json({ data: history });
     }));
     ```
   - Client portal (`server/routes/client-portal.ts`):
     ```typescript
     router.get('/service-requests/:id/history', asyncHandler(async (req, res) => {
       const history = await serviceRequestService.getStatusHistory(Number(req.params.id));
       res.json({ data: history });
     }));
     ```

**Files to create/modify:**
- `server/routes/back-office/service-requests.ts` — Pass user ID, add reassign + history endpoints
- `server/routes/client-portal.ts` — JWT client_id, pass user ID, add action-count + history endpoints

**Acceptance criteria:**
- No route handler uses hardcoded `1` or `'system'` as fallback for user identity
- `PUT /:id/reassign` endpoint exists and validates `new_rm_id`
- `GET /service-requests/action-count/:clientId` returns `{ data: { count: number } }`
- `GET /:id/history` returns `{ data: [...history entries...] }`
- Client portal POST uses `req.user?.clientId` for `client_id`
- `npx tsc --noEmit` passes

---

## Phase 5: Pagination Controls
**Dependencies:** Phase 1, Phase 4

**Description:**
Add pagination UI to both portals, consuming the DB-level pagination from the refactored service layer.

**Tasks:**

1. **Add pagination to client portal list** (G-008) (`apps/client-portal/src/pages/service-requests.tsx`):
   - Add state: `const [page, setPage] = useState(1);` and `const [pageSize, setPageSize] = useState(25);`
   - Pass `page` and `pageSize` to the API query string
   - Add pagination bar below the table:
     ```tsx
     <div className="flex items-center justify-between pt-4">
       <p className="text-sm text-muted-foreground">
         Showing {(page-1)*pageSize + 1}–{Math.min(page*pageSize, total)} of {total}
       </p>
       <div className="flex items-center gap-2">
         <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
         <span className="text-sm">Page {page} of {Math.ceil(total/pageSize)}</span>
         <Button variant="outline" size="sm" disabled={page >= Math.ceil(total/pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
       </div>
     </div>
     ```
   - Update the query to use `total` from the API response (service now returns `{ data, total, page, pageSize }`)
   - Reset page to 1 when filters change (status tab, search)

2. **Add configurable pagination to workbench** (G-018) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - Same pattern as Task 1, plus a page-size selector:
     ```tsx
     <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
       <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
       <SelectContent>
         <SelectItem value="10">10</SelectItem>
         <SelectItem value="25">25</SelectItem>
         <SelectItem value="50">50</SelectItem>
         <SelectItem value="100">100</SelectItem>
       </SelectContent>
     </Select>
     ```
   - Import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from shadcn

**Files to create/modify:**
- `apps/client-portal/src/pages/service-requests.tsx` — Pagination controls (Previous/Next, page counter)
- `apps/back-office/src/pages/service-request-workbench.tsx` — Pagination + page-size selector

**Acceptance criteria:**
- Client portal list shows Previous/Next buttons with page counter
- Page resets to 1 when filters change
- Workbench shows pagination + configurable page size (10/25/50/100)
- Both correctly display "Showing X–Y of Z" text
- `npx tsc --noEmit` passes

---

## Phase 6: Notification Badge + Status History Timeline
**Dependencies:** Phase 4

**Description:**
Add the notification badge to the client portal nav and the status history timeline to the detail page. Both require the new API endpoints from Phase 4.

**Tasks:**

1. **Add notification badge to client portal nav** (G-005 UI) (`apps/client-portal/src/components/layout/ClientPortalLayout.tsx`):
   - Add a `useQuery` for action count:
     ```tsx
     const { data: actionCount } = useQuery({
       queryKey: ["sr-action-count", clientId],
       queryFn: () => fetch(`/api/v1/client-portal/service-requests/action-count/${clientId}`, { headers: authHeaders() }).then(r => r.json()),
       refetchInterval: 60000, // 60 seconds
     });
     ```
   - In the nav item rendering loop, for the "Service Requests" item, add a badge:
     ```tsx
     {item.label === "Service Requests" && actionCount?.data?.count > 0 && (
       <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
         {actionCount.data.count}
       </span>
     )}
     ```
   - Import `useQuery` from `@tanstack/react-query`
   - Extract `clientId` from auth context or localStorage

2. **Add status history timeline to detail page** (G-002 UI) (`apps/client-portal/src/pages/service-request-detail.tsx`):
   - Add a `useQuery` for history:
     ```tsx
     const { data: history } = useQuery({
       queryKey: ["sr-history", id],
       queryFn: () => fetch(`/api/v1/client-portal/service-requests/${id}/history`, { headers: authHeaders() }).then(r => r.json()),
       enabled: !!id,
     });
     ```
   - Add a "History" section at the bottom of the detail page:
     ```tsx
     {history?.data?.length > 0 && (
       <Card className="mt-6">
         <CardHeader><CardTitle className="text-lg">Status History</CardTitle></CardHeader>
         <CardContent>
           <div className="relative pl-6 space-y-6">
             <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
             {history.data.map((entry, i) => (
               <div key={i} className="relative">
                 <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-teal-500 border-2 border-background" />
                 <div>
                   <p className="text-sm font-medium">{entry.action}: {entry.from_status || '—'} → {entry.to_status}</p>
                   <p className="text-xs text-muted-foreground">{format(new Date(entry.changed_at), 'MMM d, yyyy h:mm a')} by {entry.changed_by}</p>
                   {entry.notes && <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>}
                 </div>
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
     )}
     ```
   - Also add the same timeline to the back-office workbench detail view if it has one, or as an expandable section in the workbench table row

3. **Add RM reassignment dialog to workbench** (G-006 UI) (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - Add `reassignDialogOpen` state and `selectedReassignId` state
   - Add `newRmId` input state
   - Add a "Reassign" button in the actions column for non-terminal statuses:
     ```tsx
     {!["COMPLETED", "REJECTED", "CLOSED"].includes(s) && (
       <Button variant="outline" size="sm" onClick={() => { setSelectedReassignId(sr.id); setReassignDialogOpen(true); }}>
         Reassign
       </Button>
     )}
     ```
   - Add reassign dialog:
     ```tsx
     <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
       <DialogContent>
         <DialogHeader><DialogTitle>Reassign Relationship Manager</DialogTitle></DialogHeader>
         <div><Label>New RM ID</Label><Input type="number" value={newRmId} onChange={(e) => setNewRmId(e.target.value)} /></div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>Cancel</Button>
           <Button disabled={!newRmId || actionMutation.isPending} onClick={() => { actionMutation.mutate({ id: selectedReassignId, action: 'reassign', body: { new_rm_id: Number(newRmId) } }); setReassignDialogOpen(false); }}>
             Reassign
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
     ```

**Files to create/modify:**
- `apps/client-portal/src/components/layout/ClientPortalLayout.tsx` — Notification badge with polling
- `apps/client-portal/src/pages/service-request-detail.tsx` — Status history timeline
- `apps/back-office/src/pages/service-request-workbench.tsx` — RM reassignment dialog + button

**Acceptance criteria:**
- Client portal nav shows red badge with count when INCOMPLETE SRs exist for client
- Badge hidden when count is 0
- Badge refreshes every 60 seconds
- Detail page shows chronological timeline of all status changes
- Each timeline entry shows: action, status transition, timestamp, user, notes
- Workbench has "Reassign" button for non-terminal SRs
- Reassign dialog has RM ID input and submits to `/reassign` endpoint
- `npx tsc --noEmit` passes

---

## Phase 7: E2E Test Suite
**Dependencies:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6

**Description:**
Create a comprehensive e2e test suite for the service request module covering all service methods, status transitions, and edge cases. Follow the existing test pattern from `tests/e2e/settlement-service.spec.ts`.

**Tasks:**

1. **Create test file** (`tests/e2e/service-request-lifecycle.spec.ts`):
   - Set up vi.mock for `../../server/db`, `@shared/schema`, `drizzle-orm` following the settlement-service pattern
   - Mock the service_requests table, sr_status_history table, and all enums

2. **Test: Service import and method existence**:
   - Verify `serviceRequestService` is defined
   - Verify all 11+ methods exist as functions

3. **Test: Request ID generation**:
   - Verify format matches `SR-{YYYY}-{NNNNNN}`
   - Verify year is current year
   - Verify sequence is zero-padded 6 digits

4. **Test: SLA computation**:
   - HIGH priority → closure_date = request_date + 3 days
   - MEDIUM priority → closure_date = request_date + 5 days
   - LOW priority → closure_date = request_date + 7 days
   - Unknown priority → defaults to 5 days

5. **Test: Status transition state machine**:
   - Valid transitions: NEW→APPROVED (auto), APPROVED→READY_FOR_TELLER, APPROVED→CLOSED, READY_FOR_TELLER→COMPLETED, READY_FOR_TELLER→INCOMPLETE, READY_FOR_TELLER→REJECTED, READY_FOR_TELLER→CLOSED, INCOMPLETE→READY_FOR_TELLER, INCOMPLETE→CLOSED
   - Invalid transitions return errors (e.g., COMPLETED→anything, REJECTED→anything)

6. **Test: Summary/KPI**:
   - Verify getSummary returns counts by status
   - Verify overdue SLA count calculation

7. **Test: DB-level filtering**:
   - Verify getServiceRequests builds WHERE conditions correctly
   - Verify pagination with LIMIT/OFFSET

8. **Test: User tracking**:
   - Verify userId parameter is used (not 'system')
   - Verify created_by is set on creation

9. **Test: RM reassignment**:
   - Verify reassignRM updates assigned_rm_id
   - Verify terminal status guard

10. **Test: Action count**:
    - Verify getActionCount returns INCOMPLETE count for client

11. **Test: Status history**:
    - Verify getStatusHistory returns chronological entries

**Files to create:**
- `tests/e2e/service-request-lifecycle.spec.ts` — Complete test suite

**Acceptance criteria:**
- Test file follows project conventions (vitest, vi.mock pattern)
- All service methods have at least one test
- Status transition state machine is fully tested (valid + invalid)
- SLA computation is tested for all 3 priorities
- Tests pass: `npx vitest run tests/e2e/service-request-lifecycle.spec.ts`
