import React from "react";
import { Download, FileText, FolderOpen, FolderSearch, RefreshCw, UploadCloud } from "lucide-react";
import { apiClient, getProjectFileDownloadUrl } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects, getProjectNumber } from "@/src/lib/management";
import { STAGES, getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { cn } from "@/src/lib/utils";

export function ProjectFiles({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData] = useProjectBoardData();
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const projects = React.useMemo(() => flattenProjects(boardData), [boardData]);
  const [stageFilter, setStageFilter] = React.useState("all");
  const [projectSearch, setProjectSearch] = React.useState("");
  const [selectedProjectId, setSelectedProjectId] = React.useState("");
  const [fileRoot, setFileRoot] = React.useState("");
  const [projectFiles, setProjectFiles] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [backendError, setBackendError] = React.useState("");
  const [isLocationPanelOpen, setIsLocationPanelOpen] = React.useState(false);
  const [fileRootInput, setFileRootInput] = React.useState("");
  const [defaultFileRoot, setDefaultFileRoot] = React.useState("");
  const [isSavingLocation, setIsSavingLocation] = React.useState(false);
  const [localFolderName, setLocalFolderName] = React.useState("");
  const [localFiles, setLocalFiles] = React.useState<Array<{ name: string; path: string; size: number; updatedAt: number }>>([]);

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
  const availableStages = currentStageInfo ? STAGES.slice(0, currentStageInfo.index + 1) : STAGES.slice(0, 1);
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
    try {
      const settings = await apiClient.getFileSettings();
      setFileRoot(settings.rootPath);
      setDefaultFileRoot(settings.defaultRootPath);
      const result = await apiClient.listProjectFiles(selectedProject.id, { project: selectedProject, stages: STAGES });
      setProjectFiles(result);
    } catch {
      setProjectFiles(null);
      setBackendError("本地后端未连接，无法读取项目资料目录");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  const openLocationPanel = async () => {
    try {
      const settings = await apiClient.getFileSettings();
      setFileRootInput(settings.rootPath);
      setDefaultFileRoot(settings.defaultRootPath);
    } catch {
      setFileRootInput(fileRoot);
    }
    setIsLocationPanelOpen(true);
  };

  const saveLocation = async () => {
    const rootPath = fileRootInput.trim();
    if (!rootPath) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请填写本机资料归档文件夹路径" }));
      return;
    }
    setIsSavingLocation(true);
    try {
      const saved = await apiClient.updateFileSettings({ rootPath });
      setFileRoot(saved.rootPath);
      setFileRootInput(saved.rootPath);
      setIsLocationPanelOpen(false);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目资料归档位置已保存" }));
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "保存失败，请确认本地服务已启动且目录可写" }));
    } finally {
      setIsSavingLocation(false);
    }
  };

  React.useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const initFolders = async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    try {
      await apiClient.initProjectFolders(selectedProject.id, { project: selectedProject, stages: availableStages });
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前阶段资料夹已生成" }));
      await loadFiles();
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "生成失败，请检查本地后端和文件保存位置" }));
    } finally {
      setIsLoading(false);
    }
  };

  const chooseLocalFolder = async () => {
    const picker = (window as any).showDirectoryPicker;
    if (!picker) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前浏览器不支持文件夹授权，请使用最新版 Chrome/Edge，或在桌面端启动本地服务" }));
      return;
    }
    try {
      const handle = await picker({ mode: "read" });
      const files: Array<{ name: string; path: string; size: number; updatedAt: number }> = [];
      const walk = async (directory: any, prefix = "") => {
        for await (const entry of directory.values()) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.kind === "file") {
            const file = await entry.getFile();
            files.push({ name: file.name, path, size: file.size, updatedAt: file.lastModified });
          } else if (files.length < 500) {
            await walk(entry, path);
          }
          if (files.length >= 500) break;
        }
      };
      await walk(handle);
      setLocalFolderName(handle.name || "已授权文件夹");
      setLocalFiles(files.sort((a, b) => b.updatedAt - a.updatedAt));
      setFileRoot(handle.name || "已授权本地文件夹");
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已授权访问“${handle.name}”，读取 ${files.length} 个文件` }));
    } catch (error: any) {
      if (error?.name !== "AbortError") window.dispatchEvent(new CustomEvent("show-toast", { detail: "文件夹授权失败，请重新选择并允许浏览器访问" }));
    }
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
            生成当前阶段资料夹
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
            {STAGES.slice(0, 4).map(stage => <button key={stage.id} onClick={() => setStageFilter(stage.id)} className={cn("rounded-xl border px-3 py-2 text-xs font-bold", stageFilter === stage.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-white text-slate-600")}>{stage.name.split(" ")[1]?.split("(")[0]}</button>)}
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
          {backendError}。如果你是在公网使用，请点击“选择本地文件夹”授予浏览器访问权限；桌面端也可以用本地服务读取完整目录。
        </div>
      )}

      {isLocationPanelOpen && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">项目资料归档位置</h3><p className="mt-1 text-xs text-slate-500">公网网页不能直接读取电脑路径，需要你在浏览器弹窗中授权文件夹；桌面端可继续使用绝对路径。</p></div><button onClick={() => setIsLocationPanelOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">关闭</button></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={fileRootInput} onChange={(event) => setFileRootInput(event.target.value)} placeholder={defaultFileRoot || "/Users/你的用户名/Documents/项目资料"} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" /><button onClick={() => void saveLocation()} disabled={isSavingLocation} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{isSavingLocation ? "保存中…" : "保存归档位置"}</button><button onClick={() => void chooseLocalFolder()} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100">选择本地文件夹</button><button onClick={() => void apiClient.openFileRoot().catch(() => window.dispatchEvent(new CustomEvent("show-toast", { detail: "无法打开目录，请确认本地服务已启动" })))} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">桌面端打开目录</button></div>{defaultFileRoot && <p className="mt-2 text-xs text-slate-400">系统默认位置：{defaultFileRoot}</p>}{localFolderName && <p className="mt-2 text-xs text-emerald-600">已授权本地文件夹：{localFolderName}（仅本次浏览器会话有效）</p>}</div>}

      {localFiles.length > 0 && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">本地文件夹浏览</h3><p className="mt-1 text-xs text-slate-500">{localFolderName} · 已读取 {localFiles.length} 个文件</p></div><button onClick={() => void chooseLocalFolder()} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">重新授权</button></div><div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">{localFiles.map((file) => <div key={file.path} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800" title={file.path}>{file.name}</p><p className="truncate text-xs text-slate-400">{file.path} · {formatSize(file.size)}</p></div><FileText className="h-4 w-4 shrink-0 text-emerald-600" /></div>)}</div></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{selectedProject ? `${getProjectNumber(selectedProject)} · ${selectedProject.name}` : "暂无项目"}</h3>
          <p className="text-xs text-slate-500 mt-1">当前阶段：{currentStageInfo?.stage.name || "项目立项"}。只显示当前阶段及以前阶段。</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {availableStages.map((stage) => {
            const folder = (projectFiles?.stages || []).find((item: any) => item.stageId === stage.id || item.stageName === stage.name);
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

                {files.length > 0 ? (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {files.map((file: any) => (
                      <div key={file.relativePath} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate" title={file.name}>{file.name}</div>
                          <div className="text-xs text-slate-400 mt-1">{file.bucket} · {formatSize(file.size)} · {formatTime(file.updatedAt)}</div>
                        </div>
                        <button
                          onClick={() => window.open(getProjectFileDownloadUrl(file.relativePath), "_blank")}
                          className="shrink-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-400">
                    暂无归档文件，可在“全生命周期”对应阶段上传资料
                  </div>
                )}
              </div>
            );
          })}
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
