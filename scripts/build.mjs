// A local .env may use NODE_ENV=development. Never ship that React runtime
// or accidentally disable production-only PWA registration in a release build.
process.env.NODE_ENV = "production";
const { build: buildClient } = await import("vite");
const { build: buildServer } = await import("esbuild");
await buildClient();
await buildServer({
  entryPoints: ["server/_core/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
});
