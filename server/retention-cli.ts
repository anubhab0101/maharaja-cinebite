import "dotenv/config";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { cleanupOrder } from "./retention-cleanup";
import { closeDatabase } from "./db";

const releaseSchema = z.object({
  orderNumber: z.string().regex(/^CB-[A-Fa-f0-9]{24}$/),
  reference: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  allRetentionExpired: z.literal(true),
  noDisputeOrLegalHold: z.literal(true),
  externalCopiesReviewed: z.literal(true),
  webServerStopped: z.literal(true),
}).strict();

async function main() {
  const { values } = parseArgs({ options: { order: { type: "string" }, approval: { type: "string" }, apply: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) { console.log("Preview: pnpm retention:review --order CB-...\nDelete after legal/accounting release, during maintenance: pnpm retention:review --order CB-... --approval release.json --apply\nNo recurring purge is installed. Never fabricate a release."); return; }
  const orderNumber = z.string().regex(/^CB-[A-Fa-f0-9]{24}$/).parse(values.order);
  if (!values.apply) { console.log(JSON.stringify(await cleanupOrder(orderNumber), null, 2)); return; }
  if (!values.approval) throw new Error("A reviewed release file is required");
  const text = await readFile(values.approval, "utf8");
  if (text.length > 8192) throw new Error("Release file too large");
  const approval = releaseSchema.parse(JSON.parse(text));
  if (approval.orderNumber !== orderNumber) throw new Error("Release does not match the exact order");
  console.log(JSON.stringify(await cleanupOrder(orderNumber, approval), null, 2));
}
main().catch(() => { console.error("Retention operation failed or was blocked. Check the preview, exact order, schema and signed-off release. No success is implied; do not retry blindly."); process.exitCode = 1; }).finally(closeDatabase);
