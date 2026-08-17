import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, X } from "lucide-react";
import { offlineDb } from "@/src/lib/offlineDb";
import { flushOutbox, onSyncEvent, resolveSyncConflict } from "@/src/lib/syncEngine";
import { useSyncStatus } from "@/src/hooks/useSyncStatus";

export function SyncCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSyncStatus();
  const [pending, setPending] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [working, setWorking] = useState(false);

  const refresh = async () => {
    const [nextPending, nextConflicts] = await Promise.all([offlineDb.getOutbox(), offlineDb.listConflicts()]);
    setPending(nextPending);
    setConflicts(nextConflicts);
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    return onSyncEvent((event) => {
      if (event.type === "sync_status" || event.type === "app_data_changed" || event.type === "entity_changed") void refresh();
    });
  }, [open]);

  if (!open) return null;

  const retry = async () => {
    setWorking(true);
    await flushOutbox();
    await refresh();
    setWorking(false);
  };

  const resolve = async (id: string, strategy: "server" | "local") => {
    setWorking(true);
    await resolveSyncConflict(id, strategy);
    await refresh();
    setWorking(false);
  };

  return <div className="fixed inset-0 z-[100] flex items-start justify-end bg-slate-950/30 p-3 md:p-5" role="dialog" aria-modal="true" aria-label="同步中心">
    <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭同步中心" />
    <section className="relative mt-12 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">同步中心</h2>
          <p className="mt-1 text-xs text-slate-500">查看本地保存、同步队列和冲突处理</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭"><X className="h-4 w-4" /></button>
      </header>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
        <div className={`flex items-center gap-3 rounded-2xl p-3 ${status.state === "error" || status.state === "conflict" ? "bg-rose-50" : status.state === "offline" ? "bg-amber-50" : "bg-emerald-50"}`}>
          {status.state === "offline" ? <CloudOff className="h-5 w-5 text-amber-600" /> : status.state === "error" || status.state === "conflict" ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{status.state === "idle" ? "数据已同步" : status.state === "offline" ? "当前离线" : status.state === "conflict" ? "存在同步冲突" : status.state === "error" ? "同步失败" : "正在同步"}</p><p className="mt-0.5 truncate text-xs text-slate-500">{status.error || (status.lastSyncedAt ? `最近同步：${new Date(status.lastSyncedAt).toLocaleString()}` : "尚未完成同步")}</p></div>
          {(pending.length > 0 || status.state === "error") && <button onClick={() => void retry()} disabled={working || status.state === "offline"} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} /></button>}
        </div>

        <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">待同步操作</h3><span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600">{pending.length}</span></div>{pending.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">没有待同步操作</p> : <div className="space-y-2">{pending.slice(0, 8).map((item: any) => <div key={item.id} className="rounded-2xl border border-slate-100 p-3"><p className="text-xs font-semibold text-slate-700">{item.kind === "appData" ? `工作区数据：${item.key}` : `记录：${item.resource}`}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p></div>)}</div>}</section>

        <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">冲突记录</h3><span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600">{conflicts.length}</span></div>{conflicts.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">没有待处理冲突</p> : <div className="space-y-3">{conflicts.map((item: any) => <article key={item.id} className="rounded-2xl border border-rose-100 bg-rose-50/40 p-3"><p className="text-xs font-bold text-slate-800">{item.operation?.resource || "记录"} · {item.operation?.recordId || "未知记录"}</p><p className="mt-1 text-xs text-rose-700">服务器版本较新，存在本地修改冲突</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => void resolve(item.id, "server")} disabled={working} className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">采用服务器</button><button onClick={() => void resolve(item.id, "local")} disabled={working} className="rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white disabled:opacity-50">保留本机并重试</button></div></article>)}</div>}</section>
      </div>
    </section>
  </div>;
}
