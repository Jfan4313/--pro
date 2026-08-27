import React from "react";
import { Bell, Package, AlertTriangle, MessageSquare, Mail, Smartphone, Shield, FolderOpen, Save, FolderPlus, BarChart3, RefreshCw, KeyRound, CheckCircle2, XCircle, BookOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useUserSettings } from "@/src/hooks/useUserSettings";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { apiClient, type IntakeGlossaryEntry } from "@/src/lib/apiClient";
import { STAGES, getProjectCurrentStageInfo } from "@/src/lib/projectLifecycle";
import { flattenProjects } from "@/src/lib/management";
import { useAuth } from "@/src/lib/auth";
import { ArchiveFolderState, chooseLocalArchiveProvider, getCurrentAndNextStages, getLocalArchiveProvider, requestLocalArchivePermission } from "@/src/lib/archiveStorage";
import { FileNameIcon, SettingToggle, UsageMetric } from "./SettingsPrimitives";

const defaultSettings = {
  notifications: {
    lowStock: true,
    delayedTasks: true,
    urgentAnnouncements: true,
    emailAlerts: false,
    pushAlerts: true,
  },
  security: {
    twoFactorAuth: false,
  },
  fileManagement: {
    rootPath: "",
    autoRename: true,
    autoCreateFolders: true,
  }
};

export function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useUserSettings(defaultSettings);
  const [boardData] = useProjectBoardData();
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [archiveFolderStates, setArchiveFolderStates] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const [archiveRootName, setArchiveRootName] = React.useState("");
  const [archivePermission, setArchivePermission] = React.useState<"granted" | "prompt" | "denied" | "unsupported">("unsupported");
  const [isInitializingFolders, setIsInitializingFolders] = React.useState(false);
  const [aiConfig, setAiConfig] = React.useState({ endpoint: "", model: "gpt-4o-mini", apiKey: "", timeoutMs: 30000, hasKey: false, configured: false, updatedAt: null as string | null });
  const [speechConfig, setSpeechConfig] = React.useState({ provider: "funasr" as "funasr" | "doubao", apiKey: "", hotwordTableId: "", hasKey: false, updatedAt: null as string | null });
  const [aiSaving, setAiSaving] = React.useState(false);
  const [speechSaving, setSpeechSaving] = React.useState(false);
  const [speechDebug, setSpeechDebug] = React.useState<Awaited<ReturnType<typeof apiClient.getSpeechStatus>> | null>(null);
  const [speechDebugging, setSpeechDebugging] = React.useState(false);
  const [usage, setUsage] = React.useState<Awaited<ReturnType<typeof apiClient.getAIUsage>> | null>(null);
  const [usageLoading, setUsageLoading] = React.useState(false);
  const [usageFilters, setUsageFilters] = React.useState({ from: "", to: "", userId: "", model: "", status: "" });
  const [companyAccounts, setCompanyAccounts] = React.useState<Array<{ id: string; name: string; username: string }>>([]);
  const [aiDebug, setAiDebug] = React.useState<Awaited<ReturnType<typeof apiClient.debugAI>> | null>(null);
  const [aiDebugging, setAiDebugging] = React.useState(false);
  const [glossary, setGlossary] = React.useState<IntakeGlossaryEntry[]>([]);
  const [glossarySaving, setGlossarySaving] = React.useState(false);
  const isAIManager = user?.role === "admin" || user?.role === "company_admin";

  const mergedSettings = {
    ...defaultSettings,
    ...settings,
    notifications: { ...defaultSettings.notifications, ...(settings as any)?.notifications },
    security: { ...defaultSettings.security, ...(settings as any)?.security },
    fileManagement: { ...defaultSettings.fileManagement, ...(settings as any)?.fileManagement },
  };

  const projectCount = flattenProjects(boardData as any[]).length;

  React.useEffect(() => {
    let mounted = true;
    getLocalArchiveProvider()
      .then(async (provider) => {
        if (!mounted) return;
        const availability = await provider?.checkAvailability();
        if (!mounted || !availability) return;
        setArchiveRootName(availability.rootName || "已授权文件夹");
        setArchivePermission(availability.permission);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadUsage = React.useCallback(async () => {
    if (!user) return;
    setUsageLoading(true);
    try {
      const from = usageFilters.from ? new Date(`${usageFilters.from}T00:00:00`).toISOString() : "";
      const to = usageFilters.to ? new Date(`${usageFilters.to}T23:59:59.999`).toISOString() : "";
      const result = await apiClient.getAIUsage({ ...usageFilters, from, to, pageSize: 50 });
      setUsage(result);
    } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "AI 用量加载失败" })); }
    finally { setUsageLoading(false); }
  }, [user, usageFilters]);

  React.useEffect(() => {
    if (!user) return;
    void apiClient.getAIConfig().then((config) => setAiConfig((current) => ({ ...current, ...config, apiKey: "" }))).catch(() => undefined);
    void apiClient.getSpeechConfig().then((config) => setSpeechConfig((current) => ({ ...current, ...config, apiKey: "" }))).catch(() => undefined);
    void apiClient.getAIUsage({ pageSize: 50 }).then(setUsage).catch(() => undefined);
    if (isAIManager) {
      void apiClient.listAccounts().then(setCompanyAccounts).catch(() => undefined);
      void apiClient.getAIEntityGlossary().then((result) => setGlossary(result.entries)).catch(() => undefined);
    }
  }, [user, isAIManager]);

  const saveAIConfig = async () => {
    setAiSaving(true);
    try {
      const saved = await apiClient.updateAIConfig(aiConfig);
      setAiConfig((current) => ({ ...current, ...saved, apiKey: "", hasKey: saved.hasKey }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "AI 配置已保存" }));
    } catch (error: any) {
      const status = Number(error?.status || 0);
      const message = status === 401
        ? "登录已过期，请重新登录后再保存"
        : status === 403
          ? "当前帐号没有公司 AI 配置权限，请使用系统管理员或公司管理员帐号"
          : status === 400
            ? "AI 配置格式不正确，请检查 API 地址和模型名称"
            : status >= 500
              ? (error?.details?.message || "服务端无法写入 AI 配置，请检查服务端和 data 目录权限")
              : "AI 配置保存失败，请确认服务端已启动并可连接";
      window.dispatchEvent(new CustomEvent("show-toast", { detail: message }));
    } finally { setAiSaving(false); }
  };

  const clearAIKey = async () => {
    if (!window.confirm("确定清除公司 AI Key 吗？清除后将改用服务端环境变量，若未配置则使用本地规则分析。")) return;
    setAiSaving(true);
    try { const saved = await apiClient.updateAIConfig({ ...aiConfig, apiKey: "", clearApiKey: true }); setAiConfig((current) => ({ ...current, ...saved, apiKey: "" })); window.dispatchEvent(new CustomEvent("show-toast", { detail: "公司 AI Key 已清除" })); }
    catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "AI Key 清除失败" })); }
    finally { setAiSaving(false); }
  };

  const saveSpeechConfig = async () => {
    setSpeechSaving(true);
    try {
      const saved = await apiClient.updateSpeechConfig({ provider: speechConfig.provider, apiKey: speechConfig.apiKey, hotwordTableId: speechConfig.hotwordTableId });
      setSpeechConfig((current) => ({ ...current, ...saved, apiKey: "" }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "豆包语音配置已保存" }));
    } catch (error: any) { window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.details?.message || "豆包语音配置保存失败" })); }
    finally { setSpeechSaving(false); }
  };

  const debugSpeechConfig = async () => {
    setSpeechDebugging(true);
    try {
      const result = await apiClient.getSpeechStatus();
      setSpeechDebug(result);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: result.health?.ok ? "语音引擎配置已就绪" : (result.health?.message || "语音引擎配置未就绪") }));
    } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "语音配置检查失败，请确认服务端已更新" })); }
    finally { setSpeechDebugging(false); }
  };

  const runAIDebug = async () => {
    setAiDebugging(true);
    setAiDebug(null);
    try {
      const result = await apiClient.debugAI({ endpoint: aiConfig.endpoint, model: aiConfig.model, apiKey: aiConfig.apiKey, timeoutMs: aiConfig.timeoutMs });
      setAiDebug(result);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `AI 连接成功：${result.model}，耗时 ${result.durationMs ?? 0} 毫秒` }));
    } catch (error: any) {
      const details = error?.details || {};
      const failure = {
        ok: false,
        stage: String(details.stage || (error?.status === 401 ? "auth" : "network")),
        model: String(details.model || aiConfig.model || "未设置"),
        endpoint: String(details.endpoint || aiConfig.endpoint || ""),
        configured: Boolean(details.configured),
        durationMs: typeof details.durationMs === "number" ? details.durationMs : undefined,
        message: String(details.message || (error?.status === 401 ? "登录已过期，请重新登录后再测试" : error?.message || "调试接口请求失败")),
      };
      setAiDebug(failure);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `AI 连接失败：${failure.message}` }));
    } finally { setAiDebugging(false); }
  };

  const saveGlossary = async () => {
    setGlossarySaving(true);
    try {
      const result = await apiClient.updateAIEntityGlossary(glossary);
      setGlossary(result.entries);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "工作指令词库已保存" }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.details?.message || "词库保存失败，请检查标准名称和分类" }));
    } finally { setGlossarySaving(false); }
  };

  const updateGlossaryEntry = (id: string, patch: Partial<IntakeGlossaryEntry>) => setGlossary((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));

  const handleToggle = async (category: keyof typeof defaultSettings, key: string) => {
    const nextValue = !(mergedSettings as any)[category][key];
    setSettings((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: nextValue,
      },
    }));

    if (category === "fileManagement" && key === "autoCreateFolders" && nextValue) {
      window.dispatchEvent(new CustomEvent("archive-root-changed"));
    }

    window.dispatchEvent(new CustomEvent('show-toast', { detail: '设置已保存' }));
  };

  const chooseArchiveRoot = async () => {
    try {
      const provider = await chooseLocalArchiveProvider();
      const availability = await provider.checkAvailability();
      setArchiveRootName(availability.rootName || "已授权文件夹");
      setArchivePermission(availability.permission);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '本机归档文件夹已授权，正在补建项目目录' }));
    } catch (error: any) {
      if (error?.name !== "AbortError") window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件夹授权失败，请使用最新版 Chrome/Edge 并允许读写' }));
    }
  };

  const restoreArchivePermission = async () => {
    const granted = await requestLocalArchivePermission().catch(() => false);
    setArchivePermission(granted ? "granted" : "denied");
    if (granted) {
      window.dispatchEvent(new CustomEvent("archive-root-changed"));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '归档权限已恢复，正在自动补建目录' }));
    }
  };

  const initializeAllProjectFolders = async () => {
    const projects = flattenProjects(boardData as any[]);
    if (projects.length === 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '当前还没有项目可初始化' }));
      return;
    }

    setIsInitializingFolders(true);
    try {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) throw new Error("archive_permission_required");
      let count = 0;
      const updates: Record<string, ArchiveFolderState> = {};
      for (const project of projects) {
        const stageInfo = getProjectCurrentStageInfo(project.id, lifecycleStates);
        const result = await provider.ensureProjectStructure(project, STAGES, archiveFolderStates[project.id]?.projectFolder);
        updates[project.id] = {
          status: "ready",
          storageProvider: "local-folder",
          projectFolder: result.projectFolder,
          generatedThroughStageId: result.generatedThroughStageId,
          updatedAt: new Date().toISOString(),
        };
        count += 1;
      }
      await setArchiveFolderStates((current) => ({ ...current, ...updates }));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `已为 ${count} 个项目生成完整生命周期及分类子文件夹` }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: error?.message === "archive_permission_required" ? '请先授权本机归档文件夹' : '生成失败，请检查本机文件夹权限' }));
    } finally {
      setIsInitializingFolders(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1100px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">系统设置</h2>
        <p className="text-slate-500 mt-1">管理您的账户偏好和系统通知</p>
      </div>

      <div className="space-y-6">
        {/* Notifications Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-medium text-slate-800">通知首选项</h3>
          </div>
          <div className="p-6 space-y-6">
            <SettingToggle
              icon={Package}
              title="物资库存预警"
              description="当物资库存低于安全阈值时接收通知"
              checked={mergedSettings.notifications.lowStock}
              onChange={() => handleToggle('notifications', 'lowStock')}
            />
            <SettingToggle
              icon={AlertTriangle}
              title="任务延期提醒"
              description="当施工任务超出预计完成时间时接收通知"
              checked={mergedSettings.notifications.delayedTasks}
              onChange={() => handleToggle('notifications', 'delayedTasks')}
            />
            <SettingToggle
              icon={MessageSquare}
              title="紧急公告通知"
              description="当有标记为紧急的系统或项目公告时接收通知"
              checked={mergedSettings.notifications.urgentAnnouncements}
              onChange={() => handleToggle('notifications', 'urgentAnnouncements')}
            />
            
            <div className="h-px bg-slate-100 my-4">
</div>
            
            <SettingToggle
              icon={Mail}
              title="邮件通知"
              description="将重要提醒发送至您的注册邮箱"
              checked={mergedSettings.notifications.emailAlerts}
              onChange={() => handleToggle('notifications', 'emailAlerts')}
            />
            <SettingToggle
              icon={Smartphone}
              title="移动端推送"
              description="允许在移动设备上接收应用内推送"
              checked={mergedSettings.notifications.pushAlerts}
              onChange={() => handleToggle('notifications', 'pushAlerts')}
            />
          </div>
        </div>

        {user && <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
<div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/50 flex items-center gap-2">
<KeyRound className="h-5 w-5 text-indigo-600" />
<div>
<h3 className="text-lg font-medium text-slate-800">公司 AI 配置</h3>
<p className="mt-1 text-xs text-slate-500">公司成员统一使用同一套模型配置；API Key 始终只保存在服务端。</p>
</div>
</div>{isAIManager ? <div className="p-6 space-y-4">
<label className="block">
<span className="form-label">API 地址</span>
<input value={aiConfig.endpoint} onChange={(event) => setAiConfig({ ...aiConfig, endpoint: event.target.value })} placeholder="https://api.deepseek.com" className="survey-input" />
<span className="mt-1 block text-xs text-slate-500">可填写服务商基础地址，系统会自动调用 /chat/completions。</span>
</label>
<div className="grid gap-4 sm:grid-cols-2">
<label className="block">
<span className="form-label">模型名称</span>
<input value={aiConfig.model} onChange={(event) => setAiConfig({ ...aiConfig, model: event.target.value })} className="survey-input" />
</label>
<label className="block">
<span className="form-label">超时（毫秒）</span>
<input type="number" min="5000" max="120000" value={aiConfig.timeoutMs} onChange={(event) => setAiConfig({ ...aiConfig, timeoutMs: Number(event.target.value) })} className="survey-input" />
</label>
</div>
<label className="block">
<span className="form-label">公司 API Key {aiConfig.hasKey && <span className="text-emerald-600">（已配置，留空保持不变）</span>}</span>
<input type="password" value={aiConfig.apiKey} onChange={(event) => setAiConfig({ ...aiConfig, apiKey: event.target.value })} placeholder={aiConfig.hasKey ? "已配置，如需更换请重新输入" : "粘贴公司 API Key"} className="survey-input" />
</label>
<div className="flex flex-wrap gap-2">
<button type="button" onClick={() => void runAIDebug()} disabled={aiDebugging} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 disabled:opacity-60">
<RefreshCw className={cn("h-4 w-4", aiDebugging && "animate-spin")} />{aiDebugging ? "调试中…" : "调试 AI 连接"}</button>
<button type="button" onClick={() => void saveAIConfig()} disabled={aiSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
<Save className="h-4 w-4" />{aiSaving ? "保存中…" : "保存公司 AI 配置"}</button>{aiConfig.hasKey && <button type="button" onClick={() => void clearAIKey()} disabled={aiSaving} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 disabled:opacity-60">清除 AI Key</button>}</div>
</div> : <div className="p-6">
<p className="text-sm font-semibold text-slate-800">{aiConfig.configured ? "公司 AI 已配置" : "公司 AI 尚未配置"}</p>
<p className="mt-1 text-xs text-slate-500">当前模型：{aiConfig.model || "未设置"}。地址和密钥仅公司管理员可查看。</p>
</div>}</div>}

        {user && <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-violet-100 bg-violet-50/50 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-600" />
            <div><h3 className="text-lg font-medium text-slate-800">公司语音识别配置</h3><p className="mt-1 text-xs text-slate-500">豆包负责语音转文字，DeepSeek仍负责任务整理；API Key 只保存在服务端。</p></div>
          </div>
          {isAIManager ? <div className="p-6 space-y-4">
            <label className="block"><span className="form-label">语音识别引擎</span><select value={speechConfig.provider} onChange={(event) => setSpeechConfig({ ...speechConfig, provider: event.target.value as "funasr" | "doubao" })} className="survey-input"><option value="doubao">豆包大模型语音识别</option><option value="funasr">FunASR 本地识别</option></select></label>
            {speechConfig.provider === "doubao" && <>
              <label className="block"><span className="form-label">豆包 API Key {speechConfig.hasKey && <span className="text-emerald-600">（已配置，留空保持不变）</span>}</span><input type="password" value={speechConfig.apiKey} onChange={(event) => setSpeechConfig({ ...speechConfig, apiKey: event.target.value })} placeholder={speechConfig.hasKey ? "已配置，如需更换请重新输入" : "粘贴火山引擎豆包 API Key"} className="survey-input" /></label>
              <label className="block"><span className="form-label">热词表 ID（可选）</span><input value={speechConfig.hotwordTableId} onChange={(event) => setSpeechConfig({ ...speechConfig, hotwordTableId: event.target.value })} placeholder="火山引擎控制台创建的热词表 ID" className="survey-input" /><span className="mt-1 block text-xs text-slate-500">建议把公司项目、人名和合作单位维护到豆包热词表。</span></label>
            </>}
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void debugSpeechConfig()} disabled={speechDebugging} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 disabled:opacity-60"><RefreshCw className={cn("h-4 w-4", speechDebugging && "animate-spin")} />{speechDebugging ? "检查中…" : "检查语音连接"}</button><button type="button" onClick={() => void saveSpeechConfig()} disabled={speechSaving} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{speechSaving ? "保存中…" : "保存语音配置"}</button>{speechConfig.hasKey && <button type="button" onClick={() => { void apiClient.updateSpeechConfig({ provider: speechConfig.provider, clearApiKey: true }).then((saved) => { setSpeechConfig((current) => ({ ...current, ...saved, apiKey: "" })); window.dispatchEvent(new CustomEvent("show-toast", { detail: "豆包 API Key 已清除" })); }).catch(() => window.dispatchEvent(new CustomEvent("show-toast", { detail: "豆包 API Key 清除失败" }))); }} disabled={speechSaving} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 disabled:opacity-60">清除语音 Key</button>}</div>
            {speechDebug && <p className={cn("rounded-lg px-3 py-2 text-sm", speechDebug.health?.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{speechDebug.health?.ok ? "语音引擎配置已就绪；请在快速创建工作备忘中上传一段录音进行真实授权测试。" : speechDebug.health?.message || "语音引擎未就绪"}</p>}
          </div> : <div className="p-6"><p className="text-sm font-semibold text-slate-800">{speechConfig.provider === "doubao" ? "豆包语音" : "FunASR 本地语音"}：{speechConfig.hasKey ? "已配置" : "未配置"}</p><p className="mt-1 text-xs text-slate-500">语音地址和密钥仅公司管理员可查看。</p></div>}
        </div>}

        {user && isAIManager && (aiDebugging || aiDebug) && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-xl border p-4 shadow-sm",
              aiDebugging ? "border-indigo-200 bg-indigo-50" : aiDebug?.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50",
            )}
          >
            <div className="flex items-start gap-3">
              {aiDebugging
                ? <RefreshCw className="mt-0.5 h-5 w-5 animate-spin text-indigo-600" />
                : aiDebug?.ok
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                  : <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">{aiDebugging ? "正在测试 AI 连接…" : aiDebug?.ok ? "AI 连接成功" : "AI 连接失败"}</p>
                {!aiDebugging && aiDebug && (
                  <>
                    <p className="mt-1 text-sm text-slate-700">{aiDebug.ok ? "服务商已正常返回测试任务，可以使用公司 AI 功能。" : aiDebug.message || "服务商没有正常响应，请检查配置。"}</p>
                    <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <div>
<dt className="font-semibold text-slate-800">模型</dt>
<dd>{aiDebug.model || "未设置"}</dd>
</div>
                      <div>
<dt className="font-semibold text-slate-800">耗时</dt>
<dd>{aiDebug.durationMs != null ? `${aiDebug.durationMs} 毫秒` : "未返回"}</dd>
</div>
                      <div className="sm:col-span-2">
<dt className="font-semibold text-slate-800">测试地址</dt>
<dd className="break-all">{aiDebug.endpoint || "未设置"}</dd>
</div>
                    </dl>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {user && isAIManager && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-4"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-indigo-600" /><div><h3 className="text-lg font-medium text-slate-800">工作指令词库</h3><p className="mt-1 text-xs text-slate-500">维护项目、人员、单位和行业术语的标准名称及语音易错称呼；系统不会自动学习用户修改。</p></div></div><button type="button" onClick={() => setGlossary((current) => [...current, { id: crypto.randomUUID?.() || `term-${Date.now()}`, standardName: "", aliases: [], category: "industry_term", enabled: true }])} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700"><Plus className="h-4 w-4" />添加词条</button></div>
          <div className="space-y-3 p-6">{glossary.map((entry) => <div key={entry.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_1.5fr_10rem_auto_auto]"><input value={entry.standardName} onChange={(event) => updateGlossaryEntry(entry.id, { standardName: event.target.value })} placeholder="标准名称" className="survey-input" /><input value={entry.aliases.join("、")} onChange={(event) => updateGlossaryEntry(entry.id, { aliases: event.target.value.split(/[,，、]/).map((value) => value.trim()).filter(Boolean) })} placeholder="简称、别名、语音易错词" className="survey-input" /><select value={entry.category} onChange={(event) => updateGlossaryEntry(entry.id, { category: event.target.value as IntakeGlossaryEntry["category"] })} className="survey-input"><option value="project">项目</option><option value="person">人员</option><option value="organization">单位</option><option value="industry_term">行业术语</option></select><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={entry.enabled} onChange={(event) => updateGlossaryEntry(entry.id, { enabled: event.target.checked })} />启用</label><button type="button" onClick={() => setGlossary((current) => current.filter((item) => item.id !== entry.id))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label="删除词条"><Trash2 className="h-4 w-4" /></button></div>)}{!glossary.length && <p className="py-4 text-center text-sm text-slate-400">暂无自定义词条，实体标准名称仍会从公司资料自动读取。</p>}<div className="flex justify-end"><button type="button" onClick={() => void saveGlossary()} disabled={glossarySaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{glossarySaving ? "保存中…" : "保存工作指令词库"}</button></div></div>
        </div>}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
<div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
<BarChart3 className="h-5 w-5 text-violet-600" />
<div>
<h3 className="text-lg font-medium text-slate-800">AI Token 用量</h3>
<p className="mt-1 text-xs text-slate-500">{isAIManager ? "查看本公司各帐号用量" : "仅显示当前帐号的用量"}；服务商未返回 Token 时不做估算。</p>
</div>
</div>
<div className="p-6 space-y-5">
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
<input type="date" value={usageFilters.from} onChange={(event) => setUsageFilters({ ...usageFilters, from: event.target.value })} className="survey-input" aria-label="开始日期" />
<input type="date" value={usageFilters.to} onChange={(event) => setUsageFilters({ ...usageFilters, to: event.target.value })} className="survey-input" aria-label="结束日期" />{isAIManager && <select value={usageFilters.userId} onChange={(event) => setUsageFilters({ ...usageFilters, userId: event.target.value })} className="survey-input">
<option value="">全部帐号</option>{companyAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}（{account.username}）</option>)}</select>}<input value={usageFilters.model} onChange={(event) => setUsageFilters({ ...usageFilters, model: event.target.value })} placeholder="模型名称" className="survey-input" />
<select value={usageFilters.status} onChange={(event) => setUsageFilters({ ...usageFilters, status: event.target.value })} className="survey-input">
<option value="">全部状态</option>
<option value="success">成功</option>
<option value="error">失败</option>
<option value="timeout">超时</option>
</select>
</div>
<button type="button" onClick={() => void loadUsage()} disabled={usageLoading} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
<RefreshCw className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`} />查询用量</button>
<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
<UsageMetric label="调用次数" value={usage?.summary.calls || 0} />
<UsageMetric label="成功" value={usage?.summary.successes || 0} />
<UsageMetric label="失败/超时" value={usage?.summary.failures || 0} />
<UsageMetric label="输入 Token" value={usage?.summary.inputTokens || 0} />
<UsageMetric label="总 Token" value={usage?.summary.totalTokens || 0} />
</div>{isAIManager && usage?.byUser?.length ? <div className="overflow-x-auto">
<table className="w-full min-w-[580px] text-sm">
<thead>
<tr className="border-b border-slate-100 text-left text-xs text-slate-400">
<th className="py-2">帐号</th>
<th>调用</th>
<th>输入 Token</th>
<th>输出 Token</th>
<th>总 Token</th>
</tr>
</thead>
<tbody>{usage.byUser.map((row) => <tr key={row.userId} className="border-b border-slate-50">
<td className="py-3 font-medium text-slate-800">{row.name}<span className="ml-1 text-xs font-normal text-slate-400">@{row.username}</span>
</td>
<td>{row.calls}</td>
<td>{Number(row.inputTokens).toLocaleString()}</td>
<td>{Number(row.outputTokens).toLocaleString()}</td>
<td className="font-semibold">{Number(row.totalTokens).toLocaleString()}</td>
</tr>)}</tbody>
</table>
</div> : null}<div className="overflow-x-auto">
<table className="w-full min-w-[700px] text-sm">
<thead>
<tr className="border-b border-slate-100 text-left text-xs text-slate-400">
<th className="py-2">时间</th>{isAIManager && <th>帐号</th>}<th>模型</th>
<th>状态</th>
<th>输入</th>
<th>输出</th>
<th>总量</th>
<th>耗时</th>
</tr>
</thead>
<tbody>{usage?.records?.map((row) => <tr key={row.id} className="border-b border-slate-50">
<td className="py-3 text-slate-500">{new Date(row.createdAt).toLocaleString()}</td>{isAIManager && <td>{row.userName}</td>}<td>{row.model}</td>
<td className={row.status === "success" ? "text-emerald-600" : "text-rose-600"}>{row.status === "success" ? "成功" : row.status === "timeout" ? "超时" : "失败"}</td>
<td>{row.inputTokens ?? "未提供"}</td>
<td>{row.outputTokens ?? "未提供"}</td>
<td>{row.totalTokens ?? "未提供"}</td>
<td>{row.durationMs}ms</td>
</tr>)}</tbody>
</table>{!usageLoading && !usage?.records?.length && <p className="py-8 text-center text-sm text-slate-400">暂无 AI 调用记录</p>}</div>
</div>
</div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-medium text-slate-800">文件管理</h3>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">本机项目资料归档文件夹</label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                  {archiveRootName || "尚未选择本机文件夹"}
                  {archiveRootName && <span className={cn("ml-2 text-xs", archivePermission === "granted" ? "text-emerald-600" : "text-amber-600")}>{archivePermission === "granted" ? "可读写" : "需要恢复权限"}</span>}
                </div>
                <button onClick={() => void chooseArchiveRoot()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
<FolderOpen className="h-4 w-4" />{archiveRootName ? "重新选择" : "选择文件夹"}</button>
                {archiveRootName && archivePermission !== "granted" && <button onClick={() => void restoreArchivePermission()} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700">恢复授权</button>}
              </div>
              <p className="mt-2 text-xs text-slate-500">新资料仅写入本机授权目录；项目与文件索引仍可同步，其他设备不能直接下载原文件。</p>
            </div>

            <div className="h-px bg-slate-100">
</div>

            <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">为现有项目生成资料夹</h4>
                <p className="text-xs text-slate-500 mt-1">
                  当前识别到 {projectCount} 个项目，生成各项目当前阶段及下一阶段资料夹。
                </p>
              </div>
              <button
                onClick={initializeAllProjectFolders}
                disabled={isInitializingFolders || projectCount === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-800 disabled:opacity-60 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                {isInitializingFolders ? "生成中" : "一键生成"}
              </button>
            </div>

            <div className="h-px bg-slate-100">
</div>

            <SettingToggle
              icon={FileNameIcon}
              title="上传时自动规范命名"
              description="保留原始文件名，同时保存为项目、阶段、资料类型、版本号组合的新文件名"
              checked={mergedSettings.fileManagement.autoRename}
              onChange={() => handleToggle('fileManagement', 'autoRename')}
            />
            <SettingToggle
              icon={FolderOpen}
              title="自动生成项目资料夹"
              description="新项目生成当前及下一阶段资料夹，阶段推进后继续自动补建"
              checked={mergedSettings.fileManagement.autoCreateFolders}
              onChange={() => handleToggle('fileManagement', 'autoCreateFolders')}
            />
          </div>
        </div>


        {/* Security Section (Placeholder for future) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-medium text-slate-800">安全设置</h3>
          </div>
          <div className="p-6">
            <SettingToggle
              icon={Shield}
              title="双重身份验证 (2FA)"
              description="在登录时要求提供额外的验证码以提高账户安全性"
              checked={mergedSettings.security.twoFactorAuth}
              onChange={() => handleToggle('security', 'twoFactorAuth')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
