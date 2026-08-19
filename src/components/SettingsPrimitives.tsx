import type { ComponentType } from "react";
import { cn } from "@/src/lib/utils";

export function FileNameIcon({ className }: { className?: string }) {
  return <span className={cn("text-xs font-bold", className)}>Aa</span>;
}

export function UsageMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{Number(value).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>;
}

export function SettingToggle({ icon: Icon, title, description, checked, onChange }: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return <div className="flex items-center justify-between"><div className="flex items-start gap-4"><div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500"><Icon className="h-5 w-5" /></div><div><h4 className="text-sm font-medium text-slate-900">{title}</h4><p className="mt-0.5 text-sm text-slate-500">{description}</p></div></div><button onClick={onChange} className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2", checked ? "bg-indigo-600" : "bg-slate-200")} role="switch" aria-checked={checked}><span aria-hidden="true" className={cn("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", checked ? "translate-x-5" : "translate-x-0")} /></button></div>;
}
