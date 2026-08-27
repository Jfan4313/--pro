import React, { useEffect, useMemo, useState } from "react";
import { Folder, FileText, CheckCircle2, ChevronRight, ChevronDown, Upload, Clock, Shield, Briefcase, ListTodo, FileCheck, ArrowRight, Save, Camera, ArrowLeft, Eye, SkipForward, RotateCcw, Plus } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useUserSettings } from "@/src/hooks/useUserSettings";
import { useAuth } from "@/src/lib/auth";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { getProjectFileDownloadUrl } from "@/src/lib/apiClient";
import { useEntityList } from "@/src/hooks/useEntityList";
import { getProjectNumber } from "@/src/lib/management";
import { hasProjectIdentityConflict, isValidProjectNumber, normalizeProjectNumber, resolveProjectReference, sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { ArchiveFolderState, chooseLocalArchiveProvider, getArchiveProjectFolder, getLocalArchiveProvider, LocalFolderStorageProvider, openLocalArchiveFile, requestLocalArchivePermission } from "@/src/lib/archiveStorage";
import { getLifecycleChecklist, getProjectCurrentStageInfo, STAGES } from "@/src/lib/projectLifecycle";

function formatUploadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}


export function ProjectLifecycle({ initialProjectReference, initialStageId, onBack, onOpenProjectDetail, onSelectionChange, onOpenSiteSurvey }: {
  initialProjectReference?: string | null;
  initialStageId?: string | null;
  onBack?: () => void;
  onOpenProjectDetail?: (projectId: string) => void;
  onSelectionChange?: (project: any, stageId: string) => void;
  onOpenSiteSurvey?: (projectId: string, recordId?: string) => void;
}) {
  const { user } = useAuth();
  const [boardData, setBoardData] = useProjectBoardData();
  const { allProjects: numberedProjects, reserveProjectNumber } = useProjectNumbering();
  const [lifecycleStates, setLifecycleStates, lifecycleLoading] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const [appSettings] = useUserSettings<any>({});
  const { data: surveyRecords } = useEntityList<any>("site-surveys", []);
  
  const allProjects = useMemo(() => sortProjectsNaturally(Array.isArray(boardData)
    ? boardData.flatMap((col: any) => col.projects || [])
    : []), [boardData]);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [showStageFilters, setShowStageFilters] = useState(false);
  const [activeStage, setActiveStage] = useState(STAGES[0].id);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const requestedProject = useMemo(() => resolveProjectReference(allProjects, initialProjectReference), [allProjects, initialProjectReference]);

  const projectsWithStage = useMemo(() => allProjects.map((project: any, index: number) => ({
    ...project,
    projectNumber: getProjectNumber(project, index),
    lifecycleInfo: getProjectCurrentStageInfo(project.id, lifecycleStates),
  })), [allProjects, lifecycleStates]);
  const visibleProjects = useMemo(() => stageFilter === "all"
    ? projectsWithStage
    : projectsWithStage.filter((project: any) => project.lifecycleInfo.stage.id === stageFilter), [projectsWithStage, stageFilter]);

  useEffect(() => {
    if (lifecycleLoading) return;
    if (requestedProject.project) {
      setSelectedProject(requestedProject.project.id);
      const currentStage = getProjectCurrentStageInfo(requestedProject.project.id, lifecycleStates).stage.id;
      setActiveStage(STAGES.some((stage) => stage.id === initialStageId) ? String(initialStageId) : currentStage);
      return;
    }
    if (!initialProjectReference && !selectedProject && allProjects[0]) {
      setSelectedProject(allProjects[0].id);
      setActiveStage(getProjectCurrentStageInfo(allProjects[0].id, lifecycleStates).stage.id);
    }
  }, [allProjects.length, initialProjectReference, initialStageId, lifecycleLoading, requestedProject.project?.id]);

  useEffect(() => {
    if (selectedProject && !visibleProjects.some((project: any) => project.id === selectedProject)) {
      const next = visibleProjects[0];
      setSelectedProject(next?.id || null);
      if (next) setActiveStage(next.lifecycleInfo.stage.id);
    }
  }, [visibleProjects, selectedProject]);

  const activeProj = allProjects.find((p: any) => p.id === selectedProject);
  const activeProjectSurveys = activeProj ? surveyRecords.filter((record: any) => record.projectId === activeProj.id) : [];
  const latestProjectSurvey = [...activeProjectSurveys].sort((a: any, b: any) => {
    const aTime = new Date(a.createdAt || a.surveyDate || 0).getTime();
    const bTime = new Date(b.createdAt || b.surveyDate || 0).getTime();
    return bTime - aTime;
  })[0];
  
  // Safe accessor for current project state
  const projState = activeProj ? (lifecycleStates[activeProj.id] || {}) : {};
  const stageState = projState[activeStage] || { checklist: {}, fields: {} };
  const stageFiles = Array.isArray(stageState.files) ? stageState.files : [];
  const currentStageId = activeProj ? getProjectCurrentStageInfo(activeProj.id, lifecycleStates).stage.id : STAGES[0].id;
  const activeStageIndex = STAGES.findIndex((stage) => stage.id === activeStage);
  const currentStageIndex = STAGES.findIndex((stage) => stage.id === currentStageId);
  const isStageSkipped = stageState.status === "skipped";
  const canManageStage = Boolean(user && (["admin", "company_admin", "project_manager"].includes(user.role) || user.permissions?.includes("*")));
  const defaultSkipReason = "历史项目，前期资料未移交";

  useEffect(() => {
    if (activeProj && STAGES.some((stage) => stage.id === activeStage)) onSelectionChange?.(activeProj, activeStage);
  }, [activeProj, activeStage, onSelectionChange]);

  const selectProject = (projectId: string) => {
    const project = allProjects.find((item: any) => item.id === projectId);
    if (!project) return;
    setSelectedProject(project.id);
    setActiveStage(getProjectCurrentStageInfo(project.id, lifecycleStates).stage.id);
  };

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ");
    if (!name) return;
    if (numberedProjects.some((project: any) => String(project.name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `项目名称“${name}”已存在` }));
      return;
    }
    const project = { id: globalThis.crypto?.randomUUID?.() || `p${Date.now()}`, projectNumber: await reserveProjectNumber(), name, type: String(formData.get("type") || "光伏项目"), businessModel: String(formData.get("businessModel") || "EPC"), manager: "", managerId: "", constructProgress: 0, supplyProgress: 0, status: "normal" };
    await setBoardData((current: any[]) => {
      const columns = Array.isArray(current) && current.length ? current : STAGES.map((stage) => ({ id: stage.id, title: stage.name, projects: [], count: 0 }));
      return columns.map((column: any) => column.id === STAGES[0].id ? { ...column, projects: sortProjectsNaturally([project, ...(column.projects || [])]), count: (column.projects || []).length + 1 } : column);
    });
    const provider = await getLocalArchiveProvider();
    const availability = await provider?.checkAvailability();
    if (provider && availability?.available) {
      const structure = await provider.ensureProjectStructure(project, STAGES);
      await setArchiveFolderStates((current) => ({ ...current, [project.id]: { status: "ready", storageProvider: "local-folder", projectFolder: structure.projectFolder, generatedThroughStageId: structure.generatedThroughStageId, updatedAt: new Date().toISOString() } }));
    }
    setSelectedProject(project.id);
    setActiveStage(STAGES[0].id);
    setIsCreateProjectOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `已创建 ${project.projectNumber} · ${project.name}` }));
  };

  const saveProjectIdentity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProject) return;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ");
    const projectNumber = normalizeProjectNumber(formData.get("projectNumber"));
    if (!name || !isValidProjectNumber(projectNumber)) return void window.dispatchEvent(new CustomEvent("show-toast", { detail: "请填写有效的项目名称和编号，例如 PRJ-0001" }));
    const conflict = hasProjectIdentityConflict(numberedProjects, { id: editingProject.id, name, projectNumber });
    if (conflict.nameConflict || conflict.numberConflict) return void window.dispatchEvent(new CustomEvent("show-toast", { detail: conflict.nameConflict ? `项目名称“${name}”已存在` : `项目编号“${projectNumber}”已存在，请打开项目汇总查看冲突项目` }));
    const oldFolder = archiveFolderStates[editingProject.id]?.projectFolder;
    const newProject = { ...editingProject, name, projectNumber };
    const newFolder = getArchiveProjectFolder(newProject);
    let folderWarning = "";
    if (oldFolder && oldFolder !== newFolder) {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (provider && availability?.available) {
        try {
          await provider.renameProjectFolder(oldFolder, newFolder);
          await setArchiveFolderStates((current) => ({ ...current, [editingProject.id]: { ...current[editingProject.id], projectFolder: newFolder, updatedAt: new Date().toISOString() } }));
        } catch (error: any) {
          if (error?.code === "archive_target_exists") {
            return void window.dispatchEvent(new CustomEvent("show-toast", { detail: "新编号对应的资料文件夹已存在，请先处理同名文件夹" }));
          }
          folderWarning = "，但本地资料文件夹暂未改名";
        }
      } else {
        folderWarning = "，本地资料文件夹将在重新授权后同步改名";
      }
    }
    await setBoardData((current: any[]) => (Array.isArray(current) ? current.map((column: any) => ({ ...column, projects: (column.projects || []).map((project: any) => project.id === editingProject.id ? newProject : project) })) : current));
    setEditingProject(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `项目名称和编号已更新${folderWarning}` }));
  };

  const prepareLocalArchive = async (): Promise<{ provider: LocalFolderStorageProvider; needsSecondClick: boolean }> => {
    let provider = await getLocalArchiveProvider();
    const availability = await provider?.checkAvailability();
    if (provider && availability?.available) return { provider, needsSecondClick: false };

    if (provider && availability?.permission === "prompt") {
      const granted = await requestLocalArchivePermission();
      if (granted) return { provider, needsSecondClick: true };
    }

    // 浏览器首次写入本机文件系统时必须由用户授权一个总归档目录。
    // 这里只选择根目录；项目和阶段子目录由系统自动创建，用户无需手工整理。
    provider = await chooseLocalArchiveProvider();
    return { provider, needsSecondClick: true };
  };

  const handleUploadClick = async () => {
    try {
      const { provider, needsSecondClick } = await prepareLocalArchive();
      if (needsSecondClick) {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "总归档目录已授权，请再次点击按钮选择要移动的文件" }));
        return;
      }
      const picker = (window as any).showOpenFilePicker;
      if (!picker) throw new Error("archive_move_unsupported");
      const [sourceHandle] = await picker({ multiple: false });
      if (!sourceHandle) return;
      await archiveSelectedFile(await sourceHandle.getFile(), sourceHandle, provider);
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      const message = ["archive_picker_unsupported", "archive_move_unsupported"].includes(error?.message)
        ? "当前浏览器不支持剪切归档，请使用最新版 Chrome 或 Edge"
        : error?.message === "archive_source_delete_permission_required"
          ? "未获得原文件删除权限，本次未移动文件"
        : "无法访问本机归档目录，请重新选择总归档文件夹";
      window.dispatchEvent(new CustomEvent("show-toast", { detail: message }));
    }
  };

  const archiveSelectedFile = async (file: File, sourceHandle: any, provider: LocalFolderStorageProvider) => {
      if (!activeProj) return;
      const stage = STAGES.find(s => s.id === activeStage);
      if (!stage) return;

      const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
      const baseName = file.name.replace(new RegExp(`${ext.replace(".", "\\.")}$`), "");
      const expectedFile = stage.files.find((name) => {
        const cleanExpected = name.split("/").at(-1)?.replace(/\.[^.]+$/, "") || name.replace(/\.[^.]+$/, "");
        return baseName.includes(cleanExpected) || cleanExpected.includes(baseName);
      });
      const fileType = expectedFile ? expectedFile.replace(/\.[^.]+$/, "") : baseName;

      try {
        const availability = await provider?.checkAvailability();
        if (!provider || !availability?.available) throw new Error("archive_permission_required");
        const uploaded = await provider.moveFile({
          project: activeProj,
          stage,
          fileType,
          file,
          autoRename: appSettings?.fileManagement?.autoRename !== false,
          projectFolder: archiveFolderStates[activeProj.id]?.projectFolder,
        }, sourceHandle);

        const newFileObj = {
          name: uploaded.storedName,
          originalName: uploaded.originalName,
          uploadTime: formatUploadTime(uploaded.createdAt),
          version: uploaded.version,
          fileType,
          storageProvider: uploaded.storageProvider,
          storageKey: uploaded.storageKey,
          size: uploaded.size,
          contentType: uploaded.contentType,
          checksum: uploaded.checksum,
          createdAt: uploaded.createdAt,
          isCustom: true,
          archived: true,
        };
        
        setLifecycleStates(prev => {
          const currentStageState = (prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} };
          const currentFiles = Array.isArray(currentStageState.files) ? currentStageState.files : [];
          const alreadyIndexed = currentFiles.some((item: any) => item.storageKey === uploaded.storageKey || (item.checksum && item.checksum === uploaded.checksum));
          return {
            ...prev,
            [activeProj.id]: {
              ...(prev[activeProj.id] || {}),
              [activeStage]: { ...currentStageState, files: uploaded.wasSkipped && alreadyIndexed ? currentFiles : [...currentFiles, newFileObj] }
            }
          };
        });
        await setArchiveFolderStates((current) => ({
          ...current,
          [activeProj.id]: {
            status: "ready",
            storageProvider: "local-folder",
            projectFolder: uploaded.storageKey.split("/")[0],
            generatedThroughStageId: current[activeProj.id]?.generatedThroughStageId || stage.id,
            updatedAt: new Date().toISOString(),
          },
        }));
        
        window.dispatchEvent(new CustomEvent('show-toast', { detail: uploaded.wasSkipped ? "检测到重复文件：原位置已移除，归档中只保留一份" : `文件已移动到本机“${stage.name}”阶段资料夹，原位置不再保留，未上传服务器` }));
      } catch (error: any) {
        const message = error?.message === "archive_permission_required"
          ? "本机归档目录权限已失效，请重新点击上传并授权总归档文件夹"
          : error?.message === "archive_source_delete_permission_required"
            ? "未获得原文件删除权限，本次未移动文件"
            : error?.message === "archive_source_remove_failed"
              ? "无法删除原文件，已撤销目标文件，本次未完成移动"
              : error?.message === "archive_move_unsupported"
                ? "当前浏览器不支持剪切归档，请使用最新版 Chrome 或 Edge"
          : error?.message === "archive_file_exists"
            ? "同名文件已存在；请开启自动规范命名或调整文件名"
            : "文件保存失败，请检查本机归档目录权限";
        window.dispatchEvent(new CustomEvent('show-toast', { detail: message }));
      }
  };

  const handleSaveData = () => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '阶段数据已保存' }));
  };

  const openArchivedFile = (fileObj: any) => {
    if (fileObj.storageProvider === "local-folder" && fileObj.storageKey) {
      void openLocalArchiveFile(fileObj.storageKey).catch(() => {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "无法打开本机文件，请确认归档目录仍有访问权限" }));
      });
    } else if (fileObj.relativePath) {
      window.open(getProjectFileDownloadUrl(fileObj.relativePath), "_blank", "noopener");
    } else {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "这是待上传清单，请先选择真实文件归档" }));
    }
  };

  const updateChecklist = (checkId: string, checked: boolean) => {
    if(!activeProj) return;
    setLifecycleStates(prev => ({
      ...prev,
      [activeProj.id]: {
        ...(prev[activeProj.id] || {}),
        [activeStage]: {
          ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
          checklist: {
            ...((prev[activeProj.id] || {})[activeStage] || {}).checklist,
            [checkId]: checked
          }
        }
      }
    }));
  };

  const updateField = (fieldId: string, value: string) => {
    if(!activeProj) return;
    setLifecycleStates(prev => ({
      ...prev,
      [activeProj.id]: {
        ...(prev[activeProj.id] || {}),
        [activeStage]: {
          ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
          fields: {
            ...((prev[activeProj.id] || {})[activeStage] || {}).fields,
            [fieldId]: value
          }
        }
      }
    }));
  };

  const setProjectStage = (targetStageId: string, skipThroughIndex: number, reason = defaultSkipReason) => {
    if (!activeProj || !canManageStage) return;
    const targetIndex = STAGES.findIndex((stage) => stage.id === targetStageId);
    if (targetIndex < 0) return;
    setLifecycleStates((prev) => {
      const projectState = { ...(prev[activeProj.id] || {}) };
      for (let index = 0; index <= skipThroughIndex; index += 1) {
        const stageId = STAGES[index].id;
        if (stageId === targetStageId) continue;
        projectState[stageId] = {
          ...(projectState[stageId] || { checklist: {}, fields: {} }),
          status: "skipped",
          skipReason: reason,
          skippedAt: new Date().toISOString(),
          skippedBy: user?.name || user?.username || "项目经理",
        };
      }
      projectState.currentStageId = targetStageId;
      return { ...prev, [activeProj.id]: projectState };
    });
    setActiveStage(targetStageId);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `项目已定位到${STAGES[targetIndex].name.split(" ")[1]}，前置阶段标记为资料欠缺` }));
  };

  const skipActiveStage = () => {
    if (!activeProj || !canManageStage) return;
    const nextStage = STAGES[activeStageIndex + 1];
    if (!nextStage) {
      setLifecycleStates((prev) => ({
        ...prev,
        [activeProj.id]: {
          ...(prev[activeProj.id] || {}),
          [activeStage]: { ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }), status: "skipped", skipReason: defaultSkipReason, skippedAt: new Date().toISOString(), skippedBy: user?.name || user?.username || "项目经理" },
          currentStageId: activeStage,
        },
      }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前阶段已标记为资料欠缺" }));
      return;
    }
    setProjectStage(nextStage.id, activeStageIndex);
  };

  const restoreActiveStage = () => {
    if (!activeProj || !canManageStage) return;
    setLifecycleStates((prev) => {
      const projectState = { ...(prev[activeProj.id] || {}) };
      const restored = { ...(projectState[activeStage] || {}) };
      delete restored.status;
      delete restored.skipReason;
      delete restored.skippedAt;
      delete restored.skippedBy;
      projectState[activeStage] = restored;
      projectState.currentStageId = activeStage;
      return { ...prev, [activeProj.id]: projectState };
    });
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "阶段已恢复，可继续补充资料" }));
  };

  return (
    <div className="flex min-h-full md:h-full bg-[#f8fafc] animate-in fade-in duration-300">
      {/* Sidebar: Projects List */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0 z-[9998] shadow-sm relative">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 tracking-tight">
            <Folder className="w-5 h-5 text-indigo-600" />
            项目档案与流程
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setIsCreateProjectOpen(true)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="新增项目"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={onBack} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="返回多项目看板"><ArrowLeft className="h-4 w-4" /></button>
      </div>
      {editingProject && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000] isolate flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(event) => void saveProjectIdentity(event)} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">编辑项目</h3><p className="mt-1 text-xs text-slate-500">名称和编号会同步到本地归档目录。</p></div><button type="button" onClick={() => setEditingProject(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">×</button></div><div className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-700">项目名称<input name="name" defaultValue={editingProject.name || ""} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-500" /></label><label className="block text-sm font-medium text-slate-700">项目编号<input name="projectNumber" defaultValue={editingProject.projectNumber || ""} required pattern="PRJ-[0-9]{4,}" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono uppercase outline-none focus:border-indigo-500" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditingProject(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">取消</button><button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700">保存修改</button></div></form></div>}
    </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          <button type="button" onClick={() => setShowStageFilters((value) => !value)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left hover:bg-slate-50">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">项目列表筛选</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span>{stageFilter === "all" ? "全部项目" : STAGES.find((stage) => stage.id === stageFilter)?.name.split(" ")[1]?.split("(")[0]}</span><ChevronDown className={cn("h-4 w-4 transition-transform", showStageFilters && "rotate-180")} /></span>
          </button>
          {showStageFilters && <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            <button onClick={() => setStageFilter("all")} className={cn("px-2.5 py-1 rounded-full text-[11px] border", stageFilter === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200")}>全部项目</button>
            {STAGES.map(stage => <button key={stage.id} onClick={() => setStageFilter(stage.id)} className={cn("px-2.5 py-1 rounded-full text-[11px] border", stageFilter === stage.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200")}>{stage.name.split(" ")[1]?.split("(")[0]}</button>)}
          </div>}
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">进行中的项目 ({visibleProjects.length})</div>
          {visibleProjects.map((p: any) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className={cn(
                "w-full flex flex-col text-left px-4 py-3 rounded-xl transition-all duration-200 border",
                selectedProject === p.id 
                  ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                  : "bg-white border-slate-100 hover:border-indigo-100 hover:bg-slate-50"
              )}
            >
              <div className={cn("font-medium text-sm truncate mb-1.5", selectedProject === p.id ? "text-indigo-900" : "text-slate-900")}>
                {p.name}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{p.projectNumber}</span>
                {p.manager && <span>{p.manager}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 md:h-full md:overflow-hidden bg-white">
        {activeProj ? (
          <>
            <div className="p-4 md:p-6 bg-slate-50/50 border-b border-slate-200 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 md:hidden"><ArrowLeft className="h-3.5 w-3.5" />返回多项目看板</button>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{activeProj.name}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md text-xs font-medium">项目编号: {getProjectNumber(activeProj)}</span>
                    {activeProj.manager && <span className="text-slate-500 text-sm flex items-center gap-1.5"><Briefcase className="w-4 h-4" />负责人: {activeProj.manager}</span>}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <select value={selectedProject || ""} onChange={(event) => selectProject(event.target.value)} className="md:hidden w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none" aria-label="选择项目">
                    {visibleProjects.map((project: any) => <option key={project.id} value={project.id}>{project.projectNumber} · {project.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setEditingProject({ ...activeProj, projectNumber: getProjectNumber(activeProj) })} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-600">编辑项目</button>
                  <button type="button" onClick={() => onOpenProjectDetail?.(activeProj.id)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-600"><Eye className="h-4 w-4" />项目详情</button>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
              {/* Stages Timeline */}
              <div className="w-full md:w-64 bg-slate-50/80 border-b md:border-b-0 md:border-r border-slate-200 p-3 md:p-4 overflow-x-auto md:overflow-y-auto shrink-0 flex flex-row md:flex-col gap-2 md:gap-1 custom-scrollbar">
                <div className="hidden md:block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 pt-2">项目流程进度（归档清单）</div>
                {STAGES.map((stage, idx) => {
                  const isActive = activeStage === stage.id;
                  const timelineStageState = projState[stage.id] || {};
                  const isSkipped = timelineStageState.status === "skipped";
                  const isCompleted = !isSkipped && currentStageIndex > idx;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveStage(stage.id)}
                      className={cn(
                        "min-w-[9rem] md:min-w-0 md:w-full text-left px-3 py-3 rounded-lg flex gap-3 transition-colors duration-200 border md:mt-1",
                        isActive ? "bg-white border-indigo-200 shadow-sm" : "border-transparent hover:bg-slate-100/80"
                      )}
                    >
                      <div className="shrink-0 pt-0.5 relative z-10 bg-inherit">
                        {isSkipped ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700"><SkipForward className="h-3.5 w-3.5" /></div>
                        ) : isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 bg-white rounded-full" />
                        ) : isActive ? (
                          <div className="w-5 h-5 rounded-full border-2 border-indigo-600 flex items-center justify-center bg-white">
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300 bg-white" />
                        )}
                      </div>
                      <div className="flex-1 relative z-10">
                        <div className={cn(
                          "text-sm font-bold flex items-center gap-1.5 leading-tight",
                          isActive ? "text-indigo-700" : "text-slate-700"
                        )}>
                          {stage.name.split(' ')[1]}
                        </div>
                        {isSkipped && <div className="mt-1 text-[10px] font-semibold text-amber-700">资料欠缺 · 已跳过</div>}
                        {stage.requiresAuth && (
                          <div className="text-[10px] mt-1 text-rose-500 flex items-center gap-1 font-medium bg-rose-50 w-max px-1.5 py-0.5 rounded border border-rose-100">
                            <Shield className="w-3 h-3" /> 高权限要求
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Stage Details */}
              <div className="flex-1 bg-white p-4 md:p-8 md:overflow-y-auto w-full min-w-0 custom-scrollbar">
                {(() => {
                  const stage = STAGES.find(s => s.id === activeStage)!;
                  return (
                    <div className="max-w-4xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8 pb-4 border-b border-slate-100">
                        <div className="min-w-0">
                          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            {stage.name}
                          </h2>
                          <p className="text-slate-500 text-sm mt-2 flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                            {stage.desc}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {stage.id === "1_initiation" && <button onClick={() => onOpenSiteSurvey?.(activeProj.id, latestProjectSurvey?.id)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"><Camera className="h-4 w-4" />{latestProjectSurvey ? "查看现场勘察报告" : "现场勘察"}{activeProjectSurveys.length > 0 ? `（${activeProjectSurveys.length}）` : ""}</button>}
                          {canManageStage && isStageSkipped && <button type="button" onClick={restoreActiveStage} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"><RotateCcw className="h-4 w-4" />恢复此阶段</button>}
                          {canManageStage && !isStageSkipped && activeStageIndex === currentStageIndex && <button type="button" onClick={skipActiveStage} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"><SkipForward className="h-4 w-4" />跳过此阶段</button>}
                          {canManageStage && !isStageSkipped && activeStageIndex > currentStageIndex && <button type="button" onClick={() => setProjectStage(activeStage, activeStageIndex - 1)} className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"><ArrowRight className="h-4 w-4" />将项目定位到本阶段</button>}
                          <button 
                            onClick={handleUploadClick}
                            disabled={isStageSkipped}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
                          >
                            <Upload className="w-4 h-4" />
                            选择本机文件并移动归档
                          </button>
                        </div>
                      </div>

                      <p className="-mt-4 mb-6 text-xs text-slate-500">系统会把原文件移动到本机当前项目的“{stage.name}”阶段文件夹，原位置不再保留，也不会上传服务器。</p>

                      {isStageSkipped && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><div className="flex items-center gap-2 font-bold"><SkipForward className="h-4 w-4" />本阶段已跳过 · 资料欠缺</div><p className="mt-1 text-xs">原因：{stageState.skipReason || defaultSkipReason}。恢复阶段后即可继续上传资料和填写表单。</p></div>}

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-6">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-indigo-500" />
                            阶段任务与表单
                          </h3>
                        </div>
                        <div className="p-6">
                          {(!stage.checklist || stage.checklist.length === 0) && (!stage.fields || stage.fields.length === 0) ? (
                            <div className="text-slate-400 text-sm py-4 text-center">本阶段无需填写表单或待办</div>
                          ) : (
                            <div className="space-y-6">
                          {stage.checklist && stage.checklist.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-slate-400" />前置工作清单
                                  </h4>
                                  <div className="space-y-2">
                                    {getLifecycleChecklist(stage, stageState, true, projState).map((item: any) => (
                                      <label key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors">
                                        <input 
                                          type="checkbox" 
                                          className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                          checked={item.id === "site-survey" ? activeProjectSurveys.length > 0 : (stageState.checklist?.[item.id] || false)}
                                          onChange={(e) => updateChecklist(item.id, e.target.checked)}
                                          disabled={isStageSkipped || (item.id === "site-survey" && activeProjectSurveys.length > 0)}
                                        />
                                        <span className={cn("text-sm transition-colors", (item.id === "site-survey" ? activeProjectSurveys.length > 0 : stageState.checklist?.[item.id]) ? "text-slate-400 line-through" : "text-slate-700 font-medium")}>{item.label}{item.id === "site-survey" && activeProjectSurveys.length > 0 ? `（已归档 ${activeProjectSurveys.length} 次）` : ""}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {stage.fields && stage.fields.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-slate-400" />阶段数据录入
                                  </h4>
                                  <div className="space-y-4">
                                    {stage.fields.map((field: any) => (
                                      <div key={field.id}>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                                        {field.type === 'select' ? (
                                          <select
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
                                            disabled={isStageSkipped}
                                          >
                                            <option value="">{field.placeholder || "请选择"}</option>
                                            {(field.options || []).map((option: string) => <option key={option} value={option}>{option}</option>)}
                                          </select>
                                        ) : field.type === 'textarea' ? (
                                          <textarea 
                                            rows={3} 
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none text-sm"
                                            placeholder={field.placeholder}
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
                                            disabled={isStageSkipped}
                                          />
                                        ) : (
                                          <input 
                                            type="text" 
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                                            placeholder={field.placeholder}
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
                                            disabled={isStageSkipped}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Folder className="w-4 h-4 text-indigo-500" />
                            阶段归档文件
                          </h3>
                        </div>
                        
                        {stageFiles.length === 0 ? (
                          <div className="px-6 py-16 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                            <Folder className="w-16 h-16 mb-4 text-slate-200 fill-slate-100" />
                            <p className="text-base font-medium text-slate-600">该阶段暂无对应归档资料</p>
                            <p className="text-sm mt-1">请项目经理和审核人员及时上传相关过程文件进行记录</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {(() => {
                              return stageFiles.map((fileObj: any, i: number) => {
                                const fileName = fileObj.name;
                                const isPdf = fileName.endsWith('.pdf');
                                const isDwg = fileName.endsWith('.dwg');
                                const isXlsx = fileName.endsWith('.xlsx');
                                const isZip = fileName.endsWith('.zip');
                                const isVideo = fileName.endsWith('.mp4');
                                
                                let FileIcon = FileText;
                                let iconColor = "text-indigo-600";
                                let bgColor = "bg-indigo-50";
                                let borderColor = "border-indigo-100";
                                
                                if (isPdf) { iconColor = "text-rose-600"; bgColor = "bg-rose-50"; borderColor = "border-rose-100"; }
                                if (isDwg) { iconColor = "text-blue-600"; bgColor = "bg-blue-50"; borderColor = "border-blue-100"; }
                                if (isXlsx) { iconColor = "text-emerald-600"; bgColor = "bg-emerald-50"; borderColor = "border-emerald-100"; }
                                if (isZip) { iconColor = "text-amber-600"; bgColor = "bg-amber-50"; borderColor = "border-amber-100"; }
                                
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => openArchivedFile(fileObj)}
                                    className="group flex w-full items-center justify-between p-4 text-left bg-white hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 transition-colors"
                                    aria-label={`打开文件 ${fileObj.originalName || fileName}`}
                                    title="点击调用电脑打开文件"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm", bgColor, borderColor, iconColor)}>
                                        <FileIcon className="w-6 h-6" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{fileName}</p>
                                          {fileObj.version && (
                                            <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono text-slate-500 font-bold">
                                              {fileObj.version}
                                            </span>
                                          )}
                                        </div>
                                        {fileObj.originalName && (
                                          <p className="text-xs text-slate-500 mt-1">原始文件：{fileObj.originalName}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                          <span>{fileObj.uploadTime}</span>
                                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600 font-sans font-medium">已归档</span></span>
                                          {fileObj.relativePath && <span className="font-sans text-slate-500">位置：{fileObj.relativePath}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <span className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs font-medium text-indigo-600 transition-colors group-hover:bg-indigo-100">
                                      <Eye className="w-4 h-4" /> 打开文件
                                    </span>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <Folder className="w-20 h-20 mb-4 text-slate-200 fill-slate-100" />
            <p className="text-xl font-bold text-slate-600">{requestedProject.conflict ? "项目编号存在冲突" : initialProjectReference ? "未找到指定项目" : "暂无项目数据"}</p>
            <p className="text-sm mt-2">{requestedProject.conflict ? `编号 ${initialProjectReference} 对应多个项目，请先处理编号冲突` : initialProjectReference ? `项目编号或旧链接 ${initialProjectReference} 无法匹配当前项目` : "请先在多项目看板中创建项目，这里将统一管理各项目的9个流程与档案"}</p>
            <button type="button" onClick={onBack} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">返回多项目看板</button>
          </div>
        )}
      </div>
      {isCreateProjectOpen && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10001] isolate flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(event) => void createProject(event)} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">全生命周期新增项目</h3><p className="mt-1 text-xs text-slate-500">创建后项目会进入项目立项阶段。</p></div><button type="button" onClick={() => setIsCreateProjectOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">×</button></div><div className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-700">项目名称<input name="name" required autoFocus className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-500" placeholder="请输入项目名称" /></label><div className="grid grid-cols-2 gap-4"><label className="block text-sm font-medium text-slate-700">项目类型<select name="type" defaultValue="光伏项目" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"><option>光伏项目</option><option>储能项目</option><option>充电桩项目</option><option>零碳园区</option><option>节能改造</option></select></label><label className="block text-sm font-medium text-slate-700">合作模式<select name="businessModel" defaultValue="EPC" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"><option>EPC</option><option>EMC</option></select></label></div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsCreateProjectOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">取消</button><button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700">创建项目</button></div></form></div>}
    </div>
  );
}
