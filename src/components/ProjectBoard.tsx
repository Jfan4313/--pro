import React, { useState, useEffect, useMemo } from "react";
import { MoreHorizontal, Clock, AlertTriangle, CheckCircle2, X, Eye, Edit2, Save, ShoppingCart, ExternalLink, ShieldAlert, Plus, FileText, Archive, RotateCcw } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useUserSettings } from "@/src/hooks/useUserSettings";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { STAGES, getProjectCurrentStageInfo } from "@/src/lib/projectLifecycle";
import { getProjectNumber } from "@/src/lib/management";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { getProjectNameConflicts, hasProjectIdentityConflict, isValidProjectNumber, normalizeProjectNumber, sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { ArchiveFolderState, getArchiveProjectFolder, getCurrentAndNextStages, getLocalArchiveProvider } from "@/src/lib/archiveStorage";
import { useAuth } from "@/src/lib/auth";
import { apiClient } from "@/src/lib/apiClient";

const statusConfig = {
  normal: { icon: Clock, color: "text-slate-400", tooltip: "进度正常" },
  warning: { icon: AlertTriangle, color: "text-amber-500", tooltip: "存在风险" },
  delayed: { icon: AlertTriangle, color: "text-rose-500", tooltip: "已延期" },
  success: { icon: CheckCircle2, color: "text-emerald-500", tooltip: "已完成" },
};

const typeColors: Record<string, string> = {
  "光伏项目": "bg-amber-100 text-amber-700 border-amber-200",
  "绿色建筑": "bg-pink-100 text-pink-700 border-pink-200",
  "市政景观": "bg-teal-100 text-teal-700 border-teal-200",
  "储能系统": "bg-purple-100 text-purple-700 border-purple-200",
  "智能微电网": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "光伏发电": "bg-amber-100 text-amber-700 border-amber-200",
  "风力发电": "bg-blue-100 text-blue-700 border-blue-200",
  "综合能源": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "储能项目": "bg-purple-100 text-purple-700 border-purple-200",
  "充电桩项目": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "零碳园区": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "节能改造": "bg-orange-100 text-orange-700 border-orange-200",
};
const projectTypes = ["光伏项目", "储能项目", "充电桩项目", "零碳园区", "节能改造"];
const businessModels = ["EPC", "EMC"];

export function ProjectBoard({ onOpenProject, onOpenProjectDetail }: { onOpenProject?: (projectId: string) => void; onOpenProjectDetail?: (projectId: string) => void }) {
  const { user } = useAuth();
  const [data, setData, boardLoading, boardSeed] = useProjectBoardData();
  const [supplyOrders] = useSyncedAppData("supplyOrders", []);
  const [personnelData] = useSyncedAppData("personnelData", []);
  const [scheduleData] = useSyncedAppData("scheduleData", []);
  const [lifecycleStates, setLifecycleStates] = useSyncedAppData("projectLifecycleStates", {});
  const [appSettings] = useUserSettings<any>({});
  const [archivedProjects, setArchivedProjects] = useSyncedAppData<any[]>("projectArchive", []);
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const { allProjects, conflicts: projectNumberConflicts, reserveProjectNumber, resetProjectNumbering } = useProjectNumbering();
  const projectNameConflicts = useMemo(() => getProjectNameConflicts(allProjects), [allProjects]);

  const getConstructProgress = (project: any) => {
    const projectSchedule = scheduleData.find((s: any) => s.id === project.id || s.name === project.name || (project.name && s.name && s.name.includes(project.name)));
    if (projectSchedule && projectSchedule.tasks && projectSchedule.tasks.length > 0) {
      const tasks = projectSchedule.tasks;
      let score = 0;
      tasks.forEach((t: any) => {
        if (t.status === 'completed') score += 100;
        else if (t.status === 'in-progress') score += 50;
      });
      return Math.round(score / tasks.length);
    }
    return project.constructProgress || 0;
  };

  const getSupplyProgress = (project: any) => {
    if (!supplyOrders || supplyOrders.length === 0) return project.supplyProgress || 0;
    const pOrders = supplyOrders.filter((o: any) => o.projectId === project.id || (o.projectName && project.name && o.projectName === project.name));
    if (pOrders.length === 0) return project.supplyProgress || 0;
    let score = 0;
    pOrders.forEach((o: any) => {
      if (o.status === 'delivered') score += 100;
      else if (o.status === 'in-transit') score += 50;
      else score += 10;
    });
    return Math.round(score / pOrders.length);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectScope, setProjectScope] = useState<"all" | "mine">("all");
  const [projectManagers, setProjectManagers] = useState<any[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    apiClient.listAccountDirectory().then((accounts) => {
      if (!cancelled) setProjectManagers(accounts.filter((account: any) => ["project_manager", "company_admin", "admin"].includes(account.role)));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const isMyProject = (project: any) => project.managerId === user?.id || (!project.managerId && project.manager === user?.name);
  const visibleProjects = (projects: any[]) => projectScope === "all" ? projects : projects.filter(isMyProject);

  const archiveProject = (project: any) => {
    if (!window.confirm(`确定归档项目“${project.name}”吗？归档不会删除项目资料、合同、日程或成本记录。`)) return;
    void setData((currentData: any[]) => currentData.map((column: any) => ({ ...column, projects: (column.projects || []).filter((item: any) => item.id !== project.id) })));
    void setArchivedProjects((current: any[]) => [{ ...project, archiveStatus: "archived", archivedAt: new Date().toISOString() }, ...current.filter((item: any) => item.id !== project.id)]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目已归档，业务资料仍然保留" }));
  };

  const restoreArchivedProject = (project: any) => {
    const targetColumn = STAGES[0].id;
    void setData((currentData: any[]) => currentData.map((column: any) => column.id === targetColumn ? { ...column, projects: [{ ...project, archiveStatus: undefined, archivedAt: undefined }, ...(column.projects || [])] } : column));
    void setArchivedProjects((current: any[]) => current.filter((item: any) => item.id !== project.id));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目已恢复到项目立项阶段" }));
  };

  const archiveSelectedProjects = () => {
    if (selectedProjectIds.length === 0 || !window.confirm(`确定归档选中的 ${selectedProjectIds.length} 个项目吗？`)) return;
    const selected = (Array.isArray(data) ? data : boardSeed).flatMap((column: any) => column.projects || []).filter((project: any) => selectedProjectIds.includes(project.id));
    void setData((currentData: any[]) => currentData.map((column: any) => ({ ...column, projects: (column.projects || []).filter((project: any) => !selectedProjectIds.includes(project.id)) })));
    void setArchivedProjects((current: any[]) => [...selected.map((project: any) => ({ ...project, archiveStatus: "archived", archivedAt: new Date().toISOString() })), ...current.filter((project: any) => !selectedProjectIds.includes(project.id))]);
    setSelectedProjectIds([]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `已归档 ${selected.length} 个项目` }));
  };

  const clearAllProjects = async () => {
    const count = allProjects.length;
    if (!count || !window.confirm(`确认清空全部 ${count} 个项目记录吗？\n\n只删除系统中的项目记录、项目阶段状态和归档状态；本地资料根目录中的文件和文件夹不会删除。`)) return;
    await setData(boardSeed);
    await setArchivedProjects([]);
    await setLifecycleStates({});
    await setArchiveFolderStates({});
    await resetProjectNumbering();
    setSelectedProjectIds([]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "已清空项目记录，本地资料文件未删除" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = String(formData.get('name') || "").trim().replace(/\s+/g, " ");
    if (!name) return;
    if (hasProjectIdentityConflict(allProjects, { name }).nameConflict) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `项目名称“${name}”已存在，请修改名称或编辑原项目` }));
      return;
    }
    const projectNumber = await reserveProjectNumber();
    const managerId = formData.get('managerId') as string;
    const selectedManager = projectManagers.find((manager) => manager.id === managerId);

    const newProject = {
      id: `p${Date.now()}`,
      projectNumber,
      name,
      type: formData.get('type') as string,
      businessModel: formData.get('businessModel') as string,
      manager: selectedManager?.name || "",
      managerId,
      constructProgress: 0,
      supplyProgress: 0,
      status: "normal"
    };

    setData((prevData: any) => {
      const currentData = Array.isArray(prevData) && prevData.length > 0 ? prevData : boardSeed;
      const newData = [...currentData];
      const firstColId = STAGES[0].id;
      let planningColIndex = newData.findIndex(c => c.id === firstColId);
      
      // Fallback if structured data is too old
      if (planningColIndex === -1) planningColIndex = 0;
      
      if (planningColIndex !== -1 && newData[planningColIndex]) {
        const planningCol = { ...newData[planningColIndex] };
        planningCol.projects = sortProjectsNaturally([newProject, ...(planningCol.projects || [])]);
        planningCol.count = planningCol.projects.length;
        newData[planningColIndex] = planningCol;
      }
      return newData;
    });

    const pendingState: ArchiveFolderState = {
      status: "pending",
      storageProvider: "local-folder",
      updatedAt: new Date().toISOString(),
    };
    await setArchiveFolderStates((current) => ({ ...current, [newProject.id]: pendingState }));

    if (appSettings?.fileManagement?.autoCreateFolders === false) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '项目已创建；自动生成资料夹当前已关闭' }));
    } else void getLocalArchiveProvider().then(async (provider) => {
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '项目已创建；本机归档目录未授权，已记录为待生成' }));
        return;
      }
      try {
        const result = await provider.ensureProjectStructure(newProject, STAGES);
        await setArchiveFolderStates((current) => ({
          ...current,
          [newProject.id]: {
            status: "ready",
            storageProvider: "local-folder",
            projectFolder: result.projectFolder,
            generatedThroughStageId: result.generatedThroughStageId,
            updatedAt: new Date().toISOString(),
          },
        }));
      } catch (error: any) {
        await setArchiveFolderStates((current) => ({
          ...current,
          [newProject.id]: { ...pendingState, status: "error", error: error?.message || "archive_structure_failed", updatedAt: new Date().toISOString() },
        }));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '项目已创建，但本机资料夹生成失败，可在项目资料中重试' }));
      }
    });

    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '新建项目成功' }));
  };

  // Sync board columns with lifecycle stages automatically
  React.useEffect(() => {
    // The hook starts with empty structural columns while it loads the remote
    // company board. Never persist those placeholders over real project data.
    if (boardLoading || !data || !Array.isArray(data) || data.length === 0) return;

    let hasChanges = false;
    const allProj = data.flatMap(c => c.projects || []);
    const projectToStage = new Map();
    
    allProj.forEach(p => {
       projectToStage.set(p.id, getProjectCurrentStageInfo(p.id, lifecycleStates as any).stage.id);
    });

    const alignedData = STAGES.map(stage => {
      return {
        id: stage.id,
        title: stage.name.split(' ')[1] || stage.name,
        count: 0,
        projects: [] as any[]
      };
    });

    const pushedIds = new Set();
    
    data.forEach(col => {
       const targetId = STAGES.find(s => s.id === col.id)?.id;
       if (targetId && col.projects) {
          col.projects.forEach((p: any) => {
             const derivedStageId = projectToStage.get(p.id);
             if (derivedStageId === targetId) {
                const targetCol = alignedData.find(c => c.id === targetId);
                if (targetCol && !pushedIds.has(p.id)) {
                   targetCol.projects.push(p);
                   pushedIds.add(p.id);
                }
             }
          });
       }
    });

    allProj.forEach(p => {
       if (!pushedIds.has(p.id)) {
          const derivedStageId = projectToStage.get(p.id);
          const targetCol = alignedData.find(c => c.id === derivedStageId);
          if (targetCol) {
             targetCol.projects.push(p);
             pushedIds.add(p.id);
             hasChanges = true;
          }
       }
    });

    alignedData.forEach(c => c.count = c.projects.length);

    const columnsMatch = data.length === STAGES.length && data.every((c, i) => c.id === STAGES[i].id);
    
    if (hasChanges || !columnsMatch) {
       setData(alignedData);
    }
  }, [boardLoading, data, lifecycleStates, setData]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    
    const normalizedProject = { ...editingProject, name: String(editingProject.name || "").trim().replace(/\s+/g, " "), projectNumber: normalizeProjectNumber(editingProject.projectNumber) };
    if (!normalizedProject.name) return;
    if (!isValidProjectNumber(normalizedProject.projectNumber)) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '项目编号格式应为 PRJ-0001' }));
      return;
    }
    const conflict = hasProjectIdentityConflict(allProjects, normalizedProject);
    if (conflict.nameConflict || conflict.numberConflict) {
      const conflictProject = conflict.numberConflict
        ? allProjects.find((project: any) => String(project.id) !== String(normalizedProject.id) && normalizeProjectNumber(project.projectNumber || project.code) === normalizedProject.projectNumber)
        : allProjects.find((project: any) => String(project.id) !== String(normalizedProject.id) && String(project.name || "").trim().toLocaleLowerCase() === normalizedProject.name.toLocaleLowerCase());
      const archivedLabel = conflictProject && archivedProjects.some((project: any) => project.id === conflictProject.id) ? "（已归档）" : "";
      window.dispatchEvent(new CustomEvent('show-toast', { detail: conflict.nameConflict ? `项目名称“${normalizedProject.name}”已存在：${conflictProject?.name || "已有项目"}${archivedLabel}` : `项目编号“${normalizedProject.projectNumber}”已存在：${conflictProject?.name || "已有项目"}${archivedLabel}。请打开“项目归档”查看` }));
      return;
    }
    const isArchived = archivedProjects.some((project: any) => project.id === normalizedProject.id);
    const oldFolder = archiveFolderStates[normalizedProject.id]?.projectFolder;
    const nextFolder = getArchiveProjectFolder(normalizedProject);
    if (oldFolder && oldFolder !== nextFolder) {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '归档目录未授权，暂不能同步修改资料文件夹编号' }));
        return;
      }
      try {
        await provider.renameProjectFolder(oldFolder, nextFolder);
        await setArchiveFolderStates((current) => ({ ...current, [normalizedProject.id]: { ...current[normalizedProject.id], projectFolder: nextFolder, updatedAt: new Date().toISOString() } }));
        await setLifecycleStates((current: any) => Object.fromEntries(Object.entries(current || {}).map(([projectId, projectState]: [string, any]) => [projectId, projectId === normalizedProject.id ? Object.fromEntries(Object.entries(projectState || {}).map(([stageId, stageState]: [string, any]) => [stageId, { ...stageState, files: Array.isArray(stageState?.files) ? stageState.files.map((file: any) => ({ ...file, storageKey: String(file.storageKey || '').replace(`${oldFolder}/`, `${nextFolder}/`) })) : stageState?.files }])) : projectState])));
      } catch (error: any) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: error?.code === 'archive_target_exists' ? '新编号对应的资料文件夹已存在，请先处理重复文件夹' : '资料文件夹编号同步失败，项目编号未修改' }));
        return;
      }
    }
    setData((prevData: any) => {
      const currentData = Array.isArray(prevData) && prevData.length > 0 ? prevData : boardSeed;
      return currentData.map((col: any) => ({
        ...col,
        projects: sortProjectsNaturally(col.projects.map((p: any) => p.id === normalizedProject.id ? normalizedProject : p))
      }));
    });
    if (isArchived) void setArchivedProjects((current: any[]) => sortProjectsNaturally(current.map((project: any) => project.id === normalizedProject.id ? normalizedProject : project)));
    
    setEditingProject(null);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '项目信息已更新' }));
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 shrink-0 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">多项目看板</h2>
          <p className="text-slate-500 text-xs md:text-sm mt-1">全局监控各项目的所处阶段、施工与采购进度</p>
        </div>
        <div className="flex gap-2 md:gap-3 items-center">
          <select value={projectScope} onChange={(event) => setProjectScope(event.target.value as "all" | "mine")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <option value="all">公司全部项目</option>
            <option value="mine">我负责的项目</option>
          </select>
          <button type="button" onClick={() => setShowArchive((value) => !value)} className={cn("px-3 py-2 rounded-lg text-xs font-semibold border", showArchive ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600")}>项目归档 ({archivedProjects.length})</button>
          {selectedProjectIds.length > 0 && <button type="button" onClick={archiveSelectedProjects} className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold">归档选中 ({selectedProjectIds.length})</button>}
          <button type="button" onClick={() => void clearAllProjects()} className="px-3 py-2 text-rose-500 hover:text-rose-700 text-xs font-medium transition-colors hidden md:block">清空项目记录</button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 w-full md:w-auto text-center flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </div>

      {(projectNumberConflicts.length > 0 || projectNameConflicts.length > 0) && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{projectNumberConflicts.length > 0 && <div>重复项目编号：{projectNumberConflicts.map((item) => item.projectNumber).join("、")}。重复编号暂不可用于跳转。</div>}{projectNameConflicts.length > 0 && <div>重复项目名称：{projectNameConflicts.map((item) => item.projectName).join("、")}。请逐项点击编辑修正，系统不会自动合并或删除。</div>}</div>}

      {showArchive && <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-indigo-900">已有项目归档</h3><p className="mt-1 text-xs text-indigo-700">归档项目也可以修改名称和编号，修改不会移动项目资料。</p></div><Archive className="h-5 w-5 text-indigo-500" /></div>{archivedProjects.length === 0 ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-500">暂无已归档项目</p> : <div className="mt-3 grid gap-2 md:grid-cols-2">{sortProjectsNaturally(archivedProjects).map((project: any) => <div key={project.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{project.name}</p><p className="mt-1 text-xs text-slate-400">{getProjectNumber(project)} · 归档于 {project.archivedAt?.slice(0, 10) || "-"}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => setEditingProject(project)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Edit2 className="h-3.5 w-3.5" />编辑</button><button type="button" onClick={() => restoreArchivedProject(project)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><RotateCcw className="h-3.5 w-3.5" />恢复</button></div></div>)}</div>}</div>}

      <div className="flex-1 overflow-y-auto pb-4 custom-scrollbar">
        <div className="grid grid-cols-1 gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {(Array.isArray(data) && data.length > 0 ? data : boardSeed).map((column) => (
            <div 
              key={column.id} 
              className="min-h-[360px] flex flex-col bg-slate-50/50 rounded-2xl border border-slate-200/60 p-3 md:p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-5 px-1 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]",
                    column.id === 'planning' ? "bg-slate-400" :
                    column.id === 'procurement' ? "bg-blue-400" :
                    column.id === 'construction' ? "bg-amber-400" :
                    "bg-emerald-400"
                  )} />
                  <h3 className="font-bold text-slate-800 text-sm md:text-base tracking-tight uppercase text-[11px] font-mono opacity-80">
                    {column.title}
                  </h3>
                  <span className="ml-1 bg-slate-200/50 text-slate-500 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200/50">
                    {visibleProjects(column.projects || []).length.toString().padStart(2, '0')}
                  </span>
                </div>
                <button className="text-slate-300 hover:text-slate-500 p-1 hover:bg-slate-100 rounded-md transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 md:space-y-4 pr-1 pb-10 custom-scrollbar scroll-smooth">
                {Array.isArray(column.projects) && visibleProjects(sortProjectsNaturally(column.projects)).map((project) => {
                  const config = statusConfig[project.status as keyof typeof statusConfig] || statusConfig.normal;
                  const StatusIcon = config.icon;
                  const statusColor = config.color;
                  const statusTooltip = config.tooltip;
                  
                  const hasSafetyRisk = personnelData.some((person: any) => 
                    !person.safetyTrained && 
                    (person.name === project.manager || (person.projects && person.projects.some((p: any) => p.name === project.name)))
                  );
                  
                  return (
                    <div 
                      key={project.id} 
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenProject?.(project.id)}
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenProject?.(project.id); } }}
                      className={cn(
                        "bg-white p-5 rounded-2xl border shadow-sm transition-all cursor-pointer relative group overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-400",
                        "border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5",
                        hasSafetyRisk ? "border-rose-200 shadow-rose-100/50" : ""
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <input type="checkbox" checked={selectedProjectIds.includes(project.id)} onChange={(e) => { e.stopPropagation(); setSelectedProjectIds((current) => e.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id)); }} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600" aria-label={`选择归档项目 ${project.name}`} />
                        {project.type && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border", typeColors[project.type] || "bg-slate-100 text-slate-700 border-slate-200")}>
                          {project.type}
                        </span>}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onOpenProjectDetail?.(project.id); }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" 
                              title="查看详情"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingProject(project); }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" 
                              title="编辑"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); archiveProject(project); }} className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="归档项目"><Archive className="w-3.5 h-3.5" /></button>
                          </div>
                          {hasSafetyRisk && (
                            <div title="存在安全培训未完成人员" className="text-rose-500 bg-rose-50 p-1 rounded-md border border-rose-100 animate-pulse">
                              <ShieldAlert className="w-4 h-4" />
                            </div>
                          )}
                          <div title={statusTooltip}>
                            <StatusIcon className={cn("w-4 h-4", statusColor)} />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 mb-2">
                        <h4 className="font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">{project.name}</h4>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">{getProjectNumber(project)}</span>
                        {project.businessModel && <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{project.businessModel}</span>}
                      </div>
                      
                      {(() => {
                        const lifecycleInfo = getProjectCurrentStageInfo(project.id, lifecycleStates as any);
                        return (
                          <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-lg p-2 mb-4">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-[10px] font-bold text-indigo-700 truncate" title={lifecycleInfo.stage.name}>
                                {lifecycleInfo.stage.name.split(' ')[1]}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0 ml-2">{lifecycleInfo.progressPercent}%</span>
                          </div>
                        );
                      })()}
                      
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100/60">
                        {project.manager && <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {project.manager?.charAt(0) || '?'}
                          </div>
                          <span className="text-[11px] font-medium text-slate-500">{project.manager}</span>
                        </div>}
                        <div className="flex items-center gap-2">
                          {(() => {
                            const projectOrders = supplyOrders.filter((o: any) => o.projectId === project.id);
                            if (projectOrders.length > 0) {
                              return (
                                <div className="flex items-center gap-1 text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50" title={`${projectOrders.length} 个关联采购单`}>
                                  <ShoppingCart className="w-3 h-3" />
                                  <span className="text-[10px] font-bold">{projectOrders.length}</span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新建项目</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">项目名称</label>
                <input name="name" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入项目名称" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">项目类型</label>
                <select name="type" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                  {projectTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">合作模式</label>
                <select name="businessModel" className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="EPC">EPC</option><option value="EMC">EMC</option></select>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目经理</label>
                    <select name="managerId" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" defaultValue="">
                      <option value="">暂不指定</option>
                      {projectManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}（{manager.username}）</option>)}
                    </select>
                    <input type="hidden" name="manager" value="" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Drawer */}
      {editingProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">编辑项目信息</h3>
              <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <form id="edit-project-form" onSubmit={handleEditSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目编号</label>
                  <input
                    type="text"
                    required
                    value={editingProject.projectNumber || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, projectNumber: e.target.value.toLocaleUpperCase() })}
                    onBlur={(e) => setEditingProject({ ...editingProject, projectNumber: normalizeProjectNumber(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="PRJ-0001"
                  />
                  <p className="mt-1 text-xs text-slate-400">编号必须唯一，保存后项目列表将按编号重新排序；不会自动重命名本机归档文件夹。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目名称</label>
                  <input 
                    type="text" 
                    required 
                    value={editingProject.name}
                    onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目类型</label>
                  <select 
                    value={editingProject.type}
                    onChange={(e) => setEditingProject({...editingProject, type: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  >
                    {projectTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合作模式</label>
                  <select value={editingProject.businessModel || "EPC"} onChange={(e) => setEditingProject({...editingProject, businessModel: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">
                    {businessModels.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目经理</label>
                    <select value={editingProject.managerId || ""} onChange={(e) => { const manager = projectManagers.find((item) => item.id === e.target.value); setEditingProject({...editingProject, managerId: manager?.id || "", manager: manager?.name || ""}); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">暂不指定</option>
                      {projectManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}（{manager.username}）</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目状态</label>
                  <select 
                    value={editingProject.status}
                    onChange={(e) => setEditingProject({...editingProject, status: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  >
                    <option value="normal">进度正常</option>
                    <option value="warning">存在风险</option>
                    <option value="delayed">已延期</option>
                    <option value="success">已完成</option>
                  </select>
                </div>

                {/* 关联采购单部分 */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-indigo-500" />
                      关联采购单
                    </h4>
                  </div>
                  
                  {(() => {
                    const projectOrders = supplyOrders.filter((o: any) => o.projectId === editingProject.id);
                    if (projectOrders.length === 0) {
                      return (
                        <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
                          暂无关联采购单
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {projectOrders.map((order: any) => (
                          <div key={order.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{order.id}</span>
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
                                order.status === 'delivered' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                order.status === 'delayed' ? "bg-rose-50 text-rose-700 border-rose-200" :
                                order.status === 'in-transit' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                "bg-amber-50 text-amber-700 border-amber-200"
                              )}>
                                {order.status === 'delivered' ? '已交付' :
                                 order.status === 'delayed' ? '已延期' :
                                 order.status === 'in-transit' ? '运输中' : '生产中'}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-slate-800 mb-1 truncate" title={order.items}>{order.items}</div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 truncate max-w-[120px]" title={order.supplier}>{order.supplier}</span>
                              <span className="font-medium text-slate-700">{order.amount}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingProject(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                取消
              </button>
              <button type="submit" form="edit-project-form" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                <Save className="w-4 h-4" />
                保存更改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
