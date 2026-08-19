import React, { useEffect, useMemo, useState } from "react";
import { Folder, FileText, CheckCircle2, ChevronRight, Upload, Clock, Shield, Download, Briefcase, ListTodo, FileCheck, ArrowRight, Save, Camera, ArrowLeft, Eye } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useUserSettings } from "@/src/hooks/useUserSettings";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { getProjectFileDownloadUrl } from "@/src/lib/apiClient";
import { useEntityList } from "@/src/hooks/useEntityList";
import { getProjectNumber } from "@/src/lib/management";
import { resolveProjectReference, sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { ArchiveFolderState, downloadLocalArchiveFile, getLocalArchiveProvider } from "@/src/lib/archiveStorage";
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
  const [boardData] = useProjectBoardData();
  const [lifecycleStates, setLifecycleStates, lifecycleLoading] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const [appSettings] = useUserSettings<any>({});
  const { data: surveyRecords } = useEntityList<any>("site-surveys", []);
  
  const allProjects = useMemo(() => sortProjectsNaturally(Array.isArray(boardData)
    ? boardData.flatMap((col: any) => col.projects || [])
    : []), [boardData]);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [activeStage, setActiveStage] = useState(STAGES[0].id);
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

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProj && STAGES.some((stage) => stage.id === activeStage)) onSelectionChange?.(activeProj, activeStage);
  }, [activeProj, activeStage, onSelectionChange]);

  const selectProject = (projectId: string) => {
    const project = allProjects.find((item: any) => item.id === projectId);
    if (!project) return;
    setSelectedProject(project.id);
    setActiveStage(getProjectCurrentStageInfo(project.id, lifecycleStates).stage.id);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if(!activeProj) return;
      const file = e.target.files[0];
      const stage = STAGES.find(s => s.id === activeStage);
      if(!stage) return;

      const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
      const baseName = file.name.replace(new RegExp(`${ext.replace(".", "\\.")}$`), "");
      const expectedFile = stage.files.find((name) => {
        const cleanExpected = name.replace(/\.[^.]+$/, "");
        return baseName.includes(cleanExpected) || cleanExpected.includes(baseName);
      });
      const fileType = expectedFile ? expectedFile.replace(/\.[^.]+$/, "") : baseName;
      
      const currentFiles = Array.isArray(stageState.files) ? stageState.files : [];

      try {
        const provider = await getLocalArchiveProvider();
        const availability = await provider?.checkAvailability();
        if (!provider || !availability?.available) throw new Error("archive_permission_required");
        const uploaded = await provider.writeFile({
          project: activeProj,
          stage,
          fileType,
          file,
          autoRename: appSettings?.fileManagement?.autoRename !== false,
          projectFolder: archiveFolderStates[activeProj.id]?.projectFolder,
        });

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
        
        setLifecycleStates(prev => ({
          ...prev,
          [activeProj.id]: {
            ...(prev[activeProj.id] || {}),
            [activeStage]: {
              ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
              files: [...currentFiles, newFileObj]
            }
          }
        }));
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
        
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件已规范命名并保存到项目资料夹' }));
      } catch (error: any) {
        const message = error?.message === "archive_permission_required"
          ? "请先在项目资料或系统设置中授权本机归档文件夹"
          : error?.message === "archive_file_exists"
            ? "同名文件已存在；请开启自动规范命名或调整文件名"
            : "文件保存失败，请检查本机归档目录权限";
        window.dispatchEvent(new CustomEvent('show-toast', { detail: message }));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleSaveData = () => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '阶段数据已保存' }));
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

  return (
    <div className="flex min-h-full md:h-full bg-[#f8fafc] animate-in fade-in duration-300">
      {/* Sidebar: Projects List */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0 z-10 shadow-sm relative">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 tracking-tight">
            <Folder className="w-5 h-5 text-indigo-600" />
            项目档案与流程
          </h2>
          <button type="button" onClick={onBack} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="返回多项目看板"><ArrowLeft className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">项目列表筛选（当前工作阶段）</div>
          <div className="flex flex-wrap gap-1.5 mb-3 px-1">
            <button onClick={() => setStageFilter("all")} className={cn("px-2.5 py-1 rounded-full text-[11px] border", stageFilter === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200")}>全部项目</button>
            {STAGES.map(stage => <button key={stage.id} onClick={() => setStageFilter(stage.id)} className={cn("px-2.5 py-1 rounded-full text-[11px] border", stageFilter === stage.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200")}>{stage.name.split(" ")[1]?.split("(")[0]}</button>)}
          </div>
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
                    {activeProj.dueDate && <span className="text-slate-500 text-sm flex items-center gap-1.5"><Clock className="w-4 h-4" />竣工计划: {activeProj.dueDate}</span>}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <select value={selectedProject || ""} onChange={(event) => selectProject(event.target.value)} className="md:hidden w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none" aria-label="选择项目">
                    {visibleProjects.map((project: any) => <option key={project.id} value={project.id}>{project.projectNumber} · {project.name}</option>)}
                  </select>
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
                  const isCompleted = STAGES.findIndex(s => s.id === activeStage) > idx;
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
                        {isCompleted ? (
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
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <div className="flex flex-wrap gap-2">
                          {stage.id === "1_initiation" && <button onClick={() => onOpenSiteSurvey?.(activeProj.id, latestProjectSurvey?.id)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"><Camera className="h-4 w-4" />{latestProjectSurvey ? "查看现场勘察报告" : "现场勘察"}{activeProjectSurveys.length > 0 ? `（${activeProjectSurveys.length}）` : ""}</button>}
                          <button 
                            onClick={handleUploadClick}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
                          >
                            <Upload className="w-4 h-4" />
                            上传规范资料
                          </button>
                        </div>
                      </div>

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
                                          disabled={item.id === "site-survey" && activeProjectSurveys.length > 0}
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
                                          />
                                        ) : (
                                          <input 
                                            type="text" 
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                                            placeholder={field.placeholder}
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
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
                                  <div key={i} className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors group">
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
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => {
                                          if (fileObj.storageProvider === "local-folder" && fileObj.storageKey) {
                                            void downloadLocalArchiveFile(fileObj.storageKey, fileObj.storedName || fileObj.name).catch(() => {
                                              window.dispatchEvent(new CustomEvent('show-toast', { detail: '原文件仅能在已授权的归档电脑下载' }));
                                            });
                                          } else if (fileObj.relativePath) {
                                            window.open(getProjectFileDownloadUrl(fileObj.relativePath), "_blank");
                                          } else {
                                            window.dispatchEvent(new CustomEvent('show-toast', { detail: '这是待上传清单，请先上传真实文件' }));
                                          }
                                        }}
                                        className="p-2.5 px-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium text-xs rounded-lg transition-colors border border-indigo-100 flex items-center gap-1.5"
                                      >
                                        <Download className="w-4 h-4" /> 下载
                                      </button>
                                    </div>
                                  </div>
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
    </div>
  );
}
