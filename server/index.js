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
import { cleanupExpiredAudio } from "./domain/speechService.js";

const app = express();
const port = Number(process.env.LOCAL_API_PORT || 8787);
const host = process.env.LOCAL_API_HOST || "0.0.0.0";
const apiAuthRequired = process.env.LOCAL_API_AUTH_REQUIRED === "true";
const appOrigin = String(process.env.APP_ORIGIN || "").replace(/\/+$/, "");
const clients = new Set();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
const buildInfoPath = path.join(rootDir, "server", "build-info.json");
const intakeAudioDir = path.join(path.dirname(dbPath), "intake-audio");
cleanupExpiredAudio(intakeAudioDir);
setInterval(() => cleanupExpiredAudio(intakeAudioDir), 60 * 60 * 1000).unref();
let buildInfo = {};
try { buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8")); } catch { buildInfo = {}; }
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

// 20 MB audio becomes roughly 26.7 MB after base64 encoding.
app.use(express.json({ limit: "30mb" }));
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
  intakeAudioDir,
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
  res.json({ ok: true, appVersion: packageVersion, buildSha: process.env.BUILD_SHA || buildInfo.sha || "unknown", buildTime: process.env.BUILD_TIME || buildInfo.time || "unknown", dbPath, serverVersion: getServerVersion() });
});

registerAuthRoutes(app, { ...routeContext, ...auth });
app.use("/api", auth.requireApiAuth);
registerUtilityRoutes(app, routeContext);
registerDataRoutes(app, routeContext);

function writeDigestNotification(digest) {
  const row = db.prepare("SELECT value, version FROM app_data WHERE key = ?").get("appNotifications");
  const notifications = parseJson(row?.value, []);
  const notification = {
    id: `digest-${digest.mode}-${digest.today}`,
    type: "task-digest",
    title: digest.title,
    detail: `${digest.count} 项任务已汇总，请查看工作备忘。`,
    mode: digest.mode,
    createdAt: nowIso(),
    read: false,
  };
  const next = [notification, ...(Array.isArray(notifications) ? notifications : []).filter((item) => item.id !== notification.id)].slice(0, 200);
  const timestamp = nowIso();
  const version = (row?.version || 0) + 1;
  db.prepare(`INSERT INTO app_data (key, value, createdAt, updatedAt, version, clientId, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, version = excluded.version, clientId = excluded.clientId, updatedBy = excluded.updatedBy`).run("appNotifications", JSON.stringify(next), timestamp, timestamp, version, "scheduler", "system");
  emitEvent({ type: "app_data_changed", key: "appNotifications", value: next, version });
}

wecomNotifier.startScheduledDigest(() => {
  const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get("workMemos");
  return parseJson(row?.value, []);
}, writeDigestNotification);

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
  console.log(`Enterprise WeChat notifications: ${wecomNotifier.enabled ? `enabled (summary ${wecomNotifier.eveningHour}:00, reminder ${wecomNotifier.morningHour}:00)` : "disabled; set WECOM_WEBHOOK_URL to enable"}`);
});
