import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, Check, ChefHat, Clock3, LogOut, RefreshCw, ShieldAlert, Undo2, Volume2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { hasStaffRole, KitchenOrder, ORDER_STATUSES, OrderStatus, rupees } from "@shared/cinebites";
import { isAudioReady, playKitchenChime, testKitchenAudio, unlockKitchenAudio } from "@/lib/kitchenAudio";

const columns: { status: OrderStatus; label: string; tone: string }[] = [
  { status: "NEW", label: "New", tone: "orange" },
  { status: "PREPARING", label: "Preparing", tone: "violet" },
  { status: "READY", label: "Ready for delivery", tone: "green" },
];

type UndoAction = { order: KitchenOrder; previousStatus: OrderStatus; nextStatus: OrderStatus };
function minutesAgo(value: string) { return Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000)); }

export default function Kitchen() {
  const { user, logout, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login?redirect=/kitchen" });
  const utils = trpc.useUtils();
  const queue = trpc.kitchen.queue.useQuery(undefined, { refetchInterval: 30000 });
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimer = useRef<number | null>(null);
  const snapshots = useRef(new Map<string, KitchenOrder[] | undefined>());
  const [alerts, setAlerts] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(isAudioReady());
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [queueView, setQueueView] = useState<"priority" | "wait">("priority");
  const [queueFilter, setQueueFilter] = useState<"all" | "urgent">("all");

  useEffect(() => {
    const handleGesture = () => {
      unlockKitchenAudio().then((unlocked) => {
        if (unlocked) setAudioUnlocked(true);
      });
    };
    window.addEventListener("click", handleGesture, { passive: true });
    window.addEventListener("keydown", handleGesture, { passive: true });
    window.addEventListener("touchstart", handleGesture, { passive: true });
    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
  }, []);

  const clearUndo = () => {
    setUndoAction(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
  };
  const showUndo = (action: UndoAction) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndoAction(action);
    undoTimer.current = window.setTimeout(clearUndo, 6000);
  };
  const moveOptimistically = (orderId: string, nextStatus: OrderStatus) => {
    utils.kitchen.queue.setData(undefined, (current) => current?.flatMap((order) => {
      if (order.id !== orderId) return [order];
      return nextStatus === "DELIVERED" ? [] : [{ ...order, status: nextStatus, updatedAt: new Date().toISOString() }];
    }));
  };

  const update = trpc.kitchen.updateStatus.useMutation({
    onSuccess: (_result, variables) => {
      setUpdatingOrderId(null);
      snapshots.current.delete(variables.orderId);
      setConfirmedOrderId(variables.orderId);
      toast.success("Order status updated", { description: `${variables.orderId} is now ${variables.status.toLowerCase()}.` });
      void queue.refetch();
      window.setTimeout(() => setConfirmedOrderId((current) => current === variables.orderId ? null : current), 1400);
    },
    onError: (error, variables) => {
      setUpdatingOrderId(null);
      const previous = snapshots.current.get(variables.orderId);
      if (previous) utils.kitchen.queue.setData(undefined, previous);
      snapshots.current.delete(variables.orderId);
      toast.error("Could not update order", { description: error.message });
    },
  });
  const undo = trpc.kitchen.undoStatus.useMutation({
    onSuccess: (_result, variables) => {
      clearUndo();
      setUpdatingOrderId(null);
      snapshots.current.delete(variables.orderId);
      toast.success("Status change undone", { description: `${variables.orderId} returned to the previous queue.` });
      void queue.refetch();
    },
    onError: (error, variables) => {
      setUpdatingOrderId(null);
      const previous = snapshots.current.get(variables.orderId);
      if (previous) utils.kitchen.queue.setData(undefined, previous);
      snapshots.current.delete(variables.orderId);
      toast.error("Undo unavailable", { description: error.message });
    },
  });

  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("ready", () => setConnected(true));
    events.addEventListener("order.created", () => {
      setLastEvent(new Date().toLocaleTimeString());
      void queue.refetch();
      if (alerts) {
        playKitchenChime();
        toast("New paid order received", { description: "Kitchen queue updated in real time." });
        if ("Notification" in window && Notification.permission === "granted") new Notification("CineBites: New paid order", { body: "A new order is ready for the kitchen queue." });
      }
    });
    events.addEventListener("order.statusChanged", () => { setLastEvent(new Date().toLocaleTimeString()); void queue.refetch(); });
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, [alerts, queue.refetch]);

  const grouped = useMemo(() => {
    const filtered = (queue.data ?? [])
      .filter((order) => queueFilter === "all" || order.priority === "HIGH" || minutesAgo(order.createdAt) >= 10)
      .sort((a, b) => queueView === "wait" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : Number(b.priority === "HIGH") - Number(a.priority === "HIGH") || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return Object.fromEntries(columns.map(({ status }) => [status, filtered.filter((order) => order.status === status)]));
  }, [queue.data, queueFilter, queueView]);
  const toggleAlerts = async () => {
    const next = !alerts;
    setAlerts(next);
    const unlocked = await unlockKitchenAudio();
    setAudioUnlocked(unlocked);
    if (next && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    if (next) {
      playKitchenChime();
      toast.success("Kitchen alerts enabled", { description: "Audible chime and browser notifications are active." });
    }
  };
  const submitStatus = (order: KitchenOrder, status: OrderStatus) => {
    const previous = utils.kitchen.queue.getData(undefined);
    snapshots.current.set(order.id, previous);
    setUpdatingOrderId(order.id);
    showUndo({ order, previousStatus: order.status, nextStatus: status });
    moveOptimistically(order.id, status);
    update.mutate({ orderId: order.id, status });
  };
  const submitUndo = () => {
    if (!undoAction) return;
    const action = undoAction;
    const previous = utils.kitchen.queue.getData(undefined);
    snapshots.current.set(action.order.id, previous);
    setUpdatingOrderId(action.order.id);
    if (action.nextStatus === "DELIVERED") utils.kitchen.queue.setData(undefined, (current) => [...(current ?? []), { ...action.order, status: action.previousStatus }]);
    else moveOptimistically(action.order.id, action.previousStatus);
    undo.mutate({ orderId: action.order.id, expectedStatus: action.nextStatus });
  };

  if (loading) return <div className="staff-loading-screen"><span className="button-spinner" /> Checking staff access…</div>;
  if (!user || !hasStaffRole(user.role, ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER"])) {
    return (
      <div className="staff-loading-screen">
        <ShieldAlert size={20} />
        <div>
          <strong>Kitchen access restricted</strong>
          <span>Sign in with an approved cinema staff Google account to view the kitchen queue.</span>
          <div className="mt-3 flex gap-3 text-sm">
            <Link href="/login?redirect=/kitchen" className="text-orange-400 underline">Sign in with Google</Link>
            <Link href="/" className="text-white/60 underline">Return to CineBites</Link>
          </div>
        </div>
      </div>
    );
  }
  return <div className="staff-app"><header className="staff-header"><div className="staff-brand"><div className="staff-brand-mark"><ChefHat size={18} /></div><div><strong>CineBites</strong><span>Kitchen Control</span></div></div><div className="staff-header-center"><span className={`connection-pill ${connected ? "online" : "offline"}`}>{connected ? <Wifi size={13} /> : <WifiOff size={13} />}{connected ? "Live updates on" : "Reconnecting"}</span>{lastEvent && <span className="last-event">Last event {lastEvent}</span>}</div><div className="staff-actions"><button className="staff-icon-button" title="Test alert chime audio" onClick={async () => { const ready = await testKitchenAudio(); setAudioUnlocked(ready); toast.success("Kitchen chime tested", { description: "High-penetration alert chime played." }); }}><Volume2 size={15} /></button><button className={`alert-toggle ${alerts ? "active" : ""}`} onClick={() => void toggleAlerts()}><Bell size={15} /> {alerts ? "Alerts on" : "Alerts off"}</button><span className="staff-user">{user?.name || "Kitchen staff"}</span><button className="staff-icon-button" onClick={() => logout()} aria-label="Sign out"><LogOut size={15} /></button></div></header><main className="kitchen-main"><div className="staff-page-intro"><div><p className="staff-eyebrow">Friday • 07 Sep 2026</p><h1>Service queue</h1><p>Keep the snacks moving. Only paid orders appear here.</p></div><div className="kitchen-summary"><div><strong>{queue.data?.length ?? 0}</strong><span>active orders</span></div><button onClick={() => void queue.refetch()} className="refresh-button"><RefreshCw size={15} /> Refresh</button></div></div>{alerts && !audioUnlocked && <div className="audio-unlock-banner cursor-pointer" onClick={async () => { const ready = await testKitchenAudio(); setAudioUnlocked(ready); toast.success("Kitchen audio active", { description: "Audible chime will ring on every new paid order." }); }} style={{ background: "rgba(249, 115, 22, 0.12)", border: "1px solid rgba(249, 115, 22, 0.3)", borderRadius: "0.75rem", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", color: "#fb923c", fontSize: "0.85rem" }}><div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Volume2 size={16} /><span><strong>Browser audio is sleeping:</strong> Tap or click anywhere to activate kitchen order chime.</span></div><button style={{ background: "#ea580c", color: "#ffffff", border: "none", borderRadius: "0.375rem", padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Tap to Enable Sound</button></div>}<div className="queue-controls"><span className="queue-controls-label">Show</span><button className={queueFilter === "all" ? "selected" : ""} onClick={() => setQueueFilter("all")}>All active</button><button className={queueFilter === "urgent" ? "selected" : ""} onClick={() => setQueueFilter("urgent")}>Urgent / 10m+</button><span className="queue-controls-divider" /><span className="queue-controls-label">Sort</span><button className={queueView === "priority" ? "selected" : ""} onClick={() => setQueueView("priority")}>Priority</button><button className={queueView === "wait" ? "selected" : ""} onClick={() => setQueueView("wait")}>Wait time</button><Link href="/history" className="history-link">Order history</Link></div>{undoAction && <div className="undo-banner"><div><Undo2 size={16} /><span><strong>{undoAction.order.orderNumber}</strong> moved to {undoAction.nextStatus.toLowerCase()}.</span></div><button onClick={submitUndo}>Undo change</button></div>}{queue.error ? <div className="staff-error"><AlertTriangle size={18} /><div><strong>Kitchen queue unavailable</strong><p>{queue.error.message}</p></div><button onClick={() => void queue.refetch()}>Try again</button></div> : <div className="queue-grid">{columns.map((column) => <section className={`queue-column ${column.tone}`} key={column.status}><div className="queue-column-header"><div><span className="queue-kicker">{column.status === "NEW" ? "Incoming" : column.status === "PREPARING" ? "On the line" : "Hand off"}</span><h2>{column.label}</h2></div><span className="queue-count">{grouped[column.status]?.length ?? 0}</span></div><div className="queue-cards">{(grouped[column.status] ?? []).map((order) => <KitchenOrderCard key={order.id} order={order} onAdvance={(status) => submitStatus(order, status)} busy={updatingOrderId === order.id} confirmed={confirmedOrderId === order.id} />)}{!grouped[column.status]?.length && <div className="queue-empty"><Check size={18} /><span>No orders here</span></div>}</div></section>)}</div>}<div className="kitchen-footer"><span><span className="privacy-dot" /> Privacy-safe view</span><span>Kitchen can advance status only • <Link href="/admin">Open admin tools</Link></span></div></main></div>;
}

function KitchenOrderCard({ order, onAdvance, busy, confirmed }: { order: KitchenOrder; onAdvance: (status: OrderStatus) => void; busy: boolean; confirmed: boolean }) {
  const next = ORDER_STATUSES[ORDER_STATUSES.indexOf(order.status) + 1];
  return <article className={`kitchen-order-card ${confirmed ? "status-confirmed" : ""}`}><div className="order-card-top"><div><span className="order-number">{order.orderNumber}</span><span className="payment-chip"><Check size={11} /> Paid</span></div><span className={`age-chip ${minutesAgo(order.createdAt) > 10 ? "urgent" : ""}`}><Clock3 size={12} /> {minutesAgo(order.createdAt)}m</span></div><div className="order-location"><strong>{order.screen}</strong><span>Seat {order.seat}</span></div><div className="order-lines">{order.items.map((item) => <div className="order-line" key={item.id}><span><b>{item.quantity}×</b> {item.name}{item.options.length > 0 && <small> + {item.options.join(", ")}</small>}</span><strong>{rupees(item.pricePaise * item.quantity)}</strong></div>)}</div>{order.instructions && <div className="order-instructions">“{order.instructions}”</div>}<div className="order-verification"><span>Deliver to <strong>{order.customerName}</strong></span><span>•••• {order.phoneLast4}</span></div>{next && <button disabled={busy} onClick={() => onAdvance(next)} className={`advance-button ${busy ? "is-loading" : ""} ${confirmed ? "is-confirmed" : ""}`}>{busy ? <><span className="button-spinner" /> Updating…</> : confirmed ? <><Check size={15} /> Updated</> : <>{order.status === "NEW" ? "Start preparing" : order.status === "PREPARING" ? "Mark ready" : "Mark delivered"}<Check size={15} /></>}</button>}</article>;
}
