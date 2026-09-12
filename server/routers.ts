import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, staffProcedure, adminProcedure } from "./_core/trpc";
import {
  DEFAULT_MENU_ITEMS,
  createOrder,
  confirmOrderPayment,
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
  deleteOrderFromDatabase,
} from "./cinebites-store";
import { ORDER_STATUSES, STAFF_ROLES } from "@shared/cinebites";
import { getShowtimeWindow, listShowtimeDates, listShowtimes } from "./showtimes";
import { generateSessionLinks, listSessionLinks, resolveSessionLink } from "./session-links";
import { getPaymentProvider, isLivePaymentGatewayConfigured } from "./payment-provider";
import { sanitizeText, checkRateLimit } from "./_core/security";

export const appRouter = router({
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
    menu: publicProcedure.query(() => {
      const current = listMenu();
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
          screen: z.string().min(1).max(64),
          seat: z.string().min(1).max(32),
          customerName: z.string().min(2).max(80),
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
                itemId: z.string().min(1),
                quantity: z.number().int().min(1).max(20),
                options: z.array(z.string().max(50)).optional(),
              })
            )
            .min(1, "Cart cannot be empty")
            .max(30, "Exceeded maximum order items"),
          instructions: z.string().max(200).optional(),
          showtimeId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Fail before persisting a pending order. Production must never fall
        // back to the mock gateway when Razorpay credentials are absent.
        if (process.env.NODE_ENV === "production" && !isLivePaymentGatewayConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Online payments are temporarily unavailable.",
          });
        }

        // Enforce anti-spam rate limiting on order creation (max 10 orders per 5 min per IP)
        const forwarded = ctx.req.headers["x-forwarded-for"];
        const clientIp = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : ctx.req.socket.remoteAddress) || "unknown";
        if (!checkRateLimit(`order-create:${clientIp}`, 10, 5 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many order requests. Please wait a few minutes before trying again.",
          });
        }

        // Enforce showtime window if showtime ID is provided
        if (input.showtimeId) {
          const window = await getShowtimeWindow(input.showtimeId);
          if (window && window.state !== "OPEN") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Ordering is currently not open for this showtime (Status: ${window.state}).`,
            });
          }
        }

        const sanitizedName = sanitizeText(input.customerName, 80);
        const sanitizedInstructions = input.instructions ? sanitizeText(input.instructions, 200) : undefined;

        // Create order initially in PENDING payment status. Kitchen is NOT notified yet!
        const order = await createOrder({
          screen: input.screen,
          seat: input.seat,
          customerName: sanitizedName,
          phone: input.phone,
          items: input.items,
          instructions: sanitizedInstructions,
          source: "ONLINE",
          paymentStatus: "PENDING",
        });

        const paymentProvider = getPaymentProvider();
        const paymentIntent = await paymentProvider.createIntent({
          amountPaise: order.totalPaise,
          receipt: order.orderNumber,
        });

        const isLiveGateway = isLivePaymentGatewayConfigured();

        return {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            totalPaise: order.totalPaise,
            status: order.status,
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
          orderId: z.string().min(1),
          providerOrderId: z.string().min(1),
          providerPaymentId: z.string().min(1),
          signature: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const forwarded = ctx.req.headers["x-forwarded-for"];
        const clientIp = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : ctx.req.socket.remoteAddress) || "unknown";
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
          phoneLast4: z.string().length(4),
        })
      )
      .query(({ input }) => {
        const order = findOrderByNumberAndPhone(input.orderNumber, input.phoneLast4);
        if (!order) {
          return null;
        }
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
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
      .query(({ input, ctx }) => {
        const forwarded = ctx.req.headers["x-forwarded-for"];
        const clientIp = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : ctx.req.socket.remoteAddress) || "unknown";
        if (!checkRateLimit(`phone-lookup:${clientIp}`, 15, 5 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many phone lookup attempts. Please wait a moment.",
          });
        }

        return findOrdersByFullPhone(input.phone);
      }),
  }),
  kitchen: router({
    queue: staffProcedure("kitchen:read").query(() =>
      listOrders().filter((order) => order.status !== "DELIVERED" && order.status !== "CANCELED" && order.paymentStatus === "CONFIRMED")
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
    menu: staffProcedure("kitchen:read").query(() => listMenu()),
    setAvailability: staffProcedure("kitchen:read")
      .input(z.object({ id: z.string(), available: z.boolean() }))
      .mutation(({ input, ctx }) =>
        toggleMenuAvailability(input.id, input.available, ctx.user.name ?? ctx.user.email ?? "kitchen")
      ),
  }),
  admin: router({
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
      .mutation(({ input }) => ({
        status: "REVIEW_REQUIRED" as const,
        ...input,
        message: "Exceptional refunds require a confirmed provider integration and admin approval.",
      })),
    deleteOrder: staffProcedure("orders:read")
      .input(
        z.object({
          orderId: z.string().min(1),
          developerCode: z.string().min(1, "Developer authorization code is required"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        const role = user ? (user.role as string) : "READ_ONLY";
        if (!["OWNER_ADMIN", "ADMIN"].includes(role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only cinema administrators can delete orders from database.",
          });
        }

        try {
          return await deleteOrderFromDatabase(
            input.orderId,
            input.developerCode,
            user?.name ?? user?.email ?? "admin"
          );
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message || "Failed to delete order",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
