import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { ROLE_PERMISSIONS, StaffRole, can } from '@shared/cinebites';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

function normalizedRole(value: unknown): StaffRole {
  if (value === "admin") return "ADMIN";
  if (typeof value === "string" && value in ROLE_PERMISSIONS) return value as StaffRole;
  return "READ_ONLY";
}

export const staffProcedure = (permission: string) => protectedProcedure.use(
  t.middleware(async opts => {
    const user = opts.ctx.user!;
    const role = normalizedRole(user.role);
    if (!can(role, permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Role ${role} cannot perform ${permission}` });
    }
    return opts.next({ ctx: { ...opts.ctx, user, staffRole: role } });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const user = opts.ctx.user;
    const role = user ? normalizedRole(user.role) : "READ_ONLY";
    if (!user || !["OWNER_ADMIN", "ADMIN"].includes(role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return opts.next({ ctx: { ...opts.ctx, user, staffRole: role } });
  }),
);

export { normalizedRole };
