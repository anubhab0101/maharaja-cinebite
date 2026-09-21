import { randomUUID, randomBytes, createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import { getPaymentProvider } from "./payment-provider";
import { database, readOrders, readOrder, readEntities, writeEntity, persistOrder, persistStatus } from "./durable-store";
import { menuPrice } from '@shared/menu-pricing';
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
  STAFF_ROLES,
  isValidTransition,
} from "@shared/cinebites";
import { getDb } from "./db";
import {
  orders as ordersTable,
  payments as paymentsTable,
  auditLogs as auditLogsTable,
  users as usersTable,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

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

const menu: MenuItem[] = [];
let orders: KitchenOrder[] = [];
const listeners = new Set<(event: { type: string; order: KitchenOrder }) => void>();
const auditLog: { id: string; action: string; detail: string; actor: string; createdAt: string }[] = [];
const lastTransitions = new Map<string, { from: OrderStatus; to: OrderStatus }>();
const staff: StaffMember[] = [];

export async function listMenu() {
  return await readEntities<MenuItem>("menu") ?? menu.map((item) => ({ ...item }));
}

export async function seedDefaultMenu(actor = "system"): Promise<MenuItem[]> {
  if ((await listMenu()).length === 0) {
    for (const item of DEFAULT_MENU_ITEMS) {
      await writeEntity("menu", item.id, item, actor, "MENU_INITIALIZED");
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

export async function listOrders() {
  return await readOrders() ?? orders.map((order) => ({ ...order, items: order.items.map((line) => ({ ...line })) }));
}

export async function listOrderHistory(input: {
  search?: string;
  status?: "ALL" | "DELIVERED" | "CANCELED";
  sort?: "newest" | "oldest" | "value";
}) {
  const search = input.search?.trim().toLowerCase() ?? "";
  return (await listOrders())
    .filter((order) => order.status === "DELIVERED" || order.status === "CANCELED")
    .filter((order) => input.status === "ALL" || !input.status || order.status === input.status)
    .filter((order) => !search || [order.orderNumber, order.customerName, order.screen, order.seat].some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => input.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : input.sort === "value" ? b.totalPaise - a.totalPaise : b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(id: string) {
  const stored = await readOrder(id);
  return stored === null ? orders.find((order) => order.id === id || order.orderNumber === id) : stored;
}

export async function findOrderByNumberAndPhone(orderNumber: string, phoneLast4: string) {
  const order = await getOrder(orderNumber.toUpperCase());
  return order?.phoneLast4 === phoneLast4 ? order : undefined;
}

export async function findOrdersByFullPhone(phone: string) {
  const clean = phone.replace(/\D/g, "").slice(-10);
  if (!clean || clean.length !== 10) {
    return [];
  }
  return (await listOrders())
    .filter((order) => order.customerPhone === clean)
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

export async function listStaff() {
  const configured = await readEntities<StaffMember>("staff");
  if (!configured) return staff.map(member => ({ ...member }));
  const db = await database();
  if (!db) return configured;
  // Preserve the real repository's pre-existing staff directory in users.
  // Explicit durable overrides win; ordinary customer/user roles are not staff.
  const legacy = await db.select().from(usersTable);
  const known = new Set(configured.map(member => member.email.toLowerCase()));
  return [...configured, ...legacy.flatMap(user => {
    const role = user.role === "admin" ? "ADMIN" : user.role;
    if (!user.email || known.has(user.email.toLowerCase()) || !STAFF_ROLES.includes(role as StaffRole)) return [];
    return [{ id: `staff-user-${user.id}`, name: user.name ?? user.email, email: user.email.toLowerCase(), role: role as StaffRole, status: "ACTIVE" as const, invitedAt: user.createdAt.toISOString() }];
  })];
}

export async function inviteStaff(name: string, email: string, role: StaffRole, actor: string) {
  email = email.toLowerCase().trim();
  if ((await listStaff()).some(member => member.email === email)) throw new Error("Staff email already exists");
  const member: StaffMember = {
    id: `staff-${randomUUID()}`,
    name,
    email,
    role,
    status: "INVITED",
    invitedAt: new Date().toISOString(),
  };
  await writeEntity("staff", member.email, member, actor, "STAFF_INVITED");
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

export async function updateStaffRole(id: string, role: StaffRole, actor: string) {
  const member = (await listStaff()).find((candidate) => candidate.id === id);
  if (!member) throw new Error("Staff member not found");
  const previous = member.role;
  member.role = role;
  await writeEntity("staff", member.email, member, actor, "STAFF_ROLE_CHANGED");
  const cached = staff.find(candidate => candidate.id === id);
  if (cached) cached.role = role;
  auditLog.unshift({
    id: randomUUID(),
    action: "STAFF_ROLE_CHANGED",
    detail: `${member.name}: ${previous} → ${role}`,
    actor,
    createdAt: new Date().toISOString(),
  });
  return { ...member };
}

export async function getShiftSummary(): Promise<ShiftSummary> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const orders = (await listOrders()).filter(order => new Date(order.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === today);
  const completed = orders.filter((order) => order.status === "DELIVERED" && order.paymentStatus === "CONFIRMED");
  const durations = completed.map((order) => Math.max(1, Math.round((new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime()) / 60000)));
  return {
    shiftLabel: "Today (India time)",
    startedAt: new Date().toISOString(),
    completedOrders: completed.length,
    canceledOrders: orders.filter((order) => order.status === "CANCELED").length,
    averagePreparationMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    fastestOrderMinutes: durations.length ? Math.min(...durations) : 0,
    revenuePaise: completed.reduce((sum, order) => sum + order.totalPaise, 0),
  };
}

export async function getStats(): Promise<DashboardStats> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const orders = (await listOrders()).filter(order => new Date(order.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === today);
  const paid = orders.filter(order => order.paymentStatus === "CONFIRMED");
  const quantities = new Map<string, number>();
  paid.forEach(order => order.items.forEach(item => quantities.set(item.name, (quantities.get(item.name) ?? 0) + item.quantity)));
  return {
    ordersToday: orders.length,
    revenuePaise: paid.reduce((sum, order) => sum + order.totalPaise, 0),
    pending: paid.filter((order) => order.status === "NEW").length,
    preparing: orders.filter((order) => order.status === "PREPARING").length,
    ready: orders.filter((order) => order.status === "READY").length,
    delivered: orders.filter((order) => order.status === "DELIVERED").length,
    paymentFailures: orders.filter(order => order.paymentStatus === "FAILED").length,
    popularItem: Array.from(quantities.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
  };
}

export type CreateOrderInput = {
  expectedTotalPaise?: number;
  screen: string;
  seat: string;
  customerName: string;
  phone: string;
  items: { itemId: string; quantity: number; options?: string[] }[];
  instructions?: string;
  source?: "ONLINE" | "OFFLINE_SMS";
  paymentStatus?: "CONFIRMED" | "PENDING";
  idempotencyKey?: string;
  checkoutHash?: string;
  showtimeId?: number;
  consent?: import("@shared/consent").CheckoutConsent;
};

export async function createOrder(input: CreateOrderInput, actor = "customer"): Promise<KitchenOrder> {
  const db = await database();
  const checkoutHash = createHash("sha256").update(JSON.stringify({ ...input, checkoutHash: undefined, idempotencyKey: undefined })).digest("hex");
  if (db && input.idempotencyKey) {
    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.checkoutHash !== checkoutHash || !existing.snapshot) throw new Error("Checkout key already belongs to a different request");
      return { ...existing.snapshot, status: existing.status, paymentStatus: existing.paymentStatus };
    }
  }
  if (!input.items.length || input.items.length > 30) throw new Error("Invalid cart size");
  const storedMenu = await listMenu();
  const currentMenu = storedMenu.length > 0 ? storedMenu : DEFAULT_MENU_ITEMS;
  const orderLines: OrderLine[] = [];
  let totalPaise = 0;

  for (const line of input.items) {
    const menuItem = currentMenu.find((m) => m.id === line.itemId);
    if (!menuItem) {
      throw new Error(`Menu item not found: ${line.itemId}`);
    }
    if (!menuItem.available) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Menu item is currently unavailable: ${menuItem.name}. Please review your cart.` });
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 20) {
      throw new Error(`Invalid quantity for ${menuItem.name}: ${line.quantity}`);
    }
    if ((line.options ?? []).some(option => !menuItem.options.includes(option))) {
      throw new Error(`Invalid option for ${menuItem.name}`);
    }
    const unitPrice = menuPrice(menuItem);
    const linePrice = unitPrice * line.quantity;
    totalPaise += linePrice;
    orderLines.push({
      id: randomUUID(),
      name: menuItem.name,
      quantity: line.quantity,
      pricePaise: unitPrice,
      originalPricePaise: menuItem.pricePaise,
      discountPercent: menuItem.discountPercent ?? 0,
      options: line.options ?? [],
    });
  }

  const phoneDigits = input.phone.replace(/\D/g, "");
  const customerPhone = phoneDigits.slice(-10);
  const phoneLast4 = phoneDigits.slice(-4) || "0000";
  const orderNumber = `CB-${randomBytes(12).toString("hex").toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const paymentStatus = input.paymentStatus ?? "PENDING";
  // Add ₹10 (1000 paise) platform fee per order
  const platformFeePaise = PLATFORM_FEE_PAISE;
  totalPaise += platformFeePaise;
  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== totalPaise) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Menu price or discount changed. Reload the menu and review the total before paying.' });
  }

  const newOrder: KitchenOrder = {
    id: `order-${randomUUID()}`,
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

  // Persist before publishing the order or telling the client to pay.
  try {
    await persistOrder(newOrder, { ...input, checkoutHash });
  } catch (error) {
    // A concurrent retry may have inserted the same unique checkout key.
    if (db && input.idempotencyKey) {
      const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing?.snapshot && existing.checkoutHash === checkoutHash) return { ...existing.snapshot, status: existing.status, paymentStatus: existing.paymentStatus };
    }
    throw error;
  }
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

  return newOrder;
}

/**
 * Confirms payment for an order and notifies kitchen
 */
type PaymentConfirmation = {
  orderId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string;
};

const paymentQueues = new Map<string, Promise<unknown>>();
const confirmedPaymentIds = new Map<string, string>();

export function confirmOrderPayment(input: PaymentConfirmation, actor = "payment_gateway", fromVerifiedWebhook = false): Promise<KitchenOrder> {
  // Serialize state changes while this process-memory store remains in use.
  // Database row locks/unique constraints protect the persisted confirmation.
  const result = (paymentQueues.get(input.orderId) ?? Promise.resolve()).then(() => confirmPayment(input, actor, fromVerifiedWebhook));
  const settled = result.catch(() => undefined);
  paymentQueues.set(input.orderId, settled);
  void settled.then(() => { if (paymentQueues.get(input.orderId) === settled) paymentQueues.delete(input.orderId); });
  return result;
}

async function confirmPayment(input: PaymentConfirmation, actor: string, fromVerifiedWebhook: boolean): Promise<KitchenOrder> {
  const order = await getOrder(input.orderId);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  const provider = getPaymentProvider();
  const verify = fromVerifiedWebhook ? provider.verifyCapturedPayment.bind(provider) : provider.verifyPayment.bind(provider);
  const verified = await verify({
    ...input,
    signature: input.signature ?? "",
    amountPaise: order.totalPaise,
    receipt: order.orderNumber,
  });
  if (!verified) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment does not match this order or has not been captured." });
  const existingOrderId = confirmedPaymentIds.get(input.providerPaymentId);
  if (existingOrderId && existingOrderId !== order.id) throw new Error("Payment already used");
  if (order.paymentStatus === "CONFIRMED" && process.env.NODE_ENV === "test") {
    if (existingOrderId !== order.id) throw new Error("Order already paid by a different payment");
    return order;
  }

  const nowIso = new Date().toISOString();
  const db = await getDb();
  if (!db && process.env.NODE_ENV === "production") throw new Error("Database unavailable");
  if (db) {
    const duplicate = await db.transaction(async tx => {
      const [storedOrder] = await tx.select().from(ordersTable)
        .where(eq(ordersTable.orderNumber, order.orderNumber)).limit(1).for("update");
      if (!storedOrder || storedOrder.totalPaise !== order.totalPaise) throw new Error("Persisted order is missing or inconsistent");
      if (storedOrder.providerOrderId !== input.providerOrderId) throw new Error("Payment intent does not belong to this order");
      const [existingPayment] = await tx.select().from(paymentsTable)
        .where(eq(paymentsTable.providerPaymentId, input.providerPaymentId)).limit(1);
      if (existingPayment && (existingPayment.orderId !== storedOrder.id ||
        existingPayment.providerOrderId !== input.providerOrderId || existingPayment.amountPaise !== order.totalPaise)) {
        throw new Error("Payment already used");
      }
      if (existingPayment && storedOrder.paymentStatus === "CONFIRMED") return true;
      if (!existingPayment) {
        if (storedOrder.paymentStatus === "CONFIRMED") throw new Error("Order already paid");
        await tx.insert(paymentsTable).values({
          orderId: storedOrder.id,
          provider: "razorpay",
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId,
          amountPaise: order.totalPaise,
          signatureVerified: 1,
        });
      }
      await tx.update(ordersTable).set({ paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(ordersTable.id, storedOrder.id));
      await tx.insert(auditLogsTable).values({ action: "ORDER_PAYMENT_CONFIRMED", entityType: "order", entityId: order.id, detail: JSON.stringify({ actor, paymentId: input.providerPaymentId }) });
      return false;
    });
    if (duplicate) return order;
  }
  confirmedPaymentIds.set(input.providerPaymentId, order.id);
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

  return order;
}

export async function ensurePaymentIntent(order: KitchenOrder) {
  const provider = getPaymentProvider();
  const db = await database();
  if (!db) return provider.createIntent({ amountPaise: order.totalPaise, receipt: order.orderNumber });
  return db.transaction(async tx => {
    const [row] = await tx.select().from(ordersTable).where(eq(ordersTable.orderNumber, order.orderNumber)).limit(1).for("update");
    if (!row) throw new Error("Order not found");
    if (row.providerOrderId) return { provider: "razorpay" as const, providerOrderId: row.providerOrderId, amountPaise: row.totalPaise, currency: "INR" as const, keyId: process.env.RAZORPAY_KEY_ID };
    const intent = await provider.createIntent({ amountPaise: row.totalPaise, receipt: row.orderNumber });
    await tx.update(ordersTable).set({ providerOrderId: intent.providerOrderId }).where(eq(ordersTable.id, row.id));
    return intent;
  });
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, actor: string) {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus !== "CONFIRMED") throw new Error("Unpaid orders cannot enter preparation");
  if (!isValidTransition(order.status, status)) throw new Error(`Invalid transition: ${order.status} → ${status}`);
  const previous = order.status;
  await persistStatus({ ...order, status }, previous, actor);
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

  return order;
}

export async function undoOrderStatus(orderId: string, expectedStatus: OrderStatus, actor: string) {
  const order = await getOrder(orderId);
  const transition = order ? lastTransitions.get(order.id) : undefined;
  if (!order || !transition || order.status !== expectedStatus || transition.to !== expectedStatus) {
    throw new Error("This status change can no longer be undone");
  }
  const previous = order.status;
  await persistStatus({ ...order, status: transition.from }, previous, actor);
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

export async function toggleMenuAvailability(id: string, available: boolean, actor: string) {
  if ((await listMenu()).length === 0) {
    await seedDefaultMenu("system");
  }
  const item = (await listMenu()).find((candidate) => candidate.id === id);
  if (!item) throw new Error("Menu item not found");
  item.available = available;
  await writeEntity("menu", item.id, item, actor, "MENU_AVAILABILITY_CHANGED");
  const cached = menu.find(candidate => candidate.id === id);
  if (cached) cached.available = available;
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

export async function getAuditLog() {
  const db = await database();
  if (db) return (await db.select().from(auditLogsTable)).reverse().slice(0, 50).map(row => ({ id: String(row.id), action: row.action, detail: row.detail ?? "", actor: "server", createdAt: row.createdAt.toISOString() }));
  return auditLog.slice(0, 50);
}

export function resetDemoData() {
  orders = [];
  menu.splice(0, menu.length);
  staff.splice(0, staff.length);
  auditLog.splice(0, auditLog.length);
  lastTransitions.clear();
  confirmedPaymentIds.clear();
  return orders;
}
