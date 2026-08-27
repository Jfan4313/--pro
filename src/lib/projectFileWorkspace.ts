import type { ProjectFileManifest } from "./apiClient";
import { buildArchiveVersionView, getArchiveDisplayName, getArchiveStageFolder, type ArchiveStage } from "./archiveStorage";

export type WorkspaceFileSource = "local" | "remote" | "legacy";
export type WorkspaceFileAvailability = "local" | "uploaded" | "local-only" | "stale" | "missing" | "legacy";

export type ProjectWorkspaceFile = {
  id: string;
  stageId: string;
  name: string;
  originalName: string;
  logicalPath: string;
  directoryParts: string[];
  category: string;
  size: number;
  updatedAt: string;
  checksum?: string | null;
  version: string;
  versionNumber: number;
  versionCount: number;
  isLatestVersion: boolean;
  isDuplicate: boolean;
  source: WorkspaceFileSource;
  availability: WorkspaceFileAvailability;
  storageProvider?: string;
  storageKey?: string;
  relativePath?: string;
  manifest?: ProjectFileManifest;
  canOpenLocal: boolean;
  canViewRemote: boolean;
  canUpload: boolean;
  raw: any;
  groupKey: string;
};

export type ProjectWorkspaceDirectory = {
  id: string;
  name: string;
  path: string[];
  stageId: string;
  depth: number;
  count: number;
  localCount: number;
  remoteCount: number;
  issueCount: number;
  children: ProjectWorkspaceDirectory[];
};

export type ProjectFileWorkspace = {
  files: ProjectWorkspaceFile[];
  directories: ProjectWorkspaceDirectory[];
  totalFiles: number;
  localFiles: number;
  remoteFiles: number;
  issueFiles: number;
};

type StageFiles = { stageId?: string; stageName?: string; files?: any[] };

function normalizePath(value = "") {
  return String(value).replace(/\\/g, "/").split("/").filter(Boolean).join("/").toLocaleLowerCase();
}

function stripVersion(value = "") {
  return String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/_V\d+_\d{8}$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function pathAfterStage(path: string, stage?: ArchiveStage) {
  const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) return [];
  const stageFolder = stage ? getArchiveStageFolder(stage) : "";
  const stageIndex = parts.findIndex((part) => part === stageFolder);
  const scoped = stageIndex >= 0 ? parts.slice(stageIndex + 1) : parts.slice(Math.min(parts.length, 2));
  if (["已归档", "待提交"].includes(scoped[0])) scoped.shift();
  scoped.pop();
  return scoped;
}

function directoryParts(file: any, stage?: ArchiveStage) {
  const category = String(file.category || "").split("/").filter(Boolean);
  if (category.length && category.join("/") !== "其他资料") return category;
  const fromPath = pathAfterStage(file.storageKey || file.relativePath || file.logicalPath || "", stage);
  return fromPath.length ? fromPath : ["其他资料"];
}

function availabilityFor(file: any, manifest?: ProjectFileManifest): WorkspaceFileAvailability {
  if (file.storageProvider === "local-folder" && !file.localUnavailable) return "local";
  if (manifest?.availability) return manifest.availability;
  if (file.storageProvider === "legacy-server") return "legacy";
  return file.localUnavailable ? "local-only" : "legacy";
}

function sourceFor(file: any, manifest?: ProjectFileManifest): WorkspaceFileSource {
  if (file.storageProvider === "local-folder") return "local";
  if (manifest) return "remote";
  return "legacy";
}

function recordKey(stageId: string, file: any) {
  const path = normalizePath(file.storageKey || file.logicalPath || file.relativePath || "");
  if (path) return `${stageId}|path:${path}`;
  if (file.checksum) return `${stageId}|checksum:${file.checksum}`;
  return `${stageId}|name:${normalizePath(file.originalName || file.storedName || file.name)}`;
}

function manifestMatchKey(manifest: ProjectFileManifest) {
  return recordKey(manifest.stageId, { logicalPath: manifest.logicalPath, checksum: manifest.checksum, originalName: manifest.originalName });
}

export function buildProjectFileWorkspace(stageFiles: StageFiles[], manifests: ProjectFileManifest[], stages: ArchiveStage[]): ProjectFileWorkspace {
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const records = new Map<string, { stageId: string; file: any; manifest?: ProjectFileManifest }>();
  const checksumKeys = new Map<string, string>();

  for (const stageFolder of stageFiles || []) {
    const stageId = stageFolder.stageId || stages.find((stage) => stage.name === stageFolder.stageName)?.id || "unconfirmed";
    for (const file of stageFolder.files || []) {
      const key = recordKey(stageId, file);
      const existing = records.get(key);
      if (!existing || (file.storageProvider === "local-folder" && existing.file.storageProvider !== "local-folder")) records.set(key, { stageId, file });
      if (file.checksum) checksumKeys.set(`${stageId}|${file.checksum}`, key);
    }
  }

  for (const manifest of manifests || []) {
    const exactKey = manifestMatchKey(manifest);
    const checksumKey = manifest.checksum ? checksumKeys.get(`${manifest.stageId}|${manifest.checksum}`) : undefined;
    const matchedKey = records.has(exactKey) ? exactKey : checksumKey;
    if (matchedKey) records.set(matchedKey, { ...records.get(matchedKey)!, manifest });
    else records.set(exactKey, {
      stageId: manifest.stageId,
      manifest,
      file: {
        name: manifest.originalName,
        originalName: manifest.originalName,
        logicalPath: manifest.logicalPath,
        category: manifest.category,
        size: manifest.size,
        checksum: manifest.checksum,
        version: manifest.version,
        updatedAt: manifest.lastIndexedAt,
        storageProvider: "cloud-object-storage",
      },
    });
  }

  const baseFiles = [...records.values()].map(({ stageId, file, manifest }, index) => {
    const stage = stageMap.get(stageId);
    const parts = directoryParts({ ...file, logicalPath: manifest?.logicalPath || file.logicalPath }, stage);
    const availability = availabilityFor(file, manifest);
    const logicalName = file.originalName || manifest?.originalName || file.storedName || file.name || "资料";
    return {
      ...file,
      __index: index,
      __stageId: stageId,
      __manifest: manifest,
      __parts: parts,
      __availability: availability,
      __source: sourceFor(file, manifest),
      __groupKey: `${stageId}|${parts.join("/")}|${stripVersion(logicalName)}`,
    };
  });

  const versioned = buildArchiveVersionView(baseFiles);
  const versionCounts = new Map<string, number>();
  const latestByGroup = new Map<string, any>();
  for (const file of versioned) {
    versionCounts.set(file.__groupKey, (versionCounts.get(file.__groupKey) || 0) + 1);
    const current = latestByGroup.get(file.__groupKey);
    if (!current || file.versionNumber > current.versionNumber || new Date(file.createdAt || file.updatedAt || 0).getTime() > new Date(current.createdAt || current.updatedAt || 0).getTime()) latestByGroup.set(file.__groupKey, file);
  }

  const files: ProjectWorkspaceFile[] = versioned.map((file) => {
    const manifest = file.__manifest as ProjectFileManifest | undefined;
    const latest = latestByGroup.get(file.__groupKey) === file;
    const availability = file.__availability as WorkspaceFileAvailability;
    const canOpenLocal = file.storageProvider === "local-folder" && !file.localUnavailable;
    return {
      id: file.storageKey || manifest?.id || `${file.__stageId}-${file.__index}`,
      stageId: file.__stageId,
      name: getArchiveDisplayName(file),
      originalName: file.originalName || manifest?.originalName || file.storedName || file.name || "资料",
      logicalPath: file.storageKey || manifest?.logicalPath || file.relativePath || file.name || "",
      directoryParts: file.__parts,
      category: file.category || manifest?.category || file.__parts.join("/") || "其他资料",
      size: Number(file.size || manifest?.size || 0),
      updatedAt: file.createdAt || file.updatedAt || file.uploadTime || manifest?.lastIndexedAt || "",
      checksum: file.checksum || manifest?.checksum,
      version: file.version || manifest?.version || "V1",
      versionNumber: file.versionNumber,
      versionCount: versionCounts.get(file.__groupKey) || file.versionCount || 1,
      isLatestVersion: latest,
      isDuplicate: file.isDuplicate,
      source: file.__source,
      availability,
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
      relativePath: file.relativePath,
      manifest,
      canOpenLocal,
      canViewRemote: Boolean(manifest?.availability === "uploaded" && manifest.canViewContent),
      canUpload: Boolean(canOpenLocal && manifest && manifest.availability !== "uploaded"),
      raw: file,
      groupKey: file.__groupKey,
    };
  });

  const directories = stages.map((stage) => buildStageDirectory(stage, files.filter((file) => file.stageId === stage.id)));
  const latestFiles = files.filter((file) => file.isLatestVersion);
  return {
    files,
    directories,
    totalFiles: latestFiles.length,
    localFiles: latestFiles.filter((file) => file.canOpenLocal).length,
    remoteFiles: latestFiles.filter((file) => file.manifest?.availability === "uploaded").length,
    issueFiles: latestFiles.filter((file) => file.availability === "missing" || file.availability === "stale").length,
  };
}

function buildStageDirectory(stage: ArchiveStage, files: ProjectWorkspaceFile[]): ProjectWorkspaceDirectory {
  const root: ProjectWorkspaceDirectory = { id: stage.id, name: stage.name, path: [], stageId: stage.id, depth: 0, count: 0, localCount: 0, remoteCount: 0, issueCount: 0, children: [] };
  if (!files.some((file) => file.isLatestVersion)) {
    for (const expectedPath of stage.files || []) {
      let expectedNode = root;
      String(expectedPath).split("/").filter(Boolean).forEach((part, index) => {
        let child = expectedNode.children.find((item) => item.name === part);
        if (!child) {
          const path = [...expectedNode.path, part];
          child = { id: `${stage.id}/${path.join("/")}`, name: part, path, stageId: stage.id, depth: index + 1, count: 0, localCount: 0, remoteCount: 0, issueCount: 0, children: [] };
          expectedNode.children.push(child);
        }
        expectedNode = child;
      });
    }
  }
  for (const file of files.filter((item) => item.isLatestVersion)) {
    let node = root;
    file.directoryParts.forEach((part, index) => {
      let child = node.children.find((item) => item.name === part);
      if (!child) {
        const path = [...node.path, part];
        child = { id: `${stage.id}/${path.join("/")}`, name: part, path, stageId: stage.id, depth: index + 1, count: 0, localCount: 0, remoteCount: 0, issueCount: 0, children: [] };
        node.children.push(child);
      }
      node = child;
    });
    let current: ProjectWorkspaceDirectory | undefined = node;
    while (current) {
      current.count += 1;
      if (file.canOpenLocal) current.localCount += 1;
      if (file.manifest?.availability === "uploaded") current.remoteCount += 1;
      if (file.availability === "missing" || file.availability === "stale") current.issueCount += 1;
      current = current === root ? undefined : findParent(root, current.id);
    }
  }
  sortDirectories(root.children);
  return root;
}

function sortDirectories(directories: ProjectWorkspaceDirectory[]) {
  directories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  directories.forEach((directory) => sortDirectories(directory.children));
}

function findParent(root: ProjectWorkspaceDirectory, childId: string): ProjectWorkspaceDirectory | undefined {
  if (root.children.some((child) => child.id === childId)) return root;
  for (const child of root.children) {
    const found = findParent(child, childId);
    if (found) return found;
  }
  return undefined;
}

export function filesForDirectory(workspace: ProjectFileWorkspace, directoryId: string) {
  const stageId = directoryId.split("/")[0];
  const path = directoryId.split("/").slice(1);
  return workspace.files.filter((file) => file.stageId === stageId && file.isLatestVersion && path.every((part, index) => file.directoryParts[index] === part));
}

export function versionsForFile(workspace: ProjectFileWorkspace, file: ProjectWorkspaceFile) {
  return workspace.files.filter((candidate) => candidate.groupKey === file.groupKey).sort((a, b) => b.versionNumber - a.versionNumber || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
