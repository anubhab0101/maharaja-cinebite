# Retention and deletion: pilot procedure

This supersedes the one-/three-month proposal in earlier documents. The public /retention page and privacy notice explain the implementation. This is a reviewed, offline deletion tool, **not an active recurring purge or full legal-compliance certification**.

## Legal basis and limits

[DPDP Rules 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf): rules 1 (phased commencement) and 8(3) (one-year retention and further legal retention). We apply a conservative one-calendar-year safeguard prospectively, measured from the latest recorded order processing event, with Feb 29 rolling to March 1 next year. This does not settle all questions about what counts as processing.

[CGST section 36](https://cbic-gst.gov.in/hindi/CGST-bill-e.html): covered accounting records have a 72-month period from the relevant annual-return due date, with additional proceedings-related provisions. The cinema's GST status, actual due date and other obligations are not known. **An order merely reaching its first anniversary is not a legal release.** The responsible cinema owner/adviser must document whether every record in the proposed deletion is free of retention obligations. Do not sign a release simply to pass a software guard.

## Scope

Exact order-number input; no bulk delete or arbitrary table input. The tool checks under a row lock, previews or deletes in one transaction. Only delivered/confirmed orders with snapshots and no refund records are eligible for review. The newest order, payment, consent and order-audit timestamps control the one-year minimum. Active, failed/pending, legacy and refund-bearing records need a separate documented review workflow; they are not automatically forgotten forever.

On approved apply, deletes order, order_items, consent_records, payments and matching order audit events. Keeps a cleanup receipt with counts, completion time and an opaque review reference, without copying customer identifiers. No schema changes are required. Staff/configuration, unrelated security logs, payment-provider data, backups, exports and browser storage are not deleted by this command. A whole-system deletion claim would be inaccurate.

## Operator workflow

1. Verify the target database without exposing credentials. First test preview/apply and rollback/recovery against a disposable staging database, including associated row counts and absence from tracking/export. No live integration test has been performed by Codex.
2. Run `pnpm retention:review --order CB-<exact-24-hex-id>` for a read-only preview (database row locking, but no data changes). It reports minimum expiry and blockers; it does not approve the deletion.
3. Obtain a documented release from the cinema's authorised legal/accounting reviewer. Record reasons, applicable deadlines, absence of disputes/holds and external-copy handling in the cinema's restricted review register. Use only an opaque, non-personal reference in the tool. Keep that register on its separately approved schedule; it must not become an indefinite copy of deleted customer data.
4. Stop **all** web-server instances and workers during maintenance. This prevents live processing races and clears process-memory order/audit copies on restart. The release file's `webServerStopped` flag is an operator attestation, not automatic infrastructure verification. Do not run against a live multi-instance service.
5. Prepare a small release JSON containing the exact `orderNumber`, opaque `reference` (8–80 letters/digits/underscore/hyphen), and `allRetentionExpired`, `noDisputeOrLegalHold`, `externalCopiesReviewed`, `webServerStopped` all true **only when actually verified**.
6. Run `pnpm retention:review --order CB-<exact-24-hex-id> --approval path/to/release.json --apply`. Eligibility is checked again; blocked operations must not be described as successful. Deletion is permanent in the primary database. Backups, if any, follow the reviewed expiry/restore process—not indefinite recovery promises.
7. Restart servers, verify the records are absent from customer tracking/admin export, record completion, and complete the documented provider/export/backup actions. Re-apply deletions before restored backups can serve traffic. Device storage is not remotely controlled.

## Still needed before claiming an operational programme

- Confirm cinema identity/privacy contact, tax obligations and record-category deadlines.
- Assign responsibility and review cadence; no app scheduler/cron is installed or activated.
- An admin privacy-request/legal-hold register is now implemented. Open requests and holds block cleanup; updates require the last-seen version. Operators must still perform identity verification, actual correction/disclosure and documented hold release. Monitor failed/overdue cleanup and determine separate deadlines for currently blocked categories/security logs/staff data.
- Verify deployed DB/backups/replicas, retention of audit receipts, exported files and processor contracts. No automatic expiry for those is claimed.
- Archive each approved notice version and release artifact; deploy v4 frontend/backend together. No real customer records were deleted during implementation.
