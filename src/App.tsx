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
import { ProcurementEntry } from "./components/ProcurementEntry";
import { Organization } from "./components/Organization";
import { ProjectLifecycle } from "./components/ProjectLifecycle";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [supplyChainTab, setSupplyChainTab] = useState<"orders" | "reconciliation">("orders");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isProcurementModalOpen, setIsProcurementModalOpen] = useState(false);

  const handleMaterialsNavigate = (tab: string, subTab?: string) => {
    setActiveTab(tab);
    if (tab === 'supply' && subTab) {
      setSupplyChainTab(subTab as any);
    }
  };

  useEffect(() => {
    const handleToast = (e: any) => {
      setToastMsg(e.detail);
      setTimeout(() => setToastMsg(null), 3000);
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenProcurement={() => setIsProcurementModalOpen(true)}
      />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header setActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto flex flex-col">
          {activeTab === "dashboard" && <Dashboard setActiveTab={setActiveTab} />}
          {activeTab === "board" && <ProjectBoard />}
          {activeTab === "lifecycle" && <ProjectLifecycle />}
          {activeTab === "schedule" && <Schedule />}
          {activeTab === "cost" && <CostDashboard />}
          {activeTab === "organization" && <Organization />}
          {activeTab === "personnel" && <Personnel />}
          {activeTab === "materials" && <Materials setActiveTab={handleMaterialsNavigate} />}
          {activeTab === "chat" && <Chat />}
          {activeTab === "contracts" && <Contracts />}
          {activeTab === "settings" && <Settings />}
        </main>

        {isProcurementModalOpen && (
          <ProcurementEntry onClose={() => setIsProcurementModalOpen(false)} />
        )}

        {/* Global Toast */}
        {toastMsg && (
          <div className="absolute bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg shadow-slate-800/20 animate-in slide-in-from-bottom-5 fade-in duration-300 z-50 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
