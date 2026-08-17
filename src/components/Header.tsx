import { Bell, Search, Briefcase, Users, Package, Building2, X, LogOut, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useSyncedAppData } from "../hooks/useSyncedAppData";
import { useProjectBoardData } from "../hooks/useProjectBoardData";
import { useAuth } from "@/src/lib/auth";
import { formatLocalDate } from "@/src/lib/management";
import { useSyncStatus } from "@/src/hooks/useSyncStatus";
import { SyncCenter } from "@/src/components/SyncCenter";
import { dispatchRiskFocus } from "@/src/lib/riskActions";
import { PRODUCT_VERSION } from "@/src/lib/productVersion";

export function Header({ setActiveTab, onOpenProject }: { setActiveTab?: (tab: string) => void; onOpenProject?: (projectId: string) => void }) {
  const { user, logout } = useAuth();
  const syncStatus = useSyncStatus();
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem("zhijian-search-history") || "[]"); } catch { return []; }
  });
  const searchRef = useRef<HTMLDivElement>(null);

  const [projectBoardData] = useProjectBoardData();
  const [personnelData] = useSyncedAppData<any[]>("personnelData", []);
  const [materialsData] = useSyncedAppData<any[]>("materialsData", []);
  const [workMemos] = useSyncedAppData<any[]>("workMemos", []);
  const [scheduleData] = useSyncedAppData<any[]>("scheduleData", []);
  const [contracts] = useSyncedAppData<any[]>("project_contracts", []);
  const [supplyOrders] = useSyncedAppData<any[]>("supplyOrders", []);
  const [externalPartners] = useSyncedAppData<any[]>("externalPartners", []);
  const reminderCount = workMemos.filter((item: any) => item.status !== "confirmed" && (item.status === "feedback" || item.dueDate <= formatLocalDate())).length;

  const syncPresentation = {
    idle: { label: "已同步", className: "text-emerald-600 bg-emerald-50", icon: CheckCircle2 },
    saving: { label: "正在保存", className: "text-indigo-600 bg-indigo-50", icon: RefreshCw },
    syncing: { label: syncStatus.pending ? `同步中 · ${syncStatus.pending}` : "正在同步", className: "text-indigo-600 bg-indigo-50", icon: RefreshCw },
    offline: { label: syncStatus.pending ? `离线 · 待同步 ${syncStatus.pending}` : "当前离线", className: "text-amber-700 bg-amber-50", icon: CloudOff },
    error: { label: "同步失败", className: "text-rose-600 bg-rose-50", icon: AlertTriangle },
    conflict: { label: "存在同步冲突", className: "text-rose-600 bg-rose-50", icon: AlertTriangle },
  }[syncStatus.state];
  const SyncIcon = syncPresentation.icon;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const newResults = [];

    // Search Projects
    try {
      projectBoardData.forEach((col: any) => {
        col.projects?.forEach((p: any) => {
          if (p.name.toLowerCase().includes(query) || p.manager.toLowerCase().includes(query)) {
            newResults.push({ type: 'project', title: p.name, subtitle: `负责人: ${p.manager}`, icon: Briefcase, tab: 'board', projectId: p.id });
          }
        });
      });
    } catch(e) {}

    // Search Personnel
    try {
      personnelData.forEach((p: any) => {
        if (p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)) {
          newResults.push({ type: 'personnel', title: p.name, subtitle: `${p.role} - ${p.projects?.[0]?.name || ''}`, icon: Users, tab: 'personnel', focus: { actionTab: 'personnel', personId: p.id } });
        }
      });
    } catch(e) {}

    // Search Materials
    try {
      materialsData.forEach((m: any) => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          newResults.push({ type: 'material', title: m.name, subtitle: `库存: ${m.stock} ${m.unit} - ${m.location}`, icon: Package, tab: 'materials', focus: { actionTab: 'materials', materialId: m.id } });
        }
      });
    } catch(e) {}

    contracts.forEach((item: any) => {
      if (`${item.name || ""} ${item.id || ""} ${item.partyB || ""}`.toLowerCase().includes(query)) newResults.push({ type: 'contract', title: item.name, subtitle: `${item.id} · ${item.status || ""}`, icon: Briefcase, tab: 'contracts', focus: { actionTab: 'contracts', contractId: item.id, projectId: item.projectId } });
    });
    supplyOrders.forEach((item: any) => {
      if (`${item.id || ""} ${item.items || ""} ${item.supplier || ""}`.toLowerCase().includes(query)) newResults.push({ type: 'supply', title: item.items || item.id, subtitle: `${item.id} · ${item.supplier || ""}`, icon: Package, tab: 'supply', focus: { actionTab: 'supply', orderId: item.id, projectId: item.projectId } });
    });
    externalPartners.forEach((item: any) => {
      if (`${item.name || ""} ${item.type || ""} ${item.contact || ""}`.toLowerCase().includes(query)) newResults.push({ type: 'partner', title: item.name, subtitle: `${item.type || "外协"} · ${item.contact || ""}`, icon: Users, tab: 'partners', focus: { actionTab: 'partners', partnerId: item.id } });
    });
    scheduleData.flatMap((project: any) => (project.tasks || []).map((task: any) => ({ ...task, projectId: project.id, projectName: project.name }))).forEach((task: any) => {
      if (`${task.name || ""} ${task.id || ""} ${task.projectName || ""}`.toLowerCase().includes(query)) newResults.push({ type: 'task', title: task.name, subtitle: `${task.projectName || "未关联项目"} · ${task.deadline || "无截止日期"}`, icon: Briefcase, tab: 'schedule', focus: { actionTab: 'schedule', taskId: task.id, projectId: task.projectId, projectName: task.projectName } });
    });

    setResults(newResults.slice(0, 5));
  }, [searchQuery, projectBoardData, personnelData, materialsData, contracts, supplyOrders, externalPartners, scheduleData]);

  const rememberSearch = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const next = [normalized, ...searchHistory.filter((item) => item !== normalized)].slice(0, 6);
    setSearchHistory(next);
    window.localStorage.setItem("zhijian-search-history", JSON.stringify(next));
  };

  return (
    <>
    <header className="mobile-topbar min-h-16 bg-white/95 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between gap-3 px-4 md:px-6 sticky top-0 z-30">
      <div className={`${isMobileSearchOpen ? "hidden" : "flex"} md:hidden min-w-0 items-center gap-2.5`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><Building2 className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">智建协同 Pro</p>
          <p className="text-[10px] text-slate-500">项目管理工作台</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsSyncCenterOpen(true)}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl md:hidden ${syncPresentation.className}`}
        title={syncStatus.error || syncPresentation.label}
        aria-label={syncPresentation.label}
      >
        <SyncIcon className={`h-4 w-4 ${syncStatus.state === "saving" || syncStatus.state === "syncing" ? "animate-spin" : ""}`} />
      </button>

      <div className={`${isMobileSearchOpen ? "flex flex-1" : "hidden"} md:block relative`} ref={searchRef}>
        <div className={`flex items-center bg-slate-100 rounded-xl px-3 py-2 w-full md:w-96 transition-shadow ${isFocused ? 'ring-2 ring-indigo-500/30 bg-white border border-indigo-200' : 'border border-transparent'}`}>
          <Search className="w-4 h-4 text-slate-400 mr-2" />
          <input 
            type="text" 
            placeholder="搜索项目、人员或物资..." 
            value={searchQuery}
            autoFocus={isMobileSearchOpen}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
          />
          <button
            className="md:hidden ml-2 rounded-full p-1 text-slate-400"
            onClick={() => { setIsMobileSearchOpen(false); setIsFocused(false); setSearchQuery(""); }}
            aria-label="关闭搜索"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Dropdown */}
        {isFocused && searchQuery.trim() && (
          <div className="absolute top-full left-0 mt-2 w-full min-w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {results.length > 0 ? (
              <div className="py-2">
                {results.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      rememberSearch(searchQuery);
                      if (result.projectId && onOpenProject) onOpenProject(result.projectId);
                      else if (setActiveTab) setActiveTab(result.tab);
                      if (result.focus) dispatchRiskFocus(result.focus);
                      setIsFocused(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 transition-colors"
                  >
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-500 shrink-0">
                      <result.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{result.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{result.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">未找到相关结果{searchHistory.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3 text-left"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">最近搜索</p><div className="mt-2 flex flex-wrap gap-2">{searchHistory.map((item) => <button key={item} onClick={() => setSearchQuery(item)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">{item}</button>)}</div></div>}</div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {setActiveTab && <button type="button" onClick={() => setActiveTab("version-management")} className="hidden rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 md:block" title="查看版本更新">V{PRODUCT_VERSION}</button>}
        <button
          type="button"
          onClick={() => setIsSyncCenterOpen(true)}
          className={`hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold md:flex ${syncPresentation.className}`}
          title={syncStatus.error || (syncStatus.lastSyncedAt ? `最近同步：${new Date(syncStatus.lastSyncedAt).toLocaleString()}` : "尚未完成同步")}
          aria-label={syncPresentation.label}
        >
          <SyncIcon className={`h-3.5 w-3.5 ${syncStatus.state === "saving" || syncStatus.state === "syncing" ? "animate-spin" : ""}`} />
          {syncPresentation.label}
        </button>
        <button
          onClick={() => { setIsMobileSearchOpen(true); setIsFocused(true); }}
          className={`${isMobileSearchOpen ? "hidden" : "block"} md:hidden p-2 text-slate-500 rounded-full hover:bg-slate-100`}
          aria-label="搜索"
        >
          <Search className="w-5 h-5" />
        </button>
        <button onClick={() => setActiveTab?.("work-memo")} className="relative rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label={`工作提醒${reminderCount ? `，${reminderCount}条` : ""}`}>
          <Bell className="w-5 h-5" />
          {reminderCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">{reminderCount > 99 ? "99+" : reminderCount}</span>}
        </button>
        <div className="relative">
          <button onClick={() => setIsAccountOpen(!isAccountOpen)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white" aria-label="帐号菜单">{user?.name?.slice(0, 1) || "我"}</button>
          {isAccountOpen && <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-100 bg-white p-3 shadow-xl"><p className="text-sm font-bold text-slate-900">{user?.name}</p><p className="mt-1 truncate text-xs text-slate-500">@{user?.username}</p><button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600"><LogOut className="h-4 w-4" />退出登录</button></div>}
        </div>
      </div>
    </header>
    <SyncCenter open={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />
    </>
  );
}
