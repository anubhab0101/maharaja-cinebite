import "dotenv/config";
import crypto from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { schemaRepairPlan } from "./schema-repair-plan";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const url = new URL(process.env.DATABASE_URL);
  const target = crypto.createHash("sha256").update(`${url.hostname}:${url.port}${url.pathname}`).digest("hex").slice(0, 16);
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes(`--target=${target}`)) throw new Error("Run preview and provide its exact --target fingerprint.");
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, connectTimeout: 10000 });
  try {
    // Run while all application instances are stopped; MySQL DDL auto-commits.
    const [counts] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM orders");
    const [fields] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM orders");
    const [indexes] = await db.query<RowDataPacket[]>("SHOW INDEX FROM orders");
    const [tables] = await db.query<RowDataPacket[]>("SHOW TABLES LIKE 'store_entities'");
    const groups = new Map<string, RowDataPacket[]>();
    for (const index of indexes) groups.set(index.Key_name, [...(groups.get(index.Key_name) || []), index]);
    const unique = Array.from(groups.values()).filter(group => group.length === 1 && Number(group[0].Non_unique) === 0).map(group => group[0].Column_name);
    const plan = schemaRepairPlan(fields.map(field => field.Field), unique, tables.length > 0, Number(counts[0].n));
    console.log(JSON.stringify({ target, orderCount: Number(counts[0].n), mode: apply ? "apply" : "preview", statements: plan }, null, 2));
    if (!apply) return;
    for (const statement of plan) await db.query(statement);
    await db.query("SELECT publicId, snapshot, providerOrderId, checkoutHash, showtimeId FROM orders LIMIT 0");
    await db.query("SELECT `key`, kind, payload FROM store_entities LIMIT 0");
    console.log("Schema repair verified. No rows deleted; migration history unchanged.");
  } finally { await db.end(); }
}
main().catch((error: { code?: string }) => {
  // Do not log connection strings or driver messages that may contain credentials.
  console.error("Schema repair stopped. Check preview, target and zero-order requirement.", error.code || "VALIDATION_OR_SCHEMA_ERROR");
  process.exitCode = 1;
});
