import React from "react";
import { Bell, Package, AlertTriangle, MessageSquare, Mail, Smartphone, Shield, FolderOpen, Save, FolderPlus } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { apiClient } from "@/src/lib/apiClient";
import { STAGES, getProjectCurrentStageInfo } from "./ProjectLifecycle";
import { flattenProjects } from "@/src/lib/management";
import { useAuth } from "@/src/lib/auth";

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
  const [settings, setSettings] = useSyncedAppData("appSettings", defaultSettings);
  const [boardData] = useProjectBoardData();
  const [lifecycleStates] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [fileRootInput, setFileRootInput] = React.useState("");
  const [defaultFileRoot, setDefaultFileRoot] = React.useState("");
  const [isSavingFileRoot, setIsSavingFileRoot] = React.useState(false);
  const [isInitializingFolders, setIsInitializingFolders] = React.useState(false);
  const [aiConfig, setAiConfig] = React.useState({ endpoint: "", model: "gpt-4o-mini", apiKey: "", timeoutMs: 30000, hasKey: false });
  const [aiSaving, setAiSaving] = React.useState(false);

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
    apiClient.getFileSettings()
      .then((remote) => {
        if (!mounted) return;
        setDefaultFileRoot(remote.defaultRootPath);
        setFileRootInput(mergedSettings.fileManagement.rootPath || remote.rootPath);
      })
      .catch(() => {
        if (!mounted) return;
        setFileRootInput(mergedSettings.fileManagement.rootPath || "");
      });
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => { if (user?.role === "admin") void apiClient.getAIConfig().then((config) => setAiConfig((current) => ({ ...current, ...config, apiKey: "" }))).catch(() => undefined); }, [user?.role]);

  const saveAIConfig = async () => {
    setAiSaving(true);
    try { const saved = await apiClient.updateAIConfig(aiConfig); setAiConfig((current) => ({ ...current, ...saved, apiKey: "", hasKey: saved.hasKey })); window.dispatchEvent(new CustomEvent("show-toast", { detail: "AI 配置已保存" })); } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "AI 配置保存失败，请确认管理员权限和服务端连接" })); } finally { setAiSaving(false); }
  };

  const handleToggle = async (category: keyof typeof defaultSettings, key: string) => {
    const nextValue = !(mergedSettings as any)[category][key];
    setSettings((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: nextValue,
      },
    }));

    if (category === "fileManagement") {
      try {
        await apiClient.updateFileSettings({
          rootPath: fileRootInput || mergedSettings.fileManagement.rootPath || defaultFileRoot,
          autoRename: key === "autoRename" ? nextValue : mergedSettings.fileManagement.autoRename,
          autoCreateFolders: key === "autoCreateFolders" ? nextValue : mergedSettings.fileManagement.autoCreateFolders,
        });
      } catch {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: '本地后端未连接，设置已先保存在本机' }));
        return;
      }
    }

    window.dispatchEvent(new CustomEvent('show-toast', { detail: '设置已保存' }));
  };

  const saveFileRoot = async () => {
    const rootPath = fileRootInput.trim();
    if (!rootPath) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请先填写文件保存位置' }));
      return;
    }

    setIsSavingFileRoot(true);
    try {
      const saved = await apiClient.updateFileSettings({
        rootPath,
        autoRename: mergedSettings.fileManagement.autoRename,
        autoCreateFolders: mergedSettings.fileManagement.autoCreateFolders,
      });
      setDefaultFileRoot(saved.defaultRootPath);
      setFileRootInput(saved.rootPath);
      setSettings((prev: any) => ({
        ...prev,
        fileManagement: {
          ...defaultSettings.fileManagement,
          ...(prev.fileManagement || {}),
          rootPath: saved.rootPath,
          autoRename: saved.autoRename,
          autoCreateFolders: saved.autoCreateFolders,
        },
      }));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件保存位置已更新' }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '保存失败，请检查本地后端和文件夹权限' }));
    } finally {
      setIsSavingFileRoot(false);
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
      let count = 0;
      for (const project of projects) {
        const stageInfo = getProjectCurrentStageInfo(project.id, lifecycleStates);
        await apiClient.initProjectFolders(project.id, { project, stages: STAGES.slice(0, stageInfo.index + 1) });
        count += 1;
      }
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `已为 ${count} 个项目生成当前阶段资料夹` }));
    } catch {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '生成失败，请检查本地后端和文件保存位置' }));
    } finally {
      setIsInitializingFolders(false);
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1000px] mx-auto">
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
            
            <div className="h-px bg-slate-100 my-4"></div>
            
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

        {user?.role === "admin" && <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden"><div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/50"><h3 className="text-lg font-medium text-slate-800">内置 AI 配置</h3><p className="mt-1 text-xs text-slate-500">API 密钥只保存在服务端，不会同步到浏览器或普通用户。</p></div><div className="p-6 space-y-4"><label className="block"><span className="form-label">API 地址</span><input value={aiConfig.endpoint} onChange={(event) => setAiConfig({ ...aiConfig, endpoint: event.target.value })} placeholder="https://api.example.com/v1/chat/completions" className="survey-input" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="form-label">模型名称</span><input value={aiConfig.model} onChange={(event) => setAiConfig({ ...aiConfig, model: event.target.value })} className="survey-input" /></label><label className="block"><span className="form-label">超时（毫秒）</span><input type="number" min="5000" value={aiConfig.timeoutMs} onChange={(event) => setAiConfig({ ...aiConfig, timeoutMs: Number(event.target.value) })} className="survey-input" /></label></div><label className="block"><span className="form-label">API 密钥 {aiConfig.hasKey && <span className="text-emerald-600">（已配置，留空保持不变）</span>}</span><input type="password" value={aiConfig.apiKey} onChange={(event) => setAiConfig({ ...aiConfig, apiKey: event.target.value })} placeholder={aiConfig.hasKey ? "已配置，如需更换请重新输入" : "粘贴 API Key"} className="survey-input" /></label><button type="button" onClick={() => void saveAIConfig()} disabled={aiSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{aiSaving ? "保存中…" : "保存 AI 配置"}</button></div></div>}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-medium text-slate-800">文件管理</h3>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">项目资料保存位置</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={fileRootInput}
                  onChange={(event) => setFileRootInput(event.target.value)}
                  placeholder={defaultFileRoot || "请选择本地项目资料文件夹"}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  onClick={saveFileRoot}
                  disabled={isSavingFileRoot}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSavingFileRoot ? "保存中" : "保存位置"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                软件上传的项目资料会按项目和阶段自动归档到这里；不填写时使用默认位置。
              </p>
              {defaultFileRoot && (
                <p className="text-xs text-slate-400 mt-1">默认位置：{defaultFileRoot}</p>
              )}
            </div>

            <div className="h-px bg-slate-100"></div>

            <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">为现有项目生成资料夹</h4>
                <p className="text-xs text-slate-500 mt-1">
                  当前识别到 {projectCount} 个项目，只生成各项目当前阶段及以前阶段的资料夹。
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

            <div className="h-px bg-slate-100"></div>

            <SettingToggle
              icon={FileNameIcon}
              title="上传时自动规范命名"
              description="保留原始文件名，同时保存为项目、阶段、资料类型、版本号组合的新文件名"
              checked={mergedSettings.fileManagement.autoRename}
              onChange={() => handleToggle('fileManagement', 'autoRename')}
            />
            <SettingToggle
              icon={FolderOpen}
              title="新项目自动生成立项资料夹"
              description="新项目先只生成立项阶段资料夹，进入后续阶段时再生成对应资料夹"
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

function FileNameIcon({ className }: { className?: string }) {
  return <span className={cn("text-xs font-bold", className)}>Aa</span>;
}

function SettingToggle({ 
  icon: Icon, 
  title, 
  description, 
  checked, 
  onChange 
}: { 
  icon: any, 
  title: string, 
  description: string, 
  checked: boolean, 
  onChange: () => void 
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-slate-100 rounded-lg text-slate-500 mt-0.5">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-slate-900">{title}</h4>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onChange}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
          checked ? "bg-indigo-600" : "bg-slate-200"
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
