import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, Save, Download, Upload, Briefcase, CheckCircle2, Users, Package, FileText, ChevronRight } from 'lucide-react';
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from '../hooks/useFirebaseSync';
import { STAGES, getProjectCurrentStageInfo } from './ProjectLifecycle';

const progressTrendData = [
  { month: '1月', planned: 10, actual: 12 },
  { month: '2月', planned: 25, actual: 23 },
  { month: '3月', planned: 40, actual: 38 },
  { month: '4月', planned: 55, actual: 50 },
  { month: '5月', planned: 70, actual: 68 },
  { month: '6月', planned: 85, actual: 82 },
  { month: '7月', planned: 90, actual: 88 },
  { month: '8月', planned: 95, actual: 92 },
  { month: '9月', planned: 100, actual: 98 },
  { month: '10月', planned: 100, actual: 100 },
  { month: '11月', planned: 100, actual: 100 },
  { month: '12月', planned: 100, actual: 100 },
];

const recentAnnouncements = [
  {
    id: 1,
    title: "关于国庆期间施工安排的通知",
    content: "各项目部：为确保国庆期间施工安全与进度，请于本周五前提交假期值班表及施工计划...",
    date: "2026-03-16 09:00",
    author: "总经办",
    isUrgent: true,
  },
  {
    id: 2,
    title: "A区地基浇筑完成验收",
    content: "经监理单位及甲方联合验收，A区地基浇筑质量达标，同意进行下一道工序...",
    date: "2026-03-15 14:30",
    author: "工程部",
    isUrgent: false,
  },
  {
    id: 3,
    title: "新增塔吊设备进场安全规范",
    content: "鉴于近期多雨天气，所有新进场的大型起重设备必须进行二次防滑防雷检查...",
    date: "2026-03-14 11:15",
    author: "安监部",
    isUrgent: false,
  }
];

export function Dashboard({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [projects] = useFirebaseSync<any[]>('projectBoardData', []);
  const [tasks] = useFirebaseSync<any[]>('scheduleData', []);
  const [personnel] = useFirebaseSync<any[]>('personnelData', []);
  const [materials] = useFirebaseSync<any[]>('materialsData', []);
  const [lifecycleStates] = useFirebaseSync<Record<string, any>>('projectLifecycleStates', {});

  const allFlatProjects = useMemo(() => {
    return Array.isArray(projects) ? projects.flatMap(col => col.projects || []) : [];
  }, [projects]);

  const lifecycleSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    const recentProjects: any[] = [];

    allFlatProjects.forEach(proj => {
      const info = getProjectCurrentStageInfo(proj.id, lifecycleStates);
      counts[info.stage.id] = (counts[info.stage.id] || 0) + 1;
      
      recentProjects.push({
        ...proj,
        stageName: info.stage.name,
        progressPercent: info.progressPercent,
      });
    });

    // Optionally sort by something if we have a timestamp
    return { counts, recentProjects };
  }, [allFlatProjects, lifecycleStates]);

  const stats = useMemo(() => {
    let totalProjects = 0;
    projects.forEach(col => {
      totalProjects += col.projects?.length || 0;
    });

    let delayedTasks = 0;
    tasks.forEach(proj => {
      proj.tasks?.forEach((task: any) => {
        if (task.status === 'delayed') delayedTasks++;
      });
    });

    let lowStockMaterials = 0;
    materials.forEach(mat => {
      if (mat.status !== 'sufficient') lowStockMaterials++;
    });

    return {
      totalProjects,
      delayedTasks,
      totalPersonnel: personnel.length,
      lowStockMaterials
    };
  }, [projects, tasks, personnel, materials]);

  const handleAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: `${action} 操作已执行` }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">项目汇总</h2>
        <div className="flex gap-3">
          <button onClick={() => handleAction('快速保存')} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
            <Save className="w-4 h-4" /> 快速保存
          </button>
          <button onClick={() => handleAction('导出配置')} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors">
            <Download className="w-4 h-4" /> 导出配置
          </button>
          <button onClick={() => handleAction('导入配置')} className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
            <Upload className="w-4 h-4" /> 导入配置
          </button>
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
            <div className="text-3xl font-bold text-slate-900 tracking-tight mb-2">8 <span className="text-lg font-normal text-slate-400">个</span></div>
            <p className="text-xs text-slate-400">本年度累计</p>
          </div>
          
          <div 
            onClick={() => setActiveTab('contracts')}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] h-[calc(50%-12px)] flex flex-col justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Zap className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-xs font-bold rounded-lg">82%</span>
            </div>
            <h4 className="text-slate-500 text-sm font-medium mb-2">资金使用率</h4>
            <div className="text-3xl font-bold text-slate-900 tracking-tight mb-2">¥41,000万</div>
            <p className="text-xs text-slate-400">总预算 ¥50,000万</p>
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
                <tr key={proj.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
