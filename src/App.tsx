/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { Mic } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { SmartIntake } from "./components/SmartIntake";
import { FirstRunGuide } from "./components/FirstRunGuide";
import { LoginScreen, PasswordChangeScreen } from "./components/LoginScreen";
import { useAuth } from "./lib/auth";
import { useProjectBoardData } from "./hooks/useProjectBoardData";
import { useWorkspaceMigrations } from "./hooks/useWorkspaceMigrations";
import { flattenProjects, getProjectNumber } from "./lib/management";
import { resolveProjectReference } from "./lib/projectNumbering";
import { useArchiveReconciler } from "./hooks/useArchiveReconciler";

const Dashboard = lazy(() => import("./components/Dashboard").then((module) => ({ default: module.Dashboard })));
const ProjectBoard = lazy(() => import("./components/ProjectBoard").then((module) => ({ default: module.ProjectBoard })));
const Schedule = lazy(() => import("./components/Schedule").then((module) => ({ default: module.Schedule })));
const CostDashboard = lazy(() => import("./components/CostDashboard").then((module) => ({ default: module.CostDashboard })));
const Personnel = lazy(() => import("./components/Personnel").then((module) => ({ default: module.Personnel })));
const Materials = lazy(() => import("./components/Materials").then((module) => ({ default: module.Materials })));
const SupplyChain = lazy(() => import("./components/SupplyChain").then((module) => ({ default: module.SupplyChain })));
const Chat = lazy(() => import("./components/Chat").then((module) => ({ default: module.Chat })));
const Contracts = lazy(() => import("./components/Contracts").then((module) => ({ default: module.Contracts })));
const Settings = lazy(() => import("./components/Settings").then((module) => ({ default: module.Settings })));
const Organization = lazy(() => import("./components/Organization").then((module) => ({ default: module.Organization })));
const ProjectLifecycle = lazy(() => import("./components/ProjectLifecycle").then((module) => ({ default: module.ProjectLifecycle })));
const ProjectDetail = lazy(() => import("./components/ProjectDetail").then((module) => ({ default: module.ProjectDetail })));
const ExternalPartners = lazy(() => import("./components/ExternalPartners").then((module) => ({ default: module.ExternalPartners })));
const ProjectFiles = lazy(() => import("./components/ProjectFiles").then((module) => ({ default: module.ProjectFiles })));
const SiteSurvey = lazy(() => import("./components/SiteSurvey").then((module) => ({ default: module.SiteSurvey })));
const ProjectAcceptance = lazy(() => import("./components/ProjectAcceptance").then((module) => ({ default: module.ProjectAcceptance })));
const MobileProjects = lazy(() => import("./components/MobileProjects").then((module) => ({ default: module.MobileProjects })));
const MobileCollaboration = lazy(() => import("./components/MobileCollaboration").then((module) => ({ default: module.MobileCollaboration })));
const MobileWorkspace = lazy(() => import("./components/MobileWorkspace").then((module) => ({ default: module.MobileWorkspace })));
const AccountManagement = lazy(() => import("./components/AccountManagement").then((module) => ({ default: module.AccountManagement })));
const WorkMemo = lazy(() => import("./components/WorkMemo").then((module) => ({ default: module.WorkMemo })));
const MobileWorkMemo = lazy(() => import("./components/MobileWorkMemo").then((module) => ({ default: module.MobileWorkMemo })));
const VersionManagement = lazy(() => import("./components/VersionManagement").then((module) => ({ default: module.VersionManagement })));

const tabPermissions: Record<string, string> = {
  dashboard: "dashboard", board: "projects", "project-detail": "projects", lifecycle: "lifecycle", "site-survey": "survey",
  files: "files", contracts: "contracts", schedule: "schedule", acceptance: "acceptance", materials: "materials", supply: "supply", cost: "cost",
  chat: "collaboration", personnel: "personnel", partners: "partners", organization: "organization", settings: "settings", accounts: "accounts",
  "work-memo": "schedule",
  "version-management": "dashboard",
};

export default function App() {
  const { user, loading: authLoading, can } = useAuth();
  useWorkspaceMigrations();
  useArchiveReconciler(Boolean(user));
  const [projectBoardData] = useProjectBoardData();
  const allProjects = useMemo(() => flattenProjects(projectBoardData), [projectBoardData]);
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "dashboard");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedProjectReference, setSelectedProjectReference] = useState<string | null>(() => new URLSearchParams(window.location.search).get("project") || null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("stage") || null);
  const [supplyChainTab, setSupplyChainTab] = useState<"orders" | "reconciliation" | "prices" | "procurement">(() => (new URLSearchParams(window.location.search).get("supplyTab") as "orders" | "reconciliation" | "prices" | "procurement") || "orders");
  const [surveyContext, setSurveyContext] = useState<{ projectId: string | null; recordId: string | null; returnTab: string }>({ projectId: null, recordId: null, returnTab: "dashboard" });

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
    if (tab !== "project-detail" && tab !== "site-survey") params.delete("project");
    if (tab !== "lifecycle") params.delete("stage");
    if (tab !== "project-detail" && tab !== "site-survey") setSelectedProjectReference(null);
    if (tab !== "lifecycle") setSelectedStageId(null);
    window.history.pushState({ tab }, "", `${window.location.pathname}?${params.toString()}`);
  };

  const openProjectSurvey = (projectId: string, returnTab = "project-detail", recordId: string | null = null) => {
    setSelectedProjectReference(projectId);
    setSurveyContext({ projectId, recordId, returnTab });
    setActiveTab("site-survey");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "site-survey");
    params.set("project", projectId);
    if (recordId) params.set("surveyRecord", recordId);
    else params.delete("surveyRecord");
    window.history.pushState({ tab: "site-survey", projectId, surveyRecord: recordId }, "", `${window.location.pathname}?${params.toString()}`);
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
          <Suspense fallback={<div className="flex min-h-full items-center justify-center text-sm text-slate-500">正在加载模块…</div>}>
          {activeTab === "dashboard" && <Dashboard setActiveTab={navigateToTab} onOpenProject={openProjectDetail} />}
          {activeTab === "board" && <><div className="md:hidden min-h-full"><MobileProjects onOpenProject={openProjectLifecycle} onOpenProjectDetail={openProjectDetail} /></div><div className="hidden md:block h-full"><ProjectBoard onOpenProject={openProjectLifecycle} onOpenProjectDetail={openProjectDetail} /></div></>}
          {activeTab === "project-detail" && <ProjectDetail projectId={selectedProjectReference} onBack={() => navigateToTab("dashboard")} setActiveTab={navigateToTab} onOpenLifecycle={openProjectLifecycle} onOpenSurvey={(projectId) => openProjectSurvey(projectId)} />}
          {activeTab === "lifecycle" && <ProjectLifecycle initialProjectReference={selectedProjectReference} initialStageId={selectedStageId} onBack={() => navigateToTab("board")} onOpenProjectDetail={openProjectDetail} onSelectionChange={syncLifecycleRoute} onOpenSiteSurvey={(projectId, recordId) => openProjectSurvey(projectId, "lifecycle", recordId)} />}
          {activeTab === "site-survey" && <SiteSurvey initialProjectId={surveyContext.projectId} initialRecordId={surveyContext.recordId} onBack={() => { if (surveyContext.returnTab === "lifecycle" && surveyContext.projectId) openProjectLifecycle(surveyContext.projectId); else navigateToTab(surveyContext.returnTab); setSurveyContext({ projectId: null, recordId: null, returnTab: "dashboard" }); }} />}
          {activeTab === "schedule" && <><div className="md:hidden min-h-full"><MobileWorkspace module="schedule" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Schedule /></div></>}
          {activeTab === "work-memo" && <><div className="md:hidden min-h-full"><MobileWorkMemo /></div><div className="hidden md:block"><WorkMemo /></div></>}
          {activeTab === "acceptance" && <><div className="md:hidden min-h-full"><MobileWorkspace module="acceptance" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><ProjectAcceptance /></div></>}
          {activeTab === "cost" && <><div className="md:hidden min-h-full"><MobileWorkspace module="cost" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><CostDashboard /></div></>}
          {activeTab === "organization" && <><div className="md:hidden min-h-full"><MobileWorkspace module="organization" setActiveTab={setActiveTab} /></div><div className="hidden md:block h-full"><Organization /></div></>}
          {activeTab === "personnel" && <><div className="md:hidden min-h-full"><MobileWorkspace module="personnel" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Personnel /></div></>}
          {activeTab === "partners" && <><div className="md:hidden min-h-full"><MobileWorkspace module="partners" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><ExternalPartners /></div></>}
          {activeTab === "files" && <><div className="md:hidden min-h-full"><MobileWorkspace module="files" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><ProjectFiles setActiveTab={setActiveTab} /></div></>}
          {activeTab === "materials" && <><div className="md:hidden min-h-full"><MobileWorkspace module="materials" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Materials setActiveTab={handleMaterialsNavigate} /></div></>}
          {activeTab === "supply" && <><div className="md:hidden min-h-full"><MobileWorkspace module="supply" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><SupplyChain defaultTab={supplyChainTab} /></div></>}
          {activeTab === "chat" && <><div className="md:hidden min-h-full"><MobileCollaboration /></div><div className="hidden md:block h-full"><Chat /></div></>}
          {activeTab === "contracts" && <><div className="md:hidden min-h-full"><MobileWorkspace module="contracts" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Contracts /></div></>}
          {activeTab === "settings" && <Settings />}
          {activeTab === "accounts" && <AccountManagement />}
          {activeTab === "version-management" && <VersionManagement />}
          </Suspense>
        </main>

        <SmartIntake setActiveTab={setActiveTab} />
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-smart-intake"))} className="smart-intake-fab fixed bottom-20 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 ring-4 ring-indigo-100 transition hover:scale-105 hover:bg-indigo-700 md:bottom-6 md:right-6" title="语音快速创建工作备忘" aria-label="语音快速创建工作备忘"><Mic className="h-6 w-6" /></button>
        <FirstRunGuide setActiveTab={navigateToTab} />

        {/* Global Toast */}
        {toastMsg && (
          <div className="app-toast fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl shadow-slate-800/30 animate-in zoom-in-95 fade-in duration-200 z-[120] flex items-start justify-center gap-2 max-w-[min(90vw,32rem)] text-center">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="min-w-0 whitespace-pre-wrap break-words leading-6">{toastMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
