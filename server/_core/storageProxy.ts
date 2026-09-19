import type { Express } from "express";

export function registerStorageProxy(app: Express) {
  // No cinema feature uses this legacy template adapter. Do not turn server
  // Forge credentials into anonymous access to arbitrary storage objects.
  app.get("/manus-storage/*", (_req, res) => {
    res.status(404).send("Not Found");
  });
}
