# Local Deployment Verification - Full Stack

Date: 2026-05-05
Scope: API, back-office, client portal, Cloud SQL-backed runtime.

## Verdict

PASS.

## Local Stack

- API container: `http://127.0.0.1:5600`
- Back-office container: `http://127.0.0.1:5601`
- Client portal container: `http://127.0.0.1:5602`
- Database path: Cloud SQL proxy to `wealthmanagement-491511:asia-southeast1:wealth-management`

## Checks Passed

- API `/health` and `/readiness` returned OK.
- Docker health check for API returned `healthy`.
- Back-office and client portal root pages returned `200 text/html`.
- Back-office and client portal nginx `/api/v1/health` proxy checks returned `200`.
- Admin login succeeded through the API and back-office proxy.
- Client portal login succeeded for `client_reyes`.
- Login responses did not expose `accessToken` or `refreshToken` in JSON.

## Notes

- For Docker Desktop, the API container uses `host.docker.internal` plus `sslmode=disable` to reach the local Cloud SQL proxy.
- The local Docker stack was refreshed after the final schema fix.

