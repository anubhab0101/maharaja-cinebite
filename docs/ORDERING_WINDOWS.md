# Showtime ordering windows

The showtime records include runtime metadata used by the public ordering-window API.

| Movie | Runtime used | Reference |
|---|---:|---|
| Mirzapur: The Movie | 197 minutes | [IMDb](https://www.imdb.com/title/tt34339725/) and [Indian Express](https://indianexpress.com/article/entertainment/bollywood/mirzapur-the-movie-review-release-live-updates-pankaj-tripathi-ali-fazal-10861611/) report approximately 3h 15m; a 197-minute certificate/runtime report was also found. |
| Toxic: A Fairy Tale for Grown-ups | 194 minutes | [Rotten Tomatoes](https://www.rottentomatoes.com/m/toxic_a_fairytale_for_grownups) and [Fandango](https://www.fandango.com/toxic-a-fairytale-for-grownups-2026-244612/movie-overview) list 3h 14m. |
| Hanuman Ansh | 150 minutes | [BookMyShow](https://in.bookmyshow.com/movies/mumbai/hanuman-ansh/ET00507738) and [IMDb](https://m.imdb.com/title/tt39390582/) list 2h 30m. |

For a selected showtime, ordering opens **15 minutes after the scheduled start** and closes **30 minutes before the runtime-based end**. The API exposes `orderingEnabled` and the state values `NOT_STARTED`, `OPEN`, `CUTOFF`, `COOL_DOWN`, and `FINISHED`.

The kitchen cooldown rule is represented by the shared rule engine: after every 20 accepted orders for a screen/session, ordering remains paused for 15 minutes. The persistent order-acceptance counter must be connected to the payment-confirmed order workflow before launch; the current checkout UI is still a preview and does not yet create a database order.
