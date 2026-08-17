import React, { useEffect, useState, useRef } from "react";
import { Calendar as CalendarIcon, Clock, AlertCircle, CheckCircle2, ChevronRight, Plus, Download, Filter, X, Table as TableIcon, LayoutList, Link, Upload, Edit2, Trash2, Save } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenTasks, formatLocalDate } from "@/src/lib/management";
import * as XLSX from "xlsx";
import { getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { useAuth } from "@/src/lib/auth";

const initialScheduleData: any[] = [
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

const schedulePhasePattern = /^(?:[一二三四五六七八九十]+、)?(?:前期准备阶段|项目实施阶段|验收并网阶段)$/;
const schedulePhaseLabels: Record<string, string> = {
  "一、前期准备阶段": "前期准备",
  "二、项目实施阶段": "项目实施",
  "三、验收并网阶段": "验收并网",
};

export function Schedule() {
  const { user, can } = useAuth();
  const [data, setData] = useSyncedAppData("scheduleData", []);
  const [boardData] = useProjectBoardData();
  const [externalPartners] = useSyncedAppData<any[]>("externalPartners", []);
  const [projectMeta, setProjectMeta] = useSyncedAppData<Record<string, any>>("scheduleProjectMeta", {});
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [savedTemplates, setSavedTemplates] = useSyncedAppData<any[]>("scheduleTemplates", projectTemplates);
  const [scheduleTrash, setScheduleTrash] = useSyncedAppData<any[]>("scheduleTrash", []);
  const canManageSchedule = Boolean(user?.role === "admin" || user?.role === "project_manager" || can("accounts"));
  
  // 动态获取项目列表，合并 scheduleData 和 boardData 中的项目名称，以便新建项目能够显示
  const projects = React.useMemo(() => {
    const list = new Set<string>();
    if (Array.isArray(data)) {
        data.forEach((p: any) => p.name && !schedulePhasePattern.test(p.name) && list.add(p.name));
    }
    if (Array.isArray(boardData)) {
        boardData.forEach((col: any) => {
            if (Array.isArray(col.projects)) {
                col.projects.forEach((p: any) => p.name && !schedulePhasePattern.test(p.name) && list.add(p.name));
            }
        });
    }
    return ["全部项目", ...Array.from(list)];
  }, [data, boardData]);

  const eligibleProjectIds = React.useMemo(() => new Set(boardData.flatMap((column: any) => (column.projects || []).filter((project: any) => getProjectCurrentStageInfo(project.id, lifecycleStates).index >= 6).map((project: any) => project.id))), [boardData, lifecycleStates]);
  const allProjectsForSchedule = React.useMemo(() => boardData.flatMap((column: any) => column.projects || []), [boardData]);
  
  const [selectedProject, setSelectedProject] = useState("全部项目");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<"single" | "template">("single");
  const [selectedTemplate, setSelectedTemplate] = useState(projectTemplates[0].id);
  const [viewMode, setViewMode] = useState<"gantt" | "table">("gantt");
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<{projectId: string, taskId: string, taskName: string, deadline: string} | null>(null);
  const [editingDep, setEditingDep] = useState<{projectId: string, taskId: string, taskName: string, predecessorId: string | null} | null>(null);
  const [newTaskProject, setNewTaskProject] = useState<string>("");
  const [taskFilter, setTaskFilter] = useState<"project" | "mine" | "overdue" | "unassigned" | "external" | "externalOverdue" | "quick">("project");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  // 旧版本把三个施工阶段存成了三个“项目”。迁移到真实项目下的阶段任务组，避免阶段出现在项目筛选中。
  useEffect(() => {
    const phaseProjects = data.filter((item: any) => schedulePhasePattern.test(item.name || ""));
    if (phaseProjects.length < 2) return;
    const realProjects = boardData.flatMap((column: any) => Array.isArray(column.projects) ? column.projects : [])
      .filter((project: any) => project.name && !schedulePhasePattern.test(project.name));
    const target = realProjects[0];
    if (!target) return;

    void setData((current: any[]) => {
      const rows = current.filter((item: any) => schedulePhasePattern.test(item.name || ""));
      if (rows.length < 2) return current;
      const existing = current.find((item: any) => item.id === target.id || item.name === target.name);
      const mergedTasks = rows.flatMap((row: any) => (row.tasks || []).map((task: any) => ({
        ...task,
        phase: task.phase || schedulePhaseLabels[row.name] || "项目阶段",
      })));
      const allTasks = [...(existing?.tasks || []), ...mergedTasks];
      const dates = allTasks.map((task: any) => task.deadline).filter(Boolean).sort();
      const merged = {
        ...(existing || {}),
        id: existing?.id || target.id,
        name: existing?.name || target.name,
        startDate: existing?.startDate || rows.map((row: any) => row.startDate).filter(Boolean).sort()[0],
        endDate: dates.at(-1) || existing?.endDate || rows.map((row: any) => row.endDate).filter(Boolean).sort().at(-1),
        progress: existing?.progress || 0,
        status: existing?.status || "pending",
        tasks: allTasks,
      };
      return [merged, ...current.filter((item: any) => !schedulePhasePattern.test(item.name || "") && item.id !== merged.id)];
    });
  }, [boardData, data, setData]);

  useEffect(() => {
    const handleFocusRisk = (event: Event) => {
      const risk = (event as CustomEvent).detail;
      if (risk?.actionTab !== "schedule") return;

      const targetProject = data.find((project: any) => project.id === risk.projectId || project.name === risk.projectName);
      if (targetProject) {
        setSelectedProject(targetProject.name);
        setExpandedProjects((current) => current.includes(targetProject.id) ? current : [...current, targetProject.id]);
        const targetTask = targetProject.tasks?.find((task: any) => task.id === risk.taskId);
        if (targetTask && risk.action === "deadline") {
          setEditingTask({ projectId: targetProject.id, taskId: targetTask.id, taskName: targetTask.name, deadline: targetTask.deadline });
        }
        if (targetTask && risk.action === "assign") {
          const assignee = window.prompt("请输入负责人姓名或协作单位", targetTask.assignee === "待指派" ? "" : targetTask.assignee);
          if (assignee?.trim()) {
            void setData((current: any[]) => current.map((project: any) => project.id !== targetProject.id ? project : { ...project, tasks: project.tasks.map((task: any) => task.id === targetTask.id ? { ...task, assignee: assignee.trim() } : task) }));
            window.dispatchEvent(new CustomEvent("show-toast", { detail: "负责人已指派，首页风险会自动更新" }));
          }
        }
        if (targetTask && risk.action === "complete" && targetTask.status !== "completed") {
          void setData((current: any[]) => current.map((project: any) => project.id !== targetProject.id ? project : { ...project, tasks: project.tasks.map((task: any) => task.id === targetTask.id ? { ...task, status: "completed" } : task) }));
          window.dispatchEvent(new CustomEvent("show-toast", { detail: "任务已标记完成，首页风险会自动更新" }));
        }
      } else {
        setSelectedProject("全部项目");
      }

      if (risk.taskId) {
        setFocusedTaskId(risk.taskId);
        setTaskFilter("project");
        window.setTimeout(() => {
          document.getElementById(`schedule-task-${risk.taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
        window.setTimeout(() => setFocusedTaskId(null), 3200);
      }
    };

    window.addEventListener("focus-risk", handleFocusRisk);
    return () => window.removeEventListener("focus-risk", handleFocusRisk);
  }, [data]);

  // 当 data 更新时，如果 newTaskProject 为空且有项目，则默认选中第一个
  React.useEffect(() => {
    if ((!newTaskProject || !data.find((p: any) => p.name === newTaskProject)) && data.length > 0) {
      const firstProject = data.find((item: any) => !schedulePhasePattern.test(item.name || ""));
      if (firstProject) setNewTaskProject(firstProject.name);
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

  const editTaskDetails = (projectId: string, taskId: string) => {
    const project = data.find((item: any) => item.id === projectId);
    const task = project?.tasks?.find((item: any) => item.id === taskId);
    if (!project || !task) return;
    const name = window.prompt("修改任务名称", task.name);
    if (name === null || !name.trim()) return;
    const assignee = window.prompt("修改负责人", task.assignee || "待指派");
    if (assignee === null) return;
    setData((current: any[]) => current.map((item: any) => item.id !== projectId ? item : { ...item, tasks: item.tasks.map((entry: any) => entry.id === taskId ? { ...entry, name: name.trim(), assignee: assignee.trim() || "待指派" } : entry) }));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "任务信息已修改" }));
  };

  const deleteTask = (projectId: string, taskId: string) => {
    const project = data.find((item: any) => item.id === projectId);
    const task = project?.tasks?.find((item: any) => item.id === taskId);
    if (!project || !task || !window.confirm(`确定删除任务“${task.name}”吗？`)) return;
    setData((current: any[]) => current.map((item: any) => item.id !== projectId ? item : { ...item, tasks: item.tasks.filter((entry: any) => entry.id !== taskId).map((entry: any) => entry.predecessorId === taskId ? { ...entry, predecessorId: null } : entry) }));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "任务已删除" }));
  };

  const deleteWholeSchedule = () => {
    const project = data.find((item: any) => item.name === selectedProject);
    if (!project || !canManageSchedule || !window.confirm(`确定将“${project.name}”整份排期移入回收站吗？`)) return;
    const now = new Date();
    const deleted = { ...project, deletedAt: now.toISOString(), deletedBy: user?.name || "当前用户", expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString() };
    void setData((current: any[]) => current.filter((item: any) => item.id !== project.id));
    void setScheduleTrash((current: any[]) => [deleted, ...current.filter((item: any) => item.id !== project.id)]);
    setSelectedProject("全部项目");
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "整份排期已移入回收站，30天内可恢复" }));
  };

  const restoreSchedule = (schedule: any) => {
    if (!canManageSchedule) return;
    void setData((current: any[]) => [...current, { ...schedule, deletedAt: undefined, deletedBy: undefined, expiresAt: undefined }]);
    void setScheduleTrash((current: any[]) => current.filter((item: any) => item.id !== schedule.id));
  };

  const permanentlyDeleteSchedule = (schedule: any) => {
    if (!canManageSchedule || !window.confirm(`永久删除排期“${schedule.name}”？`)) return;
    void setScheduleTrash((current: any[]) => current.filter((item: any) => item.id !== schedule.id));
  };

  const filteredData = selectedProject === "全部项目" 
    ? data.filter((p: any) => !schedulePhasePattern.test(p.name || "") && (eligibleProjectIds.has(p.id) || !boardData.flatMap((column: any) => column.projects || []).some((project: any) => project.id === p.id)))
    : data.filter((p: any) => p.name === selectedProject && !schedulePhasePattern.test(p.name || "") && (eligibleProjectIds.has(p.id) || !boardData.flatMap((column: any) => column.projects || []).some((project: any) => project.id === p.id)));

  const allFlatTasks = React.useMemo(() => flattenTasks(data), [data]);
  const todayStr = formatLocalDate();
  const taskBuckets = React.useMemo(() => ({
    project: allFlatTasks.filter((task: any) => task.status !== "completed"),
    mine: allFlatTasks.filter((task: any) => task.assignee && task.assignee !== "待指派"),
    overdue: allFlatTasks.filter((task: any) => task.deadline && task.deadline < todayStr && task.status !== "completed"),
    unassigned: allFlatTasks.filter((task: any) => !task.responsibilityType && (!task.assignee || task.assignee === "待指派")),
    external: allFlatTasks.filter((task: any) => task.responsibilityType === "外协单位" || task.responsibilityType === "外包个人"),
    externalOverdue: allFlatTasks.filter((task: any) => (task.responsibilityType === "外协单位" || task.responsibilityType === "外包个人") && task.deadline && task.deadline < todayStr && task.status !== "completed"),
    quick: allFlatTasks.filter((task: any) => task.source === "quick-intake"),
  }), [allFlatTasks, todayStr]);

  const taskFilterLabels = {
    project: "项目待办",
    mine: "我的待办",
    overdue: "逾期待办",
    unassigned: "责任未明确",
    external: "外协任务",
    externalOverdue: "外协逾期",
    quick: "来自快速待办",
  };
  const visibleTaskList = taskBuckets[taskFilter];

  const addProjectTarget = (project: any) => {
    const current = projectMeta[project.id] || {};
    const targetEnd = window.prompt("请输入新的目标完成日期（YYYY-MM-DD）", current.targetEnd || project.endDate || "");
    if (!targetEnd) return;
    const reason = window.prompt("请输入本次目标调整原因", current.varianceReason || "");
    void setProjectMeta((all) => ({ ...all, [project.id]: { ...current, targetEnd, varianceReason: reason || "未填写", updatedAt: new Date().toISOString() } }));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目目标已更新" }));
  };

  const daysBetween = (from?: string, to?: string) => {
    if (!from || !to) return null;
    const value = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    return Number.isFinite(value) ? value : null;
  };

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
      const template = savedTemplates.find(t => t.id === selectedTemplate);
      if (!template) return;
      
      let currentDate = new Date(startDateRaw);
      const generationId = Date.now();
      const generatedIds = template.tasks.map((_: any, index: number) => `t_${generationId}_${index}`);
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
          id: generatedIds[index],
          name: t.name,
          start: startStr,
          end: endStr,
          deadline: deadline,
          status: "pending",
          assignee: "待指派",
          predecessorId: index > 0 ? generatedIds[index - 1] : null
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
    const responsibilityType = (form.elements.namedItem('responsibilityType') as HTMLSelectElement).value;
    const responsibleId = (form.elements.namedItem('responsibleId') as HTMLSelectElement).value;
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
                responsibilityType,
                responsibleId,
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
                responsibilityType,
                responsibleId,
                predecessorId
            }]
         });
      }

      return newData;
    });

    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '新建排期计划成功' }));
  };

  const saveCurrentAsTemplate = () => {
    const source = data.find((project: any) => project.name === newTaskProject);
    if (!source?.tasks?.length) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请先选择一个已有任务的项目' }));
      return;
    }
    const name = window.prompt('请输入排期模板名称', `${source.name}排期模板`);
    if (!name?.trim()) return;
    const tasks = source.tasks.map((task: any, index: number) => {
      const previous = source.tasks[index - 1];
      const gap = previous?.deadline && task.deadline
        ? Math.round((new Date(task.deadline).getTime() - new Date(previous.deadline).getTime()) / 86400000)
        : 1;
      return { name: task.name, days: Math.max(1, gap) };
    });
    void setSavedTemplates((current) => [{ id: `custom-${Date.now()}`, name: name.trim(), tasks }, ...current]);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '排期模板已保存，可在“从模板生成”中复用' }));
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
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">施工日程管理</h2>
          <p className="text-slate-500 text-sm mt-1">全局掌控工程节点，预防工期延误</p>
        </div>
        <div className="flex w-full xl:w-auto flex-wrap gap-2 md:gap-3">
          <select 
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none px-3 md:px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm"
          >
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {canManageSchedule && selectedProject !== "全部项目" && <button type="button" onClick={deleteWholeSchedule} className="px-3 py-2 bg-white border border-rose-200 text-rose-600 rounded-lg text-sm font-medium hover:bg-rose-50"><Trash2 className="mr-1 inline h-4 w-4" />删除整份排期</button>}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setViewMode('gantt')} 
              className={cn("px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center transition-colors", viewMode === 'gantt' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <LayoutList className="w-4 h-4 mr-1.5" />
              甘特图
            </button>
            <button 
              onClick={() => setViewMode('table')} 
              className={cn("px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center transition-colors", viewMode === 'table' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
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
          <button onClick={saveCurrentAsTemplate} className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors shadow-sm flex items-center" title="将当前项目的任务顺序保存为可复用模板">
            <Save className="w-4 h-4 mr-2" />
            保存为模板
          </button>
          <button onClick={() => {
            const selected = allProjectsForSchedule.find((project: any) => project.name === selectedProject);
            if (selected && !eligibleProjectIds.has(selected.id)) { window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目需进入“项目交底”阶段后才能创建施工日程" })); return; }
            setIsModalOpen(true);
          }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            排期计划
          </button>
        </div>
      </div>
      {canManageSchedule && scheduleTrash.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-amber-900">待清理排期 / 回收站</p><p className="mt-1 text-xs text-amber-700">早于项目交底阶段或已删除的排期不会进入正常列表，删除后保留30天。</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-amber-700">{scheduleTrash.length} 份</span></div><div className="mt-3 space-y-2">{scheduleTrash.map((schedule: any) => <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm"><span className="font-medium text-slate-700">{schedule.name}</span><span className="text-xs text-slate-400">到期 {schedule.expiresAt?.slice(0, 10) || "-"}</span><div className="flex gap-2"><button type="button" onClick={() => restoreSchedule(schedule)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50">恢复</button><button type="button" onClick={() => permanentlyDeleteSchedule(schedule)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">永久删除</button></div></div>)}</div></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-slate-900">项目计划与现场目标</h3><p className="text-xs text-slate-500 mt-1">按项目查看计划、现场目标和时间偏差</p></div><span className="text-xs text-slate-400">{filteredData.length} 个项目</span></div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filteredData.map((project: any) => {
            const meta = projectMeta[project.id] || {};
            const targetEnd = meta.targetEnd || project.endDate;
            const variance = daysBetween(project.endDate, targetEnd);
            const phases = Array.from(new Set((project.tasks || []).map((task: any) => task.phase).filter(Boolean)));
            return <article key={project.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-slate-900">{project.name}</h4><p className="mt-1 text-xs text-slate-500">计划：{project.startDate || "未设置"} 至 {project.endDate || "未设置"}</p>{phases.length > 0 && <div className="mt-2 flex flex-wrap gap-1"><span className="text-[11px] text-slate-400">阶段组</span>{phases.map((phase: any) => <span key={phase} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">{phase}</span>)}</div>}</div><button onClick={() => addProjectTarget(project)} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 ring-1 ring-slate-200 hover:bg-indigo-50">新增/调整目标</button></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white p-2"><span className="text-slate-400">现场目标</span><p className="mt-1 font-semibold text-slate-700">{targetEnd || "未设置"}</p></div><div className="rounded-lg bg-white p-2"><span className="text-slate-400">计划偏差</span><p className={cn("mt-1 font-semibold", variance && variance > 0 ? "text-rose-600" : variance && variance < 0 ? "text-emerald-600" : "text-slate-700")}>{variance === null ? "待补充" : variance === 0 ? "无偏差" : `${variance > 0 ? "+" : ""}${variance} 天`}</p></div></div>{meta.varianceReason && <p className="mt-3 text-xs text-amber-700">偏差原因：{meta.varianceReason}</p>}</article>;
          })}
          {filteredData.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">暂无项目排期，请先创建项目或导入计划</div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-bold text-slate-900">任务管理视图</h3>
            <p className="text-xs text-slate-500 mt-1">快速筛选项目经理需要处理的任务</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["project", "mine", "overdue", "external", "externalOverdue", "unassigned", "quick"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTaskFilter(key)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", taskFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                {taskFilterLabels[key]} ({taskBuckets[key].length})
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleTaskList.slice(0, 6).map((task: any) => (
            <div id={focusedTaskId === task.id ? `schedule-task-card-${task.id}` : undefined} key={`${task.projectId}-${task.id}`} className={cn("rounded-xl border bg-slate-50 p-3 transition-all", focusedTaskId === task.id ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50" : "border-slate-100")}>
            <div className="flex items-center justify-between gap-2"><div className="text-sm font-medium text-slate-900 line-clamp-1">{task.name}</div><div className="flex shrink-0 gap-1"><button onClick={() => editTaskDetails(task.projectId, task.id)} className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="修改任务"><Edit2 className="h-3.5 w-3.5" /></button><button onClick={() => deleteTask(task.projectId, task.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="删除任务"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
              <div className="text-xs text-slate-500 mt-1">{task.projectName} · {task.responsibilityType || "内部人员"}：{task.assignee || "待指派"} · {task.deadline || "无截止"}</div>
              {task.sourceSummary && <div className="text-xs text-slate-400 mt-2 line-clamp-1">来源：{task.sourceSummary}</div>}
            </div>
          ))}
          {visibleTaskList.length === 0 && (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
              当前筛选暂无任务
            </div>
          )}
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
                        <div id={focusedTaskId === task.id ? `schedule-task-${task.id}` : undefined} key={task.id} className={cn("flex items-center py-3 border-b border-slate-50 last:border-0 group transition-all", focusedTaskId === task.id && "rounded-lg bg-amber-50 ring-2 ring-amber-200 px-2 -mx-2")}>
                          <div className="w-[20%] flex items-center gap-3">
                            {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                            {task.status === 'in-progress' && <Clock className="w-4 h-4 text-blue-500 shrink-0" />}
                            {task.status === 'delayed' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                            {task.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                            <span className="flex min-w-0 items-center gap-1 text-sm text-slate-700 group-hover:text-indigo-600 transition-colors truncate" title={task.name}><span className="truncate">{task.name}</span><button onClick={(e) => { e.stopPropagation(); editTaskDetails(project.id, task.id); }} className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="修改任务"><Edit2 className="h-3 w-3" /></button><button onClick={(e) => { e.stopPropagation(); deleteTask(project.id, task.id); }} className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="删除任务"><Trash2 className="h-3 w-3" /></button></span>
                          </div>
                          
                          <div className="w-[10%] flex items-center">
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md truncate">{task.assignee}</span>
                          </div>
                          <div className="w-[10%] flex items-center">
                            <span className={cn("text-[10px] px-2 py-1 rounded-md truncate", task.responsibilityType === "外协单位" || task.responsibilityType === "外包个人" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500")}>
                              {task.responsibilityType || "内部人员"}
                            </span>
                          </div>
                          
                          <div className="w-[10%] flex items-center">
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

                          <div className="w-[14%] flex items-center gap-1">
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

                          <div className="w-[14%] flex items-center gap-1">
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

                          <div className="w-[26%] flex items-center">
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
                  <th className="px-6 py-4">责任主体</th>
                  <th className="px-6 py-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.flatMap(project => 
                  project.tasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 font-medium text-slate-900">{project.name}</td>
                      <td className="px-6 py-4 text-slate-700"><div className="flex items-center gap-2"><span>{task.name}</span><button onClick={() => editTaskDetails(project.id, task.id)} className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="修改任务"><Edit2 className="h-3.5 w-3.5" /></button><button onClick={() => deleteTask(project.id, task.id)} className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="删除任务"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
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
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-700">{task.assignee}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{task.responsibilityType || "内部人员"}</div>
                      </td>
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
                      {savedTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
                      <input type="text" name="assignee" required list="schedule-responsible-options" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="姓名/单位名称" />
                      <datalist id="schedule-responsible-options">
                        {externalPartners.map((partner: any) => <option key={partner.id} value={partner.name} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">责任主体类型</label>
                      <select name="responsibilityType" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                        <option>内部人员</option>
                        <option>内部班组</option>
                        <option>外协单位</option>
                        <option>外包个人</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">关联外协</label>
                      <select name="responsibleId" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                        <option value="">不关联</option>
                        {externalPartners.map((partner: any) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                      </select>
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
