import { useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { apiClient } from "@/src/lib/apiClient";
import { cn } from "@/src/lib/utils";

const PAGE_LABELS: Record<string, string> = { dashboard: "项目汇总", board: "多项目看板", lifecycle: "全生命周期", "site-survey": "现场勘察", files: "项目资料", acceptance: "项目验收", schedule: "施工日程", "work-memo": "工作备忘", "task-chains": "任务链", contracts: "合同管理", materials: "材料库存管理", supply: "供应链管理", cost: "成本与预算", chat: "工作群", personnel: "施工人员", partners: "参建外协", organization: "公司组织", settings: "系统设置", accounts: "帐号与权限", opinions: "意见中心" };

export function AIGuide({ activeTab, projectReference }: { activeTab: string; projectReference?: string | null }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const page = PAGE_LABELS[activeTab] || activeTab;
  const ask = async (preset?: string) => {
    const value = (preset || question).trim();
    if (!value || loading) return;
    setQuestion(value); setLoading(true); setError("");
    try { setAnswer((await apiClient.askAIGuide({ question: value, page, project: projectReference || "", url: window.location.href })).answer); }
    catch (caught: any) { setError(caught?.details?.message || caught?.message || "AI 指导暂时不可用，请检查 AI 配置"); }
    finally { setLoading(false); }
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[10.25rem] right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/25 ring-4 ring-slate-200 transition hover:scale-105 hover:bg-slate-800 md:bottom-[5.625rem] md:right-6" title="AI 操作指导" aria-label="AI 操作指导"><Bot className="h-6 w-6" /></button>
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm md:items-center"><section className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-600" /><h2 className="text-xl font-bold text-slate-950">AI 操作指导</h2></div><p className="mt-1 text-xs text-slate-500">当前页面：{page}{projectReference ? ` · ${projectReference}` : ""}</p></div><button onClick={() => setOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭"><X className="h-4 w-4" /></button></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void ask("这个页面怎么用？")} className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">这个页面怎么用？</button><button onClick={() => void ask("我下一步应该做什么？")} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">下一步做什么？</button><button onClick={() => void ask("为什么刚才的操作没有生效？")} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">为什么没有生效？</button></div><div className="mt-3 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="例如：如何上传模板资料？" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /><button type="button" onClick={() => void ask()} disabled={!question.trim() || loading} className="rounded-xl bg-indigo-600 px-3 text-white disabled:opacity-40">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>{error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}{answer && <div className={cn("mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700", loading && "opacity-60")}><p className="mb-2 text-xs font-bold text-indigo-600">AI 指导</p>{answer}</div>} {!answer && !error && <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">可以问我当前页面的功能、操作步骤或失败原因</p>}</section></div>}
  </>;
}
