# Staff PWA, item discounts and optional customer offers

Implementation review: 21 September 2026. Not deployed by this change. Existing legal-policy drafts remain unapproved and unchanged.

## Staff-only installation

- Removed the static manifest and global install metadata/automatic worker registration from customer HTML.
- Approved staff dashboards add a manifest link while mounted. `/api/staff-manifest` authenticates the staff session, checks allowed roles and uses `private, no-store`.
- All actual staff API access still needs server authorization. A manifest or saved shortcut is not an access credential.
- Websites cannot prevent a browser/OS from saving a bookmark or manual Home Screen shortcut. Existing installations cannot be remotely uninstalled. Customers are not offered the CineBite staff installation workflow.
- Customers opting into supported push use the service worker without an installation manifest. That is notification infrastructure, not permission to enter staff pages.

## Item discounts

- Menu → Edit item → Discount (%), integer 0–90; 0 removes discount.
- Applied per unit in integer paise, before multiplication by quantity. Platform fee is not discounted. No stacking, coupon, schedule or automatic expiry is introduced.
- Server calculates from saved catalog, not client-supplied prices. Order snapshots preserve original price, discount percent and charged price. Changing a discount does not change existing orders.
- New customer client sends its expected total. A mismatch is rejected before persistence/payment intent so the customer can reload and review changed prices. Existing clients without that field still use authoritative server pricing.
- Removed hardcoded promotional badges. Rupee display preserves fractional amounts instead of rounding discounted paise away.

## Offer push setup — deliberately disabled by default

Server-only configuration in `.env`/hosting secret settings:

```
OFFERS_PUSH_ENABLED=false
OFFERS_NOTICE_APPROVED=false
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=
```

Generate one Web Push VAPID key pair privately using the installed `web-push` package; store the private key in hosting secrets, not Git or VITE_* settings. Use the cinema/operator's confirmed mailto contact or HTTPS contact URL as the subject. `PUBLIC_APP_URL` must match the actual HTTPS origin, including staging's separate origin.

Before enabling both switches:

1. Approve/publish the optional marketing notice, operator identity/contact, push-service processors, retention/withdrawal process and consent version. Existing policy text must be updated to reflect actual marketing only after approval. Verify applicable age/consent requirements for the intended audience with the operator.
2. Use separate staging keys/database; test enrollment, unsubscribe, revoked permission, expiry, duplicate commands and actual device receipt.
3. Test Chrome/Firefox supported FCM/Mozilla endpoints. Other endpoints are rejected, not dynamically trusted, to prevent SSRF. iPhone/iPad customer web push is intentionally not offered because it requires Home Screen installation; customers can see discounts on the menu instead. Staff installation remains separate.
4. Set a campaign owner, frequency policy and procedure for false/expired discounts.

No credentials were generated, production environment edited or promotional message sent during implementation.

## Customer flow and storage

- Menu footer → optional unchecked offer checkbox → Allow offer notifications → native browser permission. Rejecting it does not block checkout or imply marketing consent through order consent.
- Backend requires explicit consent + current notice version, exact-origin requests, valid bounded keys and an allowlisted HTTPS push endpoint. Subscription management uses a random browser-specific capability; only its hash is stored server-side. It is not a login token.
- Backend records consent time/version and a 90-day offer-delivery expiry. Customer can withdraw via Stop offer notifications; this deletes the subscription from the main database. Browser unsubscribe is also attempted. Revoked/expired provider endpoints are removed after 404/410.
- Expired subscriptions are excluded from sending immediately; physical cleanup happens on enrollment/admin-summary operations. Consent audit events are separate and do not contain raw push endpoints/keys. Their final retention/backups policy needs approval; this feature does not promise erasure of every copy.
- Local preference stores the management token, endpoint and expiry to permit opt-out after a reload. Clear-site-data can remove that capability; browser notification settings can still block messages. Protect it like other browser-readable site data.

## Sending

Admin → More → Offer notifications. Only OWNER_ADMIN/ADMIN may create or send campaigns; managers/kitchen cannot broadcast. Set the real discount first, preview accurate title/body, confirm, create campaign, then explicitly send batches of up to 10.

Campaign state is stored before sending. Rows are locked for claims; completed/in-flight batches are not replayed. Provider acceptance does not prove a device displayed/read the notification. Failed or interrupted/unknown attempts need investigation, not blind retries. Processing records after interruption remain blocked intentionally. No automatic campaigns, scheduling, personalized targeting, delivery guarantee or background staff-order push is added.

Limitations: application-level rate limits remain process-local, there is a 5,000-subscription safety cap, campaigns are manually batched and this is not a high-volume campaign worker. The latest summary reads up to 100 campaigns; add proper indexed pagination/history retention before that limit matters. A database staging restart/concurrency drill and real VAPID/device delivery remain release gates.

## Image hosting recommendation

Use Cloudinary for a simple managed image library/CDN with resize/format/quality transformations, or Cloudflare R2 + a public image domain for object storage. Keep only the image URL/key in the menu database. Use small responsive WebP/AVIF variants, lazy loading and fixed image dimensions. Public food photos can be public; customer data, credentials and backups must not be in that public bucket. Admin-only signed uploads, size/type restrictions and source-domain policy are needed for a future integrated uploader. Do not put image-service secrets in browser code. This change does not upload photos or replace the existing menu illustrations.

References: https://cloudinary.com/documentation/image_transformations ; https://developers.cloudflare.com/r2/ ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## Database security finding

A private read-only check of the database configured in this checkout succeeded with certificate-verifying TLS and a negotiated cipher. It also found DDL privileges and GRANT OPTION. No credentials/hostnames/grant text were printed and no permissions/data were changed.

Before full production, provision a separate runtime DB account with only the required table-level DML access and no GRANT OPTION, CREATE, ALTER or DROP. Use a separate migration identity, verify migrations/startup with that split in staging, then rotate/switch the runtime credential. Do not revoke privileges blindly on the existing account while it may still run migrations. Provider network ACLs, at-rest encryption, backup access/restore, secret rotation and authenticated application security were not certified by the TLS/grants check.
