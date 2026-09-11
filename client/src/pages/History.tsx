import { useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Check, ChevronDown, Clock3, Search, ShieldAlert, XCircle } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasStaffRole, rupees } from "@shared/cinebites";

type HistoryStatus = "ALL" | "DELIVERED" | "CANCELED";
type HistorySort = "newest" | "oldest" | "value";

export default function History() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login?redirect=/history" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HistoryStatus>("ALL");
  const [sort, setSort] = useState<HistorySort>("newest");
  const input = useMemo(() => ({ search: search || undefined, status, sort }), [search, status, sort]);
  const history = trpc.kitchen.history.useQuery(input, { enabled: Boolean(user) });
  if (loading) return <div className="staff-loading-screen"><span className="button-spinner" /> Checking staff access…</div>;
  if (!user || !hasStaffRole(user.role, ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER", "READ_ONLY"])) {
    return (
      <div className="staff-loading-screen">
        <ShieldAlert size={20} />
        <div>
          <strong>Staff access restricted</strong>
          <span>Sign in with an approved staff Google account to view order history.</span>
          <div className="mt-3 flex gap-3 text-sm">
            <Link href="/login?redirect=/history" className="text-orange-400 underline">Sign in with Google</Link>
            <Link href="/" className="text-white/60 underline">Return to CineBites</Link>
          </div>
        </div>
      </div>
    );
  }
  return <div className="staff-app"><header className="staff-header"><div className="staff-brand"><Link href="/kitchen" className="history-back"><ArrowLeft size={16} /></Link><div className="staff-brand-mark"><CalendarClock size={18} /></div><div><strong>CineBites</strong><span>Order History</span></div></div><div className="staff-actions"><span className="staff-user">{user.name || "Staff"}</span></div></header><main className="history-main"><div className="staff-page-intro"><div><p className="staff-eyebrow">Previous shifts • Privacy-safe</p><h1>Order history</h1><p>Search completed and canceled orders for reconciliation, handoff, and support.</p></div><Link href="/kitchen" className="back-kitchen-link">Back to kitchen <ArrowLeft size={14} /></Link></div><section className="history-panel"><div className="history-toolbar"><label className="history-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, screen, or seat" /></label><div className="history-selects"><label>Show<select value={status} onChange={(event) => setStatus(event.target.value as HistoryStatus)}><option value="ALL">All outcomes</option><option value="DELIVERED">Delivered</option><option value="CANCELED">Canceled</option></select><ChevronDown size={13} /></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as HistorySort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="value">Highest value</option></select><ChevronDown size={13} /></label></div></div><div className="history-count">{history.data?.length ?? 0} records found</div>{history.error ? <div className="staff-error"><ShieldAlert size={18} /><div><strong>History unavailable</strong><p>{history.error.message}</p></div></div> : <div className="history-list">{(history.data ?? []).map((order) => <article className="history-row" key={order.id}><div className={`history-status-icon ${order.status.toLowerCase()}`}>{order.status === "DELIVERED" ? <Check size={16} /> : <XCircle size={16} />}</div><div className="history-order"><strong>{order.orderNumber}</strong><span>{order.customerName} • {order.screen} {order.seat}</span></div><div className="history-meta"><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</span><small>•••• {order.phoneLast4} • {order.source}</small></div><div className="history-time"><span><Clock3 size={12} /> {new Date(order.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span><strong>{rupees(order.totalPaise)}</strong><em className={`history-status ${order.status.toLowerCase()}`}>{order.status}</em></div></article>)}{!history.data?.length && <div className="history-empty"><Search size={20} /><strong>No matching orders</strong><span>Try a different search or outcome filter.</span></div>}</div>}</section></main></div>;
}
