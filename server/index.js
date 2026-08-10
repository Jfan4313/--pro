import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { db, dbPath, uploadsDir, backupsDir, projectFilesDir, parseJson, toEntity, insertSyncEvent, getServerVersion } from "./db.js";
import { createSessionToken, hashPassword, hashToken, publicUser, verifyPassword } from "./auth.js";

const app = express();
const port = Number(process.env.LOCAL_API_PORT || 8787);
const host = process.env.LOCAL_API_HOST || "0.0.0.0";
const apiAuthRequired = process.env.LOCAL_API_AUTH_REQUIRED === "true";
const appOrigin = String(process.env.APP_ORIGIN || "").replace(/\/+$/, "");
const clients = new Set();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

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

function nowIso() {
  return new Date().toISOString();
}

function clientId(req) {
  return req.header("X-Client-Id") || req.body?.clientId || "unknown-client";
}

function userId(req) {
  return req.authUser?.id || req.header("X-User-Id") || req.body?.updatedBy || "admin-local";
}

function findAuthenticatedUser(req) {
  const authorization = req.header("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.query?.token;
  if (!token) return null;
  return db.prepare(`
    SELECT users.* FROM auth_sessions
    JOIN users ON users.id = auth_sessions.userId
    WHERE auth_sessions.tokenHash = ? AND auth_sessions.expiresAt > ? AND users.status = 'active'
  `).get(hashToken(token), nowIso());
}

function requireAuth(req, res, next) {
  const user = findAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "authentication_required" });
  req.authUser = user;
  next();
}

function requireApiAuth(req, res, next) {
  const user = findAuthenticatedUser(req);
  if (user) req.authUser = user;
  if (apiAuthRequired && !user) return res.status(401).json({ error: "authentication_required" });
  next();
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.authUser.role !== "admin") return res.status(403).json({ error: "admin_required" });
    next();
  });
}

function emitEvent(event) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach((client) => client.write(message));
}

function sanitizePathSegment(value = "未命名") {
  const text = String(value || "未命名")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "未命名";
}

function readAppDataValue(key, fallback) {
  const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get(key);
  return row ? parseJson(row.value, fallback) : fallback;
}

function writeAppDataValue(key, value, req) {
  const timestamp = nowIso();
  const existing = db.prepare("SELECT version FROM app_data WHERE key = ?").get(key);
  const version = (existing?.version || 0) + 1;
  db.prepare(`
    INSERT INTO app_data (key, value, createdAt, updatedAt, version, clientId, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt,
      version = excluded.version,
      clientId = excluded.clientId,
      updatedBy = excluded.updatedBy
  `).run(key, JSON.stringify(value), timestamp, timestamp, version, req ? clientId(req) : "server", req ? userId(req) : "system");
  return { key, value, updatedAt: timestamp, version };
}

function getFileSettings() {
  const settings = readAppDataValue("fileSettings", {});
  const rootPath = path.resolve(settings.rootPath || projectFilesDir);
  return {
    rootPath,
    defaultRootPath: projectFilesDir,
    autoRename: settings.autoRename !== false,
    autoCreateFolders: settings.autoCreateFolders !== false,
  };
}

function ensureFileRoot(rootPath = getFileSettings().rootPath) {
  fs.mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

function getProjectCode(project = {}) {
  return sanitizePathSegment(project.projectCode || project.code || project.id || "PROJECT");
}

function getStageCode(stage = {}) {
  const match = String(stage.name || stage.id || "").match(/[①②③④⑤⑥⑦⑧⑨⑩]|\d+/);
  const numberMap = { "①": "01", "②": "02", "③": "03", "④": "04", "⑤": "05", "⑥": "06", "⑦": "07", "⑧": "08", "⑨": "09", "⑩": "10" };
  const raw = match?.[0] || String(stage.id || "stage").split("_")[0];
  return numberMap[raw] || String(raw).padStart(2, "0");
}

function getStageCleanName(stage = {}) {
  return sanitizePathSegment(String(stage.name || stage.id || "阶段").replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "").trim());
}

function getProjectFolderName(project = {}) {
  return `${getProjectCode(project)}_${sanitizePathSegment(project.name || project.projectName || "未命名项目")}`;
}

function getStageFolderName(stage = {}) {
  return `${getStageCode(stage)}_${getStageCleanName(stage)}`;
}

function ensureProjectStageFolders(project, stages = []) {
  const rootPath = ensureFileRoot();
  const projectFolder = getProjectFolderName(project);
  const projectPath = path.join(rootPath, projectFolder);
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.join(projectPath, "参建单位资料"), { recursive: true });

  const createdStages = [];
  for (const stage of stages) {
    const stageFolder = getStageFolderName(stage);
    const stagePath = path.join(projectPath, stageFolder);
    const pendingPath = path.join(stagePath, "待提交");
    const archivedPath = path.join(stagePath, "已归档");
    fs.mkdirSync(pendingPath, { recursive: true });
    fs.mkdirSync(archivedPath, { recursive: true });

    const checklistPath = path.join(stagePath, "文件清单.json");
    if (!fs.existsSync(checklistPath)) {
      fs.writeFileSync(checklistPath, JSON.stringify({
        projectId: project.id,
        projectName: project.name || project.projectName || "",
        stageId: stage.id,
        stageName: stage.name,
        expectedFiles: stage.files || [],
        createdAt: nowIso(),
      }, null, 2));
    }
    createdStages.push({ stageId: stage.id, stageName: stage.name, path: stagePath });
  }

  return { rootPath, projectFolder, projectPath, stages: createdStages };
}

function getVersionForFile(targetDir, stem, ext) {
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escapedStem}_V(\\d+)_(\\d{8})${escapedExt}$`);
  const versions = fs.existsSync(targetDir)
    ? fs.readdirSync(targetDir)
      .map((name) => Number(name.match(matcher)?.[1] || 0))
      .filter(Boolean)
    : [];
  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
}

function buildProjectStoredFile({ project, stage, fileType, filename, targetDir }) {
  const ext = path.extname(filename || "");
  const originalBase = path.basename(filename || "资料", ext);
  const dateStamp = formatDate(new Date()).replace(/-/g, "");
  const stem = [
    getProjectCode(project),
    sanitizePathSegment(project.name || project.projectName || "项目"),
    getStageCode(stage),
    sanitizePathSegment(fileType || originalBase || "资料"),
    sanitizePathSegment(originalBase || "资料"),
  ].filter(Boolean).join("_");
  const versionNumber = getVersionForFile(targetDir, stem, ext);
  const version = `V${versionNumber}`;
  return {
    originalBase,
    version,
    storedName: `${stem}_${version}_${dateStamp}${ext}`,
  };
}

function listProjectFilesFromDisk({ project, stages = [] }) {
  const rootPath = ensureFileRoot();
  const projectFolder = getProjectFolderName(project);
  const projectPath = path.join(rootPath, projectFolder);
  if (!fs.existsSync(projectPath)) {
    return { rootPath, projectFolder, projectPath, stages: [] };
  }

  const stageByFolder = new Map(stages.map((stage) => [getStageFolderName(stage), stage]));
  const stageFolders = fs.readdirSync(projectPath, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  const listedStages = stageFolders.map((folder) => {
    const stage = stageByFolder.get(folder) || {};
    const stagePath = path.join(projectPath, folder);
    const files = ["待提交", "已归档"].flatMap((bucket) => {
      const bucketPath = path.join(stagePath, bucket);
      if (!fs.existsSync(bucketPath)) return [];
      return fs.readdirSync(bucketPath, { withFileTypes: true })
        .filter((item) => item.isFile())
        .map((item) => {
          const absolutePath = path.join(bucketPath, item.name);
          const stat = fs.statSync(absolutePath);
          return {
            name: item.name,
            bucket,
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            relativePath: path.relative(rootPath, absolutePath),
          };
        });
    });
    return {
      stageId: stage.id || folder,
      stageName: stage.name || folder,
      folder,
      files,
    };
  });

  return { rootPath, projectFolder, projectPath, stages: listedStages };
}

function resolveProjectFile(relativePath = "") {
  const rootPath = ensureFileRoot();
  const cleanRelativePath = String(relativePath || "");
  const absolutePath = path.resolve(rootPath, cleanRelativePath);
  if (!absolutePath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }
  return { rootPath, absolutePath };
}

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, "");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDeadline(text = "") {
  const source = String(text);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (source.includes("今天")) return formatDate(today);
  if (source.includes("明天")) return formatDate(addDays(today, 1));
  if (source.includes("后天")) return formatDate(addDays(today, 2));

  const explicitDate = source.match(/(20\d{2})[-年./](\d{1,2})[-月./](\d{1,2})日?/);
  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDay = source.match(/(\d{1,2})月(\d{1,2})日?/);
  if (monthDay) {
    const [, month, day] = monthDay;
    return `${today.getFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const weekdayMatch = source.match(/(?:周|星期)([一二三四五六日天])/);
  if (weekdayMatch) {
    const map = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
    const target = map[weekdayMatch[1]];
    const current = today.getDay();
    let diff = target - current;
    if (diff <= 0) diff += 7;
    return formatDate(addDays(today, diff));
  }

  return "";
}

function analyzeIntake({ inputType, text = "", attachmentUrl = "", projects = [], personnel = [] }) {
  const trimmed = String(text || "").trim();
  const normalized = normalizeText(trimmed);
  const project = projects.find((item) => {
    const name = normalizeText(item?.name || item?.projectName || "");
    if (!name) return false;
    const shortName = name.slice(0, 2);
    return normalized.includes(name) || (shortName.length >= 2 && normalized.includes(shortName));
  });
  const person = personnel.find((item) => {
    const name = normalizeText(item?.name || "");
    return name && normalized.includes(name);
  });
  const inferredAssignee = !person
    ? (String(text || "").match(/(?:安排|通知|协调|交给|让)([\u4e00-\u9fa5]{2,4})(?:去|到|负责|处理|跟进|检查|对接)/)?.[1] || "")
    : "";
  const deadline = parseLocalDeadline(trimmed);
  const titleSource = trimmed || (attachmentUrl ? "根据附件补充待办事项" : "");
  const title = titleSource.length > 40 ? `${titleSource.slice(0, 40)}...` : titleSource;
  const needsManualReview = inputType !== "text" || !project || !title;

  return {
    title,
    projectId: project?.id || "",
    projectName: project?.name || "",
    assignee: person?.name || inferredAssignee,
    deadline,
    summary: trimmed || (attachmentUrl ? `来源附件：${attachmentUrl}` : ""),
    confidence: inputType === "text" ? (project || person || deadline ? 0.55 : 0.25) : 0.1,
    needsManualReview,
  };
}

function saveEntity({ resource, id, payload, deletedAt = null, baseVersion, req }) {
  const existing = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(resource, id);
  if (existing && typeof baseVersion === "number" && existing.version > baseVersion) {
    return {
      conflict: {
        operation: { resource, recordId: id, payload, baseVersion, clientId: clientId(req), createdAt: nowIso(), type: deletedAt ? "delete" : "upsert" },
        serverRecord: toEntity(existing),
        reason: "version_conflict",
      },
    };
  }

  const timestamp = nowIso();
  const metadata = {
    createdAt: existing?.createdAt || payload.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt,
    version: (existing?.version || 0) + 1,
    clientId: clientId(req),
    updatedBy: userId(req),
  };
  const storedPayload = { ...payload };
  for (const key of ["id", "createdAt", "updatedAt", "deletedAt", "version", "clientId", "updatedBy"]) {
    delete storedPayload[key];
  }

  db.prepare(`
    INSERT INTO entity_records (resource, id, payload, createdAt, updatedAt, deletedAt, version, clientId, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resource, id) DO UPDATE SET
      payload = excluded.payload,
      updatedAt = excluded.updatedAt,
      deletedAt = excluded.deletedAt,
      version = excluded.version,
      clientId = excluded.clientId,
      updatedBy = excluded.updatedBy
  `).run(resource, id, JSON.stringify(storedPayload), metadata.createdAt, metadata.updatedAt, metadata.deletedAt, metadata.version, metadata.clientId, metadata.updatedBy);

  const record = { ...storedPayload, id, ...metadata };
  const serverVersion = insertSyncEvent({
    resource,
    recordId: id,
    operation: deletedAt ? "delete" : "upsert",
    payload: record,
    clientId: metadata.clientId,
    updatedBy: metadata.updatedBy,
  });
  emitEvent({ type: "entity_changed", resource, record, serverVersion });
  return { record, serverVersion };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath, serverVersion: getServerVersion() });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE lower(username) = ?").get(username);
  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const token = createSessionToken();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?").run(timestamp);
  db.prepare("INSERT INTO auth_sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent) VALUES (?, ?, ?, ?, ?, ?)")
    .run(hashToken(token), user.id, timestamp, expiresAt, timestamp, req.header("User-Agent") || "");
  db.prepare("UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, user.id);
  res.json({ token, expiresAt, user: publicUser({ ...user, lastLoginAt: timestamp, updatedAt: timestamp }) });
});

app.post("/api/auth/register", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const phone = String(req.body?.phone || "").trim();

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: "invalid_username" });
  }
  if (!name || name.length > 40) {
    return res.status(400).json({ error: "invalid_name" });
  }
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: "weak_password" });
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (phone && (!/^[0-9+\s-]{6,24}$/.test(phone))) {
    return res.status(400).json({ error: "invalid_phone" });
  }
  if (db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username)) {
    return res.status(409).json({ error: "username_exists" });
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO users (
      id, username, name, email, phone, role, passwordHash, status,
      permissions, mustChangePassword, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, 'project_manager', ?, 'active', NULL, 0, ?, ?)
  `).run(id, username, name, email, phone, hashPassword(password), timestamp, timestamp);

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO auth_sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hashToken(token), id, timestamp, expiresAt, timestamp, req.header("User-Agent") || "");

  res.status(201).json({
    token,
    expiresAt,
    user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)),
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token) db.prepare("DELETE FROM auth_sessions WHERE tokenHash = ?").run(hashToken(token));
  res.json({ ok: true });
});

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!verifyPassword(currentPassword, req.authUser.passwordHash)) return res.status(400).json({ error: "current_password_incorrect" });
  if (newPassword.length < 8) return res.status(400).json({ error: "password_too_short" });
  const timestamp = nowIso();
  db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0, updatedAt = ? WHERE id = ?")
    .run(hashPassword(newPassword), timestamp, req.authUser.id);
  db.prepare("DELETE FROM auth_sessions WHERE userId = ? AND tokenHash != ?")
    .run(req.authUser.id, hashToken(String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "")));
  res.json({ ok: true });
});

app.get("/api/accounts", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY createdAt ASC").all().map(publicUser);
  res.json(users);
});

app.post("/api/accounts", requireAdmin, (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || !name || password.length < 8) return res.status(400).json({ error: "invalid_account_fields" });
  if (db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username)) return res.status(409).json({ error: "username_exists" });
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  db.prepare(`INSERT INTO users (id, username, name, email, phone, role, passwordHash, status, permissions, mustChangePassword, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, ?)`)
    .run(id, username, name, String(req.body?.email || ""), String(req.body?.phone || ""), String(req.body?.role || "viewer"), hashPassword(password), Array.isArray(req.body?.permissions) ? JSON.stringify(req.body.permissions) : null, timestamp, timestamp);
  res.status(201).json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
});

app.put("/api/accounts/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "account_not_found" });
  if (existing.id === req.authUser.id && req.body?.status === "disabled") return res.status(400).json({ error: "cannot_disable_self" });
  const timestamp = nowIso();
  db.prepare(`UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ?, permissions = ?, updatedAt = ? WHERE id = ?`)
    .run(String(req.body?.name ?? existing.name), String(req.body?.email ?? existing.email ?? ""), String(req.body?.phone ?? existing.phone ?? ""), String(req.body?.role ?? existing.role), String(req.body?.status ?? existing.status), Array.isArray(req.body?.permissions) ? JSON.stringify(req.body.permissions) : existing.permissions, timestamp, existing.id);
  if (req.body?.status === "disabled") db.prepare("DELETE FROM auth_sessions WHERE userId = ?").run(existing.id);
  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id)));
});

app.post("/api/accounts/:id/reset-password", requireAdmin, (req, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 8) return res.status(400).json({ error: "password_too_short" });
  const timestamp = nowIso();
  const result = db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 1, updatedAt = ? WHERE id = ?").run(hashPassword(password), timestamp, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "account_not_found" });
  db.prepare("DELETE FROM auth_sessions WHERE userId = ?").run(req.params.id);
  res.json({ ok: true });
});

app.use("/api", requireApiAuth);

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "connected", serverVersion: getServerVersion() })}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.get("/api/app-data/:key", (req, res) => {
  const row = db.prepare("SELECT * FROM app_data WHERE key = ?").get(req.params.key);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ key: row.key, value: parseJson(row.value), updatedAt: row.updatedAt, version: row.version });
});

app.put("/api/app-data/:key", (req, res) => {
  const timestamp = nowIso();
  const existing = db.prepare("SELECT version FROM app_data WHERE key = ?").get(req.params.key);
  const version = (existing?.version || 0) + 1;
  db.prepare(`
    INSERT INTO app_data (key, value, createdAt, updatedAt, version, clientId, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt,
      version = excluded.version,
      clientId = excluded.clientId,
      updatedBy = excluded.updatedBy
  `).run(req.params.key, JSON.stringify(req.body.value), timestamp, timestamp, version, clientId(req), userId(req));
  const serverVersion = insertSyncEvent({
    resource: "app_data",
    recordId: req.params.key,
    operation: "upsert",
    payload: { key: req.params.key, value: req.body.value, updatedAt: timestamp, version },
    clientId: clientId(req),
    updatedBy: userId(req),
  });
  emitEvent({ type: "app_data_changed", key: req.params.key, value: req.body.value, version, serverVersion });
  res.json({ key: req.params.key, value: req.body.value, updatedAt: timestamp, version });
});

app.post("/api/upload", (req, res) => {
  const { filename, contentBase64 } = req.body;
  if (!filename || !contentBase64) return res.status(400).json({ error: "filename_and_content_required" });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${Date.now()}-${safeName}`;
  const target = path.join(uploadsDir, storedName);
  fs.writeFileSync(target, Buffer.from(contentBase64, "base64"));
  res.status(201).json({ id: crypto.randomUUID(), filename: safeName, url: `/uploads/${storedName}`, createdAt: nowIso() });
});

app.post("/api/intake/analyze", (req, res) => {
  const inputType = req.body?.inputType;
  if (!["text", "image", "audio"].includes(inputType)) {
    return res.status(400).json({ error: "invalid_input_type" });
  }
  res.json(analyzeIntake(req.body || {}));
});

app.get("/api/file-settings", (_req, res) => {
  res.json(getFileSettings());
});

app.put("/api/file-settings", (req, res) => {
  const current = getFileSettings();
  const rootPath = String(req.body?.rootPath || current.rootPath).trim();
  if (!rootPath) return res.status(400).json({ error: "root_path_required" });

  const next = {
    rootPath: path.resolve(rootPath),
    autoRename: req.body?.autoRename !== false,
    autoCreateFolders: req.body?.autoCreateFolders !== false,
  };

  try {
    ensureFileRoot(next.rootPath);
    writeAppDataValue("fileSettings", next, req);
    res.json({ ...getFileSettings(), savedAt: nowIso() });
  } catch (error) {
    res.status(500).json({ error: "file_root_unavailable", message: error.message });
  }
});

app.post("/api/projects/:projectId/folders/init", (req, res) => {
  const project = { ...(req.body?.project || {}), id: req.params.projectId };
  const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
  if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });

  try {
    const result = ensureProjectStageFolders(project, stages);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: "folder_init_failed", message: error.message });
  }
});

app.post("/api/projects/folders/init-all", (req, res) => {
  const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
  const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
  if (projects.length === 0) return res.status(400).json({ error: "projects_required" });

  try {
    const initialized = projects
      .filter((project) => project?.id && (project.name || project.projectName))
      .map((project) => ensureProjectStageFolders(project, stages));
    res.status(201).json({ ok: true, count: initialized.length, initialized });
  } catch (error) {
    res.status(500).json({ error: "folder_init_all_failed", message: error.message });
  }
});

app.post("/api/projects/:projectId/stages/:stageId/upload", (req, res) => {
  const { project: rawProject, stage: rawStage, fileType, filename, contentBase64 } = req.body || {};
  if (!filename || !contentBase64) return res.status(400).json({ error: "filename_and_content_required" });

  const project = { ...(rawProject || {}), id: req.params.projectId };
  const stage = { ...(rawStage || {}), id: req.params.stageId };
  if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });
  if (!stage.name) return res.status(400).json({ error: "stage_required" });

  try {
    ensureProjectStageFolders(project, [stage]);
    const rootPath = ensureFileRoot();
    const projectFolder = getProjectFolderName(project);
    const stageFolder = getStageFolderName(stage);
    const targetDir = path.join(rootPath, projectFolder, stageFolder, "已归档");
    fs.mkdirSync(targetDir, { recursive: true });

    const { originalBase, version, storedName } = buildProjectStoredFile({ project, stage, fileType, filename, targetDir });
    const targetPath = path.join(targetDir, storedName);
    const cleanBase64 = String(contentBase64).replace(/^data:.*?;base64,/, "");
    fs.writeFileSync(targetPath, Buffer.from(cleanBase64, "base64"));

    const relativePath = path.relative(rootPath, targetPath);
    res.status(201).json({
      id: crypto.randomUUID(),
      projectId: project.id,
      stageId: stage.id,
      fileType: fileType || originalBase,
      originalName: filename,
      originalBase,
      storedName,
      version,
      relativePath,
      absolutePath: targetPath,
      uploadedAt: nowIso(),
    });
  } catch (error) {
    res.status(500).json({ error: "project_file_upload_failed", message: error.message });
  }
});

app.post("/api/projects/:projectId/files/list", (req, res) => {
  const project = { ...(req.body?.project || {}), id: req.params.projectId };
  const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
  if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });

  try {
    res.json(listProjectFilesFromDisk({ project, stages }));
  } catch (error) {
    res.status(500).json({ error: "project_files_list_failed", message: error.message });
  }
});

app.get("/api/project-files/download", (req, res) => {
  const resolved = resolveProjectFile(req.query.relativePath);
  if (!resolved) return res.status(404).json({ error: "file_not_found" });
  res.download(resolved.absolutePath);
});

app.get("/api/:resource", (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true";
  const rows = db.prepare(`
    SELECT * FROM entity_records
    WHERE resource = ? ${includeDeleted ? "" : "AND deletedAt IS NULL"}
    ORDER BY updatedAt DESC
  `).all(req.params.resource);
  res.json(rows.map(toEntity));
});

app.get("/api/:resource/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(req.params.resource, req.params.id);
  if (!row || row.deletedAt) return res.status(404).json({ error: "not_found" });
  res.json(toEntity(row));
});

app.post("/api/:resource", (req, res) => {
  const id = req.body.id || crypto.randomUUID();
  const result = saveEntity({ resource: req.params.resource, id, payload: req.body, baseVersion: req.body.baseVersion, req });
  if (result.conflict) return res.status(409).json(result.conflict);
  res.status(201).json(result.record);
});

app.put("/api/:resource/:id", (req, res) => {
  const result = saveEntity({ resource: req.params.resource, id: req.params.id, payload: req.body, baseVersion: req.body.baseVersion, req });
  if (result.conflict) return res.status(409).json(result.conflict);
  res.json(result.record);
});

app.delete("/api/:resource/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(req.params.resource, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const result = saveEntity({ resource: req.params.resource, id: req.params.id, payload: parseJson(existing.payload, {}), deletedAt: nowIso(), baseVersion: Number(req.query.baseVersion || existing.version), req });
  if (result.conflict) return res.status(409).json(result.conflict);
  res.json(result.record);
});

app.post("/api/sync/pull", (req, res) => {
  const sinceVersion = Number(req.body.sinceVersion || 0);
  const rows = db.prepare("SELECT * FROM sync_events WHERE version > ? ORDER BY version ASC").all(sinceVersion);
  res.json({
    changes: rows.map((row) => ({
      version: row.version,
      resource: row.resource,
      recordId: row.recordId,
      operation: row.operation,
      payload: parseJson(row.payload),
      createdAt: row.createdAt,
      clientId: row.clientId,
      updatedBy: row.updatedBy,
    })),
    serverVersion: getServerVersion(),
  });
});

app.post("/api/sync/push", (req, res) => {
  const operations = Array.isArray(req.body.operations) ? req.body.operations : [];
  const applied = [];
  const conflicts = [];
  for (const operation of operations) {
    const payload = operation.payload || {};
    const result = saveEntity({
      resource: operation.resource,
      id: operation.recordId || payload.id || crypto.randomUUID(),
      payload,
      deletedAt: operation.type === "delete" ? nowIso() : null,
      baseVersion: operation.baseVersion,
      req,
    });
    if (result.conflict) conflicts.push(result.conflict);
    else applied.push(result.record);
  }
  res.json({ applied, conflicts, serverVersion: getServerVersion() });
});

app.post("/api/backup/export", (_req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `backup-${timestamp}.sqlite`);
  fs.copyFileSync(dbPath, backupPath);
  res.json({ ok: true, path: backupPath });
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
});
