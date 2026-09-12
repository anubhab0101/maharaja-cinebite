# Staff login security

Google handles passwords. CineBites stores no staff passwords; it still owns session and staff authorization checks.

Implemented: bounded callback/state validation, runtime validation of verified Google profiles and access tokens, 10-second timeout per Google request, generic failure redirects without email addresses, redacted application auth failure logs, no-store/no-referrer auth responses, and removal of development login/setup controls from the public login page. Local dev-login remains backend-gated to explicitly enabled development on loopback. Production rejects it.

## Operator actions before pilot

- Each owner/admin/staff member must enable Google 2-Step Verification, preferably a passkey or security key, and store recovery codes safely. Configure this in Google Account > Security. Workspace administrators should enforce it where available. CineBites does not currently verify or enforce Google's MFA setting.
- Confirm approved staff accounts can sign in on the staging HTTPS domain; test a non-staff account, canceled sign-in, logout and revoked staff access. No live Google account test was performed by the unit tests.
- Keep OAuth client secrets server-side and configure exact authorized redirect URIs in Google Cloud Console: `https://YOUR-DOMAIN/api/auth/google/callback`.
- Configure proxy/access-log redaction: never retain callback query strings, authorization headers or cookies. Application log redaction does not automatically configure hosting logs.

## Before multiple server instances

The current pilot has an in-memory 30 requests/minute/IP auth limiter (including callbacks) and 120 requests/minute/IP API limiter. They reset on restart and do not share counters. Keep the pilot on one instance. Before scaling, replace the counters with atomic shared storage (for example Redis), configure explicit trusted proxies, and test simultaneous requests across instances, expiry, restart and store failure. Shared infrastructure is not provisioned or implemented in this change. Do not add lockouts keyed only by an unverified email: outsiders could lock staff out. Password attempts are handled by Google.

Guidance: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Google 2-Step Verification](https://support.google.com/accounts/answer/185839).
