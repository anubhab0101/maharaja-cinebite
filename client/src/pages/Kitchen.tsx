import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, Check, ChefHat, Clock3, LogOut, RefreshCw, Search, ShieldAlert, Sparkles, Undo2, UtensilsCrossed, Volume2, Wifi, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { hasStaffRole, KitchenOrder, ORDER_STATUSES, OrderStatus, rupees } from "@shared/cinebites";
import { isAudioReady, playKitchenChime, testKitchenAudio, unlockKitchenAudio } from "@/lib/kitchenAudio";
import StaffThemeToggle, { useStaffTheme } from "@/components/StaffThemeToggle";

const columns: { status: OrderStatus; label: string; tone: string }[] = [
  { status: "NEW", label: "New", tone: "orange" },
  { status: "PREPARING", label: "Preparing", tone: "violet" },
  { status: "READY", label: "Ready for delivery", tone: "green" },
];

type UndoAction = { order: KitchenOrder; previousStatus: OrderStatus; nextStatus: OrderStatus };
function minutesAgo(value: string) { return Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000)); }

export default function Kitchen() {
  const staffTheme = useStaffTheme();
  const { user, logout, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login?redirect=/rasoi" });
  const utils = trpc.useUtils();
  const queue = trpc.kitchen.queue.useQuery(undefined, { refetchInterval: 30000 });
  const menuQuery = trpc.kitchen.menu.useQuery(undefined, { refetchInterval: 15000, refetchOnWindowFocus: true });
  const setAvailability = trpc.kitchen.setAvailability.useMutation({
    onSuccess: (_res, variables) => {
      toast.success(`Item marked as ${variables.available ? "Available" : "Sold Out"}`);
      void menuQuery.refetch();
    },
    onError: (err) => {
      toast.error("Could not update item availability: " + err.message);
    },
  });
  const [showMenuModal, setShowMenuModal] = useState(false);
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

  const topSellingNames = useMemo(() => {
    const counts = new Map<string, number>();
    (queue.data ?? []).forEach((o) => {
      o.items.forEach((line) => {
        counts.set(line.name, (counts.get(line.name) ?? 0) + line.quantity);
      });
    });
    if (counts.size > 0) {
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
    }
    return ["Festival Combo", "Regular Popcorn Combo", "Tub Cheese Popcorn"];
  }, [queue.data]);

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
            <Link href="/login?redirect=/rasoi" className="text-orange-400 underline">Sign in with Google</Link>
            <Link href="/" className="text-white/60 underline">Return to CineBites</Link>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`staff-app ${staffTheme.className}`}>
      <header className="staff-header">
        <div className="staff-brand">
          <div className="staff-brand-mark"><ChefHat size={18} /></div>
          <div>
            <strong>CineBites</strong>
            <span>Kitchen Control</span>
          </div>
        </div>

        <div className="staff-header-center">
          <span className={`connection-pill ${connected ? "online" : "offline"}`}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connected ? "Live updates on" : "Reconnecting"}
          </span>
          {lastEvent && <span className="last-event">Last event {lastEvent}</span>}
        </div>

        <div className="staff-actions">
          <StaffThemeToggle {...staffTheme} />
          <button
            className={`alert-toggle ${showMenuModal ? "active" : ""}`}
            onClick={() => setShowMenuModal(true)}
            title="Manage Menu & Item Availability"
          >
            <UtensilsCrossed size={15} /> Menu Stock
          </button>
          <button
            className="staff-icon-button"
            title="Test alert chime audio"
            onClick={async () => {
              const ready = await testKitchenAudio();
              setAudioUnlocked(ready);
              toast.success("Kitchen chime tested", { description: "High-penetration alert chime played." });
            }}
          >
            <Volume2 size={15} />
          </button>
          <button className={`alert-toggle ${alerts ? "active" : ""}`} onClick={() => void toggleAlerts()}>
            <Bell size={15} /> {alerts ? "Alerts on" : "Alerts off"}
          </button>
          <span className="staff-user">{user?.name || "Kitchen staff"}</span>
          <button className="staff-icon-button" onClick={() => logout()} aria-label="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <main className="kitchen-main">
        <div className="staff-page-intro">
          <div>
            <p className="staff-eyebrow">Friday • 07 Sep 2026</p>
            <h1>Service queue</h1>
            <p>Keep the snacks moving. Only paid orders appear here.</p>
          </div>
          <div className="kitchen-summary">
            <div>
              <strong>{queue.data?.length ?? 0}</strong>
              <span>active orders</span>
            </div>
            <button onClick={() => void queue.refetch()} className="refresh-button">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        {alerts && !audioUnlocked && (
          <div
            className="audio-unlock-banner cursor-pointer"
            onClick={async () => {
              const ready = await testKitchenAudio();
              setAudioUnlocked(ready);
              toast.success("Kitchen audio active", { description: "Audible chime will ring on every new paid order." });
            }}
            style={{
              background: "rgba(249, 115, 22, 0.12)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              borderRadius: "0.75rem",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              color: "#fb923c",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Volume2 size={16} />
              <span><strong>Browser audio is sleeping:</strong> Tap or click anywhere to activate kitchen order chime.</span>
            </div>
            <button
              style={{
                background: "#ea580c",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.375rem",
                padding: "0.3rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Tap to Enable Sound
            </button>
          </div>
        )}

        <div className="queue-controls">
          <span className="queue-controls-label">Show</span>
          <button className={queueFilter === "all" ? "selected" : ""} onClick={() => setQueueFilter("all")}>All active</button>
          <button className={queueFilter === "urgent" ? "selected" : ""} onClick={() => setQueueFilter("urgent")}>Urgent / 10m+</button>
          <span className="queue-controls-divider" />
          <span className="queue-controls-label">Sort</span>
          <button className={queueView === "priority" ? "selected" : ""} onClick={() => setQueueView("priority")}>Priority</button>
          <button className={queueView === "wait" ? "selected" : ""} onClick={() => setQueueView("wait")}>Wait time</button>
          <Link href="/history" className="history-link">Order history</Link>
        </div>

        {undoAction && (
          <div className="undo-banner">
            <div>
              <Undo2 size={16} />
              <span><strong>{undoAction.order.orderNumber}</strong> moved to {undoAction.nextStatus.toLowerCase()}.</span>
            </div>
            <button onClick={submitUndo}>Undo change</button>
          </div>
        )}

        {queue.error ? (
          <div className="staff-error">
            <AlertTriangle size={18} />
            <div>
              <strong>Kitchen queue unavailable</strong>
              <p>{queue.error.message}</p>
            </div>
            <button onClick={() => void queue.refetch()}>Try again</button>
          </div>
        ) : (
          <div className="queue-grid">
            {columns.map((column) => (
              <section className={`queue-column ${column.tone}`} key={column.status}>
                <div className="queue-column-header">
                  <div>
                    <span className="queue-kicker">
                      {column.status === "NEW" ? "Incoming" : column.status === "PREPARING" ? "On the line" : "Hand off"}
                    </span>
                    <h2>{column.label}</h2>
                  </div>
                  <span className="queue-count">{grouped[column.status]?.length ?? 0}</span>
                </div>
                <div className="queue-cards">
                  {(grouped[column.status] ?? []).map((order) => (
                    <KitchenOrderCard
                      key={order.id}
                      order={order}
                      onAdvance={(status) => submitStatus(order, status)}
                      busy={updatingOrderId === order.id}
                      confirmed={confirmedOrderId === order.id}
                    />
                  ))}
                  {!grouped[column.status]?.length && (
                    <div className="queue-empty">
                      <Check size={18} />
                      <span>No orders here</span>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="kitchen-footer">
          <span><span className="privacy-dot" /> Privacy-safe view</span>
          <span>Kitchen can toggle menu stock & advance status • <Link href="/maharaja">Open admin tools</Link></span>
        </div>
      </main>

      {showMenuModal && (
        <KitchenStockModal
          isOpen={showMenuModal}
          onClose={() => setShowMenuModal(false)}
          items={menuQuery.data ?? []}
          isLoading={menuQuery.isLoading}
          error={menuQuery.error?.message}
          onRetry={() => void menuQuery.refetch()}
          topSellingNames={topSellingNames}
          onToggle={(id, available) => {
            setAvailability.mutate({ id, available });
          }}
        />
      )}
    </div>
  );
}

function KitchenStockModal({
  isOpen,
  onClose,
  items,
  isLoading,
  error,
  onRetry,
  topSellingNames,
  onToggle,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: {
    id: string;
    name: string;
    category: string;
    pricePaise: number;
    description: string;
    available: boolean;
    options: string[];
  }[];
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
  topSellingNames: string[];
  onToggle: (id: string, available: boolean) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const categories = ["ALL", "Combos", "Popcorn", "Snacks", "Beverages"];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, selectedCategory, search]);

  const soldOutCount = items.filter((i) => !i.available).length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#121211] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#dedad2]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div>
            <div className="flex items-center gap-2">
              <UtensilsCrossed size={18} className="text-amber-400" />
              <h2 className="text-base font-bold text-white">Kitchen Stock & Menu Availability</h2>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Toggle items as Available or Sold Out. Changes reflect immediately for customers.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar: Category tabs and search */}
        <div className="p-4 border-b border-white/10 space-y-3 bg-white/[0.01]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-0.5">
              {categories.map((cat) => {
                const count = cat === "ALL" ? items.length : items.filter((i) => i.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${
                      isSelected
                        ? "bg-amber-400 text-black font-semibold shadow"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs ml-auto">
              <Search size={13} className="text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search snack..."
                className="bg-transparent border-none outline-none text-white text-xs w-28 sm:w-36 placeholder:text-white/30"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-white/40 hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
            <span>
              Showing {filteredItems.length} of {items.length} items
            </span>
            {soldOutCount > 0 ? (
              <span className="text-rose-400 font-medium">⚠️ {soldOutCount} item(s) marked sold out</span>
            ) : (
              <span className="text-emerald-400 font-medium">✓ All items in stock</span>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[58vh]">
          <button className="underline text-sm text-white/80" onClick={onRetry}>Refresh menu</button>
          {error ? <div role="alert" className="py-6 text-red-200">Menu could not load: {error}. Use Refresh menu to retry.</div> : isLoading ? (
            <div className="py-12 text-center text-white/40 text-xs">
              <span className="button-spinner mr-2" /> Loading menu catalog…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-white/80 text-sm">
              {items.length === 0 ? "No saved menu yet. Ask an admin to open /maharaja → Menu → Load starter menu, or add items. Then refresh this list." : "No items match your search or category. Clear the filters to see all items."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isTopSeller = topSellingNames.includes(item.name);
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl flex items-center justify-between gap-3 transition-all ${
                    isTopSeller
                      ? "border-2 border-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.2)] bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent"
                      : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isTopSeller ? "bg-amber-400 text-black shadow" : "bg-white/10 text-white"
                      }`}
                    >
                      {item.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-semibold truncate text-[#dedad2]">
                          {item.name}
                        </strong>
                        {isTopSeller && (
                          <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black flex items-center gap-1 shadow">
                            <Sparkles size={10} /> Highest Sell
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#85827b] truncate mt-0.5">
                        <span>{item.category}</span> •{" "}
                        <strong className="text-white/80">{rupees(item.pricePaise)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Toggle button */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        item.available
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {item.available ? "Available" : "Sold out"}
                    </span>
                    <button
                      onClick={() => onToggle(item.id, !item.available)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        item.available
                          ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {item.available ? "Mark Sold Out" : "Mark Available"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/50">
          <span>Cinema Kitchen Real-time Control</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function KitchenOrderCard({ order, onAdvance, busy, confirmed }: { order: KitchenOrder; onAdvance: (status: OrderStatus) => void; busy: boolean; confirmed: boolean }) {
  const next = ORDER_STATUSES[ORDER_STATUSES.indexOf(order.status) + 1];
  return <article className={`kitchen-order-card ${confirmed ? "status-confirmed" : ""}`}><div className="order-card-top"><div><span className="order-number">{order.orderNumber}</span><span className="payment-chip"><Check size={11} /> Paid</span></div><span className={`age-chip ${minutesAgo(order.createdAt) > 10 ? "urgent" : ""}`}><Clock3 size={12} /> {minutesAgo(order.createdAt)}m</span></div><div className="order-location"><strong>{order.screen}</strong><span>Seat {order.seat}</span></div><div className="order-lines">{order.items.map((item) => <div className="order-line" key={item.id}><span><b>{item.quantity}×</b> {item.name}{item.options.length > 0 && <small> + {item.options.join(", ")}</small>}</span><strong>{rupees(item.pricePaise * item.quantity)}</strong></div>)}</div>{order.instructions && <div className="order-instructions">“{order.instructions}”</div>}<div className="order-verification"><span>Deliver to <strong>{order.customerName}</strong></span><span>•••• {order.phoneLast4}</span></div>{next && <button disabled={busy} onClick={() => onAdvance(next)} className={`advance-button ${busy ? "is-loading" : ""} ${confirmed ? "is-confirmed" : ""}`}>{busy ? <><span className="button-spinner" /> Updating…</> : confirmed ? <><Check size={15} /> Updated</> : <>{order.status === "NEW" ? "Start preparing" : order.status === "PREPARING" ? "Mark ready" : "Mark delivered"}<Check size={15} /></>}</button>}</article>;
}
