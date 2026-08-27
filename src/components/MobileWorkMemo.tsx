import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderTree,
  GitBranch,
  MessageSquareText,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "@/src/lib/auth";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { formatLocalDate } from "@/src/lib/management";
import {
  canDeleteWorkMemo,
  canManageWorkMemo,
  getAssignees,
  getDisplayText,
  getTaskParentOptions,
  reparentTaskRecords,
} from "@/src/lib/workMemoFollowUps";
import { cn } from "@/src/lib/utils";

const statusLabels: Record<string, string> = {
  pending: "待开始",
  "in-progress": "进行中",
  in_progress: "进行中",
  feedback: "待确认",
  confirmed: "已完成",
  completed: "已完成",
};
type SafeMemo = {
  id: string;
  title: string;
  detail: string;
  projectId: string;
  projectName: string;
  creator: string;
  dueDate: string;
  dueTime: string;
  feedback: string;
  assignee: string;
  assignees: string[];
  status: string;
  parentMemoId: string;
  rootMemoId: string;
  chainId: string;
};
type ProjectTree = {
  name: string;
  records: SafeMemo[];
  roots: SafeMemo[];
  children: Map<string, SafeMemo[]>;
};

function samePerson(value: string, user: any) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    normalized ===
      String(user?.name || "")
        .trim()
        .toLowerCase() ||
    normalized ===
      String(user?.username || "")
        .trim()
        .toLowerCase()
  );
}
function statusTone(status: string) {
  if (status === "confirmed" || status === "completed")
    return "bg-emerald-50 text-emerald-700";
  if (status === "feedback") return "bg-amber-50 text-amber-700";
  if (status === "in-progress" || status === "in_progress")
    return "bg-blue-50 text-blue-700";
  return "bg-indigo-50 text-indigo-700";
}
function statusText(status: string) {
  return statusLabels[String(status || "")] || String(status || "待开始");
}

export function buildProjectTrees(records: SafeMemo[]): ProjectTree[] {
  const grouped = new Map<string, SafeMemo[]>();
  records.forEach((item) => {
    const name =
      String(item.projectName || "未关联项目").trim() || "未关联项目";
    grouped.set(name, [...(grouped.get(name) || []), item]);
  });
  return Array.from(grouped.entries()).map(([name, items]) => {
    const ids = new Set(items.map((item) => item.id));
    const children = new Map<string, SafeMemo[]>();
    items.forEach((item) => {
      const parentId =
        item.parentMemoId && ids.has(item.parentMemoId)
          ? item.parentMemoId
          : "__project_root__";
      children.set(parentId, [...(children.get(parentId) || []), item]);
    });
    return {
      name,
      records: items,
      roots: children.get("__project_root__") || [],
      children,
    };
  });
}

export function MobileWorkMemo() {
  const { user } = useAuth();
  const [rawRecords, setRawRecords] = useSyncedAppData<any[]>("workMemos", []);
  const records = useMemo<SafeMemo[]>(
    () =>
      Array.isArray(rawRecords)
        ? rawRecords
            .filter((item: any) => item && typeof item === "object")
            .map((item: any, index: number) => ({
              id: getDisplayText(item.id) || `legacy-memo-${index}`,
              title:
                getDisplayText(item.title) ||
                getDisplayText(item.name) ||
                "未命名工作安排",
              detail: getDisplayText(item.detail),
              projectId: getDisplayText(item.projectId),
              projectName: getDisplayText(item.projectName),
              creator: getDisplayText(item.creator),
              dueDate: getDisplayText(item.dueDate),
              dueTime: getDisplayText(item.dueTime),
              feedback: getDisplayText(item.feedback),
              assignee: getDisplayText(item.assignee),
              assignees: getAssignees(item),
              status: getDisplayText(item.status),
              parentMemoId: getDisplayText(item.parentMemoId),
              rootMemoId: getDisplayText(item.rootMemoId),
              chainId: getDisplayText(item.chainId),
            }))
        : [],
    [rawRecords],
  );
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingMemo, setEditingMemo] = useState<SafeMemo | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    detail: "",
    assignee: "",
    dueDate: "",
    parentMemoId: "",
  });
  const today = formatLocalDate();
  const projects = useMemo(() => buildProjectTrees(records), [records]);
  const visible = useMemo(
    () =>
      records.filter((item) => {
        if (item.status === "confirmed" || item.status === "completed")
          return false;
        if (filter === "mine")
          return item.assignees.some((person) => samePerson(person, user));
        if (filter === "overdue") return item.dueDate < today;
        return true;
      }),
    [filter, records, today, user],
  );
  const openEdit = (item: SafeMemo) => {
    if (!canManageWorkMemo(item, user)) return;
    setEditingMemo(item);
    setEditForm({
      title: item.title,
      detail: item.detail,
      assignee: item.assignees[0] || item.assignee,
      dueDate: item.dueDate,
      parentMemoId: item.parentMemoId,
    });
  };
  const saveEdit = () => {
    if (
      !editingMemo ||
      !editForm.title.trim() ||
      !editForm.assignee.trim() ||
      !editForm.dueDate
    )
      return;
    void setRawRecords((current) => {
      const updated = (Array.isArray(current) ? current : []).map(
        (item: any) =>
          getDisplayText(item?.id) === editingMemo.id
            ? {
                ...item,
                title: editForm.title.trim(),
                detail: editForm.detail.trim(),
                assignee: editForm.assignee.trim(),
                assignees: [editForm.assignee.trim()],
                dueDate: editForm.dueDate,
              }
            : item,
      );
      return reparentTaskRecords(
        updated,
        editingMemo.id,
        editForm.parentMemoId,
      );
    });
    setEditingMemo(null);
    window.dispatchEvent(
      new CustomEvent("show-toast", { detail: "工作备忘已更新" }),
    );
  };
  const deleteMemo = (item: SafeMemo) => {
    if (!canManageWorkMemo(item, user)) return;
    if (!canDeleteWorkMemo(records, item.id)) {
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: "该任务还有后续节点，需先处理后续任务后才能删除",
        }),
      );
      return;
    }
    if (!window.confirm(`确定删除工作备忘“${item.title}”吗？此操作无法撤销。`))
      return;
    void setRawRecords((current) =>
      (Array.isArray(current) ? current : []).filter(
        (candidate: any) => getDisplayText(candidate?.id) !== item.id,
      ),
    );
  };
  return (
    <div className="min-h-full bg-slate-50 px-4 pb-6 pt-4">
      <header className="rounded-[28px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-indigo-300">公司工作流</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">工作备忘</h2>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              按项目查看任务上下游、详情和执行反馈
            </p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <FolderTree className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric
            label="未完成"
            value={records.filter((item) => item.status !== "confirmed").length}
          />
          <Metric
            label="我的待办"
            value={
              records.filter(
                (item) =>
                  item.assignees.some((person) => samePerson(person, user)) &&
                  item.status !== "confirmed",
              ).length
            }
          />
          <Metric label="项目树" value={projects.length} />
        </div>
      </header>
      <div className="mt-4 flex gap-2">
        {(
          [
            ["all", "全部"],
            ["mine", "我的待办"],
            ["overdue", "已逾期"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-4 py-2 text-xs font-semibold",
              filter === id
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-500",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {visible.map((item) => {
          const isExpanded = Boolean(expanded[item.id]);
          const overdue = item.status !== "confirmed" && item.dueDate < today;
          const assignees = item.assignees.join("、") || "待指派";
          const project = projects.find((candidate) =>
            candidate.records.some((record) => record.id === item.id),
          );
          return (
            <article
              key={item.id}
              className={cn(
                "rounded-3xl border bg-white p-4 shadow-sm",
                isExpanded ? "border-indigo-200" : "border-slate-100",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((current) => ({
                    ...current,
                    [item.id]: !isExpanded,
                  }))
                }
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={cn(
                          "text-sm font-bold",
                          item.status === "confirmed"
                            ? "text-slate-400 line-through"
                            : "text-slate-900",
                        )}
                      >
                        {String(item.title)}
                      </h3>
                      <span
                        className={cn(
                          "rounded-lg px-2 py-1 text-[10px] font-bold",
                          statusTone(item.status),
                        )}
                      >
                        {overdue ? "已逾期" : statusText(item.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {String(item.projectName || "未关联项目")} · {assignees}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-slate-300 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400">
                  <span>
                    <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                    截止：{String(item.dueDate || "未设置")}
                    {item.dueTime ? ` ${String(item.dueTime)}` : ""}
                  </span>
                  <span>安排人：{String(item.creator || "未填写")}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {String(item.detail || "暂无任务详情")}
                  </p>
                  {item.feedback && (
                    <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />
                      执行反馈：{String(item.feedback)}
                    </div>
                  )}
                  <div className="mt-4">
                    <ProjectTaskTree project={project} currentId={item.id} />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    <UserRound className="mr-1 inline h-3.5 w-3.5" />
                    负责人：{assignees}
                    <Clock3 className="ml-3 mr-1 inline h-3.5 w-3.5" />
                    状态：{statusText(item.status)}
                  </p>
                  {canManageWorkMemo(item, user) && (
                    <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        修改
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMemo(item)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-semibold text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">
            当前筛选没有工作备忘
          </div>
        )}
      </div>
      {editingMemo && (
        <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/50 p-3">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  修改工作备忘
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  仅能选择同项目内的具体父任务。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMemo(null)}
                className="rounded-full p-2 text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-600">
                任务标题 *
                <input
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm({ ...editForm, title: event.target.value })
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                任务详情
                <textarea
                  value={editForm.detail}
                  onChange={(event) =>
                    setEditForm({ ...editForm, detail: event.target.value })
                  }
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                负责人 *
                <input
                  value={editForm.assignee}
                  onChange={(event) =>
                    setEditForm({ ...editForm, assignee: event.target.value })
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                截止日期 *
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(event) =>
                    setEditForm({ ...editForm, dueDate: event.target.value })
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                归入任务链
                <select
                  value={editForm.parentMemoId}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      parentMemoId: event.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"
                >
                  <option value="">作为独立任务</option>
                  {getTaskParentOptions(records, editingMemo).map(
                    (candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={saveEdit}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectTaskTree({
  project,
  currentId,
}: {
  project?: ProjectTree;
  currentId: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    [currentId]: true,
  });
  if (!project)
    return (
      <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
        暂无项目任务树
      </p>
    );
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
        <FolderTree className="h-4 w-4" />
        项目任务树
        <span className="ml-auto rounded-full bg-white px-2 py-1 text-[10px] text-indigo-600">
          {project.records.length} 个任务
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <FolderTree className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {String(project.name)}
            </p>
            <p className="text-[10px] text-indigo-600">项目根节点</p>
          </div>
        </div>
        <div className="mt-3 pl-2">
          {project.roots.length ? (
            project.roots.map((item, index) => (
              <TreeNode
                key={item.id}
                item={item}
                project={project}
                currentId={currentId}
                depth={0}
                branchIndex={index}
                expanded={expanded}
                setExpanded={setExpanded}
              />
            ))
          ) : (
            <p className="text-xs text-slate-400">暂无项目任务</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  item,
  project,
  currentId,
  depth,
  branchIndex,
  expanded,
  setExpanded,
}: {
  key?: string;
  item: SafeMemo;
  project: ProjectTree;
  currentId: string;
  depth: number;
  branchIndex: number;
  expanded: Record<string, boolean>;
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const children = project.children.get(item.id) || [];
  const isExpanded = expanded[item.id] !== false;
  const isCurrent = item.id === currentId;
  const label =
    depth === 0
      ? "主任务"
      : children.length > 1
        ? `分支任务 ${branchIndex + 1}`
        : "后续任务";
  const assignees = item.assignees.join("、") || "待指派";
  return (
    <div
      className={cn(
        "relative",
        depth > 0 && "ml-4 border-l-2 border-indigo-100 pl-4",
      )}
    >
      {depth > 0 && (
        <span className="absolute -left-[7px] top-6 h-3 w-3 rounded-full border-2 border-indigo-300 bg-white" />
      )}
      {depth > 0 && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-indigo-500">
          <ArrowDown className="h-3 w-3" />
          上游任务 → {label}
        </div>
      )}
      <div
        className={cn(
          "rounded-xl border p-3",
          isCurrent
            ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100"
            : "border-slate-200 bg-white",
        )}
      >
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              isCurrent
                ? "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-500",
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400">
                {label}
              </span>
              {isCurrent && (
                <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  当前任务
                </span>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  statusTone(item.status),
                )}
              >
                {statusText(item.status)}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {String(item.title)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
              <span>
                <UserRound className="mr-1 inline h-3 w-3" />
                {String(assignees)}
              </span>
              <span>
                <CalendarDays className="mr-1 inline h-3 w-3" />
                {String(item.dueDate || "未设置")}
              </span>
            </div>
          </div>
          {children.length > 0 && (
            <button
              type="button"
              aria-label={isExpanded ? "收起后续任务" : "展开后续任务"}
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [item.id]: !isExpanded,
                }))
              }
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {isCurrent && (
          <p className="mt-2 text-[10px] font-medium text-violet-700">
            你正在查看此任务；下方为它的后续任务。
          </p>
        )}
      </div>
      {isExpanded &&
        children.map((child, index) => (
          <TreeNode
            key={child.id}
            item={child}
            project={project}
            currentId={currentId}
            depth={depth + 1}
            branchIndex={index}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        ))}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] font-medium text-slate-300">{label}</p>
    </div>
  );
}
