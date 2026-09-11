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

export function getActiveOrder(): SavedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.orderNumber === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveOrder(order: SavedOrder): void {
  if (typeof window === "undefined") return;
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
