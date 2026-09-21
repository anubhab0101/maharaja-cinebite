import { z } from "zod";
import { orderChatRouter } from "./order-chat";
import { staffPushRouter } from "./staff-push";
import { offerPushRouter } from './offer-push';
import { orderingControl, setOrderingControl, pauseSchema, pendingPayments, reconcilePayment, syncRefund, privacySchema, savePrivacyRequest, type PrivacyRequest } from "./pilot-operations";
import { readEntities } from "./durable-store";
import { customerExportInput, exportCustomerPage } from "./customer-export";
import { checkoutConsentSchema } from "@shared/consent";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, staffProcedure, adminProcedure } from "./_core/trpc";
import {
  DEFAULT_MENU_ITEMS,
  createOrder,
  confirmOrderPayment,
  ensurePaymentIntent,
  findOrderByNumberAndPhone,
  findOrdersByFullPhone,
  getAuditLog,
  getShiftSummary,
  getStats,
  inviteStaff,
  listMenu,
  listOrderHistory,
  listOrders,
  listStaff,
  seedDefaultMenu,
  toggleMenuAvailability,
  undoOrderStatus,
  updateOrderStatus,
  updateStaffRole,
} from "./cinebites-store";
import { ORDER_STATUSES, STAFF_ROLES } from "@shared/cinebites";
import { getShowtimeWindow, listShowtimeDates, listShowtimes } from "./showtimes";
import { configuredSeats, manualShowtimeSchema, resolveSeatSession, saveManualShowtime } from "./showtime-management";
import { generateSessionLinks, listSessionLinks, resolveSessionLink } from "./session-links";
import { getPaymentProvider, isLivePaymentGatewayConfigured } from "./payment-provider";
import { sanitizeText, checkRateLimit, getClientIp } from "./_core/security";
import { database, writeEntity } from "./durable-store";
import { orders as orderTable, payments as paymentTable, refunds as refundTable, screens, seats, auditLogs, storeEntities, users } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";

export const appRouter = router({
  chat: orderChatRouter,
  staffPush: staffPushRouter,
  offers: offerPushRouter,
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  catalog: router({
    seatSession: publicProcedure.input(z.object({ token: z.string().min(20).max(128) })).query(({ input }) => resolveSeatSession(input.token)),
    menu: publicProcedure.query(async () => {
      const current = await listMenu();
      return current.length > 0 ? current : DEFAULT_MENU_ITEMS;
    }),
    showtimes: publicProcedure
      .input(z.object({ showDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional())
      .query(({ input }) => listShowtimes(input?.showDate)),
    showtimeDates: publicProcedure.query(() => listShowtimeDates()),
    orderingWindow: publicProcedure
      .input(z.object({ showtimeId: z.number().int().positive() }))
      .query(({ input }) => getShowtimeWindow(input.showtimeId)),
    session: publicProcedure
      .input(z.object({ token: z.string().min(20).max(96) }))
      .query(({ input }) => resolveSessionLink(input.token)),
  }),
  order: router({
    create: publicProcedure
      .input(
        z.object({
          screen: z.string().trim().min(1).max(64),
          seat: z.string().trim().min(1).max(32),
          customerName: z.string().trim().min(2).max(80),
          phone: z
            .string()
            .transform((val) => val.replace(/[\s\-\(\)\.]/g, ""))
            .refine(
              (val) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(val),
              { message: "Must be a valid 10-digit Indian mobile number (e.g. 98765 43210)" }
            )
            .transform((val) => {
              const digits = val.replace(/\D/g, "");
              if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
              if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
              return digits;
            }),
          items: z
            .array(
              z.object({
                itemId: z.string().min(1).max(100),
                quantity: z.number().int().min(1).max(20),
                options: z.array(z.string().max(50)).max(10).optional(),
              })
            )
            .min(1, "Cart cannot be empty")
            .max(30, "Exceeded maximum order items"),
          instructions: z.string().max(200).optional(),
          expectedTotalPaise: z.number().int().positive().optional(),
          showtimeId: z.number().int().positive().optional(),
          sessionToken: z.string().min(20).max(96).optional(),
          seatToken: z.string().min(20).max(128).optional(),
          idempotencyKey: z.string().uuid(),
          consent: checkoutConsentSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        if ((await orderingControl()).paused) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "New orders are temporarily paused by the cinema. Existing order tracking remains available." });
        // Fail before persisting a pending order. Never fall back to the mock
        // gateway when production credentials are absent.
        if (process.env.NODE_ENV !== "test" && !isLivePaymentGatewayConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Online payments are temporarily unavailable.",
          });
        }

        // Enforce anti-spam rate limiting on order creation (max 10 orders per 5 min per IP)
        const clientIp = getClientIp(ctx.req);
        if (!checkRateLimit(`order-create:${clientIp}`, 10, 5 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many order requests. Please wait a few minutes before trying again.",
          });
        }

        if (process.env.NODE_ENV !== "test" && (!input.showtimeId || (!input.sessionToken && !input.seatToken))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid showtime before ordering." });
        }
        if (input.sessionToken) {
          const session = await resolveSessionLink(input.sessionToken);
          if (!session || session.showtimeId !== input.showtimeId || session.screenName !== input.screen) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Scan the active cinema session QR before ordering." });
          }
        }
        if (input.seatToken) {
          const seat = await resolveSeatSession(input.seatToken);
          if (!seat?.show || seat.show.id !== input.showtimeId || seat.screenName !== input.screen || seat.seat !== input.seat) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Your seat or show has changed. Scan your seat QR again." });
          }
        }
        // Never treat an unknown showtime as an open ordering window.
        if (input.showtimeId) {
          const window = await getShowtimeWindow(input.showtimeId);
          if (!window || !window.orderingEnabled) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Ordering is unavailable for this showtime.",
            });
          }
          if (window.screenName !== input.screen) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Screen does not match the selected showtime." });
          }
        }

        const sanitizedName = sanitizeText(input.customerName, 80);
        if (sanitizedName.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid name." });
        const sanitizedInstructions = input.instructions ? sanitizeText(input.instructions, 200) : undefined;

        // Create order initially in PENDING payment status. Kitchen is NOT notified yet!
        const order = await createOrder({
          screen: input.screen,
          seat: input.seat,
          customerName: sanitizedName,
          phone: input.phone,
          items: input.items,
          expectedTotalPaise: input.expectedTotalPaise,
          instructions: sanitizedInstructions,
          source: "ONLINE",
          paymentStatus: "PENDING",
          idempotencyKey: input.idempotencyKey,
          consent: input.consent,
          showtimeId: input.showtimeId,
        });

        const paymentIntent = await ensurePaymentIntent(order);

        const isLiveGateway = isLivePaymentGatewayConfigured();

        return {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            totalPaise: order.totalPaise,
          status: order.status,
          paymentStatus: order.paymentStatus,
          screen: order.screen,
            seat: order.seat,
          },
          paymentIntent,
          isLiveGateway,
        };
      }),

    confirmPayment: publicProcedure
      .input(
        z.object({
          orderId: z.string().min(1).max(80),
          providerOrderId: z.string().min(1).max(128),
          providerPaymentId: z.string().min(1).max(128),
          signature: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientIp = getClientIp(ctx.req);
        if (!checkRateLimit(`confirm-payment:${clientIp}`, 20, 5 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many payment verification attempts.",
          });
        }

        const paymentProvider = getPaymentProvider();
        const isValid = paymentProvider.verifySignature({
          providerOrderId: input.providerOrderId,
          providerPaymentId: input.providerPaymentId,
          signature: input.signature,
        });

        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cryptographic payment signature verification failed. Untrusted payment confirmation.",
          });
        }

        const confirmedOrder = await confirmOrderPayment({
          orderId: input.orderId,
          providerOrderId: input.providerOrderId,
          providerPaymentId: input.providerPaymentId,
          signature: input.signature,
        });

        return {
          success: true,
          orderId: input.orderId,
          orderNumber: confirmedOrder.orderNumber,
          message: "Payment successfully verified and order queued.",
        };
      }),

    track: publicProcedure
      .input(
        z.object({
          orderNumber: z.string().min(3).max(32),
          phoneLast4: z.string().regex(/^\d{4}$/),
        })
      )
      .query(async ({ input, ctx }) => {
        if (!checkRateLimit(`track:${getClientIp(ctx.req)}`, 60, 60000)) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before retrying tracking." });
        }
        const order = await findOrderByNumberAndPhone(input.orderNumber, input.phoneLast4);
        if (!order) {
          return null;
        }
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          screen: order.screen,
          seat: order.seat,
          customerName: order.customerName,
          items: order.items,
          totalPaise: order.totalPaise,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
      }),

    lookupByPhone: publicProcedure
      .input(
        z.object({
          orderNumber: z.string().trim().min(3).max(32),
          phone: z
            .string()
            .transform((val) => val.replace(/[\s\-\(\)\.]/g, ""))
            .refine(
              (val) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(val),
              { message: "Please enter a valid 10-digit Indian mobile number" }
            )
            .transform((val) => {
              const digits = val.replace(/\D/g, "");
              return digits.slice(-10);
            }),
        })
      )
      .query(async ({ input, ctx }) => {
        const clientIp = getClientIp(ctx.req);
        if (!checkRateLimit(`phone-lookup:${clientIp}`, 15, 5 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many phone lookup attempts. Please wait a moment.",
          });
        }

        return (await findOrdersByFullPhone(input.phone)).filter(order => order.orderNumber === input.orderNumber.toUpperCase());
      }),
  }),
  kitchen: router({
    menu: staffProcedure("kitchen:read").query(() => listMenu()),
    setAvailability: staffProcedure("kitchen:read").input(z.object({ id: z.string().min(1).max(100), available: z.boolean() })).mutation(({ input, ctx }) => toggleMenuAvailability(input.id, input.available, ctx.user.name ?? "kitchen")),
    queue: staffProcedure("kitchen:read").query(async () =>
      (await listOrders()).filter((order) => order.status !== "DELIVERED" && order.status !== "CANCELED" && order.paymentStatus === "CONFIRMED")
    ),
    allOrders: staffProcedure("orders:read").query(() => listOrders()),
    updateStatus: staffProcedure("orders:status")
      .input(z.object({ orderId: z.string().min(1), status: z.enum(ORDER_STATUSES) }))
      .mutation(({ input, ctx }) =>
        updateOrderStatus(input.orderId, input.status, ctx.user.name ?? ctx.user.email ?? "staff")
      ),
    undoStatus: staffProcedure("orders:status")
      .input(z.object({ orderId: z.string().min(1), expectedStatus: z.enum(ORDER_STATUSES) }))
      .mutation(({ input, ctx }) =>
        undoOrderStatus(input.orderId, input.expectedStatus, ctx.user.name ?? ctx.user.email ?? "staff")
      ),
    history: staffProcedure("orders:read")
      .input(
        z.object({
          search: z.string().max(80).optional(),
          status: z.enum(["ALL", "DELIVERED", "CANCELED"]).optional(),
          sort: z.enum(["newest", "oldest", "value"]).optional(),
        })
      )
      .query(({ input }) => listOrderHistory(input)),
  }),
  admin: router({
    showtimes: adminProcedure.query(() => listShowtimes()),
    configuredSeats: adminProcedure.query(configuredSeats),
    saveShowtime: adminProcedure.input(manualShowtimeSchema).mutation(({ input, ctx }) => saveManualShowtime(input, ctx.user!.id)),
    // Compatibility with the repository's existing order-delete screen. Direct
    // deletion is intentionally blocked by the reviewed retention workflow.
    deleteOrder: adminProcedure.input(z.object({ orderId: z.string(), developerCode: z.string() })).mutation((): { success: boolean; orderNumber: string } => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Direct deletion is disabled. Use the reviewed retention procedure; legal holds and payment records must be checked." }); }),
    removeStaff: adminProcedure.input(z.object({ email: z.string().email() })).mutation(async ({ input, ctx }) => {
      const email = input.email.trim().toLowerCase();
      if (email === ctx.user!.email?.toLowerCase() || email === process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the owner or your own account" });
      const db = await database();
      if (!db) throw new Error("Database required");
      await db.transaction(async tx => {
        await tx.delete(storeEntities).where(eq(storeEntities.key, `staff:${createHash("sha256").update(email).digest("hex")}`));
        await tx.update(users).set({ role: "user" }).where(eq(users.email, email));
        await tx.insert(auditLogs).values({ actorUserId: ctx.user!.id, action: "STAFF_REMOVED", entityType: "staff", detail: email });
      });
      return { success: true, email };
    }),
    orderingControl: adminProcedure.query(orderingControl),
    setOrderingControl: adminProcedure.input(pauseSchema).mutation(({ input, ctx }) => setOrderingControl(input, ctx.user!.email ?? String(ctx.user!.id))),
    pendingPayments: adminProcedure.query(pendingPayments),
    reconcilePayment: adminProcedure.input(z.object({ orderId: z.number().int().positive() })).mutation(({ input, ctx }) => reconcilePayment(input.orderId, `admin:${ctx.user!.id}`)),
    syncRefund: adminProcedure.input(z.object({ id: z.number().int().positive(), refundId: z.string().regex(/^rfnd_[A-Za-z0-9]+$/) })).mutation(({ input, ctx }) => syncRefund(input.id, input.refundId, ctx.user!.id)),
    privacyRequests: adminProcedure.query(async () => (await readEntities<PrivacyRequest>("privacy")) ?? []),
    savePrivacyRequest: adminProcedure.input(privacySchema).mutation(({ input, ctx }) => savePrivacyRequest(input, ctx.user!.id)),
    exportCustomerData: adminProcedure.input(customerExportInput).mutation(async ({ input, ctx }) => {
      if (!checkRateLimit(`customer-export:${ctx.user!.id}`, 30, 60 * 1000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before exporting more records." });
      ctx.res.setHeader("Cache-Control", "no-store");
      return exportCustomerPage(input.afterId, ctx.user!.id);
    }),
    configureSeats: adminProcedure.input(z.object({ screen: z.string().trim().min(1).max(64), labels: z.array(z.string().trim().regex(/^[A-Z0-9-]{1,16}$/)).min(1).max(1000) })).mutation(async ({ input, ctx }) => {
      const db = await database();
      if (!db) throw new Error("Database required");
      return db.transaction(async tx => {
        await tx.insert(screens).values({ name: input.screen }).onDuplicateKeyUpdate({ set: { name: input.screen } });
        const [screen] = await tx.select().from(screens).where(eq(screens.name, input.screen)).limit(1);
        const rows = Array.from(new Set(input.labels)).map(label => ({ screenId: screen.id, label, qrToken: randomBytes(32).toString("hex") }));
        // One batch instead of hundreds of remote DB round trips. Updating only
        // the existing screen ID preserves saved labels and permanent QR tokens.
        await tx.insert(seats).values(rows).onDuplicateKeyUpdate({ set: { screenId: screen.id } });
        await tx.insert(auditLogs).values({ actorUserId: ctx.user!.id, action: "SEATS_CONFIGURED", entityType: "screen", entityId: String(screen.id), detail: `Added/verified ${input.labels.length} seats` });
        return { success: true };
      });
    }),
    saveMenuItem: staffProcedure("menu:write").input(z.object({ id: z.string().regex(/^[a-z0-9-]{1,100}$/), name: z.string().trim().min(2).max(120), category: z.enum(["Combos", "Popcorn", "Snacks", "Beverages"]), description: z.string().trim().max(500), pricePaise: z.number().int().min(100).max(1000000), discountPercent: z.number().int().min(0).max(90).default(0), available: z.boolean(), options: z.array(z.string().trim().min(1).max(50)).max(10) })).mutation(async ({ input, ctx }) => {
      await writeEntity("menu", input.id, input, ctx.user.email ?? "admin", "MENU_ITEM_SAVED");
      return input;
    }),
    refundRequests: adminProcedure.query(async () => {
      const db = await database();
      return db ? db.select().from(refundTable).orderBy(desc(refundTable.createdAt)).limit(100) : [];
    }),
    stats: staffProcedure("analytics:read").query(() => getStats()),
    orders: staffProcedure("orders:read").query(() => listOrders()),
    menu: staffProcedure("orders:read").query(() => listMenu()),
    seedMenu: staffProcedure("menu:write").mutation(({ ctx }) =>
      seedDefaultMenu(ctx.user.name ?? ctx.user.email ?? "admin")
    ),
    setAvailability: staffProcedure("menu:write")
      .input(z.object({ id: z.string(), available: z.boolean() }))
      .mutation(({ input, ctx }) =>
        toggleMenuAvailability(input.id, input.available, ctx.user.name ?? ctx.user.email ?? "admin")
      ),
    audit: staffProcedure("audit:read").query(() => getAuditLog()),
    shiftSummary: staffProcedure("analytics:read").query(() => getShiftSummary()),
    staff: staffProcedure("staff:write").query(() => listStaff()),
    inviteStaff: staffProcedure("staff:write")
      .input(z.object({ name: z.string().min(2).max(80), email: z.string().email(), role: z.enum(STAFF_ROLES) }))
      .mutation(({ input, ctx }) =>
        inviteStaff(input.name, input.email, input.role, ctx.user.name ?? ctx.user.email ?? "admin")
      ),
    updateStaffRole: staffProcedure("staff:write")
      .input(z.object({ id: z.string(), role: z.enum(STAFF_ROLES) }))
      .mutation(({ input, ctx }) =>
        updateStaffRole(input.id, input.role, ctx.user.name ?? ctx.user.email ?? "admin")
      ),
    sessionLinks: staffProcedure("staff:write")
      .input(z.object({ baseUrl: z.string().url().optional() }).optional())
      .query(({ input }) => listSessionLinks(input?.baseUrl)),
    generateSessionLinks: staffProcedure("staff:write")
      .input(z.object({ baseUrl: z.string().url().optional() }).optional())
      .mutation(({ input }) => generateSessionLinks(input?.baseUrl)),
    refundPreview: adminProcedure
      .input(z.object({ orderId: z.string(), amountPaise: z.number().int().positive(), reason: z.string().min(5) }))
      .mutation(async ({ input, ctx }) => {
        const db = await database();
        if (!db) throw new Error("Database required");
        return db.transaction(async tx => {
          const [order] = await tx.select().from(orderTable).where(eq(orderTable.publicId, input.orderId)).limit(1).for("update");
          if (!order || order.paymentStatus !== "CONFIRMED" || input.amountPaise > order.totalPaise) throw new Error("Invalid paid order or refund amount");
          const [payment] = await tx.select().from(paymentTable).where(eq(paymentTable.orderId, order.id)).limit(1);
          if (!payment) throw new Error("Payment record missing");
          const existing = await tx.select().from(refundTable).where(eq(refundTable.orderId, order.id)).limit(1);
          if (existing.length) return { status: "REVIEW_REQUIRED" as const, message: "A refund review already exists for this order" };
          await tx.insert(refundTable).values({ orderId: order.id, paymentId: payment.id, amountPaise: input.amountPaise, reason: input.reason, approvingAdminId: ctx.user!.id, status: "REQUESTED" });
          await tx.insert(auditLogs).values({ actorUserId: ctx.user!.id, action: "REFUND_REQUESTED", entityType: "order", entityId: input.orderId, detail: input.reason });
          return { status: "REVIEW_REQUIRED" as const, message: "Saved for manual Razorpay dashboard review; no money has been refunded" };
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
