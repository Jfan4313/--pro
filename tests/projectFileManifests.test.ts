import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { completeUpload, createUploadSession, getUpload, listManifests, recordChunk, upsertManifests } from "../server/services/projectFileManifests.js";

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE project_file_manifests (id TEXT PRIMARY KEY, companyId TEXT, projectId TEXT, stageId TEXT, originalName TEXT, relativePath TEXT, logicalPath TEXT, category TEXT, classificationSource TEXT, classificationConfidence REAL, reviewStatus TEXT, classificationEvidence TEXT, storedName TEXT, storagePath TEXT, size INTEGER, contentType TEXT, checksum TEXT, version TEXT, bucket TEXT, availability TEXT, sourceClientId TEXT, lastIndexedAt TEXT, uploadedAt TEXT, visibilityPolicy TEXT, visibilityOverride TEXT, createdBy TEXT, updatedAt TEXT); CREATE TABLE project_file_uploads (id TEXT PRIMARY KEY, manifestId TEXT, companyId TEXT, userId TEXT, tempPath TEXT, totalSize INTEGER, chunkSize INTEGER, receivedChunks INTEGER DEFAULT 0, totalChunks INTEGER, receivedBytes INTEGER DEFAULT 0, targetPath TEXT, storedName TEXT, status TEXT DEFAULT 'pending', createdAt TEXT, updatedAt TEXT);`);
  return db;
}

const user = { id: "u1", companyId: "c1", role: "project_manager", permissions: JSON.stringify(["files"]) };
const nowIso = () => "2026-08-20T00:00:00.000Z";

test("文件清单发布支持远程只读状态并标记来源电脑已缺失", () => {
  const db = makeDb();
  upsertManifests({ db, user, nowIso, items: [{ id: "f1", projectId: "p1", stageId: "1_initiation", originalName: "现场勘察.pdf", logicalPath: "PRJ-1/01_项目立项/已归档/现场勘察/现场勘察.pdf", size: 12, sourceClientId: "client-a" }] });
  assert.equal(listManifests({ db, user, projectId: "p1" })[0].availability, "local-only");
  upsertManifests({ db, user, nowIso, items: [{ id: "f2", projectId: "p1", stageId: "1_initiation", originalName: "项目概况.pdf", logicalPath: "PRJ-1/01_项目立项/已归档/项目概况/项目概况.pdf", size: 18, sourceClientId: "client-a" }] });
  const records = listManifests({ db, user, projectId: "p1" });
  assert.equal(records.find((item) => item.id === "f1")?.availability, "missing");
  assert.equal(records.find((item) => item.id === "f2")?.availability, "local-only");
  assert.equal(records.find((item) => item.id === "f2")?.logicalPath, "PRJ-1/01_项目立项/已归档/项目概况/项目概况.pdf");
  assert.equal(Object.hasOwn(records[0], "relativePath"), false);
  assert.equal(Object.hasOwn(records[0], "storagePath"), false);
  db.close();
});

test("文件清单拒绝来源电脑绝对路径", () => {
  const db = makeDb();
  assert.throws(() => upsertManifests({ db, user, nowIso, items: [{ id: "f1", projectId: "p1", stageId: "1_initiation", originalName: "资料.txt", logicalPath: "/Users/su/Desktop/资料.txt" }] }), /invalid_logical_path/);
  assert.throws(() => upsertManifests({ db, user, nowIso, items: [{ id: "f2", projectId: "p1", stageId: "1_initiation", originalName: "资料.txt", logicalPath: "C:/Users/test/资料.txt" }] }), /invalid_logical_path/);
  db.close();
});

test("上传分片完成后才把清单标记为已上传并校验哈希", async () => {
  const db = makeDb();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhijian-manifest-test-"));
  try {
    const content = Buffer.from("project-file-content");
    upsertManifests({ db, user, nowIso, items: [{ id: "f1", projectId: "p1", stageId: "1_initiation", originalName: "资料.txt", logicalPath: "PRJ-1/01_项目立项/已归档/其他资料/资料.txt", size: content.length, sourceClientId: "client-a" }] });
    const target = path.join(tempDir, "stored.txt");
    const session = createUploadSession({ db, user, fileId: "f1", totalSize: content.length, chunkSize: 8, targetPath: target, storedName: "stored.txt", nowIso, uploadsDir: tempDir });
    for (let index = 0; index < session.totalChunks; index++) {
      const upload = getUpload({ db, user, uploadId: session.id });
      recordChunk({ db, upload, chunkIndex: index, body: content.subarray(index * session.chunkSize, Math.min(content.length, (index + 1) * session.chunkSize)), nowIso });
    }
    const upload = getUpload({ db, user, uploadId: session.id });
    const checksum = crypto.createHash("sha256").update(content).digest("hex");
    await completeUpload({ db, user, upload, checksum, nowIso });
    assert.equal(fs.readFileSync(target).toString(), content.toString());
    assert.equal(listManifests({ db, user, projectId: "p1" })[0].availability, "uploaded");
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); db.close(); }
});
