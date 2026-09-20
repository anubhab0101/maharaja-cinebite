# Temporary demo health session

The scheduled keep-awake workflow is best-effort: GitHub can delay scheduled
runs beyond Render Free's 15-minute idle threshold. CodeQL does not cause this.
Do not promise always-on hosting from this workflow.

For a demo, manually run **CineBite demo health session** in GitHub Actions on
`main`. Select 30, 60, 120 or 300 minutes. Confirm that the job is **running**
and has logged `application/database healthy` before relying on it. Queued is
not running. The job runs independently of the operator's laptop after startup.

It calls the public HTTPS health endpoint every four minutes, with three bounded
attempts, a unique query string and JSON validation. No credentials, customer
data, payment actions or database writes are used. Failed cycles are marked in
logs; recovery attempts continue until the bounded session ends. The final run
fails if any cycle exhausted its retries. Enable GitHub Actions notifications
for completed failures; this is not an instant outage notification service.

This uses GitHub-hosted runner minutes. Check account limits before use on a
private repository. Do not turn this into an indefinite looping workflow.
Cancel the run in Actions to stop early. Render can still restart or fail;
network outages and database outages remain possible. Paid non-idling hosting
is the appropriate permanent solution, subject to separate purchase approval.

Before presenting: open the real seat QR, confirm the correct current show,
check menu availability, and verify staff login. Do not charge real money merely
to test readiness. Keep Render Events/Logs available when authenticated.

This workflow runs on GitHub, not inside the sleeping Render process. Deploying
an internal self-ping timer cannot wake an already suspended process. No Render
application redeploy is required for this external monitor.
