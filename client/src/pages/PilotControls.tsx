import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { rupees } from "@shared/cinebites";
import { MAHARAJA_SEAT_LABELS } from "@shared/maharaja-seats";
import OperationsControls, { RefundCompletionControl } from "./OperationsControls";

export function PilotOverview() {
  const stats = trpc.admin.stats.useQuery(undefined, { refetchInterval: 15000 });
  if (stats.isError) return <><OperationsControls /><p role="alert">Live statistics unavailable. Retry before relying on these figures.</p></>;
  if (!stats.data) return <><OperationsControls /><p>Loading live statistics…</p></>;
  const s = stats.data;
  return <><OperationsControls /><section className="admin-panel p-6"><h2>Today's operations (India time)</h2><p>Confirmed revenue: {rupees(s.revenuePaise)}</p><p>Orders created: {s.ordersToday}</p><p>Paid queue: {s.pending} · Preparing: {s.preparing} · Ready: {s.ready} · Delivered: {s.delivered}</p><p>No estimated growth or demo charts are included.</p></section><CustomerDataExport /></>;
}

function CustomerDataExport() {
  const exporter = trpc.admin.exportCustomerData.useMutation();
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  async function download() {
    try {
      const result = await exporter.mutateAsync({ afterId: cursor });
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cinema-customer-records-after-${cursor}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(result.nextCursor === null);
      if (result.nextCursor !== null) setCursor(result.nextCursor);
      toast.success(result.nextCursor === null ? "Final export file downloaded" : "File downloaded. Export the next batch to continue.");
    } catch { toast.error("Export failed. Only cinema admins can export. Retry without sharing customer data."); }
  }
  return <section className="admin-panel p-6 mt-4 space-y-3"><h2>Customer records export — admins only</h2><p>Downloads orders, consent evidence, items, payments and refunds as JSON, up to 200 orders per file. Continue until the final file. This is not a full database backup.</p><label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I will protect this customer-data file and delete copies when no longer required. Database cleanup cannot delete downloaded files.</label><button className="border rounded px-4 py-2 disabled:opacity-50" disabled={!acknowledged || done || exporter.isPending} onClick={download}>{exporter.isPending ? "Exporting…" : done ? "Export complete" : cursor ? "Export next batch" : "Export first batch"}</button><button className="ml-3 underline" disabled={exporter.isPending} onClick={() => { setCursor(0); setDone(false); }}>Restart export</button><p>Automatic one-month database deletion is not enabled: record scope and legal retention exceptions need approval.</p></section>;
}

export function PilotMenuEditor() {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<"Combos" | "Popcorn" | "Snacks" | "Beverages">("Snacks");
  const utils = trpc.useUtils();
  const save = trpc.admin.saveMenuItem.useMutation({ onSuccess: () => { toast.success("Menu saved"); void utils.admin.menu.invalidate(); void utils.catalog.menu.invalidate(); }, onError: e => toast.error(e.message) });
  return <form className="admin-panel p-6 space-y-3" onSubmit={e => { e.preventDefault(); save.mutate({ id, name, category, pricePaise: Math.round(Number(price) * 100), description: name, available: true, options: [] }); }}>
    <h2>Add or replace a menu item</h2><p>Reusing an ID replaces that item. Existing paid orders retain their original price and item details.</p>
    <label>Item ID <input required pattern="[a-z0-9-]+" value={id} onChange={e => setId(e.target.value)} /></label>
    <label>Name <input required value={name} onChange={e => setName(e.target.value)} /></label>
    <label>Price (₹) <input required type="number" min="1" max="10000" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
    <label>Category <select value={category} onChange={e => setCategory(e.target.value as typeof category)}>{["Combos", "Popcorn", "Snacks", "Beverages"].map(c => <option key={c}>{c}</option>)}</select></label>
    <button disabled={save.isPending} className="primary-small">{save.isPending ? "Saving…" : "Save item"}</button>
  </form>;
}

export function PilotRefunds() {
  const requests = trpc.admin.refundRequests.useQuery();
  return <section className="admin-panel p-6"><h2>Refund review queue</h2><p>Pilot procedure: verify the original payment and execute approved refunds in the Razorpay dashboard. A request here does not move money.</p>
    {requests.isError && <p role="alert">Unable to load refund requests.</p>}
    {requests.data?.length === 0 && <p>No refund requests.</p>}
    {requests.data?.map(r => <p key={r.id}>Request {r.id} · Payment record {r.paymentId} · {rupees(r.amountPaise)} · {r.status} · {r.reason}</p>)}
    <RefundCompletionControl />
  </section>;
}

export function PilotSeatSetup() {
  const [screen, setScreen] = useState("");
  const [labels, setLabels] = useState("");
  const save = trpc.admin.configureSeats.useMutation({ onSuccess: () => toast.success("Seat list saved"), onError: e => toast.error(e.message) });
  return <form className="admin-panel p-6 space-y-3" onSubmit={e => { e.preventDefault(); save.mutate({ screen, labels: labels.split(/[\s,]+/).filter(Boolean) }); }}>
    <h2>Verified cinema seat configuration</h2><p>Enter only theatre-confirmed seats. Screen name must exactly match the showtime/session. This adds seats; it never deletes existing seats.</p>
    <label>Screen name <input required maxLength={64} value={screen} onChange={e => setScreen(e.target.value)} /></label>
    <button type="button" onClick={() => setLabels(MAHARAJA_SEAT_LABELS.join(", "))}>Load supplied Maharaja layout (540 seats, four sections)</button>
    <p>MS = Motorized Slider · SD = Super Deluxe · RC = Recliner · SL = Slider. Confirm section prefixes with delivery staff before printing.</p>
    <label>Seat labels, separated by commas <textarea required value={labels} onChange={e => setLabels(e.target.value.toUpperCase())} /></label>
    <button className="primary-small" disabled={save.isPending}>Save verified seats</button>
  </form>;
}
