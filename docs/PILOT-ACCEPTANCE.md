# Pilot acceptance — NOT a completed test report

## Implemented controls

- Admin overview: persistent pause/resume with reason/audit. Checked at new checkout entry; in-flight requests/payment windows may complete. Existing tracking, webhook confirmation and kitchen orders are not disabled. One app instance remains the supported pilot topology.
- Admin overview: list latest 100 pending payments and reconcile an exact order using authenticated Razorpay reads and the existing amount/currency/receipt/capture verification path. Older database IDs can be entered manually. No periodic worker is installed; assign an operator cadence and investigate multiple captures/refunded payments manually. Reconciliation can release a paid order to kitchen: confirm the customer can still be served before running it for an old show.
- Refund queue: fetch an existing Razorpay refund by reference, verify its payment and exact amount, store provider-reported PROCESSING/SUCCEEDED/FAILED with an audit event. Does not initiate refunds; gross-revenue stats are not net-refund accounting.
- Admin privacy register: order-linked request, verification attestation, action note, status and legal hold. Holds/open requests block retention cleanup. It is a tracking register, not automatic identity checking, data correction/disclosure or legal advice. Restrict notes to what is needed; no identity-document storage.

No additional schema migration is required by these controls; existing store_entities/audit/refund tables are used. Previously pending migrations still need testing.

## External setup blockers

No separate staging DB/host has been confirmed. Docker, mysql and mysqldump were not found on this workstation. The real .env is not modified or used to run migrations. Do not infer a production database is disposable. Create an isolated staging MySQL-compatible database with TLS and a separate least-privileged application user; point only staging at it. Use Razorpay TEST keys, a TEST webhook and a separate Google callback for the HTTPS staging origin. No paid infrastructure purchase or account provisioning has been performed.

## Acceptance scenarios (all live execution pending)

Record date, tester, build version, test order reference and PASS/FAIL evidence for each. Never put secrets/customer data into shared screenshots.

1. Migrate a fresh staging DB; verify the journal, menu, screen, 540 seat labels and staff roles. Restart the app and verify persistent state. Repeat against a copy of legacy schema only after reviewed backfill.
2. Phone QR → valid show/session → correct seat → menu → four unchecked consent boxes → Razorpay TEST success → one kitchen order → preparation → ready → delivery → tracking. Verify backend total, fee and consent evidence.
3. Pause new ordering; direct API creation must fail as well as UI checkout. Existing tracking and payment completion work. Restart while paused; pause survives. Resume with reason. Verify non-admins cannot toggle.
4. Exercise TEST payment failure, authorized-only payment, user closes popup/browser, webhook delay/loss, duplicate callback/retry, wrong amount/receipt, signed replay and DB outage. Reconcile pending order once; repeating must not duplicate capture/order or reset kitchen status. The API lookups must never charge a customer.
5. Create a TEST refund in Razorpay dashboard; record its reference via the refund control. Wrong payment/reference/amount must fail. Verify pending→processed, repeat idempotently, and ensure completed status cannot regress. Test partial-refund amount matching. Provider processing—not staff optimism—determines success.
6. Register a privacy request; unverified resolution must fail. Place a legal hold and verify cleanup preview/apply refuses it, even for an old eligible order. Close/release only with documented authority. Test wrong-order request updates and non-admin access.
7. Check QR invalid/expired, wrong seat/screen, stale showtime, +15min opening and end−30min cutoff; verify mobile layout, reload/offline recovery, kitchen audio and policy links. BookMyShow standalone 403 remains a manual-import limitation.
8. Export records as admin; verify no auth/session secrets. Verify non-admin rejection, all export batches, and secure file handling. Cleanup tests must use synthetic data only.

## Backup, restore and alert setup — requires chosen hosting

Enable encrypted managed DB backups/PITR with a documented retention window and restricted access. Restore to a *different isolated database*, never over production; migrate/check row counts, sample test orders, pause state, privacy holds and payment associations. Ensure restored apps cannot send real payment requests or accept traffic until deletion records/holds are reapplied. Delete drill copies through the provider's reviewed procedure.

Configure external HTTPS /health checks, failed-check alerts, application 5xx alerts, Razorpay webhook failure alerts and pending-payment ageing review. Set an actual owner and delivery channel and trigger one controlled failure to prove notifications arrive. No monitoring service or notification destination has been configured here. A health endpoint alone is not monitoring.

## Cinema sign-off

Confirm exact screen name, seat transcription, menu prices/stock/allergens, showtime refresh responsibility, order pause owner, refund procedure, registered business name/address, real customer-support phone/email, privacy contact and approved legal/tax retention. Show-specific QRs are not permanent armrest stickers. These facts cannot be confirmed by code.

Only after recorded staging passes should a small supervised paid pilot be considered. Unit tests and build success do not mark any live row above PASS.

Provider references: https://razorpay.com/docs/api/payments/fetch-payments-orders/ and https://razorpay.com/docs/api/refunds/fetch-with-id/
