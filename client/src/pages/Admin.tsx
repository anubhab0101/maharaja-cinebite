import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Filter,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasStaffRole, rupees } from "@shared/cinebites";
import ShiftSummary from "@/pages/ShiftSummary";
import StaffManagement from "@/pages/StaffManagement";
import SessionLinks from "@/pages/SessionLinks";
import ShowtimeManager from "@/pages/ShowtimeManager";
import SeatQrGenerator from "@/pages/SeatQrGenerator";
import { PilotOverview, PilotRefunds, PilotSeatSetup } from "@/pages/PilotControls";
import MenuCatalog from "./MenuCatalog";
import StaffThemeToggle, { useStaffTheme } from "@/components/StaffThemeToggle";
import StaffAlerts from "@/components/StaffAlerts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type Tab = "overview" | "shift" | "orders" | "menu" | "refunds" | "staff" | "showtimes" | "sessions" | "seatQrs" | "audit";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "shift", label: "Shift summary", icon: Clock3 },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "menu", label: "Menu", icon: Menu },
  { id: "refunds", label: "Refunds", icon: WalletCards },
  { id: "staff", label: "Staff", icon: Users },
  { id: "sessions", label: "Session Links", icon: Calendar },
  { id: "showtimes", label: "Movies & showtimes", icon: Calendar },
  { id: "seatQrs", label: "Seat QRs", icon: QrCode },
  { id: "audit", label: "Audit log", icon: ShieldCheck },
];

export default function Admin() {
  const staffTheme = useStaffTheme();
  const { user, logout, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const stats = trpc.admin.stats.useQuery();
  const orders = trpc.admin.orders.useQuery();
  const menu = trpc.admin.menu.useQuery();
  const audit = trpc.admin.audit.useQuery();

  const availability = trpc.admin.setAvailability.useMutation({
    onSuccess: () => {
      menu.refetch();
      toast.success("Item availability updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const refund = trpc.admin.refundPreview.useMutation({
    onSuccess: () =>
      toast("Refund request logged for review", { description: "Provider execution remains admin-controlled." }),
  });

  const deleteOrderMutation = trpc.admin.deleteOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`Order ${data.orderNumber} deleted permanently from database.`);
      void orders.refetch();
      void stats.refetch();
    },
    onError: (error) => toast.error(error.message || "Failed to delete order"),
  });

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(new Date());

  if (loading) {
    return (
      <div className="staff-loading-screen staff-light">
        <span className="button-spinner" /> Checking admin access…
      </div>
    );
  }

  if (!user || !hasStaffRole(user.role, ["OWNER_ADMIN", "ADMIN", "MANAGER"])) {
    return (
      <div className="staff-loading-screen staff-light">
        <ShieldAlert size={20} />
        <div>
          <strong>Admin access restricted</strong>
          <span>Your account does not have admin privileges.</span>
          <div className="mt-3 flex gap-3 text-sm">
            <Link href="/login" className="text-orange-400 underline">
              Sign in with Admin Google Account
            </Link>
            <Link href="/rasoi" className="text-white/60 underline">
              Kitchen view
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-app ${staffTheme.className}`}>
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <img
            src="/logo.png"
            alt="CineBites Logo"
            className="h-9 w-9 rounded-full object-cover border border-amber-500/40 shadow-md shadow-amber-500/20"
          />
          <div>
            <strong>
              cine<span>bites</span>
            </strong>
            <small>Admin Console</small>
          </div>
        </div>
        <div className="admin-nav-label">Manage</div>
        <nav>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`admin-nav-item ${tab === id ? "active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-live">
            <span /> Service live
          </div>
          <Link href="/rasoi" className="kitchen-link">
            Open kitchen view <ChevronDown size={14} />
          </Link>
          <button className="admin-user" onClick={() => logout()}>
            <span className="avatar-circle">{user?.name?.charAt(0) || "A"}</span>
            <span>
              <strong>{user?.name || "Owner Admin"}</strong>
              <small>Owner admin</small>
            </span>
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">Bhubaneswar • Screen service</p>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div className="admin-top-actions">
            <StaffThemeToggle {...staffTheme} />
            <span className="admin-date">{today}</span>
            <button
              className="refresh-button"
              onClick={() => {
                stats.refetch();
                orders.refetch();
                menu.refetch();
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        <StaffAlerts />
        {tab === "overview" && <PilotOverview />}
        {tab === "shift" && <ShiftSummary />}
        {tab === "orders" && (
          <OrdersTable
            orders={orders.data ?? []}
            onRefund={(orderId, amount) =>
              refund.mutate({ orderId, amountPaise: amount, reason: "Exceptional refund review" })
            }
            onDelete={async (orderId, developerCode) => {
              await deleteOrderMutation.mutateAsync({ orderId, developerCode });
            }}
            isDeleting={deleteOrderMutation.isPending}
          />
        )}
        {tab === "menu" && (
          <MenuCatalog />
        )}
        {tab === "refunds" && <PilotRefunds />}
        {tab === "staff" && <StaffManagement />}
        {tab === "sessions" && <><p className="mb-4 text-sm text-white/80">For permanent armrest stickers, use Seat QRs. These session links are optional, temporary links for a particular show. Manage the schedule in Movies &amp; showtimes.</p><SessionLinks /></>}
        {tab === "showtimes" && <ShowtimeManager />}
        {tab === "seatQrs" && <><SeatQrGenerator /><details className="print:hidden mt-6"><summary className="cursor-pointer text-sm text-white/70">Advanced: add seat codes manually</summary><PilotSeatSetup /></details></>}
        {tab === "audit" && <Audit logs={audit.data ?? []} />}
      </main>
      <nav className="mobile-staff-nav print:hidden" aria-label="Mobile cinema management">
        {tabs.filter(item => ['overview', 'orders', 'menu', 'showtimes'].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}><Icon size={20} /><span>{id === 'showtimes' ? 'Shows' : label}</span></button>)}
        <Sheet open={mobileMenu} onOpenChange={setMobileMenu}>
          <SheetTrigger asChild><button><MoreHorizontal size={20} /><span>More</span></button></SheetTrigger>
          <SheetContent side="bottom" className={`mobile-staff-sheet ${staffTheme.className}`}>
            <SheetHeader><SheetTitle>Cinema management</SheetTitle><SheetDescription>All tools for your shift</SheetDescription></SheetHeader>
            <nav aria-label="All management tools">{tabs.map(({ id, label }) => <Button variant="outline" key={id} onClick={() => { setTab(id); setMobileMenu(false); window.scrollTo({ top: 0 }); }}>{label}</Button>)}</nav>
            <Link href="/rasoi">Open reception & kitchen queue</Link>
            <Button variant="outline" onClick={() => logout()}>Sign out</Button>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}

function Overview({
  stats,
  orders,
}: {
  stats?: {
    ordersToday: number;
    revenuePaise: number;
    pending: number;
    preparing: number;
    ready: number;
    delivered: number;
    paymentFailures: number;
    popularItem: string;
  };
  orders?: {
    id: string;
    orderNumber: string;
    status: string;
    screen: string;
    seat: string;
    customerName: string;
    totalPaise: number;
    paymentStatus?: string;
    createdAt: string;
    items?: { id: string; name: string; quantity: number }[];
  }[];
}) {
  const cards = [
    {
      label: "Revenue today",
      value: stats ? rupees(stats.revenuePaise) : "—",
      icon: IndianRupee,
      tone: "peach",
      subtext: stats?.revenuePaise ? `${stats.ordersToday} paid orders today` : "No sales yet today",
    },
    {
      label: "Orders today",
      value: stats?.ordersToday ?? "—",
      icon: ClipboardList,
      tone: "violet",
      subtext: stats?.delivered ? `${stats.delivered} delivered to seats` : "0 delivered so far",
    },
    {
      label: "In kitchen",
      value: stats ? stats.pending + stats.preparing : "—",
      icon: ChefIcon,
      tone: "green",
      subtext: "Live from kitchen queue",
    },
    {
      label: "Ready to deliver",
      value: stats?.ready ?? "—",
      icon: Check,
      tone: "amber",
      subtext: "Awaiting runner delivery",
    },
  ];

  // Calculate real hourly distribution for today's orders
  const todayStr = new Date().toDateString();
  const todayOrders = useMemo(() => {
    return (orders ?? []).filter(
      (o) => new Date(o.createdAt).toDateString() === todayStr && o.paymentStatus !== "FAILED"
    );
  }, [orders, todayStr]);

  const slots = [
    { label: "10 AM", start: 10, end: 12 },
    { label: "12 PM", start: 12, end: 14 },
    { label: "2 PM", start: 14, end: 16 },
    { label: "4 PM", start: 16, end: 18 },
    { label: "6 PM", start: 18, end: 20 },
    { label: "8 PM", start: 20, end: 22 },
    { label: "Now", start: 22, end: 24 },
  ];

  const slotCounts = slots.map((slot) => {
    return todayOrders.filter((o) => {
      const h = new Date(o.createdAt).getHours();
      return h >= slot.start && h < slot.end;
    }).length;
  });

  const maxSlotCount = Math.max(...slotCounts, 1);
  const hasOrdersToday = todayOrders.length > 0;

  // Calculate real popular items from orders
  const itemRankings = useMemo(() => {
    const counts = new Map<string, number>();
    (orders ?? []).forEach((o) => {
      if (o.paymentStatus === "CONFIRMED") {
        o.items?.forEach((it) => {
          counts.set(it.name, (counts.get(it.name) ?? 0) + it.quantity);
        });
      }
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const topItems = itemRankings.slice(0, 3);
  const maxPopularCount = topItems.length > 0 ? topItems[0].count : 1;

  return (
    <>
      <div className="stat-grid">
        {cards.map(({ label, value, icon: Icon, tone, subtext }) => (
          <div className={`stat-card ${tone}`} key={label}>
            <div className="stat-card-top">
              <span>{label}</span>
              <Icon size={16} />
            </div>
            <strong>{value}</strong>
            <small>{subtext}</small>
          </div>
        ))}
      </div>

      <div className="admin-grid-two">
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="admin-kicker">Live operations</p>
              <h2>Order flow today</h2>
            </div>
            <span className="live-dot-label">
              <span /> Live
            </span>
          </div>

          {!hasOrdersToday ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-white/40">
              <Clock3 size={28} className="mb-2 text-white/20" />
              <p className="text-xs font-medium text-white/60">No orders recorded yet today</p>
              <span className="text-[11px] text-white/30 mt-1 max-w-xs">
                Real-time hourly volume will automatically populate as seats place snack orders.
              </span>
            </div>
          ) : (
            <div className="flow-chart">
              <div className="chart-bar">
                {slotCounts.map((count, idx) => (
                  <span
                    key={idx}
                    title={`${slots[idx].label}: ${count} orders`}
                    style={{
                      height: count > 0 ? `${Math.max(14, Math.round((count / maxSlotCount) * 100))}%` : "4px",
                      opacity: count > 0 ? 1 : 0.25,
                    }}
                  />
                ))}
              </div>
              <div className="chart-labels">
                {slots.map((s) => (
                  <span key={s.label}>{s.label}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="admin-kicker">Top performer</p>
              <h2>Popular items</h2>
            </div>
            <BarChart3 size={18} className="panel-muted" />
          </div>

          {topItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-white/40">
              <Sparkles size={28} className="mb-2 text-amber-400/40" />
              <p className="text-xs font-medium text-white/60">No item sales recorded yet</p>
              <span className="text-[11px] text-white/30 mt-1 max-w-xs">
                Highest selling snacks and combos will be ranked here with live quantities.
              </span>
            </div>
          ) : (
            <div className="popular-list space-y-2.5">
              {topItems.map((item, idx) => {
                const rankStr = `0${idx + 1}`;
                const progressPct = `${Math.round((item.count / maxPopularCount) * 100)}%`;
                const isFirst = idx === 0;

                return (
                  <div
                    key={item.name}
                    className={`popular-row p-2.5 rounded-xl transition-all ${
                      isFirst
                        ? "border-2 border-amber-400 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                        : "border border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    <span className={`popular-rank ${isFirst ? "text-amber-400 font-bold" : ""}`}>
                      {rankStr}
                    </span>
                    <div className="popular-main">
                      <div className="flex items-center gap-2">
                        <strong>{item.name}</strong>
                        {isFirst && (
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-400 text-black flex items-center gap-1 shadow">
                            <Sparkles size={10} /> Highest Sell
                          </span>
                        )}
                      </div>
                      <div className="popular-progress mt-1">
                        <span
                          style={{
                            width: progressPct,
                            background: isFirst ? "#f59e0b" : "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                    <span className="font-mono text-xs text-white/80">{item.count} sold</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="admin-panel recent-panel">
        <div className="panel-heading">
          <div>
            <p className="admin-kicker">Latest activity</p>
            <h2>Recent orders</h2>
          </div>
          <button onClick={() => toast("Full order history is available in Orders tab")}>
            View all <ChevronDown size={14} />
          </button>
        </div>
        <div className="recent-list">
          {(orders ?? []).slice(0, 5).map((order) => (
            <div className="recent-row" key={order.id}>
              <span className="recent-order-number">{order.orderNumber}</span>
              <span>
                {order.customerName} • {order.screen} {order.seat}
              </span>
              <span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span>
              <strong>{rupees(order.totalPaise)}</strong>
            </div>
          ))}
          {(!orders || orders.length === 0) && (
            <p className="py-6 text-center text-xs text-white/40">No orders placed yet.</p>
          )}
        </div>
      </section>
    </>
  );
}

function ChefIcon() {
  return <span className="chef-icon">⌁</span>;
}

function OrdersTable({
  orders,
  onRefund,
  onDelete,
  isDeleting,
}: {
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    screen: string;
    seat: string;
    customerName: string;
    phoneLast4: string;
    totalPaise: number;
    source: string;
    paymentStatus: string;
    createdAt: string;
  }[];
  onRefund: (id: string, amount: number) => void;
  onDelete?: (orderId: string, developerCode: string) => Promise<void>;
  isDeleting?: boolean;
}) {
  const [dateRange, setDateRange] = useState<"all" | "today" | "yesterday" | "7days" | "custom">("today");
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Delete modal state
  const [orderToDelete, setOrderToDelete] = useState<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalPaise: number;
    screen: string;
    seat: string;
  } | null>(null);
  const [developerCode, setDeveloperCode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  // Filter orders reactively
  const filteredOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(today);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(today);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      const orderDateStr = orderDate.toISOString().slice(0, 10);

      // Date filtering
      if (dateRange === "today") {
        if (orderDate < today) return false;
      } else if (dateRange === "yesterday") {
        if (orderDate < yesterdayStart || orderDate >= yesterdayEnd) return false;
      } else if (dateRange === "7days") {
        if (orderDate < sevenDaysAgo) return false;
      } else if (dateRange === "custom") {
        if (orderDateStr !== customDate) return false;
      }

      // Status filtering
      if (statusFilter !== "ALL" && order.status !== statusFilter) {
        return false;
      }

      // Search filtering
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          order.orderNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q) ||
          order.screen.toLowerCase().includes(q) ||
          order.seat.toLowerCase().includes(q) ||
          order.phoneLast4.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [orders, dateRange, customDate, statusFilter, search]);

  const totalSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + o.totalPaise, 0);
  }, [filteredOrders]);

  const dateLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    "7days": "Last 7 Days",
    all: "All Dates",
    custom: customDate ? `Date: ${customDate}` : "Specific Date",
  };

  return (
    <section className="admin-panel table-panel">
      <div className="table-toolbar flex-wrap gap-3 pb-3 border-b border-white/10">
        <div>
          <p className="admin-kicker">Order tracking & history</p>
          <h2>All orders</h2>
        </div>

        {/* Interactive Filters Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs">
            <Search size={13} className="text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search #, seat, name..."
              className="bg-transparent border-none outline-none text-white text-xs w-36 placeholder:text-white/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-white/40 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Date Selector Dropdown */}
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => {
                const val = e.target.value as any;
                setDateRange(val);
                if (val === "custom") setShowDatePicker(true);
                else setShowDatePicker(false);
              }}
              className="bg-[#141414] border border-white/15 hover:border-amber-400/50 text-[#dedad2] text-xs font-medium rounded-lg px-2.5 py-1.5 cursor-pointer outline-none transition shadow"
            >
              <option value="today">📅 Today</option>
              <option value="yesterday">📅 Yesterday</option>
              <option value="7days">📅 Last 7 Days</option>
              <option value="all">📅 All Dates</option>
              <option value="custom">📅 Specific Date...</option>
            </select>
          </div>

          {/* Custom Date Input (shown when Specific Date is selected) */}
          {dateRange === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-[#141414] border border-amber-500/50 text-amber-300 text-xs rounded-lg px-2 py-1 outline-none font-mono"
            />
          )}

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#141414] border border-white/15 hover:border-amber-400/50 text-[#dedad2] text-xs font-medium rounded-lg px-2.5 py-1.5 cursor-pointer outline-none transition shadow"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New (Unprepared)</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>
      </div>

      {/* Filter Summary Bar */}
      <div className="flex items-center justify-between text-xs text-white/50 px-1 pt-2 pb-1">
        <span>
          Showing <strong>{filteredOrders.length}</strong> of {orders.length} orders (
          {dateLabels[dateRange]})
        </span>
        <span>
          Filtered Revenue: <strong className="text-amber-400 font-mono">{rupees(totalSales)}</strong>
        </span>
      </div>

      <div className="data-table-wrap mt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer / seat</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.orderNumber}</strong>
                  <small>
                    {new Date(order.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} •{" "}
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </small>
                </td>
                <td>
                  <strong>{order.customerName}</strong>
                  <small>
                    {order.screen} • {order.seat} • •••• {order.phoneLast4}
                  </small>
                </td>
                <td>
                  <span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span>
                </td>
                <td>
                  <span className="paid-label">
                    <Check size={12} /> {order.paymentStatus}
                  </span>
                </td>
                <td>
                  <strong>{rupees(order.totalPaise)}</strong>
                  <small>{order.source}</small>
                </td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="row-menu"
                      onClick={() => onRefund(order.id, order.totalPaise)}
                      title="Log refund review"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    <button
                      className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/20 transition"
                      onClick={() => {
                        setOrderToDelete({
                          id: order.id,
                          orderNumber: order.orderNumber,
                          customerName: order.customerName,
                          totalPaise: order.totalPaise,
                          screen: order.screen,
                          seat: order.seat,
                        });
                        setDeveloperCode("");
                        setDeleteError(null);
                        setShowCode(false);
                      }}
                      title="Delete order from database (Developer code required)"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-white/40 text-xs">
                  No orders found for the selected {dateLabels[dateRange].toLowerCase()} and filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Developer Authorization Delete Modal */}
      {orderToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => {
            if (!isDeleting) {
              setOrderToDelete(null);
              setDeveloperCode("");
              setDeleteError(null);
            }
          }}
        >
          <div
            className="bg-[#141413] border border-rose-500/30 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-[#dedad2]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Order from Database</h3>
                  <p className="text-xs text-rose-400/80">Developer authorization code required</p>
                </div>
              </div>
              <button
                disabled={isDeleting}
                onClick={() => {
                  setOrderToDelete(null);
                  setDeveloperCode("");
                  setDeleteError(null);
                }}
                className="text-white/40 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-white/50">Order Number</span>
                <strong className="text-amber-400 font-mono font-semibold">{orderToDelete.orderNumber}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50">Customer</span>
                <strong className="text-white">{orderToDelete.customerName}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50">Seat / Screen</span>
                <span className="text-white/80">{orderToDelete.screen} • {orderToDelete.seat}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-white/5">
                <span className="text-white/50">Total Amount</span>
                <strong className="text-white font-semibold">{rupees(orderToDelete.totalPaise)}</strong>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200/90 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> This permanently wipes this order and its payments from the database. This action cannot be reversed.
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                  <KeyRound size={13} className="text-amber-400" />
                  <span>Developer Authorization Code:</span>
                </label>
                <span className="text-[11px] text-white/40">Enter code provided by developer</span>
              </div>
              <div className="relative">
                <input
                  type={showCode ? "text" : "password"}
                  value={developerCode}
                  onChange={(e) => {
                    setDeveloperCode(e.target.value);
                    setDeleteError(null);
                  }}
                  placeholder="Enter developer authorization code..."
                  className="w-full bg-black/50 border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-rose-500 transition pr-12 font-mono tracking-wider"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs font-medium"
                >
                  {showCode ? "Hide" : "Show"}
                </button>
              </div>
              {deleteError && (
                <p className="text-xs text-rose-400 font-semibold mt-1">⚠️ {deleteError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setOrderToDelete(null);
                  setDeveloperCode("");
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || !developerCode.trim()}
                onClick={async () => {
                  if (!developerCode.trim()) {
                    setDeleteError("Developer authorization code is required.");
                    return;
                  }
                  if (onDelete && orderToDelete) {
                    try {
                      await onDelete(orderToDelete.id, developerCode.trim());
                      setOrderToDelete(null);
                      setDeveloperCode("");
                      setDeleteError(null);
                    } catch (err: any) {
                      setDeleteError(err.message || "Invalid developer authorization code. Access denied.");
                    }
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isDeleting ? (
                  <>
                    <span className="button-spinner" />
                    <span>Deleting from database…</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Authorize & Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MenuManager({
  items,
  orders,
  onToggle,
}: {
  items: {
    id: string;
    name: string;
    category: string;
    pricePaise: number;
    description: string;
    available: boolean;
    options: string[];
  }[];
  orders?: { paymentStatus?: string; items?: { name: string; quantity: number }[] }[];
  onToggle: (id: string, available: boolean) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Determine top selling items from real order history (or default popular items)
  const topSellingNames = useMemo(() => {
    const counts = new Map<string, number>();
    (orders ?? []).forEach((o) => {
      if (o.paymentStatus === "CONFIRMED") {
        o.items?.forEach((line) => {
          counts.set(line.name, (counts.get(line.name) ?? 0) + line.quantity);
        });
      }
    });

    if (counts.size > 0) {
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
    }

    // Default top favorites
    return ["Festival Combo", "Regular Popcorn Combo", "Tub Cheese Popcorn"];
  }, [orders]);

  const categories = ["ALL", "Combos", "Popcorn", "Snacks", "Beverages"];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, selectedCategory, search]);

  return (
    <section className="admin-panel table-panel">
      <div className="table-toolbar flex-wrap gap-3 pb-3 border-b border-white/10">
        <div>
          <p className="admin-kicker">Catalog & Availability</p>
          <h2>Menu availability ({items.length} items)</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs">
            <Search size={13} className="text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item..."
              className="bg-transparent border-none outline-none text-white text-xs w-32 placeholder:text-white/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-white/40 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          <button
            className="primary-small"
            onClick={() => toast("Menu item editor is ready for the next catalog import")}
          >
            + Add menu item
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 pt-3 pb-2 overflow-x-auto text-xs">
        {categories.map((cat) => {
          const count = cat === "ALL" ? items.length : items.filter((i) => i.category === cat).length;
          const isSelected = selectedCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                isSelected
                  ? "bg-amber-400 text-black shadow-md font-semibold"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      <div className="menu-manage-list space-y-2 mt-3">
        {filteredItems.map((item) => {
          const isTopSeller = topSellingNames.includes(item.name);

          return (
            <div
              className={`menu-manage-row rounded-xl p-3 flex items-center justify-between transition-all ${
                isTopSeller
                  ? "border-2 border-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.2)] bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent"
                  : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
              key={item.id}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`menu-thumb shrink-0 h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                    isTopSeller
                      ? "bg-amber-400 text-black shadow"
                      : "bg-white/10 text-white"
                  }`}
                >
                  {item.name.slice(0, 1)}
                </div>
                <div className="menu-manage-copy min-w-0">
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
                  <span className="text-xs text-[#85827b] block truncate mt-0.5">
                    {item.category} • <strong className="text-white/90">{rupees(item.pricePaise)}</strong> •{" "}
                    {item.description || `${item.options.length} add-ons`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`availability-label text-xs font-semibold px-2.5 py-1 rounded-full ${
                    item.available
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}
                >
                  {item.available ? "Available" : "Sold out"}
                </span>
                <button
                  onClick={() => onToggle(item.id, !item.available)}
                  className="toggle-button text-white/80 hover:text-white transition"
                  aria-label={`Toggle ${item.name}`}
                  title={item.available ? "Click to mark Sold Out" : "Click to mark Available"}
                >
                  {item.available ? (
                    <ToggleRight size={28} className="text-emerald-400" />
                  ) : (
                    <ToggleLeft size={28} className="text-red-400" />
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="py-12 text-center text-white/40 text-xs">
            No items found matching &quot;{search}&quot; in {selectedCategory}.
          </div>
        )}
      </div>
    </section>
  );
}

function Refunds() {
  return (
    <section className="admin-panel empty-admin-panel">
      <div className="empty-admin-icon">
        <WalletCards size={22} />
      </div>
      <p className="admin-kicker">Exceptional only</p>
      <h2>Refund approvals</h2>
      <p>
        Refunds never start in the kitchen. They are reviewed here by Admin, recorded with a reason, and
        matched to a provider refund ID.
      </p>
      <button
        className="secondary-admin-button"
        onClick={() => toast("Select an order from Orders tab to create a refund review")}
      >
        Review an order <ChevronDown size={14} />
      </button>
    </section>
  );
}

function Staff() {
  return (
    <section className="admin-panel empty-admin-panel">
      <div className="empty-admin-icon">
        <Users size={22} />
      </div>
      <p className="admin-kicker">Access control</p>
      <h2>Staff & devices</h2>
      <p>
        Individual staff accounts, role-based access, approved devices, daily PINs, and 2FA-ready metadata live here.
      </p>
      <div className="role-list">
        <span>OWNER_ADMIN</span>
        <span>ADMIN</span>
        <span>MANAGER</span>
        <span>KITCHEN</span>
        <span>CASHIER</span>
        <span>READ_ONLY</span>
      </div>
      <button
        className="secondary-admin-button"
        onClick={() => toast("Staff invitation flow is ready for provider setup")}
      >
        Invite staff member <ChevronDown size={14} />
      </button>
    </section>
  );
}

function Audit({ logs }: { logs: { id: string; action: string; detail: string; actor: string; createdAt: string }[] }) {
  return (
    <section className="admin-panel table-panel">
      <div className="table-toolbar">
        <div>
          <p className="admin-kicker">Sensitive actions</p>
          <h2>Audit log</h2>
        </div>
        <span className="audit-safe">
          <ShieldCheck size={14} /> Redacted by default
        </span>
      </div>
      <div className="audit-list">
        {logs.map((log) => (
          <div className="audit-row" key={log.id}>
            <span className="audit-icon">
              <ShieldCheck size={13} />
            </span>
            <div>
              <strong>{log.action}</strong>
              <p>{log.detail}</p>
            </div>
            <span className="audit-meta">
              {log.actor}
              <br />
              {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
