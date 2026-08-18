import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Bell, Check, CheckCircle2, Clock3, MessageSquareText, Plus, UserRound, X } from "lucide-react";
import { useAuth } from "@/src/lib/auth";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { cn } from "@/src/lib/utils";
import { formatLocalDate } from "@/src/lib/management";

type MemoStatus = "pending" | "in-progress" | "feedback" | "confirmed";
type WorkMemoRecord = {
  id: string;
  title: string;
  detail: string;
  assignee: string;
  projectName: string;
  targetType: "internal" | "crew";
  crewName: string;
  crewContact: string;
  progress: number;
  creator: string;
  dueDate: string;
  priority: "normal" | "high";
  status: MemoStatus;
  feedback: string;
  feedbackAt?: string;
  confirmedAt?: string;
  createdAt: string;
};

const emptyMemo: WorkMemoRecord[] = [];
const statusLabels: Record<MemoStatus, string> = {
  pending: "待开始",
  "in-progress": "进行中",
  feedback: "待确认",
  confirmed: "已完成",
};

function isSamePerson(value: string, user: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === String(user?.name || "").trim().toLowerCase() || normalized === String(user?.username || "").trim().toLowerCase();
}

export function WorkMemo() {
  const { user } = useAuth();
  const [records, setRecords] = useSyncedAppData<WorkMemoRecord[]>("workMemos", emptyMemo);
  const [filter, setFilter] = useState<"all" | "mine" | "company" | "unconfirmed" | "overdue">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<WorkMemoRecord | null>(null);
  const [form, setForm] = useState({ title: "", detail: "", projectName: "", targetType: "internal" as "internal" | "crew", crewName: "", crewContact: "", assignee: "", dueDate: formatLocalDate(), priority: "normal" as "normal" | "high" });
  const [feedback, setFeedback] = useState("");
  const today = formatLocalDate();

  const stats = useMemo(() => ({
    total: records.filter(item => item.status !== "confirmed").length,
    mine: records.filter(item => isSamePerson(item.assignee, user) && item.status !== "confirmed").length,
    unconfirmed: records.filter(item => item.status === "feedback").length,
    overdue: records.filter(item => item.status !== "confirmed" && item.dueDate < today).length,
  }), [records, today, user]);

  const visible = useMemo(() => records.filter(item => {
    if (filter === "mine") return isSamePerson(item.assignee, user);
    if (filter === "company") return item.targetType === "internal";
    if (filter === "unconfirmed") return item.status === "feedback";
    if (filter === "overdue") return item.status !== "confirmed" && item.dueDate < today;
    return true;
  }), [filter, records, today, user]);

  const createMemo = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.assignee.trim() || !form.dueDate) return;
    const record: WorkMemoRecord = {
      ...form,
      id: `memo-${Date.now()}`,
      title: form.title.trim(),
      detail: form.detail.trim(),
      projectName: form.projectName.trim(),
      targetType: form.targetType,
      crewName: form.crewName.trim(),
      crewContact: form.crewContact.trim(),
      progress: 0,
      assignee: form.assignee.trim(),
      creator: user?.name || user?.username || "系统用户",
      status: "pending",
      feedback: "",
      createdAt: new Date().toISOString(),
    };
    setRecords(current => [record, ...current]);
    setForm({ title: "", detail: "", projectName: "", targetType: "internal", crewName: "", crewContact: "", assignee: "", dueDate: today, priority: "normal" });
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "工作安排已发布，负责人可以开始执行" }));
  };

  const updateMemo = (id: string, changes: Partial<WorkMemoRecord>) => setRecords(current => current.map(item => item.id === id ? { ...item, ...changes } : item));

  const submitFeedback = (event: FormEvent) => {
    event.preventDefault();
    if (!feedbackFor || !feedback.trim()) return;
    updateMemo(feedbackFor.id, { status: "feedback", feedback: feedback.trim(), feedbackAt: new Date().toISOString() });
    setFeedbackFor(null);
    setFeedback("");
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "反馈已提交，等待安排人确认" }));
  };

  const canOperate = (item: WorkMemoRecord) => isSamePerson(item.assignee, user) || isSamePerson(item.creator, user) || user?.role === "admin" || user?.permissions?.includes("*");
  const canConfirm = (item: WorkMemoRecord) => isSamePerson(item.creator, user) || user?.role === "admin" || user?.permissions?.includes("*");

  return <div className="w-full max-w-none space-y-6 p-4 md:p-8 xl:px-10">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Company workflow</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">工作备忘</h2><p className="mt-1 text-sm text-slate-500">每日安排、执行反馈和完成确认，所有成员都能看到进度。</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => window.dispatchEvent(new CustomEvent("open-smart-intake"))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">快速创建</button><button onClick={() => setIsOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Plus className="h-4 w-4" />新建工作安排</button></div>
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {[{ id: "all", label: "未完成", value: stats.total, tone: "text-indigo-600" }, { id: "mine", label: "我的待办", value: stats.mine, tone: "text-blue-600" }, { id: "company", label: "公司任务", value: records.filter(item => item.targetType === "internal" && item.status !== "confirmed").length, tone: "text-violet-600" }, { id: "unconfirmed", label: "待确认反馈", value: stats.unconfirmed, tone: "text-amber-600" }, { id: "overdue", label: "已逾期", value: stats.overdue, tone: "text-rose-600" }].map(item => <button key={item.id} onClick={() => setFilter(item.id as typeof filter)} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition", filter === item.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-100 hover:border-slate-300")}><p className={cn("text-2xl font-bold", item.tone)}>{item.value}</p><p className="mt-1 text-xs font-medium text-slate-500">{item.label}</p></button>)}
    </div>

    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 md:p-5"><div><h3 className="font-bold text-slate-900">工作安排列表</h3><p className="mt-1 text-xs text-slate-500">发布后负责人反馈，安排人确认后才算完成。</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><Bell className="h-4 w-4 text-amber-500" />逾期和待反馈会持续显示</div></div>
      <div className="grid gap-4 bg-slate-50/60 p-4 md:p-5 xl:grid-cols-2">
        {visible.map(item => { const overdue = item.status !== "confirmed" && item.dueDate < today; const actionable = canOperate(item); return <article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md md:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className={cn("text-sm font-bold", item.status === "confirmed" ? "text-slate-400 line-through" : "text-slate-900")}>{item.title}</h4><span className={cn("rounded-md px-2 py-1 text-[10px] font-bold", item.priority === "high" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500")}>{item.priority === "high" ? "重要" : "普通"}</span><span className={cn("rounded-md px-2 py-1 text-[10px] font-bold", item.status === "confirmed" ? "bg-emerald-50 text-emerald-600" : item.status === "feedback" ? "bg-amber-50 text-amber-600" : overdue ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600")}>{overdue ? "已逾期" : statusLabels[item.status]}</span></div>{item.detail && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail}</p>}<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />负责人：{item.assignee}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />截止：{item.dueDate}</span><span>安排人：{item.creator}</span></div>{item.feedback && <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3"><p className="flex items-center gap-1 text-xs font-bold text-amber-800"><MessageSquareText className="h-3.5 w-3.5" />执行反馈</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{item.feedback}</p></div>}</div><div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[330px] xl:justify-end">{actionable && item.status !== "confirmed" && item.status !== "feedback" && <button onClick={() => updateMemo(item.id, { status: "in-progress" })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">标记进行中</button>}{actionable && item.status !== "confirmed" && <button onClick={() => { setFeedbackFor(item); setFeedback(item.feedback || ""); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><MessageSquareText className="h-3.5 w-3.5" />提交反馈</button>}{canConfirm(item) && item.status === "feedback" && <button onClick={() => { updateMemo(item.id, { status: "confirmed", confirmedAt: new Date().toISOString() }); window.dispatchEvent(new CustomEvent("show-toast", { detail: "已确认完成" })); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />确认完成</button>}</div></div></article>; })}
        {visible.length === 0 && <div className="p-12 text-center text-sm text-slate-400"><Check className="mx-auto mb-2 h-6 w-6 text-emerald-500" />当前筛选暂无工作安排</div>}
      </div>
    </div>

    {isOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={createMemo} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">新建工作安排</h3><p className="mt-1 text-xs text-slate-500">发布后所有成员可见，负责人需要提交反馈。</p></div><button type="button" onClick={() => setIsOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">安排事项 *</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="例如：跟进客户合同盖章" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">具体要求/备注</span><textarea value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={3} placeholder="填写目标、交付物或需要注意的事项" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">负责人 *</span><input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="填写姓名或帐号" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">截止日期 *</span><input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required /></label></div><div className="flex gap-2"><button type="button" onClick={() => setForm({ ...form, priority: "normal" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>普通</button><button type="button" onClick={() => setForm({ ...form, priority: "high" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "high" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500")}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />重要</button></div><button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">发布工作安排</button></div></form></div>}

    {feedbackFor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitFeedback} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">提交执行反馈</h3><p className="mt-1 text-xs text-slate-500">{feedbackFor.title}</p></div><button type="button" onClick={() => setFeedbackFor(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={5} placeholder="填写已完成内容、结果、问题或下一步安排" required /><button type="submit" className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">提交反馈</button></form></div>}
  </div>;
}
