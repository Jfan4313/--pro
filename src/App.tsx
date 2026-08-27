/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, lazy, Suspense, useState, useEffect, useCallback, useMemo, type ErrorInfo, type ReactNode, type ComponentType } from "react";
import { Mic } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { SmartIntake } from "./components/SmartIntake";
import { FirstRunGuide } from "./components/FirstRunGuide";
import { LoginScreen, PasswordChangeScreen } from "./components/LoginScreen";
import { useAuth } from "./lib/auth";
import { useProjectBoardData } from "./hooks/useProjectBoardData";
import { useSyncedAppData } from "./hooks/useSyncedAppData";
import { useWorkspaceMigrations } from "./hooks/useWorkspaceMigrations";
import { flattenProjects, formatLocalDate, getProjectNumber } from "./lib/management";
import { resolveProjectReference } from "./lib/projectNumbering";
import { useArchiveReconciler } from "./hooks/useArchiveReconciler";
import { OpinionCenter } from "./components/OpinionCenter";
import { AIGuide } from "./components/AIGuide";

function lazyWithRecovery<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(() => loader().catch((error) => {
    const message = String(error?.message || error || "");
    const isChunkError = /dynamically imported module|failed to fetch|loading chunk|module script/i.test(message);
    const key = "zhijian-chunk-recovery-at";
    const previous = Number(sessionStorage.getItem(key) || 0);
    if (isChunkError && Date.now() - previous > 10000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
    throw error;
  }));
}

const Dashboard = lazyWithRecovery(() => import("./components/Dashboard").then((module) => ({ default: module.Dashboard })));
const ProjectBoard = lazyWithRecovery(() => import("./components/ProjectBoard").then((module) => ({ default: module.ProjectBoard })));
const Schedule = lazyWithRecovery(() => import("./components/Schedule").then((module) => ({ default: module.Schedule })));
const CostDashboard = lazyWithRecovery(() => import("./components/CostDashboard").then((module) => ({ default: module.CostDashboard })));
const Personnel = lazyWithRecovery(() => import("./components/Personnel").then((module) => ({ default: module.Personnel })));
const Materials = lazyWithRecovery(() => import("./components/Materials").then((module) => ({ default: module.Materials })));
const SupplyChain = lazyWithRecovery(() => import("./components/SupplyChain").then((module) => ({ default: module.SupplyChain })));
const Chat = lazyWithRecovery(() => import("./components/Chat").then((module) => ({ default: module.Chat })));
const Contracts = lazyWithRecovery(() => import("./components/Contracts").then((module) => ({ default: module.Contracts })));
const Settings = lazyWithRecovery(() => import("./components/Settings").then((module) => ({ default: module.Settings })));
const Organization = lazyWithRecovery(() => import("./components/Organization").then((module) => ({ default: module.Organization })));
const ProjectLifecycle = lazyWithRecovery(() => import("./components/ProjectLifecycle").then((module) => ({ default: module.ProjectLifecycle })));
const ProjectDetail = lazyWithRecovery(() => import("./components/ProjectDetail").then((module) => ({ default: module.ProjectDetail })));
const ExternalPartners = lazyWithRecovery(() => import("./components/ExternalPartners").then((module) => ({ default: module.ExternalPartners })));
const ProjectFiles = lazyWithRecovery(() => import("./components/ProjectFiles").then((module) => ({ default: module.ProjectFiles })));
const SiteSurvey = lazyWithRecovery(() => import("./components/SiteSurvey").then((module) => ({ default: module.SiteSurvey })));
const ProjectAcceptance = lazyWithRecovery(() => import("./components/ProjectAcceptance").then((module) => ({ default: module.ProjectAcceptance })));
const MobileProjects = lazyWithRecovery(() => import("./components/MobileProjects").then((module) => ({ default: module.MobileProjects })));
const MobileCollaboration = lazyWithRecovery(() => import("./components/MobileCollaboration").then((module) => ({ default: module.MobileCollaboration })));
const MobileWorkspace = lazyWithRecovery(() => import("./components/MobileWorkspace").then((module) => ({ default: module.MobileWorkspace })));
const AccountManagement = lazyWithRecovery(() => import("./components/AccountManagement").then((module) => ({ default: module.AccountManagement })));
const WorkMemo = lazyWithRecovery(() => import("./components/WorkMemo").then((module) => ({ default: module.WorkMemo })));
const TaskChains = lazyWithRecovery(() => import("./components/TaskChains").then((module) => ({ default: module.TaskChains })));
const MobileWorkMemo = lazyWithRecovery(() => import("./components/MobileWorkMemo").then((module) => ({ default: module.MobileWorkMemo })));
const VersionManagement = lazyWithRecovery(() => import("./components/VersionManagement").then((module) => ({ default: module.VersionManagement })));

class WorkMemoErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  private readonly childContent: ReactNode;
  constructor(props: { children: ReactNode }) { super(props); this.childContent = props.children; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("工作备忘渲染异常，已切换安全视图", error, info.componentStack); }
  render() { return this.state.hasError ? <MobileWorkMemoFallback /> : this.childContent; }
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("页面模块加载失败", error); }
  render() {
    if (!this.state.hasError) return (this as any).props.children;
    return <div className="flex min-h-full items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm"><h2 className="text-lg font-bold text-slate-900">页面暂时无法加载</h2><p className="mt-2 text-sm text-slate-500">页面资源可能刚刚更新，请点击重试。</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">重新加载</button></div></div>;
  }
}

function MobileWorkMemoFallback() {
  const [rawRecords] = useSyncedAppData<any[]>("workMemos", []);
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const today = formatLocalDate();
  const text = (value: unknown, fallback = "") => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : fallback;
    }
    return fallback;
  };
  const records = (Array.isArray(rawRecords) ? rawRecords : []).filter((item: any) => item && typeof item === "object").map((item: any, index: number) => ({
    id: text(item.id, `legacy-memo-${index}`), title: text(item.title || item.name, "未命名工作安排"), detail: text(item.detail, "暂无任务详情"), projectName: text(item.projectName, "未关联项目"), creator: text(item.creator, "未填写"), dueDate: text(item.dueDate, "未设置"), dueTime: text(item.dueTime), feedback: text(item.feedback), status: text(item.status, "pending"), assignee: text(item.assignee, "待指派"), assignees: Array.isArray(item.assignees) ? item.assignees.map((name: unknown) => text(name)).filter(Boolean) : [], chainId: text(item.chainId || item.rootMemoId || item.id), parentMemoId: text(item.parentMemoId),
  }));
  const chainCount = new Set(records.map((item) => item.chainId).filter(Boolean)).size;
  const visible = records.filter((item) => filter === "mine" ? [item.assignee, ...item.assignees].some((name) => name === user?.name || name === user?.username) : filter === "overdue" ? item.status !== "confirmed" && item.dueDate < today : true);
  return <div className="min-h-full bg-slate-50 px-4 pb-6 pt-4"><header className="rounded-[28px] bg-slate-950 p-5 text-white"><p className="text-xs font-medium text-indigo-300">公司工作流</p><h2 className="mt-1 text-2xl font-bold">工作备忘</h2><p className="mt-2 text-sm text-slate-400">查看安排、任务详情、执行反馈和任务链。</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-white/10 p-3 text-center"><b className="text-xl">{records.length}</b><p className="mt-1 text-[10px] text-slate-300">工作安排</p></div><div className="rounded-2xl bg-white/10 p-3 text-center"><b className="text-xl">{chainCount}</b><p className="mt-1 text-[10px] text-slate-300">任务链</p></div></div></header><div className="mt-4 flex gap-2">{([["all", "全部"], ["mine", "我的待办"], ["overdue", "已逾期"]] as const).map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-4 py-2 text-xs font-semibold ${filter === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>{label}</button>)}</div><div className="mt-4 space-y-3">{visible.map((item) => { const isExpanded = Boolean(expanded[item.id]); const assignees = item.assignees.length ? item.assignees.join("、") : item.assignee; const chainNodes = records.filter((candidate) => candidate.chainId === item.chainId).map((candidate) => candidate.title); return <article key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><button type="button" className="w-full text-left" onClick={() => setExpanded((current) => ({ ...current, [item.id]: !isExpanded }))}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-2 text-xs text-slate-500">{item.projectName} · {assignees}</p></div><span className="text-xs text-slate-400">{isExpanded ? "收起" : "展开"}</span></div><p className="mt-3 text-[11px] text-slate-400">截止：{item.dueDate}{item.dueTime ? ` ${item.dueTime}` : ""} · 状态：{item.status}</p></button>{isExpanded && <div className="mt-3 border-t border-slate-100 pt-3"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail}</p>{item.feedback && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">执行反馈：{item.feedback}</p>}<p className="mt-2 text-xs text-violet-700">任务链节点：{chainNodes.join(" → ") || item.title}</p>{item.parentMemoId && <p className="mt-1 text-xs text-violet-700">来源任务：{item.parentMemoId}</p>}</div>}</article>; })}{visible.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">当前筛选没有工作备忘</div>}</div></div>;
}

const tabPermissions: Record<string, string> = {
  dashboard: "dashboard", board: "projects", "project-detail": "projects", lifecycle: "lifecycle", "site-survey": "survey",
  files: "files", contracts: "contracts", schedule: "schedule", acceptance: "acceptance", materials: "materials", supply: "supply", cost: "cost",
  chat: "collaboration", personnel: "personnel", partners: "partners", organization: "organization", settings: "settings", accounts: "accounts",
  "work-memo": "schedule",
  "task-chains": "schedule",
  "version-management": "dashboard",
  opinions: "dashboard",
};

export default function App() {
  const { user, loading: authLoading, can } = useAuth();
  useWorkspaceMigrations();
  useArchiveReconciler(Boolean(user));
  const [projectBoardData] = useProjectBoardData();
  const allProjects = useMemo(() => flattenProjects(projectBoardData), [projectBoardData]);
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "dashboard");
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedProjectReference, setSelectedProjectReference] = useState<string | null>(() => new URLSearchParams(window.location.search).get("project") || null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("stage") || null);
  const [supplyChainTab, setSupplyChainTab] = useState<"orders" | "reconciliation" | "prices" | "procurement">(() => (new URLSearchParams(window.location.search).get("supplyTab") as "orders" | "reconciliation" | "prices" | "procurement") || "orders");
  const [surveyContext, setSurveyContext] = useState<{ projectId: string | null; recordId: string | null; returnTab: string }>(() => {
    const params = new URLSearchParams(window.location.search);
    return { projectId: params.get("tab") === "site-survey" ? params.get("project") : null, recordId: params.get("tab") === "site-survey" ? params.get("surveyRecord") : null, returnTab: "dashboard" };
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobileViewport(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const navigateToTab = (tab: string) => {
    const permission = tabPermissions[tab];
    if (permission && !can(permission)) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前帐号没有该模块权限" }));
      return;
    }
    if (tab === "site-survey") setSurveyContext({ projectId: null, recordId: null, returnTab: "dashboard" });
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (tab !== "project-detail" && tab !== "site-survey" && tab !== "task-chains") params.delete("project");
    if (tab !== "lifecycle") params.delete("stage");
    if (tab !== "project-detail" && tab !== "site-survey") setSelectedProjectReference(null);
    if (tab !== "lifecycle") setSelectedStageId(null);
    window.history.pushState({ tab }, "", `${window.location.pathname}?${params.toString()}`);
  };

  const openTaskChains = (projectReference?: string) => {
    const reference = String(projectReference || "").trim();
    setSelectedProjectReference(reference || null);
    setActiveTab("task-chains");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "task-chains");
    if (reference) params.set("project", reference); else params.delete("project");
    window.history.pushState({ tab: "task-chains", project: reference || null }, "", `${window.location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    const handleOpenTaskChains = (event: Event) => openTaskChains((event as CustomEvent<{ projectName?: string }>).detail?.projectName);
    window.addEventListener("open-task-chains", handleOpenTaskChains);
    return () => window.removeEventListener("open-task-chains", handleOpenTaskChains);
  }, [openTaskChains]);

  const openProjectSurvey = (projectId: string, returnTab = "project-detail", recordId: string | null = null) => {
    const resolved = resolveProjectReference(allProjects, projectId);
    if (resolved.conflict) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `项目编号 ${projectId} 存在重复，请先处理编号冲突` }));
      return;
    }
    const resolvedProjectId = resolved.project?.id || projectId;
    setSelectedProjectReference(resolvedProjectId);
    setSurveyContext({ projectId: resolvedProjectId, recordId, returnTab });
    setActiveTab("site-survey");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "site-survey");
    params.set("project", resolvedProjectId);
    if (recordId) params.set("surveyRecord", recordId);
    else params.delete("surveyRecord");
    window.history.pushState({ tab: "site-survey", projectId: resolvedProjectId, surveyRecord: recordId }, "", `${window.location.pathname}?${params.toString()}`);
  };

  const handleMaterialsNavigate = (tab: string, subTab?: string) => {
    setActiveTab(tab);
    if (tab === 'supply' && subTab) {
      setSupplyChainTab(subTab as any);
      const params = new URLSearchParams(window.location.search);
      params.set("supplyTab", subTab);
      window.history.replaceState({ tab, supplyTab: subTab }, "", `${window.location.pathname}?${params.toString()}`);
    }
  };

  const openProjectDetail = useCallback((projectId: string) => {
    const resolved = resolveProjectReference(allProjects, projectId);
    const projectReference = resolved.project ? getProjectNumber(resolved.project) : projectId;
    setSelectedProjectReference(projectReference);
    setActiveTab("project-detail");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "project-detail");
    params.set("project", projectReference);
    params.delete("stage");
    window.history.pushState({ tab: "project-detail", project: projectReference }, "", `${window.location.pathname}?${params.toString()}`);
  }, [allProjects]);

  const openProjectLifecycle = useCallback((projectReference: string) => {
    const resolved = resolveProjectReference(allProjects, projectReference);
    if (resolved.conflict) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `项目编号 ${projectReference} 存在重复，请先处理编号冲突` }));
      return;
    }
    const reference = resolved.project ? getProjectNumber(resolved.project) : projectReference;
    setSelectedProjectReference(reference);
    setSelectedStageId(null);
    setActiveTab("lifecycle");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "lifecycle");
    params.set("project", reference);
    params.delete("stage");
    window.history.pushState({ tab: "lifecycle", project: reference }, "", `${window.location.pathname}?${params.toString()}`);
  }, [allProjects]);


  const syncLifecycleRoute = useCallback((project: any, stageId: string) => {
    const projectNumber = getProjectNumber(project);
    setSelectedProjectReference(projectNumber);
    setSelectedStageId(stageId);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "lifecycle");
    params.set("project", projectNumber);
    params.set("stage", stageId);
    window.history.replaceState({ tab: "lifecycle", project: projectNumber, stage: stageId }, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(params.get("tab") || "dashboard");
      setSelectedProjectReference(params.get("project"));
      setSelectedStageId(params.get("stage"));
      setSupplyChainTab((params.get("supplyTab") as "orders" | "reconciliation" | "prices" | "procurement") || "orders");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleToast = (e: any) => {
      setToastMsg(e.detail);
      setTimeout(() => setToastMsg(null), 3000);
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  useEffect(() => {
    const permission = tabPermissions[activeTab];
    if (user && permission && !can(permission)) setActiveTab("dashboard");
  }, [activeTab, can, user]);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">正在验证帐号…</div>;
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <PasswordChangeScreen />;

  return (
    <div className="app-shell flex h-screen bg-[#f8fafc] font-sans overflow-hidden">
        <Sidebar 
        activeTab={activeTab} 
        setActiveTab={navigateToTab} 
      />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header setActiveTab={navigateToTab} onOpenProject={openProjectDetail} />
        <main className="app-main flex-1 overflow-y-auto flex flex-col">
          <PageErrorBoundary><Suspense fallback={<div className="flex min-h-full items-center justify-center text-sm text-slate-500">正在加载模块…</div>}>
          {activeTab === "dashboard" && <Dashboard setActiveTab={navigateToTab} onOpenProject={openProjectDetail} isMobileViewport={isMobileViewport} />}
          {activeTab === "board" && <><div className="md:hidden min-h-full"><MobileProjects onOpenProject={openProjectLifecycle} onOpenProjectDetail={openProjectDetail} /></div><div className="hidden md:block h-full"><ProjectBoard onOpenProject={openProjectLifecycle} onOpenProjectDetail={openProjectDetail} /></div></>}
          {activeTab === "project-detail" && <ProjectDetail projectId={selectedProjectReference} onBack={() => navigateToTab("dashboard")} setActiveTab={navigateToTab} onOpenLifecycle={openProjectLifecycle} onOpenSurvey={(projectId) => openProjectSurvey(projectId)} />}
          {activeTab === "lifecycle" && <ProjectLifecycle initialProjectReference={selectedProjectReference} initialStageId={selectedStageId} onBack={() => navigateToTab("board")} onOpenProjectDetail={openProjectDetail} onSelectionChange={syncLifecycleRoute} onOpenSiteSurvey={(projectId, recordId) => openProjectSurvey(projectId, "lifecycle", recordId)} />}
          {activeTab === "site-survey" && <SiteSurvey initialProjectId={surveyContext.projectId} initialRecordId={surveyContext.recordId} onBack={() => { if (surveyContext.returnTab === "lifecycle" && surveyContext.projectId) openProjectLifecycle(surveyContext.projectId); else navigateToTab(surveyContext.returnTab); setSurveyContext({ projectId: null, recordId: null, returnTab: "dashboard" }); }} />}
          {activeTab === "schedule" && <><div className="md:hidden min-h-full"><MobileWorkspace module="schedule" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Schedule /></div></>}
          {activeTab === "work-memo" && (isMobileViewport ? <WorkMemoErrorBoundary><MobileWorkMemo /></WorkMemoErrorBoundary> : <WorkMemo onOpenTaskChains={openTaskChains} />)}
          {activeTab === "task-chains" && <div className="hidden md:block h-full"><TaskChains projectReference={selectedProjectReference || undefined} onOpenWorkMemo={() => navigateToTab("work-memo")} /></div>}
          {activeTab === "acceptance" && <><div className="md:hidden min-h-full"><MobileWorkspace module="acceptance" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><ProjectAcceptance /></div></>}
          {activeTab === "cost" && <><div className="md:hidden min-h-full"><MobileWorkspace module="cost" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><CostDashboard /></div></>}
          {activeTab === "organization" && <><div className="md:hidden min-h-full"><MobileWorkspace module="organization" setActiveTab={setActiveTab} /></div><div className="hidden md:block h-full"><Organization /></div></>}
          {activeTab === "personnel" && <><div className="md:hidden min-h-full"><MobileWorkspace module="personnel" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Personnel /></div></>}
          {activeTab === "partners" && <><div className="md:hidden min-h-full"><MobileWorkspace module="partners" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><ExternalPartners /></div></>}
          {activeTab === "files" && <ProjectFiles setActiveTab={setActiveTab} />}
          {activeTab === "materials" && <><div className="md:hidden min-h-full"><MobileWorkspace module="materials" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Materials setActiveTab={handleMaterialsNavigate} /></div></>}
          {activeTab === "supply" && <><div className="md:hidden min-h-full"><MobileWorkspace module="supply" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><SupplyChain defaultTab={supplyChainTab} /></div></>}
          {activeTab === "chat" && <><div className="md:hidden min-h-full"><MobileCollaboration /></div><div className="hidden md:block h-full"><Chat /></div></>}
          {activeTab === "contracts" && <><div className="md:hidden min-h-full"><MobileWorkspace module="contracts" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Contracts /></div></>}
          {activeTab === "settings" && <Settings />}
          {activeTab === "accounts" && <AccountManagement />}
          {activeTab === "version-management" && <VersionManagement />}
          </Suspense></PageErrorBoundary>
        </main>

        {activeTab !== "work-memo" && <SmartIntake setActiveTab={setActiveTab} />}
        <div className="hidden md:block"><OpinionCenter activeTab={activeTab} projectReference={selectedProjectReference} /></div>
        <div className="hidden md:block"><AIGuide activeTab={activeTab} projectReference={selectedProjectReference} /></div>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-smart-intake"))} className="smart-intake-fab fixed bottom-20 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 ring-4 ring-indigo-100 transition hover:scale-105 hover:bg-indigo-700 md:bottom-6 md:right-6" title="语音快速创建工作备忘" aria-label="语音快速创建工作备忘"><Mic className="h-6 w-6" /></button>
        {activeTab !== "work-memo" && <FirstRunGuide setActiveTab={navigateToTab} />}

        {/* Global Toast */}
        {toastMsg && (
          <div className="app-toast fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl shadow-slate-800/30 animate-in zoom-in-95 fade-in duration-200 z-[11000] flex items-start justify-center gap-2 max-w-[min(90vw,32rem)] text-center">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="min-w-0 whitespace-pre-wrap break-words leading-6">{toastMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
