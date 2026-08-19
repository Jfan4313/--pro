import fs from "node:fs";
import path from "node:path";

export function sanitizePathSegment(value = "未命名") {
  const text = String(value || "未命名")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "未命名";
}

export function getProjectCode(project = {}) {
  return sanitizePathSegment(project.projectNumber || project.projectCode || project.code || project.id || "PROJECT");
}

export function getStageCode(stage = {}) {
  const match = String(stage.name || stage.id || "").match(/[①②③④⑤⑥⑦⑧⑨⑩]|\d+/);
  const numberMap = { "①": "01", "②": "02", "③": "03", "④": "04", "⑤": "05", "⑥": "06", "⑦": "07", "⑧": "08", "⑨": "09", "⑩": "10" };
  const raw = match?.[0] || String(stage.id || "stage").split("_")[0];
  return numberMap[raw] || String(raw).padStart(2, "0");
}

export function getStageCleanName(stage = {}) {
  return sanitizePathSegment(String(stage.name || stage.id || "阶段").replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "").trim());
}

export function getProjectFolderName(project = {}) {
  return `${getProjectCode(project)}_${sanitizePathSegment(project.name || project.projectName || "未命名项目")}`;
}

function getLegacyProjectFolderName(project = {}) {
  return `${sanitizePathSegment(project.projectCode || project.code || project.id || "PROJECT")}_${sanitizePathSegment(project.name || project.projectName || "未命名项目")}`;
}

export function getStageFolderName(stage = {}) {
  return `${getStageCode(stage)}_${getStageCleanName(stage)}`;
}

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ensureProjectStageFolders({ rootPath, project, stages = [], nowIso }) {
  fs.mkdirSync(rootPath, { recursive: true });
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

export function getVersionForFile(targetDir, stem, ext) {
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

export function buildProjectStoredFile({ project, stage, fileType, filename, targetDir }) {
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

export function listProjectFilesFromDisk({ rootPath, project, stages = [] }) {
  let projectFolder = getProjectFolderName(project);
  let projectPath = path.join(rootPath, projectFolder);
  const legacyProjectFolder = getLegacyProjectFolderName(project);
  const legacyProjectPath = path.join(rootPath, legacyProjectFolder);
  if (!fs.existsSync(projectPath) && legacyProjectFolder !== projectFolder && fs.existsSync(legacyProjectPath)) {
    projectFolder = legacyProjectFolder;
    projectPath = legacyProjectPath;
  }
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

export function resolveProjectFile({ rootPath, relativePath = "" }) {
  const resolved = path.resolve(rootPath, String(relativePath));
  if (!resolved.startsWith(`${rootPath}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return { absolutePath: resolved };
}
