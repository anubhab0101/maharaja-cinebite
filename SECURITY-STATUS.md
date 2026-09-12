# Security hardening status — 2026-09-12

> Historical first-batch report below. The subsequent pilot implementation and current release gates are documented in `PILOT-RUNBOOK.md`; several blockers below now have code changes, but live database/gateway acceptance is still pending.

This is a completed initial hardening batch, not a production-readiness certification.
No production database migration, live payment, website penetration test, or Strix scan was performed.

## Implemented

- Payment confirmation verifies HMAC plus authenticated Razorpay payment/order data: receipt, amount, currency and captured/paid status. A payment for another internal order is rejected.
- Concurrent duplicate confirmations are serialized. Database payment writes use the actual stored order ID inside a transaction; kitchen confirmation events occur only after commit. This does not make the entire order store durable.
- Synthetic payment confirmation is restricted to automated tests. Local checkout requires actual Razorpay test credentials.
- Unpaid orders cannot progress into preparation; customer lookup requires both order number and phone. New order references use 96 random bits.
- Google login requires verified email, rejects unsafe return URLs and derives its callback origin from PUBLIC_APP_URL.
- Staff Google sessions re-check current directory permissions. Sessions expire after eight hours, validate application identity and issued-at time. Existing legacy sessions must sign in again.
- Dev login requires explicit ENABLE_DEV_LOGIN=true, NODE_ENV=development, a direct loopback connection and no forwarded headers. Hardcoded owner email defaults were removed.
- Rate limit keys no longer directly trust caller-provided forwarding headers. The authentication limiter covers the actual /api/auth routes.
- Production order creation requires an open known showtime with a matching screen. This is not yet full seat/session authorization.
- Browser mock-payment fallback and preselected consent were removed. The environment example now documents Google configuration and safe development defaults without changing real secrets.
- Dependencies and lockfile updated; pnpm overrides/patches moved to pnpm-workspace.yaml and package manager pinned to 10.34.5.

## Verification

- 39 automated tests passed, including payment ownership, duplicate confirmation, database-transaction failure, permission revocation, redirect and request-header regressions.
- TypeScript check and production build passed.
- Final dependency audit: 0 critical, 0 high, 1 moderate, 0 low. Remaining issue is esbuild 0.18.20 through the migration tooling; no forced cross-major override was applied to that toolchain.
- Build warns about a large client JavaScript chunk (~943 kB before gzip). JSX locator plugin still reports an outdated Vite peer range.
- Provider API tests use mocked responses. Real gateway capture/retry, MySQL transaction integration, browser checkout and restart recovery have not been tested.

## Deployment blockers still open

1. Replace the in-memory order/menu/staff/audit store with durable database reads and writes. Order creation still has placeholder screen/seat database IDs, missing item persistence and no restart restoration. Do not rely on it for real paid orders yet.
2. Repair and validate the missing baseline migration on a disposable database, then plan any existing-data migration and backup. No schema changes have been applied to the configured database.
3. Implement signed, idempotent Razorpay webhooks and reconciliation, persisted provider-order associations, checkout idempotency and recovery when a browser closes or provider capture is delayed. Refund execution and recording need completion.
4. Bind checkout to valid seat/show sessions, implement durable consent records and verify authorization across each staff mutation. Staff changes currently remain process-local.
5. Configure trusted reverse-proxy hops explicitly for the actual host. With the safe default, requests through one proxy share its IP/rate-limit bucket. Do not enable blanket trust of forwarding headers.
6. Complete real reports/menu management, backup restore tests, durable audit logging, monitoring and staging end-to-end tests before accepting live payments.

## Local configuration

Use .env.example as a checklist, not as an overwrite for an existing .env. This Express application loads .env with dotenv; Next.js .env.local precedence does not apply here.

Set a strong JWT_SECRET, DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, explicit OWNER_EMAIL and PUBLIC_APP_URL. Register PUBLIC_APP_URL + /api/auth/google/callback in Google OAuth settings. ADMIN_EMAILS grants owner-level access; ordinary staff belong in the staff directory. Never put secrets in VITE_ variables or commit .env.

Use Razorpay test keys in development. Production needs NODE_ENV=production, the exact HTTPS PUBLIC_APP_URL, production credentials and ENABLE_DEV_LOGIN=false—but only after the blockers above are resolved. Merely setting a webhook secret does not implement payment recovery.
