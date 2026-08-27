import { offlineDb } from "./offlineDb";
import { archiveFolderLabels, numberArchiveFolderPath } from "./projectArchiveStructure";

export const LOCAL_ARCHIVE_HANDLE_KEY = "projectFilesDirectoryHandle";

export type ArchiveStorageProviderId = "local-folder" | "legacy-server" | "cloud-object-storage";

export type ArchiveProject = {
  id: string;
  projectNumber?: string;
  projectCode?: string;
  code?: string;
  name?: string;
  projectName?: string;
};

export type ArchiveStage = {
  id: string;
  name: string;
  files?: string[];
};

export type ArchiveFileIndex = {
  storageProvider: ArchiveStorageProviderId;
  storageKey: string;
  projectId: string;
  stageId: string;
  originalName: string;
  storedName: string;
  version: string;
  size: number;
  contentType: string;
  checksum: string;
  createdAt: string;
  bucket?: "待提交" | "已归档";
  category?: string;
  classificationSource?: string;
  classificationConfidence?: number;
  reviewStatus?: "confirmed" | "needs-review";
  classificationEvidence?: string;
  wasSkipped?: boolean;
};

export type ArchiveCleanupCandidate = { storageKey: string; targetStorageKey: string; name: string; size: number; checksum: string; modifiedAt?: string; status: "ready" | "verified" | "conflict" };
export type ArchiveRebuildResult = { verified: ArchiveCleanupCandidate[]; copied: number; skipped: number; conflicts: number; failed: number };
export type ArchiveVersionView<T> = T & { versionNumber: number; versionCount: number; isLatestVersion: boolean; isDuplicate: boolean; duplicateRecordCount: number };

export type ArchiveFolderState = {
  status: "pending" | "ready" | "error";
  storageProvider: ArchiveStorageProviderId;
  projectFolder?: string;
  generatedThroughStageId?: string;
  updatedAt: string;
  error?: string;
};

export type ArchiveAvailability = {
  available: boolean;
  permission: "granted" | "prompt" | "denied" | "unsupported";
  rootName?: string;
};

export interface ArchiveStorageProvider {
  readonly id: ArchiveStorageProviderId;
  checkAvailability(): Promise<ArchiveAvailability>;
  ensureProjectStructure(project: ArchiveProject, stages: ArchiveStage[], projectFolder?: string): Promise<{ projectFolder: string; generatedThroughStageId?: string }>;
  normalizeProjectStructure(project: ArchiveProject, stages: ArchiveStage[], projectFolder?: string): Promise<{ renamed: number; projectFolder: string }>;
  renameProjectFolder(oldFolder: string, newFolder: string): Promise<void>;
  writeFile(input: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string; sourceRelativePath?: string; folderLabels?: string[]; preserveFolders?: boolean; classificationSource?: string; classificationConfidence?: number; classificationEvidence?: string }): Promise<ArchiveFileIndex>;
  writeUncertainFile(input: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string; folderLabels?: string[] }): Promise<ArchiveFileIndex>;
  previewGeneratedArchiveFiles(): Promise<ArchiveCleanupCandidate[]>;
  rebuildGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]): Promise<ArchiveRebuildResult>;
  deleteGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]): Promise<{ deleted: number; failed: number }>;
  listFiles(input: { project: ArchiveProject; stages: ArchiveStage[]; projectFolder?: string }): Promise<ArchiveFileIndex[]>;
  readFile(storageKey: string): Promise<File>;
  getDownloadTarget(storageKey: string): Promise<{ url: string; revoke: () => void }>;
}

// This contract intentionally mirrors the local provider. A future SaaS/OSS
// implementation can satisfy it without changing project or lifecycle views.
export abstract class CloudObjectStorageProvider implements ArchiveStorageProvider {
  readonly id = "cloud-object-storage" as const;
  abstract checkAvailability(): Promise<ArchiveAvailability>;
  abstract ensureProjectStructure(project: ArchiveProject, stages: ArchiveStage[], projectFolder?: string): Promise<{ projectFolder: string; generatedThroughStageId?: string }>;
  abstract normalizeProjectStructure(project: ArchiveProject, stages: ArchiveStage[], projectFolder?: string): Promise<{ renamed: number; projectFolder: string }>;
  abstract renameProjectFolder(oldFolder: string, newFolder: string): Promise<void>;
  abstract writeFile(input: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string; sourceRelativePath?: string; folderLabels?: string[]; preserveFolders?: boolean; classificationSource?: string; classificationConfidence?: number; classificationEvidence?: string }): Promise<ArchiveFileIndex>;
  abstract writeUncertainFile(input: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string; folderLabels?: string[] }): Promise<ArchiveFileIndex>;
  abstract previewGeneratedArchiveFiles(): Promise<ArchiveCleanupCandidate[]>;
  abstract rebuildGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]): Promise<ArchiveRebuildResult>;
  abstract deleteGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]): Promise<{ deleted: number; failed: number }>;
  abstract listFiles(input: { project: ArchiveProject; stages: ArchiveStage[]; projectFolder?: string }): Promise<ArchiveFileIndex[]>;
  abstract readFile(storageKey: string): Promise<File>;
  abstract getDownloadTarget(storageKey: string): Promise<{ url: string; revoke: () => void }>;
}

export function sanitizeArchiveSegment(value = "未命名") {
  const text = String(value || "未命名")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "未命名";
}

export function getArchiveProjectCode(project: ArchiveProject) {
  return sanitizeArchiveSegment(project.projectNumber || project.projectCode || project.code || project.id || "PROJECT");
}

export function getArchiveProjectFolder(project: ArchiveProject) {
  return `${getArchiveProjectCode(project)}_${sanitizeArchiveSegment(project.name || project.projectName || "未命名项目")}`;
}

export function getArchiveStageCode(stage: ArchiveStage) {
  const match = String(stage.name || stage.id || "").match(/[①②③④⑤⑥⑦⑧⑨⑩]|\d+/);
  const numberMap: Record<string, string> = { "①": "01", "②": "02", "③": "03", "④": "04", "⑤": "05", "⑥": "06", "⑦": "07", "⑧": "08", "⑨": "09", "⑩": "10" };
  const raw = match?.[0] || String(stage.id || "stage").split("_")[0];
  return numberMap[raw] || String(raw).padStart(2, "0");
}

export function getArchiveStageFolder(stage: ArchiveStage) {
  const cleanName = sanitizeArchiveSegment(String(stage.name || stage.id || "阶段").replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "").trim());
  return `${getArchiveStageCode(stage)}_${cleanName}`;
}

export function getCurrentAndNextStages(stages: ArchiveStage[], currentStageIndex: number) {
  const safeIndex = Math.max(0, Math.min(currentStageIndex, stages.length - 1));
  return stages.slice(safeIndex, Math.min(stages.length, safeIndex + 2));
}

function archiveVersionNumber(file: any) {
  const match = String(file?.version || file?.storedName || file?.name || "").match(/V(\d+)/i);
  return Math.max(1, Number(match?.[1] || 1));
}

function archiveLogicalKey(file: any) {
  const category = String(file?.category || "");
  const meaningfulCategory = category && category !== "其他资料" ? category : "";
  const source = String(file?.fileType || meaningfulCategory || file?.originalName || file?.storedName || file?.name || "资料");
  return source.replace(/\.[^.]+$/, "").replace(/_V\d+_\d{8}$/i, "").trim().toLocaleLowerCase();
}

export function getArchiveDisplayName(file: any) {
  const original = String(file?.originalName || "");
  const categoryLeaf = String(file?.category || file?.fileType || "").split("/").filter(Boolean).at(-1) || "";
  const stored = String(file?.storedName || file?.name || original || "资料");
  const extension = stored.match(/(\.[^.]+)$/)?.[1] || original.match(/(\.[^.]+)$/)?.[1] || "";
  const version = String(file?.version || stored.match(/_(V\d+)_\d{8}(?:\.[^.]+)?$/i)?.[1] || "");
  if (categoryLeaf && categoryLeaf !== "其他资料") return `${categoryLeaf}${version ? `_${version}` : ""}${extension}`;
  const withoutPrefix = stored.replace(/^PRJ-?\d+_\d+_/i, "");
  const suffixPattern = /_V\d+_\d{8}(?:\.[^.]+)?$/i;
  const base = withoutPrefix.replace(/\.[^.]+$/, "").replace(suffixPattern, "");
  const shortBase = base.length > 48 ? `${base.slice(0, 26)}…${base.slice(-16)}` : base;
  return `${shortBase}${version ? `_${version}` : ""}${extension}`;
}

export function buildArchiveVersionView<T extends { storageKey?: string; checksum?: string; createdAt?: string; updatedAt?: string; uploadTime?: string; version?: string; storedName?: string; originalName?: string; fileType?: string; category?: string; name?: string }>(files: T[]): ArchiveVersionView<T>[] {
  const unique: Array<T & { duplicateRecordCount: number }> = [];
  const byStorageKey = new Map<string, number>();
  files.forEach((file, index) => {
    const key = file.storageKey ? `storage:${file.storageKey}` : `index:${index}`;
    const existing = byStorageKey.get(key);
    if (existing !== undefined) { unique[existing].duplicateRecordCount += 1; return; }
    byStorageKey.set(key, unique.length);
    unique.push({ ...file, duplicateRecordCount: 1 });
  });
  const logicalGroups = new Map<string, typeof unique>();
  for (const file of unique) logicalGroups.set(archiveLogicalKey(file), [...(logicalGroups.get(archiveLogicalKey(file)) || []), file]);
  const checksumCounts = new Map<string, number>();
  for (const file of unique) if (file.checksum) checksumCounts.set(file.checksum, (checksumCounts.get(file.checksum) || 0) + 1);
  return unique.map((file) => {
    const group = logicalGroups.get(archiveLogicalKey(file)) || [file];
    const latest = [...group].sort((a, b) => archiveVersionNumber(b) - archiveVersionNumber(a) || new Date(b.createdAt || b.updatedAt || b.uploadTime || 0).getTime() - new Date(a.createdAt || a.updatedAt || a.uploadTime || 0).getTime())[0];
    return { ...file, versionNumber: archiveVersionNumber(file), versionCount: group.length, isLatestVersion: latest === file, isDuplicate: file.duplicateRecordCount > 1 || Boolean(file.checksum && (checksumCounts.get(file.checksum) || 0) > 1) };
  }).sort((a, b) => archiveLogicalKey(a).localeCompare(archiveLogicalKey(b), "zh-CN") || b.versionNumber - a.versionNumber);
}

async function getPermission(handle: any) {
  if (!handle?.queryPermission) return "granted" as const;
  return (await handle.queryPermission({ mode: "readwrite" })) as "granted" | "prompt" | "denied";
}

async function getDirectoryByParts(root: any, parts: string[], create = false) {
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return directory;
}

async function getExistingDirectoryByParts(root: any, parts: string[]) {
  try {
    return await getDirectoryByParts(root, parts);
  } catch (error: any) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

function withoutFolderNumber(name: string) {
  return String(name || "").replace(/^\d+[_-]/, "");
}

async function getExistingDirectoryByLabels(root: any, labels: string[]) {
  let directory = root;
  for (const label of labels) {
    const exact = await getExistingDirectoryByParts(directory, [label]);
    if (exact) {
      directory = exact;
      continue;
    }
    let match: any = null;
    for await (const entry of directory.values()) {
      if (entry.kind === "directory" && withoutFolderNumber(entry.name) === withoutFolderNumber(label)) {
        match = entry;
        break;
      }
    }
    if (!match) return null;
    directory = match;
  }
  return directory;
}

async function ensureNestedFolders(root: any, stageId: string, paths: string[]) {
  for (const path of paths) {
    const numberedPath = numberArchiveFolderPath(stageId, path);
    const parts = numberedPath.split("/").filter(Boolean).map((part) => sanitizeArchiveSegment(part));
    if (parts.length) await getDirectoryByParts(root, parts, true);
  }
}

async function writeBlob(directory: any, name: string, blob: Blob) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function copyDirectoryContents(source: any, target: any) {
  for await (const entry of source.values()) {
    if (entry.kind === "directory") {
      const targetDirectory = await target.getDirectoryHandle(entry.name, { create: true });
      await copyDirectoryContents(entry, targetDirectory);
    } else if (entry.kind === "file") {
      await writeBlob(target, entry.name, await entry.getFile());
    }
  }
}

async function fileExists(directory: any, name: string) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error: any) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

function splitFilename(filename: string) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { base: filename, ext: "" };
  return { base: filename.slice(0, dot), ext: filename.slice(dot) };
}

function formatDateStamp(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

async function nextVersion(directory: any, stem: string, ext: string) {
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escapedStem}_V(\\d+)_\\d{8}${escapedExt}$`);
  const versions: number[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind !== "file") continue;
    const version = Number(entry.name.match(matcher)?.[1] || 0);
    if (version) versions.push(version);
  }
  return versions.length ? Math.max(...versions) + 1 : 1;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function categoryParts(category = "其他资料") {
  return String(category || "其他资料").split("/").map((part) => sanitizeArchiveSegment(part)).filter(Boolean);
}

function inferLegacyCategory(name: string) {
  if (/技术标/i.test(name)) return "招投标资料/技术标";
  if (/商务标/i.test(name)) return "招投标资料/商务标";
  if (/澄清|答疑/i.test(name)) return "招投标资料/澄清答疑";
  if (/招投标|招标|投标|标书/i.test(name)) return /报价/i.test(name) ? "招投标资料/报价" : "招投标资料/其他";
  if (/合同|协议|权属|执照|身份证/i.test(name)) return "合同与权属";
  if (/备案|报建|许可|批复|并网申请|接入申请/i.test(name)) return "备案与报建";
  if (/设计|图纸|蓝图|方案|bom/i.test(name)) return "设计与技术";
  if (/施工|开工|进场|日志|验收|竣工/i.test(name)) return "施工与验收";
  return "其他资料";
}

function stageIdFromArchiveFolder(folderName: string) {
  const code = Number(String(folderName || "").match(/^(\d+)[_-]/)?.[1] || 0);
  return code >= 1 && code <= 10 ? `${code}_${["initiation", "preliminary", "business", "contract", "filing", "detailed_design", "briefing", "construction", "acceptance", "operations"][code - 1]}` : "";
}

function meaningfulFolderLabels(labels: string[], stage: ArchiveStage, category: string) {
  const stageName = String(stage.name || "").replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "").replace(/^\d+[_-]?/, "").trim().toLocaleLowerCase();
  const categoryRoots = categoryParts(category).map((item) => item.toLocaleLowerCase());
  return labels.map((part) => sanitizeArchiveSegment(part)).filter((part) => {
    const normalized = part.toLocaleLowerCase();
    if (!normalized || normalized === stageName || categoryRoots.includes(normalized)) return false;
    // 只移除项目阶段根目录（例如 02_初步设计），不再移除“施工方案、
    // 技术标附件、现场照片”等有业务含义的子目录。
    if (/^(0?[1-9]|10)[_-]/.test(normalized)) return false;
    if (/^\d+[_-]?(项目立项|初步设计|商务沟通|签订合同|项目备案|深化设计|项目交底|施工进场|验收并网|运营维护)/.test(normalized)) return false;
    return true;
  });
}

async function findDuplicate(directory: any, checksum: string) {
  for await (const entry of directory.values()) {
    if (entry.kind !== "file") continue;
    const existing = await entry.getFile();
    if (existing.size && await sha256(existing) === checksum) return existing;
  }
  return null;
}

export class LocalFolderStorageProvider implements ArchiveStorageProvider {
  readonly id = "local-folder" as const;

  constructor(private readonly rootHandle: any) {}

  async checkAvailability(): Promise<ArchiveAvailability> {
    if (!this.rootHandle) return { available: false, permission: "unsupported" };
    const permission = await getPermission(this.rootHandle);
    return { available: permission === "granted", permission, rootName: this.rootHandle.name };
  }

  async renameProjectFolder(oldFolder: string, newFolder: string) {
    if (!oldFolder || !newFolder || oldFolder === newFolder) return;
    const availability = await this.checkAvailability();
    if (!availability.available) throw Object.assign(new Error("archive_permission_required"), { code: "archive_permission_required" });
    const source = await this.rootHandle.getDirectoryHandle(oldFolder);
    try {
      await this.rootHandle.getDirectoryHandle(newFolder);
      throw Object.assign(new Error("archive_target_exists"), { code: "archive_target_exists" });
    } catch (error: any) {
      if (error?.code === "archive_target_exists") throw error;
      if (error?.name !== "NotFoundError") throw error;
    }
    const target = await this.rootHandle.getDirectoryHandle(newFolder, { create: true });
    await copyDirectoryContents(source, target);
    try {
      await this.rootHandle.removeEntry(oldFolder, { recursive: true });
    } catch (error) {
      // Keep the copied folder if the browser refuses the final removal; the
      // caller can retry after permission is restored without losing files.
      throw Object.assign(new Error("archive_old_folder_remove_failed"), { code: "archive_old_folder_remove_failed", cause: error });
    }
  }

  async ensureProjectStructure(project: ArchiveProject, stages: ArchiveStage[], fixedProjectFolder?: string) {
    const availability = await this.checkAvailability();
    if (!availability.available) throw Object.assign(new Error("archive_permission_required"), { code: "archive_permission_required" });
    const projectFolder = fixedProjectFolder || getArchiveProjectFolder(project);
    const projectDirectory = await this.rootHandle.getDirectoryHandle(projectFolder, { create: true });
    await projectDirectory.getDirectoryHandle("参建单位资料", { create: true });
    await projectDirectory.getDirectoryHandle("未确定", { create: true });

    for (const stage of stages) {
      const stageDirectory = await projectDirectory.getDirectoryHandle(getArchiveStageFolder(stage), { create: true });
      const folders = archiveFolderLabels(stage.id);
      await ensureNestedFolders(stageDirectory, stage.id, folders);
      if (!(await fileExists(stageDirectory, "文件清单.json"))) {
        await writeBlob(stageDirectory, "文件清单.json", new Blob([JSON.stringify({
          projectId: project.id,
          projectName: project.name || project.projectName || "",
          stageId: stage.id,
          stageName: stage.name,
          expectedFiles: stage.files || [],
          createdAt: new Date().toISOString(),
        }, null, 2)], { type: "application/json" }));
      }
    }
    // 兼容已经存在的旧目录：新目录先创建完成，再安全复制并校验式迁移旧无序号目录。
    await this.normalizeProjectStructure(project, stages, projectFolder);
    return { projectFolder, generatedThroughStageId: stages.at(-1)?.id };
  }

  async normalizeProjectStructure(project: ArchiveProject, stages: ArchiveStage[], fixedProjectFolder?: string) {
    const availability = await this.checkAvailability();
    if (!availability.available) throw Object.assign(new Error("archive_permission_required"), { code: "archive_permission_required" });
    const projectFolder = fixedProjectFolder || getArchiveProjectFolder(project);
    const projectDirectory = await getExistingDirectoryByParts(this.rootHandle, [projectFolder]);
    if (!projectDirectory) return { renamed: 0, projectFolder };
    let renamed = 0;
    for (const stage of stages) {
      const stageDirectory = await getExistingDirectoryByParts(projectDirectory, [getArchiveStageFolder(stage)]);
      if (!stageDirectory) continue;
      const folderPaths = [...new Set(archiveFolderLabels(stage.id).flatMap((path) => {
        const parts = path.split("/").filter(Boolean);
        return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
      }))].sort((a, b) => a.split("/").length - b.split("/").length);
      for (const folderPath of folderPaths) {
        const oldParts = folderPath.split("/").filter(Boolean).map((part) => sanitizeArchiveSegment(part));
        const newParts = numberArchiveFolderPath(stage.id, folderPath).split("/").filter(Boolean).map((part) => sanitizeArchiveSegment(part));
        if (oldParts.join("/") === newParts.join("/")) continue;
        const source = await getExistingDirectoryByLabels(stageDirectory, oldParts);
        if (!source) continue;
        if (source.name === newParts.at(-1)) continue;
        const target = await getDirectoryByParts(stageDirectory, newParts, true);
        await copyDirectoryContents(source, target);
        await stageDirectory.removeEntry(oldParts[0], { recursive: true });
        renamed += 1;
      }
    }
    return { renamed, projectFolder };
  }

  async writeFile({ project, stage, file, fileType, autoRename = true, projectFolder: fixedProjectFolder, sourceRelativePath, folderLabels, preserveFolders = false, classificationSource, classificationConfidence, classificationEvidence }: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string; sourceRelativePath?: string; folderLabels?: string[]; preserveFolders?: boolean; classificationSource?: string; classificationConfidence?: number; classificationEvidence?: string }): Promise<ArchiveFileIndex> {
    const { projectFolder } = await this.ensureProjectStructure(project, [stage], fixedProjectFolder);
    const sourceParts = preserveFolders ? String(sourceRelativePath || "").split("/").filter(Boolean) : [];
    const localFolderLabels = folderLabels || (sourceParts.length > 1 ? sourceParts.slice(1, -1) : []);
    const category = fileType || "其他资料";
    const sourceFolders = preserveFolders ? meaningfulFolderLabels(localFolderLabels, stage, category) : [];
    const archiveParts = [projectFolder, getArchiveStageFolder(stage), ...categoryParts(numberArchiveFolderPath(stage.id, category)), ...sourceFolders];
    const archivedDirectory = await getDirectoryByParts(this.rootHandle, archiveParts, true);
    const { base, ext } = splitFilename(file.name || "资料");
    const shortType = categoryParts(fileType || "").at(-1);
    const stem = preserveFolders ? sanitizeArchiveSegment(base || "资料") : sanitizeArchiveSegment(shortType || base || "资料");
    const checksum = await sha256(file);
    const duplicate = await findDuplicate(archivedDirectory, checksum);
    if (duplicate) {
      const match = duplicate.name.match(/_V(\d+)_\d{8}/i);
      return { storageProvider: this.id, storageKey: [...archiveParts, duplicate.name].join("/"), projectId: project.id, stageId: stage.id, originalName: file.name, storedName: duplicate.name, version: `V${match?.[1] || "1"}`, size: duplicate.size, contentType: duplicate.type || file.type || "application/octet-stream", checksum, createdAt: new Date(duplicate.lastModified).toISOString(), bucket: "已归档", category, classificationSource, classificationConfidence, classificationEvidence, reviewStatus: "confirmed", wasSkipped: true };
    }
    const versionNumber = await nextVersion(archivedDirectory, stem, ext);
    const version = `V${versionNumber}`;
    // 保留来源文件名是默认行为。版本后缀只在同一逻辑目录下已有不同
    // 内容的同名文件时使用，避免把文件名当成目录结构的替代品。
    let storedName = preserveFolders ? sanitizeArchiveSegment(file.name || "资料") : (autoRename ? `${stem}_${version}_${formatDateStamp()}${ext}` : file.name);
    if (await fileExists(archivedDirectory, storedName)) {
      if (preserveFolders) storedName = `${sanitizeArchiveSegment(base || "资料")}_${version}_${formatDateStamp()}${ext}`;
      else if (!autoRename) throw Object.assign(new Error("archive_file_exists"), { code: "archive_file_exists" });
    }
    await writeBlob(archivedDirectory, storedName, file);
    const storageKey = [...archiveParts, storedName].join("/");
    return {
      storageProvider: this.id,
      storageKey,
      projectId: project.id,
      stageId: stage.id,
      originalName: file.name,
      storedName,
      version,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      checksum,
      createdAt: new Date().toISOString(),
      bucket: "已归档" as const,
      category,
      classificationSource,
      classificationConfidence,
      classificationEvidence,
      reviewStatus: "confirmed",
    };
  }

  async moveFile(input: Parameters<LocalFolderStorageProvider["writeFile"]>[0], sourceHandle: any): Promise<ArchiveFileIndex> {
    if (!sourceHandle?.remove) throw Object.assign(new Error("archive_move_unsupported"), { code: "archive_move_unsupported" });
    if (sourceHandle.requestPermission) {
      const permission = await sourceHandle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw Object.assign(new Error("archive_source_delete_permission_required"), { code: "archive_source_delete_permission_required" });
    }

    const archived = await this.writeFile(input);
    const targetParts = archived.storageKey.split("/").filter(Boolean);
    const targetName = targetParts.pop();
    const targetDirectory = targetName ? await getDirectoryByParts(this.rootHandle, targetParts) : null;
    const targetHandle = targetDirectory && targetName ? await targetDirectory.getFileHandle(targetName) : null;

    // 用户若选中的文件本来就在目标归档位置，不能把它当成“源文件”删除。
    if (targetHandle && sourceHandle.isSameEntry && await sourceHandle.isSameEntry(targetHandle)) return archived;

    try {
      await sourceHandle.remove();
      return archived;
    } catch (error) {
      // 移动必须保持单份文件。删除源文件失败时，撤销本次新写入的目标；
      // 命中既有重复文件时不删除原有归档。
      if (!archived.wasSkipped && targetDirectory && targetName) {
        try { await targetDirectory.removeEntry(targetName); } catch { /* 保留原始错误供界面提示 */ }
      }
      throw Object.assign(new Error("archive_source_remove_failed"), { code: "archive_source_remove_failed", cause: error });
    }
  }

  async writeUncertainFile({ project, file, fileType, projectFolder: fixedProjectFolder, folderLabels = [] }: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string; folderLabels?: string[] }): Promise<ArchiveFileIndex> {
    const { projectFolder } = await this.ensureProjectStructure(project, [], fixedProjectFolder);
    const safeFolders = folderLabels.map((part) => sanitizeArchiveSegment(part)).filter(Boolean);
    const targetParts = [projectFolder, "未确定", ...safeFolders];
    const directory = await getDirectoryByParts(this.rootHandle, targetParts, true);
    const { base, ext } = splitFilename(file.name || "资料");
    const stem = [getArchiveProjectCode(project), "未确定", sanitizeArchiveSegment(fileType || base || "资料"), sanitizeArchiveSegment(base || "资料")].join("_");
    const versionNumber = await nextVersion(directory, stem, ext);
    const version = `V${versionNumber}`;
    const storedName = `${stem}_${version}_${formatDateStamp()}${ext}`;
    const checksum = await sha256(file);
    await writeBlob(directory, storedName, file);
    return { storageProvider: this.id, storageKey: [...targetParts, storedName].join("/"), projectId: project.id, stageId: "unconfirmed", originalName: file.name, storedName, version, size: file.size, contentType: file.type || "application/octet-stream", checksum, createdAt: new Date().toISOString(), bucket: "待提交" as const, category: fileType || "待复核", classificationSource: "none", classificationConfidence: 0, reviewStatus: "needs-review" };
  }

  async previewGeneratedArchiveFiles() {
    const availability = await this.checkAvailability();
    if (!availability.available) throw Object.assign(new Error("archive_permission_required"), { code: "archive_permission_required" });
    const candidates: ArchiveCleanupCandidate[] = [];
    const generatedName = /_V\d+_\d{8}(?:\.[^.]+)?$/i;
    const walk = async (directory: any, parts: string[]) => {
      for await (const entry of directory.values()) {
        if (entry.kind === "directory") await walk(entry, [...parts, entry.name]);
        else if (entry.kind === "file" && generatedName.test(entry.name) && parts.at(-1) === "已归档") {
          const file = await entry.getFile().catch(() => null);
          if (!file) continue;
          const stageId = stageIdFromArchiveFolder(parts[1] || "");
          const category = categoryParts(numberArchiveFolderPath(stageId, inferLegacyCategory(entry.name)));
          candidates.push({ storageKey: [...parts, entry.name].join("/"), targetStorageKey: [...parts, ...category, entry.name].join("/"), name: entry.name, size: file.size, checksum: await sha256(file), modifiedAt: new Date(file.lastModified).toISOString(), status: "ready" });
        }
      }
    };
    for await (const entry of this.rootHandle.values()) {
      if (entry.kind !== "directory") continue;
      await walk(entry, [entry.name]);
    }
    return candidates;
  }

  async rebuildGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]) {
    const verified: ArchiveCleanupCandidate[] = [];
    let copied = 0;
    let skipped = 0;
    let conflicts = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const source = await this.readFile(candidate.storageKey);
        if (await sha256(source) !== candidate.checksum) { conflicts += 1; continue; }
        const targetParts = candidate.targetStorageKey.split("/").filter(Boolean);
        const targetName = targetParts.pop();
        if (!targetName || targetParts.some((part) => part === "..")) { failed += 1; continue; }
        const targetDirectory = await getDirectoryByParts(this.rootHandle, targetParts, true);
        let targetFile: File | null = null;
        try { targetFile = await (await targetDirectory.getFileHandle(targetName)).getFile(); } catch (error: any) { if (error?.name !== "NotFoundError") throw error; }
        if (targetFile) {
          if (await sha256(targetFile) !== candidate.checksum) { conflicts += 1; continue; }
          skipped += 1;
        } else {
          await writeBlob(targetDirectory, targetName, source);
          targetFile = await (await targetDirectory.getFileHandle(targetName)).getFile();
          if (targetFile.size !== source.size || await sha256(targetFile) !== candidate.checksum) { conflicts += 1; continue; }
          copied += 1;
        }
        verified.push({ ...candidate, status: "verified" });
      } catch { failed += 1; }
    }
    return { verified, copied, skipped, conflicts, failed };
  }

  async deleteGeneratedArchiveFiles(candidates: ArchiveCleanupCandidate[]) {
    const generatedName = /_V\d+_\d{8}(?:\.[^.]+)?$/i;
    let deleted = 0;
    let failed = 0;
    for (const candidate of candidates.filter((item) => item.status === "verified")) {
      const parts = String(candidate.storageKey).split("/").filter(Boolean);
      const name = parts.at(-1) || "";
      if (parts.length < 3 || !generatedName.test(name) || parts.at(-2) !== "已归档") { failed += 1; continue; }
      try {
        const source = await this.readFile(candidate.storageKey);
        const target = await this.readFile(candidate.targetStorageKey);
        if (await sha256(source) !== candidate.checksum || await sha256(target) !== candidate.checksum) { failed += 1; continue; }
        const directory = await getDirectoryByParts(this.rootHandle, parts.slice(0, -1));
        await directory.removeEntry(name);
        deleted += 1;
      } catch { failed += 1; }
    }
    return { deleted, failed };
  }

  async listFiles({ project, stages, projectFolder: fixedProjectFolder }: { project: ArchiveProject; stages: ArchiveStage[]; projectFolder?: string }) {
    const availability = await this.checkAvailability();
    if (!availability.available) return [];
    const projectFolder = fixedProjectFolder || getArchiveProjectFolder(project);
    const results: ArchiveFileIndex[] = [];
    for (const stage of stages) {
      let stageDirectory: any;
      try {
        stageDirectory = await getDirectoryByParts(this.rootHandle, [projectFolder, getArchiveStageFolder(stage)]);
      } catch (error: any) {
        if (error?.name === "NotFoundError") continue;
        throw error;
      }
      const walkDirect = async (current: any, pathParts: string[]) => {
        for await (const entry of current.values()) {
          if (entry.name === "待提交" || entry.name === "已归档" || entry.name === "文件清单.json") continue;
          if (entry.kind === "directory") { await walkDirect(entry, [...pathParts, entry.name]); continue; }
          if (entry.kind !== "file") continue;
          const file = await entry.getFile();
          results.push({ storageProvider: this.id, storageKey: [...pathParts, entry.name].join("/"), projectId: project.id, stageId: stage.id, originalName: entry.name, storedName: entry.name, version: entry.name.match(/_(V\d+)_\d{8}(?:\.[^.]+)?$/)?.[1] || "", size: file.size, contentType: file.type || "application/octet-stream", checksum: await sha256(file), createdAt: new Date(file.lastModified).toISOString(), category: pathParts.slice(2).join("/") || "其他资料", classificationSource: "folder", classificationConfidence: 0.9, classificationEvidence: pathParts.slice(2).join("/") || getArchiveStageFolder(stage), reviewStatus: "confirmed" });
        }
      };
      await walkDirect(stageDirectory, [projectFolder, getArchiveStageFolder(stage)]);
      for (const bucket of ["待提交", "已归档"] as const) {
        let directory: any;
        try {
          directory = await getDirectoryByParts(this.rootHandle, [projectFolder, getArchiveStageFolder(stage), bucket]);
        } catch (error: any) {
          if (error?.name === "NotFoundError") continue;
          throw error;
        }
        const walk = async (current: any, pathParts: string[]) => {
          for await (const entry of current.values()) {
            if (entry.kind === "directory") { await walk(entry, [...pathParts, entry.name]); continue; }
            if (entry.kind !== "file") continue;
            const file = await entry.getFile();
          results.push({
            storageProvider: this.id,
            storageKey: [...pathParts, entry.name].join("/"),
            projectId: project.id,
            stageId: stage.id,
            originalName: entry.name,
            storedName: entry.name,
            version: entry.name.match(/_(V\d+)_\d{8}(?:\.[^.]+)?$/)?.[1] || "",
            size: file.size,
            contentType: file.type || "application/octet-stream",
            checksum: await sha256(file),
            createdAt: new Date(file.lastModified).toISOString(),
            bucket,
            category: pathParts.slice(3).join("/") || "其他资料",
            classificationSource: "folder",
            classificationConfidence: 0.9,
            classificationEvidence: pathParts.slice(3).join("/") || getArchiveStageFolder(stage),
            reviewStatus: "confirmed",
          });
          }
        };
        await walk(directory, [projectFolder, getArchiveStageFolder(stage), bucket]);
      }
    }
    return results;
  }

  async readFile(storageKey: string) {
    const parts = String(storageKey).split("/").filter(Boolean);
    const filename = parts.pop();
    if (!filename || parts.some((part) => part === "..")) throw new Error("invalid_storage_key");
    const directory = await getDirectoryByParts(this.rootHandle, parts);
    return (await directory.getFileHandle(filename)).getFile();
  }

  async deleteFile(storageKey: string) {
    const availability = await this.checkAvailability();
    if (!availability.available) throw new Error("archive_permission_required");
    const parts = String(storageKey).split("/").filter(Boolean);
    const filename = parts.pop();
    if (!filename || [filename, ...parts].some((part) => part === ".." || part === ".")) throw new Error("invalid_storage_key");
    const directory = await getDirectoryByParts(this.rootHandle, parts);
    await directory.removeEntry(filename);
  }

  async getDownloadTarget(storageKey: string) {
    const file = await this.readFile(storageKey);
    const url = URL.createObjectURL(file);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
}

export async function getLocalArchiveProvider() {
  const handle = await offlineDb.getAppData<any>(LOCAL_ARCHIVE_HANDLE_KEY);
  return handle ? new LocalFolderStorageProvider(handle) : null;
}

export async function getLocalArchiveHandle() {
  return offlineDb.getAppData<any>(LOCAL_ARCHIVE_HANDLE_KEY);
}

export async function chooseLocalArchiveProvider() {
  const picker = (window as any).showDirectoryPicker;
  if (!picker) throw Object.assign(new Error("archive_picker_unsupported"), { code: "archive_picker_unsupported" });
  const handle = await picker({ mode: "readwrite" });
  await offlineDb.putAppData(LOCAL_ARCHIVE_HANDLE_KEY, handle);
  window.dispatchEvent(new CustomEvent("archive-root-changed"));
  return new LocalFolderStorageProvider(handle);
}

export async function requestLocalArchivePermission() {
  const handle = await offlineDb.getAppData<any>(LOCAL_ARCHIVE_HANDLE_KEY);
  if (!handle) return false;
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function downloadLocalArchiveFile(storageKey: string, downloadName?: string) {
  const provider = await getLocalArchiveProvider();
  if (!provider) throw new Error("archive_folder_not_authorized");
  const availability = await provider.checkAvailability();
  if (!availability.available) throw new Error("archive_permission_required");
  const target = await provider.getDownloadTarget(storageKey);
  const link = document.createElement("a");
  link.href = target.url;
  if (downloadName) link.download = downloadName;
  link.click();
  window.setTimeout(target.revoke, 1000);
}

export async function openLocalArchiveFile(storageKey: string) {
  // 必须在点击事件仍有用户激活时先创建窗口，否则读取文件句柄后的异步
  // window.open 可能被浏览器当成弹窗拦截。
  const previewWindow = window.open("about:blank", "_blank");
  try {
    const provider = await getLocalArchiveProvider();
    if (!provider) throw new Error("archive_folder_not_authorized");
    const availability = await provider.checkAvailability();
    if (!availability.available) throw new Error("archive_permission_required");
    const target = await provider.getDownloadTarget(storageKey);
    if (previewWindow) {
      previewWindow.location.href = target.url;
    } else {
      const link = document.createElement("a");
      link.href = target.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.click();
    }
    window.setTimeout(target.revoke, 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}
