# CineBite: five-day launch plan

Status: local implementation, not a deployment or unconditional production approval. Preserve existing uncommitted changes. No live customer writes, schema migrations or infrastructure purchases were performed for this work.

## Implemented in the current checkout

- Mobile staff navigation, light/dark controls, staff install option, foreground new-order sound/voice and permission controls. Closed-app staff-order push is NOT implemented. Phone volume, permission and OS restrictions still apply.
- Customer QR/seat checkout, order tracking and dismissed tracking reminders; compact header/floating reminders now avoid displaying the full long order number.
- Item discounts with server-side pricing, price-change checks, catalogue editing and kitchen stock toggles.
- Public menu-change SSE contains invalidation only, no customer/staff data. Five-second polling/focus/reconnect refresh provides fallback. Cart reconciles removed, disabled and price-changed items. Checkout locks current catalogue rows before persistence to reject a disable/price edit that committed after the initial read. Orders already accepted before a disable remain valid commitments; no automatic cancellation or payment reversal occurs.
- Delayed-order chat: confirmed, undelivered orders only, 20 minutes after order placement. Customer supplies full order phone plus unguessable order number; server enforces eligibility and access. Phone travels in POST body, not query string. Staff inbox in admin/kitchen. Plain text, 500 characters, 100 messages/thread, throttling and UUID retry deduplication. Read/update polling every five seconds while open; customer timer reveals eligibility within roughly ten seconds on an active page. No reply-time or offline delivery guarantee.
- Delivery and chat-message deletion share the same order-lock transaction, so late writes cannot recreate a delivered thread. Undoing delivery does not restore deleted messages. Chat isn't written into audit text. Primary DB deletion cannot erase screenshots, exports or old backups. Undelivered unresolved conversations remain and need operational follow-up; this is not an unlimited-retention approval.
- Separate approved policy pages, one-year ordinary-order review baseline, ephemeral-chat notice, published cinema contact links and ASAYLES Tech attribution. Policies do not certify legal compliance.
- Existing admin pause orders, reconciliation, refund status, privacy/holds and reviewed retention tooling. These still need operational acceptance and external settings verified.
- Optional marketing push subscription/admin-batch implementation exists but remains disabled by default pending real VAPID configuration, device delivery tests and operator/legal review. Staff-only PWA excludes customer iPhone push; customers can still read menu offers.

## Must pass before a paid/public launch

1. **Hosting:** select and fund a non-sleeping production compute instance; verify restart/redeploy recovery and health/error alerts. Render explicitly advises against its free instances for production: https://render.com/docs/free. Keep-awake scripts are not availability guarantees.
2. **DB:** prior read-only inspection found verified TLS but excessive DDL and GRANT OPTION privileges in the configured account. Create a separate least-privileged runtime identity and migration identity, test in staging, then switch secrets safely. Verify firewall/IP restrictions, encryption/backups and restore to a separate DB. Never revoke privileges blindly on the live account.
3. **Staging:** separate database/secrets, deploy same release frontend/backend, test concurrent disable versus checkout, simultaneous chat send versus delivery, retry after lost response, restart during order lifecycle and retention restore hygiene against real MySQL. Current mocked transaction tests are not proof of production locking behaviour.
4. **Operations:** cinema signs off screen/seat/QR mapping, actual menu/prices/photos/allergens, showtime freshness responsibility and fallback, counter versus seat-delivery workflow, named shift owner and chat responder. Keep the kitchen app visible/awake for foreground order alerts; closed-phone order alerts need a separate implementation if mandatory.
5. **Customer/legal:** confirm published helpdesk actually covers F&B, designated grievance/privacy contact, registered operator details, refund-resolution timeline, age/parental-consent handling, processors, chat deletion legality/holds and backup expiry. Assign retention/rights-request owner and review cadence. Annual reusable acceptance is not implemented; no verified guest identity exists.
6. **Images:** choose Cloudinary or another image CDN, configure allowed URL origins/CSP, add validated per-item image URL/upload workflow, optimized size/format, fallback images and loading dimensions. Current food illustrations are not a configured external-image uploader.
7. **Payments:** although payment implementation is outside this checklist's feature work, real success/failure/retry/webhook/refund acceptance remains a release gate for paid orders; cannot waive this because other features pass.
8. **Load/network/device:** test on the cinema's actual Android/iPhone devices and weak connection. Test reconnect, multiple tabs, denied permissions, phone lock, delivery/chat deletion and no duplicate orders/messages. Agree expected concurrent customers and load-test that volume. Current rate limits/events are process-local; no multi-instance guarantee. Staff chat inbox is capped at the latest 50 and reads entity rows; this is a small-pilot implementation, not large-scale messaging infrastructure.

## Day-by-day execution

| Day | Work | Pass condition |
| --- | --- | --- |
| 1 | Freeze launch scope; client approves menu, screens, seats, operator contacts and workflows. Choose hosting/CDN. Assign staff chat responsibility. | Written checklist signed; no placeholder business data. |
| 2 | Create staging DB; split runtime/migration credentials; configure backups, alerts, non-sleeping hosting. Deploy candidate to staging. | Restore drill succeeds; no production credentials in client/build; restart survives. |
| 3 | Two-phone end-to-end test: QR → order → disable race → kitchen → chat at 20 minutes → delivery → chat absent. Run payment acceptance separately. | No unauthorized chat access, no stale sold-out checkout, no lost/duplicated order; actual DB verifies deletion. |
| 4 | Cinema-network rehearsal, concurrent users, staff training and signed legal/contact/retention review. Configure/test marketing push only if needed; otherwise keep disabled. | Staff can handle queue, support, pause and recovery without developer. |
| 5 | Backup, reviewed release commit/push and deploy, post-deploy smoke tests, supervised limited opening; monitor errors, latency, queue and stock. | Rollback/pause owner available; expand traffic only after a clean shift. |

Five days is feasible only if the external decisions and acceptance gates complete. If a gate fails, launch a restricted supervised pilot, not a claimed fully production-ready service. Do not enable untested optional marketing, annual-consent reuse or closed-app alerts merely to meet the date.
