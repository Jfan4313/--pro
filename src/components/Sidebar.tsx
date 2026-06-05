import { LayoutDashboard, KanbanSquare, CalendarDays, Users, Package, Truck, Settings, Building2, MessageSquare, FileText, LogOut, DollarSign, Plus, Network } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenProcurement?: () => void;
}

const navItems = [
  { id: "dashboard", label: "项目汇总", icon: LayoutDashboard },
  { id: "board", label: "多项目看板", icon: KanbanSquare },
  { id: "lifecycle", label: "全生命周期", icon: FileText },
  { id: "schedule", label: "施工日程", icon: CalendarDays },
  { id: "cost", label: "成本与预算", icon: DollarSign },
  { id: "organization", label: "公司组织", icon: Network },
  { id: "personnel", label: "施工人员", icon: Users },
  { id: "materials", label: "材料与供应链", icon: Package },
  { id: "chat", label: "工作群", icon: MessageSquare },
  { id: "settings", label: "系统设置", icon: Settings },
];

export function Sidebar({ activeTab, setActiveTab, onOpenProcurement }: SidebarProps) {
  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '退出登录请求已发送' }));
  };

  return (
    <aside className="w-64 bg-white flex flex-col h-full border-r border-slate-200 shrink-0 shadow-sm z-20">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-slate-900 p-2 rounded-xl text-white shadow-sm">
          <Building2 className="w-5 h-5" />
        </div>
        <h1 className="font-bold text-xl text-slate-900 tracking-tight">
          智建协同 Pro
        </h1>
      </div>
      
      <div className="px-4 pb-2">
        <button 
          onClick={onOpenProcurement}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm shadow-slate-900/10"
        >
          <Plus className="w-4 h-4" /> 采购材料录入
        </button>
      </div>

      <nav className="flex-1 py-2 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 m-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-sm">
            PM
          </div>
          <div className="flex flex-col text-left overflow-hidden">
            <span className="text-sm font-bold text-slate-900 truncate">项目经理</span>
            <span className="text-xs text-slate-500 truncate mt-0.5">admin@project.local</span>
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
  );
}
