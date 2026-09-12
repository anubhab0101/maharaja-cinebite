# Correct workspace handoff

All further work belongs in `C:/Users/wwwan/Documents/GitHub/maharaja-cinebite` (origin: anubhab0101/maharaja-cinebite). The earlier Downloads/cinebites copy was mistakenly used by this task. It has not been deleted; no .env, credentials, Git history or public assets were copied over from it. No commit, push or deployment is included in this transfer.

The target initially had a clean working tree at 7aae8d3 and newer independent changes. Integration keeps its Admin/Kitchen/StaffManagement screens, kitchen availability controls, public robots/sitemap/security assets, sensitive-path protection and stricter production CSP/Permissions-Policy. The overview/refund panels now use real pilot data/controls rather than the former illustrative panels. The existing /api/payment/webhook URL remains an alias to the verified raw-body webhook handler.

Security fixes, durable transactional storage, consent/policy pages, showtime importer, retention tool, exports and pilot operations were ported from the earlier work. Existing staff records in users remain readable; durable staff overrides take precedence. Staff removal revokes both directory representations. The unsafe developer-code direct-delete endpoint is retained only as a blocked compatibility response; use the reviewed retention process instead. This intentional change protects paid records and legal holds.

## Deployment blockers still apply

The real repository's older orders do not necessarily have the new snapshot fields. Review schema migrations and backfill before deploying: startup refuses incomplete legacy orders rather than discarding history. No database migration/backfill has been run. This transfer is not approval to deploy directly to the existing live service. Preserve the current deployment until staging migration and gateway/browser acceptance tests pass.

The example configuration has been updated; real .env is unchanged. The existing node_modules was rebuilt from the transferred lockfile; it is reproducible dependency output, not user source data. The old Downloads copy remains intact as a reference, but must not be used for subsequent edits.
