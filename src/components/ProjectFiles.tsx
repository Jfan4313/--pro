import React from "react";
import { Download, FileText, FolderOpen, RefreshCw, Settings, UploadCloud } from "lucide-react";
import { apiClient, getProjectFileDownloadUrl } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects } from "@/src/lib/management";
import { STAGES, getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { cn } from "@/src/lib/utils";

export function ProjectFiles({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData] = useProjectBoardData();
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const projects = React.useMemo(() => flattenProjects(boardData), [boardData]);
  const [selectedProjectId, setSelectedProjectId] = React.useState("");
  const [fileRoot, setFileRoot] = React.useState("");
  const [projectFiles, setProjectFiles] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [backendError, setBackendError] = React.useState("");

  const selectedProject = projects.find((project: any) => project.id === selectedProjectId) || projects[0];
  const currentStageInfo = selectedProject ? getProjectCurrentStageInfo(selectedProject.id, lifecycleStates) : null;
  const availableStages = currentStageInfo ? STAGES.slice(0, currentStageInfo.index + 1) : STAGES.slice(0, 1);
  const totalFiles = React.useMemo(() => {
    return (projectFiles?.stages || []).reduce((sum: number, stage: any) => sum + (stage.files || []).length, 0);
  }, [projectFiles]);
  const expectedFiles = STAGES.reduce((sum, stage) => sum + stage.files.length, 0);

  React.useEffect(() => {
    if (!selectedProjectId && projects[0]?.id) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const loadFiles = React.useCallback(async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    setBackendError("");
    try {
      const settings = await apiClient.getFileSettings();
      setFileRoot(settings.rootPath);
      const result = await apiClient.listProjectFiles(selectedProject.id, { project: selectedProject, stages: STAGES });
      setProjectFiles(result);
    } catch {
      setProjectFiles(null);
      setBackendError("本地后端未连接，无法读取项目资料目录");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

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

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">项目资料管理</h2>
          <p className="text-slate-500 text-sm mt-1">按项目、阶段和参建单位查看本地归档资料</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedProject?.id || ""}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm"
          >
            {projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button onClick={loadFiles} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            刷新
          </button>
          <button onClick={initFolders} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm flex items-center">
            <FolderOpen className="w-4 h-4 mr-2" />
            生成当前阶段资料夹
          </button>
          <button onClick={() => setActiveTab("settings")} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
            <Settings className="w-4 h-4 mr-2" />
            保存位置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Metric icon={FolderOpen} label="资料根目录" value={fileRoot || "未连接"} compact />
        <Metric icon={FileText} label="已归档文件" value={`${totalFiles} 份`} />
        <Metric icon={UploadCloud} label="阶段清单项" value={`${expectedFiles} 项`} />
      </div>

      {backendError && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700">
          {backendError}。请用桌面启动器或 `npm run desktop` 启动本地服务。
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{selectedProject?.name || "暂无项目"}</h3>
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
