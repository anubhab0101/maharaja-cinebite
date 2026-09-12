# Temporary BookMyShow manual sync

No scheduler, cron job, background recurring automation, CAPTCHA solving, stealth plugin, proxy rotation or login-cookie reuse is installed. This is a one-shot operator command, not a free official BookMyShow API. Public browser access and source permission/terms must be checked for the deployment environment. A successful desktop read does not guarantee hosting access.

## Setup and preview

Install development dependencies (the browser is an operator tool, not part of the customer web server):

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm showtimes:sync --url "https://in.bookmyshow.com/cinemas/BHUB/maharaja-christie-4k-dolby-atmos-64-channel/buytickets/MPDB/20260913"
```

The date suffix must be replaced with the actual requested date. Only today through the next seven days are accepted. Preview reads the selected date, movie-to-time associations and each movie's public runtime. It prints opening and closing times in India time. It does not connect to or modify the database.

## Apply an import

If the standalone headless browser is blocked but an ordinary browser can legitimately display the pages, a trusted operator may export the observed fields into the same JSON format and use `pnpm showtimes:sync --input "path/to/export.json"`. The export must contain sourceUrl, date, observedAt, screenName and movies with title/movieUrl/language/format/certificate/durationMinutes/times. `--screen "EXACT_CONFIGURED_SCREEN_NAME" --apply` enables the same validated transaction. This is a manual data-entry trust boundary, not a cryptographically authenticated provider feed; never import an untrusted file. The 15-minute observation-age check still applies. Do not rewrite an old export's timestamp to make it look fresh.

After testing the database migrations, configure a real screen and its seat layout once. Map the entire Maharaja listing to that screen; the four seating categories are not four screens. Set DATABASE_URL in the operator's existing .env without exposing it in command arguments, then run:

```powershell
pnpm showtimes:sync --url "https://in.bookmyshow.com/cinemas/BHUB/maharaja-christie-4k-dolby-atmos-64-channel/buytickets/MPDB/20260913" --screen "EXACT_CONFIGURED_SCREEN_NAME" --apply
```

`--apply` performs a fresh scrape and applies the complete date in one database transaction. Missing/conflicting screen mapping, legacy records for that date, missing runtimes, changed DOM, empty listing or blocked pages stop the import. There is no arbitrary-URL fetch endpoint exposed to customers.

Existing imported shows retain their IDs/session tokens. Newly listed shows get session links; removed shows are marked WITHDRAWN and their links deactivated, without deleting paid orders. Runtime provenance and a summary are written to the audit log. Tickets sold out are not used to infer absent physical seats or change food prices.

## Timing and freshness

- New orders open at scheduled start + 15 minutes.
- New orders close at scheduled start + published runtime − 30 minutes.
- Actual projector delays and interval time are not detected.
- Imported schedules older than 36 hours cannot accept new checkout. Their paid-order tracking continues. A failed sync preserves existing data but does not extend freshness.
- Until recurring automation is added, YOU must run this command for each required date and refresh daily. Merely adding the command will not keep the schedule up to date, and theatre staff are not expected to run it.
- Existing kitchen cooldown rules still apply.
- Source changes between refreshes may not be known. A truly empty/cancelled day is deliberately not inferred from an empty response; it needs source/operator confirmation.

## Verification limits

Parser/timing validation tests are automated. Browser access is tested separately from database apply. A rejected/blocked browser run must not be described as a successful import. This implementation does not bypass source access controls. Database apply still requires staging integration verification before paid pilot traffic.
