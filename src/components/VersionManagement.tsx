import React from "react";
import { CalendarDays, CheckCircle2, FileText, History, Pencil, Plus, RefreshCw, Save, Tag, X } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";
import { cn } from "@/src/lib/utils";
import { PRODUCT_BUILD_SHA, PRODUCT_BUILD_TIME, PRODUCT_RELEASE_SUMMARY, PRODUCT_VERSION } from "@/src/lib/productVersion";

type ReleaseCategory = "新增功能" | "功能优化" | "问题修复" | "技术改进" | "部署/依赖";
type ReleaseStatus = "published" | "draft" | "archived";
type PatchStatus = "completed" | "planned" | "in_progress";

interface PatchRecord {
  id: string;
  number: string;
  title: string;
  type: ReleaseCategory;
  module: string;
  description: string;
  status: PatchStatus;
  plannedDate?: string;
  releasedAt?: string;
}

interface ReleaseRecord {
  id: string;
  version: string;
  date: string;
  summary: string;
  status: ReleaseStatus;
  changes: Array<{ category: ReleaseCategory; items: string[] }>;
  createdBy: string;
  createdAt: string;
  plannedReleaseDate?: string;
  releasedAt?: string;
  patches: PatchRecord[];
}

const categories: ReleaseCategory[] = ["新增功能", "功能优化", "问题修复", "技术改进", "部署/依赖"];
const initialRelease: ReleaseRecord = {
  id: "release-0-5-0",
  version: PRODUCT_VERSION,
  date: "2026-08-18",
  summary: PRODUCT_RELEASE_SUMMARY,
  status: "published",
  changes: [
    { category: "新增功能", items: ["项目、工作备忘、待办与风险事项协同管理", "账号管理、免密码验证码登录和首次设置密码", "企业微信机器人通知接口预留"] },
    { category: "功能优化", items: ["合并快速待办与工作备忘，统一反馈和提醒入口", "优化左侧导航分类，采购材料归入合同与供应链"] },
    { category: "问题修复", items: ["修复生产构建与服务器 Node.js 原生依赖兼容问题"] },
    { category: "技术改进", items: ["建立公网部署、回滚和健康检查流程", "项目、人员、待办和风险事项支持空白工作区"] },
    { category: "部署/依赖", items: ["启用生产环境账号认证", "接入受限部署密钥和服务器端 SQLite 数据存储"] },
  ],
  createdBy: "系统管理员",
  createdAt: "2026-08-18T00:00:00.000Z",
  plannedReleaseDate: "2026-08-18",
  releasedAt: "2026-08-18",
  patches: [
    { id: "patch-1", number: "P0.5.0-01", title: "版本显示、更新检测与缓存刷新", type: "技术改进", module: "版本中心", description: "注入运行版本、构建标识并支持检查更新。", status: "completed", plannedDate: "2026-08-18", releasedAt: "2026-08-18" },
    { id: "patch-2", number: "P0.5.0-02", title: "生命周期控制施工日程及整份排期管理", type: "功能优化", module: "施工日程", description: "项目交底后开放施工排期，并支持回收站。", status: "completed", plannedDate: "2026-08-18", releasedAt: "2026-08-18" },
    { id: "patch-3", number: "P0.5.0-03", title: "Windows/macOS本地文件夹授权与网页浏览", type: "新增功能", module: "项目资料", description: "通过浏览器授权访问本机目录并在线浏览。", status: "completed", plannedDate: "2026-08-18", releasedAt: "2026-08-18" },
    { id: "patch-4", number: "P0.5.0-04", title: "供应链、价格追踪和采购材料路由整合", type: "功能优化", module: "供应链管理", description: "统一四个供应链子路由和采购材料入口。", status: "completed", plannedDate: "2026-08-18", releasedAt: "2026-08-18" },
    { id: "patch-5", number: "P0.5.0-05", title: "成本预算无变化重复保存修复", type: "问题修复", module: "成本预算", description: "仅在实际修改后延迟保存，避免重复同步。", status: "completed", plannedDate: "2026-08-18", releasedAt: "2026-08-18" },
  ],
};

const releaseHistory: ReleaseRecord[] = [
  initialRelease,
  {
    id: "release-0-3-0", version: "0.3.0", date: "2026-08-15", summary: "协同工作台结构优化版本", status: "published", createdBy: "系统管理员", createdAt: "2026-08-15T00:00:00.000Z",
    patches: [],
    changes: [
      { category: "功能优化", items: ["合并快速待办与工作备忘，统一反馈和提醒入口", "优化左侧导航分类，采购材料归入合同与供应链"] },
      { category: "技术改进", items: ["重构应用结构，简化模块实现并清理历史演示数据"] },
    ],
  },
  {
    id: "release-0-2-0", version: "0.2.0", date: "2026-08-10", summary: "项目执行与现场协同完善版本", status: "published", createdBy: "系统管理员", createdAt: "2026-08-10T00:00:00.000Z",
    patches: [],
    changes: [
      { category: "新增功能", items: ["增加项目看板、施工日程、项目资料和现场勘察能力", "增加材料、供应链、合同、成本和人员协作模块"] },
      { category: "功能优化", items: ["完善项目阶段、进度反馈和移动端工作台"] },
    ],
  },
  {
    id: "release-0-1-0", version: "0.1.0", date: "2026-06-05", summary: "智建协同项目管理基础版本", status: "published", createdBy: "系统管理员", createdAt: "2026-06-05T00:00:00.000Z",
    patches: [],
    changes: [
      { category: "新增功能", items: ["建立项目管理应用基础框架", "提供项目汇总、协作和基础数据管理能力"] },
      { category: "技术改进", items: ["完成前端、后端和本地数据存储初始化"] },
    ],
  },
];

const emptyDraft = () => ({
  version: "",
  date: new Date().toISOString().slice(0, 10),
  summary: "",
  status: "draft" as ReleaseStatus,
  plannedReleaseDate: new Date().toISOString().slice(0, 10),
  changes: categories.reduce<Record<string, string>>((result, category) => ({ ...result, [category]: "" }), {}),
  patchText: "",
});

function normalizeReleaseList(value: unknown): ReleaseRecord[] {
  if (!Array.isArray(value) || value.length === 0) return releaseHistory;
  const list = value.filter((item): item is ReleaseRecord => Boolean(item?.version && item?.date && Array.isArray(item?.changes))).map((item) => ({ ...item, patches: Array.isArray(item.patches) ? item.patches : [] }));
  return list.some((item) => item.version === PRODUCT_VERSION) ? list : [initialRelease, ...list];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

export function VersionManagement() {
  const { user, can } = useAuth();
  const [storedReleases, setStoredReleases] = useSyncedAppData<ReleaseRecord[]>("versionReleases", releaseHistory);
  const releases = normalizeReleaseList(storedReleases).sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version));
  const [showEditor, setShowEditor] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState(emptyDraft);
  const canManage = can("accounts");

  const openEditor = (release?: ReleaseRecord) => {
    if (release) {
      setEditingId(release.id);
      setDraft({
        version: release.version,
        date: release.date,
        summary: release.summary,
        status: release.status,
        plannedReleaseDate: release.plannedReleaseDate || release.date,
        changes: Object.fromEntries(categories.map((category) => [category, release.changes.find((item) => item.category === category)?.items.join("\n") || ""])),
        patchText: release.patches.map((patch) => [patch.number, patch.title, patch.type, patch.module, patch.plannedDate || "", patch.description].join("|")).join("\n"),
      });
    } else {
      setEditingId(null);
      setDraft(emptyDraft());
    }
    setShowEditor(true);
  };

  const saveRelease = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d+\.\d+\.\d+$/.test(draft.version.trim())) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "版本号请使用 x.y.z 格式，例如 1.0.0" }));
      return;
    }
    const changeSource = ((draft.changes as unknown as { changes?: Record<string, string> }).changes || draft.changes) as Record<string, string>;
    const changes = categories.map((category) => ({ category, items: (changeSource[category] || "").split("\n").map((item) => item.trim()).filter(Boolean) })).filter((item) => item.items.length > 0);
    if (changes.length === 0) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请至少填写一项版本更新内容" }));
      return;
    }
    const patches: PatchRecord[] = draft.patchText.split("\n").map((line, index) => line.split("|").map((item) => item.trim())).filter((parts) => parts.length >= 6 && parts[1]).map(([number, title, type, module, plannedDate, description], index) => ({ id: `patch-${Date.now()}-${index}`, number: number || `P${draft.version}-${index + 1}`, title, type: (categories.includes(type as ReleaseCategory) ? type : "功能优化") as ReleaseCategory, module: module || "通用", plannedDate: plannedDate || undefined, description, status: draft.status === "published" ? "completed" : "planned" }));
    const next: ReleaseRecord = { id: editingId || `release-${Date.now()}`, version: draft.version.trim(), date: draft.date, summary: draft.summary.trim() || "版本更新", status: draft.status, changes, plannedReleaseDate: draft.plannedReleaseDate, releasedAt: draft.status === "published" ? new Date().toISOString() : undefined, patches, createdBy: user?.name || "系统管理员", createdAt: new Date().toISOString() };
    const nextList = editingId ? releases.map((item) => item.id === editingId ? next : item) : [next, ...releases];
    await setStoredReleases(nextList);
    setShowEditor(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "版本记录已保存" }));
  };

  const checkForUpdates = async () => {
    try {
      await fetch(`/index.html?updateCheck=${Date.now()}`, { cache: "no-store" });
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("zhijian-pro-")).map((key) => caches.delete(key)));
      }
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "已检查更新，正在刷新最新资源" }));
      window.setTimeout(() => window.location.reload(), 300);
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "更新检查失败，请稍后重试" }));
    }
  };

  return <div className="mx-auto max-w-[1100px] space-y-6 p-8">
    <header className="flex flex-col gap-4 rounded-[28px] bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
      <div><div className="flex items-center gap-2 text-xs font-bold text-indigo-300"><Tag className="h-4 w-4" />版本管理</div><h2 className="mt-2 text-2xl font-bold">发布记录与更新说明</h2><p className="mt-2 text-sm text-slate-400">按光伏展示平台规则维护版本号、发布日期和更新内容，发布记录可追溯。</p></div>
      {canManage && <button onClick={() => openEditor()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500"><Plus className="h-4 w-4" />新增版本记录</button>}
    </header>

    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-indigo-500">当前版本</p><button type="button" onClick={checkForUpdates} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold text-indigo-700"><RefreshCw className="h-3 w-3" />检查更新</button></div><p className="mt-2 text-3xl font-bold text-indigo-700">V{PRODUCT_VERSION}</p><p className="mt-1 text-xs text-indigo-600">{PRODUCT_RELEASE_SUMMARY}</p><p className="mt-2 text-[11px] text-indigo-500">构建 {PRODUCT_BUILD_SHA.slice(0, 8)} · {PRODUCT_BUILD_TIME}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-400">已发布版本</p><p className="mt-2 text-3xl font-bold text-slate-900">{releases.filter((item) => item.status === "published").length}</p><p className="mt-1 text-xs text-slate-500">版本记录持续保留，不直接删除</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-400">补丁统计</p><p className="mt-2 text-lg font-bold text-slate-900">{releases.reduce((sum, item) => sum + item.patches.length, 0)} 项</p><p className="mt-1 text-xs text-slate-500">已完成 {releases.reduce((sum, item) => sum + item.patches.filter((patch) => patch.status === "completed").length, 0)} 项 · 支持发布日程</p></div>
    </section>

    <section className="space-y-4">{releases.map((release) => <article key={release.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-bold text-white">V{release.version}</span><span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", release.status === "published" ? "bg-emerald-50 text-emerald-700" : release.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>{release.status === "published" ? "已发布" : release.status === "draft" ? "草稿" : "已归档"}</span></div><h3 className="mt-3 text-lg font-bold text-slate-900">{release.summary}</h3><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{formatDate(release.date)} · {release.createdBy}{release.plannedReleaseDate ? ` · 计划 ${formatDate(release.plannedReleaseDate)}` : ""}</p></div>{canManage && <button onClick={() => openEditor(release)} className="inline-flex items-center gap-1 self-start rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-3.5 w-3.5" />编辑</button>}</div><div className="grid gap-4 p-5 md:grid-cols-2">{release.changes.map((change) => <div key={change.category} className="rounded-2xl bg-slate-50 p-4"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-800"><FileText className="h-4 w-4 text-indigo-500" />{change.category}</h4><ul className="mt-3 space-y-2">{change.items.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />{item}</li>)}</ul></div>)}</div>{release.patches.length > 0 && <div className="border-t border-slate-100 p-5"><h4 className="text-sm font-bold text-slate-800">补丁清单（{release.patches.length}）</h4><div className="mt-3 space-y-2">{release.patches.map((patch) => <div key={patch.id} className="grid gap-2 rounded-xl bg-indigo-50/60 p-3 text-xs md:grid-cols-[110px_1fr_100px_100px]"><span className="font-bold text-indigo-700">{patch.number}</span><span className="text-slate-700"><b>{patch.title}</b><span className="ml-2 text-slate-500">{patch.module} · {patch.description}</span></span><span className="text-slate-500">{patch.status === "completed" ? "已完成" : patch.status === "in_progress" ? "进行中" : "待发布"}</span><span className="text-slate-500">{patch.plannedDate ? `计划 ${formatDate(patch.plannedDate)}` : "未排期"}</span></div>)}</div></div>}</article>)}</section>

    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"><History className="h-4 w-4" />版本记录由管理员维护，普通成员可查看更新说明。</div>

    {showEditor && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 md:items-center md:p-6"><form onSubmit={saveRelease} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl md:rounded-3xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-900">{editingId ? "编辑版本记录" : "新增版本记录"}</h3><p className="mt-1 text-xs text-slate-500">版本发布后建议只通过编辑或归档修正，不直接删除历史。</p></div><button type="button" onClick={() => setShowEditor(false)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="form-label">版本号 *</span><input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="例如 1.1.0" className="survey-input" /></label><label><span className="form-label">发布日期 *</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="survey-input" /></label><label><span className="form-label">计划发布日期</span><input type="date" value={draft.plannedReleaseDate} onChange={(event) => setDraft({ ...draft, plannedReleaseDate: event.target.value })} className="survey-input" /></label><label className="sm:col-span-2"><span className="form-label">版本摘要 *</span><input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="例如：新增现场反馈闭环" className="survey-input" /></label><label><span className="form-label">状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ReleaseStatus })} className="survey-input"><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label></div><div className="mt-5 space-y-4">{categories.map((category) => <label key={category} className="block"><span className="form-label">{category}</span><textarea value={(draft.changes[category] || (draft.changes as unknown as { changes?: Record<string, string> }).changes?.[category] || "")} onChange={(event) => setDraft({ ...draft, changes: { ...draft, changes: { ...draft.changes, [category]: event.target.value } } })} rows={2} placeholder="每行填写一项更新内容" className="survey-input resize-y" /></label>)}<label className="block"><span className="form-label">补丁清单</span><textarea value={draft.patchText} onChange={(event) => setDraft({ ...draft, patchText: event.target.value })} rows={5} placeholder="每行：补丁编号|名称|类型|影响模块|计划日期|说明" className="survey-input resize-y" /></label></div><button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"><Save className="h-4 w-4" />保存版本记录</button></form></div>}
  </div>;
}
