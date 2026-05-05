# Deploy Readiness and Cloud Deployment - Full Stack

Date: 2026-05-05
Project: `wealthmanagement-491511`
Region: `asia-southeast1`

## Verdict

DEPLOYED and cloud sanity passed.

## Build and Migration

- Final Cloud Build: `804d668b-cfd1-44d3-ad9c-16f0979fe714`
- Final Cloud Build status: `SUCCESS`
- Cloud SQL migration applied: `drizzle/20260505_add_crm_notification_job_types.sql`

## Cloud Run Revisions

| Service | Revision | Status |
| --- | --- | --- |
| `trust-banking-api` | `trust-banking-api-00022-9tn` | 100% traffic |
| `trust-banking-bo` | `trust-banking-bo-00015-pr7` | 100% traffic |
| `trust-banking-portal` | `trust-banking-portal-00011-w9m` | 100% traffic |

## URLs

- API: `https://trust-banking-api-91358942094.asia-southeast1.run.app`
- Back office: `https://trust-banking-bo-91358942094.asia-southeast1.run.app`
- Client portal: `https://trust-banking-portal-91358942094.asia-southeast1.run.app`

The API CORS allowlist also includes the newer `*.a.run.app` service URLs reported by `gcloud run services list`.

## Cloud Sanity Passed

- API `/health`: OK.
- API `/readiness`: database OK.
- API `/api/v1/health`: OK.
- Back-office `/`: `200 text/html`.
- Client portal `/`: `200 text/html`.
- Back-office `/api/v1/health` proxy: `200`.
- Client portal `/api/v1/health` proxy: `200`.
- API CORS preflight for both Cloud Run URL formats: `204`, expected allow-origin, credentials allowed.
- Admin login succeeded and did not expose token JSON fields.

## Deployment Notes

- API uses Secret Manager references for `TRUST_BANKING_DATABASE_URL`, `TRUST_BANKING_JWT_SECRET`, and `TRUST_BANKING_SESSION_SECRET`.
- API remains bound to Cloud SQL instance `wealthmanagement-491511:asia-southeast1:wealth-management`.
- Frontend `API_BASE_URL` points to the deployed API URL.

