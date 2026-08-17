import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, dbPath, uploadsDir, backupsDir, projectFilesDir, parseJson, toEntity, insertSyncEvent, getServerVersion } from "./db.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerDataRoutes } from "./routes/dataRoutes.js";
import { registerUtilityRoutes } from "./routes/utilityRoutes.js";
import { createWecomNotifier } from "./services/wecomNotifier.js";

const app = express();
const port = Number(process.env.LOCAL_API_PORT || 8787);
const host = process.env.LOCAL_API_HOST || "0.0.0.0";
const apiAuthRequired = process.env.LOCAL_API_AUTH_REQUIRED === "true";
const appOrigin = String(process.env.APP_ORIGIN || "").replace(/\/+$/, "");
const clients = new Set();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
const wecomNotifier = createWecomNotifier({ nowIso: () => new Date().toISOString() });

function nowIso() {
  return new Date().toISOString();
}

function clientId(req) {
  return req.header("X-Client-Id") || req.body?.clientId || "unknown-client";
}

function userId(req) {
  return req.authUser?.id || req.header("X-User-Id") || req.body?.updatedBy || "admin-local";
}

function emitEvent(event) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach((client) => client.write(message));
}

app.use(express.json({ limit: "25mb" }));
app.use("/uploads", express.static(uploadsDir));

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (!appOrigin || !requestOrigin || requestOrigin === appOrigin) {
    res.header("Access-Control-Allow-Origin", requestOrigin || appOrigin || "*");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Id, X-User-Id");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const auth = createAuthMiddleware({ db, apiAuthRequired, nowIso });
const routeContext = {
  db,
  dbPath,
  uploadsDir,
  backupsDir,
  projectFilesDir,
  parseJson,
  toEntity,
  insertSyncEvent,
  getServerVersion,
  clients,
  emitEvent,
  nowIso,
  clientId,
  userId,
  wecomNotifier,
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, appVersion: packageVersion, buildSha: process.env.BUILD_SHA || "unknown", dbPath, serverVersion: getServerVersion() });
});

registerAuthRoutes(app, { ...routeContext, ...auth });
app.use("/api", auth.requireApiAuth);
registerUtilityRoutes(app, routeContext);
registerDataRoutes(app, routeContext);

wecomNotifier.startDailyReminder(() => {
  const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get("workMemos");
  return parseJson(row?.value, []);
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "api_not_found" });
});

if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir, { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`Local backend listening on http://${host}:${port}`);
  console.log(`SQLite database: ${dbPath}`);
  if (fs.existsSync(path.join(distDir, "index.html"))) console.log(`Web app served from ${distDir}`);
  console.log(`Enterprise WeChat notifications: ${wecomNotifier.enabled ? `enabled (daily ${wecomNotifier.dailyHour}:00)` : "disabled; set WECOM_WEBHOOK_URL to enable"}`);
});
