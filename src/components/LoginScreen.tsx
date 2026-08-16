import { useState, type FormEvent } from "react";
import { Building2, Eye, EyeOff, Loader2, LockKeyhole, Mail, Phone, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { useAuth } from "@/src/lib/auth";

export function LoginScreen() {
  const { login, register, requestOtp, loginWithOtp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (mode === "register") {
        await register({ username: username.trim(), password, name: name.trim(), email: email.trim(), phone: phone.trim() });
      } else if (loginMode === "otp") {
        await loginWithOtp(phone.trim(), password.trim());
      } else {
        await login(username.trim(), password);
      }
    } catch (reason: any) {
      const code = reason?.details?.error;
      if (code === "phone_not_registered") setError("该手机号尚未创建帐号");
      else if (code === "otp_too_frequent") setError("验证码发送过于频繁，请稍后再试");
      else if (code === "invalid_or_expired_otp") setError("验证码不正确或已过期");
      else if (reason?.status === 401) setError(loginMode === "otp" ? "验证码不正确或已过期" : "帐号或密码不正确");
      else if (reason?.status === 409 || code === "username_exists") setError("该帐号已被注册，请更换帐号");
      else if (code === "invalid_username") setError("帐号需为 3–32 位英文、数字、点号、横线或下划线");
      else if (code === "weak_password") setError("密码需为 8–64 位，并同时包含字母和数字");
      else if (code === "invalid_email") setError("邮箱格式不正确");
      else if (code === "invalid_phone") setError("手机号格式不正确");
      else if (reason?.status === 400) setError("请检查注册信息是否填写完整");
      else setError("暂时无法连接帐号服务，请检查网络");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setOtpSent(false);
    setDevCode("");
  };

  const sendOtp = async () => {
    if (!phone.trim()) return setError("请先填写手机号");
    setSubmitting(true);
    setError("");
    try {
      const response = await requestOtp(phone.trim());
      setOtpSent(true);
      setDevCode(response.devCode || "");
    } catch (reason: any) {
      const code = reason?.details?.error;
      setError(code === "phone_not_registered" ? "该手机号尚未创建帐号" : code === "otp_too_frequent" ? "验证码发送过于频繁，请稍后再试" : "验证码发送失败，请检查手机号");
    } finally { setSubmitting(false); }
  };

  return <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#334155_0%,#0f172a_48%,#020617_100%)] p-4">
    <div className="grid w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between"><div><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Building2 className="h-6 w-6" /></span><h1 className="mt-8 text-3xl font-bold">智建协同 Pro</h1><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">项目全生命周期、现场勘察、资料归档和多方协作的一体化工作平台。</p></div><div className="space-y-3 text-sm text-slate-300"><p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />帐号分级权限保护项目数据</p><p className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-indigo-400" />密码加密存储，登录会话自动过期</p></div></section>
      <section className="max-h-screen overflow-y-auto p-6 sm:p-10"><div className="lg:hidden"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white"><Building2 className="h-5 w-5" /></span></div>
        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold"><button type="button" onClick={() => switchMode("login")} className={`rounded-lg py-2.5 transition-colors ${mode === "login" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>帐号登录</button><button type="button" onClick={() => switchMode("register")} className={`rounded-lg py-2.5 transition-colors ${mode === "register" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>注册帐号</button></div>
        <p className="mt-6 text-xs font-bold tracking-wider text-indigo-600">{mode === "login" ? "帐号登录" : "创建帐号"}</p><h2 className="mt-2 text-2xl font-bold text-slate-900">{mode === "login" ? "欢迎回来" : "注册后开始使用"}</h2><p className="mt-2 text-sm text-slate-500">{mode === "login" ? "登录后进入您的项目工作台" : "新帐号默认开通项目管理常用功能，帐号管理由管理员负责"}</p>
        {mode === "login" && <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold"><button type="button" onClick={() => { setLoginMode("password"); setError(""); }} className={`rounded-lg py-2.5 ${loginMode === "password" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>密码登录</button><button type="button" onClick={() => { setLoginMode("otp"); setError(""); setPassword(""); }} className={`rounded-lg py-2.5 ${loginMode === "otp" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>验证码登录</button></div>}
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "register" && <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">姓名</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500"><UserPlus className="h-4 w-4 text-slate-400" /><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="请输入真实姓名" /></div></label>}
          {(mode === "register" || loginMode === "password") && <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">帐号</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10"><UserRound className="h-4 w-4 text-slate-400" /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder={mode === "login" ? "请输入帐号" : "3–32 位英文或数字"} /></div></label>}
          {mode === "login" && loginMode === "otp" && <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">手机号</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500"><Phone className="h-4 w-4 text-slate-400" /><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="请输入管理员录入的手机号" /></div></label>}
          {mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">手机号</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500"><Phone className="h-4 w-4 text-slate-400" /><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="选填" /></div></label><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">邮箱</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500"><Mail className="h-4 w-4 text-slate-400" /><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="选填" /></div></label></div>}
          {mode === "register" || loginMode === "password" ? <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">密码</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10"><LockKeyhole className="h-4 w-4 text-slate-400" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder={mode === "login" ? "请输入密码" : "至少 8 位，包含字母和数字"} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 text-slate-400" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label> : <div><div className="flex gap-2"><input value={password} onChange={(event) => setPassword(event.target.value)} inputMode="numeric" maxLength={6} className="survey-input flex-1" placeholder="输入 6 位验证码" /><button type="button" onClick={() => void sendOtp()} disabled={submitting || !phone.trim()} className="rounded-xl bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40">{otpSent ? "重新获取" : "获取验证码"}</button></div>{devCode && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">开发模式验证码：<span className="font-bold tracking-widest">{devCode}</span>（5 分钟内有效）</p>}</div>}
          {mode === "register" && <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">确认密码</span><div className="flex items-center rounded-xl border border-slate-200 px-3 focus-within:border-indigo-500"><LockKeyhole className="h-4 w-4 text-slate-400" /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="再次输入密码" /></div></label>}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600">{error}</p>}
          <button disabled={submitting || (mode === "register" ? (!username || !password || !name || !confirmPassword) : loginMode === "otp" ? (!phone || password.length !== 6) : (!username || !password))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? (mode === "login" ? "正在登录" : "正在注册") : (mode === "login" ? "登录" : "注册并进入工作台")}</button>
        </form>
      </section>
    </div>
  </div>;
}

export function PasswordChangeScreen() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (newPassword.length < 8) return setError("新密码至少需要 8 位"); if (newPassword !== confirmPassword) return setError("两次输入的新密码不一致"); setSaving(true); setError(""); try { await changePassword(currentPassword, newPassword); } catch { setError("当前密码不正确，请重新输入"); } finally { setSaving(false); } };
  const firstLogin = Boolean(user?.mustChangePassword);
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-8"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><LockKeyhole className="h-5 w-5" /></span><h2 className="mt-5 text-2xl font-bold text-slate-900">请设置新密码</h2><p className="mt-2 text-sm text-slate-500">{user?.name}，{firstLogin ? "首次验证成功，请先设置一个新密码。" : "请更新您的登录密码。"}</p><div className="mt-6 space-y-4">{!firstLogin && <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">当前密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="survey-input" /></label>}<label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="survey-input" /></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">确认新密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="survey-input" /></label>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}<button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white">{saving && <Loader2 className="h-4 w-4 animate-spin" />}保存新密码</button><button type="button" onClick={() => void logout()} className="w-full py-2 text-sm text-slate-500">返回登录</button></div></form></div>;
}
