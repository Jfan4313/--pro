import { useEffect, useState } from "react";
import { LayoutDashboard, KanbanSquare, CalendarDays, Users, Package, Truck, Settings, Building2, MessageSquare, FileText, LogOut, DollarSign, Plus, Network, Handshake, FolderOpen, Grid2X2, X, Camera, UserCog, FileCheck2, ClipboardList, History } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useAuth } from "@/src/lib/auth";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenProcurement?: () => void;
}

const navGroups = [
  {
    id: "workspace",
    label: "工作台",
    items: [
      { id: "dashboard", label: "项目汇总", icon: LayoutDashboard, permission: "dashboard" },
      { id: "work-memo", label: "工作备忘", icon: ClipboardList, permission: "schedule" },
      { id: "board", label: "多项目看板", icon: KanbanSquare, permission: "projects" },
      { id: "schedule", label: "施工日程", icon: CalendarDays, permission: "schedule" },
    ],
  },
  {
    id: "execution",
    label: "项目执行",
    items: [
      { id: "lifecycle", label: "全生命周期", icon: FileText, permission: "lifecycle" },
      { id: "site-survey", label: "现场勘察", icon: Camera, permission: "survey" },
      { id: "files", label: "项目资料", icon: FolderOpen, permission: "files" },
      { id: "acceptance", label: "项目验收", icon: FileCheck2, permission: "acceptance" },
    ],
  },
  {
    id: "supply",
    label: "合同与供应链",
    items: [
      { id: "contracts", label: "合同管理", icon: FileText, permission: "contracts" },
      { id: "materials", label: "材料库存管理", icon: Package, permission: "materials" },
      { id: "supply", label: "供应链管理", icon: Truck, permission: "supply" },
      { id: "cost", label: "成本与预算", icon: DollarSign, permission: "cost" },
    ],
  },
  {
    id: "collaboration",
    label: "协作与人员",
    items: [
      { id: "chat", label: "工作群", icon: MessageSquare, permission: "collaboration" },
      { id: "personnel", label: "施工人员", icon: Users, permission: "personnel" },
      { id: "partners", label: "参建外协", icon: Handshake, permission: "partners" },
      { id: "organization", label: "公司组织", icon: Network, permission: "organization" },
      { id: "opinions", label: "意见中心", icon: MessageSquare, permission: "dashboard" },
    ],
  },
  {
    id: "system",
    label: "系统管理",
    items: [
      { id: "accounts", label: "帐号与权限", icon: UserCog, permission: "accounts" },
      { id: "settings", label: "系统设置", icon: Settings, permission: "settings" },
      { id: "version-management", label: "版本管理", icon: History, permission: "dashboard" },
    ],
  },
];

const mobileNavItems = [
  { id: "dashboard", label: "汇总", icon: LayoutDashboard },
  { id: "board", label: "项目", icon: KanbanSquare },
  { id: "work-memo", label: "待办", icon: ClipboardList },
  { id: "chat", label: "协作", icon: MessageSquare },
];
const lowFrequencyMobileItems = new Set(["opinions", "version-management", "settings", "accounts", "organization"]);

export function Sidebar({ activeTab, setActiveTab, onOpenProcurement }: SidebarProps) {
  const { user, logout, can } = useAuth();
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(["workspace", "execution", "supply"]);
  const canViewAccounts = can("accounts");
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.id === "accounts" ? canViewAccounts : can(item.permission)) })).filter((group) => group.items.length > 0);
  const mobileWorkbenchGroups = visibleNavGroups.map((group) => ({ ...group, items: group.items.filter((item) => !lowFrequencyMobileItems.has(item.id)) })).filter((group) => group.items.length > 0);
  const visibleNavItems = visibleNavGroups.flatMap((group) => group.items);
  const visibleMobileNavItems = mobileNavItems.filter((item) => can(item.id === "board" ? "projects" : item.id === "chat" ? "collaboration" : item.id));

  useEffect(() => {
    if (!isWorkbenchOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsWorkbenchOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isWorkbenchOpen]);

  const navigate = (tab: string) => {
    setActiveTab(tab);
    setIsWorkbenchOpen(false);
  };

  const handleLogout = () => {
    void logout();
  };

  return (
    <>
    <aside className="hidden md:flex w-64 bg-white flex-col h-full border-r border-slate-200 shrink-0 shadow-sm z-20">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-slate-900 p-2 rounded-xl text-white shadow-sm">
          <Building2 className="w-5 h-5" />
        </div>
        <h1 className="font-bold text-xl text-slate-900 tracking-tight">
          智建协同 Pro
        </h1>
      </div>
      
      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {visibleNavGroups.map((group) => {
          const isOpen = openGroups.includes(group.id);
          return <section key={group.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-1.5">
            <button onClick={() => setOpenGroups((current) => isOpen ? current.filter((id) => id !== group.id) : [...current, group.id])} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-white hover:text-slate-600">
              {group.label}<span className={cn("text-slate-300 transition-transform", isOpen && "rotate-180")}>⌄</span>
            </button>
            {isOpen && <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return <button key={item.id} onClick={() => setActiveTab(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all", isActive ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" : "text-slate-600 hover:bg-white hover:text-slate-900")}><Icon className="h-4.5 w-4.5" />{item.label}</button>;
              })}
            </div>}
          </section>;
        })}
      </nav>
      
      <div className="p-4 m-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-sm">
            {user?.name?.slice(0, 2).toUpperCase() || "--"}
          </div>
          <div className="flex flex-col text-left overflow-hidden">
            <span className="text-sm font-bold text-slate-900 truncate">{user?.name}</span>
            <span className="text-xs text-slate-500 truncate mt-0.5">{user?.email || `@${user?.username}`}</span>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors py-2 border-t border-slate-200/60 mt-2 pt-3"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>
    </aside>
    <nav className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-2 pt-2 grid grid-cols-5 gap-1 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.45)]" aria-label="手机主导航">
      {visibleMobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={cn(
              "h-14 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
              isActive ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="leading-none">{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={() => setIsWorkbenchOpen(true)}
        className={cn(
          "h-14 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
          !visibleMobileNavItems.some((item) => item.id === activeTab)
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        )}
        aria-label="打开全部功能"
        aria-expanded={isWorkbenchOpen}
      >
        <Grid2X2 className="w-5 h-5" />
        <span className="leading-none">工作台</span>
      </button>
    </nav>

    {isWorkbenchOpen && (
      <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="全部功能">
        <button
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
          onClick={() => setIsWorkbenchOpen(false)}
          aria-label="关闭工作台"
        />
        <section className="mobile-sheet relative w-full rounded-t-[28px] bg-white px-4 pt-3 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
          <div className="flex items-center justify-between px-1 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">工作台</h2>
              <p className="mt-0.5 text-xs text-slate-500">全部项目管理功能</p>
            </div>
            <button onClick={() => setIsWorkbenchOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[62vh] space-y-5 overflow-y-auto px-1 pb-6">
            {mobileWorkbenchGroups.map((group) => <section key={group.id}><h3 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</h3><div className="grid grid-cols-4 gap-x-2 gap-y-5">{group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return <button key={item.id} onClick={() => navigate(item.id)} className="flex min-w-0 flex-col items-center gap-2 text-center"><span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors", isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 bg-slate-50 text-slate-600")}><Icon className="h-5 w-5" /></span><span className={cn("w-full truncate text-[11px]", isActive ? "font-semibold text-slate-900" : "text-slate-600")}>{item.label}</span></button>;
            })}</div></section>)}
          </div>
        </section>
      </div>
    )}
    </>
  );
}
