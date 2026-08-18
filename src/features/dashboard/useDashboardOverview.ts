import { useEffect, useMemo } from "react";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { appendTaskToSchedule, buildTaskFromQuickIntake, deriveRisks, flattenProjects, flattenTasks, formatLocalDate } from "@/src/lib/management";
import { getProjectCurrentStageInfo } from "@/src/components/ProjectLifecycle";

export function useDashboardOverview() {
  const [projects] = useProjectBoardData();
  const [tasks, setTasks] = useSyncedAppData<any[]>("scheduleData", []);
  const [personnel] = useSyncedAppData<any[]>("personnelData", []);
  const [materials] = useSyncedAppData<any[]>("materialsData", []);
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [quickIntakeItems, setQuickIntakeItems] = useSyncedAppData<any[]>("quickIntakeItems", []);
  const [supplyOrders] = useSyncedAppData<any[]>("supplyOrders", []);
  const [contracts] = useSyncedAppData<any[]>("project_contracts", []);
  const [costData] = useSyncedAppData<any[]>("costDataV2", []);
  const [externalPartners] = useSyncedAppData<any[]>("externalPartners", []);

  // These records came from the original demo schedule seed. They are not
  // user-entered risks and should not create overdue warnings in a workspace.
  useEffect(() => {
    const demoRiskTaskNames = new Set([
      "方案深化与图纸审批",
      "设备招标及订单下达",
      "电房现场联合检查",
    ]);
    const hasDemoTasks = Array.isArray(tasks) && tasks.some((group: any) => (group.tasks || []).some((task: any) => demoRiskTaskNames.has(String(task.name || "").replace(/^.*：/, ""))));
    if (!hasDemoTasks) return;
    void setTasks((current: any[]) => (Array.isArray(current) ? current.map((group: any) => ({
      ...group,
      tasks: (group.tasks || []).filter((task: any) => !demoRiskTaskNames.has(String(task.name || "").replace(/^.*：/, ""))),
    })).filter((group: any) => (group.tasks || []).length > 0) : current));
  }, [tasks, setTasks]);

  const allFlatProjects = useMemo(() => flattenProjects(projects), [projects]);
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks]);
  const today = formatLocalDate();
  const todayTasks = useMemo(() => allTasks.filter((task: any) => task.deadline === today && task.status !== "completed"), [allTasks, today]);
  const overdueTasks = useMemo(() => allTasks.filter((task: any) => task.deadline && task.deadline < today && task.status !== "completed"), [allTasks, today]);
  const pendingQuickIntakes = useMemo(() => (Array.isArray(quickIntakeItems) ? quickIntakeItems : []).filter((item: any) => item.status === "pending"), [quickIntakeItems]);
  const risks = useMemo(() => deriveRisks({ projects: allFlatProjects, tasks: allTasks, supplyOrders, contracts, costData, personnel, externalPartners }), [allFlatProjects, allTasks, supplyOrders, contracts, costData, personnel, externalPartners]);

  const lifecycleSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    const recentProjects: any[] = [];

    allFlatProjects.forEach((proj: any) => {
      const info = getProjectCurrentStageInfo(proj.id, lifecycleStates);
      counts[info.stage.id] = (counts[info.stage.id] || 0) + 1;
      recentProjects.push({
        ...proj,
        stageName: info.stage.name,
        progressPercent: info.progressPercent,
      });
    });

    return { counts, recentProjects };
  }, [allFlatProjects, lifecycleStates]);

  const stats = useMemo(() => {
    let totalProjects = 0;
    projects.forEach((col: any) => {
      totalProjects += col.projects?.length || 0;
    });

    let lowStockMaterials = 0;
    materials.forEach((mat: any) => {
      if (mat.status !== "sufficient") lowStockMaterials++;
    });

    return {
      totalProjects,
      delayedTasks: overdueTasks.length,
      totalPersonnel: personnel.length,
      lowStockMaterials,
    };
  }, [projects, overdueTasks.length, personnel, materials]);

  const pendingApprovals = useMemo(() => {
    const pendingContracts = contracts.filter((item: any) => item.status === "pending" || item.status === "draft").length;
    const pendingOrders = supplyOrders.filter((item: any) => item.approvalStatus === "pending" || item.status === "production").length;
    const pendingCollections = costData.reduce((count: number, project: any) => count + (project.collection?.records || []).filter((record: any) => record.status === "pending").length, 0);
    return pendingContracts + pendingOrders + pendingCollections;
  }, [contracts, supplyOrders, costData]);

  const pendingApprovalTab = useMemo(() => {
    if (contracts.some((item: any) => item.status === "pending" || item.status === "draft")) return "contracts";
    if (supplyOrders.some((item: any) => item.approvalStatus === "pending" || item.status === "production")) return "supply";
    if (costData.some((project: any) => (project.collection?.records || []).some((record: any) => record.status === "pending"))) return "cost";
    return "work-memo";
  }, [contracts, supplyOrders, costData]);

  const financeSummary = useMemo(() => {
    return costData.reduce((acc: any, project: any) => {
      const budget = (project.budget?.material || 0) + (project.budget?.labor || 0) + (project.budget?.management || 0) + (project.budget?.risk || 0);
      const actual = (project.actualLedger || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
      acc.budget += budget;
      acc.actual += actual;
      return acc;
    }, { budget: 0, actual: 0 });
  }, [costData]);

  const acceptedProjects = allFlatProjects.filter((project: any) => project.status === "success" || project.constructProgress >= 100).length;
  const fundUsage = financeSummary.budget > 0 ? Math.round((financeSummary.actual / financeSummary.budget) * 100) : 0;

  const confirmQuickIntake = async (item: any) => {
    const project = allFlatProjects.find((p: any) => p.id === item.projectId || p.name === item.projectName);
    if (!project) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请先为该待办选择有效项目" }));
      return;
    }
    const task = buildTaskFromQuickIntake(item);
    await setTasks((prev: any[]) => appendTaskToSchedule(prev, project, task));
    await setQuickIntakeItems((prev: any[]) => (Array.isArray(prev) ? prev : []).map((entry: any) => entry.id === item.id ? {
      ...entry,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      auditTrail: [...(entry.auditTrail || []), { action: "confirmed", actor: "项目经理", at: new Date().toISOString(), note: "写入施工日程" }],
    } : entry));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "待办已确认并写入施工日程" }));
  };

  const rejectQuickIntake = async (item: any) => {
    await setQuickIntakeItems((prev: any[]) => (Array.isArray(prev) ? prev : []).map((entry: any) => entry.id === item.id ? {
      ...entry,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      auditTrail: [...(entry.auditTrail || []), { action: "rejected", actor: "项目经理", at: new Date().toISOString(), note: "从待确认池驳回" }],
    } : entry));
  };

  return {
    acceptedProjects,
    allFlatProjects,
    confirmQuickIntake,
    financeSummary,
    fundUsage,
    lifecycleSummary,
    overdueTasks,
    pendingApprovals,
    pendingApprovalTab,
    pendingQuickIntakes,
    rejectQuickIntake,
    risks,
    stats,
    todayTasks,
  };
}
