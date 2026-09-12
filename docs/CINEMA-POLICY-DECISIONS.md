# Cinema policy update

The user confirmed the cinema is the business operator. Exact registered name/address remain unconfirmed. 9776600696 is the developer's number and has been removed from customer-facing pages; real support phone/email remain a paid-launch blocker.

Policy v3: no change-of-mind cancellations/refunds once ordered, without removing applicable consumer remedies (non-delivery, faulty/incorrect food, duplicate charges, etc.). The existing exceptional refund review remains available. Final exception handling and refund timing need cinema approval.

The checkout prominently warns against ordering in the final 30 minutes. An independent, initially unchecked cutoff acknowledgement is required by the API. Evidence is recorded in CHECKOUT_CONSENT audit rows with order identity, all submitted choices, notice version and server timestamp, in the same transaction as the order and existing consent record. Old clients must reload. The existing backend timing gate is unchanged.

Admins/owner admins can export customer business records from the overview in batches of up to 200 orders per JSON file, including item, consent/audit evidence, payment and refund records. This is not a full database dump: users, configuration secrets and QR/session tokens are excluded. Each batch is audited, rate limited and marked no-store. Files contain personal information; secure them and control access. Each batch is consistent within its transaction; multiple batches are not a point-in-time backup. Downloaded copies are outside database deletion control.

## One-month deletion — NOT enabled

The request "delete all after one month" needs a precise scope before destructive implementation. It could mean cutoff evidence only, customer identifiers, or entire orders/payment records. Do not delete staff/configuration, active orders, unresolved refunds/disputes, financial records or consent evidence on an assumed interpretation. No database data was deleted or migration executed.

Confirm calendar month versus 30 days, exact record categories, legal/accounting/dispute holds, database replicas/backups and exported copies. The 2025 DPDP Rules include phased commencement and Rule 8(3) retention requirements; applicability/timing and other record-keeping obligations need review before promising blanket 30-day erasure. Retention must match the privacy notice. A scheduled purge, dry-run review, hold mechanism and staging recovery tests are still required after approval. No scheduler has been created for this request.

Sources: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf ; https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules_0.pdf
