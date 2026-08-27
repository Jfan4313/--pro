export type FollowUpInfo = {
  chainId?: string;
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
  chainId?: string;
};

export function getAssignees(item: {
  assignees?: unknown;
  assignee?: unknown;
}): string[] {
  if (Array.isArray(item.assignees))
    return item.assignees
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  if (typeof item.assignees === "string" && item.assignees.trim())
    return [item.assignees.trim()];
  if (typeof item.assignee === "string" && item.assignee.trim())
    return [item.assignee.trim()];
  return [];
}

export function getDisplayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "title", "label", "text", "value"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "";
}

export function samePerson(value: string | undefined, user: any) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    Boolean(normalized) &&
    [user?.name, user?.username]
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
      .includes(normalized)
  );
}

export function canCreateFollowUp(item: FollowUpParent, user: any) {
  return Boolean(
    samePerson(item.creator, user) ||
      getAssignees(item).some((name) => samePerson(name, user)) ||
      user?.role === "admin" ||
      user?.permissions?.includes("*"),
  );
}

export function canManageWorkMemo(item: { creator?: string }, user: any) {
  return Boolean(
    samePerson(item.creator, user) ||
      ["admin", "company_admin"].includes(user?.role) ||
      user?.permissions?.includes("*"),
  );
}

function isSameProject(
  left: { projectId?: string; projectName?: string },
  right: { projectId?: string; projectName?: string },
) {
  const leftId = String(left.projectId || "").trim();
  const rightId = String(right.projectId || "").trim();
  if (leftId && rightId) return leftId === rightId;
  const leftName = String(left.projectName || "").trim().toLowerCase();
  const rightName = String(right.projectName || "").trim().toLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
}

export function getTaskDescendantIds<
  T extends { id: string; parentMemoId?: string },
>(records: T[] = [], taskId: string) {
  const childrenByParent = new Map<string, string[]>();
  records.forEach((item) => {
    if (!item.parentMemoId) return;
    childrenByParent.set(item.parentMemoId, [
      ...(childrenByParent.get(item.parentMemoId) || []),
      item.id,
    ]);
  });
  const descendants = new Set<string>();
  const pending = [...(childrenByParent.get(taskId) || [])];
  while (pending.length) {
    const id = pending.shift()!;
    if (descendants.has(id)) continue;
    descendants.add(id);
    pending.push(...(childrenByParent.get(id) || []));
  }
  return descendants;
}

export function getTaskParentOptions<
  T extends {
    id: string;
    title?: string;
    projectId?: string;
    projectName?: string;
    parentMemoId?: string;
  },
>(
  records: T[] = [],
  task: { id: string; projectId?: string; projectName?: string },
) {
  if (!task.projectId && !task.projectName) return [];
  const excluded = getTaskDescendantIds(records, task.id);
  excluded.add(task.id);
  return records.filter(
    (candidate) => !excluded.has(candidate.id) && isSameProject(candidate, task),
  );
}

export function canDeleteWorkMemo<
  T extends { id: string; parentMemoId?: string },
>(records: T[] = [], taskId: string) {
  return !records.some((item) => item.parentMemoId === taskId);
}

export function reparentTaskRecords<
  T extends {
    id: string;
    title?: string;
    projectId?: string;
    projectName?: string;
    parentMemoId?: string;
    rootMemoId?: string;
    chainId?: string;
    relationType?: "follow-up";
  },
>(records: T[] = [], taskId: string, parentId = "") {
  const task = records.find((item) => item.id === taskId);
  if (!task) return records;
  const parent = parentId
    ? records.find((item) => item.id === parentId)
    : undefined;
  if (
    parentId &&
    (!parent ||
      !getTaskParentOptions(records, task as any).some(
        (item) => item.id === parentId,
      ))
  )
    return records;

  const descendants = getTaskDescendantIds(records, taskId);
  const branchIds = new Set([taskId, ...descendants]);
  const rootId = parent
    ? parent.rootMemoId || parent.chainId || parent.id
    : taskId;
  return records.map((item) => {
    if (!branchIds.has(item.id)) return item;
    if (item.id === taskId) {
      return {
        ...item,
        parentMemoId: parent?.id,
        rootMemoId: parent ? rootId : undefined,
        chainId: parent ? rootId : undefined,
        relationType: parent ? ("follow-up" as const) : undefined,
      };
    }
    return { ...item, rootMemoId: rootId, chainId: rootId };
  });
}

export function getRootMemoId(item: FollowUpParent) {
  return item.rootMemoId || item.id;
}

export function getTaskChainId(item: {
  rootMemoId?: string;
  chainId?: string;
  id: string;
}) {
  return item.chainId || item.rootMemoId || item.id;
}

export function buildTaskChain<
  T extends {
    id: string;
    title: string;
    parentMemoId?: string;
    rootMemoId?: string;
    chainId?: string;
  },
>(records: T[], rootId: string) {
  const root = records.find((item) => item.id === rootId);
  const chainId = getTaskChainId(root || { id: rootId });
  const chain = records.filter((item) => getTaskChainId(item) === chainId);
  const byParent = new Map<string, typeof chain>();
  chain.forEach((item) => {
    const parentId = item.parentMemoId || "__root__";
    byParent.set(parentId, [...(byParent.get(parentId) || []), item]);
  });
  return {
    chainId,
    root: root || chain.find((item) => !item.parentMemoId),
    byParent,
  };
}

export function getTaskChainRoots<
  T extends { id: string; parentMemoId?: string },
>(records: T[] = []) {
  const safeRecords = Array.isArray(records)
    ? records.filter((item) =>
        Boolean(item && typeof item === "object" && item.id),
      )
    : [];
  const ids = new Set(safeRecords.map((item) => item.id));
  return safeRecords.filter(
    (item) => !item.parentMemoId || !ids.has(item.parentMemoId),
  );
}

export function getTaskChains<
  T extends {
    id: string;
    title: string;
    parentMemoId?: string;
    rootMemoId?: string;
    chainId?: string;
  },
>(records: T[] = []) {
  return getTaskChainRoots(records).map((root) =>
    buildTaskChain(records, root.id),
  );
}

export const UNASSIGNED_PROJECT_KEY = "__unassigned__";

export function getTaskChainProject(chain: any) {
  const nodes = Array.from(chain?.byParent?.values?.() || []).flat() as any[];
  const root = chain?.root || {};
  const projectId = String(
    root.projectId || nodes.find((node) => node?.projectId)?.projectId || "",
  ).trim();
  const projectName = String(
    root.projectName ||
      nodes.find((node) => node?.projectName)?.projectName ||
      "",
  ).trim();
  return {
    key: projectId || projectName || UNASSIGNED_PROJECT_KEY,
    projectId,
    projectName,
  };
}

export function groupTaskChainsByProject<T = any>(chains: T[] = []) {
  const groups = new Map<
    string,
    { key: string; projectId: string; projectName: string; chains: T[] }
  >();
  chains.forEach((chain) => {
    const project = getTaskChainProject(chain);
    const existing = groups.get(project.key);
    if (existing) existing.chains.push(chain);
    else groups.set(project.key, { ...project, chains: [chain] });
  });
  return Array.from(groups.values());
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
    chainId: parent.chainId || getRootMemoId(parent),
    relationType: "follow-up" as const,
    createdAt: now,
  };
}

export function appendFollowUpToSchedule(scheduleData: any[] = [], task: any) {
  if (!task.projectId) return scheduleData;
  const next = Array.isArray(scheduleData) ? [...scheduleData] : [];
  const projectIndex = next.findIndex(
    (group) => group.id === task.projectId || group.name === task.projectName,
  );
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
    next.push({
      id: task.projectId,
      name: task.projectName,
      startDate: task.dueDate,
      endDate: task.dueDate,
      progress: 0,
      status: "pending",
      tasks: [scheduleTask],
    });
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
