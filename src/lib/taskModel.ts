import { useMemo } from "react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useEffect } from "react";
import { offlineDb } from "@/src/lib/offlineDb";

export type UnifiedTask = {
  id: string;
  projectId?: string;
  projectName?: string;
  title: string;
  name?: string;
  detail?: string;
  assignee?: string;
  assignees?: string[];
  dueDate?: string;
  deadline?: string;
  dueTime?: string;
  status: string;
  priority?: string;
  parentTaskId?: string;
  parentMemoId?: string;
  chainId?: string;
  rootMemoId?: string;
  createdBy?: string;
  creator?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

function normalizeTask(task: any, project?: any): UnifiedTask {
  const title = String(task?.title || task?.name || "未命名任务").trim();
  const dueDate = String(task?.dueDate || task?.deadline || "");
  return {
    ...task,
    id: String(task?.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    projectId: task?.projectId || project?.id || "",
    projectName: task?.projectName || project?.name || "",
    title,
    name: task?.name || title,
    detail: String(task?.detail || ""),
    assignee: String(task?.assignee || ""),
    assignees: Array.isArray(task?.assignees) ? task.assignees : task?.assignee ? [String(task.assignee)] : [],
    dueDate,
    deadline: task?.deadline || dueDate,
    status: String(task?.status || "pending"),
    priority: String(task?.priority || "normal"),
    parentTaskId: task?.parentTaskId || task?.parentMemoId || "",
    parentMemoId: task?.parentMemoId || task?.parentTaskId || "",
    chainId: task?.chainId || task?.rootMemoId || String(task?.id || ""),
    rootMemoId: task?.rootMemoId || task?.chainId || String(task?.id || ""),
    createdBy: task?.createdBy || task?.creator || "",
    creator: task?.creator || task?.createdBy || "",
    createdAt: task?.createdAt || new Date().toISOString(),
    updatedAt: task?.updatedAt || task?.createdAt || new Date().toISOString(),
  };
}

export function flattenLegacyTasks(scheduleData: any[] = [], workMemos: any[] = []): UnifiedTask[] {
  const scheduleTasks = Array.isArray(scheduleData)
    ? scheduleData.flatMap((project: any) => (Array.isArray(project?.tasks) ? project.tasks : []).map((task: any) => normalizeTask(task, project)))
    : [];
  const memoTasks = Array.isArray(workMemos) ? workMemos.map((task) => normalizeTask(task)) : [];
  return mergeTasks(scheduleTasks, memoTasks);
}

export function mergeTasks(...sources: UnifiedTask[][]): UnifiedTask[] {
  const byId = new Map<string, UnifiedTask>();
  for (const source of sources) {
    for (const task of source) {
      const normalized = normalizeTask(task);
      const previous = byId.get(normalized.id);
      if (!previous || String(normalized.updatedAt || normalized.createdAt || "") >= String(previous.updatedAt || previous.createdAt || "")) {
        byId.set(normalized.id, { ...previous, ...normalized });
      }
    }
  }
  return [...byId.values()];
}

export function tasksToSchedule(tasks: UnifiedTask[]): any[] {
  const groups = new Map<string, any>();
  for (const task of tasks) {
    const projectId = String(task.projectId || "");
    const projectName = String(task.projectName || "未关联项目");
    const key = projectId || `name:${projectName}`;
    const group = groups.get(key) || { id: projectId, name: projectName, startDate: task.deadline || task.dueDate || "", endDate: task.deadline || task.dueDate || "", progress: 0, status: "pending", tasks: [] };
    group.tasks.push({ ...task, name: task.name || task.title, deadline: task.deadline || task.dueDate });
    if (task.deadline && (!group.endDate || task.deadline > group.endDate)) group.endDate = task.deadline;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function scheduleToTasks(scheduleData: any[] = []): UnifiedTask[] {
  return Array.isArray(scheduleData)
    ? scheduleData.flatMap((project: any) => (Array.isArray(project?.tasks) ? project.tasks : []).map((task: any) => normalizeTask(task, project)))
    : [];
}

export function useUnifiedTasks() {
  const [tasks, setTasks, loading] = useSyncedAppData<UnifiedTask[]>("tasks", [], {
    keys: ["workMemos", "scheduleData"],
    shouldMigrate: (current) => !Array.isArray(current) || current.length === 0,
    mergeValues: (current, legacyValues) => mergeTasks(
      Array.isArray(current) ? current : [],
      ...legacyValues.flatMap((value: any) => Array.isArray(value) && value.some((item) => Array.isArray(item?.tasks)) ? [scheduleToTasks(value)] : [value]),
    ),
  });
  useEffect(() => { void offlineDb.setMeta("tasks-migration-version", 1); }, []);
  const scheduleData = useMemo(() => tasksToSchedule(Array.isArray(tasks) ? tasks : []), [tasks]);
  const records = useMemo(() => (Array.isArray(tasks) ? tasks : []).map((task) => normalizeTask(task)), [tasks]);
  const setScheduleData = async (next: any[] | ((current: any[]) => any[])) => {
    const value = typeof next === "function" ? next(scheduleData) : next;
    await setTasks((current) => mergeTasks(Array.isArray(current) ? current : [], scheduleToTasks(value)));
  };
  return { tasks: records, setTasks, scheduleData, setScheduleData, loading };
}
