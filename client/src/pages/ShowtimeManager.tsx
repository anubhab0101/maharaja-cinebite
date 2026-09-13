import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const emptyForm = () => ({ id: undefined as number | undefined, movieTitle: "", screenName: "", showDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), startTime: "10:00", durationMinutes: 150, availability: "LISTED" as "LISTED" | "WITHDRAWN" });
const fieldClass = "w-full rounded-lg border border-white/20 bg-[#161616] p-3 text-white";
function timeInput(value: string) {
  const match = value.match(/^(\d+):(\d+) (AM|PM)$/);
  return match ? `${String(Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0)).padStart(2, "0")}:${match[2]}` : "10:00";
}
function storedTime(value: string) {
  const [hour, minute] = value.split(":");
  return `${String(Number(hour) % 12 || 12).padStart(2, "0")}:${minute} ${Number(hour) >= 12 ? "PM" : "AM"}`;
}

export default function ShowtimeManager() {
  const utils = trpc.useUtils();
  const shows = trpc.admin.showtimes.useQuery(undefined, { refetchInterval: 30000 });
  const seats = trpc.admin.configuredSeats.useQuery();
  const [date, setDate] = useState(emptyForm().showDate);
  const [form, setForm] = useState(emptyForm);
  const screenNames = Array.from(new Set(seats.data?.map(row => row.screenName) ?? []));
  const save = trpc.admin.saveShowtime.useMutation({
    onSuccess: () => {
      toast.success("Showtime saved. Permanent seat QRs use the updated schedule.");
      setDate(form.showDate);
      setForm(emptyForm());
      void utils.admin.showtimes.invalidate();
      void utils.admin.sessionLinks.invalidate();
      void utils.catalog.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const visible = (shows.data ?? []).filter(show => !date || show.showDate === date)
    .sort((a, b) => a.showDate.localeCompare(b.showDate) || timeInput(a.startTime).localeCompare(timeInput(b.startTime)));
  return <section className="admin-panel p-5 space-y-6">
    <div><h2 className="text-xl font-semibold">Movies & showtimes</h2><p className="mt-2 text-sm text-white/75">All times are India time (IST). Orders open 15 minutes after the start and close 30 minutes before the end. Permanent seat stickers automatically follow the current show.</p></div>
    <form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); save.mutate({ ...form, screenName: form.screenName || screenNames[0] || "", startTime: storedTime(form.startTime) }); }}>
      <h3 className="md:col-span-2 font-semibold">{form.id ? `Edit show #${form.id}` : "Add a movie show"}</h3>
      <label>Movie name<input required maxLength={180} className={fieldClass} value={form.movieTitle} onChange={e => setForm({ ...form, movieTitle: e.target.value })} /></label>
      <label>Screen<select required className={fieldClass} value={form.screenName || screenNames[0] || ""} onChange={e => setForm({ ...form, screenName: e.target.value })}><option value="" disabled>Select configured screen</option>{screenNames.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Date<input required type="date" className={fieldClass} value={form.showDate} onChange={e => setForm({ ...form, showDate: e.target.value })} /></label>
      <label>Start time (IST)<input required type="time" className={fieldClass} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></label>
      <label>Duration in minutes<input required type="number" min={46} max={360} className={fieldClass} value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
      <label>Status<select className={fieldClass} value={form.availability} onChange={e => setForm({ ...form, availability: e.target.value as "LISTED" | "WITHDRAWN" })}><option value="LISTED">Active</option><option value="WITHDRAWN">Withdrawn — ordering disabled</option></select></label>
      <p className="md:col-span-2 text-sm text-white/75">Saving an imported show makes it manually managed. The importer will stop for that date for review, so it cannot silently overwrite your edits.</p>
      {seats.isError && <p role="alert">Could not load configured screens. <button type="button" onClick={() => void seats.refetch()}>Retry</button></p>}
      {!seats.isLoading && !seats.isError && !screenNames.length && <p>First configure the cinema screen and seats under Seat QRs.</p>}
      <div className="flex gap-3"><button className="primary-small" disabled={save.isPending || !screenNames.length}>{save.isPending ? "Saving…" : "Save showtime"}</button><button type="button" className="secondary-admin-button" disabled={save.isPending} onClick={() => setForm(emptyForm())}>New / clear</button></div>
    </form>
    <div className="flex flex-wrap items-end gap-3"><label>Saved shows for date<input type="date" className={fieldClass} value={date} onChange={e => setDate(e.target.value)} /></label><button className="secondary-admin-button" onClick={() => setDate("")}>All dates</button><button className="secondary-admin-button" onClick={() => void shows.refetch()}>Refresh</button></div>
    {shows.isLoading ? <p>Loading saved showtimes…</p> : shows.isError ? <p role="alert">Could not load showtimes. Please retry with Refresh.</p> : !visible.length ? <p>No saved shows for this date. Add one above or choose All dates to see imported shows.</p> : <div className="grid gap-3 md:grid-cols-2">{visible.map(show => <article className="rounded-xl border border-white/15 p-4 space-y-2" key={show.id}>
      <h3 className="font-semibold">{show.movieTitle}</h3><p>{show.showDate} · {show.startTime} IST · {show.durationMinutes} min</p><p>{show.screenName || "Screen unassigned"} · {show.availability}</p><p className="text-sm text-white/70">{show.source === "MANUAL" ? "Manually managed" : show.source} · Updated {new Date(show.syncedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <button className="secondary-admin-button" disabled={save.isPending} onClick={() => { setForm({ id: show.id, movieTitle: show.movieTitle, screenName: show.screenName ?? "", showDate: show.showDate, startTime: timeInput(show.startTime), durationMinutes: show.durationMinutes, availability: show.availability === "WITHDRAWN" ? "WITHDRAWN" : "LISTED" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit movie / timing / status</button>
    </article>)}</div>}
  </section>;
}
