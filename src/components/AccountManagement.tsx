import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, Plus, Search, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { apiClient } from "@/src/lib/apiClient";
import { useAuth, type AuthUser } from "@/src/lib/auth";

const roles = [
  { id: "admin", label: "系统管理员", note: "全部权限，包括公司管理员和系统设置" },
  { id: "company_admin", label: "公司管理员", note: "管理本公司帐号、公司 AI 配置和项目业务" },
  { id: "project_manager", label: "项目经理", note: "项目、流程、合同、成本及现场管理" },
  { id: "surveyor", label: "现场勘察员", note: "项目查看、现场勘察、资料和协作" },
  { id: "designer", label: "设计人员", note: "项目、生命周期、勘察资料和设计归档" },
  { id: "finance", label: "财务人员", note: "合同、成本、供应链和项目资料" },
  { id: "viewer", label: "只读成员", note: "仅查看项目汇总和项目资料" },
  { id: "construction_leader", label: "施工班长", note: "负责班组施工协作、项目资料和现场安排" },
];

const roleLabel = (role: string) => roles.find((item) => item.id === role)?.label || role;

export function AccountManagement() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", email: "", phone: "", role: "surveyor", password: "" });
  const assignableRoles = user?.role === "admin" ? roles : roles.filter((role) => !["admin", "company_admin"].includes(role.id));
  const canEditAccount = (account: AuthUser) => account.id !== user?.id && (user?.role === "admin" || !["admin", "company_admin"].includes(account.role));

  const loadAccounts = async () => {
    setLoading(true);
    try { setAccounts(await apiClient.listAccounts()); }
    catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "帐号列表加载失败，请检查帐号服务" })); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadAccounts(); }, []);
  const visible = useMemo(() => accounts.filter((account) => `${account.name}${account.username}${account.email}${roleLabel(account.role)}`.toLowerCase().includes(query.toLowerCase())), [accounts, query]);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.phone.trim()) return window.dispatchEvent(new CustomEvent("show-toast", { detail: "请填写手机号，成员将使用一次性验证码首次登录" }));
    setSaving(true);
    try {
      const created = await apiClient.createAccount(form);
      setAccounts((current) => [...current, created]);
      setForm({ username: "", name: "", email: "", phone: "", role: "surveyor", password: "" });
      setShowCreate(false);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: form.password ? "帐号已创建，首次登录需要修改密码" : "帐号已创建，成员可使用开发模式验证码登录" }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.status === 409 ? "该登录帐号或手机号已存在" : "帐号创建失败，请检查权限和填写内容" }));
    } finally { setSaving(false); }
  };

  const updateAccount = async (account: AuthUser, changes: Partial<AuthUser>) => {
    try {
      const updated = await apiClient.updateAccount(account.id, changes);
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "帐号权限已更新" }));
    } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "无法更新该帐号，不能操作同级或上级帐号" })); }
  };

  const resetPassword = async (account: AuthUser) => {
    const password = window.prompt(`为 ${account.name} 设置临时密码（至少 8 位）`);
    if (!password) return;
    if (password.length < 8) return window.dispatchEvent(new CustomEvent("show-toast", { detail: "临时密码至少需要 8 位" }));
    try { await apiClient.resetAccountPassword(account.id, password); window.dispatchEvent(new CustomEvent("show-toast", { detail: "密码已重置，该帐号需要重新登录" })); }
    catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "密码重置失败" })); }
  };

  return <div className="min-h-full bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 rounded-[28px] bg-slate-950 p-5 text-white md:flex-row md:items-center md:justify-between md:p-7"><div><p className="text-xs font-bold text-indigo-300">系统安全</p><h2 className="mt-1 text-2xl font-bold">帐号与权限</h2><p className="mt-2 text-sm text-slate-400">系统管理员 ＞ 公司管理员 ＞ 项目经理 ＞ 其他成员</p></div><button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold"><Plus className="h-4 w-4" />新增帐号</button></header>
    <section className="grid grid-cols-3 gap-3"><Metric label="帐号总数" value={accounts.length} /><Metric label="正常使用" value={accounts.filter((item) => item.status === "active").length} tone="text-emerald-600" /><Metric label="已停用" value={accounts.filter((item) => item.status !== "active").length} tone="text-rose-600" /></section>
    <div className="flex items-center rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"><Search className="mr-2 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、帐号、邮箱或角色" className="w-full bg-transparent text-sm outline-none" /></div>
    <section className="space-y-3">{loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : visible.map((account) => <article key={account.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm md:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-base font-bold text-indigo-600">{account.name.slice(0, 1)}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{account.name}</h3>{account.id === user?.id && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600">当前帐号</span>}<span className={`flex items-center gap-1 text-[10px] font-bold ${account.status === "active" ? "text-emerald-600" : "text-rose-600"}`}>{account.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{account.status === "active" ? "正常" : "已停用"}</span></div><p className="mt-1 truncate text-xs text-slate-500">@{account.username}{account.email ? ` · ${account.email}` : ""}</p></div></div><div className="grid grid-cols-2 gap-2 md:flex md:items-center"><select value={account.role} onChange={(event) => void updateAccount(account, { role: event.target.value })} disabled={!canEditAccount(account)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:bg-slate-50">{roles.map((role) => <option key={role.id} value={role.id} disabled={!assignableRoles.some((allowed) => allowed.id === role.id)}>{role.label}</option>)}</select><button onClick={() => void resetPassword(account)} disabled={!canEditAccount(account)} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" />重置密码</button><button onClick={() => void updateAccount(account, { status: account.status === "active" ? "disabled" : "active" })} disabled={!canEditAccount(account)} className={`col-span-2 rounded-xl px-3 py-2.5 text-xs font-semibold md:col-span-1 ${account.status === "active" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"} disabled:opacity-40`}>{account.status === "active" ? "停用帐号" : "恢复帐号"}</button></div></div></article>)}{!loading && visible.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">没有符合条件的帐号</div>}</section>
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><h3 className="font-bold text-slate-900">角色权限说明</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{roles.map((role) => <div key={role.id} className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-bold text-slate-800">{role.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{role.note}</p></div>)}</div></section>
  </div>{showCreate && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 md:items-center md:p-6"><form onSubmit={createAccount} className="mobile-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl md:rounded-3xl md:p-6"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900">新增帐号</h3><p className="mt-1 text-xs text-slate-500">手机号用于首次验证码登录，首次进入后必须设置密码</p></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-full bg-slate-100 p-2 text-slate-500"><XCircle className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{[["姓名", "name", "例如：张伟"], ["登录帐号", "username", "英文、数字或手机号"], ["邮箱", "email", "可选"], ["手机号", "phone", "用于验证码登录"]].map(([label, key, placeholder]) => <label key={key} className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}{key === "phone" && " *"}</span><input value={(form as any)[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} placeholder={placeholder} className="survey-input" /></label>)}<label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">角色</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="survey-input">{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.label} — {role.note}</option>)}</select></label><label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">临时密码（可选）</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="留空：使用开发模式一次性验证码" className="survey-input" /></label></div><button disabled={saving} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}{saving ? "正在创建" : "创建帐号"}</button></form></div>}</div>;
}

function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm md:p-4"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="mt-1 text-[10px] font-medium text-slate-500 md:text-xs">{label}</p></div>;
}
