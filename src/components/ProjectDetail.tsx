import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, Camera, DollarSign, FileText, Handshake, Package, Truck, Users } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { deriveRisks, flattenProjects, flattenTasks, getProjectNumber } from "@/src/lib/management";
import { getProjectCurrentStageInfo } from "@/src/lib/projectLifecycle";
import { getMissingDocs } from "./ExternalPartners";
import { useEntityList } from "@/src/hooks/useEntityList";
import { offlineDb } from "@/src/lib/offlineDb";
import { resolveProjectReference } from "@/src/lib/projectNumbering";

export function ProjectDetail({ projectId, onBack, setActiveTab, onOpenLifecycle, onOpenSurvey }: { projectId: string | null; onBack: () => void; setActiveTab: (tab: string) => void; onOpenLifecycle?: (projectReference: string) => void; onOpenSurvey?: (projectId: string) => void }) {
  const [projectBoardData] = useProjectBoardData();
  const [scheduleData] = useSyncedAppData<any[]>("scheduleData", []);
  const [contracts] = useSyncedAppData<any[]>("project_contracts", []);
  const [supplyOrders] = useSyncedAppData<any[]>("supplyOrders", []);
  const [materials] = useSyncedAppData<any[]>("materialsData", []);
  const [costData] = useSyncedAppData<any[]>("costDataV2", []);
  const [personnel] = useSyncedAppData<any[]>("personnelData", []);
  const [externalPartners] = useSyncedAppData<any[]>("externalPartners", []);
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const { data: surveyRecords } = useEntityList<any>("site-surveys", []);
  const [pendingSurveys, setPendingSurveys] = useState<any[]>([]);

  const projects = flattenProjects(projectBoardData);
  const resolvedProject = resolveProjectReference(projects, projectId);
  const project = resolvedProject.project || (!projectId ? projects[0] : null);
  const tasks = flattenTasks(scheduleData).filter((task: any) => task.projectId === project?.id || task.projectName === project?.name);
  const projectContracts = contracts.filter((contract: any) => contract.projectId === project?.id || String(contract.name || "").includes(project?.name || ""));
  const projectOrders = supplyOrders.filter((order: any) => order.projectId === project?.id || order.projectName === project?.name);
  const projectMaterials = materials.filter((item: any) => item.project === project?.name || item.projectId === project?.id);
  const projectCost = costData.find((item: any) => item.id === project?.id || item.project === project?.name);
  const projectPersonnel = personnel.filter((person: any) => person.name === project?.manager || person.projects?.some((p: any) => p.name === project?.name));
  const projectPartners = externalPartners.filter((partner: any) => (partner.projectIds || []).includes(project?.id) || (partner.projectNames || []).includes(project?.name));
  const projectSurveys = [
    ...pendingSurveys.filter((record: any) => record.form?.projectId === project?.id).map((record: any) => ({ id: record.id, surveyDate: record.form.surveyDate, roomName: record.form.roomName, photos: record.photos || [], status: "pending" })),
    ...surveyRecords.filter((record: any) => record.projectId === project?.id),
  ];
  const risks = deriveRisks({ projects: project ? [project] : [], tasks, supplyOrders: projectOrders, contracts: projectContracts, costData: projectCost ? [projectCost] : [], personnel: projectPersonnel, externalPartners: projectPartners });

  useEffect(() => {
    void offlineDb.listEntities<any>("site-survey-pending-uploads").then(setPendingSurveys);
  }, []);

  if (!project) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> 返回</button>
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无项目数据</div>
      </div>
    );
  }

  const stageInfo = getProjectCurrentStageInfo(project.id, lifecycleStates);
  const actualTotal = (projectCost?.actualLedger || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const budgetTotal = projectCost ? Object.values(projectCost.budget || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0) : 0;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto w-full">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> 返回项目汇总</button>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">{project.name}</h2>
            <span className="font-mono text-xs px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">项目编号: {getProjectNumber(project)}</span>
          </div>
          {(project.type || project.manager || project.dueDate) && <p className="text-sm text-slate-500 mt-1">{[project.type, project.manager ? `负责人 ${project.manager}` : "", project.dueDate ? `预计竣工 ${project.dueDate}` : ""].filter(Boolean).join(" · ")}</p>}
        </div>
        <button onClick={() => onOpenLifecycle?.(getProjectNumber(project))} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">进入生命周期</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric icon={FileText} label="当前阶段" value={stageInfo.stage.name.split(" ")[1]} />
        <Metric icon={Camera} label="现场勘察" value={`${projectSurveys.length} 次`} />
        <Metric icon={CalendarDays} label="待办任务" value={`${tasks.filter((t: any) => t.status !== "completed").length} 项`} />
        <Metric icon={Truck} label="采购订单" value={`${projectOrders.length} 单`} />
        <Metric icon={Handshake} label="参建外协" value={`${projectPartners.length} 个`} />
      </div>

      {risks.length > 0 && (
        <section className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
          <h3 className="font-bold text-rose-700 flex items-center gap-2 mb-3"><AlertTriangle className="w-5 h-5" /> 项目风险</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {risks.slice(0, 6).map((risk: any) => (
              <button key={risk.id} onClick={() => setActiveTab(risk.actionTab)} className="text-left bg-white rounded-xl border border-rose-100 p-3 hover:border-rose-300">
                <div className="text-xs font-bold text-rose-600">{risk.type}</div>
                <div className="text-sm font-medium text-slate-900 mt-1">{risk.title}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="现场勘察" action={projectSurveys.length > 0 ? "继续勘察" : "开始勘察"} onAction={() => onOpenSurvey?.(project.id)} icon={Camera}>
          {projectSurveys.slice(0, 5).map((survey: any) => <Row key={survey.id} title={survey.roomName || "现场勘察记录"} meta={`${survey.status === "pending" ? "待上传" : "已归档"} · ${survey.photos?.length || 0} 张 · ${survey.surveyDate || "未填写日期"}`} />)}
          {projectSurveys.length === 0 && <Empty text="尚未进行现场勘察，请在立项前期完成结构、电房及设备照片采集" />}
        </Panel>
        <Panel title="近期任务" action="查看日程" onAction={() => setActiveTab("schedule")} icon={CalendarDays}>
          {tasks.slice(0, 6).map((task: any) => (
            <Row key={task.id} title={task.name} meta={`${task.assignee || "待指派"} · ${task.deadline || "无截止"}`} />
          ))}
          {tasks.length === 0 && <Empty text="暂无任务" />}
        </Panel>
        <Panel title="合同与成本" action="查看成本" onAction={() => setActiveTab("cost")} icon={DollarSign}>
          <Row title="合同数量" meta={`${projectContracts.length} 份`} />
          <Row title="预算/实际" meta={`${budgetTotal || 0} 万 / ${actualTotal} 万`} />
        </Panel>
        <Panel title="参与方与责任分工" action="查看外协" onAction={() => setActiveTab("partners")} icon={Handshake}>
          {projectPartners.slice(0, 6).map((partner: any) => {
            const missingDocs = getMissingDocs(partner);
            return (
              <Row
                key={partner.id}
                title={`${partner.name} · ${partner.type}`}
                meta={`${partner.contractId ? "已关联合同" : "待签合同"} · 缺资料 ${missingDocs.length} 项`}
              />
            );
          })}
          {projectPartners.length === 0 && <Empty text="暂无参建单位关联" />}
        </Panel>
        <Panel title="采购与材料" action="查看供应链" onAction={() => setActiveTab("supply")} icon={Package}>
          {projectOrders.slice(0, 4).map((order: any) => <Row key={order.id} title={order.items || order.id} meta={`${order.status} · ${order.expectedDate || "无到货日"}`} />)}
          {projectMaterials.slice(0, 3).map((material: any) => <Row key={material.id} title={material.name} meta={`${material.stock ?? material.quantity ?? 0} ${material.unit || ""}`} />)}
          {projectOrders.length === 0 && projectMaterials.length === 0 && <Empty text="暂无采购或材料记录" />}
        </Panel>
        <Panel title="人员安排" action="查看人员" onAction={() => setActiveTab("personnel")} icon={Users}>
          {projectPersonnel.slice(0, 6).map((person: any) => <Row key={person.id || person.name} title={person.name} meta={`${person.role || "成员"} · ${person.safetyTrained === false ? "安全培训未完成" : "正常"}`} />)}
          {projectPersonnel.length === 0 && <Empty text="暂无人员关联" />}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: any) {
  return <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><Icon className="w-5 h-5 text-indigo-600 mb-4" /><div className="text-sm text-slate-500">{label}</div><div className="text-xl font-bold text-slate-900 mt-1">{value}</div></div>;
}

function Panel({ title, action, onAction, icon: Icon, children }: any) {
  return <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="font-bold text-slate-900 flex items-center gap-2"><Icon className="w-5 h-5 text-indigo-600" />{title}</h3><button onClick={onAction} className="text-sm text-indigo-600 font-medium">{action}</button></div><div className="p-5 space-y-3">{children}</div></section>;
}

function Row({ title, meta }: any) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 border border-slate-100 p-3"><div className="text-sm font-medium text-slate-900 truncate">{title}</div><div className="text-xs text-slate-500 shrink-0">{meta}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-slate-400 py-6 text-center">{text}</div>;
}
