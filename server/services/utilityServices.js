import fs from "node:fs";
import path from "node:path";
import {
  ensureProjectStageFolders as ensureProjectStageFoldersOnDisk,
  listProjectFilesFromDisk as listProjectFilesFromDiskDomain,
  resolveProjectFile as resolveProjectFileDomain,
} from "../domain/projectFiles.js";

export function createUtilityServices({ db, dbPath, backupsDir, projectFilesDir, parseJson, nowIso, clientId, userId }) {
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

  function ensureProjectStageFolders(project, stages = []) {
    const rootPath = ensureFileRoot();
    return ensureProjectStageFoldersOnDisk({ rootPath, project, stages, nowIso });
  }

  function listProjectFilesFromDisk({ project, stages = [] }) {
    const rootPath = ensureFileRoot();
    return listProjectFilesFromDiskDomain({ rootPath, project, stages });
  }

  function resolveProjectFile(relativePath = "") {
    const rootPath = ensureFileRoot();
    return resolveProjectFileDomain({ rootPath, relativePath });
  }

  function exportBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupsDir, `backup-${timestamp}.sqlite`);
    fs.copyFileSync(dbPath, backupPath);
    return backupPath;
  }

  return {
    ensureFileRoot,
    ensureProjectStageFolders,
    exportBackup,
    getFileSettings,
    listProjectFilesFromDisk,
    resolveProjectFile,
    writeAppDataValue,
  };
}
