import React, { useState, useRef } from "react";
import { Calendar as CalendarIcon, Clock, AlertCircle, CheckCircle2, ChevronRight, Plus, Download, Filter, X, Table as TableIcon, LayoutList, Link, Upload } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";
import * as XLSX from "xlsx";

const initialScheduleData = [
  {
    id: "p1",
    name: "一、前期准备阶段",
    startDate: "2026-05-01",
    endDate: "2026-05-21",
    progress: 0,
    status: "pending",
    tasks: [
      { id: "t1", name: "设计服务：方案深化与图纸审批", start: "05-01", end: "05-16", deadline: "2026-05-16", status: "pending", assignee: "待指派", predecessorId: null },
      { id: "t2", name: "材料采购：设备招标及订单下达", start: "05-01", end: "05-21", deadline: "2026-05-21", status: "pending", assignee: "待指派", predecessorId: null },
      { id: "t3", name: "开工准备：人员进场与技术交底", start: "05-11", end: "05-16", deadline: "2026-05-16", status: "pending", assignee: "待指派", predecessorId: null },
    ]
  },
  {
    id: "p2",
    name: "二、项目实施阶段",
    startDate: "2026-05-17",
    endDate: "2026-07-20",
    progress: 0,
    status: "pending",
    tasks: [
      { id: "t4", name: "土建施工 1：屋面基础处理、防水除锈", start: "05-17", end: "05-21", deadline: "2026-05-21", status: "pending", assignee: "待指派", predecessorId: null },
      { id: "t5", name: "安装调试 1：光伏支架测量、焊接固定", start: "05-22", end: "06-10", deadline: "2026-06-10", status: "pending", assignee: "待指派", predecessorId: "t4" },
      { id: "t6", name: "安装调试 2：光伏组件(3421块)接线安装", start: "06-11", end: "06-30", deadline: "2026-06-30", status: "pending", assignee: "待指派", predecessorId: "t5" },
      { id: "t7", name: "安装调试 3：电气系统、逆变器连接调试", start: "07-01", end: "07-15", deadline: "2026-07-15", status: "pending", assignee: "待指派", predecessorId: "t6" },
      { id: "t8", name: "现场整理：施工收尾与内部自检预验", start: "07-16", end: "07-20", deadline: "2026-07-20", status: "pending", assignee: "待指派", predecessorId: "t7" },
    ]
  },
  {
    id: "p3",
    name: "三、验收并网阶段",
    startDate: "2026-07-21",
    endDate: "2026-08-14",
    progress: 0,
    status: "pending",
    tasks: [
      { id: "t9", name: "并网验收：报装及第三方检测验收", start: "07-21", end: "07-30", deadline: "2026-07-30", status: "pending", assignee: "待指派", predecessorId: "t8" },
      { id: "t10", name: "竣工资料：文件整理、移交与结算", start: "07-31", end: "08-14", deadline: "2026-08-14", status: "pending", assignee: "待指派", predecessorId: "t9" },
      { id: "t11", name: "项目结项：最终竣工验收与正式交付", start: "08-14", end: "08-14", deadline: "2026-08-14", status: "pending", assignee: "待指派", predecessorId: "t10" },
    ]
  }
];

const projectTemplates = [
  {
    id: "standard-building",
    name: "标准建筑施工模板",
    tasks: [
      { name: "前期准备与图纸交底", days: 10 },
      { name: "场地平整与临时设施", days: 7 },
      { name: "基础工程施工", days: 20 },
      { name: "主体结构施工", days: 40 },
      { name: "二次结构与砌筑", days: 15 },
      { name: "机电设备安装", days: 30 },
      { name: "装饰装修工程", days: 30 },
      { name: "室外工程与绿化", days: 15 },
      { name: "系统调试与联动", days: 10 },
      { name: "竣工清理与验收", days: 7 }
    ]
  },
  {
    id: "green-energy",
    name: "新能源光伏项目模板",
    tasks: [
      { name: "现场勘察与方案设计", days: 10 },
      { name: "辅材采购与组件发货", days: 15 },
      { name: "屋面/基础处理", days: 10 },
      { name: "支架与防雷安装", days: 15 },
      { name: "光伏组件铺贴拼接", days: 20 },
      { name: "逆变器与电气布线", days: 15 },
      { name: "并网调试与检测", days: 7 },
      { name: "项目验收与并网发电", days: 5 }
    ]
  }
];

export function Schedule() {
  const [data, setData] = useFirebaseSync("scheduleData", initialScheduleData);
  const [boardData] = useFirebaseSync("projectBoardData", []);
  
  // 动态获取项目列表，合并 scheduleData 和 boardData 中的项目名称，以便新建项目能够显示
  const projects = React.useMemo(() => {
    const list = new Set<string>();
    if (Array.isArray(data)) {
        data.forEach((p: any) => p.name && list.add(p.name));
    }
    if (Array.isArray(boardData)) {
        boardData.forEach((col: any) => {
            if (Array.isArray(col.projects)) {
                col.projects.forEach((p: any) => p.name && list.add(p.name));
            }
        });
    }
    return ["全部项目", ...Array.from(list)];
  }, [data, boardData]);
  
  const [selectedProject, setSelectedProject] = useState("全部项目");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<"single" | "template">("single");
  const [selectedTemplate, setSelectedTemplate] = useState(projectTemplates[0].id);
  const [viewMode, setViewMode] = useState<"gantt" | "table">("gantt");
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<{projectId: string, taskId: string, taskName: string, deadline: string} | null>(null);
  const [editingDep, setEditingDep] = useState<{projectId: string, taskId: string, taskName: string, predecessorId: string | null} | null>(null);
  const [newTaskProject, setNewTaskProject] = useState<string>("");

  // 当 data 更新时，如果 newTaskProject 为空且有项目，则默认选中第一个
  React.useEffect(() => {
    if ((!newTaskProject || !data.find((p: any) => p.name === newTaskProject)) && data.length > 0) {
      setNewTaskProject(data[0].name);
    }
  }, [data, newTaskProject]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        
        // Assume first sheet contains the data
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of objects
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        if (rawData.length === 0) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件内容为空' }));
          return;
        }

        // Mapping logic: Transform flat excel rows into nested Project -> Tasks structure
        const projectMap = new Map<string, any>();
        
        rawData.forEach((row: any, index: number) => {
          // Expected Excel Columns: '项目名称', '任务名称', '开始日期', '结束日期', '截止日期', '负责人', '状态', '前置任务ID'
          const projectName = row['项目名称'] || row['项目'] || '未命名项目';
          const taskName = row['任务名称'] || row['任务'] || `任务 ${index + 1}`;
          
          if (!projectMap.has(projectName)) {
            projectMap.set(projectName, {
              id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${index}`,
              name: projectName,
              startDate: row['项目开始日期'] || new Date().toISOString().split('T')[0],
              endDate: row['项目结束日期'] || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
              progress: 0,
              status: "pending",
              tasks: []
            });
          }
          
          const project = projectMap.get(projectName);
          
          const rawStatus = row['状态'] || '';
          let status = 'pending';
          if (rawStatus.includes('完成')) status = 'completed';
          else if (rawStatus.includes('进行')) status = 'in-progress';
          else if (rawStatus.includes('延')) status = 'delayed';
          
          // Format 'MM-DD' for start/end if possible
          const rawStart = row['开始日期'] || '';
          const rawEnd = row['结束日期'] || '';
          
          // Simple parsing function just for display formatting matching current system
          const parseDateString = (d: string) => {
             if(typeof d === 'number') { // Excel numbers
                const date = new Date((d - (25567 + 2)) * 86400 * 1000);
                return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
             }
             if(!d) return '01-01';
             if(typeof d === 'string' && d.includes('-') && d.split('-').length >= 3) {
                 return d.split('-').slice(1).join('-'); // Extract MM-DD
             }
             return String(d).substring(0, 5); // Fallback
          };
          
          const getFullDate = (d: string) => {
              if(typeof d === 'number') { 
                const date = new Date((d - (25567 + 2)) * 86400 * 1000);
                return date.toISOString().split('T')[0];
             }
             return typeof d === 'string' && d.length >= 10 ? d.substring(0, 10) : new Date().toISOString().split('T')[0];
          }

          project.tasks.push({
            id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${index}`,
            name: taskName,
            start: parseDateString(rawStart),
            end: parseDateString(rawEnd),
            deadline: row['截止日期'] ? getFullDate(row['截止日期']) : getFullDate(rawEnd),
            status: status,
            assignee: row['负责人'] || '待指派',
            predecessorId: null // Hard to link from flat excel without IDs, so we keep null by default or user can map later
          });
        });

        const newProjects = Array.from(projectMap.values());
        
        if (newProjects.length > 0) {
           setData(prev => [...prev, ...newProjects]);
           window.dispatchEvent(new CustomEvent('show-toast', { detail: `成功导入 ${newProjects.length} 个项目` }));
        }

      } catch (error) {
        console.error("Error parsing Excel:", error);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件解析失败，请确保格式正确' }));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleStatusChange = (projectId: string, taskId: string, newStatus: string, predecessorId: string | null) => {
    if ((newStatus === 'in-progress' || newStatus === 'completed') && predecessorId) {
      const project = data.find(p => p.id === projectId);
      const predecessor = project?.tasks.find(t => t.id === predecessorId);
      if (predecessor && predecessor.status !== 'completed') {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: `无法开始：前置任务【${predecessor.name}】尚未完成！` }));
        return;
      }
    }
    setData(prev => prev.map(p => p.id === projectId ? {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
    } : p));
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '任务状态已更新' }));
  };

  const filteredData = selectedProject === "全部项目" 
    ? data 
    : data.filter(p => p.name === selectedProject);

  const handleExportCSV = () => {
    const headers = ["项目名称", "任务名称", "开始日期", "结束日期", "截止日期", "负责人", "状态", "前置任务"];
    const rows: string[][] = [];
    
    filteredData.forEach(project => {
      project.tasks.forEach(task => {
        const predecessor = project.tasks.find(t => t.id === task.predecessorId);
        rows.push([
          project.name,
          task.name,
          task.start,
          task.end,
          task.deadline,
          task.assignee,
          task.status === 'completed' ? '已完成' : task.status === 'in-progress' ? '进行中' : task.status === 'delayed' ? '已延期' : '未开始',
          predecessor ? predecessor.name : '无'
        ]);
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `施工计划表_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '已导出施工计划表' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const startDateRaw = (form.elements.namedItem('startDate') as HTMLInputElement).value;
    
    if (creationMode === "template") {
      const template = projectTemplates.find(t => t.id === selectedTemplate);
      if (!template) return;
      
      let currentDate = new Date(startDateRaw);
      const generatedTasks = template.tasks.map((t, index) => {
        const taskStart = new Date(currentDate);
        const taskEnd = new Date(currentDate);
        taskEnd.setDate(taskEnd.getDate() + t.days - 1);
        
        const startStr = taskStart.toISOString().split('T')[0].split('-').slice(1).join('-');
        const endStr = taskEnd.toISOString().split('T')[0].split('-').slice(1).join('-');
        const deadline = taskEnd.toISOString().split('T')[0];
        
        // Prepare current date for next task
        currentDate.setDate(currentDate.getDate() + t.days);
        
        return {
          id: `t_${Date.now()}_${index}`,
          name: t.name,
          start: startStr,
          end: endStr,
          deadline: deadline,
          status: "pending",
          assignee: "待指派",
          predecessorId: index > 0 ? `t_${Date.now()}_${index - 1}` : null
        };
      });
      
      const finalEndDate = new Date(currentDate);
      finalEndDate.setDate(finalEndDate.getDate() - 1);

      setData((prev: any) => {
        const parsedData = Array.isArray(prev) ? prev : [];
        let projectExists = false;
        const newData = parsedData.map((p: any) => {
          if (p.name === newTaskProject) {
            projectExists = true;
            return {
              ...p,
              endDate: p.endDate < finalEndDate.toISOString().split('T')[0] ? finalEndDate.toISOString().split('T')[0] : p.endDate,
              tasks: [
                ...(Array.isArray(p.tasks) ? p.tasks : []),
                ...generatedTasks
              ]
            };
          }
          return p;
        });

        if (!projectExists) {
          newData.push({
            id: `p_${Date.now()}`,
            name: newTaskProject,
            startDate: startDateRaw,
            endDate: finalEndDate.toISOString().split('T')[0],
            progress: 0,
            status: "pending",
            tasks: generatedTasks
          });
        }
        return newData;
      });

      setIsModalOpen(false);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '已成功应用模板生成排期' }));
      return;
    }

    const taskName = (form.elements.namedItem('taskName') as HTMLInputElement).value;
    const endDateRaw = (form.elements.namedItem('endDate') as HTMLInputElement).value;
    const deadline = (form.elements.namedItem('deadline') as HTMLInputElement).value;
    const assignee = (form.elements.namedItem('assignee') as HTMLInputElement).value;
    const predecessorId = (form.elements.namedItem('predecessorId') as HTMLSelectElement).value || null;
    
    if (new Date(startDateRaw) > new Date(endDateRaw)) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '错误：结束日期不能早于开始日期！' }));
      return;
    }
    
    // Convert startDate and endDate to "MM-DD" format
    const startStr = startDateRaw.split('-').slice(1).join('-');
    const endStr = endDateRaw.split('-').slice(1).join('-');

    setData((prev: any) => {
      const parsedData = Array.isArray(prev) ? prev : [];
      let projectExists = false;
      const newData = parsedData.map((p: any) => {
        if (p.name === newTaskProject) {
          projectExists = true;
          return {
            ...p,
            tasks: [
              ...(Array.isArray(p.tasks) ? p.tasks : []),
              {
                id: `t_${Date.now()}`,
                name: taskName,
                start: startStr,
                end: endStr,
                deadline,
                status: "pending",
                assignee,
                predecessorId
              }
            ]
          };
        }
        return p;
      });

      if (!projectExists) {
         newData.push({
            id: `p_${Date.now()}`,
            name: newTaskProject,
            startDate: startDateRaw,
            endDate: endDateRaw,
            progress: 0,
            status: "pending",
            tasks: [{
                id: `t_${Date.now()}`,
                name: taskName,
                start: startStr,
                end: endStr,
                deadline,
                status: "pending",
                assignee,
                predecessorId
            }]
         });
      }

      return newData;
    });

    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '新建排期计划成功' }));
  };

  const handleDeadlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    const project = data.find(p => p.id === editingTask.projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === editingTask.taskId);
    if (!task) return;

    if (task.status !== 'pending' && task.status !== 'in-progress') {
      const statusLabel = task.status === 'completed' ? '已完成' : task.status === 'delayed' ? '已延期' : '未知';
      if (!window.confirm(`当前任务状态为“${statusLabel}”，修改截止日期可能会影响项目归档数据。是否继续修改？`)) {
        return;
      }
    }

    const newDeadline = new Date(editingTask.deadline);
    const originalDeadline = new Date(task.deadline);
    let updatedTasks = [...project.tasks];

    if (task.predecessorId) {
      const predecessor = project.tasks.find(t => t.id === task.predecessorId);
      if (predecessor && newDeadline < new Date(predecessor.deadline)) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: `修改失败：新截止日期不能早于前置任务【${predecessor.name}】的截止日期（${predecessor.deadline}）！` }));
        return;
      }
    }

    if (newDeadline > originalDeadline) {
      const dependents = updatedTasks.filter(t => t.predecessorId === task.id);
      const conflictDependents = dependents.filter(d => new Date(d.deadline) < newDeadline);
      
      if (conflictDependents.length > 0) {
        if (window.confirm(`该任务的截止日期推迟，会导致后续依赖任务（如：${conflictDependents[0].name}）的进度冲突。是否自动顺延后续任务的截止日期？`)) {
          const timeDiff = newDeadline.getTime() - originalDeadline.getTime();
          
          const cascadeUpdate = (taskId: string, diff: number) => {
            const deps = updatedTasks.filter(t => t.predecessorId === taskId);
            deps.forEach(dep => {
              const depDeadline = new Date(dep.deadline);
              const newDepDeadline = new Date(depDeadline.getTime() + diff);
              const newDeadlineStr = newDepDeadline.toISOString().split('T')[0];
              updatedTasks = updatedTasks.map(t => t.id === dep.id ? { ...t, deadline: newDeadlineStr } : t);
              cascadeUpdate(dep.id, diff);
            });
          };
          cascadeUpdate(task.id, timeDiff);
        }
      }
    }

    updatedTasks = updatedTasks.map(t => t.id === editingTask.taskId ? { ...t, deadline: editingTask.deadline } : t);

    setData(prev => prev.map(p => p.id === editingTask.projectId ? {
      ...p,
      tasks: updatedTasks
    } : p));

    setEditingTask(null);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '截止日期已更新' }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">施工日程管理</h2>
          <p className="text-slate-500 text-sm mt-1">全局掌控工程节点，预防工期延误</p>
        </div>
        <div className="flex gap-3">
          <select 
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm"
          >
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setViewMode('gantt')} 
              className={cn("px-3 py-1.5 rounded-md text-sm font-medium flex items-center transition-colors", viewMode === 'gantt' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <LayoutList className="w-4 h-4 mr-1.5" />
              甘特图
            </button>
            <button 
              onClick={() => setViewMode('table')} 
              className={cn("px-3 py-1.5 rounded-md text-sm font-medium flex items-center transition-colors", viewMode === 'table' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <TableIcon className="w-4 h-4 mr-1.5" />
              施工计划表
            </button>
          </div>
          
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center"
          >
            <Upload className="w-4 h-4 mr-2" />
            导入
          </button>
          
          <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
            <Download className="w-4 h-4 mr-2" />
            导出
          </button>
          <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            排期计划
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        {viewMode === 'gantt' ? (
          <>
            <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">项目甘特图 (简易版)</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center text-slate-500"><span className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>正常进行</span>
                <span className="flex items-center text-slate-500"><span className="w-3 h-3 rounded-full bg-rose-500 mr-2"></span>存在延期</span>
                <span className="flex items-center text-slate-500"><span className="w-3 h-3 rounded-full bg-slate-300 mr-2"></span>未开始</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredData.map((project) => (
                <div key={project.id} className="p-0">
                  <div 
                    className="p-4 bg-slate-50/50 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleProject(project.id)}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className={cn("w-5 h-5 text-slate-400 transition-transform", expandedProjects.includes(project.id) && "rotate-90")} />
                      <span className="font-semibold text-slate-800">{project.name}</span>
                      <span className="text-xs text-slate-500 font-mono bg-white px-2 py-1 rounded border border-slate-200">
                        {project.startDate} 至 {project.endDate}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-32">
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", project.status === 'delayed' ? 'bg-rose-500' : 'bg-emerald-500')} 
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600">{project.progress}%</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProject(project.id);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      >
                        {expandedProjects.includes(project.id) ? '收起排期' : '查看排期'}
                      </button>
                    </div>
                  </div>
                  
                  {expandedProjects.includes(project.id) && (
                    <div className="pl-12 pr-4 py-2 bg-white">
                      {project.tasks.map((task) => (
                        <div key={task.id} className="flex items-center py-3 border-b border-slate-50 last:border-0 group">
                          <div className="w-[20%] flex items-center gap-3">
                            {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                            {task.status === 'in-progress' && <Clock className="w-4 h-4 text-blue-500 shrink-0" />}
                            {task.status === 'delayed' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                            {task.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                            <span className="text-sm text-slate-700 group-hover:text-indigo-600 transition-colors truncate" title={task.name}>{task.name}</span>
                          </div>
                          
                          <div className="w-[10%] flex items-center">
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md truncate">{task.assignee}</span>
                          </div>
                          
                          <div className="w-[12%] flex items-center">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(project.id, task.id, e.target.value, task.predecessorId)}
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap outline-none cursor-pointer appearance-none text-center",
                                task.status === 'completed' ? "bg-emerald-50 text-emerald-600" : 
                                task.status === 'in-progress' ? "bg-blue-50 text-blue-600" :
                                task.status === 'delayed' ? "bg-rose-50 text-rose-600" :
                                "bg-slate-100 text-slate-500"
                              )}
                            >
                              <option value="pending">未开始</option>
                              <option value="in-progress">进行中</option>
                              <option value="delayed">延期</option>
                              <option value="completed">已完成</option>
                            </select>
                          </div>

                          <div className="w-[15%] flex items-center gap-1">
                            <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
                              截止: {task.deadline.slice(5)}
                            </span>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingTask({projectId: project.id, taskId: task.id, taskName: task.name, deadline: task.deadline}); 
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                              title="设置截止日期"
                              aria-label="设置截止日期"
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="w-[15%] flex items-center gap-1">
                            <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate max-w-[80px]" title={task.predecessorId ? project.tasks.find(t => t.id === task.predecessorId)?.name : '无前置'}>
                              {task.predecessorId ? project.tasks.find(t => t.id === task.predecessorId)?.name : '无前置'}
                            </span>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingDep({projectId: project.id, taskId: task.id, taskName: task.name, predecessorId: task.predecessorId}); 
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                              title="设置前置任务"
                              aria-label="设置前置任务"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="w-[28%] flex items-center">
                            <span className="text-xs text-slate-400 w-10 text-right mr-2 font-mono">{task.start}</span>
                            <div className="flex-1 h-4 bg-slate-100 rounded relative">
                              {/* Pseudo Gantt Bar - Simplified for UI mockup */}
                              <div 
                                className={cn(
                                  "absolute h-full rounded opacity-80",
                                  task.status === 'completed' ? 'bg-emerald-400' :
                                  task.status === 'in-progress' ? 'bg-blue-400' :
                                  task.status === 'delayed' ? 'bg-rose-400' : 'bg-slate-300'
                                )}
                                style={{ 
                                  left: task.status === 'completed' ? '0%' : task.status === 'in-progress' ? '20%' : task.status === 'delayed' ? '30%' : '60%',
                                  width: '30%' 
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 w-12 text-left ml-3 font-mono">{task.end}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">所属项目</th>
                  <th className="px-6 py-4">任务名称</th>
                  <th className="px-6 py-4">开始日期</th>
                  <th className="px-6 py-4">结束日期</th>
                  <th className="px-6 py-4">截止日期</th>
                  <th className="px-6 py-4">前置任务</th>
                  <th className="px-6 py-4">责任人</th>
                  <th className="px-6 py-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.flatMap(project => 
                  project.tasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 font-medium text-slate-900">{project.name}</td>
                      <td className="px-6 py-4 text-slate-700">{task.name}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono">{task.start}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono">{task.end}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono">
                        <div className="flex items-center gap-2">
                          {task.deadline}
                          <button 
                            onClick={() => setEditingTask({projectId: project.id, taskId: task.id, taskName: task.name, deadline: task.deadline})}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            title="修改截止日期"
                            aria-label="修改截止日期"
                          >
                            <CalendarIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[100px]" title={task.predecessorId ? project.tasks.find(t => t.id === task.predecessorId)?.name : '无'}>
                            {task.predecessorId ? project.tasks.find(t => t.id === task.predecessorId)?.name : '无'}
                          </span>
                          <button 
                            onClick={() => setEditingDep({projectId: project.id, taskId: task.id, taskName: task.name, predecessorId: task.predecessorId})}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            title="设置前置任务"
                            aria-label="设置前置任务"
                          >
                            <Link className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{task.assignee}</td>
                      <td className="px-6 py-4">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(project.id, task.id, e.target.value, task.predecessorId)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium outline-none cursor-pointer appearance-none text-center",
                            task.status === 'completed' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : 
                            task.status === 'in-progress' ? "bg-blue-50 text-blue-700 border border-blue-100" :
                            task.status === 'delayed' ? "bg-rose-50 text-rose-700 border border-rose-100" :
                            "bg-slate-100 text-slate-600 border border-slate-200"
                          )}
                        >
                          <option value="pending">未开始</option>
                          <option value="in-progress">进行中</option>
                          <option value="delayed">延期</option>
                          <option value="completed">已完成</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新建排期计划</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                <button
                  type="button"
                  onClick={() => setCreationMode("single")}
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                    creationMode === "single" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                  )}
                >
                  单一任务
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode("template")}
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                    creationMode === "template" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                  )}
                >
                  从模板生成
                </button>
              </div>

              <div className="bg-amber-50 text-amber-600 text-xs p-3 rounded-lg flex items-start gap-2 border border-amber-100">
                <div className="shrink-0 mt-0.5">💡</div>
                <p>建议在「全生命周期」阶段确认<strong>签订合同</strong>并确定<strong>施工进场时间</strong>后，再为您生成完整的施工排期与竣工计划。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所属项目</label>
                <select 
                  value={newTaskProject}
                  onChange={(e) => setNewTaskProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  {projects.filter(p => p !== "全部项目").map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {creationMode === "template" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">选择通用模板</label>
                    <select 
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    >
                      {projectTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目开始日期</label>
                    <input type="date" name="startDate" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    <p className="text-xs text-slate-500 mt-2">
                      系统将基于该开始日期为您自动规划关联的工序排期。生成后您可自由调整截止时间及责任人。
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">任务名称</label>
                    <input type="text" name="taskName" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入任务名称" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
                      <input type="date" name="startDate" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
                      <input type="date" name="endDate" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
                      <input type="date" name="deadline" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">责任人</label>
                      <input type="text" name="assignee" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="姓名" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">前置任务</label>
                    <select name="predecessorId" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                      <option value="">无前置任务</option>
                      {data.find((p: any) => p.name === newTaskProject)?.tasks.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

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

      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">设置截止日期</h3>
              <button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDeadlineSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">任务名称</label>
                <div className="px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm border border-slate-100">{editingTask.taskName}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
                <input 
                  type="date" 
                  required 
                  value={editingTask.deadline}
                  onChange={(e) => setEditingTask({...editingTask, deadline: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingTask(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingDep && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">设置前置任务</h3>
              <button onClick={() => setEditingDep(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              setData(prev => prev.map(p => p.id === editingDep.projectId ? {
                ...p,
                tasks: p.tasks.map(t => t.id === editingDep.taskId ? { ...t, predecessorId: editingDep.predecessorId || null } : t)
              } : p));
              setEditingDep(null);
              window.dispatchEvent(new CustomEvent('show-toast', { detail: '前置任务已更新' }));
            }} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">当前任务</label>
                <div className="px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm border border-slate-100">{editingDep.taskName}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">选择前置任务</label>
                <select 
                  value={editingDep.predecessorId || ""}
                  onChange={(e) => setEditingDep({...editingDep, predecessorId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white" 
                >
                  <option value="">无前置任务</option>
                  {data.find(p => p.id === editingDep.projectId)?.tasks
                    .filter(t => t.id !== editingDep.taskId)
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  设置前置任务后，必须等待前置任务完成后，当前任务才能变更为“进行中”状态。
                </p>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingDep(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
