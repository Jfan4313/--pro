import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, ExternalLink, FolderTree, GitBranch, MessageSquareText, Search, UserRound, X } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useAuth } from "@/src/lib/auth";
import { cn } from "@/src/lib/utils";
import { flattenProjects, formatLocalDate } from "@/src/lib/management";
import { appendFollowUpToSchedule, canCreateFollowUp, createFollowUpRecord, getTaskChains } from "@/src/lib/workMemoFollowUps";

type TaskChainsProps = { projectReference?: string; onOpenWorkMemo?: () => void };
type Scope = "focus" | "all" | "recent";

const statusText: Record<string, string> = { pending: "待开始", in_progress: "进行中", feedback: "待反馈", confirmed: "已完成", completed: "已完成" };
const statusTone: Record<string, string> = { pending: "bg-slate-100 text-slate-600", in_progress: "bg-amber-50 text-amber-700", feedback: "bg-orange-50 text-orange-700", confirmed: "bg-emerald-50 text-emerald-700", completed: "bg-emerald-50 text-emerald-700" };

export function TaskChains({ projectReference, onOpenWorkMemo }: TaskChainsProps) {
  const { user } = useAuth();
  const [projectBoardData] = useProjectBoardData();
  const [rawRecords, setRecords] = useSyncedAppData<any[]>("workMemos", []);
  const records = useMemo(() => Array.isArray(rawRecords)
    ? rawRecords.filter((item: any) => item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string")
    : [], [rawRecords]);
  const [personnel] = useSyncedAppData<any[]>("personnelData", []);
  const [scheduleData, setScheduleData] = useSyncedAppData<any[]>("scheduleData", []);
  const projects = useMemo(() => flattenProjects(projectBoardData), [projectBoardData]);
  const internalPeople = useMemo(() => personnel.filter((person: any) => person?.name && person.status !== "inactive"), [personnel]);
  const chains = useMemo(() => getTaskChains(records), [records]);
  const [scope, setScope] = useState<Scope>("focus");
  const [projectFilter, setProjectFilter] = useState(projectReference || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [followUpFor, setFollowUpFor] = useState<any | null>(null);
  const [form, setForm] = useState({ title: "", detail: "", projectId: "", projectName: "", assignee: "", dueDate: formatLocalDate(), priority: "normal" as "normal" | "high" });
  const today = formatLocalDate();

  useEffect(() => {
    if (!projectReference) return;
    const match = projects.find((project: any) => project.id === projectReference || project.name === projectReference || project.projectNumber === projectReference || project.code === projectReference);
    setProjectFilter(match?.id || projectReference);
  }, [projectReference, projects]);
  const visibleChains = useMemo(() => chains.filter((chain: any) => {
    const nodes = Array.from(chain.byParent.values()).flat() as any[];
    const recentLimit = new Date(); recentLimit.setDate(recentLimit.getDate() - 30);
    const matchesScope = scope === "all" || (scope === "focus" ? nodes.some((n) => n.status !== "confirmed" && n.status !== "completed") : nodes.some((n) => ["confirmed", "completed"].includes(n.status) && new Date(n.confirmedAt || n.updatedAt || n.createdAt || 0) >= recentLimit));
    const matchesProject = !projectFilter || nodes.some((n) => String(n.projectId || n.projectName || "") === projectFilter || String(n.projectName || "") === projectFilter);
    const matchesStatus = statusFilter === "all" || nodes.some((n) => (n.status || "pending") === statusFilter);
    const matchesAssignee = assigneeFilter === "all" || nodes.some((n) => (n.assignees || [n.assignee]).includes(assigneeFilter));
    const haystack = nodes.map((n) => `${n.title} ${n.detail} ${n.projectName}`).join(" ").toLowerCase();
    return matchesScope && matchesProject && matchesStatus && matchesAssignee && (!query || haystack.includes(query.toLowerCase()));
  }), [chains, scope, projectFilter, statusFilter, assigneeFilter, query]);
  const selectedChain = visibleChains.find((chain: any) => chain.chainId === selectedChainId) || visibleChains[0];
  const visibleNodes = useMemo(() => visibleChains.flatMap((chain: any) => Array.from(chain.byParent.values()).flat() as any[]), [visibleChains]);
  const stats = useMemo(() => ({ total: visibleNodes.length, done: visibleNodes.filter((n) => n.status === "confirmed" || n.status === "completed").length, active: visibleNodes.filter((n) => n.status === "in_progress").length, feedback: visibleNodes.filter((n) => n.status === "feedback").length, overdue: visibleNodes.filter((n) => n.status !== "confirmed" && n.status !== "completed" && n.dueDate && n.dueDate < today).length }), [visibleNodes, today]);
  const assignees = useMemo(() => Array.from(new Set(records.flatMap((item: any) => item.assignees || [item.assignee]).filter(Boolean))), [records]);

  useEffect(() => {
    if (!selectedChain && visibleChains[0]) setSelectedChainId(visibleChains[0].chainId);
    if (selectedChain && !selectedChainId) setSelectedChainId(selectedChain.chainId);
    if (selectedChain) {
      const ids = [selectedChain.root?.id, ...((selectedChain.byParent.get(selectedChain.root?.id) || []) as any[]).map((n) => n.id)].filter(Boolean);
      setExpanded((current) => current.size ? current : new Set(ids));
    }
  }, [selectedChain, selectedChainId, visibleChains]);

  const openFollowUp = (parent: any) => {
    const project = projects.find((item: any) => item.id === parent.projectId || item.name === parent.projectName);
    setFollowUpFor(parent);
    setForm({ title: "", detail: "", projectId: project?.id || parent.projectId || "", projectName: project?.name || parent.projectName || "", assignee: "", dueDate: parent.dueDate && parent.dueDate >= today ? parent.dueDate : today, priority: "normal" });
  };
  const submitFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!followUpFor || !form.title.trim() || !form.assignee || !form.dueDate) return;
    const task = createFollowUpRecord(followUpFor, form, user);
    await setRecords((current) => [...(Array.isArray(current) ? current : []), task]);
    await setScheduleData((current) => appendFollowUpToSchedule(current, task));
    setFollowUpFor(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "后续跟进已发布，并已加入任务链" }));
  };

  return <div className="min-h-full bg-[#f8fafc] p-4 md:p-8">
    <header className="mx-auto flex max-w-[1500px] flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">WORKFLOW / TASK CHAINS</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-950"><GitBranch className="h-8 w-8 text-indigo-600" />任务链</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">把前置任务、并行安排和后续跟进串成一条可追踪的执行路径。</p></div>
      <button onClick={onOpenWorkMemo} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"><ExternalLink className="h-4 w-4" />工作备忘</button>
    </header>
    <main className="mx-auto mt-6 max-w-[1500px] space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="grid grid-cols-1 gap-3 md:grid-cols-5"><select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"><option value="">全部项目</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"><option value="all">全部状态</option>{Object.entries(statusText).filter(([key]) => key !== "completed").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"><option value="all">全部负责人</option>{assignees.map((name) => <option key={name}>{name}</option>)}</select><label className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务链名称、项目或详情" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label></div><div className="mt-3 flex flex-wrap gap-2"><ScopeButton active={scope === "focus"} onClick={() => setScope("focus")}>未完成任务链</ScopeButton><ScopeButton active={scope === "recent"} onClick={() => setScope("recent")}>最近30天已完成</ScopeButton><ScopeButton active={scope === "all"} onClick={() => setScope("all")}>全部任务链</ScopeButton></div></section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["总任务", stats.total, "text-indigo-600"], ["已完成", stats.done, "text-emerald-600"], ["进行中", stats.active, "text-amber-600"], ["待反馈", stats.feedback, "text-orange-600"], ["已逾期", stats.overdue, "text-rose-600"]].map(([label, value, tone]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={cn("text-2xl font-bold", tone)}>{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>)}</section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">{visibleChains.length === 0 ? <EmptyState /> : visibleChains.map((chain: any) => <ChainCard key={chain.chainId} chain={chain} selected={selectedChain?.chainId === chain.chainId} expanded={expanded} setExpanded={setExpanded} onSelect={() => setSelectedChainId(chain.chainId)} onFollowUp={openFollowUp} user={user} />)}</div>
        <aside className="hidden h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:block">{selectedChain ? <ChainDetails chain={selectedChain} onOpenWorkMemo={onOpenWorkMemo} /> : <p className="text-sm text-slate-400">选择一条任务链查看详情</p>}</aside>
      </section>
    </main>
    {followUpFor && <FollowUpDialog form={form} setForm={setForm} projects={projects} people={internalPeople} parent={followUpFor} onClose={() => setFollowUpFor(null)} onSubmit={submitFollowUp} />}
  </div>;
}

function ScopeButton({ active, onClick, children }: any) { return <button onClick={onClick} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>{children}</button>; }
function EmptyState() { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center"><GitBranch className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-700">没有符合条件的任务链</h3><p className="mt-1 text-sm text-slate-400">可以切换到“全部任务链”查看历史记录。</p></div>; }

function ChainCard({ chain, selected, expanded, setExpanded, onSelect, onFollowUp, user }: any) {
  const root = chain.root; const nodes = Array.from(chain.byParent.values()).flat() as any[]; const done = nodes.filter((n) => n.status === "confirmed" || n.status === "completed").length;
  return <article className={cn("overflow-hidden rounded-2xl border bg-white shadow-sm transition", selected ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-200")} onClick={onSelect}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 to-white px-5 py-4"><div className="min-w-0"><div className="flex items-center gap-2"><FolderTree className="h-4 w-4 shrink-0 text-indigo-600" /><h2 className="truncate font-bold text-slate-900">{root?.projectName || "未关联项目"}</h2></div><p className="mt-1 text-xs text-slate-500">项目根节点 · {nodes.length} 个任务 · 已完成 {done}</p></div><div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${nodes.length ? Math.round(done / nodes.length * 100) : 0}%` }} /></div></div><div className="p-5"><div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3"><FolderTree className="h-4 w-4 text-indigo-600" /><div><p className="text-sm font-bold text-indigo-950">{root?.projectName || "未关联项目"}</p><p className="text-[10px] text-indigo-600">项目根节点，下面是主任务及后续分支</p></div></div><TimelineNode item={root} chain={chain} depth={0} expanded={expanded} setExpanded={setExpanded} onFollowUp={onFollowUp} user={user} /></div></article>;
}

function TimelineNode({ item, chain, depth, expanded, setExpanded, onFollowUp, user }: any) {
  if (!item) return null; const children = chain.byParent.get(item.id) || []; const isExpanded = depth === 0 || expanded.has(item.id); const done = item.status === "confirmed" || item.status === "completed"; const assignees = item.assignees?.length ? item.assignees.join("、") : item.assignee || "待指派";
  return <div className={cn("relative", depth > 0 && "ml-5 border-l-2 border-indigo-100 pl-5")}>{depth > 0 && <span className="absolute -left-2 top-6 h-3 w-3 rounded-full border-2 border-indigo-300 bg-white" />}<div className={cn("rounded-xl border p-4 transition", depth === 0 ? "border-indigo-100 bg-indigo-50/30" : "border-slate-200 bg-white", done && "border-emerald-100")}><div className="flex items-start gap-3"><div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", done ? "bg-emerald-100 text-emerald-600" : item.status === "in_progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500")}>{done ? <CheckCircle2 className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", statusTone[item.status] || statusTone.pending)}>{statusText[item.status] || "待开始"}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span><UserRound className="mr-1 inline h-3.5 w-3.5" />{assignees}</span><span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{item.dueDate || "未设置"}</span></div>{isExpanded && <><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail || "暂无任务详情"}</p>{item.feedback && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"><MessageSquareText className="mr-1 inline h-3.5 w-3.5" />执行反馈：{item.feedback}</div>}<div className="mt-3 flex flex-wrap gap-2">{children.length > 0 && <button onClick={() => setExpanded((current: Set<string>) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{expanded.has(item.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}后续 {children.length} 项</button>}{done && canCreateFollowUp(item, user) && <button onClick={() => onFollowUp(item)} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">添加后续跟进</button>}</div></>}</div></div></div>{isExpanded && children.map((child: any) => <TimelineNode key={child.id} item={child} chain={chain} depth={depth + 1} expanded={expanded} setExpanded={setExpanded} onFollowUp={onFollowUp} user={user} />)}</div>;
}

function ChainDetails({ chain, onOpenWorkMemo }: any) { const nodes = Array.from(chain.byParent.values()).flat() as any[]; const done = nodes.filter((n) => n.status === "confirmed" || n.status === "completed").length; return <><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><GitBranch className="h-4 w-4 text-indigo-600" />任务链详情</div><h3 className="mt-5 text-xl font-bold text-slate-950">{chain.root?.title}</h3><p className="mt-1 text-sm text-indigo-600">{chain.root?.projectName || "未关联项目"}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-bold text-slate-900">{done}/{nodes.length}</div><div className="text-xs text-slate-500">完成进度</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-bold text-slate-900">{nodes.length}</div><div className="text-xs text-slate-500">总节点</div></div></div><div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600"><p><Clock3 className="mr-2 inline h-4 w-4 text-slate-400" />最近更新：{nodes.map((n) => n.updatedAt || n.createdAt).filter(Boolean).sort().at(-1) || "暂无记录"}</p><p><UserRound className="mr-2 inline h-4 w-4 text-slate-400" />参与负责人：{Array.from(new Set(nodes.flatMap((n) => n.assignees || [n.assignee]).filter(Boolean))).join("、") || "待指派"}</p></div><button onClick={onOpenWorkMemo} className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">进入工作备忘</button></>; }

function FollowUpDialog({ form, setForm, projects, people, parent, onClose, onSubmit }: any) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={onSubmit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">添加后续跟进</h3><p className="mt-1 text-xs text-slate-500">来源任务：{parent.title}</p></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务标题 *</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="例如：复核现场整改项" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务详情</span><textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={3} placeholder="填写需要复核的内容或交付物" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">项目</span><select value={form.projectId} onChange={(e) => { const p = projects.find((item: any) => item.id === e.target.value); setForm({ ...form, projectId: e.target.value, projectName: p?.name || "" }); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">未关联项目</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">公司内部负责人 *</span><select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required><option value="">选择内部人员</option>{people.map((p: any) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">截止日期 *</span><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></label></div><div className="flex gap-2"><button type="button" onClick={() => setForm({ ...form, priority: "normal" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>普通</button><button type="button" onClick={() => setForm({ ...form, priority: "high" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "high" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500")}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />重要</button></div><button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">发布后续跟进</button></div></form></div>; }
