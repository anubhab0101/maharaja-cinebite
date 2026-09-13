// CineBites Client Order Storage
// Persists active cinema orders in localStorage so customers never lose their order status

export interface SavedOrder {
  orderNumber: string;
  phoneLast4: string;
  screen: string;
  seat: string;
  customerName?: string;
  totalPaise?: number;
  createdAt: string;
}

const ACTIVE_ORDER_KEY = "cinebites_active_order";
const ORDER_HISTORY_KEY = "cinebites_order_history";
const DISMISSED_ORDER_KEY = "cinebites_dismissed_orders";

function dismissedOrders(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_ORDER_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export function isOrderDismissed(orderNumber: string): boolean {
  return dismissedOrders().includes(orderNumber);
}

export function dismissOrderTracking(orderNumber: string): void {
  try {
    const dismissed = [orderNumber, ...dismissedOrders().filter(value => value !== orderNumber)].slice(0, 20);
    localStorage.setItem(DISMISSED_ORDER_KEY, JSON.stringify(dismissed));
  } catch { /* The current screen still dismisses when storage is unavailable. */ }
  const active = getActiveOrder();
  if (!active || active.orderNumber === orderNumber) clearActiveOrder();
  try {
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(getOrderHistory().filter(order => order.orderNumber !== orderNumber)));
  } catch {}
}

export function getActiveOrder(): SavedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.orderNumber === "string" && !isOrderDismissed(parsed.orderNumber)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveOrder(order: SavedOrder): void {
  if (typeof window === "undefined") return;
  if (isOrderDismissed(order.orderNumber)) return;
  try {
    localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(order));
    const history = getOrderHistory();
    const filtered = history.filter((item) => item.orderNumber !== order.orderNumber);
    const updated = [order, ...filtered].slice(0, 10);
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to persist order in localStorage:", err);
  }
}

export function clearActiveOrder(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_ORDER_KEY);
  } catch {}
}

export function getOrderHistory(): SavedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}
