import React, { useState, useEffect, useMemo } from "react";
import { MoreHorizontal, Clock, AlertTriangle, CheckCircle2, X, Eye, Edit2, Save, ShoppingCart, ExternalLink, ShieldAlert, Plus, FileText } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";
import { STAGES, getProjectCurrentStageInfo } from "./ProjectLifecycle";

const sampleProjects = [
  { id: "p1", name: "C区绿色建筑改造", type: "绿色建筑", manager: "陈杰", constructProgress: 0, supplyProgress: 15, status: "normal", dueDate: "2026-12-31" },
  { id: "p4", name: "智能微电网二期", type: "智能微电网", manager: "赵敏", constructProgress: 10, supplyProgress: 80, status: "normal", dueDate: "2026-07-20" },
  { id: "p6", name: "北侧风力发电机组", type: "风力发电", manager: "李娜", constructProgress: 45, supplyProgress: 100, status: "delayed", dueDate: "2026-08-15" },
  { id: "p8", name: "展示中心光储充一体", type: "综合能源", manager: "王强", constructProgress: 100, supplyProgress: 100, status: "success", dueDate: "2026-01-15" }
];

const initialBoardData = STAGES.map((stage, idx) => {
  // Distribute sample projects into stages somewhat evenly for visual effect
  let projectsInStage = [];
  if (idx === 0) projectsInStage = [sampleProjects[0]];
  else if (idx === 3) projectsInStage = [sampleProjects[1]];
  else if (idx === 6) projectsInStage = [sampleProjects[2]];
  else if (idx === 8) projectsInStage = [sampleProjects[3]];
  
  return {
    id: stage.id,
    title: stage.name.split(' ')[1] || stage.name,
    count: projectsInStage.length,
    projects: projectsInStage
  };
});

const statusConfig = {
  normal: { icon: Clock, color: "text-slate-400", tooltip: "进度正常" },
  warning: { icon: AlertTriangle, color: "text-amber-500", tooltip: "存在风险" },
  delayed: { icon: AlertTriangle, color: "text-rose-500", tooltip: "已延期" },
  success: { icon: CheckCircle2, color: "text-emerald-500", tooltip: "已完成" },
};

const typeColors: Record<string, string> = {
  "绿色建筑": "bg-pink-100 text-pink-700 border-pink-200",
  "市政景观": "bg-teal-100 text-teal-700 border-teal-200",
  "储能系统": "bg-purple-100 text-purple-700 border-purple-200",
  "智能微电网": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "光伏发电": "bg-amber-100 text-amber-700 border-amber-200",
  "风力发电": "bg-blue-100 text-blue-700 border-blue-200",
  "综合能源": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export function ProjectBoard() {
  const [data, setData] = useFirebaseSync("projectBoardData", initialBoardData);
  const [supplyOrders] = useFirebaseSync("supplyOrders", []);
  const [personnelData] = useFirebaseSync("personnelData", []);
  const [scheduleData] = useFirebaseSync("scheduleData", []);
  const [lifecycleStates] = useFirebaseSync("projectLifecycleStates", {});

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
  const [draggedItem, setDraggedItem] = useState<{ columnId: string, projectId: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ columnId: string, projectId: string | null } | null>(null);

  const handleDragStart = (e: React.DragEvent, columnId: string, projectId: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ columnId, projectId }));
    e.dataTransfer.effectAllowed = "move";
    setDraggedItem({ columnId, projectId });
  };

  const handleDragOver = (e: React.DragEvent, columnId: string, projectId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    
    if (dragOverItem?.columnId !== columnId || dragOverItem?.projectId !== projectId) {
      setDragOverItem({ columnId, projectId });
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string, targetProjectId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverItem(null);
    setDraggedItem(null);

    try {
      const { columnId: sourceColumnId, projectId: sourceProjectId } = JSON.parse(e.dataTransfer.getData("text/plain"));
      
      if (sourceColumnId === targetColumnId && sourceProjectId === targetProjectId) return;

      if (sourceColumnId !== targetColumnId) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '阶段变更请在「全生命周期」模块中办理，完成后看板节点将同步自动变更。' }));
        return;
      }

      setData((prevData: any) => {
      const currentData = Array.isArray(prevData) && prevData.length > 0 ? prevData : initialBoardData;
      const newData = [...currentData];
      const sourceColIndex = newData.findIndex(c => c.id === sourceColumnId);
      const targetColIndex = newData.findIndex(c => c.id === targetColumnId);

      if (sourceColIndex === -1 || targetColIndex === -1) return currentData;

        const sourceCol = { ...newData[sourceColIndex], projects: [...newData[sourceColIndex].projects] };
        const targetCol = sourceCol; // Because sourceColumnId === targetColumnId

        const projectIndex = sourceCol.projects.findIndex(p => p.id === sourceProjectId);
        if (projectIndex === -1) return prevData;

        const [project] = sourceCol.projects.splice(projectIndex, 1);

        if (targetProjectId) {
          const targetProjectIndex = targetCol.projects.findIndex(p => p.id === targetProjectId);
          targetCol.projects.splice(targetProjectIndex, 0, project);
        } else {
          targetCol.projects.push(project);
        }

        sourceCol.count = sourceCol.projects.length;

        newData[sourceColIndex] = sourceCol;

        return newData;
      });
    } catch (err) {
      console.error("Drop error", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const newProject = {
      id: `p${Date.now()}`,
      name: formData.get('name') as string,
      type: formData.get('type') as string,
      manager: formData.get('manager') as string,
      dueDate: formData.get('dueDate') as string,
      constructProgress: 0,
      supplyProgress: 0,
      status: "normal"
    };

    setData((prevData: any) => {
      const currentData = Array.isArray(prevData) && prevData.length > 0 ? prevData : initialBoardData;
      const newData = [...currentData];
      const firstColId = STAGES[0].id;
      let planningColIndex = newData.findIndex(c => c.id === firstColId);
      
      // Fallback if structured data is too old
      if (planningColIndex === -1) planningColIndex = 0;
      
      if (planningColIndex !== -1 && newData[planningColIndex]) {
        const planningCol = { ...newData[planningColIndex] };
        planningCol.projects = [newProject, ...(planningCol.projects || [])];
        planningCol.count = planningCol.projects.length;
        newData[planningColIndex] = planningCol;
      }
      return newData;
    });

    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '新建项目成功' }));
  };

  // Sync board columns with lifecycle stages automatically
  React.useEffect(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return;

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
  }, [data, lifecycleStates, setData]);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    
    setData((prevData: any) => {
      const currentData = Array.isArray(prevData) && prevData.length > 0 ? prevData : initialBoardData;
      return currentData.map((col: any) => ({
        ...col,
        projects: col.projects.map((p: any) => p.id === editingProject.id ? editingProject : p)
      }));
    });
    
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
          <button 
            onClick={() => {
              if (window.confirm('确定要重置看板数据吗？所有自定义项目将被清除。')) {
                setData(initialBoardData);
                window.dispatchEvent(new CustomEvent('show-toast', { detail: '看板已重置' }));
              }
            }}
            className="px-3 py-2 text-slate-400 hover:text-slate-600 text-xs font-medium transition-colors hidden md:block"
          >
            重置数据
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 w-full md:w-auto text-center flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
        <div className="flex gap-4 md:gap-6 h-full min-w-max px-1">
          {(Array.isArray(data) && data.length > 0 ? data : initialBoardData).map((column) => (
            <div 
              key={column.id} 
              className={cn(
                "w-72 md:w-80 flex flex-col h-full bg-slate-50/50 rounded-2xl border p-3 md:p-4 transition-all duration-300",
                dragOverItem?.columnId === column.id && !dragOverItem?.projectId ? "border-indigo-400 bg-indigo-50/50 ring-4 ring-indigo-500/5" : "border-slate-200/60 shadow-sm"
              )}
              onDragOver={(e) => handleDragOver(e, column.id, null)}
              onDrop={(e) => handleDrop(e, column.id, null)}
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
                    {(column.projects?.length || 0).toString().padStart(2, '0')}
                  </span>
                </div>
                <button className="text-slate-300 hover:text-slate-500 p-1 hover:bg-slate-100 rounded-md transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 md:space-y-4 pr-1 pb-10 custom-scrollbar scroll-smooth">
                {Array.isArray(column.projects) && column.projects.map((project) => {
                  const config = statusConfig[project.status as keyof typeof statusConfig] || statusConfig.normal;
                  const StatusIcon = config.icon;
                  const statusColor = config.color;
                  const statusTooltip = config.tooltip;
                  
                  const isDragging = draggedItem?.projectId === project.id;
                  const isDragOver = dragOverItem?.projectId === project.id;
                  
                  const hasSafetyRisk = personnelData.some((person: any) => 
                    !person.safetyTrained && 
                    (person.name === project.manager || (person.projects && person.projects.some((p: any) => p.name === project.name)))
                  );
                  
                  return (
                    <div 
                      key={project.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, column.id, project.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, column.id, project.id)}
                      onDrop={(e) => handleDrop(e, column.id, project.id)}
                      className={cn(
                        "bg-white p-5 rounded-2xl border shadow-sm transition-all cursor-grab active:cursor-grabbing relative group overflow-hidden",
                        isDragging ? "opacity-50 scale-95 border-indigo-300" : "border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5",
                        isDragOver ? "border-t-4 border-t-indigo-500 mt-6" : "",
                        hasSafetyRisk ? "border-rose-200 shadow-rose-100/50" : ""
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border", typeColors[project.type] || "bg-slate-100 text-slate-700 border-slate-200")}>
                          {project.type}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('show-toast', { detail: '查看项目详情' })); }}
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
                      
                      <h4 className="font-bold text-slate-900 mb-2 leading-tight group-hover:text-indigo-600 transition-colors">{project.name}</h4>
                      
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
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {project.manager?.charAt(0) || '?'}
                          </div>
                          <span className="text-[11px] font-medium text-slate-500">{project.manager || '未指定'}</span>
                        </div>
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
                          <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{project.dueDate}</span>
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
                  <option>绿色建筑</option>
                  <option>市政景观</option>
                  <option>储能系统</option>
                  <option>光伏发电</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目经理</label>
                  <input name="manager" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="姓名" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预计竣工日期</label>
                  <input name="dueDate" type="date" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                    {Object.keys(typeColors).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目经理</label>
                    <input 
                      type="text" 
                      required 
                      value={editingProject.manager}
                      onChange={(e) => setEditingProject({...editingProject, manager: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">预计竣工日期</label>
                    <input 
                      type="date" 
                      required 
                      value={editingProject.dueDate}
                      onChange={(e) => setEditingProject({...editingProject, dueDate: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                    />
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
