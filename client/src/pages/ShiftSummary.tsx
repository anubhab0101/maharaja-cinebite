import { Check, Clock3, IndianRupee, TimerReset, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { rupees } from "@shared/cinebites";

export default function ShiftSummary() {
  const { data, isLoading, error } = trpc.admin.shiftSummary.useQuery();
  if (isLoading) return <div className="shift-loading"><span className="button-spinner" /> Loading shift metrics…</div>;
  if (error) return <div className="staff-error"><XCircle size={18} /><div><strong>Shift summary unavailable</strong><p>{error.message}</p></div></div>;
  if (!data) return null;
  const cards = [
    { label: "Completed orders", value: data.completedOrders, detail: "Delivered this shift", icon: Check, tone: "green" },
    { label: "Average prep time", value: `${data.averagePreparationMinutes}m`, detail: "Order created to delivery", icon: Clock3, tone: "violet" },
    { label: "Fastest order", value: `${data.fastestOrderMinutes}m`, detail: "Best completed ticket", icon: TimerReset, tone: "peach" },
    { label: "Shift revenue", value: rupees(data.revenuePaise), detail: `${data.canceledOrders} canceled orders`, icon: IndianRupee, tone: "amber" },
  ];
  return <section className="shift-summary-wrap"><div className="shift-summary-heading"><div><p className="admin-kicker">{data.shiftLabel} • Started {new Date(data.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><h2>Shift performance</h2></div><span className="live-dot-label"><span /> Live from order queue</span></div><div className="shift-stat-grid">{cards.map(({ label, value, detail, icon: Icon, tone }) => <article className={`shift-stat-card ${tone}`} key={label}><div><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small></article>)}</div><div className="shift-callout"><div><strong>Keep the line moving</strong><p>Average preparation time is calculated from payment-confirmed creation to delivery. Use the kitchen wait-time filter to focus on tickets at risk.</p></div><span className="shift-target">Target <strong>≤ 12m</strong></span></div></section>;
}
