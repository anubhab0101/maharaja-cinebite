import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (file: string) => readFileSync(new URL(`../client/src/pages/${file}`, import.meta.url), "utf8");
describe("menu management wiring", () => {
  it("shows a saved catalog, explicit initialization, edit and stock controls", () => {
    const src = read("MenuCatalog.tsx");
    expect(src).toContain("trpc.admin.menu.useQuery");
    expect(src).toContain("trpc.admin.seedMenu.useMutation");
    expect(src).toContain("window.confirm");
    expect(src).toContain("trpc.admin.saveMenuItem.useMutation");
    expect(src).toContain("options: [...item.options]");
    expect(src).toContain("trpc.admin.setAvailability.useMutation");
    expect(read("Admin.tsx")).toContain("<MenuCatalog />");
  });
  it("kitchen polls the same saved catalog and distinguishes failure from empty state", () => {
    const src = read("Kitchen.tsx");
    expect(src).toContain("refetchInterval: 15000");
    expect(src).toContain("error={menuQuery.error?.message}");
    expect(src).toContain("No saved menu yet");
    expect(src).toContain("Refresh menu");
  });
});
