export const STAFF_ROLES = ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER", "READ_ONLY"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function normalizeStaffRole(value: unknown): StaffRole {
  if (value === "admin") return "ADMIN";
  return typeof value === "string" && STAFF_ROLES.includes(value as StaffRole) ? value as StaffRole : "READ_ONLY";
}

export function hasStaffRole(value: unknown, allowed: StaffRole[]) {
  return allowed.includes(normalizeStaffRole(value));
}

export const ORDER_STATUSES = ["NEW", "PREPARING", "READY", "DELIVERED", "CANCELED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  pricePaise: number;
  discountPercent?: number;
  description: string;
  available: boolean;
  options: string[];
};

export type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  pricePaise: number;
  originalPricePaise?: number;
  discountPercent?: number;
  options: string[];
};

export type KitchenOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  screen: string;
  seat: string;
  customerName: string;
  customerPhone?: string;
  phoneLast4: string;
  totalPaise: number;
  platformFeePaise?: number;
  items: OrderLine[];
  instructions?: string;
  source: "ONLINE" | "OFFLINE_SMS";
  paymentStatus: "CONFIRMED" | "PENDING" | "FAILED";
  createdAt: string;
  updatedAt: string;
  priority?: "NORMAL" | "HIGH";
};

export const PLATFORM_FEE_PAISE = 1000; // ₹10 platform fee per order

export type DashboardStats = {
  ordersToday: number;
  revenuePaise: number;
  pending: number;
  preparing: number;
  ready: number;
  delivered: number;
  paymentFailures: number;
  popularItem: string;
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  lastSeen?: string;
  invitedAt: string;
};

export type ShiftSummary = {
  shiftLabel: string;
  startedAt: string;
  completedOrders: number;
  canceledOrders: number;
  averagePreparationMinutes: number;
  fastestOrderMinutes: number;
  revenuePaise: number;
};

export type OrderingWindowState = "NOT_STARTED" | "OPEN" | "CUTOFF" | "COOL_DOWN" | "FINISHED";

export function getOrderingWindowState(input: { showDate: string; startTime: string; durationMinutes: number; now?: Date; acceptedOrders?: number; lastAcceptedAt?: Date | string }) {
  const match = input.startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error("Invalid showtime format");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  const hour24 = period === "PM" && hour < 12 ? hour + 12 : period === "AM" && hour === 12 ? 0 : hour;
  const start = new Date(`${input.showDate}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);
  const now = input.now ?? new Date();
  const openAt = start.getTime() + 15 * 60_000;
  const cutoffAt = start.getTime() + (input.durationMinutes - 30) * 60_000;
  const finishAt = start.getTime() + input.durationMinutes * 60_000;
  if (now.getTime() < openAt) return { state: "NOT_STARTED" as const, openAt, cutoffAt, finishAt };
  if (now.getTime() >= finishAt) return { state: "FINISHED" as const, openAt, cutoffAt, finishAt };
  const accepted = input.acceptedOrders ?? 0;
  const lastAccepted = input.lastAcceptedAt ? new Date(input.lastAcceptedAt).getTime() : 0;
  if (accepted > 0 && accepted % 20 === 0 && lastAccepted && now.getTime() < lastAccepted + 15 * 60_000) return { state: "COOL_DOWN" as const, openAt, cutoffAt, finishAt, cooldownUntil: lastAccepted + 15 * 60_000 };
  if (now.getTime() >= cutoffAt) return { state: "CUTOFF" as const, openAt, cutoffAt, finishAt };
  return { state: "OPEN" as const, openAt, cutoffAt, finishAt };
}

export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};

export const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  OWNER_ADMIN: ["kitchen:read", "orders:read", "orders:status", "menu:write", "refunds:write", "staff:write", "analytics:read", "audit:read"],
  ADMIN: ["kitchen:read", "orders:read", "orders:status", "menu:write", "refunds:write", "staff:write", "analytics:read", "audit:read"],
  MANAGER: ["kitchen:read", "orders:read", "orders:status", "menu:write", "analytics:read", "audit:read"],
  KITCHEN: ["kitchen:read", "orders:status"],
  CASHIER: ["orders:read", "orders:status"],
  READ_ONLY: ["orders:read", "analytics:read"],
};

export function can(role: StaffRole, permission: string) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isValidTransition(from: OrderStatus, to: OrderStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
