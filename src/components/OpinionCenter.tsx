import { useMemo, useRef, useState } from "react";
import { Lightbulb, Mic, Send, X } from "lucide-react";
import { apiClient } from "@/src/lib/apiClient";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";
import { cn } from "@/src/lib/utils";

export const OPINION_CATEGORIES = ["项目资料", "工作备忘", "项目管理", "人员管理", "文件归档", "语音识别", "系统问题", "其他"] as const;
type OpinionCategory = typeof OPINION_CATEGORIES[number];
type OpinionStatus = "pending" | "processing" | "accepted" | "closed";
export type OpinionRecord = { id: string; title: string; detail: string; category: OpinionCategory; status: OpinionStatus; sourcePage: string; projectReference: string; creatorId: string; creatorName: string; createdAt: string };

const PAGE_LABELS: Record<string, string> = { dashboard: "项目汇总", board: "多项目看板", lifecycle: "全生命周期", "site-survey": "现场勘察", files: "项目资料", acceptance: "项目验收", schedule: "施工日程", "work-memo": "工作备忘", "task-chains": "任务链", contracts: "合同管理", materials: "材料库存管理", supply: "供应链管理", cost: "成本与预算", chat: "工作群", personnel: "施工人员", partners: "参建外协", organization: "公司组织", settings: "系统设置", accounts: "帐号与权限", opinions: "意见中心" };
const STATUS_LABELS: Record<OpinionStatus, string> = { pending: "待处理", processing: "处理中", accepted: "已采纳", closed: "已关闭" };

export function OpinionCenter({ activeTab, projectReference }: { activeTab: string; projectReference?: string | null }) {
  const { user, can } = useAuth();
  const [records, setRecords] = useSyncedAppData<OpinionRecord[]>("opinionRecords", []);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [filter, setFilter] = useState<OpinionCategory | "全部">("全部");
  const [notice, setNotice] = useState("");

  const category = useMemo<OpinionCategory>(() => {
    const source = `${PAGE_LABELS[activeTab] || activeTab} ${text}`;
    if (source.includes("语音") || source.includes("识别") || source.includes("转写")) return "语音识别";
    if (source.includes("项目资料") || source.includes("文件") || source.includes("模板") || source.includes("归档")) return activeTab === "files" ? "项目资料" : "文件归档";
    if (source.includes("备忘") || source.includes("任务") || source.includes("安排")) return "工作备忘";
    if (source.includes("人员") || source.includes("负责人") || source.includes("账号")) return "人员管理";
    if (["lifecycle", "board", "project-detail", "site-survey", "acceptance"].includes(activeTab)) return "项目管理";
    return "系统问题";
  }, [activeTab, text]);

  const startVoice = async () => {
    if (recording || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("当前浏览器不支持录音，请直接输入文字"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false); setTranscribing(true); setNotice("正在调用豆包识别…");
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const uploaded = await apiClient.uploadIntakeAudio(`意见-${Date.now()}.webm`, await readBlobAsBase64(blob), blob.type || "audio/webm", 0);
          const result = await apiClient.transcribeAudio(uploaded.audioId);
          setText(result.correctedTranscript || result.transcript || result.rawTranscript || "");
          setNotice(result.provider === "doubao" ? `豆包识别完成 · ${result.model}` : result.warning || `当前使用${result.provider === "browser" ? "浏览器" : "备用"}识别`);
        } catch (error: any) {
          setNotice(`豆包识别失败：${error?.details?.message || error?.message || "请检查语音配置"}，请改用文字输入`);
        } finally { setTranscribing(false); }
      };
      recorder.start(); recorderRef.current = recorder; setRecording(true); setNotice("正在录音，再次点击麦克风结束");
    } catch { setNotice("无法开始录音，请检查浏览器麦克风权限"); }
  };

  const stopVoice = () => { try { recorderRef.current?.stop(); } catch { setRecording(false); } };

  const submit = async () => {
    const detail = text.trim();
    if (!detail) { setNotice("请先输入遇到的问题或改进意见"); return; }
    const now = new Date().toISOString();
    const item: OpinionRecord = { id: `opinion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: detail.slice(0, 32), detail, category, status: "pending", sourcePage: PAGE_LABELS[activeTab] || activeTab, projectReference: projectReference || "", creatorId: user?.id || "guest-local", creatorName: user?.name || "当前用户", createdAt: now };
    await setRecords((current) => [item, ...(Array.isArray(current) ? current : [])]);
    setText(""); setOpen(false); setNotice("");
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `意见已提交，已归类为“${category}”` }));
  };

  const updateStatus = async (item: OpinionRecord, status: OpinionStatus) => {
    await setRecords((current) => current.map((record) => record.id === item.id ? { ...record, status } : record));
  };
  const visible = (Array.isArray(records) ? records : []).filter((item) => filter === "全部" || item.category === filter);
  const summary = OPINION_CATEGORIES.map((item) => ({ category: item, count: (Array.isArray(records) ? records : []).filter((record) => record.category === item).length })).filter((item) => item.count > 0);
  const manager = can("settings") || can("accounts");

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-20 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl shadow-amber-500/30 ring-4 ring-amber-100 transition hover:scale-105 hover:bg-amber-600 md:bottom-6 md:right-24" title="提交意见" aria-label="提交意见"><Lightbulb className="h-5 w-5" /></button>
    {activeTab === "opinions" && <main className="min-h-full bg-slate-50 p-4 md:p-6"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-600">公司改进闭环</p><h2 className="mt-1 text-2xl font-bold text-slate-950">意见中心</h2></div><button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">提交意见</button></header><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setFilter("全部")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === "全部" ? "bg-slate-950 text-white" : "bg-white text-slate-600")}>全部 {records.length}</button>{summary.map((item) => <button key={item.category} onClick={() => setFilter(item.category)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === item.category ? "bg-amber-500 text-white" : "bg-white text-slate-600")}>{item.category} {item.count}</button>)}</div><section className="mt-4 space-y-3">{visible.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{item.category}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{STATUS_LABELS[item.status]}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.detail}</p><p className="mt-2 text-xs text-slate-400">来源：{item.sourcePage}{item.projectReference ? ` · 项目：${item.projectReference}` : ""} · {item.creatorName} · {new Date(item.createdAt).toLocaleDateString()}</p></div>{manager && <select value={item.status} onChange={(event) => void updateStatus(item, event.target.value as OpinionStatus)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"><option value="pending">待处理</option><option value="processing">处理中</option><option value="accepted">已采纳</option><option value="closed">已关闭</option></select>}</div></article>)}{visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">还没有意见，点击右下角按钮提交第一条</div>}</section></div></main>}
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm md:items-center"><section className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-950">提交意见</h2><p className="mt-1 text-xs text-slate-500">已识别页面：{PAGE_LABELS[activeTab] || activeTab}{projectReference ? ` · ${projectReference}` : ""}</p></div><button onClick={() => setOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭"><X className="h-4 w-4" /></button></div><div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><Lightbulb className="h-4 w-4" />自动分类：<strong>{category}</strong></div><div className="mt-3 relative"><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="请描述遇到的问题或希望改进的地方" className="w-full resize-none rounded-2xl border border-slate-200 px-3 py-3 pr-12 text-sm leading-6 outline-none focus:border-amber-400" /><button type="button" onClick={recording ? stopVoice : startVoice} disabled={transcribing} className={cn("absolute bottom-3 right-3 rounded-xl p-2", recording ? "bg-rose-500 text-white" : "bg-indigo-50 text-indigo-600", transcribing && "opacity-50")} title="语音输入" aria-label="语音输入"><Mic className="h-4 w-4" /></button></div>{notice && <p className={cn("mt-2 text-xs", notice.includes("失败") || notice.includes("无法") ? "text-rose-600" : "text-slate-500")}>{notice}</p>}<button type="button" onClick={() => void submit()} disabled={recording || transcribing} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />提交意见</button></section></div>}
  </>;
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("录音读取失败"));
    reader.readAsDataURL(blob);
  });
}
