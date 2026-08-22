export type FollowUpInfo = {
  parentMemoId?: string;
  rootMemoId?: string;
  followUpCount?: number;
  relationType?: "follow-up";
};

export type FollowUpParent = {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  creator?: string;
  assignee?: string;
  assignees?: string[];
  rootMemoId?: string;
};

export function samePerson(value: string | undefined, user: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized) && [user?.name, user?.username]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export function canCreateFollowUp(item: FollowUpParent, user: any) {
  return Boolean(samePerson(item.creator, user)
    || (item.assignees?.length ? item.assignees : [item.assignee]).some((name) => samePerson(name, user))
    || user?.role === "admin"
    || user?.permissions?.includes("*"));
}

export function getRootMemoId(item: FollowUpParent) {
  return item.rootMemoId || item.id;
}

export function createFollowUpRecord(
  parent: FollowUpParent,
  input: {
    title: string;
    detail: string;
    projectId?: string;
    projectName?: string;
    assignee: string;
    dueDate: string;
    priority: "normal" | "high";
  },
  user: any,
  now = new Date().toISOString(),
  id = `memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
) {
  return {
    id,
    title: input.title.trim(),
    detail: input.detail.trim(),
    projectId: input.projectId || "",
    projectName: (input.projectName || "").trim(),
    targetType: "internal" as const,
    crewName: "",
    crewContact: "",
    progress: 0,
    assignee: input.assignee.trim(),
    assignees: [input.assignee.trim()],
    creator: user?.name || user?.username || "系统用户",
    dueDate: input.dueDate,
    priority: input.priority,
    status: "pending" as const,
    feedback: "",
    parentMemoId: parent.id,
    rootMemoId: getRootMemoId(parent),
    relationType: "follow-up" as const,
    createdAt: now,
  };
}

export function appendFollowUpToSchedule(scheduleData: any[] = [], task: any) {
  if (!task.projectId) return scheduleData;
  const next = Array.isArray(scheduleData) ? [...scheduleData] : [];
  const projectIndex = next.findIndex((group) => group.id === task.projectId || group.name === task.projectName);
  const scheduleTask = {
    id: task.id,
    name: task.title,
    start: task.dueDate.slice(5),
    end: task.dueDate.slice(5),
    deadline: task.dueDate,
    status: task.status,
    responsibleEntities: [],
    assignee: task.assignee,
    assignees: task.assignees,
    parentMemoId: task.parentMemoId,
    rootMemoId: task.rootMemoId,
    relationType: task.relationType,
    source: "work-memo-follow-up",
    sourceMemoId: task.id,
    projectId: task.projectId,
    projectName: task.projectName,
  };
  if (projectIndex < 0) {
    next.push({ id: task.projectId, name: task.projectName, startDate: task.dueDate, endDate: task.dueDate, progress: 0, status: "pending", tasks: [scheduleTask] });
    return next;
  }
  const project = next[projectIndex];
  next[projectIndex] = {
    ...project,
    endDate: [project.endDate, task.dueDate].filter(Boolean).sort().at(-1),
    tasks: [...(project.tasks || []), scheduleTask],
  };
  return next;
}
