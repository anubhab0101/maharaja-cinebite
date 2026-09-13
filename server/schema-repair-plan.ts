/** Additive repair for legacy pilot databases without Drizzle history. Never drops data. */
const columns: Record<string, string> = {
  publicId: "varchar(80)", snapshot: "json", providerOrderId: "varchar(128)",
  checkoutHash: "varchar(64)", showtimeId: "int",
};
export function schemaRepairPlan(existingColumns: string[], uniqueColumns: string[], hasStore: boolean, orderCount: number) {
  if (orderCount !== 0) throw new Error("Repair requires zero orders; populated databases need reviewed backfill.");
  for (const name of ["id", "orderNumber", "status", "paymentStatus", "idempotencyKey"]) {
    if (!existingColumns.includes(name)) throw new Error("Unsupported legacy orders schema.");
  }
  const statements: string[] = [];
  if (!hasStore) statements.push("CREATE TABLE `store_entities` (`key` varchar(160) NOT NULL PRIMARY KEY, `kind` varchar(20) NOT NULL, `payload` json NOT NULL)");
  for (const [name, type] of Object.entries(columns)) {
    if (!existingColumns.includes(name)) statements.push(`ALTER TABLE \`orders\` ADD COLUMN \`${name}\` ${type}`);
  }
  for (const name of ["publicId", "providerOrderId"]) {
    if (!uniqueColumns.includes(name)) statements.push(`ALTER TABLE \`orders\` ADD CONSTRAINT \`orders_${name}_unique\` UNIQUE (\`${name}\`)`);
  }
  return statements;
}
