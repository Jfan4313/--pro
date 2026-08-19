import React from "react";
import { Download, FileText, FolderOpen, FolderSearch, RefreshCw, UploadCloud } from "lucide-react";
import { apiClient, getProjectFileDownloadUrl } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects, getProjectNumber } from "@/src/lib/management";
import { STAGES, getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { cn } from "@/src/lib/utils";
import { ArchiveFolderState, chooseLocalArchiveProvider, downloadLocalArchiveFile, getCurrentAndNextStages, getLocalArchiveProvider, requestLocalArchivePermission } from "@/src/lib/archiveStorage";

export function ProjectFiles({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData] = useProjectBoardData();
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

  const openLocationPanel = async () => setIsLocationPanelOpen(true);

  React.useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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
