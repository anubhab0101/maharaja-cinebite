import { int, index, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { KitchenOrder } from "../shared/cinebites";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).default("READ_ONLY").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({ roleIdx: index("users_role_idx").on(table.role) }));

export const screens = mysqlTable("screens", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const seats = mysqlTable("seats", {
  id: int("id").autoincrement().primaryKey(),
  screenId: int("screenId").notNull(),
  label: varchar("label", { length: 16 }).notNull(),
  qrToken: varchar("qrToken", { length: 128 }).notNull().unique(),
}, (table) => ({ seatIdx: uniqueIndex("seat_screen_label_idx").on(table.screenId, table.label) }));

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  pricePaise: int("pricePaise").notNull(),
  available: int("available").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ availableIdx: index("menu_items_available_idx").on(table.available) }));

export const menuItemOptions = mysqlTable("menu_item_options", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  pricePaise: int("pricePaise").default(0).notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
  publicId: varchar("publicId", { length: 80 }).unique(),
  snapshot: json("snapshot").$type<KitchenOrder>(),
  providerOrderId: varchar("providerOrderId", { length: 128 }).unique(),
  checkoutHash: varchar("checkoutHash", { length: 64 }),
  showtimeId: int("showtimeId"),
  status: mysqlEnum("status", ["NEW", "PREPARING", "READY", "DELIVERED"]).default("NEW").notNull(),
  source: mysqlEnum("source", ["ONLINE", "OFFLINE_SMS"]).default("ONLINE").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["PENDING", "CONFIRMED", "FAILED"]).default("PENDING").notNull(),
  screenId: int("screenId").notNull(),
  seatId: int("seatId").notNull(),
  customerName: varchar("customerName", { length: 120 }).notNull(),
  customerPhoneLast4: varchar("customerPhoneLast4", { length: 4 }).notNull(),
  totalPaise: int("totalPaise").notNull(),
  instructions: text("instructions"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  paymentConfirmedAt: timestamp("paymentConfirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ activeQueueIdx: index("orders_active_queue_idx").on(table.status, table.createdAt), paymentIdx: index("orders_payment_idx").on(table.paymentStatus) }));

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  nameSnapshot: varchar("nameSnapshot", { length: 120 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPricePaise: int("unitPricePaise").notNull(),
  optionsSnapshot: text("optionsSnapshot"),
});

// Small durable configuration records; order/payment data remains in its own tables.
export const storeEntities = mysqlTable("store_entities", {
  key: varchar("key", { length: 160 }).primaryKey(),
  kind: varchar("kind", { length: 20 }).notNull(),
  payload: json("payload").notNull(),
});

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 128 }).notNull().unique(),
  providerOrderId: varchar("providerOrderId", { length: 128 }),
  amountPaise: int("amountPaise").notNull(),
  signatureVerified: int("signatureVerified").default(0).notNull(),
  webhookEventId: varchar("webhookEventId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ orderIdx: index("payments_order_idx").on(table.orderId) }));

export const refunds = mysqlTable("refunds", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  paymentId: int("paymentId").notNull(),
  refundId: varchar("refundId", { length: 128 }),
  amountPaise: int("amountPaise").notNull(),
  reason: text("reason").notNull(),
  approvingAdminId: int("approvingAdminId").notNull(),
  status: mysqlEnum("status", ["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED", "FAILED"]).default("REQUESTED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const consentRecords = mysqlTable("consent_records", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
  terms: int("terms").notNull(),
  privacy: int("privacy").notNull(),
  refund: int("refund").notNull(),
  retention: int("retention").notNull(),
  support: int("support").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 40 }).notNull(),
  entityId: varchar("entityId", { length: 80 }),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ auditIdx: index("audit_logs_created_idx").on(table.createdAt, table.action) }));

export const showtimes = mysqlTable("showtimes", {
  id: int("id").autoincrement().primaryKey(),
  venueName: varchar("venueName", { length: 160 }).notNull(),
  city: varchar("city", { length: 80 }).notNull(),
  address: text("address").notNull(),
  movieTitle: varchar("movieTitle", { length: 180 }).notNull(),
  certificate: varchar("certificate", { length: 16 }),
  language: varchar("language", { length: 40 }),
  format: varchar("format", { length: 40 }),
  screenName: varchar("screenName", { length: 80 }),
  showDate: varchar("showDate", { length: 10 }).notNull(),
  startTime: varchar("startTime", { length: 8 }).notNull(),
  durationMinutes: int("durationMinutes").notNull().default(0),
  availability: varchar("availability", { length: 24 }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceShowId: varchar("sourceShowId", { length: 160 }).notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => ({
  uniqueShow: uniqueIndex("showtimes_source_show_idx").on(table.source, table.sourceShowId),
  dateVenueIdx: index("showtimes_venue_date_idx").on(table.venueName, table.showDate),
}));

export const sessionLinks = mysqlTable("session_links", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 96 }).notNull().unique(),
  showtimeId: int("showtimeId").notNull(),
  screenName: varchar("screenName", { length: 80 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
}, (table) => ({ showtimeScreenIdx: uniqueIndex("session_links_showtime_screen_idx").on(table.showtimeId, table.screenName), activeIdx: index("session_links_active_idx").on(table.active) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Showtime = typeof showtimes.$inferSelect;
export type InsertShowtime = typeof showtimes.$inferInsert;
export type SessionLink = typeof sessionLinks.$inferSelect;
