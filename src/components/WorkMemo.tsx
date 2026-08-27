import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Bell, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GitBranch, MessageSquareText, Mic, Plus, UserRound, X } from "lucide-react";
import { useAuth } from "@/src/lib/auth";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { cn } from "@/src/lib/utils";
import { formatLocalDate } from "@/src/lib/management";
import { appendFollowUpToSchedule, buildTaskChain, canCreateFollowUp, createFollowUpRecord, getAssignees, getDisplayText, getTaskChains } from "@/src/lib/workMemoFollowUps";
import { resolveFollowUpProject } from "@/src/lib/followUpProject";
import { apiClient } from "@/src/lib/apiClient";

type MemoStatus = "pending" | "in-progress" | "feedback" | "confirmed";
type WorkMemoRecord = {
  id: string;
  title: string;
  detail: string;
  assignee: string;
  assignees?: string[];
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
  projectId?: string;
  parentMemoId?: string;
  rootMemoId?: string;
  relationType?: "follow-up";
  followUpCount?: number;
  chainId?: string;
};

const emptyMemo: WorkMemoRecord[] = [];
function normalizeMemoRecords(value: unknown): WorkMemoRecord[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        ...item,
        id: getDisplayText(item.id) || `legacy-memo-${index}`,
        title: getDisplayText(item.title) || getDisplayText(item.name) || "未命名工作安排",
        detail: getDisplayText(item.detail), projectName: getDisplayText(item.projectName), creator: getDisplayText(item.creator), dueDate: getDisplayText(item.dueDate), feedback: getDisplayText(item.feedback), assignee: getDisplayText(item.assignee),
        status: getDisplayText(item.status) as MemoStatus, priority: getDisplayText(item.priority) as WorkMemoRecord["priority"], targetType: getDisplayText(item.targetType) as WorkMemoRecord["targetType"], crewName: getDisplayText(item.crewName), crewContact: getDisplayText(item.crewContact), projectId: getDisplayText(item.projectId), parentMemoId: getDisplayText(item.parentMemoId), rootMemoId: getDisplayText(item.rootMemoId), chainId: getDisplayText(item.chainId), relationType: getDisplayText(item.relationType) as WorkMemoRecord["relationType"], assignees: getAssignees(item),
      }) as WorkMemoRecord)
    : [];
}
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

function TaskChainPanel({ chain, records }: { chain: any; records: WorkMemoRecord[] }) {
  const root = chain.root;
  if (!root) return null;
  const children = chain.byParent.get(root.id) || [];
  return <div className="task-chain-reveal mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-bold text-violet-800"><GitBranch className="h-3.5 w-3.5" />任务链 · {records.filter((item) => (item.chainId || item.rootMemoId || item.id) === chain.chainId).length} 个节点</div><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-task-chains", { detail: { projectName: root.projectName } }))} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-violet-700 shadow-sm hover:bg-violet-100">查看整个项目任务链</button></div>
    <div className="mt-2 space-y-2 border-l-2 border-violet-200 pl-3">
      <ChainNode item={root} label="起始任务" />
      {children.map((child) => <ChainBranch key={child.id} item={child} byParent={chain.byParent} depth={1} />)}
    </div>
  </div>;
}

function ChainBranch({ item, byParent, depth }: { key?: string; item: WorkMemoRecord; byParent: Map<string, WorkMemoRecord[]>; depth: number }) {
  return <div className="space-y-2">
    <ChainNode item={item} label={depth === 1 ? "后续任务" : "任务分支"} />
    {depth < 3 && (byParent.get(item.id) || []).map((child) => <div key={child.id} className="ml-3 border-l-2 border-violet-100 pl-3"><ChainBranch item={child} byParent={byParent} depth={depth + 1} /></div>)}
  </div>;
}

function ChainNode({ item, label }: { item: WorkMemoRecord; label: string }) {
  const assignees = getAssignees(item).join("、") || "待指派";
  return <div className="rounded-lg border border-white bg-white px-3 py-2 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-violet-500">{label}</span><span className="text-[10px] text-slate-400">{statusLabels[item.status]}</span></div><p className="mt-1 text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-1 text-xs text-slate-500">{assignees} · {item.dueDate || "未设置日期"}</p></div>;
}

function hasAssignedPerson(item: WorkMemoRecord, user: any) {
  return getAssignees(item).some((person) => isSamePerson(person, user));
}

function looksLikeFollowUp(feedback: string) {
  return /(下一步|后续|待整改|整改|复核|跟进|落实|安排|需要处理|待处理|遗留)/.test(feedback);
}

function followUpTitleFromFeedback(feedback: string) {
  const cleaned = feedback.replace(/^(执行反馈|反馈|下一步安排|后续安排)\s*[:：]?/i, "").split(/[\n。；;]/)[0].trim();
  return (cleaned || "根据执行反馈安排后续跟进").slice(0, 32);
}

type BatchDraft = { id: string; title: string; detail: string; projectId: string; projectName: string; assignee: string; dueDate: string; priority: "normal" | "high"; reviewReasons: string[] };

function normalizeBatchDrafts(result: any): BatchDraft[] {
  const items = Array.isArray(result?.items) && result.items.length ? result.items : [result];
  return items.filter(Boolean).map((item: any, index: number) => ({
    id: String(item.id || `batch-draft-${index + 1}`),
    title: String(item.title || ""),
    detail: String(item.summary || item.detail || ""),
    projectId: String(item.projectId || ""),
    projectName: String(item.projectName || ""),
    assignee: String(item.assignee || item.assignees?.[0] || ""),
    dueDate: String(item.deadline || ""),
    priority: "normal",
    reviewReasons: Array.isArray(item.reviewReasons) ? item.reviewReasons.map(String) : [],
  }));
}

function BatchWorkMemoModal({ projects, personnel, user, onClose, onPublish }: { projects: any[]; personnel: any[]; user: any; onClose: () => void; onPublish: (drafts: BatchDraft[]) => void }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<BatchDraft[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const analyze = async () => {
    if (!text.trim()) return setError("请先输入至少一条工作安排。");
    setIsAnalyzing(true); setError("");
    try {
      const result = await apiClient.analyzeIntake({ inputType: "text", text: text.trim(), projects, personnel });
      const next = normalizeBatchDrafts(result);
      if (!next.length) throw new Error("没有识别出任务");
      setDrafts(next);
    } catch (caught: any) {
      if (caught?.status === 401 || caught?.message === "authentication_required") {
        setError("当前处于免登录试用模式，批量 AI 识别需要先登录官网账号；登录后请重新点击“生成任务预览”。");
      } else {
        setError(`AI 识别失败：${String(caught?.message || "请检查后台服务")}`);
      }
      setDrafts([]);
    } finally { setIsAnalyzing(false); }
  };
  const update = (index: number, patch: Partial<BatchDraft>) => setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const valid = drafts.length > 0 && drafts.every((item) => item.title.trim() && item.assignee.trim() && item.dueDate);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">批量智能新建工作安排</h3><p className="mt-1 text-xs text-slate-500">一次输入多条任务，AI 拆分后逐条确认项目、负责人和日期。</p></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
    {!drafts.length ? <div className="space-y-4"><textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="例如：今天整理 A 项目竣工资料；明天去 B 项目现场复核设备；周五让张强跟进 C 项目报价。" />{error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}<button type="button" onClick={() => void analyze()} disabled={isAnalyzing} className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50">{isAnalyzing ? "AI 正在拆分和识别…" : "生成任务预览"}</button><button type="button" onClick={onClose} className="w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">返回单条填写</button></div> : <div className="space-y-4"><div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">已识别 {drafts.length} 条任务，请逐条确认后批量发布。</div>{drafts.map((item, index) => <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-indigo-600">任务 {index + 1}</span><button type="button" onClick={() => setDrafts(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs text-rose-500">删除</button></div><input value={item.title} onChange={(event) => update(index, { title: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium" placeholder="任务标题" /><textarea value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} placeholder="任务说明" /><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><label className="text-xs text-slate-500">项目<select value={item.projectId} onChange={(event) => { const project = projects.find((candidate: any) => String(candidate.id) === event.target.value); update(index, { projectId: project?.id || "", projectName: project?.name || "" }); }} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"><option value="">{item.projectName ? `AI 识别：${item.projectName}` : "未关联项目"}</option>{projects.map((project: any) => <option key={project.id || project.name} value={project.id}>{project.name}{project.projectNumber ? `（${project.projectNumber}）` : ""}</option>)}</select></label><label className="text-xs text-slate-500">负责人<select value={item.assignee} onChange={(event) => update(index, { assignee: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"><option value="">选择负责人</option>{personnel.filter((person: any) => person?.name && person?.status !== "inactive").map((person: any) => <option key={person.id || person.name} value={person.name}>{person.name}</option>)}</select></label><label className="text-xs text-slate-500">截止日期<input type="date" value={item.dueDate} onChange={(event) => update(index, { dueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" /></label></div>{item.reviewReasons.length > 0 && <p className="text-xs text-amber-700">AI 提示：{item.reviewReasons.join("；")}</p>}</div>)}{error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}<div className="flex gap-3"><button type="button" onClick={() => setDrafts([])} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">重新输入</button><button type="button" disabled={!valid} onClick={() => onPublish(drafts)} className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50">批量发布 {drafts.length} 条</button></div></div>}
  </div></div>;
}

export function WorkMemo({ onOpenTaskChains }: { onOpenTaskChains?: (projectReference?: string) => void }) {
  const { user } = useAuth();
  const [projectBoardData] = useProjectBoardData();
  const [personnelData] = useSyncedAppData<any[]>("personnelData", []);
  const [scheduleData, setScheduleData] = useSyncedAppData<any[]>("scheduleData", []);
  const [rawRecords, setRecords] = useSyncedAppData<WorkMemoRecord[]>("workMemos", emptyMemo);
  const records = useMemo(() => normalizeMemoRecords(rawRecords), [rawRecords]);
  const [filter, setFilter] = useState<"all" | "mine" | "company" | "unconfirmed" | "overdue">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<WorkMemoRecord | null>(null);
  const [followUpFor, setFollowUpFor] = useState<WorkMemoRecord | null>(null);
  const [editingMemo, setEditingMemo] = useState<WorkMemoRecord | null>(null);
  const [form, setForm] = useState({ title: "", detail: "", projectName: "", targetType: "internal" as "internal" | "crew", crewName: "", crewContact: "", assignee: "", dueDate: formatLocalDate(), priority: "normal" as "normal" | "high" });
  const [feedback, setFeedback] = useState("");
  const [followUpForm, setFollowUpForm] = useState({ title: "", detail: "", projectId: "", projectName: "", assignee: "", dueDate: formatLocalDate(), priority: "normal" as "normal" | "high" });
  const [editForm, setEditForm] = useState({ title: "", detail: "", projectName: "", assignee: "", dueDate: formatLocalDate(), priority: "normal" as "normal" | "high" });
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const today = formatLocalDate();
  const projects = useMemo(() => projectBoardData.flatMap((column: any) => column.projects || []), [projectBoardData]);
  const internalPeople = useMemo(() => personnelData.filter((person: any) => person?.name && person?.status !== "inactive"), [personnelData]);
  const followUpsByParent = useMemo(() => records.reduce((map, item) => { if (item.parentMemoId) map.set(item.parentMemoId, [...(map.get(item.parentMemoId) || []), item]); return map; }, new Map<string, WorkMemoRecord[]>()), [records]);

  const taskChainFor = (item: WorkMemoRecord) => {
    const chain = buildTaskChain(records, item.id);
    return { ...chain, children: chain.byParent.get(item.id) || [] };
  };

  const stats = useMemo(() => ({
    total: records.filter(item => item.status !== "confirmed" && (item.status as string) !== "completed").length,
    mine: records.filter(item => hasAssignedPerson(item, user) && item.status !== "confirmed" && (item.status as string) !== "completed").length,
    unconfirmed: records.filter(item => item.status === "feedback").length,
    overdue: records.filter(item => item.status !== "confirmed" && (item.status as string) !== "completed" && item.dueDate < today).length,
  }), [records, today, user]);

  const visible = useMemo(() => records.filter(item => {
    if (item.status === "confirmed" || (item.status as string) === "completed") return false;
    if (filter === "mine") return hasAssignedPerson(item, user);
    if (filter === "company") return item.targetType === "internal";
    if (filter === "unconfirmed") return item.status === "feedback";
    if (filter === "overdue") return item.dueDate < today;
    return true;
  }), [filter, records, today, user]);
  const calendarDays = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const count = new Date(year, month, 0).getDate();
    const leading = (first.getDay() + 6) % 7;
    return Array.from({ length: leading + count }, (_, index) => index < leading ? null : `${calendarMonth}-${String(index - leading + 1).padStart(2, "0")}`);
  }, [calendarMonth]);
  const shiftMonth = (offset: number) => { const [year, month] = calendarMonth.split("-").map(Number); const next = new Date(year, month - 1 + offset, 1); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); };

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
    setRecords(current => [record, ...normalizeMemoRecords(current)]);
    setForm({ title: "", detail: "", projectName: "", targetType: "internal", crewName: "", crewContact: "", assignee: "", dueDate: today, priority: "normal" });
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "工作安排已发布，负责人可以开始执行" }));
  };

  const publishBatchMemos = (drafts: BatchDraft[]) => {
    const now = new Date().toISOString();
    const next = drafts.map((draft, index) => ({
      id: `memo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      title: draft.title.trim(), detail: draft.detail.trim(), projectId: draft.projectId, projectName: draft.projectName.trim(),
      targetType: "internal" as const, crewName: "", crewContact: "", progress: 0, assignee: draft.assignee.trim(), assignees: [draft.assignee.trim()],
      creator: user?.name || user?.username || "系统用户", dueDate: draft.dueDate, priority: draft.priority, status: "pending" as const, feedback: "", createdAt: now,
    }));
    setRecords(current => [...next, ...normalizeMemoRecords(current)]);
    setIsBatchOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `已批量发布 ${next.length} 条工作安排` }));
  };

  const updateMemo = (id: string, changes: Partial<WorkMemoRecord>) => setRecords(current => normalizeMemoRecords(current).map(item => item.id === id ? { ...item, ...changes } : item));

  const openFollowUp = (parent: WorkMemoRecord) => {
    if (!canCreateFollowUp(parent, user)) return;
    const matchedProject = resolveFollowUpProject(projects, parent);
    setFollowUpFor(parent);
    setFollowUpForm({ title: "", detail: "", projectId: matchedProject.projectId, projectName: matchedProject.projectName, assignee: "", dueDate: today, priority: "normal" });
  };

  const openFollowUpFromFeedback = (parent: WorkMemoRecord, feedbackText: string) => {
    if (!canCreateFollowUp(parent, user)) return;
    const matchedProject = resolveFollowUpProject(projects, parent);
    setFollowUpFor(parent);
    setFollowUpForm({ title: followUpTitleFromFeedback(feedbackText), detail: feedbackText.trim(), projectId: matchedProject.projectId, projectName: matchedProject.projectName, assignee: "", dueDate: today, priority: "normal" });
  };

  const createFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!followUpFor || !followUpForm.title.trim() || !followUpForm.assignee || !followUpForm.dueDate) return;
    const record = createFollowUpRecord(followUpFor, followUpForm, user);
    await setRecords((current) => [record, ...normalizeMemoRecords(current)]);
    if (record.projectId) await setScheduleData((current) => appendFollowUpToSchedule(current, record));
    setFollowUpFor(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "后续跟进已发布，已加入工作备忘和项目排期" }));
  };

  const openEditMemo = (item: WorkMemoRecord) => {
    if (item.status !== "confirmed" || !canOperate(item)) return;
    setEditingMemo(item);
    setEditForm({ title: item.title, detail: item.detail || "", projectName: item.projectName || "", assignee: getAssignees(item)[0] || "", dueDate: item.dueDate, priority: item.priority });
  };

  const saveEditedMemo = (event: FormEvent) => {
    event.preventDefault();
    if (!editingMemo || !editForm.title.trim() || !editForm.assignee.trim() || !editForm.dueDate) return;
    updateMemo(editingMemo.id, { title: editForm.title.trim(), detail: editForm.detail.trim(), projectName: editForm.projectName.trim(), assignee: editForm.assignee.trim(), assignees: [editForm.assignee.trim()], dueDate: editForm.dueDate, priority: editForm.priority });
    setEditingMemo(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "已完成工作备忘已更新，完成状态保持不变" }));
  };

  const submitFeedback = (event: FormEvent) => {
    event.preventDefault();
    if (!feedbackFor || !feedback.trim()) return;
    const parent = feedbackFor;
    const feedbackText = feedback.trim();
    updateMemo(parent.id, { status: "feedback", feedback: feedbackText, feedbackAt: new Date().toISOString() });
    setFeedbackFor(null);
    setFeedback("");
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "反馈已提交，等待安排人确认" }));
    if (looksLikeFollowUp(feedbackText) && canCreateFollowUp(parent, user)) {
      openFollowUpFromFeedback(parent, feedbackText);
    }
  };

  const canOperate = (item: WorkMemoRecord) => hasAssignedPerson(item, user) || isSamePerson(item.creator, user) || user?.role === "admin" || user?.permissions?.includes("*");
  const canConfirm = (item: WorkMemoRecord) => isSamePerson(item.creator, user) || user?.role === "admin" || user?.permissions?.includes("*");
  const followUpProjectOptions = useMemo(() => {
    const current = followUpFor ? resolveFollowUpProject(projects, followUpFor) : { projectId: "", projectName: "" };
    if (!current.projectId || projects.some((project: any) => String(project.id) === current.projectId)) return projects;
    return [{ id: current.projectId, name: current.projectName, projectNumber: "" }, ...projects];
  }, [followUpFor, projects]);

  return <div className="w-full max-w-none space-y-6 p-4 md:p-8 xl:px-10">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Company workflow</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">工作备忘</h2><p className="mt-1 text-sm text-slate-500">每日安排、执行反馈和完成确认，所有成员都能看到进度。</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setIsCreateChoiceOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Plus className="h-4 w-4" />新建工作安排</button></div>
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {[{ id: "all", label: "未完成", value: stats.total, tone: "text-indigo-600" }, { id: "mine", label: "我的待办", value: stats.mine, tone: "text-blue-600" }, { id: "chains", label: "任务链", value: getTaskChains(records).length, tone: "text-violet-600" }, { id: "unconfirmed", label: "待确认反馈", value: stats.unconfirmed, tone: "text-amber-600" }, { id: "overdue", label: "已逾期", value: stats.overdue, tone: "text-rose-600" }].map(item => <button key={item.id} onClick={() => item.id === "chains" ? onOpenTaskChains?.() : setFilter(item.id as typeof filter)} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition", filter === item.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-100 hover:border-slate-300", item.id === "chains" && "hover:border-violet-300 hover:shadow-md")}><p className={cn("text-2xl font-bold", item.tone)}>{item.value}</p><p className="mt-1 text-xs font-medium text-slate-500">{item.label}</p>{item.id === "chains" && <p className="mt-1 text-[10px] text-violet-500">点击选择项目查看根状任务链</p>}</button>)}
    </div>
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 md:p-5"><div><h3 className="font-bold text-slate-900">{viewMode === "list" ? "工作安排列表" : "工作安排日历"}</h3><p className="mt-1 text-xs text-slate-500">发布后负责人反馈，安排人确认后才算完成。</p></div><div className="flex items-center gap-3"><div className="flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => setViewMode("list")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", viewMode === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}>列表</button><button type="button" onClick={() => setViewMode("calendar")} className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold", viewMode === "calendar" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}><CalendarDays className="h-3.5 w-3.5" />日历</button></div><span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><Bell className="h-4 w-4 text-amber-500" />逾期和待反馈会持续显示</span></div></div>
      {viewMode === "calendar" && <div className="p-4 md:p-5"><div className="mb-4 flex items-center justify-between"><button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button><h4 className="font-bold text-slate-800">{calendarMonth.replace("-", "年")}月</h4><button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button></div><div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span className="text-rose-400">六</span><span className="text-rose-400">日</span></div><div className="mt-2 grid grid-cols-7 gap-1">{calendarDays.map((date, index) => { const dayItems = date ? visible.filter((item) => item.dueDate === date) : []; return <div key={`${date || "empty"}-${index}`} className={cn("min-h-24 rounded-xl border p-2 text-left", date === today ? "border-indigo-300 bg-indigo-50/50" : "border-slate-100 bg-slate-50/40")}>{date && <><p className={cn("text-xs font-bold", date === today ? "text-indigo-700" : "text-slate-500")}>{Number(date.slice(-2))}</p><div className="mt-1 space-y-1">{dayItems.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={() => setFilter("all")} className={cn("block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px]", item.status === "confirmed" ? "bg-emerald-50 text-emerald-600 line-through" : item.priority === "high" ? "bg-rose-50 text-rose-600" : "bg-white text-slate-600")}>{item.title}</button>)}{dayItems.length > 3 && <p className="text-[10px] text-slate-400">+{dayItems.length - 3} 项</p>}</div></>}</div>; })}</div></div>}
      <div className={cn("grid gap-4 bg-slate-50/60 p-4 md:p-5 xl:grid-cols-2", viewMode === "calendar" && "hidden")}>
        {visible.map(item => { const overdue = item.status !== "confirmed" && item.dueDate < today; const actionable = canOperate(item); const assignees = item.assignees?.length ? item.assignees.join("、") : item.assignee; const followUps = followUpsByParent.get(item.id) || []; const parentTitle = item.parentMemoId ? records.find((candidate) => candidate.id === item.parentMemoId)?.title : ""; const chain = taskChainFor(item); const chainExpanded = Boolean(expandedChains[chain.chainId]); const toggleChain = () => setExpandedChains((current) => ({ ...current, [chain.chainId]: !chainExpanded })); return <article key={item.id} role="button" tabIndex={0} onClick={toggleChain} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleChain(); } }} className={cn("min-w-0 cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:border-indigo-200 hover:shadow-md active:scale-[0.99] md:p-5", chainExpanded ? "border-violet-300 ring-2 ring-violet-100 shadow-md" : "border-slate-200")}><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className={cn("text-sm font-bold", item.status === "confirmed" ? "text-slate-400 line-through" : "text-slate-900")}>{item.title}</h4><span className={cn("rounded-md px-2 py-1 text-[10px] font-bold", item.priority === "high" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500")}>{item.priority === "high" ? "重要" : "普通"}</span><span className={cn("rounded-md px-2 py-1 text-[10px] font-bold", item.status === "confirmed" ? "bg-emerald-50 text-emerald-600" : item.status === "feedback" ? "bg-amber-50 text-amber-600" : overdue ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600")}>{overdue ? "已逾期" : statusLabels[item.status]}</span></div>{item.detail && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail}</p>}<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />负责人：{assignees}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />截止：{item.dueDate}{item.dueTime ? ` ${item.dueTime}` : ""}</span><span>安排人：{item.creator}</span>{item.projectName && <span>项目：{item.projectName}</span>}{item.parentMemoId && <span className="text-violet-600">来源任务：{parentTitle || "已关联"}</span>}{followUps.length > 0 && <span className="text-violet-600">后续跟进：{followUps.length}项</span>}</div>{item.feedback && <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3"><p className="flex items-center gap-1 text-xs font-bold text-amber-800"><MessageSquareText className="h-3.5 w-3.5" />执行反馈</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{item.feedback}</p></div>}{chainExpanded && <TaskChainPanel chain={chain} records={records} />}</div><div onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-wrap gap-2 xl:max-w-[330px] xl:justify-end">{actionable && item.status !== "confirmed" && item.status !== "feedback" && <button onClick={() => updateMemo(item.id, { status: "in-progress" })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">标记进行中</button>}{actionable && item.status !== "confirmed" && <button onClick={() => { setFeedbackFor(item); setFeedback(item.feedback || ""); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><MessageSquareText className="h-3.5 w-3.5" />提交反馈</button>}{canConfirm(item) && item.status === "feedback" && <button onClick={() => { updateMemo(item.id, { status: "confirmed", confirmedAt: new Date().toISOString() }); window.dispatchEvent(new CustomEvent("show-toast", { detail: "已确认完成" })); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />确认完成</button>}{item.status === "confirmed" && canOperate(item) && <button type="button" onClick={() => openEditMemo(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">修改</button>}{item.status === "confirmed" && canCreateFollowUp(item, user) && <button type="button" onClick={() => openFollowUp(item)} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">添加后续跟进</button>}</div></div></article>; })}
        {visible.length === 0 && <div className="p-12 text-center text-sm text-slate-400"><Check className="mx-auto mb-2 h-6 w-6 text-emerald-500" />当前筛选暂无工作安排</div>}
      </div>
    </div>

    {isCreateChoiceOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">新建工作安排</h3><p className="mt-1 text-xs text-slate-500">选择输入方式，单条、批量和语音都从这里开始。</p></div><button type="button" onClick={() => setIsCreateChoiceOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => { setIsCreateChoiceOpen(false); setIsOpen(true); }} className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50"><p className="font-bold text-slate-900">单条填写</p><p className="mt-1 text-xs leading-5 text-slate-500">手动填写事项、负责人和截止日期。</p></button><button type="button" onClick={() => { setIsCreateChoiceOpen(false); setIsBatchOpen(true); }} className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-100"><p className="font-bold text-indigo-800">批量智能录入</p><p className="mt-1 text-xs leading-5 text-indigo-700">输入多条安排，AI 拆分后逐条确认。</p></button><button type="button" onClick={() => { setIsCreateChoiceOpen(false); window.dispatchEvent(new CustomEvent("open-smart-intake")); }} className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-left transition hover:border-violet-400 hover:bg-violet-100"><p className="font-bold text-violet-800">语音快速创建</p><p className="mt-1 text-xs leading-5 text-violet-700">直接录音，由豆包转写后生成任务。</p></button></div></div></div>}
    {isOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={createMemo} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">单条新建工作安排</h3><p className="mt-1 text-xs text-slate-500">发布后所有成员可见，负责人需要提交反馈。</p></div><button type="button" onClick={() => setIsOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">安排事项 *</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="例如：跟进客户合同盖章" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">具体要求/备注</span><textarea value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={3} placeholder="填写目标、交付物或需要注意的事项" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">负责人 *</span><select value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required><option value="">选择人员</option>{internalPeople.map((person: any) => <option key={person.id || person.name} value={person.name}>{person.name}{person.accountId || person.loginEnabled ? "（已开通账号）" : "（未开通账号）"}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">截止日期 *</span><input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required /></label></div><div className="flex gap-2"><button type="button" onClick={() => setForm({ ...form, priority: "normal" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>普通</button><button type="button" onClick={() => setForm({ ...form, priority: "high" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", form.priority === "high" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500")}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />重要</button></div><button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">发布工作安排</button></div></form></div>}
    {isBatchOpen && <BatchWorkMemoModal projects={projects} personnel={personnelData} user={user} onClose={() => setIsBatchOpen(false)} onPublish={publishBatchMemos} />}

    {editingMemo && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveEditedMemo} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">修改已完成工作备忘</h3><p className="mt-1 text-xs text-slate-500">修改后仍保留“已完成”状态。</p></div><button type="button" onClick={() => setEditingMemo(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务标题 *</span><input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务详情</span><textarea value={editForm.detail} onChange={(event) => setEditForm({ ...editForm, detail: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={4} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">归属项目</span><input value={editForm.projectName} onChange={(event) => setEditForm({ ...editForm, projectName: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">负责人 *</span><input value={editForm.assignee} onChange={(event) => setEditForm({ ...editForm, assignee: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">截止日期 *</span><input type="date" value={editForm.dueDate} onChange={(event) => setEditForm({ ...editForm, dueDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" required /></label></div><div className="flex gap-2"><button type="button" onClick={() => setEditForm({ ...editForm, priority: "normal" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", editForm.priority === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>普通</button><button type="button" onClick={() => setEditForm({ ...editForm, priority: "high" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", editForm.priority === "high" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500")}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />重要</button></div><button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">保存修改</button></div></form></div>}

    {followUpFor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={createFollowUp} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">添加后续跟进</h3><p className="mt-1 text-xs text-slate-500">来源任务：{followUpFor.title}</p></div><button type="button" onClick={() => setFollowUpFor(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务标题 *</span><input value={followUpForm.title} onChange={(event) => setFollowUpForm({ ...followUpForm, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500" placeholder="例如：复核现场整改项" required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">任务详情</span><textarea value={followUpForm.detail} onChange={(event) => setFollowUpForm({ ...followUpForm, detail: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500" rows={4} placeholder="填写需要复核的内容、交付物或现场要求" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">项目</span><select value={followUpForm.projectId} onChange={(event) => { const project = followUpProjectOptions.find((item: any) => item.id === event.target.value); setFollowUpForm({ ...followUpForm, projectId: event.target.value, projectName: project?.name || "" }); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"><option value="">未关联项目</option>{followUpProjectOptions.map((project: any) => <option key={project.id} value={project.id}>{project.name}{project.projectNumber ? `（${project.projectNumber}）` : ""}</option>)}</select></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">公司内部负责人 *</span><select value={followUpForm.assignee} onChange={(event) => setFollowUpForm({ ...followUpForm, assignee: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500" required><option value="">选择内部人员</option>{internalPeople.map((person: any) => <option key={person.id || person.name} value={person.name}>{person.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">截止日期 *</span><input type="date" value={followUpForm.dueDate} onChange={(event) => setFollowUpForm({ ...followUpForm, dueDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500" required /></label></div><div className="flex gap-2"><button type="button" onClick={() => setFollowUpForm({ ...followUpForm, priority: "normal" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", followUpForm.priority === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>普通</button><button type="button" onClick={() => setFollowUpForm({ ...followUpForm, priority: "high" })} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", followUpForm.priority === "high" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500")}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />重要</button></div><button type="submit" className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700">发布后续跟进</button></div></form></div>}

    {feedbackFor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitFeedback} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">提交执行反馈</h3><p className="mt-1 text-xs text-slate-500">{feedbackFor.title}</p></div><button type="button" onClick={() => setFeedbackFor(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" rows={5} placeholder="填写已完成内容、结果、问题或下一步安排" required /><button type="submit" className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700">提交反馈</button></form></div>}
  </div>;
}
