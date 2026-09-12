# Reel checklist review — 12 September 2026

Implemented: separate privacy, terms, refund/cancellation, cinema delivery, browser-storage, support and payment-help routes; global footer; policy links beside unchecked native checkboxes. Removed bulk acceptance. Backend rejects blanket booleans, missing choices and old notice versions. Consent rows keep order identity, current version, individual choices and server timestamp in the order transaction. Legacy retention/support fields are zero for new records, not manufactured acknowledgements. Marketing is not requested or enabled. No schema migration needed for these changes; existing records are not rewritten.

Existing: 404 UI, access-denied feedback on staff login, verified Google sign-in, pending-payment tracking and gateway failure handling. Password reset and separate email verification are not added: there are no app-managed customer passwords. A static maintenance page is not a maintenance control; infrastructure maintenance and order-disable procedures still need deployment testing. Payment-help page is informational and must not infer transaction state from a URL.

## Not a compliance certificate

The Act is DPDP Act **2023**, not a new "2026 DPP Act". See [India Code](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf), section 6. The [2025 Rules notification](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf) has phased commencement. Recheck amendments/effective provisions with counsel before launch. A western template is not inherently illegal; consent scope and actual processing matter. A timestamp alone does not prove informed valid consent. The reel's Meta fine claim was not independently verified.

## Owner decisions before paid launch

- Approve contracting legal name/address, customer-service email, formal privacy/grievance contact and real support hours. Supplied phone: 9776600696. Draft pages deliberately do not invent these.
- Approve refund eligibility, cancellation rules and realistic provider timelines; confirm food-business obligations and consumer disclosures with qualified advisers.
- Approve retention/deletion schedule across database snapshots, logs, backups and browser storage, accounting/dispute exceptions and processing providers. No automatic deletion exists yet.
- Implement and test verified privacy-request/withdrawal handling; the current phone route is not proof of equivalent-ease withdrawal. Do not claim full DPDP compliance. Decide children/parental-consent handling and language accessibility.
- Archive the exact approved notice and checkbox text with each released POLICY_VERSION. Bump the version on substantive changes; deploy frontend/backend together and retain old releases. Old clients must reload before ordering. Current content is a pilot draft, not approved final legal text.
- Verify consent persistence in staging MySQL and real payment failure/recovery flows. Unit tests use a mocked transaction, not a live database. Do not launch merely because pages exist.

No marketing/cookie banner was added: no optional first-party analytics/marketing integration was found in the inspected client. Re-audit all deployed scripts and payment/auth provider behaviour before launch. If optional tracking is added, consent must actually gate loading, not just store a UI preference.
