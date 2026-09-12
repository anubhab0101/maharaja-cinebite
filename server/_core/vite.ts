import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const cleanPath = url.split("?")[0];

    // If requesting a missing file (with extension), return 404 instead of SPA index.html
    if (path.extname(cleanPath)) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }

    try {
      const candidates = [
        path.resolve(process.cwd(), "client", "index.html"),
        path.resolve(import.meta.dirname, "../..", "client", "index.html"),
        path.resolve(import.meta.dirname, "..", "client", "index.html"),
      ];
      const clientTemplate =
        candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distCandidates = [
    path.resolve(import.meta.dirname, "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(import.meta.dirname, "../..", "dist", "public"),
    path.resolve(process.cwd(), "public"),
  ];

  const distPath =
    distCandidates.find((candidate) =>
      fs.existsSync(path.resolve(candidate, "index.html"))
    ) || distCandidates[0];

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  } else {
    console.log(`[Production] Serving static client bundle from: ${distPath}`);
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (page navigation only)
  app.use("*", (req, res) => {
    const cleanPath = (req.originalUrl || req.path || "").split("?")[0];
    if (path.extname(cleanPath)) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
