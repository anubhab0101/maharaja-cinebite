# CineBites pilot handoff — 2026-09-12

## Current release status

Implementation is ready for staging verification, NOT approved for real paid customer traffic yet. No database migration or real Razorpay payment has been performed in this task. The configured real .env has not been changed.

## Implemented in this batch

- MySQL-backed order reads after restart, with authoritative item/price/customer/section-seat snapshots stored in `orders.snapshot`. Legacy `order_items` is not the authoritative item source for new orders. Actual configured screen and seat IDs replace placeholder IDs.
- Durable menu and staff records in `store_entities`, transactional audit records, and consent records tied to orders.
- Unique checkout keys and request hashes, stored provider-order associations, per-order payment confirmation serialization, database row locking and duplicate payment handling.
- Raw-body signed `/api/webhooks/razorpay` endpoint, processing `payment.captured` and `order.paid` with authenticated gateway re-verification. Processing failures return 503 for provider retry. This is webhook recovery, not an independent scheduled reconciliation worker.
- Persisted kitchen status updates before notification; stale status updates are rejected. SSE permissions are rechecked periodically. Multiple app instances still require a shared event bus/rate limiter; use ONE app instance for the pilot.
- Pending-payment customer tracking no longer claims food is being prepared; tracking details are saved before gateway checkout. Support telephone is +91 9776600696; support email is not invented.
- Real today-only revenue from confirmed payments, no visible fabricated overview charts/growth. Menu add/replace controls and durable refund review requests are available.
- Refunds are MANUAL via Razorpay dashboard during the pilot. The app records review requests; it does not execute or automatically reconcile dashboard refunds. Staff must record completion/reference in the pilot operations log. Revenue is gross captured revenue, not net of refunds.
- Explicit showtime/session/screen checks and database-validated seats. Show-specific seat QRs include the session token. This does not verify possession of a cinema ticket or seat occupancy.
- Required production configuration, database/schema/legacy-data startup checks, database-aware health endpoint, explicit trusted-proxy configuration, protected migration command and client route code splitting.

## Supplied seat layout

The user supplied a booking-layout screenshot. Ticket prices and grey/green availability are not food-menu prices or physical-seat deletion flags.

| Section | Prefix | Row counts | Seats |
| --- | --- | --- | ---: |
| Motorized Slider | MS | A27, B22, C16, D16, E16 | 97 |
| Super Deluxe | SD | A–G, 29 each | 203 |
| Recliner | RC | A–C, 20 each | 60 |
| Slider | SL | A28, B–F26, G22 | 180 |
| Total | | | 540 |

Examples: `MS-A01` and `RC-A01` are different seats. Confirm transcription and delivery-team use of the prefixes before printing. In Admin → Seat QR stickers, enter the exact screen name matching the configured showtime, load the 540-seat preset and save. Generate session links for the actual show, select that session in the QR generator, and generate/print. These QRs are show-specific, not permanent reusable armrest stickers.

Public venue address verified from https://www.maharajahall.in/contact.html: Bhoi Nagar, Bhubaneswar, Odisha 751022. The actual internal screen name must come from the theatre/configured showtime; do not create multiple auditoriums from the four seating categories.

## Database and configuration checklist

1. Provide a separate staging MySQL/TiDB database and hosting target. This workstation did not have Docker/MySQL executables available; database integration has not been exercised here.
2. Back up any existing database and verify its migration journal. `0000_perpetual_eternals.sql` was reconstructed to enable fresh-database migration; it is not a verified copy of the lost original. Never blindly replay it against existing tables.
3. `0005_even_pride.sql` adds order snapshot/identity/checkout/provider fields and the durable configuration table. Existing orders without snapshots require a reviewed backfill; they are not silently dropped and production startup refuses them. Their missing historical item/seat/phone details cannot be safely invented.
4. Use `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`. For the reviewed staging database only, set `ALLOW_DATABASE_MIGRATION=yes` for `pnpm db:migrate`, then unset it. Do not auto-generate migrations during deployment.
5. Configure actual Google credentials, OWNER_EMAIL, PUBLIC_APP_URL, strong JWT_SECRET, DATABASE_URL, Razorpay TEST credentials and webhook secret. Register the exact Google callback `/api/auth/google/callback` and Razorpay webhook endpoint. Configure the gateway to capture payments; authorized-only payments are intentionally not queued.
6. Production-like staging uses NODE_ENV=production with an HTTPS URL and test Razorpay keys. ENABLE_DEV_LOGIN remains false. Set TRUSTED_PROXY_CIDRS only after confirming the hosting proxy topology; never trust arbitrary forwarded headers.
7. Configure/import actual showtimes and durations. Expired or missing sessions must not accept orders. Seed/review the food menu, save verified seats, invite individual staff, verify role restrictions.

## Required staging acceptance before launch

- Fresh schema migration; process restart; menu/staff/order data survive; no old-order omissions.
- Real Razorpay TEST checkout and confirmed food order, with exact amount/seat/items in the kitchen.
- Browser closes after payment; signed webhook recovers the order; webhook redelivery and browser retry do not duplicate payment or reset a preparing order.
- Database failure during payment processing returns an error; restore DB and replay the webhook successfully. Verify provider retry delivery in its dashboard.
- Duplicate create requests, different request with reused checkout key, stale kitchen transitions, forged webhook, wrong payment amount/order and invalid seat/session all fail safely.
- Pending payment is not displayed as confirmed. Check mobile checkout, QR scan, Google login, kitchen audio/queue, tracking, and every policy link in a real browser.
- Refund operator can find payment IDs in Razorpay, execute a TEST refund and keep an auditable completion log. Do not claim automated refund completion in this UI.
- Confirm support phone ownership, approved policy text/business identity and the pending support email before public release.
- Set up external `/health` monitoring, error alerts, encrypted database backups and perform a restore drill. Restrict DB network access, rotate any previously shared secrets and define retention for customer phone/order data.

## Remaining limitations

No live penetration test/Strix scan, browser E2E, database migration/restart integration or real gateway test has passed yet. The database adapter tests use test doubles and do not prove MySQL behavior. Undo history is process-local (forward status itself is durable), SSE/rate limiting are single-instance, checkout-key persistence across a full browser reload is limited, gateway missed-event reconciliation is manual, and large-history pagination/retention still needs work beyond a small pilot. One moderate esbuild advisory remains in migration tooling. Do not expose migration/dev servers publicly.

Do not turn a deadline into a live-payments go-live decision without the acceptance checks above.
