import "dotenv/config";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb, closeDatabase } from "./db";

async function main() {
  if (process.env.ALLOW_DATABASE_MIGRATION !== "yes") throw new Error("Migration not authorized. Verify the database target and backup, then set ALLOW_DATABASE_MIGRATION=yes for this command only.");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations completed. Run staging restart/payment acceptance tests before deployment.");
}
main().catch(() => { console.error("Migration failed; inspect database schema/history before retrying. Credentials are not logged."); process.exitCode = 1; }).finally(closeDatabase);
