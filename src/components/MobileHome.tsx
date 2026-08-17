import { AlertTriangle, ArrowRight, CalendarCheck, Camera, CheckCircle2, ClipboardList, FolderOpen, MessageSquare, Search, Upload } from "lucide-react";
import { dispatchRiskFocus, type RiskAction } from "@/src/lib/riskActions";
import { PRODUCT_RELEASE_SUMMARY, PRODUCT_VERSION, PRODUCT_VERSION_DATE } from "@/src/lib/productVersion";

interface MobileHomeProps {
  projects: any[];
  todayTasks: any[];
  overdueTasks: any[];
  pendingApprovals: number;
  pendingApprovalTab: string;
  pendingQuickIntakes: any[];
  risks: any[];
  announcements: any[];
  setActiveTab: (tab: string) => void;
  onOpenProject?: (projectId: string) => void;
}

export function MobileHome({
  projects,
  todayTasks,
  overdueTasks,
  pendingApprovals,
  pendingApprovalTab,
  pendingQuickIntakes,
  risks,
  announcements,
  setActiveTab,
  onOpenProject,
}: MobileHomeProps) {
  const openRisk = (risk: any) => {
    setActiveTab(risk.actionTab);
    dispatchRiskFocus(risk);
  };
  const handleRiskAction = (risk: any, action: RiskAction) => {
    setActiveTab(risk.actionTab);
    dispatchRiskFocus(risk, action);
  };
  const dateText = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
  const metrics = [
    { label: "今日待办", value: todayTasks.length, tone: "bg-indigo-50 text-indigo-700", tab: "schedule" },
    { label: "已逾期", value: overdueTasks.length, tone: "bg-rose-50 text-rose-700", tab: "schedule" },
    { label: "待确认", value: pendingQuickIntakes.length, tone: "bg-amber-50 text-amber-700", tab: "schedule" },
    { label: "待审批", value: pendingApprovals, tone: "bg-slate-100 text-slate-700", tab: pendingApprovalTab },
  ];

  const actions = [
    { label: "现场勘察", note: "拍摄电房", icon: Camera, tab: "site-survey", tone: "bg-indigo-600 text-white" },
    { label: "今日待办", note: "现场任务", icon: ClipboardList, tab: "schedule", tone: "bg-white text-slate-800" },
    { label: "上传资料", note: "项目归档", icon: Upload, tab: "files", tone: "bg-white text-slate-800" },
    { label: "项目查询", note: "查看进度", icon: Search, tab: "board", tone: "bg-white text-slate-800" },
  ];

  return (
    <div className="md:hidden min-h-full bg-slate-50 px-4 pb-6 pt-4">
      <section className="overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-400">{dateText}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">现场工作台</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">先处理现场任务和风险，再查看完整管理数据。</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <CalendarCheck className="h-5 w-5" />
          </div>
        </div>
        <button onClick={() => setActiveTab("site-survey")} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-left text-slate-950">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Camera className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold">开始现场勘察</span>
              <span className="mt-0.5 block text-xs text-slate-500">记录电房情况并拍照归档</span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 text-slate-400" />
        </button>
      </section>

      <section className="mt-4 grid grid-cols-4 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.tab} onClick={() => setActiveTab(action.tab)} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-1 py-3 shadow-sm">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.tone}`}><Icon className="h-4.5 w-4.5" /></span>
              <span className="text-[11px] font-semibold text-slate-800">{action.label}</span>
            </button>
          );
        })}
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">今日概览</h3>
          <button onClick={() => setActiveTab("schedule")} className="text-xs font-semibold text-indigo-600">查看待办</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <button key={metric.label} onClick={() => setActiveTab(metric.tab)} className={`rounded-2xl p-4 text-left ${metric.tone}`}>
              <span className="text-2xl font-bold">{metric.value}</span>
              <span className="mt-1 block text-xs font-medium opacity-75">{metric.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-900">版本更新</h3><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">v{PRODUCT_VERSION}</span></div><p className="mt-1 text-xs leading-5 text-slate-600">{PRODUCT_RELEASE_SUMMARY}</p><p className="mt-1 text-[10px] text-slate-400">更新日期：{PRODUCT_VERSION_DATE}</p></div><button onClick={() => setActiveTab("version-management")} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-indigo-600">查看记录</button></div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-rose-500" />风险提醒</h3>
          <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">{risks.length}</span>
        </div>
        <div className="mt-3 space-y-2">
          {risks.slice(0, 3).map((risk: any) => (
            <button key={risk.id} onClick={() => openRisk(risk)} className="flex w-full items-start gap-3 rounded-2xl bg-slate-50 p-3 text-left">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{risk.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{risk.projectName} · {risk.type}</span>
                {(risk.taskId || risk.personId || risk.orderId) && <span className="mt-2 flex flex-wrap gap-2">{risk.taskId && <><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "deadline"); }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600">调整日期</span>{risk.type === "任务逾期" && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "complete"); }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600">标记完成</span>}</>}{risk.personId && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "train"); }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600">标记已培训</span>}{risk.orderId && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "delivered"); }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600">标记已到货</span>}</span>}
              </span>
            </button>
          ))}
          {risks.length === 0 && <div className="flex items-center justify-center gap-2 py-5 text-sm text-slate-400"><CheckCircle2 className="h-4 w-4 text-emerald-500" />当前没有风险预警</div>}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">最近项目</h3>
          <button onClick={() => setActiveTab("board")} className="text-xs font-semibold text-indigo-600">全部项目</button>
        </div>
        <div className="space-y-3">
          {projects.slice(0, 3).map((project: any) => {
            const progress = Number(project.constructProgress ?? project.progress ?? 0);
            return (
              <button key={project.id} onClick={() => onOpenProject?.(project.id)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900">{project.name}</h4>
                    <p className="mt-1 text-xs text-slate-500">{project.manager || "待指定负责人"} · {project.type || "工程项目"}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-indigo-600">{progress}%</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
              </button>
            );
          })}
          {projects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
              <p className="text-sm font-semibold text-slate-700">还没有项目</p>
              <p className="mt-1 text-xs text-slate-400">先创建项目，再开始安排任务和现场勘察</p>
              <button onClick={() => setActiveTab("board")} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">创建第一个项目</button>
            </div>
          )}
        </div>
      </section>

      {announcements.length > 0 && (
        <section className="mt-5 rounded-3xl bg-indigo-50 p-4">
          <button onClick={() => setActiveTab("chat")} className="flex w-full items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600"><MessageSquare className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-indigo-500">最新工作消息</span>
              <span className="mt-1 block truncate text-sm font-bold text-slate-900">{announcements[0].title}</span>
            </span>
            <ArrowRight className="mt-2 h-4 w-4 text-indigo-400" />
          </button>
        </section>
      )}
    </div>
  );
}
