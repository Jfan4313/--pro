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
};

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
  writeFile(input: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string }): Promise<ArchiveFileIndex>;
  writeUncertainFile(input: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string }): Promise<ArchiveFileIndex>;
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
  abstract writeFile(input: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string }): Promise<ArchiveFileIndex>;
  abstract writeUncertainFile(input: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string }): Promise<ArchiveFileIndex>;
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

  async writeFile({ project, stage, file, fileType, autoRename = true, projectFolder: fixedProjectFolder }: { project: ArchiveProject; stage: ArchiveStage; file: File; fileType?: string; autoRename?: boolean; projectFolder?: string }) {
    const { projectFolder } = await this.ensureProjectStructure(project, [stage], fixedProjectFolder);
    const archivedDirectory = await getDirectoryByParts(this.rootHandle, [projectFolder, getArchiveStageFolder(stage), "已归档"]);
    const { base, ext } = splitFilename(file.name || "资料");
    const stem = [getArchiveProjectCode(project), getArchiveStageCode(stage), sanitizeArchiveSegment(fileType || base || "资料"), sanitizeArchiveSegment(base || "资料")].join("_");
    const versionNumber = await nextVersion(archivedDirectory, stem, ext);
    const version = `V${versionNumber}`;
    const storedName = autoRename ? `${stem}_${version}_${formatDateStamp()}${ext}` : file.name;
    if (!autoRename && await fileExists(archivedDirectory, storedName)) throw Object.assign(new Error("archive_file_exists"), { code: "archive_file_exists" });
    const checksum = await sha256(file);
    await writeBlob(archivedDirectory, storedName, file);
    const storageKey = [projectFolder, getArchiveStageFolder(stage), "已归档", storedName].join("/");
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
    };
  }

  async writeUncertainFile({ project, file, fileType, projectFolder: fixedProjectFolder }: { project: ArchiveProject; file: File; fileType?: string; projectFolder?: string }) {
    const { projectFolder } = await this.ensureProjectStructure(project, [], fixedProjectFolder);
    const directory = await getDirectoryByParts(this.rootHandle, [projectFolder, "未确定"]);
    const { base, ext } = splitFilename(file.name || "资料");
    const stem = [getArchiveProjectCode(project), "未确定", sanitizeArchiveSegment(fileType || base || "资料"), sanitizeArchiveSegment(base || "资料")].join("_");
    const versionNumber = await nextVersion(directory, stem, ext);
    const version = `V${versionNumber}`;
    const storedName = `${stem}_${version}_${formatDateStamp()}${ext}`;
    const checksum = await sha256(file);
    await writeBlob(directory, storedName, file);
    return { storageProvider: this.id, storageKey: [projectFolder, "未确定", storedName].join("/"), projectId: project.id, stageId: "unconfirmed", originalName: file.name, storedName, version, size: file.size, contentType: file.type || "application/octet-stream", checksum, createdAt: new Date().toISOString(), bucket: "待提交" as const };
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
        for await (const entry of directory.values()) {
          if (entry.kind !== "file") continue;
          const file = await entry.getFile();
          results.push({
            storageProvider: this.id,
            storageKey: [projectFolder, getArchiveStageFolder(stage), bucket, entry.name].join("/"),
            projectId: project.id,
            stageId: stage.id,
            originalName: entry.name,
            storedName: entry.name,
            version: entry.name.match(/_(V\d+)_\d{8}(?:\.[^.]+)?$/)?.[1] || "",
            size: file.size,
            contentType: file.type || "application/octet-stream",
            checksum: "",
            createdAt: new Date(file.lastModified).toISOString(),
            bucket,
          });
        }
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
