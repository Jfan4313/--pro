import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
export const dataDir = process.env.LOCAL_DATA_DIR
  ? path.resolve(process.env.LOCAL_DATA_DIR)
  : path.join(rootDir, "data");
export const uploadsDir = process.env.LOCAL_UPLOADS_DIR
  ? path.resolve(process.env.LOCAL_UPLOADS_DIR)
  : path.join(dataDir, "uploads");
export const backupsDir = process.env.LOCAL_BACKUPS_DIR
  ? path.resolve(process.env.LOCAL_BACKUPS_DIR)
  : path.join(dataDir, "backups");
export const projectFilesDir = process.env.LOCAL_PROJECT_FILES_DIR
  ? path.resolve(process.env.LOCAL_PROJECT_FILES_DIR)
  : path.join(dataDir, "project-files");
export const dbPath = process.env.LOCAL_DB_PATH || path.join(dataDir, "zhijian-local.sqlite");

for (const dir of [dataDir, uploadsDir, backupsDir, projectFilesDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  clientId TEXT NOT NULL DEFAULT 'server',
  updatedBy TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS entity_records (
  resource TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  clientId TEXT NOT NULL,
  updatedBy TEXT NOT NULL,
  PRIMARY KEY (resource, id)
);

CREATE TABLE IF NOT EXISTS sync_events (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  resource TEXT NOT NULL,
  recordId TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  createdAt TEXT NOT NULL,
  clientId TEXT NOT NULL,
  updatedBy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_records_resource_updated
  ON entity_records(resource, updatedAt);

CREATE INDEX IF NOT EXISTS idx_sync_events_resource_record
  ON sync_events(resource, recordId);

CREATE TABLE IF NOT EXISTS project_file_manifests (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  originalName TEXT NOT NULL,
  relativePath TEXT NOT NULL,
  storedName TEXT,
  storagePath TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  contentType TEXT NOT NULL DEFAULT 'application/octet-stream',
  checksum TEXT,
  version TEXT NOT NULL DEFAULT 'V1',
  bucket TEXT NOT NULL DEFAULT '待提交',
  availability TEXT NOT NULL DEFAULT 'local-only',
  sourceClientId TEXT,
  lastIndexedAt TEXT NOT NULL,
  uploadedAt TEXT,
  visibilityPolicy TEXT NOT NULL DEFAULT 'project',
  visibilityOverride TEXT,
  createdBy TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_file_manifests_project
  ON project_file_manifests(companyId, projectId, stageId, updatedAt);
CREATE INDEX IF NOT EXISTS idx_project_file_manifests_checksum
  ON project_file_manifests(companyId, checksum);

CREATE TABLE IF NOT EXISTS project_file_uploads (
  id TEXT PRIMARY KEY,
  manifestId TEXT NOT NULL,
  companyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  tempPath TEXT NOT NULL,
  totalSize INTEGER NOT NULL,
  chunkSize INTEGER NOT NULL,
  receivedChunks INTEGER NOT NULL DEFAULT 0,
  totalChunks INTEGER NOT NULL,
  receivedBytes INTEGER NOT NULL DEFAULT 0,
  targetPath TEXT,
  storedName TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (manifestId) REFERENCES project_file_manifests(id) ON DELETE CASCADE
);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("users", "username", "TEXT");
ensureColumn("users", "email", "TEXT");
ensureColumn("users", "phone", "TEXT");
ensureColumn("users", "passwordHash", "TEXT");
ensureColumn("users", "status", "TEXT NOT NULL DEFAULT 'active'");
ensureColumn("users", "permissions", "TEXT");
ensureColumn("users", "mustChangePassword", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "lastLoginAt", "TEXT");
ensureColumn("users", "companyId", "TEXT");
ensureColumn("project_file_uploads", "targetPath", "TEXT");
ensureColumn("project_file_uploads", "storedName", "TEXT");
ensureColumn("project_file_manifests", "storagePath", "TEXT");

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE TABLE IF NOT EXISTS auth_sessions (
  tokenHash TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  lastSeenAt TEXT NOT NULL,
  userAgent TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(userId, expiresAt);
CREATE TABLE IF NOT EXISTS auth_otp_codes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  phone TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumedAt TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_otp_phone_created ON auth_otp_codes(phone, createdAt);

CREATE TABLE IF NOT EXISTS user_settings (
  companyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  value TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (companyId, userId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  inputTokens INTEGER,
  outputTokens INTEGER,
  totalTokens INTEGER,
  status TEXT NOT NULL,
  durationMs INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_company_created ON ai_usage_events(companyId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(userId, createdAt DESC);
`);

const now = new Date().toISOString();
db.prepare(`
  INSERT OR IGNORE INTO users (id, name, role, createdAt, updatedAt)
  VALUES ('admin-local', '项目经理', 'admin', ?, ?)
`).run(now, now);

const admin = db.prepare("SELECT * FROM users WHERE id = 'admin-local'").get();
if (!admin?.username || !admin?.passwordHash) {
  db.prepare(`
    UPDATE users SET username = 'admin', name = '展示帐号', email = 'admin@project.local', passwordHash = ?, status = 'active', mustChangePassword = 0, updatedAt = ?
    WHERE id = 'admin-local'
  `).run(hashPassword(process.env.INITIAL_ADMIN_PASSWORD || "ZJxt@2026"), now);
}

db.prepare("UPDATE users SET companyId = COALESCE(NULLIF(companyId, ''), 'company-default') WHERE companyId IS NULL OR companyId = ''").run();

db.prepare(`
  UPDATE users SET name = '展示帐号', mustChangePassword = 0, updatedAt = ?
  WHERE id = 'admin-local' AND username = 'admin' AND email = 'admin@project.local'
`).run(now);

export function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function toEntity(row) {
  if (!row) return null;
  return {
    ...parseJson(row.payload, {}),
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    version: row.version,
    clientId: row.clientId,
    updatedBy: row.updatedBy,
  };
}

export function insertSyncEvent({ resource, recordId, operation, payload, clientId, updatedBy }) {
  const createdAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO sync_events (resource, recordId, operation, payload, createdAt, clientId, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(resource, recordId, operation, payload ? JSON.stringify(payload) : null, createdAt, clientId, updatedBy);
  return Number(result.lastInsertRowid);
}

export function getServerVersion() {
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM sync_events").get();
  return row?.version || 0;
}
