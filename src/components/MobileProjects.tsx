import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Eye, FolderKanban, Search, UserRound } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { cn } from "@/src/lib/utils";
import { getProjectNumber } from "@/src/lib/management";
import { sortProjectsNaturally } from "@/src/lib/projectNumbering";

type ProjectFilter = "all" | "active" | "risk" | "done";

const filterLabels: Array<{ id: ProjectFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "risk", label: "需关注" },
  { id: "done", label: "已完成" },
];

export function MobileProjects({ onOpenProject, onOpenProjectDetail }: { onOpenProject?: (projectId: string) => void; onOpenProjectDetail?: (projectId: string) => void }) {
  const [boardData] = useProjectBoardData();
  const [scheduleData] = useSyncedAppData<any[]>("scheduleData", []);
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");

  const projects = useMemo(() => boardData.flatMap((column: any) => (column.projects || []).map((project: any) => ({ ...project, boardStage: column.title }))), [boardData]);

  const enrichedProjects = useMemo(() => projects.map((project: any) => {
    const schedule = scheduleData.find((item: any) => item.id === project.id || item.name === project.name);
    const tasks = schedule?.tasks || [];
    const completed = tasks.filter((task: any) => task.status === "completed").length;
    const progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : Number(project.constructProgress || 0);
    const lifecycle = getProjectCurrentStageInfo(project.id, lifecycleStates);
    return { ...project, progress, lifecycle };
  }), [projects, scheduleData, lifecycleStates]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortProjectsNaturally(enrichedProjects.filter((project: any) => {
      const matchesQuery = !normalized || [project.name, project.manager, project.type].some((value) => String(value || "").toLowerCase().includes(normalized));
      const matchesFilter = filter === "all"
        || (filter === "active" && !["delayed", "warning", "success"].includes(project.status))
        || (filter === "risk" && ["delayed", "warning"].includes(project.status))
        || (filter === "done" && project.status === "success");
      return matchesQuery && matchesFilter;
    }));
  }, [enrichedProjects, filter, query]);

  const riskCount = enrichedProjects.filter((project: any) => ["delayed", "warning"].includes(project.status)).length;
  const doneCount = enrichedProjects.filter((project: any) => project.status === "success").length;

  return (
    <div className="min-h-full bg-slate-50 px-4 pb-6 pt-4">
      <header className="rounded-[28px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-medium text-indigo-300">项目中心</p><h2 className="mt-1 text-2xl font-bold tracking-tight">我的项目</h2><p className="mt-2 text-sm text-slate-400">快速查看进度、风险和当前阶段</p></div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><FolderKanban className="h-5 w-5" /></span>
        </div>
        <div className="mt-5 flex items-center rounded-2xl bg-white/10 px-3 py-3 focus-within:bg-white focus-within:text-slate-900">
          <Search className="mr-2 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、负责人或类型" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>
      </header>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <Summary label="全部项目" value={enrichedProjects.length} tone="text-indigo-600" />
        <Summary label="需关注" value={riskCount} tone="text-rose-600" />
        <Summary label="已完成" value={doneCount} tone="text-emerald-600" />
      </section>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {filterLabels.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors", filter === item.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500")}>{item.label}</button>)}
      </div>

      <section className="mt-4 space-y-3">
        {filteredProjects.map((project: any) => {
          const isRisk = ["delayed", "warning"].includes(project.status);
          const isDone = project.status === "success";
          return (
            <article key={project.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <button onClick={() => onOpenProject?.(project.id)} className="w-full text-left active:scale-[0.99]">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2">{project.type && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600">{project.type}</span>}{isRisk && <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600"><AlertTriangle className="h-3 w-3" />需关注</span>}{isDone && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" />已完成</span>}</div><h3 className="mt-2 truncate text-base font-bold text-slate-900">{project.name}</h3><p className="mt-1 font-mono text-[10px] text-slate-400">{getProjectNumber(project)}</p></div>
                  <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-slate-300" />
                </div>
                {(project.manager || project.dueDate) && <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  {project.manager && <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-slate-400" />{project.manager}</span>}
                  {project.dueDate && <span className="flex items-center justify-end gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />{project.dueDate}</span>}
                </div>}
                <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{project.lifecycle.stage.name.split(" ")[1] || project.boardStage}</span><span className="font-bold text-indigo-600">{project.progress}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", isRisk ? "bg-rose-500" : isDone ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} /></div>
                </div>
              </div>
              </button>
              <button type="button" onClick={() => onOpenProjectDetail?.(project.id)} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-3 text-xs font-semibold text-slate-500"><Eye className="h-3.5 w-3.5" />查看项目详情</button>
            </article>
          );
        })}
        {filteredProjects.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-500">没有符合条件的项目</p></div>}
      </section>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm"><p className={cn("text-xl font-bold", tone)}>{value}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{label}</p></div>;
}
