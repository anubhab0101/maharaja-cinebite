import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, staffProcedure } from "./_core/trpc";
import { database } from "./durable-store";
import { orders, storeEntities } from "../drizzle/schema";
import { checkRateLimit, getClientIp } from "./_core/security";

export const CHAT_WAIT_MS = 20 * 60 * 1000;
export function chatEligible(
  order: { createdAt: string | Date; status: string; paymentStatus: string },
  now = Date.now()
) {
  return (
    order.paymentStatus === "CONFIRMED" &&
    ["NEW", "PREPARING", "READY"].includes(order.status) &&
    now - new Date(order.createdAt).getTime() >= CHAT_WAIT_MS
  );
}
export const chatInput = z.object({
  orderNumber: z.string().regex(/^CB-[A-F0-9]{24}$/),
  message: z
    .object({ id: z.string().uuid(), text: z.string().trim().min(1).max(500) })
    .optional(),
});
type Message = {
  id: string;
  text: string;
  sender: "customer" | "staff";
  sentAt: string;
};
type Thread = { orderNumber: string; messages: Message[]; updatedAt: string };

async function access(
  input: z.infer<typeof chatInput>,
  sender: "customer" | "staff",
  phone?: string
) {
  const db = await database();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
  return db.transaction(async tx => {
    // Shared order lock serializes message writes with delivery + chat deletion.
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, input.orderNumber))
      .limit(1)
      .for("update");
    if (
      !order ||
      (sender === "customer" && order.snapshot?.customerPhone !== phone)
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Order details could not be verified.",
      });
    if (!chatEligible(order)) {
      if (input.message)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Chat opens after 20 minutes for undelivered confirmed orders only.",
        });
      return { open: false, messages: [] as Message[] };
    }
    const key = `order-chat:${input.orderNumber}`;
    const [saved] = await tx
      .select()
      .from(storeEntities)
      .where(eq(storeEntities.key, key))
      .limit(1);
    const thread = saved?.payload as Thread | undefined;
    const messages = thread?.messages ?? [];
    if (input.message && !messages.some(m => m.id === input.message!.id)) {
      if (messages.length >= 100)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Chat limit reached. Please contact the F&B counter.",
        });
      messages.push({
        ...input.message,
        sender,
        sentAt: new Date().toISOString(),
      });
      const payload: Thread = {
        orderNumber: input.orderNumber,
        messages,
        updatedAt: new Date().toISOString(),
      };
      await tx
        .insert(storeEntities)
        .values({ key, kind: "order-chat", payload })
        .onDuplicateKeyUpdate({ set: { payload } });
    }
    return { open: true, messages };
  });
}

export const orderChatRouter = router({
  customer: publicProcedure
    .input(chatInput.extend({ phone: z.string().regex(/^[6-9]\d{9}$/) }))
    .mutation(({ input, ctx }) => {
      const origin = process.env.PUBLIC_APP_URL;
      if (!origin || ctx.req.headers.origin !== new URL(origin).origin)
        throw new TRPCError({ code: "FORBIDDEN" });
      const ip = getClientIp(ctx.req);
      if (
        !checkRateLimit(`chat-read:${ip}`, 120, 60000) ||
        (input.message &&
          (!checkRateLimit(`chat-write:${ip}`, 15, 60000) ||
            !checkRateLimit(`chat-order:${input.orderNumber}`, 15, 60000)))
      )
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait before trying again.",
        });
      ctx.res.setHeader("Cache-Control", "no-store");
      return access(input, "customer", input.phone);
    }),
  inbox: staffProcedure("kitchen:read").query(async () => {
    const db = await database();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
    const rows = await db
      .select({ payload: storeEntities.payload })
      .from(storeEntities)
      .where(eq(storeEntities.kind, "order-chat"));
    return rows
      .map(r => r.payload as Thread)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50)
      .map(t => ({
        orderNumber: t.orderNumber,
        updatedAt: t.updatedAt,
        count: t.messages.length,
        waiting: t.messages.at(-1)?.sender === "customer",
      }));
  }),
  staffRead: staffProcedure("kitchen:read")
    .input(chatInput.pick({ orderNumber: true }))
    .query(({ input }) => access(input, "staff")),
  staffSend: staffProcedure("kitchen:read")
    .input(chatInput.required())
    .mutation(({ input, ctx }) => {
      if (!checkRateLimit(`chat-staff:${ctx.user.id}`, 60, 60000))
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      return access(input, "staff");
    }),
});
