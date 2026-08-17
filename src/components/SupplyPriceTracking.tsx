import React, { useMemo, useState } from "react";
import { History, Plus, Search, TrendingUp } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";

export function SupplyPriceTracking() {
  const [prices, setPrices] = useSyncedAppData<any[]>("materialPrices", []);
  const [history] = useSyncedAppData<any[]>("materialPriceHistory", []);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => prices.filter((item: any) => `${item.id} ${item.name} ${item.spec} ${item.supplier}`.toLowerCase().includes(query.toLowerCase())), [prices, query]);

  const addPrice = () => {
    const name = window.prompt("材料名称");
    if (!name?.trim()) return;
    const spec = window.prompt("规格型号", "标准规格");
    if (!spec?.trim()) return;
    const price = Number(window.prompt("最新单价", "0"));
    if (!Number.isFinite(price) || price <= 0) return;
    const supplier = window.prompt("供应商", "");
    const item = { id: `MAT-${Date.now()}`, name: name.trim(), spec: spec.trim(), price, unit: "元/件", date: new Date().toISOString().slice(0, 10), supplier: supplier?.trim() || "未填写" };
    void setPrices((current) => [item, ...current.filter((entry: any) => entry.id !== item.id)]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "材料价格已登记" }));
  };

  return <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-bold text-slate-900">价格追踪</h3><p className="mt-1 text-sm text-slate-500">供应商报价、最新单价与历史价格统一归入供应链管理。</p></div><button onClick={addPrice} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />登记价格</button></div><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索材料、规格或供应商" className="w-full bg-transparent text-sm outline-none" /></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">材料</th><th className="px-4 py-3">规格</th><th className="px-4 py-3">最新单价</th><th className="px-4 py-3">供应商</th><th className="px-4 py-3">更新时间</th><th className="px-4 py-3">历史</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item: any) => { const count = history.filter((entry: any) => entry.id === item.id || entry.name === item.name).length; return <tr key={item.id}><td className="px-4 py-3 font-semibold text-slate-900">{item.name}<div className="text-[11px] font-normal text-slate-400">{item.id}</div></td><td className="px-4 py-3 text-slate-600">{item.spec}</td><td className="px-4 py-3 font-semibold text-indigo-600">¥{Number(item.price || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">{item.unit}</span></td><td className="px-4 py-3 text-slate-600">{item.supplier || "未填写"}</td><td className="px-4 py-3 text-slate-500">{item.date || "未填写"}</td><td className="px-4 py-3 text-slate-500"><span className="inline-flex items-center gap-1"><History className="h-3.5 w-3.5" />{count} 次</span></td></tr>})}{filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><TrendingUp className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2">暂无价格记录</p></td></tr>}</tbody></table></div></div>;
}
