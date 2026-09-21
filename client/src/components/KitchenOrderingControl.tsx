import { useState } from "react";
import { trpc } from "@/lib/trpc";
export default function KitchenOrderingControl() {
  const query = trpc.kitchen.orderingControl.useQuery(undefined, { refetchInterval: 5000 });
  const [error, setError] = useState("");
  const change = trpc.kitchen.setOrderingControl.useMutation();
  return <section className="order-chat" aria-label="Kitchen ordering control">
    <strong>{query.data?.paused ? "New orders paused" : query.data ? "Accepting new orders" : "Checking ordering status…"}</strong>
    <button className="ml-3" disabled={!query.data || query.isError || change.isPending} onClick={async () => {
      const paused = !query.data!.paused;
      if (!window.confirm(paused ? "Pause all new orders now? Existing orders and payments already in progress will continue." : "Resume new orders? Show timing restrictions still apply.")) return;
      try { await change.mutateAsync({ paused, reason: paused ? "Kitchen emergency pause" : "Kitchen resumed service" }); await query.refetch(); setError(""); } catch { setError("Change could not be confirmed. Refresh status before assuming it succeeded."); }
    }}>{change.isPending ? "Updating…" : query.data?.paused ? "Resume orders" : "Pause new orders"}</button>
    <p>Existing accepted orders and payment confirmations continue. Resume still respects show timings.</p>
    {(error || query.isError) && <p role="alert">{error || "Ordering status unavailable. Check connection."}</p>}
  </section>;
}
