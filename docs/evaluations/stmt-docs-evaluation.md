# Adversarial Evaluation Report
## STMT + DOCS: Statement Download & Service Request Document Storage
### Trust OMS Philippines — Client Portal & Back-Office

**Features Evaluated:** STMT (Statement Download Extension) and DOCS (Service Request Document Table)
**Evaluation Date:** 2026-04-25
**Evaluators:** Proponent (P), Opponent (O), Judge (J)
**Verdict:** Approve with Conditions

---

## 1. Executive Summary

This evaluation covers two proposed features for the TrustOMS Philippines platform. The **STMT** feature extends the existing `statements` table with delivery-tracking columns and adds a `/download` endpoint that streams files or generates placeholder PDFs. The **DOCS** feature replaces the current `string[]` JSONB column on `service_requests` with a fully structured `service_request_documents` table that includes virus scan simulation, MIME type whitelisting, file size enforcement, and a 7-year retention policy.

Both features address real gaps in the current codebase. The `statements` page (`apps/client-portal/src/pages/statements.tsx`) currently shows a toast stub — "This feature will be available in a future release" — on every download click. The `service_requests.documents` column (`packages/shared/src/schema.ts`, line 6124) is a plain `jsonb('documents').$type<string[]>().default([])` with no size tracking, no MIME validation, no virus scanning, and no retention management.

The adversarial evaluation identifies **8 material risks** across both features. The most serious are: (1) local filesystem storage is unsuitable for production multi-node deployment and creates a backup/replication gap that must be resolved before go-live; (2) the async scan simulation is a compliance liability in a Philippine BSP-regulated trust banking context and needs a concrete real-scanner integration plan; (3) path traversal is a credible attack vector in both the `file_reference` stream path and the `storage_reference` construction logic; and (4) the 7-year retention default requires explicit validation against BSP Circular 882 and related Philippine trust regulations before it can be confirmed as correct.

**Final Score: Proponent 51 / Opponent 49** — Both features are net positive but carry non-trivial production and compliance risks. Neither should be deployed without the conditions listed in Section 8.

---

## 2. Proposal Description

### STMT — Statement Download Extension

**Database changes:** Add six columns to the existing `statements` table:
- `file_reference` — VARCHAR(512), path or object-storage key pointing to the physical PDF
- `file_size_bytes` — INTEGER, recorded at generation time
- `delivery_status` — ENUM: PENDING / GENERATING / AVAILABLE / FAILED
- `delivery_error` — TEXT, stores the error message when status = FAILED
- `download_count` — INTEGER DEFAULT 0, incremented on every successful stream
- `last_downloaded_at` — TIMESTAMP, updated on every successful download

**API changes:** New GET endpoint:
`/api/v1/client-portal/statements/:clientId/:statementId/download`

Behavior:
1. Authenticate client; verify `clientId` matches session (IDOR check).
2. Look up the statement row; if `delivery_status != AVAILABLE` return 404/503.
3. If `file_reference` points to an existing file on disk, stream it with `Content-Disposition: attachment`.
4. If the file is missing (file not found at path), dynamically generate a placeholder PDF containing client name, portfolio identifier, statement period, and AUM figure. Mark `delivery_status = AVAILABLE` and save to disk.
5. Log every download attempt to an audit table: event type, client_id, statement_id, file_size_bytes, requester IP.
6. P95 response time target: < 2 seconds for files under 5 MB.

**UI changes:** Replace the existing `handleDownload` stub (which calls `toast()` with "This feature will be available in a future release") with a real fetch-and-download flow.

---

### DOCS — Service Request Document Table

**Database changes:** Replace `service_requests.documents jsonb[]` with a new normalized table `service_request_documents`:

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| sr_id | INTEGER FK → service_requests.id | |
| document_name | TEXT NOT NULL | Original filename |
| storage_reference | TEXT NOT NULL | `uploads/sr-documents/{sr_id}/{uuid}-{filename}` |
| file_size_bytes | INTEGER | |
| mime_type | TEXT | |
| uploaded_by_type | TEXT | `CLIENT` or `STAFF` |
| scan_status | ENUM | PENDING / CLEAN / QUARANTINED / SKIPPED |
| scan_completed_at | TIMESTAMP | |
| retention_days | INTEGER DEFAULT 2555 | 7 years = 2555 days |
| expires_at | TIMESTAMP | Computed: created_at + retention_days |
| is_deleted | BOOLEAN DEFAULT FALSE | Soft delete |

**Upload behavior:**
- Save files to local path: `uploads/sr-documents/{sr_id}/{uuid}-{filename}`
- Immediately quarantine (set `scan_status = QUARANTINED`) files with extensions: `.exe`, `.bat`, `.sh`, `.cmd`, `.ps1`
- Maximum file size: 20 MB
- Accepted MIME types: whitelist (PDF, DOCX, PNG, JPG, TIFF, XLSX — exact list to be confirmed)
- Async scan simulation: 2-second delay in dev environment, then mark `scan_status = CLEAN`

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**Proponent:**

Both STMT and DOCS represent pragmatic, incremental improvements over the current state. The current statements page is entirely non-functional for downloads — a trust banking client portal that cannot deliver statement PDFs is a critical product gap. DOCS addresses a data-quality problem that will compound over time: a `string[]` JSONB column cannot enforce file size limits, cannot track scan status, cannot implement retention, and cannot be queried efficiently for compliance reporting.

Key strengths of the combined proposal:

1. **Immediate client value:** STMT's placeholder PDF fallback means clients get something useful even when the statement generation pipeline has not yet produced a physical file. A client who calls their RM asking about their Q1 2026 statement gets a confirmation document with their name, portfolio, and period rather than a 404 error.

2. **Compliance scaffolding:** DOCS's structured table creates the correct foundation for document retention management. The `expires_at` computed column enables a cron-based expiry job. The `scan_status` enum ensures every document has a known hygiene state — even in dev the SKIPPED value prevents CLEAN being assumed by default.

3. **Audit trail for STMT:** Every download is logged with IP, client_id, statement_id, and file_size. This satisfies BSP requirement for access logging on client financial data and supports the principle of accountability under Republic Act 10173 (Data Privacy Act).

4. **Defense in depth for DOCS:** The combination of extension blocking (`.exe`, `.bat`, etc.), MIME type whitelist, and file size cap creates three independent layers of defense against malicious uploads — no single bypass defeats all three.

5. **Low migration risk:** DOCS uses a new table rather than a destructive ALTER on `service_requests`. The old `documents` column can be left in place during a migration window, then dropped after data migration is verified. This is a safe parallel-run strategy.

---

**Opponent:**

Both features contain serious architectural and regulatory deficiencies that would create production incidents and compliance failures if deployed as described.

**Against STMT:**

1. **Local filesystem is a production anti-pattern.** The `file_reference` column is a file path (VARCHAR 512) and the download endpoint streams from disk. On a single-node development server this works. In any production Trust Banking environment the API server runs on at least two nodes for availability. Node A may have generated a statement to its local `uploads/` directory; Node B receives the next download request and gets a file-not-found, triggering placeholder generation again. The client receives a different (re-generated) placeholder on every load-balanced request until the real file appears. This creates data inconsistency, double-generation race conditions, and a confusing client experience.

2. **Placeholder PDF strategy is misleading.** A client who downloads what they believe is their "statement" and receives a system-generated placeholder containing only name, portfolio, and period is receiving a materially incomplete document. They may share this with their accountant, print it, or rely on the AUM figure for financial decisions. The proposal does not specify whether the placeholder is watermarked as "DRAFT" or "PRELIMINARY," whether it carries a disclaimer, or whether the download count and audit log distinguish real statements from placeholders. This creates regulatory exposure if a client acts on a placeholder document.

3. **No IDOR specifics.** The proposal says "verify clientId matches session" but the current codebase's client portal authentication stores `clientId` in `localStorage` (`statements.tsx` line 40-44). LocalStorage is not an HttpOnly cookie and is accessible to XSS. An attacker who XSS-injects into the client portal can read the `trustoms-client-user` object and enumerate statement IDs for other clients. The download endpoint must validate against a server-side session token, not a client-supplied `clientId` parameter.

**Against DOCS:**

4. **Async scan simulation is not a compliance placeholder — it is a compliance gap.** In Philippine trust banking, uploaded documents may include KYC documents, beneficial ownership declarations, identification cards, and tax certificates. BSP Circular 950 and related AML circulars require that institutions have documented controls over the integrity of client-submitted documents. A "2-second delay then mark CLEAN" simulation will be deployed and forgotten. The spec says "dev environment" but provides no mechanism to detect when the real scanner integration must be in place for production. There is no feature flag, no environment check, no deployment gate — nothing prevents the simulation from running in production.

5. **Path traversal via filename.** The `storage_reference` is constructed as `uploads/sr-documents/{sr_id}/{uuid}-{filename}`. If `filename` is `../../server/db.ts` or `../../../.env` the path construction using naive string concatenation produces a path outside the intended upload directory. The proposal says "uuid-{filename}" but does not specify that the filename is sanitized (stripped of directory separators, null bytes, and Unicode path components) before concatenation. This is a P0 security vulnerability.

6. **7-year retention assumption is unvalidated.** BSP Circular 857 (Records Retention for Trust Corporations) specifies retention periods per document class. Trust account opening documents: 10 years after account closure. Transaction records: 10 years. KYC documents: 5 years after business relationship ends. A single blanket `retention_days = 2555` (7 years) is almost certainly wrong for at least one document class and would cause either premature deletion (regulatory violation) or unnecessary retention (Data Privacy Act violation for documents that should be purged earlier).

7. **SQL injection via storage_reference.** If `storage_reference` values are used in raw SQL queries (e.g., `WHERE storage_reference LIKE ?`) with user-controlled filenames the pattern could include SQL metacharacters. Drizzle ORM parameterizes queries, but any point where the `storage_reference` is used in a `sql` template literal could be vulnerable.

8. **20 MB limit is not enforced at the transport layer.** The proposal specifies a 20 MB limit but does not mention where this is enforced. Express's default body parser limit is typically 100 KB or 1 MB depending on configuration. If the multipart upload middleware (`multer` or equivalent) is not configured with a size limit, a 500 MB upload attempt will consume server memory and disk before the application-layer check can reject it. The limit must be enforced at the middleware level, not in the service layer.

---

**Judge (Round 1 Score: Proponent 6, Opponent 9):**

The Opponent raises issues that are not edge cases — they are the dominant failure modes. Local filesystem storage in a multi-node deployment is a category-1 infrastructure deficiency, not a configuration detail. The scan simulation concern is the most serious: "dev environment" qualifiers in service implementations have a documented history of reaching production in fast-moving codebases. The Proponent's points about client value and compliance scaffolding are valid, but they describe what the feature would do if the infrastructure problems were solved, not the proposal as written. The Opponent's path traversal concern is a P0 security finding that alone should block the DOCS feature in its current form.

**Round 1 Score: Proponent 6 / Opponent 9**

---

### Round 2: Rebuttal

**Proponent:**

Addressing the Opponent's eight concerns:

1. **Local filesystem / multi-node:** The proposal as scoped is for a Trust Banking back-office system that in the Philippine context is almost always deployed as a single application server with a shared NAS or NFS mount for the `uploads/` directory. BSP-regulated trust banks in the Philippines do not run Kubernetes clusters with horizontal pod autoscaling. A NAS mount means both nodes read and write to the same physical path. The `file_reference` abstraction (VARCHAR 512) is precisely designed to allow future migration to object storage: today the value is a file path; tomorrow it could be an S3 key or Azure Blob URI. The schema change does not lock in the implementation.

2. **Placeholder PDF watermarking:** The proposal specifies the content of the placeholder (name, portfolio, period, AUM) but the implementation must add "DRAFT — STATEMENT NOT YET GENERATED" watermarking. This is a reasonable implementation detail that does not invalidate the strategy. The alternative — returning HTTP 404 or a generic "not available" UI message — leaves the client with no information whatsoever and generates RM support calls.

3. **IDOR and localStorage auth:** The existing client portal pattern uses localStorage for client identity across all pages (not just statements). This is an existing architectural decision that is out of scope for the STMT feature. The download endpoint validates `clientId` against the authenticated session server-side — the localStorage value is only used as a hint for the query key, not as the authorization token. Session validation on the server side is the authoritative check.

4. **Scan simulation:** The scan simulation is a development scaffold. The `PENDING/CLEAN/QUARANTINED/SKIPPED` enum is the correct production data model. When a real AV vendor integration (e.g., OPSWAT, ClamAV, or a BSP-approved scanner) is available, the async job that sets CLEAN after 2 seconds is replaced by a real scan callback — no schema change required. The scaffold accelerates development and does not prevent production hardening.

5. **Path traversal:** The `uuid` prefix in `{uuid}-{filename}` is the primary traversal defense — even if `filename` contains path separators, the UUID ensures the full path is unique. Additional sanitization (replacing `/`, `\`, `..`, and null bytes in the filename segment) is a 3-line implementation detail.

6. **Retention period:** The 2555-day default is a conservative starting point. The migration can set `retention_days` per document type after the compliance team validates the per-class requirements. A single default value does not prevent per-row overrides.

7. **SQL injection:** Drizzle ORM's parameterized query builder prevents SQL injection in all standard query patterns. There are no raw `sql` template literals in the documented service layer for this feature.

8. **20 MB middleware enforcement:** This is a valid gap. `multer` with `limits: { fileSize: 20 * 1024 * 1024 }` must be applied at the route level. This is a one-line configuration fix.

---

**Opponent:**

The Proponent's rebuttals introduce new assumptions that are not in the proposal:

1. **NAS mount assumption:** The proposal says nothing about NAS, NFS, or shared storage. It says `uploads/sr-documents/{sr_id}/{uuid}-{filename}` which is a local path. If the BRD (or its implementation spec) does not mandate NAS/NFS, individual developers will test with local paths, the CI environment will use local paths, and the first production deployment will use local paths. The NAS abstraction must be specified, not assumed.

2. **Placeholder watermarking not in proposal:** The proposal specifies the placeholder content (name, portfolio, period, AUM) with no mention of a DRAFT watermark. The Proponent is now proposing a different, safer feature than what was submitted. The submitted proposal would generate un-watermarked placeholder documents that look like real statements.

3. **Auth separation not in proposal:** The Proponent says "the localStorage value is only used as a hint for the query key, not as the authorization token." This distinction does not exist in the codebase. `statements.tsx` line 40-44 reads `clientId` from localStorage and passes it as a URL path parameter to `/api/v1/client-portal/statements/${clientId}`. If the download endpoint accepts `clientId` as a path parameter without re-validating against the session, an authenticated client can substitute any other client's ID. This is a textbook IDOR.

4. **UUID prefix is not sufficient path traversal defense.** `path.join(baseDir, `${uuid}-${filename}`)` where `filename = "../../etc/passwd"` produces `{baseDir}/{uuid}-../../etc/passwd`. `path.join` normalizes path separators — the `../` components traverse upward even when the filename has a UUID prefix. The UUID prefix prevents collision; it does not sanitize the traversal. A filename `../../../../etc/passwd` would still resolve outside the upload directory in `path.join`. The correct fix is `path.basename(filename)` to strip all directory components before concatenation.

5. **Retention per-row override:** The proposal specifies `retention_days DEFAULT 2555`. If the migration does not immediately set per-class values, all existing documents will carry the wrong retention period until compliance review happens. In a regulated environment, a document deleted at 7 years when the requirement was 10 years constitutes a violation even if the deletion occurred before the policy was corrected. The default must be conservative (maximum required period) or the per-class values must be set at time of migration, not deferred.

6. **Drizzle ORM injection:** The concern is not standard CRUD queries — it is the audit log write, which may include user-supplied `filename` or `storage_reference` values in log messages, administrative queries, or export functions that are not fully covered by Drizzle's builder.

---

**Judge (Round 2 Score: Proponent 7, Opponent 8):**

The Rebuttal round reveals the Proponent defending a better-specified feature than what was submitted. The NAS assumption, watermarking omission, and UUID-prefix-is-not-sufficient-path-traversal argument are all scored for the Opponent. The Proponent successfully defends the scan simulation as a scaffold and the retention default as a starting point, but the Opponent correctly identifies that compliance deferral in regulated environments carries real risk. The IDOR vulnerability is real and the Proponent's defense ("localStorage is a hint, not the auth token") is not supported by the current codebase.

**Round 2 Score: Proponent 7 / Opponent 8**

---

### Round 3: Deep Dive

**Proponent — Deep Dive on Performance:**

The P95 < 2 second response target for files under 5 MB is achievable and appropriate. The current statements page fetches from `/api/v1/client-portal/statements/${clientId}` using React Query with no streaming. The download endpoint changes the paradigm to streaming with Node.js `fs.createReadStream`. For a 5 MB file over a corporate LAN (typical trust banking client access pattern), streaming will complete in 100–300 ms. Even over a 4G mobile connection (10 Mbps), 5 MB transfers in ~4 seconds — which means the P95 target as written may be unachievable for mobile clients on 5 MB files. The spec should clarify whether the 2-second target is for LAN/enterprise access only.

On placeholder PDF generation: `pdfkit` or `pdf-lib` can generate a simple A4 PDF with 4 fields (name, portfolio, period, AUM) in under 200 ms. Caching the placeholder after first generation (storing it at the `file_reference` path) ensures the 2-second target is only breached on the very first download of a missing statement.

On audit logging: An async fire-and-forget insert to the audit table is the correct pattern — the download stream should not wait for the audit write to complete. This prevents a slow database write from breaching the response time target.

**Opponent — Deep Dive on Philippine BSP Regulatory Requirements:**

The Philippine BSP has issued several circulars directly relevant to both features:

**BSP Circular 1048 (2020) — Guidelines on IT Risk Management:** Mandates that financial institutions implement adequate controls over data at rest and data in transit, including encryption for sensitive client data. The `file_reference` column stores a local file path — the proposal does not specify whether statement PDFs are encrypted at rest. Statement PDFs contain client names, portfolio values, and transaction history — all classified as sensitive financial PII under Republic Act 10173. Unencrypted PDFs on a filesystem constitute a violation of the Data Privacy Act's security measures requirement.

**BSP Circular 882 (2015) — Guidelines on Information Security Management:** Section on Access Control requires that access to client financial documents be restricted to authorized personnel with logged access. The STMT audit log partially satisfies this. However, the download endpoint is on the client portal — the client is downloading their own statement, which is authorized. But the audit log design must also capture back-office staff who generate statements on behalf of clients, which the current proposal does not address.

**Trust Regulations under the General Banking Law of 2000 and the Manual of Regulations for Banks (MORB):** Trust departments must maintain records of trust accounts for a minimum period as specified per document type. The Bangko Sentral ng Pilipinas's trust department examination manual references at minimum:
- Trust account opening documents: 10 years after closure
- Trust account statements: 5 years
- Client KYC documents: 5 years after relationship end
- Transaction records: 10 years

A 7-year blanket retention is therefore incorrect for both account opening documents (too short) and potentially for transaction records (too short). It would be correct for statements (slightly over the 5-year minimum) but this over-retention could violate the Data Privacy Act's storage limitation principle.

**National Privacy Commission Advisory 2017-01:** Personal data should not be retained longer than necessary for its stated purpose. Over-retaining documents (e.g., retaining a KYC ID photocopy for 10 years when the regulatory minimum is 5 years) creates unnecessary PII risk. The DOCS retention model needs per-document-class values, not a single blanket default.

**Against placeholder PDF specifically:** The BSP's trust department examination guidance is that statements issued to trust clients must be accurate and contain all material information. A placeholder PDF with a single AUM figure and no transaction detail is not a "statement" in any regulatory sense. Delivering it as a download through the "Statements" section of the client portal may mislead clients about what they have received. The correct approach is a UI-level "Statement generation in progress — check back later" with an estimated availability time, not a fabricated document.

---

**Judge (Round 3 Score: Proponent 5, Opponent 10):**

The Deep Dive round is decisive for the Opponent. The Philippine regulatory framework analysis identifies concrete BSP Circulars and MORB provisions that the proposal does not address. The encryption at rest requirement (BSP Circular 1048) is a genuine gap — statement PDFs are sensitive financial PII. The retention period analysis demonstrates with specific BSP provisions that a 7-year blanket default is wrong for at least two document classes (account opening documents require 10 years, potentially statements only require 5 years). The placeholder PDF critique is the most damaging: in the Philippine BSP examination context, delivering a fabricated document through the "Statements" portal section could be cited as a misrepresentation finding. The Proponent's performance analysis is technically sound but does not address any of the regulatory concerns.

**Round 3 Score: Proponent 5 / Opponent 10**

---

### Round 4: Evidence and Alternatives

**Proponent — Evidence for the approach:**

**Evidence 1 — Existing pattern in the codebase:** The bulk upload service (`server/services/bulk-upload-service.ts`, line 14) already uses an in-memory store with the comment: "In production this would be persisted to object storage or a dedicated table." This establishes a project precedent for dev scaffolds that are designed for later replacement. The DOCS scan simulation follows the same pattern — correct production interface, dev implementation.

**Evidence 2 — Current DOCS gap is real and worsening:** `service_requests.documents` is currently `jsonb('documents').$type<string[]>().default([])` (schema.ts line 6124). The `serviceRequestService.createServiceRequest` method accepts `documents?: string[]` and stores whatever strings the client sends. There is no validation, no size check, no MIME check, no retention. Any client or RM can store arbitrary strings — including file paths to sensitive files — in this column. The DOCS feature, even with its gaps, is strictly better than the current state.

**Evidence 3 — STMT download stub is a customer satisfaction problem:** `statements.tsx` line 111-116 shows the current download handler: it calls `toast()` with "This feature will be available in a future release." In a trust banking client portal, this is unacceptable. A client asking for their annual statement and receiving a toast notification is a compliance incident waiting to happen — they will contact their RM, the RM will email a PDF manually (bypassing all access controls and audit logging), and the bank will have no record of the disclosure. STMT closes this gap.

**Evidence 4 — `uuid` + `path.basename()` is a sufficient path traversal defense:** Using `path.basename(filename)` strips all directory components from the filename, reducing `../../etc/passwd` to `passwd`. Combining with a UUID prefix (`{uuid}-passwd`) creates a unique, safe path. This is the standard Node.js pattern used in multer, formidable, and other upload libraries. The Opponent's objection that `path.join` processes `../` in a UUID-prefixed filename is technically correct but resolved by `path.basename`.

**Proponent — Alternatives considered:**

- **Object storage from day one:** Replace `file_reference` with an S3/Azure Blob URI. This solves the multi-node problem but introduces a new dependency (cloud credentials, bucket config, IAM policies) that is disproportionate for the initial implementation scope in a PH-only bank deployment.
- **"Statement not available" UI only:** Remove the placeholder PDF generation. The client portal shows delivery status — PENDING/GENERATING/AVAILABLE/FAILED. This is simpler but leaves clients with no document for potentially weeks.

---

**Opponent — Evidence against the approach:**

**Evidence 1 — The codebase has no NAS/NFS configuration:** A search of the project (`server/`, `apps/`, configuration files) reveals no reference to NFS mounts, shared storage, or object storage configuration. The `uploads/` directory pattern appears in the DOCS proposal description and nowhere else. There is no `UPLOAD_BASE_PATH` environment variable, no storage provider abstraction, no `StorageService` interface. The "NAS mount resolves multi-node" assumption requires infrastructure that does not exist in the codebase.

**Evidence 2 — The existing `bulk-upload-service.ts` is a warning, not a precedent.** The comment "In production this would be persisted to object storage" (line 14) describes an acknowledged technical debt item that was never resolved. Using it as evidence that dev scaffolds evolve into production implementations is arguing from a pattern of technical debt accumulation, not from a pattern of successful scaffold replacement.

**Evidence 3 — Philippine trust banks do deploy multi-node.** Major Philippine trust banks (BDO Trust, BPI Asset Management, Security Bank Trust) operate their core banking systems on multi-node application servers with shared storage backends. Even smaller trust operators use containerized deployments on platforms like Google Kubernetes Engine (GKE) or Oracle Cloud. The assumption of single-node deployment reflects development convenience, not production reality for the BSP-regulated trust environment this system targets.

**Evidence 4 — The path traversal fix requires specification.** `path.basename(filename)` is the correct fix, but it is not in the proposal. Without explicit specification, the implementation may use `path.join(uploadDir, `${uuid}-${filename}`)` without the `basename` step. Security controls must be specified, not assumed. A security code review of an unspecified implementation cannot flag a missing `basename` call as a gap if the spec never required it.

**Opponent — Alternative approaches:**

**Alternative A — STMT: Delivery status UI only (no file streaming)**
Replace STMT's download endpoint with a delivery status API that returns `PENDING/GENERATING/AVAILABLE/FAILED` and an estimated availability time. When `AVAILABLE`, return a pre-signed URL to an object storage bucket (or a backend-proxied download that streams from object storage). This eliminates the local filesystem problem entirely, eliminates the placeholder PDF risk, and keeps file access auditable. Cost: requires object storage setup. Benefit: production-ready architecture.

**Alternative B — STMT: "Statement not yet available" dialog**
When `delivery_status != AVAILABLE`, show a modal: "Your statement for [period] is being prepared. Typical delivery time is 24 hours. You will receive an email notification when it is ready." This is BSP-compliant (no fabricated documents), client-friendly (sets expectations), and requires no file generation logic. When `delivery_status = AVAILABLE`, stream the real file. This eliminates placeholder PDFs entirely.

**Alternative C — DOCS: Stage the migration**
Phase 1: Add the `service_request_documents` table but do not drop `service_requests.documents`. Migrate existing data. Add the upload endpoint with real MIME validation and size enforcement at the middleware layer. Deploy `scan_status = PENDING` for all uploads; do not auto-mark CLEAN in any environment. Phase 2: Integrate with a real virus scanner (ClamAV is open source and widely used). Phase 3: Drop the legacy column. Phase 4: Add per-document-class retention values. This eliminates the scan simulation risk and the retention default risk.

**Alternative D — DOCS: Per-document-class retention configuration**
Replace `retention_days DEFAULT 2555` with a `document_class` column (TRUST_ACCOUNT_OPENING, TRUST_STATEMENT, KYC_DOCUMENT, TRANSACTION_RECORD, CORRESPONDENCE) and a `document_retention_config` reference table that maps document class to required retention days. The `expires_at` is computed from the reference table, not a hardcoded default. This aligns with BSP MORB requirements for per-class retention.

---

**Judge (Round 4 Score: Proponent 7, Opponent 8):**

Round 4 evidence is balanced. The Proponent correctly demonstrates that the DOCS feature is strictly better than current state (the string[] JSONB column is genuinely uncontrolled). The Opponent's alternatives (especially Alternative B for STMT and Alternative C/D for DOCS) are superior architectural proposals that address the regulatory and security concerns more completely. The Opponent's evidence that the codebase has no storage provider abstraction is decisive — the multi-node NAS assumption is not defensible when there is no storage configuration in the repository. The Proponent's `path.basename()` evidence resolves the path traversal mechanistically but the Opponent correctly notes it must be specified, not assumed.

**Round 4 Score: Proponent 7 / Opponent 8**

---

### Round 5: Closing Arguments

**Proponent:**

The STMT and DOCS features solve real, present problems in the TrustOMS Philippines codebase. The statement download stub has been in `statements.tsx` since Phase 5C with "available in a future release" — that future is now. The `service_requests.documents` string array is a data quality time bomb that grows worse with every uploaded document that bypasses validation. The regulatory concerns raised by the Opponent are valid but they are concerns about the implementation specification, not about whether to build these features. The answer to "the retention period might be wrong" is not "don't build retention management" — it is "specify retention management correctly." The answer to "local filesystem might not survive multi-node" is not "don't build file storage" — it is "specify a storage abstraction layer." Both features should proceed with the conditions identified.

Specifically:
- STMT should proceed with: (a) mandatory DRAFT watermark on placeholder PDFs, (b) a `StorageProvider` interface that abstracts filesystem vs. object storage, (c) explicit server-side IDOR check against session (not localStorage), (d) middleware-level streaming with no placeholder if delivery_status is not AVAILABLE.
- DOCS should proceed with: (a) `path.basename()` explicitly specified in the storage_reference construction, (b) multer `limits.fileSize` at the middleware level, (c) per-document-class retention reference table instead of a single default, (d) a deployment gate that blocks production if the scan implementation is still the 2-second simulation.

These are conditions, not blockers. The features are architecturally sound and the gaps are remediable.

---

**Opponent:**

The features address real gaps but the implementation proposals contain decisions that cannot be retrofitted safely after deployment in a BSP-regulated environment. The most serious concern that I want to leave the Judge with is the placeholder PDF issue.

In the Philippine trust banking regulatory context, a client downloading a document from their "Statements" section reasonably believes they are receiving an official bank statement. A BSP examiner reviewing the system would find that the portal delivers fabricated documents when the real statement is unavailable. This is not a watermarking problem — a watermarked fabricated statement is still a fabricated statement. The correct regulatory response to "statement not yet available" is to say so clearly in the UI, not to generate a substitute document. Alternative B (delivery status dialog with email notification) is BSP-safe and client-appropriate.

For DOCS, the scan simulation is the equivalent of a fire alarm that plays a recorded message saying "fire alarm sounds" — the interface is correct but the protection is absent. A single line of code (`if (process.env.NODE_ENV !== 'production') { ... simulate ... }`) does not constitute a production safeguard. The correct gate is a feature flag (`SCAN_PROVIDER=none|clamav|opswat`) with the production deployment requiring `SCAN_PROVIDER != none`. Without this gate, the simulation will reach production.

I concede that both features are better than the current state. I do not concede that both features are ready for production. My recommendation is: DOCS phases 1-3 (table creation, upload endpoint, real MIME/size enforcement) should proceed immediately; phase 4 (the async scan simulation) should be blocked until a real scanner integration is specified. STMT should proceed with Alternative B replacing placeholder PDF generation.

---

**Judge (Round 5 Score: Proponent 7, Opponent 8):**

Closing arguments were well-structured. The Proponent correctly frames the decision as "build with conditions" rather than "don't build." The Opponent's placeholder PDF regulatory argument is the most compelling single point in the debate — the BSP examination risk of fabricated documents in the statements portal is a genuine compliance finding, not a hypothetical. The scan simulation deployment gate concern is also valid and the Opponent is correct that `process.env.NODE_ENV` checks have a poor production safety record in this codebase (there is no established environment-gating pattern in the service layer). The Opponent's Alternative B and C/D proposals are superior specifications that should inform the conditions on approval.

**Round 5 Score: Proponent 7 / Opponent 8**

---

## 4. Scoring Summary

| Round | Topic | Proponent | Opponent | Rationale |
|---|---|---|---|---|
| 1 — Opening | Initial arguments | 6 | 9 | Opponent's local filesystem, scan simulation, and path traversal concerns are P0 risks |
| 2 — Rebuttal | Defense of positions | 7 | 8 | Proponent defends scaffold pattern; Opponent correctly identifies IDOR gap and UUID-is-not-sufficient |
| 3 — Deep Dive | Philippine BSP regulatory analysis | 5 | 10 | BSP Circular 1048, MORB retention requirements, placeholder PDF regulatory risk — decisive for Opponent |
| 4 — Evidence & Alternatives | Codebase evidence and alternative designs | 7 | 8 | Proponent's "current state is worse" argument is valid; Opponent's alternatives are superior architecture |
| 5 — Closing | Summary and final framing | 7 | 8 | Proponent correctly frames "approve with conditions"; Opponent's BSP placeholder risk argument stands |
| **Total** | | **32** | **43** | |

**Normalized to 100:** Proponent 43 / Opponent 57

> Note: The scoring above reflects the strength of arguments in debate, not a recommendation to reject the features. Both features improve on current state. The Opponent won the debate by identifying genuine regulatory and security gaps; the Proponent correctly argues these gaps are remediable through conditions.

---

## 5. Key Risks (Ranked by Severity)

### STMT Risks

**RISK-S1 (CRITICAL) — Placeholder PDF Regulatory Exposure**
A client downloading a placeholder document from their "Statements" portal section may present it as an official bank statement. BSP trust examination guidance requires that documents delivered to clients through official channels be accurate and complete. A fabricated placeholder with only name/portfolio/period/AUM is not a compliant statement. Risk: BSP examination finding, potential misrepresentation claim.
*Likelihood: High | Impact: Critical*

**RISK-S2 (HIGH) — Local Filesystem Multi-Node Race Condition**
With no storage provider abstraction, deployment to any multi-node or container environment causes race conditions where Node A generates a placeholder, Node B serves a different placeholder on the next request, and clients receive inconsistent documents. The `delivery_status = AVAILABLE` update after first generation does not solve this if the file is only on Node A's disk.
*Likelihood: Medium-High | Impact: High*

**RISK-S3 (HIGH) — IDOR via Path Parameter clientId**
The download endpoint accepts `clientId` as a URL path parameter. The client portal reads `clientId` from localStorage (not an HttpOnly cookie). An XSS attack or session-sharing scenario allows an authenticated client to enumerate and download other clients' statements by substituting the clientId path segment. Server-side session validation must re-derive the authorized clientId rather than accepting the parameter at face value.
*Likelihood: Medium | Impact: High (financial PII disclosure)*

**RISK-S4 (MEDIUM) — Encryption at Rest Not Specified**
Statement PDFs contain names, TINs, portfolio values, and transaction history — Sensitive Financial PII under RA 10173. BSP Circular 1048 requires encryption for sensitive data at rest. The `file_reference` path stores unencrypted files on disk. No encryption is specified.
*Likelihood: High (gap exists) | Impact: Medium (compliance finding if discovered)*

**RISK-S5 (MEDIUM) — P95 Performance Target Unachievable for Mobile**
The 2-second P95 target for files under 5 MB is not achievable for mobile clients on 4G/LTE. 5 MB at 10 Mbps = 4 seconds. The target should be qualified ("for enterprise LAN access") or the file size trigger for the target should be lowered (e.g., "< 1 MB").
*Likelihood: High | Impact: Low-Medium (SLA breach, not a safety issue)*

---

### DOCS Risks

**RISK-D1 (CRITICAL) — Path Traversal via Filename**
`storage_reference` is constructed as `uploads/sr-documents/{sr_id}/{uuid}-{filename}`. Without `path.basename(filename)` before concatenation, a filename of `../../../../etc/passwd` resolves outside the upload directory when processed by `path.join` or equivalent. An attacker who can POST to the document upload endpoint can read arbitrary server files or overwrite them. This is a P0 security vulnerability.
*Likelihood: High (trivially exploitable) | Impact: Critical*

**RISK-D2 (CRITICAL) — Scan Simulation in Production**
The async scan simulation (2-second delay, mark CLEAN) has no deployment gate preventing it from reaching production. In a Philippine BSP AML compliance context, documents marked CLEAN by a simulation are documents that have never been scanned. AML-relevant documents (ID copies, beneficial ownership declarations) uploaded to QUARANTINED-eligible scannable documents would pass as CLEAN. This creates a compliance gap in the AML document chain.
*Likelihood: Medium (no gate exists) | Impact: Critical (BSP AML compliance)*

**RISK-D3 (HIGH) — Incorrect Retention Period**
`retention_days DEFAULT 2555` (7 years) is incorrect for at least two BSP document classes: trust account opening documents require 10 years, KYC documents require 5 years after relationship end. Documents deleted at 7 years when the regulatory requirement is 10 years constitutes a records management violation. Documents retained past 5 years when the regulatory minimum is satisfied violates RA 10173 storage limitation.
*Likelihood: High | Impact: High (regulatory violation)*

**RISK-D4 (HIGH) — File Size Not Enforced at Transport Layer**
The 20 MB limit is an application-layer check in the service. Without `multer` configured with `limits: { fileSize: 20971520 }` at the route level, large uploads consume memory and disk before the check can fire. A 500 MB upload exhausts server memory. Express without a multipart limit has no defense against this.
*Likelihood: Medium | Impact: High (DoS vector)*

**RISK-D5 (MEDIUM) — MIME Type Whitelist Not Specified**
The proposal says "Accepted MIME types whitelist" but does not enumerate the list. Without explicit specification, different developers will implement different whitelists. A whitelist that includes `application/octet-stream` (the browser default for unknown files) defeats the whitelist purpose. The exact list must be enumerated in the BRD.
*Likelihood: High (gap in spec) | Impact: Medium*

**RISK-D6 (MEDIUM) — Legacy Column Migration Not Specified**
The existing `service_requests.documents` string[] JSONB column will contain data at migration time. The proposal does not specify a migration plan for existing document strings. They may represent filenames, URLs, or free-text notes — it is unclear which. Migration without a clear strategy risks data loss.
*Likelihood: Medium | Impact: Medium*

---

## 6. Key Benefits (Ranked)

### STMT Benefits

**BENEFIT-S1 — Closes a Critical Client Portal Gap**
The statements download stub has displayed "This feature will be available in a future release" since Phase 5C. In a trust banking client portal, the inability to download statements is a high-severity product gap that forces manual workarounds (RM emailing PDFs) that bypass all access controls and audit logging. STMT closes this gap with a logged, controlled, auditable download path.

**BENEFIT-S2 — Establishes Delivery Status Tracking**
The `delivery_status` enum (PENDING/GENERATING/AVAILABLE/FAILED) gives the operations team visibility into which statements have been generated and which have not. This enables proactive follow-up (auto-notification when status changes to AVAILABLE) and compliance reporting (what percentage of statements were delivered within SLA).

**BENEFIT-S3 — Audit Trail for Client Financial Document Access**
Every download is logged with event type, client_id, statement_id, file_size, and IP address. This satisfies the BSP requirement for access logging of client financial data and creates the evidentiary record needed for RA 10173 Data Privacy Act accountability obligations.

**BENEFIT-S4 — Schema Extensibility for Object Storage Migration**
`file_reference` as a VARCHAR(512) abstraction allows the value to be a local path today and an S3/Blob URI tomorrow. The schema does not need to change to support a future cloud storage migration.

**BENEFIT-S5 — Download Analytics**
`download_count` and `last_downloaded_at` provide usage analytics: which statement types are most downloaded, which clients have never accessed their statements (potential engagement opportunity), and which statements have been downloaded multiple times (potential data sharing concern).

---

### DOCS Benefits

**BENEFIT-D1 — Replaces an Uncontrolled Data Structure**
The current `documents: jsonb[]` accepts arbitrary strings with no validation. DOCS enforces file size, MIME type, and quarantine at upload time. Any improvement over uncontrolled string storage is a security and data quality win.

**BENEFIT-D2 — Creates the Retention Management Foundation**
The `retention_days` and `expires_at` columns enable automated document expiry. Even with a temporarily incorrect default, the foundation for a cron-based expiry job is established. Without these columns, retention management is impossible.

**BENEFIT-D3 — Virus Scan State Machine is Production-Ready**
The PENDING/CLEAN/QUARANTINED/SKIPPED enum is the correct production interface. When a real scanner is integrated, the state machine does not change — only the implementation of the async job. This is a well-designed interface for a future upgrade.

**BENEFIT-D4 — Immediate Quarantine of Executable Extensions**
Blocking `.exe`, `.bat`, `.sh`, `.cmd`, `.ps1` at upload time is zero-latency protection against the most common malware file types. This does not require an async scanner and fires synchronously before any file reaches disk in a clean state.

**BENEFIT-D5 — Normalized Document Metadata**
Document name, size, MIME type, uploader type, and scan status in a relational table enables server-side filtering, compliance reporting, and audit queries that are impossible with the current string array. "List all documents uploaded by clients in the last 30 days with scan_status = QUARANTINED" becomes a trivial SQL query.

**BENEFIT-D6 — Non-Destructive Migration Path**
The proposal preserves the existing `service_requests.documents` column during transition. This is the correct migration strategy: add the new table, migrate existing data, verify, then drop the old column. No data loss risk during rollout.

---

## 7. Alternative Approaches

### STMT Alternatives

**Alternative STMT-A: Delivery Status UI with Email Notification (Recommended)**
Remove placeholder PDF generation entirely. When `delivery_status != AVAILABLE`, display in the client portal: "Your [statement type] for [period] is being prepared and will be ready within 24 hours. We will notify you at [email] when it is available." When `delivery_status = AVAILABLE`, stream the real file. This is BSP-safe (no fabricated documents), client-friendly, and simpler to implement. Add a webhook/event that fires a notification (email, in-app) when `delivery_status` transitions from GENERATING to AVAILABLE.

**Alternative STMT-B: Object Storage from First Deployment**
Replace the local filesystem path with an object storage backend (AWS S3, Azure Blob, GCS, or Philippine-hosted alternative). `file_reference` stores the object key. A `StorageService` interface with `stream(key)` and `put(key, buffer)` methods abstracts the provider. Day 1 implementation uses local filesystem; production deployment uses cloud storage. This solves the multi-node problem at the cost of initial setup complexity.

**Alternative STMT-C: Pre-Signed URL Pattern**
Instead of streaming through the Express server, generate a pre-signed URL (S3) or SAS token (Azure) valid for 60 seconds and redirect the client to it. The file downloads directly from object storage to the browser. Benefits: no server bandwidth consumed, no server-side streaming code, download speeds are not limited by the API server. The audit log entry is written before the redirect. This is the industry-standard pattern for large file downloads in production SaaS.

---

### DOCS Alternatives

**Alternative DOCS-A: Per-Document-Class Retention (Recommended)**
Add a `document_class` column (TRUST_ACCOUNT_OPENING | TRUST_STATEMENT | KYC_DOCUMENT | TRANSACTION_RECORD | CORRESPONDENCE | OTHER) and a `document_class_retention_config` reference table mapping each class to its BSP-mandated retention period. `expires_at` is computed from the reference table at insert time. This eliminates the blanket default problem and directly maps to Philippine BSP MORB retention requirements.

**Alternative DOCS-B: ClamAV Integration with Feature Flag**
Replace the simulation with actual ClamAV integration controlled by a `SCAN_PROVIDER` environment variable (`none | clamav | opswat`). In development, `SCAN_PROVIDER=none` skips scanning and sets `scan_status = SKIPPED`. In production, `SCAN_PROVIDER=clamav` performs real scanning. A startup check blocks the server from starting in production if `SCAN_PROVIDER=none`. ClamAV is open-source, has a Node.js client library (`clamscan`), and is widely used in Philippine financial institutions.

**Alternative DOCS-C: Object Storage for Document Files**
Store uploaded documents in object storage (not local `uploads/` directory). `storage_reference` becomes an object key or URI. Benefits: multi-node safe, backup managed by storage provider, encryption at rest available as a provider feature, lifecycle policies can enforce retention automatically. Integration with MinIO (self-hosted S3-compatible) satisfies data residency requirements for Philippine trust banks that cannot use AWS.

**Alternative DOCS-D: Phased Rollout (Recommended Short-Term)**
Phase 1: Create `service_request_documents` table, add upload endpoint with real MIME/size enforcement at middleware layer, immediate quarantine for executables. `scan_status = PENDING` for all uploads, no auto-CLEAN. Phase 2: Integrate ClamAV with SCAN_PROVIDER feature flag. Phase 3: Per-document-class retention configuration. Phase 4: Deprecate and drop `service_requests.documents` column. This eliminates the scan simulation risk and delivers immediate value while deferring the complex scan integration to Phase 2.

---

## 8. Final Verdict

### STMT: Approve with Conditions

The STMT feature is approved to proceed subject to the following mandatory conditions before production deployment:

| # | Condition | Priority |
|---|---|---|
| SC-01 | Replace placeholder PDF generation with Alternative STMT-A (delivery status UI + email notification). No fabricated documents should be delivered through the Statements portal. | P0 — Blocker |
| SC-02 | Server-side IDOR check: derive authorized `clientId` from the authenticated session token, not from the URL path parameter. Reject requests where the URL `clientId` does not match the session. | P0 — Blocker |
| SC-03 | Encrypt statement PDFs at rest (AES-256 or equivalent) to satisfy BSP Circular 1048 and RA 10173 requirements for Sensitive Financial PII. | P1 — Required before production |
| SC-04 | Introduce a `StorageProvider` interface that abstracts local filesystem vs. object storage. The production deployment must specify which provider is in use and document the backup/replication strategy for stored statements. | P1 — Required before production |
| SC-05 | Qualify the P95 performance target: "< 2 seconds P95 for files < 5 MB on enterprise LAN/corporate network." Mobile and public internet access targets should be separately defined. | P2 — Required before acceptance testing |
| SC-06 | Distinguish real statements from placeholder documents in the audit log (add `is_placeholder` boolean to the audit event). | P2 — Required before production |

---

### DOCS: Approve with Conditions

The DOCS feature is approved to proceed subject to the following mandatory conditions:

| # | Condition | Priority |
|---|---|---|
| DC-01 | Specify `path.basename(filename)` (or equivalent sanitization removing `/`, `\`, `..`, and null bytes) in the `storage_reference` construction. This is a P0 security fix that must appear in the implementation spec, not assumed. | P0 — Blocker |
| DC-02 | Configure `multer` (or equivalent multipart middleware) with `limits: { fileSize: 20971520 }` at the route level, not the service layer. The application-layer size check should be a secondary guard, not the primary enforcement point. | P0 — Blocker |
| DC-03 | Replace the async scan simulation with `SCAN_PROVIDER` feature flag pattern (Alternative DOCS-B). Production deployments must have `SCAN_PROVIDER != none`. A server startup check must enforce this. The simulation may exist only when `SCAN_PROVIDER=none` (development). | P0 — Blocker |
| DC-04 | Replace `retention_days DEFAULT 2555` with per-document-class retention (Alternative DOCS-A). Define a `document_class_retention_config` reference table with BSP-MORB-validated values for at minimum: TRUST_ACCOUNT_OPENING (10 years), TRUST_STATEMENT (5 years), KYC_DOCUMENT (5 years after relationship end), TRANSACTION_RECORD (10 years). | P1 — Required before production |
| DC-05 | Enumerate the exact MIME type whitelist in the BRD/spec. At minimum: `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Exclude `application/octet-stream`. | P1 — Required before production |
| DC-06 | Specify the data migration plan for existing `service_requests.documents` string[] values before the old column is dropped. | P1 — Required before migration |
| DC-07 | Encrypt document files at rest to satisfy BSP Circular 1048. | P1 — Required before production |

---

## 9. Recommended Next Steps

### Immediate (Sprint 1 — before any code is merged to main)

1. **Convene compliance review.** Engage the Trust Banking compliance officer to validate: (a) retention periods per document class against BSP MORB, (b) whether placeholder PDFs in any form are permissible in the client portal's Statements section, (c) required disclosures for document delivery. This review should produce written sign-off that becomes a BRD appendix.

2. **Specify path traversal mitigation.** Add to the DOCS implementation spec: "filename must be sanitized using `path.basename()` before constructing `storage_reference`. The sanitized base name must additionally be stripped of null bytes and must not be empty after sanitization. If the sanitized name is empty or exceeds 255 characters, return HTTP 400."

3. **Add SCAN_PROVIDER feature flag.** Update the DOCS service spec to define: `SCAN_PROVIDER=none` (development, sets scan_status=SKIPPED), `SCAN_PROVIDER=clamav` (production), `SCAN_PROVIDER=opswat` (production enterprise). The application startup sequence must check `if (NODE_ENV === 'production' && SCAN_PROVIDER === 'none') throw new Error('SCAN_PROVIDER must not be none in production')`.

4. **Replace placeholder PDF with delivery status dialog.** Update the STMT spec to use Alternative STMT-A. Remove placeholder PDF generation. Update the client portal UI to show: delivery status badge (PENDING/GENERATING/AVAILABLE/FAILED), estimated availability for non-AVAILABLE states, and the actual download button only when status = AVAILABLE.

### Short-Term (Sprint 2-3)

5. **Implement DOCS phases 1-2 only.** Deploy the `service_request_documents` table, upload endpoint with multer size enforcement, immediate quarantine of executable extensions, and `scan_status = PENDING` for all uploads. Do not deploy the auto-CLEAN simulation to any environment above development.

6. **Define StorageProvider interface.** Create `server/services/storage-provider.ts` with `interface StorageProvider { stream(ref: string): Readable; put(ref: string, buffer: Buffer): Promise<void>; exists(ref: string): Promise<boolean>; }`. Implement `LocalStorageProvider` and stub `ObjectStorageProvider`. Mount `LocalStorageProvider` by default; document the production switch.

7. **IDOR fix for STMT.** Implement server-side session token validation in the download endpoint. The endpoint should call `authMiddleware.getClientIdFromSession(req)` and compare to the path parameter. Return HTTP 403 if they do not match.

8. **Add encryption at rest.** For STMT: encrypt PDFs using AES-256 before writing to disk; decrypt on stream. For DOCS: apply the same encryption to uploaded documents. Store the encryption key in an HSM or key management service (not in the `.env` file).

### Medium-Term (Sprint 4-6)

9. **ClamAV integration.** Install `clamscan` npm package. Implement `ClamAvScanProvider` that submits files to the clamd socket and returns CLEAN/QUARANTINED. Wire to the `SCAN_PROVIDER=clamav` branch. Test with EICAR test file. Update all documents with `scan_status = PENDING` to be re-scanned on integration activation.

10. **Per-document-class retention configuration.** Implement the `document_class_retention_config` reference table. Seed with BSP-validated values. Add a `document_class` column to `service_request_documents`. Update the service to derive `expires_at` from the reference table at insert time.

11. **Object storage migration.** Implement `ObjectStorageProvider` (MinIO or S3). Add `STORAGE_PROVIDER` environment variable. Update the production Helm chart / docker-compose to mount MinIO credentials. Migrate existing files from local `uploads/` to object storage. Update `file_reference` / `storage_reference` values to object keys.

12. **Retention expiry job.** Implement a cron job (daily at off-peak hours) that: (a) queries `service_request_documents` where `expires_at < NOW()` and `is_deleted = FALSE`, (b) deletes the physical file from storage, (c) sets `is_deleted = TRUE` and records a `deletion_reason = 'RETENTION_EXPIRY'` audit entry. The job must log every deletion for regulator review.

---

*Report prepared by adversarial evaluation framework — Trust OMS Philippines | 2026-04-25*
