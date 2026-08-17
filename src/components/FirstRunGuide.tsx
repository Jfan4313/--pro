import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, FolderPlus, Users, X } from "lucide-react";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects } from "@/src/lib/management";

const GUIDE_DISMISSED_KEY = "zhijian-first-run-guide-dismissed";

export function FirstRunGuide({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [boardData] = useProjectBoardData();
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(GUIDE_DISMISSED_KEY) === "1");
  const projectCount = useMemo(() => flattenProjects(boardData).length, [boardData]);
  if (dismissed || projectCount > 0) return null;

  const steps = [
    { title: "创建第一个项目", detail: "建立项目名称、阶段和负责人", tab: "board", icon: FolderPlus },
    { title: "导入或安排任务", detail: "导入 Excel 或创建施工排期", tab: "schedule", icon: ClipboardList },
    { title: "添加人员与组织", detail: "配置班组、负责人和协作单位", tab: "personnel", icon: Users },
  ];

  const dismiss = () => {
    window.localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" aria-labelledby="first-run-guide-title">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">首次使用向导</p><h2 id="first-run-guide-title" className="mt-2 text-2xl font-bold text-slate-900">从一个项目开始</h2><p className="mt-2 text-sm leading-6 text-slate-500">按下面三步完成工作区初始化，后续任务、风险和资料都会自动关联到项目。</p></div>
          <button onClick={dismiss} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="关闭首次使用向导"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-6 space-y-3">
          {steps.map(({ title, detail, tab, icon: Icon }, index) => <button key={title} onClick={() => { dismiss(); setActiveTab(tab); }} className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{index + 1}. {title}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>)}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 className="h-4 w-4 text-emerald-500" />数据会自动保存并同步</span><button onClick={dismiss} className="text-xs font-semibold text-slate-500 hover:text-slate-900">稍后再做</button></div>
      </section>
    </div>
  );
}
