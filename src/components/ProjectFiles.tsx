import React from "react";
import { AlertTriangle, Download, FileDown, FileText, FolderOpen, FolderSearch, RefreshCw, SearchCheck, UploadCloud, X } from "lucide-react";
import { apiClient, downloadProjectManifestContent, getProjectFileDownloadUrl, ProjectFileManifest } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { flattenProjects, getProjectNumber } from "@/src/lib/management";
import { STAGES, getProjectCurrentStageInfo } from "@/src/lib/projectLifecycle";
import { cn } from "@/src/lib/utils";
import { ArchiveFolderState, chooseLocalArchiveProvider, downloadLocalArchiveFile, getCurrentAndNextStages, getLocalArchiveProvider, requestLocalArchivePermission } from "@/src/lib/archiveStorage";
import { downloadScanReport, getScannedFileHandle, pickScanDirectory, ProjectScanReport, scanProjectDirectories } from "@/src/lib/projectScanner";

export function ProjectFiles({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData, setBoardData] = useProjectBoardData();
  const { reserveProjectNumber } = useProjectNumbering();
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const projects = React.useMemo(() => flattenProjects(boardData), [boardData]);
  const [stageFilter, setStageFilter] = React.useState("all");
  const [projectSearch, setProjectSearch] = React.useState("");
  const [selectedProjectId, setSelectedProjectId] = React.useState("");
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
  const [importingProjects, setImportingProjects] = React.useState(false);
  const [aiArchiveReviewing, setAiArchiveReviewing] = React.useState(false);
  const [scanRunning, setScanRunning] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState({ current: 0, total: 0, name: "" });
  const [scanFilter, setScanFilter] = React.useState<"all" | "review" | "issues">("all");
  const [manifests, setManifests] = React.useState<ProjectFileManifest[]>([]);
  const [manifestLoading, setManifestLoading] = React.useState(false);
  const [manifestSyncing, setManifestSyncing] = React.useState(false);
  const [uploadingManifestId, setUploadingManifestId] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const scanAbortRef = React.useRef<AbortController | null>(null);

  const selectedProject = projects.find((project: any) => project.id === selectedProjectId) || projects[0];
  const visibleProjects = React.useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLocaleLowerCase();
    return projects.filter((project: any) => {
      const matchesStage = stageFilter === "all" || getProjectCurrentStageInfo(project.id, lifecycleStates).stage.id === stageFilter;
      const text = `${getProjectNumber(project)} ${project.name || ""}`.toLocaleLowerCase();
      return matchesStage && (!normalizedSearch || text.includes(normalizedSearch));
    });
  }, [projects, stageFilter, lifecycleStates, projectSearch]);
  const currentStageInfo = selectedProject ? getProjectCurrentStageInfo(selectedProject.id, lifecycleStates) : null;
  const availableStages = currentStageInfo ? getCurrentAndNextStages(STAGES, currentStageInfo.index) : STAGES.slice(0, 2);
  const archivedStages = STAGES.map((stage) => ({
    stage,
    folder: (projectFiles?.stages || []).find((item: any) => item.stageId === stage.id || item.stageName === stage.name),
  })).filter(({ stage, folder }) => availableStages.some((item) => item.id === stage.id) || (folder?.files || []).length > 0);
  const totalFiles = React.useMemo(() => {
    return (projectFiles?.stages || []).reduce((sum: number, stage: any) => sum + (stage.files || []).length, 0);
  }, [projectFiles]);
  const expectedFiles = STAGES.reduce((sum, stage) => sum + stage.files.length, 0);

  React.useEffect(() => {
    if (!visibleProjects.some((project: any) => project.id === selectedProjectId)) setSelectedProjectId(visibleProjects[0]?.id || "");
  }, [visibleProjects, selectedProjectId]);

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
        const localFiles = await provider.listFiles({ project: selectedProject, stages: STAGES, projectFolder: archiveFolderStates[selectedProject.id]?.projectFolder });
        for (const file of localFiles) {
          const folder = stagesById.get(file.stageId);
          folder?.files.push({
            name: file.storedName,
            storedName: file.storedName,
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
      const result = await provider.ensureProjectStructure(selectedProject, availableStages, archiveFolderStates[selectedProject.id]?.projectFolder);
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
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前及下一阶段资料夹已生成" }));
      await loadFiles();
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message === "archive_permission_required" ? "请先授权本机归档文件夹" : "生成失败，请检查本机文件夹权限" }));
    } finally {
      setIsLoading(false);
    }
  };

  const chooseLocalFolder = async () => {
    try {
      const provider = await chooseLocalArchiveProvider();
      const availability = await provider.checkAvailability();
      setLocalPermission(availability.permission);
      setLocalFolderName(availability.rootName || "已授权文件夹");
      setFileRoot(availability.rootName || "已授权本地文件夹");
      setIsLocationPanelOpen(false);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已授权访问“${availability.rootName}”，正在补建项目目录` }));
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
      const existingNames = new Set(projects.map((project: any) => String(project.name || "").trim().toLocaleLowerCase()));
      const selected = scanReport.projects.filter((project) => selectedImportProjects.includes(project.projectKey));
      const aiReview: { aiApplied: boolean; projects: Array<{ projectKey: string; currentStageId: string; confidence: number; reason: string }> } = await apiClient.analyzeProjectArchive({ projects: selected.map((project) => {
        const projectName = projectNameOverrides[project.projectKey]?.trim() || project.projectName;
        const stageIds = project.stageSummaries.map((stage) => stage.stageKey).filter((stageId) => STAGES.some((stage) => stage.id === stageId));
        return { projectKey: project.projectKey, projectName, localStageId: stageIds.length ? stageIds.sort((a, b) => STAGES.findIndex((stage) => stage.id === a) - STAGES.findIndex((stage) => stage.id === b)).at(-1)! : STAGES[0].id, localConfidence: project.confidence, stageSummaries: project.stageSummaries, files: scanReport.files.filter((file) => file.projectKey === project.projectKey).slice(0, 400).map((file) => ({ name: file.name, relativePath: file.relativePath, extension: file.extension, pathStageName: file.pathStageName })) };
      }) }).catch(() => ({ aiApplied: false, projects: [] }));
      const aiDecisions = new Map(aiReview.projects.map((decision) => [decision.projectKey, decision]));
      setAiArchiveReviewing(false);
      const imported: any[] = [];
      const renamedExisting: any[] = [];
      const archiveTargets: Array<{ project: any; source: typeof selected[number]; currentStageId: string }> = [];
      for (const project of selected) {
        const projectName = projectNameOverrides[project.projectKey]?.trim() || project.projectName;
        if (!projectName || projectName === "未分组资料") continue;
        const stageIds = project.stageSummaries.map((stage) => stage.stageKey).filter((stageId) => STAGES.some((stage) => stage.id === stageId));
        const localStageId = stageIds.length ? stageIds.sort((a, b) => STAGES.findIndex((stage) => stage.id === a) - STAGES.findIndex((stage) => stage.id === b)).at(-1)! : STAGES[0].id;
        const aiDecision = aiDecisions.get(project.projectKey);
        const existing = projects.find((candidate: any) => String(candidate.name || "").trim().toLocaleLowerCase() === projectName.toLocaleLowerCase()) || projects.find((candidate: any) => String(candidate.name || "").trim().toLocaleLowerCase() === project.projectName.toLocaleLowerCase());
        const currentStageId = existing ? getProjectCurrentStageInfo(existing.id, lifecycleStates).stage.id : (aiDecision?.currentStageId || localStageId);
        const projectRecord = existing ? { ...existing, name: projectName, importedProjectKey: project.projectKey } : { id: globalThis.crypto?.randomUUID?.() || `p${Date.now()}-${imported.length}`, projectNumber: await reserveProjectNumber(), name: projectName, type: "光伏项目", manager: "待确定", dueDate: "", constructProgress: 0, supplyProgress: 0, status: "normal", importedFromScanId: scanReport.id, importedProjectKey: project.projectKey, importedFileCount: project.fileCount, importedStageId: currentStageId, archiveReview: aiDecision ? { provider: "DeepSeek", confidence: aiDecision.confidence, reason: aiDecision.reason, reviewedAt: new Date().toISOString() } : { provider: "local-rules", confidence: project.confidence, reason: "使用目录和阶段规则", reviewedAt: new Date().toISOString() } };
        if (!existing) imported.push(projectRecord);
        else if (existing.name !== projectName) renamedExisting.push(projectRecord);
        archiveTargets.push({ project: { ...projectRecord, importedProjectKey: project.projectKey }, source: project, currentStageId });
        existingNames.add(projectName.toLocaleLowerCase());
      }
      if (!archiveTargets.length) {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "勾选项目没有可确认的项目名称，未执行录入或归档" }));
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
              const uncertain = file.status !== "classified" || (!file.pathStageKey && (!file.stageId || file.confidence < 0.65));
              if (uncertain) { await provider.writeUncertainFile({ project, file: sourceFile, fileType: file.category, projectFolder: structure.projectFolder }); uncertainArchivedCount += 1; }
              else {
                const targetStage = STAGES.find((stage) => stage.id === (file.pathStageKey || file.stageId)) || STAGES[currentIndex];
                await provider.writeFile({ project, stage: targetStage, file: sourceFile, fileType: file.category, autoRename: true, projectFolder: structure.projectFolder });
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
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `${imported.length ? `新建 ${imported.length} 个项目，` : ""}已同步 ${archiveTargets.length} 个项目的现有文件归档` }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "项目录入失败，请重试" }));
    } finally {
      setAiArchiveReviewing(false);
      setImportingProjects(false);
    }
  };

  const cancelScan = () => scanAbortRef.current?.abort();

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
        relativePath: file.storageKey,
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
      const file = await provider.readFile(manifest.relativePath);
      const stage = STAGES.find((item) => item.id === manifest.stageId) || STAGES[0];
      const session = await apiClient.createProjectFileUpload({ fileId: manifest.id, project: selectedProject, stage, fileType: manifest.originalName });
      const chunkSize = session.chunkSize;
      for (let offset = 0, index = 0; offset < file.size || (file.size === 0 && index === 0); offset += chunkSize, index += 1) {
        await apiClient.uploadProjectFileChunk(session.id, index, file.slice(offset, Math.min(file.size, offset + chunkSize)));
        setUploadProgress(file.size ? Math.round(Math.min(file.size, offset + chunkSize) / file.size * 100) : 100);
        if (file.size === 0) break;
      }
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      await apiClient.completeProjectFileUpload(session.id, checksum);
      await loadManifests();
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `${manifest.originalName} 已上传，其他电脑现在可以按权限查看` }));
    } catch (error: any) { window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "文件上传失败，可稍后重试" })); }
    finally { setUploadingManifestId(null); setUploadProgress(0); }
  };

  const downloadFile = async (file: any) => {
    if (file.storageProvider === "local-folder" && file.storageKey) {
      try {
        await downloadLocalArchiveFile(file.storageKey, file.storedName || file.name);
      } catch {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "原文件仅能在已授权的归档电脑下载" }));
      }
      return;
    }
    if (file.relativePath || file.storageKey) window.open(getProjectFileDownloadUrl(file.relativePath || file.storageKey), "_blank");
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">项目资料管理</h2>
          <p className="text-slate-500 text-sm mt-1">按项目、阶段和参建单位查看本地归档资料</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadFiles} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            刷新
          </button>
          <button onClick={initFolders} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm flex items-center">
            <FolderOpen className="w-4 h-4 mr-2" />
            生成当前及下一阶段
          </button>
          <button onClick={() => void openLocationPanel()} className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors shadow-sm flex items-center">
            <FolderSearch className="w-4 h-4 mr-2" />
            设置归档位置
          </button>
          <button onClick={() => void addScanRoot()} className="px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors shadow-sm flex items-center">
            <SearchCheck className="w-4 h-4 mr-2" />
            添加扫描文件夹
          </button>
          <button onClick={() => void syncLocalManifest()} disabled={manifestSyncing || !selectedProject} className="px-4 py-2 bg-violet-50 border border-violet-100 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors shadow-sm flex items-center disabled:opacity-50">
            <FileDown className={cn("w-4 h-4 mr-2", manifestSyncing && "animate-pulse")} />
            {manifestSyncing ? "同步中…" : "同步文件清单"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2"><FolderOpen className="h-5 w-5 text-indigo-600" /><h3 className="font-bold text-slate-900">选择要查看的项目</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-600">{visibleProjects.length} 个</span></div>
            <div className="relative"><FolderSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="搜索项目名称或项目编号" className="w-full rounded-xl border border-indigo-100 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={() => setStageFilter("all")} className={cn("rounded-xl border px-3 py-2 text-xs font-bold", stageFilter === "all" ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-white text-slate-600")}>全部阶段</button>
            {STAGES.map(stage => <button key={stage.id} onClick={() => setStageFilter(stage.id)} className={cn("rounded-xl border px-3 py-2 text-xs font-bold", stageFilter === stage.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-white text-slate-600")}>{stage.name.split(" ")[1]?.split("(")[0]}</button>)}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((project: any, index: number) => <button key={project.id} type="button" onClick={() => setSelectedProjectId(project.id)} className={cn("rounded-xl border bg-white p-3 text-left transition-all", selectedProject?.id === project.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-indigo-100 hover:border-indigo-300")}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-slate-900">{project.name}</span><span className="shrink-0 font-mono text-[10px] text-indigo-600">{getProjectNumber(project, index)}</span></div><div className="mt-1 text-xs text-slate-500">{getProjectCurrentStageInfo(project.id, lifecycleStates).stage.name.split(" ")[1]}</div></button>)}
          {visibleProjects.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-indigo-200 bg-white/70 p-6 text-center text-sm text-slate-500">没有匹配的项目，请调整阶段或搜索条件。</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Metric icon={FolderOpen} label="资料根目录" value={fileRoot || "未连接"} compact />
        <Metric icon={FileText} label="已归档文件" value={`${totalFiles} 份`} />
        <Metric icon={UploadCloud} label="阶段清单项" value={`${expectedFiles} 项`} />
      </div>

      {backendError && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700">
          {backendError}。新资料仅保存在本机授权目录，服务器历史资料仍会在服务恢复后显示。
        </div>
      )}

      {isLocationPanelOpen && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">本机项目资料归档位置</h3><p className="mt-1 text-xs text-slate-500">文件内容只写入当前电脑；项目和文件索引可同步到其他设备。</p></div><button onClick={() => setIsLocationPanelOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">关闭</button></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{localFolderName || "尚未选择本机文件夹"}{localFolderName && <span className={cn("ml-2 text-xs", localPermission === "granted" ? "text-emerald-600" : "text-amber-600")}>{localPermission === "granted" ? "可读写" : "需要恢复权限"}</span>}</div><button onClick={() => void chooseLocalFolder()} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">{localFolderName ? "重新选择" : "选择本机文件夹"}</button>{localFolderName && localPermission !== "granted" && <button onClick={() => void restoreLocalPermission()} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700">恢复授权</button>}</div></div>}

      <ScanPanel
        roots={scanRoots}
        report={scanReport}
        running={scanRunning}
        progress={scanProgress}
        filter={scanFilter}
        currentStageId={currentStageInfo?.stage.id}
        currentStageName={currentStageInfo?.stage.name}
        onAddRoot={() => void addScanRoot()}
        onRun={() => void runScan()}
        onCancel={cancelScan}
        onClear={() => { setScanRoots([]); setScanReport(null); }}
        onFilter={setScanFilter}
      />

      <ProjectStructureSummary report={scanReport} selectedKeys={selectedImportProjects} importing={importingProjects} aiReviewing={aiArchiveReviewing} existingProjects={projects} nameOverrides={projectNameOverrides} onNameChange={(projectKey, name) => setProjectNameOverrides((current) => ({ ...current, [projectKey]: name }))} onToggle={toggleImportProject} onImport={importScannedProjects} />

      <ManifestPanel manifests={manifests} loading={manifestLoading} uploadingId={uploadingManifestId} uploadProgress={uploadProgress} onUpload={(manifest) => void uploadManifest(manifest)} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{selectedProject ? `${getProjectNumber(selectedProject)} · ${selectedProject.name}` : "暂无项目"}</h3>
          <p className="text-xs text-slate-500 mt-1">当前阶段：{currentStageInfo?.stage.name || "项目立项"}。显示已有资料以及当前、下一阶段目录。</p>
          {selectedProject && <p className={cn("mt-1 text-xs", archiveFolderStates[selectedProject.id]?.status === "ready" ? "text-emerald-600" : archiveFolderStates[selectedProject.id]?.status === "error" ? "text-rose-600" : "text-amber-600")}>目录状态：{archiveFolderStates[selectedProject.id]?.status === "ready" ? "已生成" : archiveFolderStates[selectedProject.id]?.status === "error" ? "生成失败，可点击上方按钮重试" : "待归档电脑生成"}</p>}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {archivedStages.map(({ stage, folder }) => {
            const files = folder?.files || [];
            return (
              <div key={stage.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-900">{stage.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">应归档：{stage.files.join("、") || "无"}</p>
                  </div>
                  <span className={cn("shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border", files.length > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200")}>
                    {files.length} 份
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {files.map((file: any) => (
                      <div key={file.storageKey || file.relativePath || file.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate" title={file.name}>{file.name}</div>
                          <div className="text-xs text-slate-400 mt-1">{file.bucket} · {formatSize(file.size)} · {formatTime(file.updatedAt)} · {file.storageProvider === "local-folder" ? "本机" : "服务器历史"}</div>
                        </div>
                        <button
                          onClick={() => void downloadFile(file)}
                          className="shrink-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
              </div>
            );
          })}
          {archivedStages.length === 0 && <div className="p-10 text-center text-sm text-slate-400">该项目暂无真实归档文件</div>}
        </div>
      </div>
    </div>
  );
}

function ScanPanel({ roots, report, running, progress, filter, currentStageId, currentStageName, onAddRoot, onRun, onCancel, onClear, onFilter }: { roots: any[]; report: ProjectScanReport | null; running: boolean; progress: { current: number; total: number; name: string }; filter: "all" | "review" | "issues"; currentStageId?: string; currentStageName?: string; onAddRoot: () => void; onRun: () => void; onCancel: () => void; onClear: () => void; onFilter: (filter: "all" | "review" | "issues") => void }) {
  const visibleFiles = report?.files.filter((file) => filter === "all" || (filter === "review" ? file.status === "needs-review" || file.status === "unreadable" : report.issues.some((issue) => issue.fileIds?.includes(file.id)))) || [];
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-bold text-slate-900">本机文件扫描与阶段识别</h3></div><p className="mt-1 text-xs leading-5 text-slate-600">只读取你主动选择的文件夹，在浏览器本地分析。不会移动、重命名、删除或上传源文件。</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={onAddRoot} disabled={running} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700">添加文件夹</button><button onClick={onRun} disabled={running || !roots.length} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{running ? "扫描中…" : "开始扫描"}</button>{roots.length > 0 && <button onClick={onClear} disabled={running} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">清空</button>}</div>
    </div>
    {roots.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{roots.map((root, index) => <span key={`${root.name}-${index}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">{root.name || "项目文件夹"}</span>)}</div>}
    {running && <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3"><div className="flex items-center justify-between text-xs text-slate-600"><span className="truncate">正在读取：{progress.name}</span><button onClick={onCancel} className="ml-3 flex shrink-0 items-center gap-1 font-bold text-rose-600"><X className="h-3 w-3" />取消</button></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: progress.total ? `${Math.round(progress.current / progress.total * 100)}%` : "8%" }} /></div><div className="mt-1 text-right text-[11px] text-slate-400">{progress.current}/{progress.total || "…"}</div></div>}
    {report && <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{[["文件", report.fileCount], ["可读", report.readableCount], ["待复核", report.reviewCount], ["问题", report.issues.length], ["阶段", report.inferredStage?.stageName?.split(" ")[1] || "待判断"]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 truncate text-sm font-bold text-slate-900">{value}</div></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white p-3"><div className="text-xs text-slate-600"><div>推断阶段：<strong className="text-slate-900">{report.inferredStage?.stageName || "暂无足够证据"}</strong>{report.inferredStage && <span className="ml-2 text-emerald-600">置信度 {Math.round(report.inferredStage.confidence * 100)}%</span>}</div>{currentStageName && <div className={cn("mt-1", currentStageId === report.inferredStage?.stageId ? "text-emerald-600" : "text-amber-700")}>系统当前阶段：{currentStageName} · {currentStageId === report.inferredStage?.stageId ? "判断一致" : "与文件证据不一致，请复核"}</div>}</div><div className="flex gap-2"><button onClick={() => downloadScanReport(report, "json")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600"><FileDown className="h-3.5 w-3.5" />JSON</button><button onClick={() => downloadScanReport(report, "xlsx")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600"><FileDown className="h-3.5 w-3.5" />Excel</button></div></div><div className="flex gap-2"><button onClick={() => onFilter("all")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "all" ? "bg-emerald-600 text-white" : "bg-white text-slate-600")}>全部文件</button><button onClick={() => onFilter("review")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "review" ? "bg-amber-500 text-white" : "bg-white text-slate-600")}>待复核</button><button onClick={() => onFilter("issues")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", filter === "issues" ? "bg-rose-500 text-white" : "bg-white text-slate-600")}>问题文件</button></div><div className="max-h-96 overflow-auto rounded-xl border border-emerald-100 bg-white">{visibleFiles.slice(0, 120).map((file) => <div key={file.id} className="flex items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-0"><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-900">{file.relativePath}</div><div className="mt-1 truncate text-[11px] text-slate-500">{file.category} · {file.stageName || "待复核"} · 置信度 {Math.round(file.confidence * 100)}%{file.evidence.length ? ` · ${file.evidence.join("、")}` : ""}</div></div>{(file.status === "needs-review" || file.status === "unreadable") && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}</div>)}{visibleFiles.length > 120 && <div className="p-3 text-center text-xs text-slate-400">仅显示前 120 项，完整清单请导出 Excel。</div>}{visibleFiles.length === 0 && <div className="p-6 text-center text-xs text-slate-400">当前筛选没有文件</div>}</div>{report.issues.length > 0 && <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"><strong>需要人工确认：</strong>{report.issues.slice(0, 5).map((issue) => <div key={`${issue.type}-${issue.title}-${issue.detail}`} className="mt-1">{issue.title}：{issue.detail}</div>)}</div>}</div>}
  </section>;
}

function Metric({ icon: Icon, label, value, compact }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center min-w-0">
      <div className="p-4 bg-indigo-50 text-indigo-600 rounded-xl mr-4 shrink-0"><Icon className="w-6 h-6" /></div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={cn("font-bold text-slate-900 mt-1", compact ? "text-sm truncate" : "text-2xl")}>{value}</p>
      </div>
    </div>
  );
}

function ProjectStructureSummary({ report, selectedKeys, importing, aiReviewing, existingProjects, nameOverrides, onNameChange, onToggle, onImport }: { report: ProjectScanReport | null; selectedKeys: string[]; importing: boolean; aiReviewing: boolean; existingProjects: any[]; nameOverrides: Record<string, string>; onNameChange: (projectKey: string, name: string) => void; onToggle: (projectKey: string) => void; onImport: () => void }) {
  if (!report) return null;
  const existingNames = new Set(existingProjects.map((project: any) => String(project.name || "").trim().toLocaleLowerCase()));
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">项目名称与阶段分类</h3><p className="mt-1 text-xs text-slate-600">勾选后录入新项目，或同步已有项目的文件归档；未勾选项目不会处理。</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">{report.projects.length} 个项目</span><button onClick={onImport} disabled={importing || !selectedKeys.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{aiReviewing ? "DeepSeek 审核归档阶段…" : importing ? "正在归档…" : `DeepSeek 辅助归档（${selectedKeys.length}）`}</button></div></div>
    <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3 text-xs text-slate-600">已有项目不会重复创建，重新扫描后可以再次勾选并同步原有文件。录入或同步只建立当前及下一阶段目录，并将文件复制到对应阶段的“已归档”目录；原文件不会移动、重命名或删除。</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{report.projects.map((project) => { const displayName = nameOverrides[project.projectKey] ?? project.projectName; const exists = existingNames.has(displayName.trim().toLocaleLowerCase()) || existingNames.has(project.projectName.toLocaleLowerCase()); const selected = selectedKeys.includes(project.projectKey); return <label key={project.projectKey} className={cn("block rounded-xl border bg-white p-4 transition", selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-emerald-100", exists && "opacity-90")}><div className="flex items-start gap-3"><input type="checkbox" checked={selected} disabled={importing} onChange={() => onToggle(project.projectKey)} className="mt-1 h-4 w-4 accent-emerald-600" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><input value={displayName} disabled={importing} onChange={(event) => onNameChange(project.projectKey, event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" /><span className="ml-2 shrink-0 text-xs text-slate-500">{project.fileCount} 个文件</span></div><div className="mt-1 text-[11px] text-slate-500">{exists ? "已有项目：将同步文件归档，不重复创建" : `新项目，名称置信度 ${Math.round(project.confidence * 100)}%`}</div><div className="mt-2 flex flex-wrap gap-1.5">{project.stageSummaries.filter((stage) => stage.stageKey !== "needs-review").slice(0, 10).map((stage) => <span key={stage.stageKey} title={`${stage.stageName}：${stage.fileCount} 个文件，${stage.reviewCount} 个待复核`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-800">{stage.stageName} · {stage.fileCount}</span>)}{project.stageSummaries.some((stage) => stage.stageKey === "needs-review") && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] text-amber-800">部分资料待复核</span>}</div></div></div></label>; })}</div>
  </section>;
}

function ManifestPanel({ manifests, loading, uploadingId, uploadProgress, onUpload }: { manifests: ProjectFileManifest[]; loading: boolean; uploadingId: string | null; uploadProgress: number; onUpload: (manifest: ProjectFileManifest) => void }) {
  const grouped = React.useMemo(() => manifests.reduce<Record<string, ProjectFileManifest[]>>((result, manifest) => { (result[manifest.stageId] ||= []).push(manifest); return result; }, {}), [manifests]);
  return <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><FileDown className="h-5 w-5 text-violet-600" /><h3 className="font-bold text-slate-900">远程文件清单</h3></div><p className="mt-1 text-xs text-slate-600">其他电脑只同步这些元数据；“仅本机可用”的文件不会传输实际内容。</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-violet-700">{loading ? "读取中…" : `${manifests.length} 个文件`}</span></div>
    {manifests.length === 0 && !loading && <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white p-6 text-center text-xs text-slate-500">还没有发布文件清单。请在来源电脑点击“同步文件清单”。</div>}
    <div className="mt-4 space-y-3">{(Object.entries(grouped) as Array<[string, ProjectFileManifest[]]>).map(([stageId, files]) => { const stage = STAGES.find((item) => item.id === stageId); const uploaded = files.filter((file) => file.availability === "uploaded").length; return <div key={stageId} className="rounded-xl border border-violet-100 bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold text-slate-900">{stage?.name || stageId}</div><span className="text-xs text-slate-500">{uploaded}/{files.length} 已上传</span></div><div className="mt-3 space-y-2">{files.map((manifest) => <div key={manifest.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-900">{manifest.originalName}</div><div className="mt-1 truncate text-[11px] text-slate-500">{manifest.relativePath} · {formatSize(manifest.size)} · {formatTime(manifest.lastIndexedAt)} · V{manifest.version.replace(/^V/i, "")}</div></div><div className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", manifest.availability === "uploaded" ? "bg-emerald-100 text-emerald-700" : manifest.availability === "missing" ? "bg-rose-100 text-rose-700" : manifest.availability === "stale" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}>{manifest.availability === "uploaded" ? "已上传" : manifest.availability === "missing" ? "本机已缺失" : manifest.availability === "stale" ? "索引过期" : "仅本机可用"}</span>{manifest.availability !== "uploaded" && <button onClick={() => onUpload(manifest)} disabled={uploadingId !== null} className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{uploadingId === manifest.id ? `上传 ${uploadProgress}%` : "上传此文件"}</button>}{manifest.availability === "uploaded" && manifest.canViewContent && <button onClick={() => void downloadProjectManifestContent(manifest.id, manifest.originalName)} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">查看内容</button>}</div></div>)}</div></div>})}</div>
  </section>;
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
