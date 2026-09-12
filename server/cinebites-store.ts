import { randomUUID } from "crypto";
import {
  DashboardStats,
  KitchenOrder,
  MenuItem,
  OrderLine,
  OrderStatus,
  PLATFORM_FEE_PAISE,
  ShiftSummary,
  StaffMember,
  StaffRole,
  isValidTransition,
} from "@shared/cinebites";
import { getDb } from "./db";
import {
  orders as ordersTable,
  payments as paymentsTable,
  auditLogs as auditLogsTable,
  orderItems,
  refunds,
  consentRecords,
} from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  // --- COMBOS (7 items) ---
  { id: "festival-combo", name: "Festival Combo", description: "Large Popcorn + Cold Drink 300ml", pricePaise: 11700, category: "Combos", available: true, options: ["Regular Salted", "Cheese", "Caramel"] },
  { id: "maharaja-combo", name: "Maharaja Combo", description: "Regular Popcorn + Wafers + Paneer Puff + Cold Drink 300ml", pricePaise: 16000, category: "Combos", available: true, options: [] },
  { id: "puff-combo", name: "Puff Combo", description: "Veg Puff + Cold Drink 300ml", pricePaise: 8000, category: "Combos", available: true, options: [] },
  { id: "regular-popcorn-combo", name: "Regular Popcorn Combo", description: "Regular Popcorn + Cold Drink 300ml", pricePaise: 8500, category: "Combos", available: true, options: [] },
  { id: "nachos-combo", name: "Nachos Combo", description: "Nachos with Salsa + Cold Drink 300ml", pricePaise: 10000, category: "Combos", available: true, options: ["Extra Salsa", "Cheese Dip"] },
  { id: "sweet-corn-coke", name: "Sweet corn + Coke 300ml", description: "Sweet corn + Coke 300ml", pricePaise: 9000, category: "Combos", available: true, options: ["Butter", "Peri Peri"] },
  { id: "momos-combo", name: "Momos Combo", description: "Panner Momos 8N + Cold Drink 300ml", pricePaise: 14000, category: "Combos", available: true, options: ["Spicy Chutney"] },

  // --- POPCORN (5 items) ---
  { id: "regular-popcorn", name: "Regular Popcorn", description: "Fresh salted regular popcorn", pricePaise: 5000, category: "Popcorn", available: true, options: ["Classic Salted"] },
  { id: "large-popcorn", name: "Large Popcorn", description: "Large bucket fresh buttered popcorn", pricePaise: 9000, category: "Popcorn", available: true, options: ["Extra Butter"] },
  { id: "tub-cheese-popcorn", name: "Tub Cheese Popcorn", description: "Large tub savory cheese seasoned popcorn", pricePaise: 16000, category: "Popcorn", available: true, options: [] },
  { id: "tub-tomato-popcorn", name: "Tub Tomato Popcorn", description: "Large tub tangy tomato flavored popcorn", pricePaise: 16000, category: "Popcorn", available: true, options: [] },
  { id: "tub-chat-popcorn", name: "Tub Chat Popcorn", description: "Large tub spicy chat masala popcorn", pricePaise: 16000, category: "Popcorn", available: true, options: [] },

  // --- SNACKS (3 items) ---
  { id: "paneer-momos", name: "Panner Momos 8N", description: "Steamed paneer momos (8 pcs) with dipping sauces", pricePaise: 10000, category: "Snacks", available: true, options: ["Red Chilli Sauce", "Mayonnaise"] },
  { id: "nachos-with-salsa", name: "Nachos with Salsa", description: "Crisp corn nachos served with salsa dip", pricePaise: 6000, category: "Snacks", available: true, options: ["Tangy Salsa"] },
  { id: "sweet-corn", name: "Sweet Corn", description: "Warm buttery sweet corn", pricePaise: 5000, category: "Snacks", available: true, options: ["Butter", "Masala"] },

  // --- BEVERAGES (10 items) ---
  { id: "cold-drink-300ml", name: "Cold Drink 300ml", description: "Chilled refreshing cold drink 300ml", pricePaise: 4000, category: "Beverages", available: true, options: ["Thums Up", "Sprite", "Coke"] },
  { id: "masala-tea", name: "Masala Tea 200ml", description: "Freshly brewed hot ginger masala tea 200ml", pricePaise: 4000, category: "Beverages", available: true, options: ["Regular", "Less Sugar"] },
  { id: "cappuccino-200ml", name: "Cappuccino 200ml", description: "Hot freshly frothed cappuccino 200ml", pricePaise: 5000, category: "Beverages", available: true, options: [] },
  { id: "cold-coffee", name: "Cold Coffee", description: "One Cold Coffee 300ml", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "badam-shake", name: "Badam Shake", description: "Rich badam almond thick milk shake", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "chocolate-shake", name: "Chocolate Shake", description: "Rich chocolate thick shake with fudge", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "strawberry-shake", name: "Strawberry Shake", description: "Classic strawberry thick milk shake", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "virgin-mojito-mocktail", name: "Virgin Mojito Mocktail", description: "Refreshing lime and mint cooler", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "green-mint-mocktail", name: "Green mint Mocktail", description: "Refreshing iced mint cooler", pricePaise: 6000, category: "Beverages", available: true, options: [] },
  { id: "blue-curacao-mocktail", name: "Blue Curacao Mocktail", description: "Citrus tropical mocktail with soda", pricePaise: 6000, category: "Beverages", available: true, options: [] },
];

const menu: MenuItem[] = DEFAULT_MENU_ITEMS.map((item) => ({ ...item }));
let orders: KitchenOrder[] = [];
const listeners = new Set<(event: { type: string; order: KitchenOrder }) => void>();
const auditLog: { id: string; action: string; detail: string; actor: string; createdAt: string }[] = [];
const lastTransitions = new Map<string, { from: OrderStatus; to: OrderStatus }>();
const staff: StaffMember[] = [];

export function listMenu() {
  return (menu.length > 0 ? menu : DEFAULT_MENU_ITEMS).map((item) => ({ ...item }));
}

export function seedDefaultMenu(actor = "system"): MenuItem[] {
  if (menu.length === 0) {
    for (const item of DEFAULT_MENU_ITEMS) {
      menu.push({ ...item });
    }
    auditLog.unshift({
      id: randomUUID(),
      action: "MENU_INITIALIZED",
      detail: `Initialized ${DEFAULT_MENU_ITEMS.length} default menu items`,
      actor,
      createdAt: new Date().toISOString(),
    });
  }
  return listMenu();
}

let hasSyncedFromDb = false;

export async function syncOrdersFromDatabase(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      return;
    }

    const dbOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    if (!dbOrders || dbOrders.length === 0) {
      hasSyncedFromDb = true;
      return;
    }

    // Attempt to load order item lines
    const dbItems = await db.select().from(orderItems).catch(() => []);

    for (const dbo of dbOrders) {
      const exists = orders.some((o) => o.orderNumber === dbo.orderNumber || o.id === String(dbo.id));
      if (!exists) {
        const linkedItems = (dbItems as any[]).filter((it) => it.orderId === dbo.id);
        const orderLines: OrderLine[] = linkedItems.map((it) => {
          let opts: string[] = [];
          try {
            if (it.optionsSnapshot) opts = JSON.parse(it.optionsSnapshot);
          } catch {}
          return {
            id: `item-${it.id}`,
            name: it.nameSnapshot || "Cinema Snack",
            quantity: it.quantity || 1,
            pricePaise: it.unitPricePaise || 0,
            options: opts,
          };
        });

        const items: OrderLine[] = orderLines.length > 0 ? orderLines : [
          {
            id: `line-${dbo.id}-item`,
            name: "Cinema Snacks & Combo",
            quantity: 1,
            pricePaise: dbo.totalPaise,
            options: [],
          },
        ];

        // Parse screen & seat if stored in instructions like "[Screen 01 | Seat 12] notes"
        let screen = "Screen 01";
        let seat = "Seat";
        let instructions: string | undefined = dbo.instructions ?? undefined;
        if (instructions && instructions.startsWith("[")) {
          const closeBracket = instructions.indexOf("]");
          if (closeBracket !== -1) {
            const tag = instructions.slice(1, closeBracket);
            const parts = tag.split("|");
            if (parts.length >= 2) {
              screen = parts[0].trim();
              seat = parts[1].trim();
            }
            instructions = instructions.slice(closeBracket + 1).trim() || undefined;
          }
        }

        orders.push({
          id: String(dbo.id),
          orderNumber: dbo.orderNumber,
          status: (dbo.status as OrderStatus) || "NEW",
          screen,
          seat,
          customerName: dbo.customerName || "Cinema Guest",
          phoneLast4: dbo.customerPhoneLast4 || "0000",
          totalPaise: dbo.totalPaise,
          items,
          instructions,
          source: (dbo.source as any) || "ONLINE",
          paymentStatus: (dbo.paymentStatus as any) || "CONFIRMED",
          createdAt: dbo.createdAt ? new Date(dbo.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: dbo.updatedAt ? new Date(dbo.updatedAt).toISOString() : new Date().toISOString(),
          priority: "NORMAL",
        });
      }
    }

    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    hasSyncedFromDb = true;
  } catch (err) {
    console.warn("[DB] syncOrdersFromDatabase error:", err);
  }
}

export function listOrders() {
  if (!hasSyncedFromDb) {
    void syncOrdersFromDatabase();
  }
  return orders.map((order) => ({ ...order, items: order.items.map((line) => ({ ...line })) }));
}

export function listOrderHistory(input: {
  search?: string;
  status?: "ALL" | "DELIVERED" | "CANCELED";
  sort?: "newest" | "oldest" | "value";
}) {
  const search = input.search?.trim().toLowerCase() ?? "";
  return listOrders()
    .filter((order) => order.status === "DELIVERED" || order.status === "CANCELED")
    .filter((order) => input.status === "ALL" || !input.status || order.status === input.status)
    .filter((order) => !search || [order.orderNumber, order.customerName, order.screen, order.seat].some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => input.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : input.sort === "value" ? b.totalPaise - a.totalPaise : b.createdAt.localeCompare(a.createdAt));
}

export function getOrder(id: string) {
  return orders.find((order) => order.id === id || order.orderNumber === id);
}

export function findOrderByNumberAndPhone(orderNumber: string, phoneLast4: string) {
  return orders.find(
    (order) =>
      order.orderNumber.toUpperCase() === orderNumber.toUpperCase() &&
      order.phoneLast4 === phoneLast4
  );
}

export function findOrdersByFullPhone(phone: string) {
  const clean = phone.replace(/\D/g, "").slice(-10);
  if (!clean || clean.length !== 10) {
    return [];
  }
  return orders
    .filter((order) => order.customerPhone === clean)
    .slice(0, 6)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      screen: order.screen,
      seat: order.seat,
      customerName: order.customerName,
      phoneLast4: order.phoneLast4,
      items: order.items,
      totalPaise: order.totalPaise,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
}

export function listStaff() {
  return staff.map((member) => ({ ...member }));
}

export function inviteStaff(name: string, email: string, role: StaffRole, actor: string) {
  const member: StaffMember = {
    id: `staff-${randomUUID().slice(0, 8)}`,
    name,
    email,
    role,
    status: "INVITED",
    invitedAt: new Date().toISOString(),
  };
  staff.unshift(member);
  auditLog.unshift({
    id: randomUUID(),
    action: "STAFF_INVITED",
    detail: `${name} invited as ${role}`,
    actor,
    createdAt: member.invitedAt,
  });
  return { ...member };
}

export function updateStaffRole(id: string, role: StaffRole, actor: string) {
  const member = staff.find((candidate) => candidate.id === id);
  if (!member) throw new Error("Staff member not found");
  const previous = member.role;
  member.role = role;
  auditLog.unshift({
    id: randomUUID(),
    action: "STAFF_ROLE_CHANGED",
    detail: `${member.name}: ${previous} → ${role}`,
    actor,
    createdAt: new Date().toISOString(),
  });
  return { ...member };
}

export function getShiftSummary(): ShiftSummary {
  const completed = orders.filter((order) => order.status === "DELIVERED");
  const durations = completed.map((order) => Math.max(1, Math.round((new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime()) / 60000)));
  return {
    shiftLabel: "Current shift",
    startedAt: new Date().toISOString(),
    completedOrders: completed.length,
    canceledOrders: orders.filter((order) => order.status === "CANCELED").length,
    averagePreparationMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    fastestOrderMinutes: durations.length ? Math.min(...durations) : 0,
    revenuePaise: completed.reduce((sum, order) => sum + order.totalPaise, 0),
  };
}

export function getStats(): DashboardStats {
  const itemCounts = new Map<string, number>();
  for (const order of orders) {
    if (order.paymentStatus === "CONFIRMED") {
      for (const line of order.items) {
        itemCounts.set(line.name, (itemCounts.get(line.name) ?? 0) + line.quantity);
      }
    }
  }

  let popularItem = "—";
  let maxCount = 0;
  for (const [name, count] of itemCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      popularItem = `${name} (${count} sold)`;
    }
  }

  const confirmedOrders = orders.filter((order) => order.paymentStatus === "CONFIRMED");

  return {
    ordersToday: confirmedOrders.length,
    revenuePaise: confirmedOrders.reduce((sum, order) => sum + order.totalPaise, 0),
    pending: orders.filter((order) => order.status === "NEW" && order.paymentStatus === "CONFIRMED").length,
    preparing: orders.filter((order) => order.status === "PREPARING").length,
    ready: orders.filter((order) => order.status === "READY").length,
    delivered: orders.filter((order) => order.status === "DELIVERED").length,
    paymentFailures: orders.filter((order) => order.paymentStatus === "FAILED").length,
    popularItem,
  };
}

export type CreateOrderInput = {
  screen: string;
  seat: string;
  customerName: string;
  phone: string;
  items: { itemId: string; quantity: number; options?: string[] }[];
  instructions?: string;
  source?: "ONLINE" | "OFFLINE_SMS";
  paymentStatus?: "CONFIRMED" | "PENDING";
};

export async function createOrder(input: CreateOrderInput, actor = "customer"): Promise<KitchenOrder> {
  const currentMenu = menu.length > 0 ? menu : DEFAULT_MENU_ITEMS;
  const orderLines: OrderLine[] = [];
  let totalPaise = 0;

  for (const line of input.items) {
    const menuItem = currentMenu.find((m) => m.id === line.itemId);
    if (!menuItem) {
      throw new Error(`Menu item not found: ${line.itemId}`);
    }
    if (!menuItem.available) {
      throw new Error(`Menu item is currently unavailable: ${menuItem.name}`);
    }
    if (line.quantity <= 0 || line.quantity > 20) {
      throw new Error(`Invalid quantity for ${menuItem.name}: ${line.quantity}`);
    }
    const linePrice = menuItem.pricePaise * line.quantity;
    totalPaise += linePrice;
    orderLines.push({
      id: randomUUID(),
      name: menuItem.name,
      quantity: line.quantity,
      pricePaise: menuItem.pricePaise,
      options: line.options ?? [],
    });
  }

  const phoneDigits = input.phone.replace(/\D/g, "");
  const customerPhone = phoneDigits.slice(-10);
  const phoneLast4 = phoneDigits.slice(-4) || "0000";
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `CB-${randomSuffix}`;
  const nowIso = new Date().toISOString();
  const paymentStatus = input.paymentStatus ?? "PENDING";
  // Add ₹10 (1000 paise) platform fee per order
  const platformFeePaise = PLATFORM_FEE_PAISE;
  totalPaise += platformFeePaise;

  const newOrder: KitchenOrder = {
    id: `order-${randomUUID().slice(0, 8)}`,
    orderNumber,
    status: "NEW",
    screen: input.screen || "Screen 01",
    seat: input.seat || "Unassigned",
    customerName: input.customerName.trim(),
    customerPhone,
    phoneLast4,
    totalPaise,
    platformFeePaise,
    items: orderLines,
    instructions: input.instructions?.trim(),
    source: input.source ?? "ONLINE",
    paymentStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
    priority: "NORMAL",
  };

  orders.unshift(newOrder);

  auditLog.unshift({
    id: randomUUID(),
    action: "ORDER_CREATED",
    detail: `Order ${orderNumber} created for ${newOrder.customerName} (${newOrder.screen} ${newOrder.seat}) - Total: ₹${(totalPaise / 100).toFixed(0)} (incl. ₹10 platform fee) [${paymentStatus}]`,
    actor,
    createdAt: nowIso,
  });

  // ONLY notify kitchen if payment is already confirmed. PENDING orders wait for confirmOrderPayment!
  if (paymentStatus === "CONFIRMED") {
    const event = {
      type: "order.created",
      order: { ...newOrder, items: newOrder.items.map((line) => ({ ...line })) },
    };
    listeners.forEach((listener) => listener(event));
  }

  // Asynchronous database persistence when database is configured
  try {
    const db = await getDb();
    if (db) {
      const formattedInstructions = `[${newOrder.screen} | ${newOrder.seat}] ${newOrder.instructions ?? ""}`.trim();
      const insertResult = await db.insert(ordersTable).values({
        orderNumber: newOrder.orderNumber,
        status: "NEW",
        source: newOrder.source,
        paymentStatus,
        screenId: 1,
        seatId: 1,
        customerName: newOrder.customerName,
        customerPhoneLast4: newOrder.phoneLast4,
        totalPaise: newOrder.totalPaise,
        instructions: formattedInstructions || null,
        idempotencyKey: `idemp-${randomUUID()}`,
        paymentConfirmedAt: paymentStatus === "CONFIRMED" ? new Date() : null,
      }).catch((e) => {
        console.warn("[DB] Failed to persist order:", e);
        return null;
      });

      // Also persist individual order items if insert succeeded
      if (insertResult) {
        const [found] = await db
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(eq(ordersTable.orderNumber, newOrder.orderNumber))
          .limit(1)
          .catch(() => []);

        if (found?.id) {
          for (const line of newOrder.items) {
            await db.insert(orderItems).values({
              orderId: found.id,
              menuItemId: 1,
              nameSnapshot: line.name,
              quantity: line.quantity,
              unitPricePaise: line.pricePaise,
              optionsSnapshot: JSON.stringify(line.options || []),
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn("[DB] Order persistence skipped:", err);
  }

  return newOrder;
}

/**
 * Confirms payment for an order and notifies kitchen
 */
export async function confirmOrderPayment(input: {
  orderId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string;
}, actor = "payment_gateway"): Promise<KitchenOrder> {
  const order = orders.find((o) => o.id === input.orderId || o.orderNumber === input.orderId);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  if (order.paymentStatus === "CONFIRMED") {
    return order; // Idempotent: already confirmed
  }

  const nowIso = new Date().toISOString();
  order.paymentStatus = "CONFIRMED";
  order.status = "NEW";
  order.updatedAt = nowIso;

  auditLog.unshift({
    id: randomUUID(),
    action: "ORDER_PAYMENT_CONFIRMED",
    detail: `Order ${order.orderNumber} payment confirmed via ${input.providerPaymentId} - ₹${(order.totalPaise / 100).toFixed(0)}`,
    actor,
    createdAt: nowIso,
  });

  // Notify the kitchen now that payment has been confirmed!
  const event = {
    type: "order.created",
    order: { ...order, items: order.items.map((line) => ({ ...line })) },
  };
  listeners.forEach((listener) => listener(event));

  // Persist confirmation and payment record to TiDB
  try {
    const db = await getDb();
    if (db) {
      await db
        .update(ordersTable)
        .set({
          paymentStatus: "CONFIRMED",
          paymentConfirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ordersTable.orderNumber, order.orderNumber))
        .catch((e) => console.warn("[DB] Failed to update order paymentStatus:", e));

      await db
        .insert(paymentsTable)
        .values({
          orderId: 1, // linked via orderNumber/id
          provider: "razorpay",
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId,
          amountPaise: order.totalPaise,
          signatureVerified: 1,
        })
        .catch((e) => console.warn("[DB] Failed to insert payment record:", e));
    }
  } catch (err) {
    console.warn("[DB] Payment persistence skipped:", err);
  }

  return order;
}

export function updateOrderStatus(orderId: string, status: OrderStatus, actor: string) {
  const order = orders.find((candidate) => candidate.id === orderId || candidate.orderNumber === orderId);
  if (!order) throw new Error("Order not found");
  if (!isValidTransition(order.status, status)) throw new Error(`Invalid transition: ${order.status} → ${status}`);
  const previous = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  lastTransitions.set(order.id, { from: previous, to: status });
  auditLog.unshift({
    id: randomUUID(),
    action: "ORDER_STATUS_CHANGED",
    detail: `${order.orderNumber}: ${previous} → ${status}`,
    actor,
    createdAt: order.updatedAt,
  });
  const event = { type: "order.statusChanged", order: { ...order, items: order.items.map((line) => ({ ...line })) } };
  listeners.forEach((listener) => listener(event));

  // Asynchronously update DB status if available
  getDb().then((db) => {
    if (db && (status === "PREPARING" || status === "READY" || status === "DELIVERED")) {
      db.update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(ordersTable.orderNumber, order.orderNumber))
        .catch(() => {});
    }
  }).catch(() => {});

  return order;
}

export function undoOrderStatus(orderId: string, expectedStatus: OrderStatus, actor: string) {
  const order = orders.find((candidate) => candidate.id === orderId || candidate.orderNumber === orderId);
  const transition = order ? lastTransitions.get(order.id) : undefined;
  if (!order || !transition || order.status !== expectedStatus || transition.to !== expectedStatus) {
    throw new Error("This status change can no longer be undone");
  }
  const previous = order.status;
  order.status = transition.from;
  order.updatedAt = new Date().toISOString();
  lastTransitions.delete(order.id);
  auditLog.unshift({
    id: randomUUID(),
    action: "ORDER_STATUS_UNDONE",
    detail: `${order.orderNumber}: ${previous} → ${order.status}`,
    actor,
    createdAt: order.updatedAt,
  });
  const event = { type: "order.statusChanged", order: { ...order, items: order.items.map((line) => ({ ...line })) } };
  listeners.forEach((listener) => listener(event));
  return order;
}

export function toggleMenuAvailability(id: string, available: boolean, actor: string) {
  if (menu.length === 0) {
    seedDefaultMenu("system");
  }
  const item = menu.find((candidate) => candidate.id === id);
  if (!item) throw new Error("Menu item not found");
  item.available = available;
  const createdAt = new Date().toISOString();
  auditLog.unshift({
    id: randomUUID(),
    action: "MENU_AVAILABILITY_CHANGED",
    detail: `${item.name}: ${available ? "available" : "unavailable"}`,
    actor,
    createdAt,
  });
  return { ...item };
}

export function subscribe(listener: (event: { type: string; order: KitchenOrder }) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuditLog() {
  return auditLog.slice(0, 50);
}

export function resetDemoData() {
  orders = [];
  menu.splice(0, menu.length);
  staff.splice(0, staff.length);
  auditLog.splice(0, auditLog.length);
  return orders;
}

export const DEVELOPER_DELETE_CODE = process.env.DEVELOPER_DELETE_CODE || "9776600";

export async function deleteOrderFromDatabase(
  orderId: string,
  developerCode: string,
  actor: string
): Promise<{ success: boolean; orderNumber: string }> {
  if (developerCode.trim() !== DEVELOPER_DELETE_CODE) {
    throw new Error("Invalid developer authorization code. Order deletion denied.");
  }

  const index = orders.findIndex((o) => o.id === orderId || o.orderNumber === orderId);
  let deletedOrder: KitchenOrder | undefined;
  if (index !== -1) {
    [deletedOrder] = orders.splice(index, 1);
    lastTransitions.delete(deletedOrder.id);
  }

  const orderNumber = deletedOrder?.orderNumber || orderId;

  // Persist deletion in MySQL / TiDB database
  try {
    const db = await getDb();
    if (db) {
      const [dbOrder] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.orderNumber, orderNumber))
        .limit(1);

      if (dbOrder) {
        await db.delete(orderItems).where(eq(orderItems.orderId, dbOrder.id)).catch(() => {});
        await db.delete(paymentsTable).where(eq(paymentsTable.orderId, dbOrder.id)).catch(() => {});
        await db.delete(refunds).where(eq(refunds.orderId, dbOrder.id)).catch(() => {});
        await db.delete(consentRecords).where(eq(consentRecords.orderId, dbOrder.id)).catch(() => {});
        await db.delete(ordersTable).where(eq(ordersTable.id, dbOrder.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[DB] Failed to delete order from database:", err);
  }

  auditLog.unshift({
    id: randomUUID(),
    action: "ORDER_DELETED_PERMANENTLY",
    detail: `Order ${orderNumber} permanently deleted from database by ${actor} using developer code`,
    actor,
    createdAt: new Date().toISOString(),
  });

  // Broadcast deletion event to listeners
  if (deletedOrder) {
    const event = {
      type: "order.deleted",
      order: { ...deletedOrder, status: "CANCELED" as OrderStatus },
    };
    listeners.forEach((listener) => listener(event));
  }

  return { success: true, orderNumber };
}

