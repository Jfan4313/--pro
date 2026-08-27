import React from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Cloud, Eye, FileDown, FileText, FolderOpen, FolderSearch, HardDrive, History, MoreHorizontal, RefreshCw, Search, SearchCheck, Trash2, X } from "lucide-react";
import { apiClient, downloadProjectManifestContent, getProjectFileDownloadUrl, ProjectFileManifest } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { normalizeProjectName, normalizeProjectNumber, parseProjectSequence, sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { flattenProjects, getProjectNumber } from "@/src/lib/management";
import { STAGES, getProjectCurrentStageInfo } from "@/src/lib/projectLifecycle";
import { cn } from "@/src/lib/utils";
import { ArchiveCleanupCandidate, ArchiveFolderState, chooseLocalArchiveProvider, getArchiveDisplayName, getCurrentAndNextStages, getLocalArchiveHandle, getLocalArchiveProvider, openLocalArchiveFile, requestLocalArchivePermission } from "@/src/lib/archiveStorage";
import { downloadScanReport, getScannedFileHandle, getScannedProjectIdentity, pickScanDirectory, ProjectScanReport, scanProjectDirectories } from "@/src/lib/projectScanner";
import { createMaterialOrganizationPlan, summarizeOrganizationPlan, MaterialOrganizationPlan } from "@/src/lib/projectMaterialOrganizationSkill";
import { buildProjectFileWorkspace, filesForDirectory, ProjectWorkspaceDirectory, ProjectWorkspaceFile, versionsForFile } from "@/src/lib/projectFileWorkspace";

export function ProjectFiles({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData, setBoardData] = useProjectBoardData();
  const { allProjects, reserveProjectNumber } = useProjectNumbering();
  const [lifecycleStates, setLifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const projects = React.useMemo(() => flattenProjects(boardData), [boardData]);
  const [projectSearch, setProjectSearch] = React.useState("");
  const [selectedProjectId, setSelectedProjectId] = React.useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("projectFilesRecentProjectId") || "");
  const [fileRoot, setFileRoot] = React.useState("");
  const [projectFiles, setProjectFiles] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [backendError, setBackendError] = React.useState("");
  const [isLocationPanelOpen, setIsLocationPanelOpen] = React.useState(false);
  const [localFolderName, setLocalFolderName] = React.useState("");
  const [localPermission, setLocalPermission] = React.useState<"unknown" | "granted" | "prompt" | "denied" | "unsupported">("unknown");
  const [scanRoots, setScanRoots] = React.useState<any[]>([]);
  const [scanReport, setScanReport] = React.useState<ProjectScanReport | null>(null);
  const [selectedImportProjects, setSelectedImportProjects] = React.useState<string[]>([]);
  const [projectNameOverrides, setProjectNameOverrides] = React.useState<Record<string, string>>({});
  const [fileClassificationOverrides, setFileClassificationOverrides] = React.useState<Record<string, { stageId: string; category: string }>>({});
  const [importingProjects, setImportingProjects] = React.useState(false);
  const [aiArchiveReviewing, setAiArchiveReviewing] = React.useState(false);
  const [cleanupCandidates, setCleanupCandidates] = React.useState<ArchiveCleanupCandidate[]>([]);
  const [cleanupScanning, setCleanupScanning] = React.useState(false);
  const [cleanupRebuilding, setCleanupRebuilding] = React.useState(false);
  const [cleanupDeleting, setCleanupDeleting] = React.useState(false);
  const [scanRunning, setScanRunning] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState({ current: 0, total: 0, name: "" });
  const [scanFilter, setScanFilter] = React.useState<"all" | "review" | "issues">("all");
  const [manifests, setManifests] = React.useState<ProjectFileManifest[]>([]);
  const [manifestLoading, setManifestLoading] = React.useState(false);
  const [manifestSyncing, setManifestSyncing] = React.useState(false);
  const [uploadingManifestId, setUploadingManifestId] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [deletingStorageKey, setDeletingStorageKey] = React.useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = React.useState<"browse" | "organize">("browse");
  const [maintenanceOpen, setMaintenanceOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
  const [selectedDirectoryId, setSelectedDirectoryId] = React.useState("");
  const [expandedDirectories, setExpandedDirectories] = React.useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = React.useState<"all" | "local" | "remote" | "issues">("all");
  const [fileSearch, setFileSearch] = React.useState("");
  const [fileSort, setFileSort] = React.useState<"updated" | "name">("updated");
  const [expandedVersionGroups, setExpandedVersionGroups] = React.useState<Set<string>>(new Set());
  const [mobileDirectoryId, setMobileDirectoryId] = React.useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const scanAbortRef = React.useRef<AbortController | null>(null);

  const selectedProject = projects.find((project: any) => project.id === selectedProjectId) || projects[0];
  const visibleProjects = React.useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLocaleLowerCase();
    return sortProjectsNaturally(projects.filter((project: any) => {
      const text = `${getProjectNumber(project)} ${project.name || ""}`.toLocaleLowerCase();
      return !normalizedSearch || text.includes(normalizedSearch);
    }));
  }, [projects, projectSearch]);
  const currentStageInfo = selectedProject ? getProjectCurrentStageInfo(selectedProject.id, lifecycleStates) : null;
  const workspace = React.useMemo(() => buildProjectFileWorkspace(projectFiles?.stages || [], manifests, STAGES), [projectFiles, manifests]);
  const organizationPlan = React.useMemo<MaterialOrganizationPlan | null>(() => {
    if (!scanReport) return null;
    const project = scanReport.projects.find((item) => selectedImportProjects.includes(item.projectKey)) || scanReport.projects[0];
    return project ? createMaterialOrganizationPlan(scanReport, project.projectKey, projectNameOverrides[project.projectKey] || project.projectName, undefined, fileClassificationOverrides) : null;
  }, [scanReport, selectedImportProjects, projectNameOverrides, fileClassificationOverrides]);

  React.useEffect(() => {
    if (!projects.some((project: any) => project.id === selectedProjectId)) setSelectedProjectId(sortProjectsNaturally(projects)[0]?.id || "");
  }, [projects, selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProject?.id) return;
    window.localStorage.setItem("projectFilesRecentProjectId", selectedProject.id);
    setProjectSearch("");
    const currentIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === currentStageInfo?.stage.id));
    const stageIds = STAGES.slice(currentIndex, currentIndex + 2).map((stage) => stage.id);
    setExpandedDirectories(new Set(stageIds));
    setSelectedDirectoryId(currentStageInfo?.stage.id || STAGES[0].id);
    setMobileDirectoryId("");
    setExpandedVersionGroups(new Set());
  }, [selectedProject?.id, currentStageInfo?.stage.id]);

  React.useEffect(() => {
    if (!selectedDirectoryId && workspace.directories[0]) setSelectedDirectoryId(currentStageInfo?.stage.id || workspace.directories[0].id);
  }, [workspace.directories, selectedDirectoryId, currentStageInfo?.stage.id]);

  const selectedDirectory = React.useMemo(() => findWorkspaceDirectory(workspace.directories, selectedDirectoryId), [workspace.directories, selectedDirectoryId]);
  const directoryFiles = React.useMemo(() => {
    const query = fileSearch.trim().toLocaleLowerCase();
    return filesForDirectory(workspace, selectedDirectoryId)
      .filter((file) => sourceFilter === "all" || (sourceFilter === "local" && file.canOpenLocal) || (sourceFilter === "remote" && file.manifest?.availability === "uploaded") || (sourceFilter === "issues" && ["missing", "stale"].includes(file.availability)))
      .filter((file) => !query || `${file.name} ${file.originalName} ${file.category}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => fileSort === "name" ? a.name.localeCompare(b.name, "zh-CN", { numeric: true }) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [workspace, selectedDirectoryId, sourceFilter, fileSearch, fileSort]);
  const mobileDirectory = React.useMemo(() => findWorkspaceDirectory(workspace.directories, mobileDirectoryId), [workspace.directories, mobileDirectoryId]);
  const mobileFiles = React.useMemo(() => {
    if (!mobileDirectoryId) return [];
    const query = fileSearch.trim().toLocaleLowerCase();
    return filesForDirectory(workspace, mobileDirectoryId).filter((file) => !query || `${file.name} ${file.originalName} ${file.category}`.toLocaleLowerCase().includes(query));
  }, [workspace, mobileDirectoryId, fileSearch]);

  const loadFiles = React.useCallback(async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    setBackendError("");
    const stagesById = new Map(STAGES.map((stage) => [stage.id, { stageId: stage.id, stageName: stage.name, files: [] as any[] }]));
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      setLocalPermission(availability?.permission || "unsupported");
      setLocalFolderName(availability?.rootName || "");
      setFileRoot(availability?.rootName || "未授权本机文件夹");
      if (provider && availability?.available) {
        const normalized = await provider.normalizeProjectStructure(selectedProject, STAGES, archiveFolderStates[selectedProject.id]?.projectFolder);
        if (normalized.renamed > 0) window.dispatchEvent(new CustomEvent("show-toast", { detail: `已自动修正 ${normalized.renamed} 个旧文件夹名称` }));
        const localFiles = await provider.listFiles({ project: selectedProject, stages: STAGES, projectFolder: archiveFolderStates[selectedProject.id]?.projectFolder });
        for (const file of localFiles) {
          const folder = stagesById.get(file.stageId);
          folder?.files.push({
            name: file.storedName,
            storedName: file.storedName,
            originalName: file.originalName,
            category: file.category,
            version: file.version,
            checksum: file.checksum,
            bucket: file.bucket,
            size: file.size,
            updatedAt: file.createdAt,
            storageProvider: file.storageProvider,
            storageKey: file.storageKey,
          });
        }
      }

      for (const stage of STAGES) {
        const indexedFiles = lifecycleStates[selectedProject.id]?.[stage.id]?.files || [];
        const folder = stagesById.get(stage.id);
        for (const file of indexedFiles) {
          if (file.storageProvider !== "local-folder" || !file.storageKey) continue;
          if (folder?.files.some((existing: any) => existing.storageKey === file.storageKey)) continue;
          folder?.files.push({
            ...file,
            name: file.storedName || file.name,
            bucket: "已归档",
            updatedAt: file.createdAt || file.uploadTime,
            localUnavailable: !availability?.available,
          });
        }
      }

      try {
        const legacy = await apiClient.listProjectFiles(selectedProject.id, { project: selectedProject, stages: STAGES });
        for (const stage of legacy.stages || []) {
          const folder = stagesById.get(stage.stageId);
          for (const file of stage.files || []) folder?.files.push({ ...file, storageProvider: "legacy-server", storageKey: file.relativePath });
        }
      } catch {
        setBackendError("服务器历史归档暂不可读取；本机资料仍可正常使用");
      }
      setProjectFiles({ stages: Array.from(stagesById.values()) });
    } catch (error: any) {
      setProjectFiles({ stages: Array.from(stagesById.values()) });
      setBackendError(error?.message === "archive_permission_required" ? "本机归档文件夹需要重新授权" : "读取本机项目资料失败");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject, archiveFolderStates, lifecycleStates]);

  const loadManifests = React.useCallback(async () => {
    if (!selectedProject) return;
    setManifestLoading(true);
    try { setManifests((await apiClient.listProjectFileManifests(selectedProject.id)).manifests || []); }
    catch { setManifests([]); }
    finally { setManifestLoading(false); }
  }, [selectedProject]);

  const openLocationPanel = async () => setIsLocationPanelOpen(true);

  React.useEffect(() => {
    loadFiles();
    loadManifests();
  }, [loadFiles, loadManifests]);

  const initFolders = async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) throw new Error("archive_permission_required");
      const result = await provider.ensureProjectStructure(selectedProject, STAGES, archiveFolderStates[selectedProject.id]?.projectFolder);
      await setArchiveFolderStates((current) => ({
        ...current,
        [selectedProject.id]: {
          status: "ready",
          storageProvider: "local-folder",
          projectFolder: result.projectFolder,
          generatedThroughStageId: result.generatedThroughStageId,
          updatedAt: new Date().toISOString(),
        },
      }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "完整生命周期资料夹及分类子文件夹已生成" }));
      await loadFiles();
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message === "archive_permission_required" ? "请先授权本机归档文件夹" : "生成失败，请检查本机文件夹权限" }));
    } finally {
      setIsLoading(false);
    }
  };

  const restoreProjectsFromScan = async (report: ProjectScanReport) => {
    const candidatesByName = new Map<string, typeof report.projects[number]>();
    for (const project of report.projects.filter((item) => item.projectName !== "未分组资料")) {
      const key = normalizeProjectName(project.projectName);
      const current = candidatesByName.get(key);
      const currentIsNumbered = Boolean(current?.projectNumber || getScannedProjectIdentity(current?.projectKey || "").projectNumber);
      const nextIsNumbered = Boolean(project.projectNumber || getScannedProjectIdentity(project.projectKey).projectNumber);
      if (!current || (nextIsNumbered && !currentIsNumbered)) candidatesByName.set(key, project);
    }
    const candidates = [...candidatesByName.values()];
    if (!candidates.length) return 0;
    const usedNumbers = new Set(allProjects.map((project: any) => normalizeProjectNumber(project.projectNumber || project.code)).filter(Boolean));
    const restored: any[] = [];
    for (const project of candidates) {
      const identity = getScannedProjectIdentity(project.projectKey);
      const projectName = project.projectName.trim();
      const existing = projects.find((candidate: any) => String(candidate.name || "").trim() === projectName || candidate.importedProjectKey === project.projectKey);
      if (existing) {
        if (existing.importedProjectKey !== project.projectKey) restored.push({ ...existing, importedProjectKey: project.projectKey });
        continue;
      }
      const explicitNumber = normalizeProjectNumber(project.projectNumber || identity.projectNumber);
      const projectNumber = explicitNumber && !usedNumbers.has(explicitNumber) ? explicitNumber : await reserveProjectNumber();
      usedNumbers.add(projectNumber);
      restored.push({ id: globalThis.crypto?.randomUUID?.() || `p${Date.now()}-${restored.length}`, projectNumber, name: projectName, type: "光伏项目", manager: "待确定", dueDate: "", constructProgress: 0, supplyProgress: 0, status: "normal", importedFromScanId: report.id, importedProjectKey: project.projectKey, importedFileCount: project.fileCount, importedStageId: STAGES[0].id });
    }
    if (!restored.length) return 0;
    setBoardData((current: any[]) => {
      const source = Array.isArray(current) && current.length ? current : STAGES.map((stage) => ({ id: stage.id, title: stage.name, count: 0, projects: [] }));
      const next = source.map((column: any) => ({ ...column, projects: [...(column.projects || [])] }));
      for (const project of restored) {
        let placed = false;
        for (const column of next) column.projects = column.projects.map((candidate: any) => candidate.id === project.id ? { ...candidate, ...project } : candidate);
        if (!projects.some((candidate: any) => candidate.id === project.id)) {
          const target = next.find((column: any) => column.id === project.importedStageId) || next[0];
          target.projects = sortProjectsNaturally([project, ...target.projects]);
          placed = true;
        }
        if (placed) for (const column of next) column.count = column.projects.length;
      }
      const preferredByName = new Map<string, any>();
      for (const column of next) for (const project of column.projects) {
        const key = normalizeProjectName(project.name);
        const previous = preferredByName.get(key);
        if (!previous) preferredByName.set(key, project);
        else {
          const previousScanNumber = Boolean(String(previous.importedProjectKey || "").match(/^PRJ[-_ ]?\d+/i));
          const currentScanNumber = Boolean(String(project.importedProjectKey || "").match(/^PRJ[-_ ]?\d+/i));
          const previousSequence = parseProjectSequence(normalizeProjectNumber(previous.projectNumber || previous.code));
          const currentSequence = parseProjectSequence(normalizeProjectNumber(project.projectNumber || project.code));
          if ((currentScanNumber && !previousScanNumber) || (currentScanNumber === previousScanNumber && currentSequence > 0 && (previousSequence === 0 || currentSequence < previousSequence))) preferredByName.set(key, project);
        }
      }
      for (const column of next) {
        column.projects = column.projects.filter((project: any) => preferredByName.get(normalizeProjectName(project.name))?.id === project.id);
        column.count = column.projects.length;
      }
      return next;
    });
    return restored.length;
  };

  const chooseLocalFolder = async () => {
    try {
      const provider = await chooseLocalArchiveProvider();
      const availability = await provider.checkAvailability();
      setLocalPermission(availability.permission);
      setLocalFolderName(availability.rootName || "已授权文件夹");
      setFileRoot(availability.rootName || "已授权本地文件夹");
      setIsLocationPanelOpen(false);
      const rootHandle = await getLocalArchiveHandle();
      const report = await scanProjectDirectories(rootHandle ? [rootHandle] : []);
      setScanRoots(rootHandle ? [rootHandle] : []);
      setScanReport(report);
      const restoredCount = await restoreProjectsFromScan(report);
      setSelectedImportProjects(report.projects.filter((project) => project.projectName !== "未分组资料").map((project) => project.projectKey));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已授权访问“${availability.rootName}”，识别到 ${report.projects.filter((project) => project.projectName !== "未分组资料").length} 个资料项目${restoredCount ? `，恢复 ${restoredCount} 个项目` : ""}` }));
      await loadFiles();
    } catch (error: any) {
      if (error?.name !== "AbortError") window.dispatchEvent(new CustomEvent("show-toast", { detail: "文件夹授权失败，请重新选择并允许浏览器访问" }));
    }
  };

  const restoreLocalPermission = async () => {
    const granted = await requestLocalArchivePermission().catch(() => false);
    setLocalPermission(granted ? "granted" : "denied");
    if (granted) {
      window.dispatchEvent(new CustomEvent("archive-root-changed"));
      await loadFiles();
    }
  };

  const addScanRoot = async () => {
    try {
      const handle = await pickScanDirectory();
      setScanRoots((current) => [...current, handle]);
      setScanReport(null);
    } catch (error: any) {
      if (error?.name !== "AbortError") window.dispatchEvent(new CustomEvent("show-toast", { detail: "无法读取所选文件夹，请确认浏览器支持本机文件访问" }));
    }
  };

  const runScan = async () => {
    if (!scanRoots.length) return void window.dispatchEvent(new CustomEvent("show-toast", { detail: "请先选择要扫描的项目文件夹" }));
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanRunning(true);
    setScanProgress({ current: 0, total: 0, name: "正在读取目录…" });
    try {
      const report = await scanProjectDirectories(scanRoots, { signal: controller.signal, onProgress: setScanProgress });
      setScanReport(report);
      setSelectedImportProjects([]);
      setProjectNameOverrides({});
      setFileClassificationOverrides({});
      setScanFilter("all");
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `扫描完成，共识别 ${report.fileCount} 个文件` }));
    } catch (error: any) {
      if (error?.name !== "AbortError") window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "扫描失败，请重试" }));
    } finally {
      setScanRunning(false);
    }
  };

  const toggleImportProject = (projectKey: string) => {
    setSelectedImportProjects((current) => current.includes(projectKey) ? current.filter((key) => key !== projectKey) : [...current, projectKey]);
  };

  const importScannedProjects = async () => {
    if (!scanReport || !selectedImportProjects.length) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请先勾选要录入项目管理的项目" }));
      return;
    }
    setImportingProjects(true);
    setAiArchiveReviewing(true);
    try {
      const selected = scanReport.projects.filter((project) => selectedImportProjects.includes(project.projectKey));
      const selectedFiles = scanReport.files.filter((file) => selectedImportProjects.includes(file.projectKey || ""));
      const reviewCount = selectedFiles.filter((file) => file.needsReview || !file.stageId).length;
      const confirmed = window.confirm(`整理预览已生成：${selected.length} 个项目、${selectedFiles.length} 个文件。\n\n文件将复制到“整理预览_日期/阶段/资料类别/子文件夹”，原始文件不会移动、重命名或删除。${reviewCount ? `\n\n其中 ${reviewCount} 个文件需要人工复核，将进入“未确定”。` : ""}\n\n确认继续复制整理吗？`);
      if (!confirmed) { setAiArchiveReviewing(false); setImportingProjects(false); return; }
      type AiFileDecision = { id: string; stageId: string; category: string; confidence: number; reason: string };
      type AiProjectDecision = { projectKey: string; currentStageId: string; confidence: number; reason: string; files: AiFileDecision[] };
      const aiReview: { aiApplied: boolean; projects: AiProjectDecision[] } = await apiClient.analyzeProjectArchive({ projects: selected.map((project) => {
        const projectName = projectNameOverrides[project.projectKey]?.trim() || project.projectName;
        const stageIds = project.stageSummaries.map((stage) => stage.stageKey).filter((stageId) => STAGES.some((stage) => stage.id === stageId));
        return { projectKey: project.projectKey, projectName, localStageId: stageIds.length ? stageIds.sort((a, b) => STAGES.findIndex((stage) => stage.id === a) - STAGES.findIndex((stage) => stage.id === b)).at(-1)! : STAGES[0].id, localConfidence: project.confidence, stageSummaries: project.stageSummaries, files: scanReport.files.filter((file) => file.projectKey === project.projectKey).slice(0, 400).map((file) => { const override = fileClassificationOverrides[file.id]; return { id: file.id, name: file.name, folderLabels: file.folderLabels, extension: file.extension, localStageId: override?.stageId || file.stageId, localCategory: override?.category || file.category, classificationSource: override ? "manual" : file.classificationSource, needsReview: override ? false : file.needsReview }; }) };
      }) }).catch(() => ({ aiApplied: false, projects: [] as AiProjectDecision[] }));
      const aiDecisions = new Map(aiReview.projects.map((decision) => [decision.projectKey, decision]));
      const aiFileDecisions = new Map<string, AiFileDecision>();
      for (const decision of aiReview.projects) for (const file of decision.files || []) aiFileDecisions.set(`${decision.projectKey}\u0000${file.id}`, file);
      setAiArchiveReviewing(false);
      const imported: any[] = [];
      const renamedExisting: any[] = [];
      const duplicateNames: string[] = [];
      const archiveTargets: Array<{ project: any; source: typeof selected[number]; currentStageId: string }> = [];
      for (const project of selected) {
        const projectName = projectNameOverrides[project.projectKey]?.trim() || project.projectName;
        if (!projectName || projectName === "未分组资料") continue;
        const stageIds = project.stageSummaries.map((stage) => stage.stageKey).filter((stageId) => STAGES.some((stage) => stage.id === stageId));
        const localStageId = stageIds.length ? stageIds.sort((a, b) => STAGES.findIndex((stage) => stage.id === a) - STAGES.findIndex((stage) => stage.id === b)).at(-1)! : STAGES[0].id;
        const aiDecision = aiDecisions.get(project.projectKey);
        const candidateName = String(projectName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
        const globalMatches = allProjects.filter((candidate: any) => String(candidate.name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === candidateName);
        if (globalMatches.length > 1) { duplicateNames.push(projectName); continue; }
        const existing = projects.find((candidate: any) => candidate.id === globalMatches[0]?.id);
        if (globalMatches.length === 1 && !existing) { duplicateNames.push(`${projectName}（已归档）`); continue; }
        const currentStageId = existing ? getProjectCurrentStageInfo(existing.id, lifecycleStates).stage.id : (aiDecision?.currentStageId || localStageId);
        const identity = getScannedProjectIdentity(project.projectKey);
        const explicitProjectNumber = normalizeProjectNumber(project.projectNumber || identity.projectNumber);
        const projectRecord = existing ? { ...existing, name: projectName, importedProjectKey: project.projectKey } : { id: globalThis.crypto?.randomUUID?.() || `p${Date.now()}-${imported.length}`, projectNumber: explicitProjectNumber || await reserveProjectNumber(), name: projectName, type: "光伏项目", manager: "待确定", dueDate: "", constructProgress: 0, supplyProgress: 0, status: "normal", importedFromScanId: scanReport.id, importedProjectKey: project.projectKey, importedFileCount: project.fileCount, importedStageId: currentStageId, archiveReview: aiDecision ? { provider: "DeepSeek", confidence: aiDecision.confidence, reason: aiDecision.reason, reviewedAt: new Date().toISOString() } : { provider: "local-rules", confidence: project.confidence, reason: "使用目录和阶段规则", reviewedAt: new Date().toISOString() } };
        if (!existing) imported.push(projectRecord);
        else if (existing.name !== projectName) renamedExisting.push(projectRecord);
        archiveTargets.push({ project: { ...projectRecord, importedProjectKey: project.projectKey }, source: project, currentStageId });
      }
      if (!archiveTargets.length) {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: duplicateNames.length ? `项目名称存在重复或已归档：${duplicateNames.join("、")}，请先修改名称` : "勾选项目没有可确认的项目名称，未执行录入或归档" }));
        return;
      }
      setBoardData((current: any[]) => {
        const source = Array.isArray(current) && current.length ? current : STAGES.map((stage) => ({ id: stage.id, title: stage.name, count: 0, projects: [] }));
        const next = source.map((column: any) => ({ ...column, projects: [...(column.projects || [])] }));
        for (const project of renamedExisting) {
          for (const column of next) column.projects = column.projects.map((candidate: any) => candidate.id === project.id ? project : candidate);
        }
        for (const project of imported) {
          const target = next.find((column: any) => column.id === project.importedStageId) || next[0];
          target.projects = sortProjectsNaturally([project, ...target.projects]);
          target.count = target.projects.length;
        }
        return next;
      });
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (provider && availability?.available) {
        let archivedCount = 0;
        let uncertainArchivedCount = 0;
        let archiveReviewCount = 0;
        for (const target of archiveTargets) {
          const project = target.project;
          const currentIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === target.currentStageId));
          const generatedStages = getCurrentAndNextStages(STAGES, currentIndex);
          const existingFolder = archiveFolderStates[project.id]?.projectFolder;
          const structure = await provider.ensureProjectStructure(project, generatedStages, existingFolder);
          await setArchiveFolderStates((current) => ({ ...current, [project.id]: { status: "ready", storageProvider: "local-folder", projectFolder: structure.projectFolder, generatedThroughStageId: structure.generatedThroughStageId, updatedAt: new Date().toISOString() } }));
          for (const file of scanReport.files.filter((item) => item.projectKey === project.importedProjectKey)) {
            const handle = getScannedFileHandle(scanReport.id, file.id);
            if (!handle || file.status === "unreadable") { archiveReviewCount += 1; continue; }
            try {
              const sourceFile = await handle.getFile();
              const aiFile = aiFileDecisions.get(`${file.projectKey}\u0000${file.id}`);
              const manualOverride = fileClassificationOverrides[file.id];
              const canUseAi = !manualOverride && file.classificationSource !== "folder" && file.needsReview && aiFile && aiFile.confidence >= 0.65;
              const finalStageId = manualOverride?.stageId || file.pathStageKey || (canUseAi ? aiFile.stageId : file.stageId);
              const finalCategory = manualOverride?.category || (canUseAi ? aiFile.category : file.category);
              const uncertain = !finalStageId || (!manualOverride && file.needsReview && !canUseAi && file.classificationSource !== "folder");
              if (uncertain) { await provider.writeUncertainFile({ project, file: sourceFile, fileType: finalCategory, projectFolder: structure.projectFolder, folderLabels: file.folderLabels }); uncertainArchivedCount += 1; }
              else {
                const targetStage = STAGES.find((stage) => stage.id === finalStageId) || STAGES[currentIndex];
                await provider.writeFile({ project, stage: targetStage, file: sourceFile, fileType: finalCategory, autoRename: true, projectFolder: structure.projectFolder, sourceRelativePath: file.relativePath, folderLabels: file.folderLabels, preserveFolders: true, classificationSource: manualOverride ? "manual" : canUseAi ? "ai" : file.classificationSource, classificationConfidence: manualOverride ? 1 : canUseAi ? aiFile.confidence : file.confidence, classificationEvidence: manualOverride ? "项目经理人工确认" : canUseAi ? aiFile.reason : (file.folderEvidence || file.evidence.join("、")) });
              }
              archivedCount += 1;
            } catch { archiveReviewCount += 1; }
          }
        }
        window.dispatchEvent(new CustomEvent("show-toast", { detail: `已建立当前及下一阶段目录，并归档 ${archivedCount} 个文件${uncertainArchivedCount ? `，其中 ${uncertainArchivedCount} 个放入“未确定”` : ""}${archiveReviewCount ? `，${archiveReviewCount} 个文件待人工复核` : ""}` }));
      } else {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目已录入，但本机归档目录未授权；原文件未改变" }));
      }
      setSelectedImportProjects([]);
      if (duplicateNames.length) window.dispatchEvent(new CustomEvent("show-toast", { detail: `以下项目因名称重复未录入：${duplicateNames.join("、")}` }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `${imported.length ? `新建 ${imported.length} 个项目，` : ""}已同步 ${archiveTargets.length} 个项目的现有文件归档` }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "项目录入失败，请重试" }));
    } finally {
      setAiArchiveReviewing(false);
      setImportingProjects(false);
    }
  };

  const cancelScan = () => scanAbortRef.current?.abort();

  const previewArchiveCleanup = async () => {
    setCleanupScanning(true);
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) throw new Error("archive_permission_required");
      setCleanupCandidates(await provider.previewGeneratedArchiveFiles());
    } catch (error: any) { window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message === "archive_permission_required" ? "请先授权本机归档文件夹" : "无法读取旧归档文件" })); }
    finally { setCleanupScanning(false); }
  };

  const rebuildOldArchives = async () => {
    if (!cleanupCandidates.length) return;
    setCleanupRebuilding(true);
    try {
      const provider = await getLocalArchiveProvider();
      if (!provider) throw new Error("archive_permission_required");
      const result = await provider.rebuildGeneratedArchiveFiles(cleanupCandidates);
      setCleanupCandidates(result.verified);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `旧归档重建完成：复制 ${result.copied} 个，已存在 ${result.skipped} 个，冲突 ${result.conflicts} 个，失败 ${result.failed} 个` }));
      await loadFiles();
    } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "旧归档重建失败，旧文件未删除" })); }
    finally { setCleanupRebuilding(false); }
  };

  const deleteOldArchives = async () => {
    const verified = cleanupCandidates.filter((item) => item.status === "verified");
    if (!verified.length || !window.confirm(`已完成哈希校验。确认删除 ${verified.length} 个旧的平铺归档副本吗？新目录副本和原始项目文件不会删除。`)) return;
    setCleanupDeleting(true);
    try {
      const provider = await getLocalArchiveProvider();
      const result = await provider?.deleteGeneratedArchiveFiles(verified);
      setCleanupCandidates([]);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已清理 ${result?.deleted || 0} 个旧归档副本${result?.failed ? `，${result.failed} 个失败` : ""}` }));
      await loadFiles();
    } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "旧归档清理失败，原文件未改变" })); }
    finally { setCleanupDeleting(false); }
  };

  const syncLocalManifest = async () => {
    if (!selectedProject) return;
    setManifestSyncing(true);
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) throw new Error("archive_permission_required");
      const localFiles = await provider.listFiles({ project: selectedProject, stages: STAGES, projectFolder: archiveFolderStates[selectedProject.id]?.projectFolder });
      const items = localFiles.map((file: any) => ({
        id: `local-${selectedProject.id}-${file.stageId}-${encodeURIComponent(file.storageKey)}`,
        projectId: selectedProject.id,
        stageId: file.stageId,
        originalName: file.originalName || file.storedName,
        logicalPath: file.storageKey,
        category: file.category || "其他资料",
        classificationSource: file.classificationSource || "folder",
        classificationConfidence: file.classificationConfidence ?? 0.9,
        reviewStatus: file.reviewStatus || "confirmed",
        classificationEvidence: file.classificationEvidence || "本机归档逻辑目录",
        size: file.size,
        contentType: file.contentType || "application/octet-stream",
        checksum: file.checksum || undefined,
        version: file.version || "V1",
        bucket: file.bucket,
        availability: "local-only" as const,
        lastIndexedAt: file.createdAt,
      }));
      await apiClient.publishProjectFileManifests(items);
      await loadManifests();
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已同步 ${items.length} 个文件清单；文件内容仍只在本机` }));
    } catch (error: any) { window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message === "archive_permission_required" ? "请先授权本机归档文件夹" : "同步文件清单失败" })); }
    finally { setManifestSyncing(false); }
  };

  const uploadManifest = async (manifest: ProjectFileManifest) => {
    if (!selectedProject || manifest.availability === "uploaded") return;
    setUploadingManifestId(manifest.id);
    setUploadProgress(0);
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) throw new Error("archive_permission_required");
      const file = await provider.readFile(manifest.logicalPath);
      const stage = STAGES.find((item) => item.id === manifest.stageId) || STAGES[0];
      const session = await apiClient.createProjectFileUpload({ fileId: manifest.id, project: selectedProject, stage, fileType: manifest.category || manifest.originalName });
      const chunkSize = session.chunkSize;
      for (let offset = 0, index = 0; offset < file.size || (file.size === 0 && index === 0); offset += chunkSize, index += 1) {
        await apiClient.uploadProjectFileChunk(session.id, index, file.slice(offset, Math.min(file.size, offset + chunkSize)));
        setUploadProgress(file.size ? Math.round(Math.min(file.size, offset + chunkSize) / file.size * 100) : 100);
        if (file.size === 0) break;
      }
      await apiClient.completeProjectFileUpload(session.id, manifest.checksum || undefined);
      await loadManifests();
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `${manifest.originalName} 已上传，其他电脑现在可以按权限查看` }));
    } catch (error: any) { window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "文件上传失败，可稍后重试" })); }
    finally { setUploadingManifestId(null); setUploadProgress(0); }
  };

  const openFile = async (file: any) => {
    if (file.storageProvider === "local-folder" && file.storageKey) {
      try {
        await openLocalArchiveFile(file.storageKey);
      } catch {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "无法打开本机文件，请确认归档目录仍有访问权限" }));
      }
      return;
    }
    if (file.relativePath || file.storageKey) window.open(getProjectFileDownloadUrl(file.relativePath || file.storageKey), "_blank");
  };

  const openWorkspaceFile = async (file: ProjectWorkspaceFile) => {
    if (file.canOpenLocal) return openFile(file.raw);
    if (file.canViewRemote && file.manifest) {
      try { await downloadProjectManifestContent(file.manifest.id, file.originalName); }
      catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前账号无权查看该远程文件" })); }
      return;
    }
    if (file.storageProvider === "legacy-server" || file.relativePath) return openFile(file.raw);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: file.availability === "missing" ? "来源电脑上的文件已经缺失" : "该文件需要在来源电脑打开或上传" }));
  };

  const chooseProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setProjectPickerOpen(false);
    setProjectSearch("");
  };

  const toggleDirectory = (id: string) => setExpandedDirectories((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVersions = (groupKey: string) => setExpandedVersionGroups((current) => {
    const next = new Set(current);
    if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
    return next;
  });

  const deleteLocalFile = async (file: any) => {
    if (!selectedProject || file.storageProvider !== "local-folder" || !file.storageKey) return;
    const displayName = getArchiveDisplayName(file);
    const duplicateNote = file.isDuplicate || file.duplicateRecordCount > 1 ? "；相关重复索引也会一并清理" : "";
    if (!window.confirm(`确认从本机永久删除“${displayName}”这个版本吗？此操作不可恢复${duplicateNote}。`)) return;
    setDeletingStorageKey(file.storageKey);
    try {
      const provider = await getLocalArchiveProvider();
      if (!provider) throw new Error("archive_permission_required");
      await provider.deleteFile(file.storageKey);
      await setLifecycleStates((current) => {
        const projectState = current[selectedProject.id] || {};
        const nextProjectState = { ...projectState };
        for (const stage of STAGES) {
          const state = projectState[stage.id];
          if (!Array.isArray(state?.files)) continue;
          nextProjectState[stage.id] = { ...state, files: state.files.filter((item: any) => item.storageKey !== file.storageKey) };
        }
        return { ...current, [selectedProject.id]: nextProjectState };
      });
      setProjectFiles((current: any) => ({ ...current, stages: (current?.stages || []).map((stage: any) => ({ ...stage, files: (stage.files || []).filter((item: any) => item.storageKey !== file.storageKey) })) }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已删除 ${displayName}，其他版本不受影响` }));
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "文件删除失败，请检查本机归档目录权限" }));
    } finally {
      setDeletingStorageKey(null);
    }
  };

  if (workspaceMode === "organize") return (
    <main className="mx-auto w-full max-w-[1680px] space-y-5 p-5 animate-in fade-in duration-300">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setWorkspaceMode("browse"); void loadFiles(); }} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]" aria-label="返回资料工作台"><ArrowLeft className="h-5 w-5" /></button>
          <div><h2 className="text-xl font-semibold tracking-tight text-slate-950">智能整理</h2><p className="mt-0.5 text-xs text-slate-500">扫描文件夹、确认分类并复制到项目归档目录</p></div>
        </div>
        <div className="min-w-0 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600"><span className="font-mono text-slate-500">{selectedProject ? getProjectNumber(selectedProject) : "—"}</span><span className="mx-2 text-slate-300">/</span><span className="font-semibold text-slate-800">{selectedProject?.name || "暂无项目"}</span></div>
      </header>
      <ScanPanel roots={scanRoots} report={scanReport} running={scanRunning} progress={scanProgress} filter={scanFilter} currentStageId={currentStageInfo?.stage.id} currentStageName={currentStageInfo?.stage.name} classificationOverrides={fileClassificationOverrides} onClassificationChange={(fileId, value) => setFileClassificationOverrides((current) => ({ ...current, [fileId]: value }))} onAddRoot={() => void addScanRoot()} onRun={() => void runScan()} onCancel={cancelScan} onClear={() => { setScanRoots([]); setScanReport(null); setFileClassificationOverrides({}); }} onFilter={setScanFilter} />
      <ProjectStructureSummary report={scanReport} organizationPlan={organizationPlan} selectedKeys={selectedImportProjects} importing={importingProjects} aiReviewing={aiArchiveReviewing} existingProjects={allProjects} nameOverrides={projectNameOverrides} onNameChange={(projectKey, name) => setProjectNameOverrides((current) => ({ ...current, [projectKey]: name }))} onToggle={toggleImportProject} onImport={importScannedProjects} />
    </main>
  );

  return (
    <>
    <main className="min-h-full bg-slate-50 px-3 pb-6 pt-3 md:hidden">
      <header className="sticky top-0 z-20 -mx-3 -mt-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold tracking-tight text-slate-950">项目资料</h2><p className="mt-0.5 truncate text-[11px] text-slate-400">{currentStageInfo?.stage.name || "统一目录与文件状态"}</p></div><button type="button" onClick={() => { void loadFiles(); void loadManifests(); }} className="rounded-xl bg-slate-100 p-2.5 text-slate-600" aria-label="刷新项目资料"><RefreshCw className={cn("h-4 w-4", (isLoading || manifestLoading) && "animate-spin")} /></button><div className="relative"><button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="rounded-xl bg-slate-950 p-2.5 text-white" aria-label="项目资料更多操作"><MoreHorizontal className="h-4 w-4" /></button>{mobileMenuOpen && <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button onClick={() => { setWorkspaceMode("organize"); setMobileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">智能整理</button><button onClick={() => { void syncLocalManifest(); setMobileMenuOpen(false); }} disabled={localPermission !== "granted"} className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">同步文件清单</button><button onClick={() => { setIsLocationPanelOpen(true); setMobileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">归档位置</button><button onClick={() => { setMaintenanceOpen(true); setMobileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">历史归档迁移</button></div>}</div></div>
        <select value={selectedProject?.id || ""} onChange={(event) => chooseProject(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400">{sortProjectsNaturally(projects).map((project: any, index: number) => <option key={project.id} value={project.id}>{getProjectNumber(project, index)} · {project.name}</option>)}</select>
        <div className="mt-2 flex items-center gap-2 text-[10px] tabular-nums"><span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">本机 {workspace.localFiles}</span><span className="rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">已上传 {workspace.remoteFiles}</span><span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">全部 {workspace.totalFiles}</span>{workspace.issueFiles > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-700">异常 {workspace.issueFiles}</span>}</div>
      </header>

      {backendError && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">{backendError}</div>}
      {isLocationPanelOpen && <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">本机归档位置</h3><button onClick={() => setIsLocationPanelOpen(false)} className="rounded-lg p-2 text-slate-400"><X className="h-4 w-4" /></button></div><p className="mt-1 break-all text-xs text-slate-500">{fileRoot || "手机浏览器未授权本机目录；仍可查看已同步和已上传的资料。"}</p><div className="mt-3 flex gap-2"><button onClick={() => void chooseLocalFolder()} className="flex-1 rounded-xl bg-slate-950 py-2.5 text-xs font-semibold text-white">选择文件夹</button>{localFolderName && localPermission !== "granted" && <button onClick={() => void restoreLocalPermission()} className="rounded-xl border border-amber-200 px-3 text-xs font-semibold text-amber-700">恢复授权</button>}</div></section>}
      {maintenanceOpen && <section className="mt-3 rounded-2xl border border-rose-100 bg-white p-3"><div className="flex items-center justify-between px-1 pb-2"><h3 className="text-sm font-semibold text-slate-900">归档维护</h3><button onClick={() => setMaintenanceOpen(false)} className="rounded-lg p-2 text-slate-400"><X className="h-4 w-4" /></button></div><ArchiveCleanupPanel candidates={cleanupCandidates} scanning={cleanupScanning} rebuilding={cleanupRebuilding} deleting={cleanupDeleting} onPreview={() => void previewArchiveCleanup()} onRebuild={() => void rebuildOldArchives()} onDelete={() => void deleteOldArchives()} /></section>}

      {mobileDirectoryId ? <section className="mt-3">
        <button type="button" onClick={() => setMobileDirectoryId("")} className="flex items-center gap-1 rounded-lg py-2 text-xs font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />返回项目目录</button>
        <div className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-3"><div className="flex items-center gap-1 text-[10px] text-slate-400"><span>{STAGES.find((stage) => stage.id === mobileDirectory?.stageId)?.name}</span>{mobileDirectory?.path.map((part) => <React.Fragment key={part}><ChevronRight className="h-3 w-3" /><span className="truncate">{part}</span></React.Fragment>)}</div><div className="mt-2 flex items-center rounded-xl bg-slate-100 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="搜索当前目录" className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" /></div></div>
          <div className="divide-y divide-slate-100">{mobileFiles.map((file) => <MobileWorkspaceFileCard key={file.id} file={file} onOpen={() => void openWorkspaceFile(file)} onUpload={() => file.manifest && void uploadManifest(file.manifest)} />)}{mobileFiles.length === 0 && <div className="p-10 text-center text-xs text-slate-400">当前目录暂无文件</div>}</div>
        </div>
      </section> : <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-700">阶段目录</div><nav className="p-2">{workspace.directories.map((directory) => <MobileWorkspaceDirectoryRow key={directory.id} directory={directory} expanded={expandedDirectories} onToggle={toggleDirectory} onOpen={setMobileDirectoryId} />)}</nav>{workspace.totalFiles === 0 && !isLoading && <div className="border-t border-slate-100 p-8 text-center text-xs text-slate-400">该项目暂无资料；可从“更多”进入智能整理。</div>}</section>}
      {localPermission === "unsupported" && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-[11px] leading-5 text-slate-500">当前手机浏览器不支持直接访问电脑归档目录。已同步清单和已上传文件仍可查看，本机文件操作请在来源电脑完成。</p>}
    </main>

    <main className="mx-auto hidden w-full max-w-[1800px] space-y-3 p-5 animate-in fade-in duration-300 md:block">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-1 min-w-[150px]"><h2 className="text-lg font-semibold tracking-tight text-slate-950">项目资料</h2><p className="text-[11px] text-slate-400">统一目录与文件状态</p></div>
          <div className="relative min-w-[260px] flex-1 max-w-[480px]">
            <button type="button" onClick={() => setProjectPickerOpen((open) => !open)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <span className="min-w-0"><span className="mr-2 font-mono text-[11px] text-indigo-600">{selectedProject ? getProjectNumber(selectedProject) : "—"}</span><span className="truncate text-sm font-semibold text-slate-800">{selectedProject?.name || "选择项目"}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            {projectPickerOpen && <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
              <div className="flex items-center rounded-lg bg-slate-100 px-2.5"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="搜索名称或编号" className="w-full bg-transparent px-2 py-2 text-sm outline-none" /></div>
              <div className="mt-1 max-h-64 overflow-auto">{visibleProjects.map((project: any, index: number) => <button key={project.id} type="button" onClick={() => chooseProject(project.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-50", selectedProject?.id === project.id && "bg-indigo-50")}><span className="min-w-0 truncate text-sm font-medium text-slate-800">{project.name}</span><span className="ml-3 shrink-0 font-mono text-[10px] text-slate-400">{getProjectNumber(project, index)}</span></button>)}{visibleProjects.length === 0 && <div className="p-4 text-center text-xs text-slate-400">没有匹配项目</div>}</div>
            </div>}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
            <span className="rounded-lg bg-slate-100 px-2 py-1.5 text-slate-600">{currentStageInfo?.stage.name || "未确定阶段"}</span>
            <span className="rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-700"><HardDrive className="mr-1 inline h-3.5 w-3.5" />{workspace.localFiles}</span>
            <span className="rounded-lg bg-indigo-50 px-2 py-1.5 font-semibold text-indigo-700"><Cloud className="mr-1 inline h-3.5 w-3.5" />{workspace.remoteFiles}</span>
            {workspace.issueFiles > 0 && <span className="rounded-lg bg-amber-50 px-2 py-1.5 font-semibold text-amber-700">异常 {workspace.issueFiles}</span>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => { void loadFiles(); void loadManifests(); }} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 active:scale-95" title="刷新"><RefreshCw className={cn("h-4 w-4", (isLoading || manifestLoading) && "animate-spin")} /></button>
            <button type="button" onClick={() => setWorkspaceMode("organize")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]">智能整理</button>
            <button type="button" onClick={() => void syncLocalManifest()} disabled={manifestSyncing || localPermission !== "granted"} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">{manifestSyncing ? "同步中…" : "同步清单"}</button>
            <button type="button" onClick={() => void openLocationPanel()} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition", localPermission === "granted" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{localPermission === "granted" ? localFolderName || "归档位置" : "设置归档位置"}</button>
            <div className="relative"><button type="button" onClick={() => setMoreOpen((open) => !open)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100" aria-label="更多操作"><MoreHorizontal className="h-4 w-4" /></button>{moreOpen && <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"><button type="button" onClick={() => { setMaintenanceOpen(true); setMoreOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">历史归档迁移</button><button type="button" onClick={() => void initFolders()} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">检查并生成目录</button></div>}</div>
          </div>
        </div>
      </header>

      {backendError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">{backendError}。本机资料仍可正常使用，远程服务恢复后会自动补充显示。</div>}
      {isLocationPanelOpen && <section className="rounded-xl border border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900">本机归档位置</div><div className="mt-1 truncate text-xs text-slate-500">{fileRoot || "尚未选择文件夹"} · 文件内容保存在当前电脑，清单可同步到其他设备</div></div><button onClick={() => void chooseLocalFolder()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">{localFolderName ? "重新选择" : "选择文件夹"}</button>{localFolderName && localPermission !== "granted" && <button onClick={() => void restoreLocalPermission()} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">恢复授权</button>}<button onClick={() => void initFolders()} disabled={localPermission !== "granted"} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">检查目录</button><button onClick={() => setIsLocationPanelOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="关闭"><X className="h-4 w-4" /></button></div></section>}
      {maintenanceOpen && <section className="rounded-xl border border-rose-100 bg-rose-50/40 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-900">归档维护</h3><p className="mt-0.5 text-xs text-slate-500">重建并校验旧平铺归档后，才允许清理旧副本。</p></div><button onClick={() => setMaintenanceOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white"><X className="h-4 w-4" /></button></div><ArchiveCleanupPanel candidates={cleanupCandidates} scanning={cleanupScanning} rebuilding={cleanupRebuilding} deleting={cleanupDeleting} onPreview={() => void previewArchiveCleanup()} onRebuild={() => void rebuildOldArchives()} onDelete={() => void deleteOldArchives()} /></section>}

      <section className="grid min-h-[560px] grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)] h-[calc(100dvh-190px)]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70">
          <div className="border-b border-slate-200 px-3 py-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">项目目录</span><span className="font-mono text-[10px] text-slate-400">{workspace.totalFiles} FILES</span></div></div>
          <nav className="min-h-0 flex-1 overflow-auto p-2" aria-label="项目文件目录">{workspace.directories.map((directory) => <WorkspaceDirectoryRow key={directory.id} directory={directory} selectedId={selectedDirectoryId} expanded={expandedDirectories} onSelect={setSelectedDirectoryId} onToggle={toggleDirectory} />)}</nav>
          <div className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-400">绿色为本机可用，蓝色为已上传，黄色表示需要处理</div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-xs text-slate-400"><span>{STAGES.find((stage) => stage.id === selectedDirectory?.stageId)?.name || "项目资料"}</span>{selectedDirectory?.path.map((part) => <React.Fragment key={part}><ChevronRight className="h-3 w-3" /><span className="truncate text-slate-600">{part}</span></React.Fragment>)}</div><div className="mt-1 text-sm font-semibold text-slate-900">{selectedDirectory?.path.at(-1) || selectedDirectory?.name || "选择目录"}<span className="ml-2 text-xs font-normal text-slate-400">{directoryFiles.length} 个文件</span></div></div>
              <div className="relative w-56"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="搜索当前目录" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1">{([['all','全部'],['local','本机'],['remote','已上传'],['issues','异常']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setSourceFilter(key)} className={cn("rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition", sourceFilter === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100")}>{label}</button>)}</div><select value={fileSort} onChange={(event) => setFileSort(event.target.value as "updated" | "name")} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 outline-none"><option value="updated">最近更新</option><option value="name">按名称</option></select></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {isLoading && workspace.files.length === 0 ? <WorkspaceSkeleton /> : directoryFiles.length > 0 ? <div className="divide-y divide-slate-100">{directoryFiles.map((file) => <WorkspaceFileRow key={file.id} file={file} versions={versionsForFile(workspace, file)} expanded={expandedVersionGroups.has(file.groupKey)} deleting={deletingStorageKey === file.storageKey} uploading={uploadingManifestId === file.manifest?.id} uploadProgress={uploadProgress} onToggleVersions={() => toggleVersions(file.groupKey)} onOpen={(target) => void openWorkspaceFile(target)} onDelete={(target) => void deleteLocalFile(target.raw)} onUpload={(target) => target.manifest && void uploadManifest(target.manifest)} />)}</div> : <div className="flex h-full min-h-72 items-center justify-center p-8 text-center"><div><FolderOpen className="mx-auto h-9 w-9 text-slate-200" /><h3 className="mt-3 text-sm font-semibold text-slate-700">当前目录没有匹配文件</h3><p className="mt-1 text-xs text-slate-400">可切换目录、来源筛选或清除搜索条件。</p></div></div>}
          </div>
        </section>
      </section>
    </main>
    </>
  );
}

function findWorkspaceDirectory(directories: ProjectWorkspaceDirectory[], id: string): ProjectWorkspaceDirectory | undefined {
  for (const directory of directories) {
    if (directory.id === id) return directory;
    const child = findWorkspaceDirectory(directory.children, id);
    if (child) return child;
  }
  return undefined;
}

function WorkspaceDirectoryRow({ directory, selectedId, expanded, onSelect, onToggle }: { key?: React.Key; directory: ProjectWorkspaceDirectory; selectedId: string; expanded: Set<string>; onSelect: (id: string) => void; onToggle: (id: string) => void }) {
  const isExpanded = expanded.has(directory.id);
  const hasChildren = directory.children.length > 0;
  const indent = ["pl-1", "pl-4", "pl-7", "pl-10", "pl-12"][Math.min(directory.depth, 4)];
  return <div>
    <div className={cn("group flex items-center gap-1 rounded-lg pr-2 transition", indent, selectedId === directory.id ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/80")}>
      <button type="button" onClick={() => hasChildren ? onToggle(directory.id) : onSelect(directory.id)} className="flex h-8 w-6 shrink-0 items-center justify-center text-slate-400" aria-label={hasChildren ? `${isExpanded ? "收起" : "展开"}${directory.name}` : `打开${directory.name}`}>{hasChildren ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <span className="h-1 w-1 rounded-full bg-slate-300" />}</button>
      <button type="button" onClick={() => onSelect(directory.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"><FolderOpen className={cn("h-4 w-4 shrink-0", directory.depth === 0 ? "text-indigo-500" : "text-slate-400")} /><span className={cn("min-w-0 flex-1 truncate text-xs", directory.depth === 0 ? "font-semibold" : "font-medium")}>{directory.name}</span></button>
      <span className="font-mono text-[10px] text-slate-400">{directory.count}</span>
      {directory.issueCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${directory.issueCount} 个异常文件`} />}
    </div>
    {hasChildren && isExpanded && <div>{directory.children.map((child) => <WorkspaceDirectoryRow key={child.id} directory={child} selectedId={selectedId} expanded={expanded} onSelect={onSelect} onToggle={onToggle} />)}</div>}
  </div>;
}

function WorkspaceFileRow({ file, versions, expanded, deleting, uploading, uploadProgress, onToggleVersions, onOpen, onDelete, onUpload }: { key?: React.Key; file: ProjectWorkspaceFile; versions: ProjectWorkspaceFile[]; expanded: boolean; deleting: boolean; uploading: boolean; uploadProgress: number; onToggleVersions: () => void; onOpen: (file: ProjectWorkspaceFile) => void; onDelete: (file: ProjectWorkspaceFile) => void; onUpload: (file: ProjectWorkspaceFile) => void }) {
  const historical = versions.filter((version) => version.id !== file.id);
  return <article className="bg-white transition hover:bg-slate-50/70">
    <div className="flex min-h-[58px] items-center gap-3 px-4 py-2.5">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", file.canOpenLocal ? "bg-emerald-50 text-emerald-600" : file.availability === "uploaded" ? "bg-indigo-50 text-indigo-600" : file.availability === "missing" || file.availability === "stale" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500")}>{file.canOpenLocal ? <HardDrive className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
      <button type="button" onClick={() => onOpen(file)} className="min-w-0 flex-1 text-left focus:outline-none"><div className="truncate text-xs font-semibold text-slate-900" title={file.originalName}>{file.name}</div><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400"><WorkspaceAvailabilityBadge availability={file.availability} /><span>{formatSize(file.size)}</span><span>·</span><span>{formatTime(file.updatedAt) || "时间未知"}</span><span>·</span><span className="truncate">{file.category}</span>{file.isDuplicate && <span className="font-semibold text-rose-600">重复记录</span>}</div></button>
      <div className="flex shrink-0 items-center gap-1">
        {file.versionCount > 1 && <button type="button" onClick={onToggleVersions} className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition", expanded ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100")}><History className="h-3.5 w-3.5" />{file.versionCount} 版<ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} /></button>}
        {file.canUpload && <button type="button" onClick={() => onUpload(file)} disabled={uploading} className="rounded-md bg-indigo-50 px-2 py-1.5 text-[10px] font-semibold text-indigo-700 disabled:opacity-50">{uploading ? `${uploadProgress}%` : "上传"}</button>}
        {(file.canOpenLocal || file.canViewRemote || file.source === "legacy") && <button type="button" onClick={() => onOpen(file)} className="rounded-md p-2 text-slate-500 transition hover:bg-white hover:text-indigo-600" title="打开文件"><Eye className="h-4 w-4" /></button>}
        {file.canOpenLocal && <button type="button" onClick={() => onDelete(file)} disabled={deleting} className="rounded-md p-2 text-slate-400 transition hover:bg-white hover:text-rose-600 disabled:opacity-40" title="删除这个版本"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
    {expanded && historical.length > 0 && <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2"><div className="ml-11 space-y-1">{historical.map((version) => <div key={version.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[10px] text-slate-500 hover:bg-white"><span className="w-8 font-mono font-semibold text-indigo-600">V{version.versionNumber}</span><span className="min-w-0 flex-1 truncate">{version.originalName}</span><span>{formatSize(version.size)}</span><span>{formatTime(version.updatedAt)}</span>{(version.canOpenLocal || version.canViewRemote || version.source === "legacy") && <button type="button" onClick={() => onOpen(version)} className="rounded p-1 text-slate-400 hover:text-indigo-600"><Eye className="h-3.5 w-3.5" /></button>}{version.canOpenLocal && <button type="button" onClick={() => onDelete(version)} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}</div></div>}
  </article>;
}

function WorkspaceAvailabilityBadge({ availability }: { availability: ProjectWorkspaceFile["availability"] }) {
  const labels: Record<ProjectWorkspaceFile["availability"], [string, string]> = {
    local: ["本机可用", "bg-emerald-50 text-emerald-700"], uploaded: ["已上传", "bg-indigo-50 text-indigo-700"], "local-only": ["来源电脑可用", "bg-slate-100 text-slate-600"], stale: ["索引过期", "bg-amber-50 text-amber-700"], missing: ["本机已缺失", "bg-rose-50 text-rose-700"], legacy: ["历史服务器", "bg-slate-100 text-slate-600"],
  };
  const [label, tone] = labels[availability];
  return <span className={cn("rounded px-1.5 py-0.5 font-semibold", tone)}>{label}</span>;
}

function WorkspaceSkeleton() {
  return <div className="divide-y divide-slate-100">{Array.from({ length: 8 }, (_, index) => <div key={index} className="flex h-[58px] animate-pulse items-center gap-3 px-4"><div className="h-8 w-8 rounded-lg bg-slate-100" /><div className="flex-1"><div className="h-3 w-2/5 rounded bg-slate-100" /><div className="mt-2 h-2 w-3/5 rounded bg-slate-100" /></div></div>)}</div>;
}

function MobileWorkspaceDirectoryRow({ directory, expanded, onToggle, onOpen }: { key?: React.Key; directory: ProjectWorkspaceDirectory; expanded: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  const isExpanded = expanded.has(directory.id);
  const hasChildren = directory.children.length > 0;
  return <div>
    <div className={cn("flex items-center gap-2 rounded-xl px-2", directory.depth === 0 ? "py-1" : "ml-5 border-l border-slate-100 py-0.5")}>
      <button type="button" onClick={() => hasChildren ? onToggle(directory.id) : onOpen(directory.id)} className="flex h-9 w-7 shrink-0 items-center justify-center text-slate-400" aria-label={hasChildren ? `${isExpanded ? "收起" : "展开"}${directory.name}` : `打开${directory.name}`}>{hasChildren ? isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}</button>
      <button type="button" onClick={() => onOpen(directory.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"><FolderOpen className={cn("h-4 w-4 shrink-0", directory.depth === 0 ? "text-indigo-500" : "text-slate-400")} /><span className={cn("min-w-0 flex-1 truncate text-xs text-slate-800", directory.depth === 0 ? "font-semibold" : "font-medium")}>{directory.name}</span><span className="font-mono text-[10px] text-slate-400">{directory.count}</span>{directory.issueCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}</button>
    </div>
    {hasChildren && isExpanded && directory.children.map((child) => <MobileWorkspaceDirectoryRow key={child.id} directory={child} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />)}
  </div>;
}

function MobileWorkspaceFileCard({ file, onOpen, onUpload }: { key?: React.Key; file: ProjectWorkspaceFile; onOpen: () => void; onUpload: () => void }) {
  return <article className="p-3"><div className="flex items-start gap-3"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", file.canOpenLocal ? "bg-emerald-50 text-emerald-600" : file.availability === "uploaded" ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500")}><FileText className="h-4 w-4" /></span><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><h3 className="truncate text-xs font-semibold text-slate-900">{file.name}</h3><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400"><WorkspaceAvailabilityBadge availability={file.availability} /><span>V{file.versionNumber}{file.versionCount > 1 ? ` / ${file.versionCount}版` : ""}</span><span>{formatSize(file.size)}</span><span>{formatTime(file.updatedAt)}</span></div></button><div className="flex shrink-0 gap-1">{file.canUpload && <button onClick={onUpload} className="rounded-lg bg-indigo-50 px-2 py-1.5 text-[10px] font-semibold text-indigo-700">上传</button>}{(file.canOpenLocal || file.canViewRemote || file.source === "legacy") && <button onClick={onOpen} className="rounded-lg bg-slate-100 p-2 text-slate-500"><Eye className="h-4 w-4" /></button>}</div></div></article>;
}

function ScanPanel({ roots, report, running, progress, filter, currentStageId, currentStageName, classificationOverrides, onClassificationChange, onAddRoot, onRun, onCancel, onClear, onFilter }: { roots: any[]; report: ProjectScanReport | null; running: boolean; progress: { current: number; total: number; name: string }; filter: "all" | "review" | "issues"; currentStageId?: string; currentStageName?: string; classificationOverrides: Record<string, { stageId: string; category: string }>; onClassificationChange: (fileId: string, value: { stageId: string; category: string }) => void; onAddRoot: () => void; onRun: () => void; onCancel: () => void; onClear: () => void; onFilter: (filter: "all" | "review" | "issues") => void }) {
  const visibleFiles = report?.files.filter((file) => filter === "all" || (filter === "review" ? file.status === "needs-review" || file.status === "unreadable" : report.issues.some((issue) => issue.fileIds?.includes(file.id)))) || [];
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-bold text-slate-900">本机文件扫描与阶段识别</h3></div><p className="mt-1 text-xs leading-5 text-slate-600">只读取你主动选择的文件夹，在浏览器本地分析。不会移动、重命名、删除或上传源文件。</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={onAddRoot} disabled={running} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700">添加文件夹</button><button onClick={onRun} disabled={running || !roots.length} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{running ? "扫描中…" : "开始扫描"}</button>{roots.length > 0 && <button onClick={onClear} disabled={running} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">清空</button>}</div>
    </div>
    {roots.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{roots.map((root, index) => <span key={`${root.name}-${index}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">{root.name || "项目文件夹"}</span>)}</div>}
    {running && <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3"><div className="flex items-center justify-between text-xs text-slate-600"><span className="truncate">正在读取：{progress.name}</span><button onClick={onCancel} className="ml-3 flex shrink-0 items-center gap-1 font-bold text-rose-600"><X className="h-3 w-3" />取消</button></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: progress.total ? `${Math.round(progress.current / progress.total * 100)}%` : "8%" }} /></div><div className="mt-1 text-right text-[11px] text-slate-400">{progress.current}/{progress.total || "…"}</div></div>}
    {report && <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{[["文件", report.fileCount], ["可读", report.readableCount], ["待复核", report.reviewCount], ["问题", report.issues.length], ["阶段", report.inferredStage?.stageName?.split(" ")[1] || "待判断"]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 truncate text-sm font-bold text-slate-900">{value}</div></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white p-3"><div className="text-xs text-slate-600"><div>推断阶段：<strong className="text-slate-900">{report.inferredStage?.stageName || "暂无足够证据"}</strong>{report.inferredStage && <span className="ml-2 text-emerald-600">置信度 {Math.round(report.inferredStage.confidence * 100)}%</span>}</div>{currentStageName && <div className={cn("mt-1", currentStageId === report.inferredStage?.stageId ? "text-emerald-600" : "text-amber-700")}>系统当前阶段：{currentStageName} · {currentStageId === report.inferredStage?.stageId ? "判断一致" : "与文件证据不一致，请复核"}</div>}</div><div className="flex gap-2"><button onClick={() => downloadScanReport(report, "json")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600"><FileDown className="h-3.5 w-3.5" />JSON</button><button onClick={() => downloadScanReport(report, "xlsx")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600"><FileDown className="h-3.5 w-3.5" />Excel</button></div></div><div className="flex gap-2"><button onClick={() => onFilter("all")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "all" ? "bg-emerald-600 text-white" : "bg-white text-slate-600")}>全部文件</button><button onClick={() => onFilter("review")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "review" ? "bg-amber-500 text-white" : "bg-white text-slate-600")}>待复核</button><button onClick={() => onFilter("issues")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "issues" ? "bg-rose-500 text-white" : "bg-white text-slate-600")}>问题文件</button></div><div className="max-h-96 overflow-auto rounded-xl border border-emerald-100 bg-white">{visibleFiles.slice(0, 120).map((file) => <ScanFileRow key={file.id} file={file} override={classificationOverrides[file.id]} onChange={(value) => onClassificationChange(file.id, value)} />)}{visibleFiles.length > 120 && <div className="p-3 text-center text-xs text-slate-400">仅显示前 120 项，完整清单请导出 Excel。</div>}{visibleFiles.length === 0 && <div className="p-6 text-center text-xs text-slate-400">当前筛选没有文件</div>}</div>{report.issues.length > 0 && <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"><strong>需要人工确认：</strong>{report.issues.slice(0, 5).map((issue) => <div key={`${issue.type}-${issue.title}-${issue.detail}`} className="mt-1">{issue.title}：{issue.detail}</div>)}</div>}</div>}
  </section>;
}

function ScanFileRow({ file, override, onChange }: { key?: string; file: ProjectScanReport["files"][number]; override?: { stageId: string; category: string }; onChange: (value: { stageId: string; category: string }) => void }) {
  const stageId = override?.stageId || file.stageId || "";
  const category = override?.category || file.category;
  return <div className="flex flex-col gap-2 border-b border-slate-100 p-3 last:border-0 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-900">{file.relativePath}</div><div className="mt-1 truncate text-[11px] text-slate-500">{category} · {STAGES.find((stage) => stage.id === stageId)?.name || "待复核"} · 置信度 {override ? "人工确认" : `${Math.round(file.confidence * 100)}%`}{file.contentConflict ? ` · ${file.contentConflict}` : ""}</div></div><div className="flex flex-wrap items-center gap-2"><select value={stageId} onChange={(event) => onChange({ stageId: event.target.value, category })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"><option value="">未确定阶段</option>{STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select><input value={category} onChange={(event) => onChange({ stageId, category: event.target.value })} className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700" aria-label="资料类别" />{(file.status === "needs-review" || file.status === "unreadable") && !override && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}</div></div>;
}

function ProjectStructureSummary({ report, organizationPlan, selectedKeys, importing, aiReviewing, existingProjects, nameOverrides, onNameChange, onToggle, onImport }: { report: ProjectScanReport | null; organizationPlan: MaterialOrganizationPlan | null; selectedKeys: string[]; importing: boolean; aiReviewing: boolean; existingProjects: any[]; nameOverrides: Record<string, string>; onNameChange: (projectKey: string, name: string) => void; onToggle: (projectKey: string) => void; onImport: () => void }) {
  if (!report) return null;
  const existingNameCounts = existingProjects.reduce<Map<string, number>>((counts, project: any) => {
    const name = String(project.name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map());
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">项目名称与阶段分类</h3><p className="mt-1 text-xs text-slate-600">勾选后录入新项目，或同步已有项目的文件归档；未勾选项目不会处理。</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">{report.projects.length} 个项目</span><button onClick={onImport} disabled={importing || !selectedKeys.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{aiReviewing ? "DeepSeek 审核归档阶段…" : importing ? "正在归档…" : `DeepSeek 辅助归档（${selectedKeys.length}）`}</button></div></div>
    <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3 text-xs text-slate-600">已有项目不会重复创建，重新扫描后可以再次勾选并同步原有文件。录入或同步只建立当前及下一阶段目录，并将文件复制到对应阶段的“已归档”目录；原文件不会移动、重命名或删除。</div>
    {organizationPlan && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-800"><span className="font-bold">整理计划 · {organizationPlan.projectName}</span><span>共 {summarizeOrganizationPlan(organizationPlan).total} 个文件</span><span>可整理 {summarizeOrganizationPlan(organizationPlan).ready}</span><span className={organizationPlan.status === "draft" ? "text-amber-700" : ""}>待确认 {summarizeOrganizationPlan(organizationPlan).review}</span><span className="text-slate-500">目标：整理预览_日期</span></div>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{report.projects.map((project) => {
      const displayName = nameOverrides[project.projectKey] ?? project.projectName;
      const normalizedName = displayName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      const matchCount = existingNameCounts.get(normalizedName) || 0;
      const duplicate = matchCount > 1;
      const exists = matchCount === 1;
      const selected = selectedKeys.includes(project.projectKey);
      return <label key={project.projectKey} className={cn("block rounded-xl border bg-white p-4 transition", duplicate ? "border-rose-300 bg-rose-50/30" : selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-emerald-100", exists && "opacity-90")}>
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={selected} disabled={importing || duplicate} onChange={() => onToggle(project.projectKey)} className="mt-1 h-4 w-4 accent-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><input value={displayName} disabled={importing} onChange={(event) => onNameChange(project.projectKey, event.target.value)} className={cn("min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm font-bold text-slate-900 outline-none", duplicate ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-emerald-500")} /><span className="ml-2 shrink-0 text-xs text-slate-500">{project.fileCount} 个文件</span></div>
            <div className={cn("mt-1 text-[11px]", duplicate ? "font-semibold text-rose-600" : "text-slate-500")}>{duplicate ? "已有多个同名项目，请修改为唯一名称后再录入" : exists ? "已有项目：将同步文件归档，不重复创建" : `新项目，名称置信度 ${Math.round(project.confidence * 100)}%`}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">{project.stageSummaries.filter((stage) => stage.stageKey !== "needs-review").slice(0, 10).map((stage) => <span key={stage.stageKey} title={`${stage.stageName}：${stage.fileCount} 个文件，${stage.reviewCount} 个待复核`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-800">{stage.stageName} · {stage.fileCount}</span>)}{project.stageSummaries.some((stage) => stage.stageKey === "needs-review") && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] text-amber-800">部分资料待复核</span>}</div>
          </div>
        </div>
      </label>;
    })}</div>
  </section>;
}

function ArchiveCleanupPanel({ candidates, scanning, rebuilding, deleting, onPreview, onRebuild, onDelete }: { candidates: ArchiveCleanupCandidate[]; scanning: boolean; rebuilding: boolean; deleting: boolean; onPreview: () => void; onRebuild: () => void; onDelete: () => void }) {
  const totalSize = candidates.reduce((sum, item) => sum + item.size, 0);
  const verified = candidates.filter((item) => item.status === "verified").length;
  return <section className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">旧归档重建与清理</h3><p className="mt-1 text-xs text-slate-600">先把平铺文件重建到分类目录并核对 SHA-256，只有校验成功的旧副本才能删除。</p></div><div className="flex flex-wrap gap-2"><button onClick={onPreview} disabled={scanning || rebuilding || deleting} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">{scanning ? "扫描旧归档…" : "预览旧平铺归档"}</button>{candidates.length > 0 && verified === 0 && <button onClick={onRebuild} disabled={scanning || rebuilding || deleting} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{rebuilding ? "重建并校验中…" : `重建 ${candidates.length} 个`}</button>}{verified > 0 && <button onClick={onDelete} disabled={scanning || rebuilding || deleting} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{deleting ? "清理中…" : `确认清理 ${verified} 个旧副本`}</button>}</div></div>{candidates.length > 0 && <div className="mt-3 rounded-xl border border-rose-100 bg-white p-3 text-xs text-rose-800">共 {candidates.length} 个旧平铺文件，约 {formatSize(totalSize)}；其中 {verified} 个已完成重建与哈希校验。未校验、冲突和人工文件不会删除。</div>}{!candidates.length && !scanning && <p className="mt-3 text-xs text-slate-500">尚未生成迁移预览。原始来源文件始终不会移动或删除。</p>}</section>;
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
