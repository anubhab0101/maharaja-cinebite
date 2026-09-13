# Legacy empty pilot database repair

Render's reported startup failure was missing `orders.publicId`. The database configured locally had the legacy schema, zero orders and no Drizzle migration ledger. Running the full historical migrations would collide with existing tables.

On 2026-09-13, the additive repair was applied to database target fingerprint `da4ebe979873e947`. It added the five columns and two indexes from migration 0005, plus `store_entities`. No rows/tables were deleted. Post-repair schema queries passed; repeating preview returned no pending statements. Render's DATABASE_URL has not independently been compared with the local target, nor has a Render restart been performed.

For another empty legacy database:

1. Confirm the intended database, retain a backup and stop application writers.
2. Run `pnpm exec tsx server/repair-empty-schema.ts` for a read-only preview.
3. Review the target fingerprint and SQL, then run `pnpm exec tsx server/repair-empty-schema.ts --apply --target=FINGERPRINT`.
4. Run preview again; expect an empty statements list. Restart the service and check its health and login.

The command refuses any existing orders or an unsupported basic orders schema. It does not replace a full schema comparison or backfill populated databases. MySQL DDL auto-commits: a failed run can partially apply; preview identifies remaining work before retry. No historical migration ledger is forged. Before using the normal migration runner on this legacy database, review and baseline the full schema/history; do not blindly replay migrations 0000–0005.

Render build command: `pnpm install --frozen-lockfile && pnpm run build`. Start command remains `pnpm run start`. No automatic schema repair at every startup is introduced.
