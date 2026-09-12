import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function OperationsControls() {
  const control = trpc.admin.orderingControl.useQuery();
  const pending = trpc.admin.pendingPayments.useQuery();
  const requests = trpc.admin.privacyRequests.useQuery();
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const pause = trpc.admin.setOrderingControl.useMutation({ onSuccess: () => { void control.refetch(); void utils.catalog.orderingWindow.invalidate(); toast.success("Ordering control saved"); }, onError: () => toast.error("Unable to change ordering control") });
  const reconcile = trpc.admin.reconcilePayment.useMutation({ onSuccess: result => { toast(result.status); void pending.refetch(); }, onError: () => toast.error("Payment verification failed; investigate or retry") });
  const privacy = trpc.admin.savePrivacyRequest.useMutation({ onSuccess: () => { toast.success("Privacy request saved"); void requests.refetch(); }, onError: () => toast.error("Request not saved. Check order, verification and permissions.") });
  const [editing, setEditing] = useState<string | undefined>();
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>();
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState<"ACCESS" | "CORRECTION" | "DELETION">("DELETION");
  const [status, setStatus] = useState<"REQUESTED" | "VERIFIED" | "RESOLVED" | "REJECTED">("REQUESTED");
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);
  const [hold, setHold] = useState(false);
  return <div className="space-y-5 mt-5">
    <section className="admin-panel p-6 space-y-3"><h2>Emergency ordering control</h2><p role="status">{control.isError ? "Status unavailable — retry" : control.data ? control.data.paused ? "NEW ORDERS PAUSED" : "New orders enabled (show timing still applies)" : "Loading…"}</p><p>Does not stop existing orders, tracking or confirmation of payments already in progress. Requests already being processed may finish.</p><label>Reason <input maxLength={160} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={!control.data || control.isError || reason.trim().length < 3 || pause.isPending} className="border rounded p-2" onClick={() => pause.mutate({ paused: !control.data!.paused, reason })}>{control.data?.paused ? "Resume new orders" : "Pause new orders"}</button></section>
    <section className="admin-panel p-6 space-y-3"><h2>Missed payment confirmation</h2><p>Latest 100 pending orders with a gateway reference. Each check reads Razorpay; it does not charge the customer. Older records can be checked by database order ID.</p>{pending.isError && <p role="alert">Unable to load pending payments.</p>}{pending.data?.map(row => <p key={row.id}>{row.orderNumber} <button className="underline" disabled={reconcile.isPending} onClick={() => reconcile.mutate({ orderId: row.id })}>Check Razorpay</button></p>)}<form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); reconcile.mutate({ orderId: Number(data.get("id")) }); }}><label>Database order ID <input required type="number" min="1" name="id" /></label><button disabled={reconcile.isPending}>Reconcile payment</button></form></section>
    <section className="admin-panel p-6 space-y-3"><h2>Privacy requests & legal holds</h2><p>Admin register, not a public identity-verification form. Use the database order ID from the customer export. A request entry does not automatically disclose, correct or delete records. Keep notes minimal; do not upload identity documents.</p><form className="space-y-3" onSubmit={e => { e.preventDefault(); privacy.mutate({ id: editing, expectedUpdatedAt, orderId: Number(orderId), type, status, legalHold: hold, identityVerified: verified, note }); }}>
      <label>Order ID <input required type="number" min="1" value={orderId} disabled={!!editing} onChange={e => setOrderId(e.target.value)} /></label>
      <label>Request type <select value={type} onChange={e => setType(e.target.value as typeof type)}>{["ACCESS", "CORRECTION", "DELETION"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Status <select value={status} onChange={e => setStatus(e.target.value as typeof status)}>{["REQUESTED", "VERIFIED", "RESOLVED", "REJECTED"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="block"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />Customer identity independently verified</label>
      <label className="block"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} />Legal hold — prevent cleanup</label>
      <label>Reason / action taken <textarea required minLength={5} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button disabled={privacy.isPending}>Save {editing ? "changes" : "request"}</button><button type="button" onClick={() => { setEditing(undefined); setOrderId(""); setNote(""); setVerified(false); setHold(false); setStatus("REQUESTED"); }}>New request</button>
    </form>{requests.isError && <p role="alert">Unable to load privacy register.</p>}{requests.data?.map(row => <p key={row.id}>Order {row.orderId} · {row.type} · {row.status} · {row.legalHold ? "HOLD" : "No hold"} <button className="underline" onClick={() => { setEditing(row.id); setExpectedUpdatedAt(row.updatedAt); setOrderId(String(row.orderId)); setType(row.type); setStatus(row.status); setNote(row.note); setVerified(row.identityVerified); setHold(row.legalHold); }}>Review</button></p>)}</section>
  </div>;
}

export function RefundCompletionControl() {
  const sync = trpc.admin.syncRefund.useMutation();
  const utils = trpc.useUtils();
  return <form className="mt-4 space-y-2" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { const result = await sync.mutateAsync({ id: Number(data.get("id")), refundId: String(data.get("refundId")) }); toast.success(`Verified refund: ${result.status}`); void utils.admin.refundRequests.invalidate(); } catch { toast.error("Refund verification failed. Check reference and amount; no refund was issued by this action."); } }}><h3>Verify a dashboard refund</h3><label>Request ID <input required type="number" min="1" name="id" /></label><label>Razorpay refund reference <input required pattern="rfnd_[A-Za-z0-9]+" name="refundId" /></label><button disabled={sync.isPending}>Fetch and save provider status</button><p>This checks an existing refund; it does not send money. Revenue statistics remain gross captured revenue.</p></form>;
}
