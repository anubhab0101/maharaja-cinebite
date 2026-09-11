import { eq } from "drizzle-orm";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, User, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: MySql2Database<any> | null = null;
let _pool: mysql.Pool | null = null;
const memoryUsers = new Map<string, User>();

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (!_pool) {
        _pool = mysql.createPool({
          uri: process.env.DATABASE_URL,
          ssl: {
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
          },
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
      }
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  // Always keep in-memory cache updated for resilience
  const existing = memoryUsers.get(user.openId);
  const now = new Date();
  const isOwner = user.openId === ENV.ownerOpenId ||
    (user.email && (user.email.toLowerCase() === ENV.ownerEmail || ENV.adminEmails.includes(user.email.toLowerCase())));
  const assignedRole = isOwner ? "OWNER_ADMIN" : (user.role ?? existing?.role ?? "READ_ONLY");

  const record: User = {
    id: existing?.id ?? (memoryUsers.size + 1),
    openId: user.openId,
    name: user.name ?? existing?.name ?? null,
    email: user.email ?? existing?.email ?? null,
    loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
    role: assignedRole,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
  memoryUsers.set(user.openId, record);

  const db = await getDb();
  if (!db) {
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    values.role = assignedRole;
    updateSet.role = assignedRole;

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    // Don't rethrow if memory storage succeeded
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) {
    return memoryUsers.get(openId);
  }

  try {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    if (result.length > 0) return result[0];
  } catch (err) {
    console.warn("[Database] Error querying user, falling back to memory:", err);
  }

  return memoryUsers.get(openId);
}
