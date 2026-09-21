# Policy approval and remaining decisions — 21 September 2026

The user approved the software attribution “CineBite — A software product by ASAYLES Tech.” and food operator attribution to Maharaja's in-house F&B counter, plus the privacy, terms, refund, delivery and storage notice categories. These are implemented locally, not a declaration of legal compliance or deployment.

Published cinema helpdesk details were read from https://www.maharajahall.in/contact.html on 2026-09-21: Maharaja Picture Palace, Bhoi Nagar, Bhubaneswar, Odisha 751022; +91 9776942999 / +91 7873042999; customercare@maharajapicturepalace.com. This verifies publication, not reachability or assignment to F&B/privacy support. The cinema must designate a privacy/grievance owner, confirm F&B coverage and its registered contracting details. No developer number is used.

## Retention link and one-year request

The footer and privacy notice link to `/retention`, a plain-language description of what is retained, timing, exceptions, deletion procedure and limitations. The existing one-calendar-year minimum for ordinary completed orders is retained. No production data is deleted and no automatic purge is enabled. Tax/accounting duties, pending disputes, holds, backups and exports cannot be silently covered by a blanket one-year promise. See RETENTION-RUNBOOK.md.

The request to record policy acceptance only once per customer per year is **not implemented**. Guest checkout does not verify customer identity: matching an entered phone number cannot prove ownership. Existing order-specific privacy wording also covers “this order”, not future orders. A reusable consent design requires a separate verified identity or explicit device-bound receipt, scoped/versioned acceptance, withdrawal, and per-order references to the original acceptance time. New orders still need their own transaction records and order-specific acknowledgements. Do not backdate, auto-renew, or overwrite historical acceptance. New purposes, policy changes or withdrawal can require consent before a year elapses.

Checkout notice version is now `2026-09-21-v5`; deploy frontend and backend together. Existing historical records remain untouched; stale clients must reload and explicitly accept the current version. Previous v4 wording remains recoverable in Git history.

Optional offers remain disabled by default. Their current 90-day subscription expiry is distinct from ordinary order retention. Final audit/backup retention, child/age requirements, processors and real-device push tests remain launch gates; no VAPID keys or approval flags were enabled merely because these pages were edited.

Final refund resolution time, support responsibilities and a tested operational deletion programme still need approval/setup. Do not describe these pages alone as production compliance.
