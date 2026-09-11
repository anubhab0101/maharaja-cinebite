import { useMemo, useState } from "react";
import { CalendarDays, MapPin, RefreshCw, Ticket } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Showtimes() {
  const dates = trpc.catalog.showtimeDates.useQuery();
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const showtimes = trpc.catalog.showtimes.useQuery(selectedDate ? { showDate: selectedDate } : undefined);
  const grouped = useMemo(() => {
    const rows = showtimes.data ?? [];
    return rows.reduce<Record<string, typeof rows>>((acc, row) => {
      (acc[row.movieTitle] ??= []).push(row);
      return acc;
    }, {});
  }, [showtimes.data]);

  return <main className="min-h-screen bg-[#101010] px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs uppercase tracking-[0.2em] text-orange-300">Live imported schedule</p><h1 className="text-3xl font-semibold">Maharaja Cinema Showtimes</h1><p className="mt-2 flex items-center gap-2 text-sm text-white/60"><MapPin size={15} /> Bhoi Nagar, Vani Vihar, Bhubaneswar</p></div>
        <a className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/75 hover:bg-white/10" href="https://in.bookmyshow.com/cinemas/BHUB/maharaja-christie-4k-dolby-atmos-64-channel/buytickets/MPDB/20260908" target="_blank" rel="noreferrer">Source page ↗</a>
      </div>
      <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <button onClick={() => setSelectedDate(undefined)} className={`rounded-xl px-3 py-2 text-sm ${!selectedDate ? "bg-orange-400 text-black" : "text-white/65 hover:bg-white/10"}`}><CalendarDays className="mr-2 inline" size={15} />All dates</button>
        {(dates.data ?? []).map((date) => <button key={date} onClick={() => setSelectedDate(date)} className={`rounded-xl px-3 py-2 text-sm ${selectedDate === date ? "bg-orange-400 text-black" : "text-white/65 hover:bg-white/10"}`}>{date}</button>)}
        {showtimes.isFetching && <RefreshCw className="ml-auto mt-2 animate-spin text-orange-300" size={17} />}
      </div>
      {!showtimes.data?.length && !showtimes.isLoading && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/55">No imported showtimes are available for this date.</div>}
      <div className="grid gap-4 md:grid-cols-2">{Object.entries(grouped).map(([movie, rows]) => <section key={movie} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-medium">{movie}</h2><p className="mt-1 text-sm text-white/55">{rows[0]?.language} · {rows[0]?.format} · Certificate {rows[0]?.certificate} · Runtime {rows[0]?.durationMinutes} min</p></div><Ticket className="text-orange-300" size={20} /></div><div className="mt-5 flex flex-wrap gap-2">{rows.map((row) => <ShowtimeChip key={row.id} row={row} />)}</div><p className="mt-4 text-xs text-white/40">Synced from public source · {new Date(rows[0].syncedAt).toLocaleString()}</p></section>)}</div>
    </div>
  </main>;
}

function ShowtimeChip({ row }: { row: { id: number; showDate: string; startTime: string; durationMinutes: number; availability: string } }) {
  const window = trpc.catalog.orderingWindow.useQuery({ showtimeId: row.id });
  const label = window.data?.state === "NOT_STARTED" ? "Starts 15 min after show" : window.data?.state === "CUTOFF" ? "Ordering closed" : window.data?.state === "COOL_DOWN" ? "15 min kitchen break" : window.data?.state === "FINISHED" ? "Finished" : "Order open";
  const color = window.data?.state === "OPEN" ? "bg-emerald-400/15 text-emerald-100" : "bg-orange-400/15 text-orange-100";
  return <a href={`/?showtimeId=${row.id}`} className={`rounded-xl px-3 py-2 text-sm transition hover:brightness-125 ${color}`}><strong>{row.startTime}</strong><span className="ml-2 text-xs opacity-70">{label}</span></a>;
}
