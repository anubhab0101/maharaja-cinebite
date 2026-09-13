import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MAHARAJA_SEAT_LABELS, MAHARAJA_SECTIONS, describeMaharajaSeat } from "@shared/maharaja-seats";

type SavedSeat = { screenName: string; seat: string; token: string };
type Sticker = SavedSeat & { url: string; image: string };
const labels = new Set(MAHARAJA_SEAT_LABELS);
const inputClass = "block w-full rounded-xl border border-white/20 bg-[#161616] p-3 text-white";

export default function SeatQrGenerator() {
  const configured = trpc.admin.configuredSeats.useQuery();
  const shows = trpc.admin.showtimes.useQuery();
  const save = trpc.admin.configureSeats.useMutation();
  const [chosenScreen, setChosenScreen] = useState("");
  const [newScreen, setNewScreen] = useState("");
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const printRoot = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const names = Array.from(new Set([...(configured.data ?? []).map(row => row.screenName), ...(shows.data ?? []).map(row => row.screenName).filter((name): name is string => Boolean(name))]));
  const screen = chosenScreen === "__new" ? newScreen.trim() : chosenScreen || names[0] || newScreen.trim();
  const saved = (configured.data ?? []).filter(row => row.screenName === screen && labels.has(row.seat));
  const extraCount = (configured.data ?? []).filter(row => row.screenName === screen && !labels.has(row.seat)).length;
  const visible = stickers.filter(row => (!section || row.seat.startsWith(section + "-")) && (!search.trim() || describeMaharajaSeat(row.seat).toLowerCase().includes(search.trim().toLowerCase()) || row.seat.toLowerCase().includes(search.trim().toLowerCase())));

  function clearPreview() { setStickers([]); setError(""); setProgress(0); }
  async function generate() {
    if (busyRef.current) return;
    if (!screen) { setError("Enter the screen name used in Movies & showtimes first."); return; }
    busyRef.current = true;
    setBusy(true); setError(""); setStickers([]); setProgress(0); setSearch(""); setSection("");
    try {
      // Re-saving adds missing seats and preserves every existing QR token.
      if (saved.length !== MAHARAJA_SEAT_LABELS.length) {
        await save.mutateAsync({ screen, labels: MAHARAJA_SEAT_LABELS });
      }
      const result = await configured.refetch();
      if (result.error || !result.data) throw new Error("Could not read the saved seats. Please try again.");
      const rows = result.data.filter(row => row.screenName === screen && labels.has(row.seat));
      if (rows.length !== MAHARAJA_SEAT_LABELS.length) throw new Error("The complete layout could not be loaded. Check that the screen is active, then retry.");
      const byLabel = new Map(rows.map(row => [row.seat, row]));
      const output: Sticker[] = [];
      for (let offset = 0; offset < MAHARAJA_SEAT_LABELS.length; offset += 12) {
        const batch = await Promise.all(MAHARAJA_SEAT_LABELS.slice(offset, offset + 12).map(async label => {
          const row = byLabel.get(label)!;
          const url = `${window.location.origin}/?seatToken=${encodeURIComponent(row.token)}`;
          return { ...row, url, image: await QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M" }) };
        }));
        output.push(...batch);
        setProgress(output.length);
        // Allow progress painting and taps between batches on slower phones.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
      setStickers(output);
      toast.success(`${output.length} permanent seat QRs ready`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "QR generation failed. Please try again.");
    } finally { setBusy(false); busyRef.current = false; }
  }
  function download(row: Sticker) {
    const link = document.createElement("a"); link.href = row.image;
    link.download = `Maharaja-${row.seat}-QR.png`; link.click();
  }
  async function printStickers() {
    if (!visible.length || preparingPrint) return;
    setPreparingPrint(true);
    try {
      // Never open preview before every selected QR image is ready.
      await Promise.all(Array.from(printRoot.current?.querySelectorAll("img") ?? []).map(image => image.decode()));
      window.print();
    } catch {
      toast.error("A QR image could not load. Please generate the stickers again before printing.");
    } finally { setPreparingPrint(false); }
  }
  async function copy(row: Sticker) {
    try { await navigator.clipboard.writeText(row.url); toast.success(`Seat ${row.seat} link copied`); }
    catch { toast.error("Could not copy the link. Use Open to access it."); }
  }
  function exportCsv() {
    const csvCell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const csv = ["Screen,Seat,URL", ...visible.map(row => [row.screenName, row.seat, row.url].map(csvCell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "Maharaja-seat-QR-links.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="seat-qr-workspace space-y-5">
    <div className="print:hidden admin-panel p-5 space-y-4">
      <h2 className="text-xl font-semibold">Permanent seat QRs</h2>
      <p className="text-white/80">Choose your screen → generate → print. No movie selection or seat-code typing needed. These stickers work for future shows too.</p>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        {names.length > 0 && <label className="block">Screen<select className={inputClass} value={chosenScreen || names[0]} onChange={e => { setChosenScreen(e.target.value); clearPreview(); }}>{names.map(name => <option key={name}>{name}</option>)}<option value="__new">Add another screen…</option></select></label>}
        {(!names.length || chosenScreen === "__new") && <label className="block">Screen name<input className={inputClass} maxLength={64} placeholder="Use the same name as your movie schedule" value={newScreen} onChange={e => { setNewScreen(e.target.value); clearPreview(); }} /></label>}
        <div className="rounded-xl bg-white/5 p-4"><p className="font-semibold">Your supplied Maharaja layout · {MAHARAJA_SEAT_LABELS.length} seats</p><p className="mt-1 text-sm text-white/75">Motorized Slider · Super Deluxe · Recliner · Slider</p><p className="mt-2 text-sm">{saved.length} of {MAHARAJA_SEAT_LABELS.length} seats already saved{screen ? ` for ${screen}` : ""}. Missing seats will be saved automatically.</p></div>
        {extraCount > 0 && <p className="text-sm text-amber-200">{extraCount} saved seat label(s) are outside the supplied layout (for example, a section name alone). They are kept in the database but excluded from these stickers.</p>}
        <button className="primary-small w-full justify-center" disabled={!screen || configured.isLoading || configured.isError} onClick={() => void generate()}>{busy ? save.isPending ? "Saving seat layout…" : `Generating ${progress} / ${MAHARAJA_SEAT_LABELS.length}…` : saved.length === MAHARAJA_SEAT_LABELS.length ? `Generate ${MAHARAJA_SEAT_LABELS.length} seat QRs` : `Use Maharaja layout & generate ${MAHARAJA_SEAT_LABELS.length} QRs`}</button>
      </fieldset>
      {busy && <div role="status" aria-live="polite"><progress className="w-full" max={MAHARAJA_SEAT_LABELS.length} value={progress} /><p>Please keep this tab open while the stickers are prepared.</p></div>}
      {configured.isLoading && <p role="status">Loading saved seats…</p>}
      {(error || configured.isError) && <div role="alert" className="text-red-200"><p>{error || "Could not load seats. Check your connection and admin login."}</p><button className="secondary-admin-button mt-2" disabled={busy} onClick={() => { setError(""); void configured.refetch(); }}>Retry loading seats</button></div>}
      <p className="text-sm text-white/70">Print one test sticker and scan it before printing all seats. Keep your screen name and website domain unchanged after printing.</p>
    </div>
    {stickers.length > 0 && <>
      <div className="print:hidden admin-panel p-5 space-y-4">
        <h3 className="font-semibold">Ready! {stickers.length} seat QRs generated for {stickers[0].screenName}</h3>
        <div className="grid gap-3 sm:grid-cols-2"><label>Section<select className={inputClass} value={section} onChange={e => setSection(e.target.value)}><option value="">All sections</option>{MAHARAJA_SECTIONS.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Find a seat<input className={inputClass} value={search} placeholder="Example: MS-A01" onChange={e => setSearch(e.target.value)} /></label></div>
        <div className="flex flex-wrap gap-3"><button className="primary-small" disabled={!visible.length || preparingPrint} onClick={() => void printStickers()}>{preparingPrint ? "Preparing print…" : `Print stickers / Save PDF (${visible.length} seats)`}</button><button className="secondary-admin-button" disabled={!visible.length} onClick={exportCsv}>Download links CSV</button></div>
        <p className="text-sm">A4 portrait · 4 stickers per page (2 × 2) · {Math.ceil(visible.length / 4)} pages. Only stickers appear in print preview. Use 100% scale and turn browser headers and footers off.</p>
        <p className="text-sm text-white/75">The selected seats below will print. Choose “Save as PDF” in the print dialog to download a printable sheet.</p>
      </div>
      <div className="seat-qr-stickers grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(row => <article key={row.token} className="seat-qr-sticker rounded-xl border border-black/20 bg-white p-4 text-center text-black">
        <p className="font-semibold">Maharaja Cinema</p><p className="text-sm">{row.screenName}</p><h3 className="mt-2 text-2xl font-bold">{row.seat}</h3><p className="text-xs">{describeMaharajaSeat(row.seat)}</p>
        <img className="mx-auto h-40 w-40" width={160} height={160} src={row.image} alt={`Food ordering QR for ${row.seat}`} />
        <p className="text-sm font-semibold">Scan to order food to your seat</p>
        <div className="print:hidden mt-3 flex flex-wrap justify-center gap-3 text-sm"><button className="rounded border border-black/30 px-3 py-2" onClick={() => download(row)}>Download PNG</button><button className="rounded border border-black/30 px-3 py-2" onClick={() => void copy(row)}>Copy link</button><a className="px-3 py-2 underline" href={row.url} target="_blank" rel="noreferrer">Open</a></div>
      </article>)}</div>
      {!visible.length && <p className="print:hidden">No matching seats. Clear the search or choose All sections.</p>}
    </>}
    {visible.length > 0 && createPortal(<div ref={printRoot} className="seat-qr-print-root" aria-hidden="true">
      {Array.from({ length: Math.ceil(visible.length / 4) }, (_, page) => <div className="seat-qr-print-page" key={page}>
        {visible.slice(page * 4, page * 4 + 4).map(row => <article className="seat-qr-print-card" key={row.token}>
          <p className="seat-qr-print-brand">Maharaja Cinema</p>
          <p>{row.screenName}</p>
          <h2>{row.seat}</h2>
          <p>{describeMaharajaSeat(row.seat)}</p>
          <img src={row.image} width={240} height={240} alt={`QR for ${row.seat}`} />
          <p className="seat-qr-print-instruction">Scan to order food to your seat</p>
        </article>)}
      </div>)}
    </div>, document.body)}
  </section>;
}
