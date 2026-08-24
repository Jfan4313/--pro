import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, GitBranch, MessageSquareText, UserRound } from "lucide-react";
import { useAuth } from "@/src/lib/auth";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { formatLocalDate } from "@/src/lib/management";
import { getTaskChains } from "@/src/lib/workMemoFollowUps";
import { cn } from "@/src/lib/utils";

const statusLabels: Record<string, string> = {
  pending: "待开始",
  "in-progress": "进行中",
  in_progress: "进行中",
  feedback: "待确认",
  confirmed: "已完成",
  completed: "已完成",
};

function samePerson(value: string, user: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === String(user?.name || "").trim().toLowerCase()
    || normalized === String(user?.username || "").trim().toLowerCase();
}

function statusTone(status: string) {
  if (status === "confirmed" || status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "feedback") return "bg-amber-50 text-amber-700";
  if (status === "in-progress" || status === "in_progress") return "bg-blue-50 text-blue-700";
  return "bg-indigo-50 text-indigo-700";
}

export function MobileWorkMemo() {
  const { user } = useAuth();
  const [records] = useSyncedAppData<any[]>("workMemos", []);
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const today = formatLocalDate();
  const chains = useMemo(() => getTaskChains(records), [records]);
  const visible = useMemo(() => records.filter((item: any) => {
    if (filter === "mine") {
      const people = item.assignees?.length ? item.assignees : [item.assignee];
      return people.some((person: string) => samePerson(person, user));
    }
    if (filter === "overdue") return item.status !== "confirmed" && item.dueDate < today;
    return true;
  }), [filter, records, today, user]);

  return <div className="min-h-full bg-slate-50 px-4 pb-6 pt-4">
    <header className="rounded-[28px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-medium text-indigo-300">公司工作流</p><h2 className="mt-1 text-2xl font-bold tracking-tight">工作备忘</h2><p className="mt-2 text-sm leading-5 text-slate-400">查看安排、任务详情、执行反馈和任务链</p></div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><GitBranch className="h-5 w-5" /></span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric label="未完成" value={records.filter((item: any) => item.status !== "confirmed").length} />
        <Metric label="我的待办" value={records.filter((item: any) => (item.assignees?.length ? item.assignees : [item.assignee]).some((person: string) => samePerson(person, user)) && item.status !== "confirmed")} />
        <Metric label="任务链" value={chains.length} />
      </div>
    </header>
    <div className="mt-4 flex gap-2">
      {[['all', '全部'], ['mine', '我的待办'], ['overdue', '已逾期']].map(([id, label]) => <button key={id} onClick={() => setFilter(id as typeof filter)} className={cn("rounded-full px-4 py-2 text-xs font-semibold", filter === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500")}>{label}</button>)}
    </div>
    <div className="mt-4 space-y-3">
      {visible.map((item: any) => {
        const isExpanded = Boolean(expanded[item.id]);
        const overdue = item.status !== "confirmed" && item.dueDate < today;
        const assignees = item.assignees?.length ? item.assignees.join("、") : item.assignee || "待指派";
        const chain = chains.find((candidate: any) => candidate.chainId === (item.chainId || item.rootMemoId || item.id));
        return <article key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => setExpanded(current => ({ ...current, [item.id]: !isExpanded }))} className="w-full text-left">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={cn("text-sm font-bold", item.status === "confirmed" ? "text-slate-400 line-through" : "text-slate-900")}>{item.title}</h3><span className={cn("rounded-lg px-2 py-1 text-[10px] font-bold", statusTone(item.status))}>{overdue ? "已逾期" : statusLabels[item.status] || item.status}</span></div><p className="mt-2 text-xs text-slate-500">{item.projectName || "未关联项目"} · {assignees}</p></div><ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-300 transition-transform", isExpanded && "rotate-180")} /></div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400"><span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />截止：{item.dueDate || "未设置"}{item.dueTime ? ` ${item.dueTime}` : ""}</span><span>安排人：{item.creator || "未填写"}</span></div>
          </button>
          {isExpanded && <div className="mt-3 border-t border-slate-100 pt-3"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail || "暂无任务详情"}</p>{item.feedback && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><MessageSquareText className="mr-1 inline h-3.5 w-3.5" />执行反馈：{item.feedback}</div>}{item.parentMemoId && <p className="mt-3 text-xs text-violet-700"><GitBranch className="mr-1 inline h-3.5 w-3.5" />来源任务：{records.find((candidate: any) => candidate.id === item.parentMemoId)?.title || "已关联任务"}</p>}{chain && <p className="mt-2 text-xs text-violet-700"><GitBranch className="mr-1 inline h-3.5 w-3.5" />任务链：{Array.from(chain.byParent.values()).flat().length} 个节点</p>}<p className="mt-2 text-xs text-slate-400"><UserRound className="mr-1 inline h-3.5 w-3.5" />负责人：{assignees} <Clock3 className="ml-3 mr-1 inline h-3.5 w-3.5" />状态：{statusLabels[item.status] || item.status}</p></div>}
        </article>;
      })}
      {visible.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">当前筛选没有工作备忘</div>}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white/10 p-3 text-center"><p className="text-xl font-bold text-white">{value}</p><p className="mt-1 text-[10px] font-medium text-slate-300">{label}</p></div>;
}
