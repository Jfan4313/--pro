import React from "react";
import { Bell, Package, AlertTriangle, MessageSquare, Mail, Smartphone, Shield } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

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
  }
};

export function Settings() {
  const [settings, setSettings] = useFirebaseSync("appSettings", defaultSettings);

  const handleToggle = (category: keyof typeof defaultSettings, key: string) => {
    setSettings((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: !prev[category][key],
      },
    }));
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '设置已保存' }));
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
              checked={settings.notifications.lowStock}
              onChange={() => handleToggle('notifications', 'lowStock')}
            />
            <SettingToggle
              icon={AlertTriangle}
              title="任务延期提醒"
              description="当施工任务超出预计完成时间时接收通知"
              checked={settings.notifications.delayedTasks}
              onChange={() => handleToggle('notifications', 'delayedTasks')}
            />
            <SettingToggle
              icon={MessageSquare}
              title="紧急公告通知"
              description="当有标记为紧急的系统或项目公告时接收通知"
              checked={settings.notifications.urgentAnnouncements}
              onChange={() => handleToggle('notifications', 'urgentAnnouncements')}
            />
            
            <div className="h-px bg-slate-100 my-4"></div>
            
            <SettingToggle
              icon={Mail}
              title="邮件通知"
              description="将重要提醒发送至您的注册邮箱"
              checked={settings.notifications.emailAlerts}
              onChange={() => handleToggle('notifications', 'emailAlerts')}
            />
            <SettingToggle
              icon={Smartphone}
              title="移动端推送"
              description="允许在移动设备上接收应用内推送"
              checked={settings.notifications.pushAlerts}
              onChange={() => handleToggle('notifications', 'pushAlerts')}
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
              checked={settings.security.twoFactorAuth}
              onChange={() => handleToggle('security', 'twoFactorAuth')}
            />
          </div>
        </div>
      </div>
    </div>
  );
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
