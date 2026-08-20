import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const AVAILABILITIES = new Set(["local-only", "uploaded", "stale", "missing"]);
const VISIBILITIES = new Set(["project", "sensitive", "restricted"]);

function safeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function publicManifest(row, canSeeSensitive = true) {
  const visibility = row.visibilityOverride || row.visibilityPolicy || "project";
  const sensitive = visibility !== "project";
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId,
    originalName: row.originalName,
    relativePath: row.relativePath,
    storedName: row.storedName,
    size: row.size,
    contentType: row.contentType,
    checksum: row.checksum,
    version: row.version,
    bucket: row.bucket,
    availability: row.availability,
    lastIndexedAt: row.lastIndexedAt,
    uploadedAt: row.uploadedAt,
    visibility: sensitive ? (canSeeSensitive ? visibility : "restricted") : "project",
    canViewContent: row.availability === "uploaded" && (!sensitive || canSeeSensitive),
  };
}

function isManager(user) {
  return user?.role === "admin" || user?.role === "company_admin";
}

function canSeeManifestContent(user, row) {
  if (!user || row.companyId !== (user.companyId || "company-default")) return false;
  const visibility = row.visibilityOverride || row.visibilityPolicy || "project";
  return row.availability === "uploaded" && (visibility === "project" || isManager(user));
}

function normalizeItem(item, user, nowIso) {
  const id = safeString(item.id) || crypto.randomUUID();
  const availability = AVAILABILITIES.has(item.availability) ? item.availability : "local-only";
  const visibilityPolicy = VISIBILITIES.has(item.visibilityPolicy) ? item.visibilityPolicy : "project";
  return {
    id,
    companyId: user.companyId || "company-default",
    projectId: safeString(item.projectId),
    stageId: safeString(item.stageId),
    originalName: safeString(item.originalName || item.name, "未命名文件"),
    relativePath: safeString(item.relativePath, safeString(item.originalName || item.name, "未命名文件")),
    size: Math.max(0, Number(item.size || 0)),
    contentType: safeString(item.contentType, "application/octet-stream"),
    checksum: safeString(item.checksum) || null,
    version: safeString(item.version, "V1"),
    bucket: item.bucket === "已归档" ? "已归档" : "待提交",
    availability,
    sourceClientId: safeString(item.sourceClientId) || null,
    lastIndexedAt: safeString(item.lastIndexedAt, nowIso()),
    visibilityPolicy,
    visibilityOverride: VISIBILITIES.has(item.visibilityOverride) ? item.visibilityOverride : null,
    createdBy: user.id,
    updatedAt: nowIso(),
  };
}

export function canViewProjectFiles(user) {
  if (!user) return false;
  if (isManager(user)) return true;
  try {
    const permissions = JSON.parse(user.permissions || "null");
    if (Array.isArray(permissions)) return permissions.includes("*") || permissions.includes("files");
  } catch {}
  return ["project_manager", "surveyor", "designer", "finance", "viewer", "construction_leader"].includes(user.role);
}

export function upsertManifests({ db, items, user, nowIso }) {
  const normalized = items.map((item) => normalizeItem(item, user, nowIso)).filter((item) => item.projectId && item.stageId);
  const transaction = db.transaction(() => {
    const upsert = db.prepare(`INSERT INTO project_file_manifests
      (id, companyId, projectId, stageId, originalName, relativePath, size, contentType, checksum, version, bucket, availability, sourceClientId, lastIndexedAt, visibilityPolicy, visibilityOverride, createdBy, updatedAt)
      VALUES (@id, @companyId, @projectId, @stageId, @originalName, @relativePath, @size, @contentType, @checksum, @version, @bucket, @availability, @sourceClientId, @lastIndexedAt, @visibilityPolicy, @visibilityOverride, @createdBy, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET originalName=excluded.originalName, relativePath=excluded.relativePath, size=excluded.size, contentType=excluded.contentType, checksum=excluded.checksum, version=excluded.version, bucket=excluded.bucket, availability=CASE WHEN project_file_manifests.availability='uploaded' AND excluded.checksum != project_file_manifests.checksum THEN 'stale' ELSE excluded.availability END, sourceClientId=excluded.sourceClientId, lastIndexedAt=excluded.lastIndexedAt, visibilityPolicy=excluded.visibilityPolicy, visibilityOverride=excluded.visibilityOverride, updatedAt=excluded.updatedAt`);
    for (const item of normalized) upsert.run(item);
    const byProject = new Map();
    for (const item of normalized) { const key = `${item.projectId}:${item.sourceClientId || ""}`; const list = byProject.get(key) || []; list.push(item.id); byProject.set(key, list); }
    const markMissing = db.prepare(`UPDATE project_file_manifests SET availability='missing', updatedAt=? WHERE companyId=? AND projectId=? AND sourceClientId=? AND availability != 'uploaded' AND id NOT IN (SELECT value FROM json_each(?))`);
    for (const [key, ids] of byProject) { const [projectId, sourceClientId] = key.split(":"); markMissing.run(nowIso(), user.companyId || "company-default", projectId, sourceClientId, JSON.stringify(ids)); }
  });
  transaction();
  return normalized;
}

export function listManifests({ db, user, projectId, canSeeSensitive = false }) {
  const rows = db.prepare("SELECT * FROM project_file_manifests WHERE companyId=? AND projectId=? ORDER BY stageId, relativePath, originalName").all(user.companyId || "company-default", projectId);
  return rows.map((row) => publicManifest(row, canSeeSensitive || isManager(user)));
}

export function getManifest({ db, user, fileId }) {
  return db.prepare("SELECT * FROM project_file_manifests WHERE id=? AND companyId=?").get(fileId, user.companyId || "company-default");
}

export function updateVisibility({ db, user, fileId, visibility }) {
  if (!isManager(user)) throw Object.assign(new Error("admin_required"), { status: 403 });
  if (!VISIBILITIES.has(visibility)) throw Object.assign(new Error("invalid_visibility"), { status: 400 });
  const result = db.prepare("UPDATE project_file_manifests SET visibilityOverride=?, updatedAt=? WHERE id=? AND companyId=?").run(visibility, new Date().toISOString(), fileId, user.companyId || "company-default");
  if (!result.changes) return null;
  return getManifest({ db, user, fileId });
}

export function createUploadSession({ db, user, fileId, totalSize, chunkSize, targetPath, storedName, nowIso, uploadsDir }) {
  const manifest = getManifest({ db, user, fileId });
  if (!manifest) throw Object.assign(new Error("file_manifest_not_found"), { status: 404 });
  if (!canViewProjectFiles(user)) throw Object.assign(new Error("files_permission_required"), { status: 403 });
  const visibility = manifest.visibilityOverride || manifest.visibilityPolicy || "project";
  if (visibility !== "project" && !isManager(user)) throw Object.assign(new Error("sensitive_file_upload_forbidden"), { status: 403 });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const id = crypto.randomUUID();
  const tempPath = path.join(uploadsDir, `${id}.part`);
  const safeChunkSize = Math.max(256 * 1024, Math.min(8 * 1024 * 1024, Number(chunkSize || 4 * 1024 * 1024)));
  const size = Math.max(0, Number(totalSize || manifest.size));
  const totalChunks = Math.max(1, Math.ceil(size / safeChunkSize));
  db.prepare(`INSERT INTO project_file_uploads (id, manifestId, companyId, userId, tempPath, totalSize, chunkSize, totalChunks, targetPath, storedName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, fileId, user.companyId || "company-default", user.id, tempPath, size, safeChunkSize, totalChunks, targetPath, storedName, nowIso(), nowIso());
  return { id, chunkSize: safeChunkSize, totalChunks };
}

export function getUpload({ db, user, uploadId }) {
  return db.prepare("SELECT * FROM project_file_uploads WHERE id=? AND companyId=? AND userId=?").get(uploadId, user.companyId || "company-default", user.id);
}

export function recordChunk({ db, upload, chunkIndex, body, nowIso }) {
  if (!upload || upload.status !== "pending") throw Object.assign(new Error("upload_not_pending"), { status: 409 });
  if (Number(chunkIndex) < 0 || Number(chunkIndex) >= upload.totalChunks) throw Object.assign(new Error("invalid_chunk"), { status: 400 });
  if (Number(chunkIndex) !== upload.receivedChunks) throw Object.assign(new Error("chunk_out_of_order"), { status: 409 });
  const expected = Number(chunkIndex) === upload.totalChunks - 1 ? upload.totalSize - upload.chunkSize * (upload.totalChunks - 1) : upload.chunkSize;
  if (body.length > expected) throw Object.assign(new Error("chunk_too_large"), { status: 413 });
  const handle = fs.openSync(upload.tempPath, "a");
  try { fs.writeSync(handle, body); } finally { fs.closeSync(handle); }
  db.prepare("UPDATE project_file_uploads SET receivedChunks=receivedChunks+1, receivedBytes=receivedBytes+?, updatedAt=? WHERE id=?").run(body.length, nowIso(), upload.id);
  return { received: body.length, chunkIndex: Number(chunkIndex) };
}

export function completeUpload({ db, user, upload, checksum, nowIso }) {
  if (!upload || upload.status !== "pending") throw Object.assign(new Error("upload_not_pending"), { status: 409 });
  const stat = fs.statSync(upload.tempPath);
  if (stat.size !== upload.totalSize || upload.receivedChunks < upload.totalChunks) throw Object.assign(new Error("upload_incomplete"), { status: 409 });
  const actual = crypto.createHash("sha256").update(fs.readFileSync(upload.tempPath)).digest("hex");
  if (checksum && checksum !== actual) throw Object.assign(new Error("checksum_mismatch"), { status: 422 });
  fs.mkdirSync(path.dirname(upload.targetPath), { recursive: true });
  fs.renameSync(upload.tempPath, upload.targetPath);
  const timestamp = nowIso();
  db.prepare("UPDATE project_file_uploads SET status='completed', updatedAt=? WHERE id=?").run(timestamp, upload.id);
  db.prepare("UPDATE project_file_manifests SET storedName=?, storagePath=?, checksum=?, size=?, availability='uploaded', uploadedAt=?, updatedAt=? WHERE id=? AND companyId=?").run(upload.storedName, upload.targetPath, actual, stat.size, timestamp, timestamp, upload.manifestId, user.companyId || "company-default");
  return { checksum: actual, size: stat.size, storedName: upload.storedName, manifestId: upload.manifestId };
}

export { canSeeManifestContent, isManager, publicManifest };
