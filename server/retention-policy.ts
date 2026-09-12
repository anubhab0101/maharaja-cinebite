// Pilot safeguard, informed by DPDP Rules 2025, rule 8(3). This is not a
// determination that all legal retention ends after one year.
export function retentionDueAt(dates: Date[]) {
  if (!dates.length || dates.some(date => !Number.isFinite(date.getTime()))) throw new Error("Missing or invalid processing date");
  const due = new Date(Math.max(...dates.map(date => date.getTime())));
  // Conservative leap-day handling: Feb 29 rolls to March 1 next year.
  due.setUTCFullYear(due.getUTCFullYear() + 1);
  return due;
}

export function retentionDecision(input: { status: string; paymentStatus: string; refundCount: number; hasSnapshot: boolean; dates: Date[] }, now = new Date()) {
  const dueAt = retentionDueAt(input.dates);
  const reasons: string[] = [];
  if (!input.hasSnapshot) reasons.push("Legacy record needs manual mapping");
  if (input.status !== "DELIVERED") reasons.push("Order is not completed");
  if (input.paymentStatus !== "CONFIRMED") reasons.push("Payment is unresolved");
  if (input.refundCount) reasons.push("Refund records require separate retention/dispute review");
  if (now < dueAt) reasons.push("One-year minimum has not elapsed since the latest recorded processing event");
  return { eligibleForReview: reasons.length === 0, dueAt: dueAt.toISOString(), reasons };
}
