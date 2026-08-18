import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, Save, Download, Upload, Briefcase, CheckCircle2, Users, Package, FileText, ChevronRight } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { cn } from "@/src/lib/utils";
import { STAGES } from './ProjectLifecycle';
import { MobileHome } from './MobileHome';
import { useDashboardOverview } from '@/src/features/dashboard/useDashboardOverview';
import { progressTrendData, recentAnnouncements } from '@/src/features/dashboard/dashboardContent';
import { DASHBOARD_DATA_KEYS, exportWorkspaceSnapshot, importWorkspaceSnapshot } from '@/src/features/dashboard/dashboardTools';
import { dispatchRiskFocus, type RiskAction } from '@/src/lib/riskActions';
import { PRODUCT_RELEASE_SUMMARY, PRODUCT_VERSION, PRODUCT_VERSION_DATE } from '@/src/lib/productVersion';

export function Dashboard({ setActiveTab, onOpenProject }: { setActiveTab: (tab: string) => void; onOpenProject?: (projectId: string) => void }) {
  const {
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
  } = useDashboardOverview();

  const openRisk = (risk: any) => {
    setActiveTab(risk.actionTab);
    dispatchRiskFocus(risk);
  };

  const handleRiskAction = (risk: any, action: RiskAction) => {
    setActiveTab(risk.actionTab);
    dispatchRiskFocus(risk, action);
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const preview = JSON.parse(await file.text());
      const keys = Object.keys(preview?.data || {}).filter((key) => key.length > 0);
      const allowedKeys = keys.filter((key) => DASHBOARD_DATA_KEYS.includes(key));
      if (allowedKeys.length === 0) throw new Error("配置文件中没有可导入的数据");
      const confirmed = window.confirm(`即将导入 ${allowedKeys.length} 类工作区数据：\n${allowedKeys.join("、")}\n\n已有同名数据可能被覆盖，是否继续？`);
      if (!confirmed) return;
      const count = await importWorkspaceSnapshot(file);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `已导入 ${count} 类工作区数据，刷新后生效` }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: error?.message || '配置文件导入失败' }));
    }
  };

  return (
    <>
    <MobileHome
      projects={allFlatProjects}
      todayTasks={todayTasks}
      overdueTasks={overdueTasks}
      pendingApprovals={pendingApprovals}
      pendingApprovalTab={pendingApprovalTab}
      pendingQuickIntakes={pendingQuickIntakes}
      risks={risks}
      announcements={recentAnnouncements}
      setActiveTab={setActiveTab}
      onOpenProject={onOpenProject}
    />
    <div className="hidden md:block p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">项目汇总</h2>
        <div className="flex gap-3">
          <button onClick={() => { localStorage.setItem('zhijian-last-quick-save', new Date().toISOString()); window.dispatchEvent(new CustomEvent('show-toast', { detail: '已记录当前工作区保存点' })); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
            <Save className="w-4 h-4" /> 快速保存
          </button>
          <button onClick={() => void exportWorkspaceSnapshot().then(() => window.dispatchEvent(new CustomEvent('show-toast', { detail: '工作区配置已导出' })))} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors">
            <Download className="w-4 h-4" /> 导出配置
          </button>
          <button onClick={() => importInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
            <Upload className="w-4 h-4" /> 导入配置
          </button>
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg text-slate-900">今日工作台</h3>
              <p className="text-sm text-slate-500 mt-1">先处理异常、待确认事项和今日任务</p>
            </div>
            <button onClick={() => setActiveTab('work-memo')} className="text-sm text-indigo-600 font-medium">进入我的任务</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-100">
            <WorkbenchMetric label="今日待办" value={todayTasks.length} tone="indigo" onClick={() => setActiveTab("work-memo")} />
            <WorkbenchMetric label="逾期任务" value={overdueTasks.length} tone="rose" onClick={() => setActiveTab("work-memo")} />
            <WorkbenchMetric label="待确认采集" value={pendingQuickIntakes.length} tone="amber" onClick={() => setActiveTab("work-memo")} />
            <WorkbenchMetric label="待审批/待确认" value={pendingApprovals} tone="slate" onClick={() => setActiveTab(pendingApprovalTab)} />
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">待确认快速待办</h4>
                <span className="text-xs text-slate-400">{pendingQuickIntakes.length} 项</span>
              </div>
              <div className="space-y-3">
                {pendingQuickIntakes.slice(0, 4).map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                    <div className="text-sm font-medium text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.projectName || '未选项目'} · {item.assignee || '待指派'} · {item.deadline || '无截止'}</div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button onClick={() => rejectQuickIntake(item)} className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-500 hover:bg-white">驳回</button>
                      <button onClick={() => confirmQuickIntake(item)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white">确认写入</button>
                    </div>
                  </div>
                ))}
                {pendingQuickIntakes.length === 0 && <EmptyState text="暂无待确认采集" />}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">今日任务</h4>
                <span className="text-xs text-slate-400">{todayTasks.length} 项</span>
              </div>
              <div className="space-y-3">
                {todayTasks.slice(0, 5).map((task: any) => (
                  <button key={`${task.projectId}-${task.id}`} onClick={() => setActiveTab('schedule')} className="w-full text-left rounded-xl border border-slate-100 bg-slate-50 p-3 hover:border-indigo-200">
                    <div className="text-sm font-medium text-slate-900">{task.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{task.projectName} · {task.assignee || '待指派'}</div>
                  </button>
                ))}
                {todayTasks.length === 0 && <EmptyState text="今天没有明确截止任务" />}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-900">风险预警</h3>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">{risks.length}</span>
          </div>
          <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar">
            {risks.slice(0, 8).map((risk: any) => (
              <button key={risk.id} onClick={() => openRisk(risk)} className="w-full text-left rounded-xl border border-slate-100 p-3 hover:border-rose-200 hover:bg-rose-50/40">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-xs font-bold", risk.level === 'high' ? 'text-rose-600' : 'text-amber-600')}>{risk.type}</span>
                  <span className="text-[10px] text-slate-400">{risk.projectName}</span>
                </div>
                <div className="text-sm font-medium text-slate-900 mt-1">{risk.title}</div>
                {(risk.taskId || risk.personId || risk.orderId || risk.type === "合同缺失") && <div className="mt-2 flex gap-2 flex-wrap">{risk.taskId && <>{risk.type === "未分配负责人" && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "assign"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "assign"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200">指派负责人</span>}<span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "deadline"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "deadline"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200">调整截止日期</span>{risk.type === "任务逾期" && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "complete"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "complete"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600 shadow-sm ring-1 ring-slate-200">标记完成</span>}</>}{risk.personId && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "train"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "train"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600 shadow-sm ring-1 ring-slate-200">标记已培训</span>}{risk.orderId && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "delivered"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "delivered"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-emerald-600 shadow-sm ring-1 ring-slate-200">标记已到货</span>}{risk.type === "合同缺失" && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); handleRiskAction(risk, "create-contract"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); handleRiskAction(risk, "create-contract"); } }} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200">新建合同</span>}</div>}
              </button>
            ))}
            {risks.length === 0 && <EmptyState text="暂无风险预警" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="在建项目总数" 
          value={stats.totalProjects.toString()} 
          trend="实时更新" 
          trendText="来自看板"
          trendUp={true} 
          icon={Briefcase} 
          onClick={() => setActiveTab('board')}
        />
        <StatCard 
          title="延期任务数" 
          value={stats.delayedTasks.toString()} 
          trend="需关注" 
          trendText="来自日程"
          trendUp={false} 
          icon={AlertTriangle} 
          onClick={() => setActiveTab('schedule')}
        />
        <StatCard 
          title="在场人员总数" 
          value={stats.totalPersonnel.toString()} 
          trend="实时更新" 
          trendText="来自人员管理"
          trendUp={true} 
          icon={Users} 
          onClick={() => setActiveTab('personnel')}
        />
        <StatCard 
          title="库存预警物资" 
          value={stats.lowStockMaterials.toString()} 
          trend="需采购" 
          trendText="来自物资管理"
          trendUp={false} 
          icon={Package} 
          onClick={() => setActiveTab('materials')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-lg text-slate-900">项目进度对比 (计划 vs 实际)</h3>
              <p className="text-sm text-slate-500 mt-1">点击图例隐藏/显示系列，拖动滑块缩放查看</p>
            </div>
            <select className="text-sm border border-slate-200 rounded-lg text-slate-600 bg-white px-4 py-2 outline-none shadow-sm hover:border-slate-300 transition-colors">
              <option>2026年上半年</option>
              <option>2025年下半年</option>
            </select>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={progressTrendData} margin={{ top: 20, right: 0, bottom: 0, left: -20 }} barGap={0}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dx={-10} unit="%" />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} verticalAlign="top" />
                <Bar dataKey="planned" name="计划进度 (%)" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={16} />
                <Bar dataKey="actual" name="实际进度 (%)" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={16} />
                <Brush 
                  dataKey="month" 
                  height={30} 
                  stroke="#8884d8" 
                  fill="#f8fafc"
                  tickFormatter={() => ''}
                  startIndex={0}
                  endIndex={5}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="space-y-6">
          <div 
            onClick={() => setActiveTab('board')}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] h-[calc(50%-12px)] flex flex-col justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg">正常</span>
            </div>
            <h4 className="text-slate-500 text-sm font-medium mb-2">已验收项目数</h4>
            <div className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{acceptedProjects} <span className="text-lg font-normal text-slate-400">个</span></div>
            <p className="text-xs text-slate-400">来自项目看板状态</p>
          </div>
          
          <div 
            onClick={() => setActiveTab('contracts')}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] h-[calc(50%-12px)] flex flex-col justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Zap className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-xs font-bold rounded-lg">{fundUsage}%</span>
            </div>
            <h4 className="text-slate-500 text-sm font-medium mb-2">资金使用率</h4>
            <div className="text-3xl font-bold text-slate-900 tracking-tight mb-2">¥{financeSummary.actual.toLocaleString()}万</div>
            <p className="text-xs text-slate-400">总预算 ¥{financeSummary.budget.toLocaleString()}万</p>
          </div>
        </div>
      </div>

      {/* 最新项目公告 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] mt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-slate-900">工作群动态</h3>
            <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-xs font-bold rounded-full animate-pulse">New</span>
          </div>
          <button 
            onClick={() => setActiveTab('chat')}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            查看全部 <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recentAnnouncements.map(announcement => (
            <div 
              key={announcement.id} 
              onClick={() => setActiveTab('chat')}
              className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium text-slate-600 bg-white px-2 py-1 rounded-md border border-slate-200 group-hover:border-indigo-200">
                  {announcement.author}
                </span>
                <span className="text-xs text-slate-400">{announcement.date}</span>
              </div>
              <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                {announcement.isUrgent && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
                {announcement.title}
              </h4>
              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{announcement.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-6 shadow-[0_2px_10px_-4px_rgba(79,70,229,0.12)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-600 p-2.5 text-white"><Upload className="h-5 w-5" /></div>
            <div><div className="flex items-center gap-2"><h3 className="font-bold text-slate-900">版本更新</h3><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">v{PRODUCT_VERSION}</span></div><p className="mt-1 text-sm text-slate-600">{PRODUCT_RELEASE_SUMMARY}</p><p className="mt-1 text-xs text-slate-400">更新日期：{PRODUCT_VERSION_DATE}</p></div>
          </div>
          <button onClick={() => setActiveTab("version-management")} className="inline-flex items-center gap-1 self-start rounded-lg bg-white px-3 py-2 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-100 hover:bg-indigo-50 md:self-auto">查看完整更新记录 <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* 项目全生命周期进展 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] mt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900">项目全生命周期阶段一览</h3>
          </div>
          <button 
            onClick={() => setActiveTab('lifecycle')}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            进入生命周期管理 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          {STAGES.slice(0, 8).map((stage, idx) => (
            <div key={stage.id} className="flex flex-col gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50 relative overflow-hidden">
              <div className="text-xl font-bold text-slate-700">{lifecycleSummary.counts[stage.id] || 0}</div>
              <div className="text-xs font-medium text-slate-500 whitespace-nowrap truncate">{stage.name.split(' ')[1]}</div>
              <div className="absolute top-0 right-0 w-8 h-8 opacity-5">
                <FileText className="w-full h-full" />
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto pb-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="font-medium text-sm py-3 px-4">项目名称</th>
                <th className="font-medium text-sm py-3 px-4 text-center">类型</th>
                <th className="font-medium text-sm py-3 px-4 text-center">负责人</th>
                <th className="font-medium text-sm py-3 px-4 text-center">当前阶段</th>
                <th className="font-medium text-sm py-3 px-4">阶段进度</th>
              </tr>
            </thead>
            <tbody>
              {lifecycleSummary.recentProjects.slice(0, 5).map(proj => (
                <tr key={proj.id} onClick={() => onOpenProject?.(proj.id)} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <td className="py-3 px-4 font-medium text-slate-900 text-sm">
                    {proj.name}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">{proj.type}</span>
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-slate-600">{proj.manager}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                      {proj.stageName.split(' ')[1]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-full h-2 rounded-full bg-slate-100 grow max-w-[120px]">
                        <div 
                          className="h-full rounded-full bg-indigo-500" 
                          style={{ width: `${proj.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-500 w-8">{proj.progressPercent}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {lifecycleSummary.recentProjects.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <p className="text-sm font-semibold text-slate-600">还没有项目</p>
                    <p className="mt-1 text-xs text-slate-400">创建项目后，这里会显示阶段和归档进度</p>
                    <button onClick={() => setActiveTab("board")} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">创建第一个项目</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}

function StatCard({ title, value, trend, trendText, icon: Icon, hideTrend, trendUp, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all duration-300 relative overflow-hidden flex flex-col h-40 ${onClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/5' : ''}`}
    >
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className={`p-2.5 rounded-xl transition-colors ${onClick ? 'bg-slate-50 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {!hideTrend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md",
            trendUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          )}>
            {trendUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10 mt-auto">
        <div className="text-3xl font-bold text-slate-900 tracking-tight font-mono">{value}</div>
        <div className="text-sm font-medium text-slate-500 mt-1 flex justify-between items-center">
          <span>{title}</span>
          <span className="text-xs text-slate-400 font-normal">{trendText}</span>
        </div>
      </div>
      
      <div className={`absolute -bottom-8 -right-8 pointer-events-none transition-colors duration-500 ${onClick ? 'text-slate-50 group-hover:text-indigo-50/60' : 'text-slate-50'}`}>
        <Icon className="w-32 h-32" />
      </div>
    </div>
  );
}

function WorkbenchMetric({ label, value, tone, onClick }: any) {
  const colors: Record<string, string> = {
    indigo: "text-indigo-600 bg-indigo-50",
    rose: "text-rose-600 bg-rose-50",
    amber: "text-amber-600 bg-amber-50",
    slate: "text-slate-600 bg-slate-50",
  };
  return (
    <button type="button" onClick={onClick} className={cn("p-4 border-r last:border-r-0 border-slate-100 text-left transition-colors", onClick && "cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400")}>
      <div className={cn("inline-flex px-2 py-1 rounded-lg text-xs font-bold mb-2", colors[tone] || colors.slate)}>{label}</div>
      <div className="text-2xl font-bold text-slate-900 font-mono">{value}</div>
      <div className="mt-1 text-[10px] text-slate-400">点击查看</div>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">{text}</div>;
}
