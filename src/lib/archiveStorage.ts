import { offlineDb } from "./offlineDb";

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

async function getPermission(handle: any) {
  if (!handle?.queryPermission) return "granted" as const;
  return (await handle.queryPermission({ mode: "readwrite" })) as "granted" | "prompt" | "denied";
}

async function getDirectoryByParts(root: any, parts: string[], create = false) {
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return directory;
}

async function writeBlob(directory: any, name: string, blob: Blob) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
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

function meaningfulFolderLabels(labels: string[], stage: ArchiveStage, category: string) {
  const stageName = sanitizeArchiveSegment(String(stage.name || "").replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "")).toLocaleLowerCase();
  const categories = categoryParts(category).map((item) => item.toLocaleLowerCase());
  return labels.map((part) => sanitizeArchiveSegment(part)).filter((part) => {
    const normalized = part.toLocaleLowerCase();
    if (!normalized || normalized === stageName || categories.some((categoryPart) => normalized.includes(categoryPart) || categoryPart.includes(normalized))) return false;
    if (/^(0?[1-9][-_])/.test(normalized) || /项目立项|现场勘察|前期收资|初步设计|商务沟通|签订合同|项目备案|深化设计|项目交底|施工资料|施工进场|开工资料|验收并网|竣工资料/.test(normalized)) return false;
    if (category.startsWith("招投标资料") && /招投标|招标|投标|标书|技术标|商务标|澄清|答疑/.test(normalized)) return false;
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

  async ensureProjectStructure(project: ArchiveProject, stages: ArchiveStage[], fixedProjectFolder?: string) {
    const availability = await this.checkAvailability();
    if (!availability.available) throw Object.assign(new Error("archive_permission_required"), { code: "archive_permission_required" });
    const projectFolder = fixedProjectFolder || getArchiveProjectFolder(project);
    const projectDirectory = await this.rootHandle.getDirectoryHandle(projectFolder, { create: true });
    await projectDirectory.getDirectoryHandle("参建单位资料", { create: true });
    await projectDirectory.getDirectoryHandle("未确定", { create: true });

    for (const stage of stages) {
      const stageDirectory = await projectDirectory.getDirectoryHandle(getArchiveStageFolder(stage), { create: true });
      await stageDirectory.getDirectoryHandle("待提交", { create: true });
      await stageDirectory.getDirectoryHandle("已归档", { create: true });
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
    return { projectFolder, generatedThroughStageId: stages.at(-1)?.id };
  }

  async writeFile({ project, stage, file, fileType, autoRename = true, projectFolder: fixedProjectFolder, sourceRelativePath, folderLabels, preserveFolders = false, classificationSource, classificationConfidence, classificationEvidence }: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string; sourceRelativePath?: string; folderLabels?: string[]; preserveFolders?: boolean; classificationSource?: string; classificationConfidence?: number; classificationEvidence?: string }): Promise<ArchiveFileIndex> {
    const { projectFolder } = await this.ensureProjectStructure(project, [stage], fixedProjectFolder);
    const sourceParts = preserveFolders ? String(sourceRelativePath || "").split("/").filter(Boolean) : [];
    const localFolderLabels = folderLabels || (sourceParts.length > 1 ? sourceParts.slice(1, -1) : []);
    const category = fileType || "其他资料";
    const sourceFolders = preserveFolders ? meaningfulFolderLabels(localFolderLabels, stage, category) : [];
    const archiveParts = [projectFolder, getArchiveStageFolder(stage), "已归档", ...categoryParts(category), ...sourceFolders];
    const archivedDirectory = await getDirectoryByParts(this.rootHandle, archiveParts, true);
    const { base, ext } = splitFilename(file.name || "资料");
    const stem = preserveFolders ? sanitizeArchiveSegment(base || "资料") : [getArchiveProjectCode(project), getArchiveStageCode(stage), sanitizeArchiveSegment(fileType || base || "资料"), sanitizeArchiveSegment(base || "资料")].join("_");
    const checksum = await sha256(file);
    const duplicate = await findDuplicate(archivedDirectory, checksum);
    if (duplicate) {
      const match = duplicate.name.match(/_V(\d+)_\d{8}/i);
      return { storageProvider: this.id, storageKey: [...archiveParts, duplicate.name].join("/"), projectId: project.id, stageId: stage.id, originalName: file.name, storedName: duplicate.name, version: `V${match?.[1] || "1"}`, size: duplicate.size, contentType: duplicate.type || file.type || "application/octet-stream", checksum, createdAt: new Date(duplicate.lastModified).toISOString(), bucket: "已归档", category, classificationSource, classificationConfidence, classificationEvidence, reviewStatus: "confirmed", wasSkipped: true };
    }
    const versionNumber = await nextVersion(archivedDirectory, stem, ext);
    const version = `V${versionNumber}`;
    const storedName = autoRename ? `${stem}_${version}_${formatDateStamp()}${ext}` : file.name;
    if (!autoRename && await fileExists(archivedDirectory, storedName)) throw Object.assign(new Error("archive_file_exists"), { code: "archive_file_exists" });
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
          const category = categoryParts(inferLegacyCategory(entry.name));
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
