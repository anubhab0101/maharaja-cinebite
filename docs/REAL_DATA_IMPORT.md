# Real Showtime Import

## Current import

The production database currently contains the publicly visible showtimes collected from the supplied Maharaja Cinema Bhubaneswar page, in two-day batches covering the first two days and the following two days:

`https://in.bookmyshow.com/cinemas/BHUB/maharaja-christie-4k-dolby-atmos-64-channel/buytickets/MPDB/20260908`

The imported venue is **Maharaja (Christie 4K, DOLBY ATMOS 64 CHANNEL)** in Bhubaneswar. The current dataset contains **8 records for September 8–11, 2026**. Each record stores the public source URL, source identifier, movie title, certificate, language, format, screen label, show date, show time, availability, and sync timestamp.

The live customer-facing route is `/showtimes`. The source page remains linked there for verification.

## Clean-data boundary

Demo orders, menu items, categories, menu options, payments, refunds, consents, audit seed records, screens, seats, and showtime seed records were removed from the database. User accounts were preserved. The server-side demo store now starts with empty menu, order, and staff collections, and dashboard metrics start at zero.

## Production note

The current import is a verified one-time ingestion, not an unattended recurring scraper. For a production launch, use an authorized theatre feed or licensed showtime provider and run a server-side sync job with source terms approval, rate limits, change detection, retries, last-known-good fallback, and an audit trail. Do not expose scraping credentials in the browser.

The showtime schema and API are replaceable: a future authorized provider can populate the same `showtimes` table without changing the `/showtimes` UI contract.
