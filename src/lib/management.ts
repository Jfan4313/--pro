export function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function flattenProjects(projectBoardData: any[] = []) {
  return Array.isArray(projectBoardData) ? projectBoardData.flatMap((column: any) => column.projects || []) : [];
}

/** Stable user-facing project identifier, with a backwards-compatible fallback for legacy records. */
export function getProjectNumber(project: any, fallbackIndex = 0) {
  if (project?.projectNumber) return String(project.projectNumber);
  if (project?.code) return String(project.code);
  const id = String(project?.id || "");
  const suffix = id.match(/(\d{3,})$/)?.[1] || String(fallbackIndex + 1);
  return `PRJ-${suffix.slice(-4).padStart(4, "0")}`;
}

export function flattenTasks(scheduleData: any[] = []) {
  if (!Array.isArray(scheduleData)) return [];
  return scheduleData.flatMap((project: any) =>
    (project.tasks || []).map((task: any) => ({
      ...task,
      projectId: project.id,
      projectName: project.name,
    }))
  );
}

export function buildTaskFromQuickIntake(item: any) {
  const deadline = item.deadline || formatLocalDate();
  return {
    id: `todo-${Date.now()}`,
    name: item.title,
    start: deadline.split("-").slice(1).join("-"),
    end: deadline.split("-").slice(1).join("-"),
    deadline,
    status: "pending",
    priority: item.priority || "normal",
    assignee: item.assignee || "待指派",
    predecessorId: null,
    source: "quick-intake",
    sourceType: item.sourceType,
    sourceSummary: item.summary,
    attachmentUrl: item.attachmentUrl || "",
  };
}

export function appendTaskToSchedule(scheduleData: any[], project: any, task: any) {
  const current = Array.isArray(scheduleData) ? scheduleData : [];
  let exists = false;
  const next = current.map((group: any) => {
    if (group.id === project.id || group.name === project.name) {
      exists = true;
      return {
        ...group,
        endDate: group.endDate && group.endDate > task.deadline ? group.endDate : task.deadline,
        tasks: [...(Array.isArray(group.tasks) ? group.tasks : []), task],
      };
    }
    return group;
  });

  if (!exists) {
    next.push({
      id: project.id,
      name: project.name,
      startDate: task.deadline,
      endDate: task.deadline,
      progress: 0,
      status: "pending",
      tasks: [task],
    });
  }

  return next;
}

export function deriveRisks({
  projects = [],
  tasks = [],
  supplyOrders = [],
  contracts = [],
  costData = [],
  personnel = [],
  externalPartners = [],
}: {
  projects?: any[];
  tasks?: any[];
  supplyOrders?: any[];
  contracts?: any[];
  costData?: any[];
  personnel?: any[];
  externalPartners?: any[];
}) {
  const today = formatLocalDate();
  const risks: any[] = [];

  tasks.forEach((task: any) => {
    if (task.deadline && task.deadline < today && task.status !== "completed") {
      risks.push({
        id: `task-${task.projectId}-${task.id}`,
        level: "high",
        type: "任务逾期",
        title: task.name,
        projectName: task.projectName,
        projectId: task.projectId,
        taskId: task.id,
        actionTab: "schedule",
      });
    }
    if (!task.assignee || task.assignee === "待指派") {
      risks.push({
        id: `assignee-${task.projectId}-${task.id}`,
        level: "medium",
        type: "未分配负责人",
        title: task.name,
        projectName: task.projectName,
        projectId: task.projectId,
        taskId: task.id,
        actionTab: "schedule",
      });
    }
  });

  supplyOrders.forEach((order: any) => {
    if (order.status === "delayed" || (order.expectedDate && order.expectedDate < today && order.status !== "delivered")) {
      const project = projects.find((p: any) => p.id === order.projectId);
      risks.push({
        id: `supply-${order.id}`,
        level: "high",
        type: "材料到货风险",
        title: order.items || order.id,
        projectId: order.projectId,
        orderId: order.id,
        projectName: project?.name || order.projectName || "未关联项目",
        actionTab: "supply",
      });
    }
  });

  projects.forEach((project: any) => {
    const hasContract = contracts.some((contract: any) => String(contract.name || "").includes(project.name) || contract.projectId === project.id);
    if (!hasContract && project.constructProgress > 0) {
      risks.push({
        id: `contract-${project.id}`,
        level: "medium",
        type: "合同缺失",
        title: "项目已有施工进展但未关联合同",
        projectId: project.id,
        projectName: project.name,
        actionTab: "contracts",
      });
    }
  });

  costData.forEach((cost: any) => {
    const budget = (cost.budget?.material || 0) + (cost.budget?.labor || 0) + (cost.budget?.management || 0) + (cost.budget?.risk || 0);
    const actual = (cost.actualLedger || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    if (budget > 0 && actual > budget) {
      risks.push({
        id: `cost-${cost.id}`,
        level: "high",
        type: "成本超支",
        title: `实际 ${actual} 万 / 预算 ${budget} 万`,
        projectId: cost.id,
        costId: cost.id,
        projectName: cost.project,
        actionTab: "cost",
      });
    }
  });

  personnel.forEach((person: any) => {
    if (person.safetyTrained === false && Array.isArray(person.projects) && person.projects.length > 0) {
      risks.push({
        id: `safety-${person.id || person.name}`,
        level: "medium",
        type: "安全培训风险",
        title: `${person.name} 未完成安全培训`,
        personId: person.id,
        projectName: person.projects[0]?.name || "未指定项目",
        actionTab: "personnel",
      });
    }
  });

  externalPartners.forEach((partner: any) => {
    const projectNames = partner.projectNames || [];
    const linkedProjects = projects.filter((project: any) => (partner.projectIds || []).includes(project.id) || projectNames.includes(project.name));
    const shouldCheck = linkedProjects.length > 0 || projects.length === 0;
    if (!shouldCheck) return;

    if (!partner.contractId && partner.status !== "archived") {
      risks.push({
        id: `partner-contract-${partner.id}`,
        level: "high",
        type: "外协合同缺失",
        title: `${partner.name} 未关联合同`,
        partnerId: partner.id,
        projectId: linkedProjects[0]?.id,
        projectName: projectNames[0] || linkedProjects[0]?.name || "未关联项目",
        actionTab: "partners",
      });
    }

    const uploaded = new Set(partner.uploadedDocs || []);
    const missingDocs = (partner.requiredDocs || []).filter((doc: string) => !uploaded.has(doc));
    if (missingDocs.length > 0 && partner.status !== "archived") {
      risks.push({
        id: `partner-docs-${partner.id}`,
        level: "medium",
        type: "外协资料缺失",
        title: `${partner.name} 缺少 ${missingDocs.slice(0, 2).join("、")}`,
        partnerId: partner.id,
        projectId: linkedProjects[0]?.id,
        projectName: projectNames[0] || linkedProjects[0]?.name || "未关联项目",
        actionTab: "partners",
      });
    }
  });

  tasks.forEach((task: any) => {
    if ((task.responsibilityType === "外协单位" || task.responsibilityType === "外包个人") && task.deadline && task.deadline < today && task.status !== "completed") {
      risks.push({
        id: `external-task-${task.projectId}-${task.id}`,
        level: "high",
        type: "外协任务逾期",
        title: task.name,
        projectName: task.projectName,
        projectId: task.projectId,
        taskId: task.id,
        actionTab: "schedule",
      });
    }
    if (!task.responsibilityType && (!task.assignee || task.assignee === "待指派")) {
      risks.push({
        id: `responsibility-${task.projectId}-${task.id}`,
        level: "medium",
        type: "责任主体未明确",
        title: task.name,
        projectName: task.projectName,
        projectId: task.projectId,
        taskId: task.id,
        actionTab: "schedule",
      });
    }
  });

  return risks;
}
