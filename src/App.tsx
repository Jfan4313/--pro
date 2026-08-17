/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { ProjectBoard } from "./components/ProjectBoard";
import { Schedule } from "./components/Schedule";
import { CostDashboard } from "./components/CostDashboard";
import { Personnel } from "./components/Personnel";
import { Materials } from "./components/Materials";
import { SupplyChain } from "./components/SupplyChain";
import { Chat } from "./components/Chat";
import { Contracts } from "./components/Contracts";
import { Settings } from "./components/Settings";
import { Organization } from "./components/Organization";
import { ProjectLifecycle } from "./components/ProjectLifecycle";
import { SmartIntake } from "./components/SmartIntake";
import { ProjectDetail } from "./components/ProjectDetail";
import { ExternalPartners } from "./components/ExternalPartners";
import { ProjectFiles } from "./components/ProjectFiles";
import { SiteSurvey } from "./components/SiteSurvey";
import { ProjectAcceptance } from "./components/ProjectAcceptance";
import { MobileProjects } from "./components/MobileProjects";
import { MobileCollaboration } from "./components/MobileCollaboration";
import { MobileWorkspace } from "./components/MobileWorkspace";
import { AccountManagement } from "./components/AccountManagement";
import { WorkMemo } from "./components/WorkMemo";
import { VersionManagement } from "./components/VersionManagement";
import { FirstRunGuide } from "./components/FirstRunGuide";
import { LoginScreen, PasswordChangeScreen } from "./components/LoginScreen";
import { useAuth } from "./lib/auth";

const tabPermissions: Record<string, string> = {
  dashboard: "dashboard", board: "projects", "project-detail": "projects", lifecycle: "lifecycle", "site-survey": "survey",
  files: "files", contracts: "contracts", schedule: "schedule", acceptance: "acceptance", materials: "materials", supply: "supply", cost: "cost",
  chat: "collaboration", personnel: "personnel", partners: "partners", organization: "organization", settings: "settings", accounts: "accounts",
  "work-memo": "schedule",
  "version-management": "dashboard",
};

export default function App() {
  const { user, loading: authLoading, can } = useAuth();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "dashboard");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("project") || null);
  const [supplyChainTab, setSupplyChainTab] = useState<"orders" | "reconciliation" | "prices" | "procurement">(() => (new URLSearchParams(window.location.search).get("supplyTab") as "orders" | "reconciliation" | "prices" | "procurement") || "orders");
  const [surveyContext, setSurveyContext] = useState<{ projectId: string | null; returnTab: string }>({ projectId: null, returnTab: "dashboard" });

  const navigateToTab = (tab: string) => {
    const permission = tabPermissions[tab];
    if (permission && !can(permission)) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前帐号没有该模块权限" }));
      return;
    }
    if (tab === "site-survey") setSurveyContext({ projectId: null, returnTab: "dashboard" });
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (tab !== "project-detail") params.delete("project");
    window.history.pushState({ tab }, "", `${window.location.pathname}?${params.toString()}`);
  };

  const openProjectSurvey = (projectId: string, returnTab = "project-detail") => {
    setSelectedProjectId(projectId);
    setSurveyContext({ projectId, returnTab });
    setActiveTab("site-survey");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "site-survey");
    params.set("project", projectId);
    window.history.pushState({ tab: "site-survey", projectId }, "", `${window.location.pathname}?${params.toString()}`);
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

  const openProjectDetail = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab("project-detail");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "project-detail");
    params.set("project", projectId);
    window.history.pushState({ tab: "project-detail", projectId }, "", `${window.location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(params.get("tab") || "dashboard");
      setSelectedProjectId(params.get("project"));
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
          {activeTab === "dashboard" && <Dashboard setActiveTab={navigateToTab} onOpenProject={openProjectDetail} />}
          {activeTab === "board" && <><div className="md:hidden min-h-full"><MobileProjects onOpenProject={openProjectDetail} /></div><div className="hidden md:block h-full"><ProjectBoard onOpenProject={openProjectDetail} /></div></>}
          {activeTab === "project-detail" && <ProjectDetail projectId={selectedProjectId} onBack={() => navigateToTab("dashboard")} setActiveTab={navigateToTab} onOpenSurvey={(projectId) => openProjectSurvey(projectId)} />}
          {activeTab === "lifecycle" && <><div className="md:hidden min-h-full"><MobileWorkspace module="lifecycle" setActiveTab={navigateToTab} onOpenProject={openProjectDetail} /></div><div className="hidden md:block h-full"><ProjectLifecycle onOpenSiteSurvey={(projectId) => openProjectSurvey(projectId, "lifecycle")} /></div></>}
          {activeTab === "site-survey" && <SiteSurvey initialProjectId={surveyContext.projectId} onBack={() => { navigateToTab(surveyContext.returnTab); setSurveyContext({ projectId: null, returnTab: "dashboard" }); }} />}
          {activeTab === "schedule" && <><div className="md:hidden min-h-full"><MobileWorkspace module="schedule" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Schedule /></div></>}
          {activeTab === "work-memo" && <WorkMemo />}
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
          {activeTab === "settings" && <><div className="md:hidden min-h-full"><MobileWorkspace module="settings" setActiveTab={setActiveTab} /></div><div className="hidden md:block"><Settings /></div></>}
          {activeTab === "accounts" && <AccountManagement />}
          {activeTab === "version-management" && <VersionManagement />}
        </main>

        <SmartIntake setActiveTab={setActiveTab} />
        <FirstRunGuide setActiveTab={navigateToTab} />

        {/* Global Toast */}
        {toastMsg && (
          <div className="app-toast fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl shadow-slate-800/30 animate-in zoom-in-95 fade-in duration-200 z-[120] flex items-center justify-center gap-2 max-w-[min(90vw,32rem)] text-center">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
