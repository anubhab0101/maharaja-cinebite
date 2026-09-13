import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { loadOptionalFonts } from "../client/src/lib/fonts";
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());
describe("frontend performance safeguards", () => {
  it("loads Home only on its route, with a full-height loading shell", () => {
    const app = read("../client/src/App.tsx");
    expect(app).toContain('const Home = lazy(() => import("./pages/Home"))');
    expect(app).toContain('className="route-shell"');
    expect(read("../client/src/index.css")).toContain("min-height: 100svh");
  });
  it("does not chain a render-blocking Google Font CSS import", () => {
    expect(read("../client/src/index.css")).not.toContain("@import url(");
  });
  it("loads optional fonts without inline handlers or blocking media", () => {
    const link: any = {};
    const appendChild = vi.fn();
    const getElementById = vi.fn().mockReturnValue(null);
    vi.stubGlobal("document", { getElementById, createElement: () => link, head: { appendChild } });
    loadOptionalFonts();
    expect(link.media).toBe("print");
    expect(link.href).toContain("display=optional");
    link.onload();
    expect(link.media).toBe("all");
    getElementById.mockReturnValue(link);
    loadOptionalFonts();
    expect(appendChild).toHaveBeenCalledOnce();
  });
});
