import { useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Camera, CheckCircle2, Clock3, Download, FileCheck2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { apiClient, API_BASE_URL } from "@/src/lib/apiClient";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { flattenProjects } from "@/src/lib/management";
import { cn } from "@/src/lib/utils";
import * as XLSX from "xlsx";

type AcceptanceStatus = "pending" | "passed" | "rework_required" | "rework_in_progress" | "recheck_passed";

interface ReworkItem {
  id: string;
  issue: string;
  owner: string;
  deadline: string;
  status: "open" | "done";
  createdAt: string;
  completedAt?: string;
  completionNote?: string;
  photos: string[];
}

interface AcceptanceRecord {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  acceptanceType: string;
  inspector: string;
  acceptedAt: string;
  createdAt: string;
  status: AcceptanceStatus;
  result: "pass" | "rework";
  notes: string;
  photos: string[];
  reworkItems: ReworkItem[];
  recheckedAt?: string;
}

const statusMeta: Record<AcceptanceStatus, { label: string; className: string }> = {
  pending: { label: "待验收", className: "bg-slate-100 text-slate-600 border-slate-200" },
  passed: { label: "验收通过", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rework_required: { label: "需返工", className: "bg-rose-50 text-rose-700 border-rose-200" },
  rework_in_progress: { label: "返工中", className: "bg-amber-50 text-amber-700 border-amber-200" },
  recheck_passed: { label: "复验通过", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

function nowLocalDateTime() {
  return new Date().toISOString().slice(0, 16);
}

function blankReworkItem(): ReworkItem {
  return { id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, issue: "", owner: "", deadline: "", status: "open", createdAt: new Date().toISOString(), photos: [] };
}

function blankForm(projectName = "") {
  return {
    projectName,
    title: "",
    acceptanceType: "阶段验收",
    inspector: "",
    acceptedAt: nowLocalDateTime(),
    result: "pass" as "pass" | "rework",
    notes: "",
    photos: [] as string[],
    reworkItems: [] as ReworkItem[],
  };
}

export function ProjectAcceptance() {
  const [records, setRecords] = useSyncedAppData<AcceptanceRecord[]>("projectAcceptanceRecords", []);
  const [board] = useProjectBoardData();
  const projects = flattenProjects(board);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("全部项目");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [dateFilter, setDateFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(() => blankForm(projects[0]?.name || ""));
  const [photoTarget, setPhotoTarget] = useState<{ type: "record" } | { type: "rework"; id: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const visibleRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesProject = projectFilter === "全部项目" || record.projectName === projectFilter;
      const matchesStatus = statusFilter === "全部状态" || record.status === statusFilter;
      const matchesDate = !dateFilter || record.acceptedAt.slice(0, 10) === dateFilter;
      const text = `${record.title}${record.projectName}${record.acceptanceType}${record.inspector}${record.notes}${record.reworkItems.map(item => item.issue).join("")}`.toLowerCase();
      return matchesProject && matchesStatus && matchesDate && text.includes(query.toLowerCase());
    });
  }, [records, projectFilter, statusFilter, dateFilter, query]);

  const openCreate = () => {
    setForm(blankForm(projects[0]?.name || ""));
    setIsModalOpen(true);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !photoTarget) return;
    const existing = photoTarget.type === "record" ? form.photos : form.reworkItems.find(item => item.id === photoTarget.id)?.photos || [];
    const selected = Array.from(files).slice(0, 6 - existing.length);
    if (selected.some(file => file.size > 5 * 1024 * 1024)) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "单张照片不能超过 5MB" }));
      return;
    }
    try {
      const urls = await Promise.all(selected.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const uploaded = await apiClient.uploadFile(file.name, dataUrl.split(",")[1] || "");
        return `${API_BASE_URL}${uploaded.url}`;
      }));
      if (photoTarget.type === "record") setForm(current => ({ ...current, photos: [...current.photos, ...urls].slice(0, 6) }));
      else setForm(current => ({ ...current, reworkItems: current.reworkItems.map(item => item.id === photoTarget.id ? { ...item, photos: [...item.photos, ...urls].slice(0, 6) } : item) }));
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已上传 ${urls.length} 张照片` }));
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "照片上传失败，请检查网络后重试" }));
    } finally {
      setPhotoTarget(null);
    }
  };

  const submitRecord = (event: FormEvent) => {
    event.preventDefault();
    if (!form.projectName || !form.title.trim() || !form.inspector.trim() || !form.acceptedAt || form.photos.length === 0) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请完整填写验收信息并上传照片" }));
      return;
    }
    if (form.result === "rework" && form.reworkItems.some(item => !item.issue.trim() || !item.owner.trim() || !item.deadline)) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请完整填写每条返工项的问题、责任人和期限" }));
      return;
    }
    const project = projects.find((item: any) => item.name === form.projectName);
    const record: AcceptanceRecord = {
      id: `AC-${Date.now()}`,
      projectId: project?.id || "",
      projectName: form.projectName,
      title: form.title.trim(),
      acceptanceType: form.acceptanceType,
      inspector: form.inspector.trim(),
      acceptedAt: form.acceptedAt,
      createdAt: new Date().toISOString(),
      status: form.result === "pass" ? "passed" : "rework_required",
      result: form.result,
      notes: form.notes.trim(),
      photos: form.photos,
      reworkItems: form.result === "rework" ? form.reworkItems : [],
    };
    void setRecords(current => [record, ...current]);
    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: form.result === "pass" ? "验收记录已保存，状态为验收通过" : "验收记录已保存，已生成返工项" }));
  };

  const completeRework = (recordId: string, reworkId: string) => {
    const note = window.prompt("请输入返工完成说明", "已完成整改") || "";
    if (!note.trim()) return;
    const completedAt = new Date().toISOString();
    void setRecords(current => current.map(record => {
      if (record.id !== recordId || record.status === "passed" || record.status === "recheck_passed") return record;
      const reworkItems = record.reworkItems.map(item => item.id === reworkId ? { ...item, status: "done" as const, completedAt, completionNote: note.trim() } : item);
      const allDone = reworkItems.every(item => item.status === "done");
      return { ...record, reworkItems, status: allDone ? "rework_in_progress" : "rework_required" };
    }));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "返工项已标记完成" }));
  };

  const passRecheck = (record: AcceptanceRecord) => {
    if (!record.reworkItems.length || record.reworkItems.some(item => item.status !== "done")) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "所有返工项完成后才能复验通过" }));
      return;
    }
    void setRecords(current => current.map(item => item.id === record.id ? { ...item, status: "recheck_passed", recheckedAt: new Date().toISOString() } : item));
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "复验已通过，记录已锁定" }));
  };

  const exportExcel = () => {
    const rows = visibleRecords.flatMap(record => {
      if (!record.reworkItems.length) return [{ 项目: record.projectName, 验收标题: record.title, 类型: record.acceptanceType, 状态: statusMeta[record.status].label, 验收人: record.inspector, 验收时间: record.acceptedAt.replace("T", " "), 创建时间: record.createdAt.replace("T", " ").slice(0, 16), 返工问题: "", 责任人: "", 期限: "", 完成时间: "", 备注: record.notes }];
      return record.reworkItems.map(item => ({ 项目: record.projectName, 验收标题: record.title, 类型: record.acceptanceType, 状态: statusMeta[record.status].label, 验收人: record.inspector, 验收时间: record.acceptedAt.replace("T", " "), 创建时间: record.createdAt.replace("T", " ").slice(0, 16), 返工问题: item.issue, 责任人: item.owner, 期限: item.deadline, 完成时间: item.completedAt?.replace("T", " ").slice(0, 16) || "", 备注: item.completionNote || record.notes }));
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "项目验收记录");
    XLSX.writeFile(workbook, `项目验收记录_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const renderPhotos = (photos: string[], remove?: (index: number) => void) => (
    <div className="flex flex-wrap gap-3">
      {photos.map((photo, index) => <div key={photo} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200"><a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="验收照片" className="h-full w-full object-cover" /></a>{remove && <button type="button" onClick={() => remove(index)} className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">项目验收记录</h2>
          <p className="mt-1 text-sm text-slate-500">记录验收时间戳、照片凭证、返工问题和复验闭环</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><Download className="mr-2 h-4 w-4" />导出</button>
          <button onClick={openCreate} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"><Plus className="mr-2 h-4 w-4" />新增验收</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="验收记录" value={records.length} icon={FileCheck2} />
        <MetricCard label="已通过" value={records.filter(item => item.status === "passed" || item.status === "recheck_passed").length} icon={CheckCircle2} tone="text-emerald-600" />
        <MetricCard label="返工中" value={records.filter(item => item.status === "rework_required" || item.status === "rework_in_progress").length} icon={RotateCcw} tone="text-amber-600" />
        <MetricCard label="待处理返工项" value={records.flatMap(item => item.reworkItems).filter(item => item.status !== "done").length} icon={AlertTriangle} tone="text-rose-600" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2"><Search className="mr-2 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="搜索验收标题、项目、返工问题" /></div>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"><option>全部项目</option>{projects.map((project: any) => <option key={project.id}>{project.name}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"><option value="全部状态">全部状态</option>{Object.entries(statusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select>
          <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
        </div>
        <div className="divide-y divide-slate-100">
          {visibleRecords.map(record => {
            const locked = record.status === "passed" || record.status === "recheck_passed";
            return (
              <article key={record.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{record.title}</h3>
                      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusMeta[record.status].className)}>{statusMeta[record.status].label}</span>
                      {locked && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">已锁定不可修改</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{record.projectName} · {record.acceptanceType} · 验收人 {record.inspector}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />验收时间 {record.acceptedAt.replace("T", " ")} · 创建 {record.createdAt.replace("T", " ").slice(0, 16)}</p>
                  </div>
                  {record.reworkItems.length > 0 && record.status !== "recheck_passed" && <button onClick={() => passRecheck(record)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700">复验通过</button>}
                </div>
                {record.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{record.notes}</p>}
                {record.photos.length > 0 && <div className="mt-4">{renderPhotos(record.photos)}</div>}
                {record.reworkItems.length > 0 && <div className="mt-4 space-y-3">{record.reworkItems.map(item => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-900">{item.issue}</p><p className="mt-1 text-xs text-slate-500">责任人：{item.owner} · 期限：{item.deadline} · {item.status === "done" ? `完成：${item.completedAt?.replace("T", " ").slice(0, 16)}` : "未完成"}</p>{item.completionNote && <p className="mt-2 text-xs text-slate-500">完成说明：{item.completionNote}</p>}</div>{item.status !== "done" && !locked && <button onClick={() => completeRework(record.id, item.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">标记完成</button>}</div>{item.photos.length > 0 && <div className="mt-3">{renderPhotos(item.photos)}</div>}</div>)}</div>}
              </article>
            );
          })}
          {visibleRecords.length === 0 && <div className="px-6 py-16 text-center text-slate-500"><FileCheck2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />暂无验收记录</div>}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6"><h3 className="text-lg font-bold text-slate-900">新增验收记录</h3><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button></div>
            <form onSubmit={submitRecord} className="space-y-5 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="项目"><select value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} className="form-input"><option value="">请选择项目</option>{projects.map((project: any) => <option key={project.id}>{project.name}</option>)}</select></Field>
                <Field label="验收类型"><select value={form.acceptanceType} onChange={(event) => setForm({ ...form, acceptanceType: event.target.value })} className="form-input"><option>阶段验收</option><option>隐蔽工程验收</option><option>竣工验收</option><option>并网验收</option><option>材料/设备验收</option></select></Field>
                <Field label="验收标题"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" placeholder="例如：支架安装阶段验收" /></Field>
                <Field label="验收人"><input required value={form.inspector} onChange={(event) => setForm({ ...form, inspector: event.target.value })} className="form-input" placeholder="验收人员姓名" /></Field>
                <Field label="验收时间"><input required type="datetime-local" value={form.acceptedAt} onChange={(event) => setForm({ ...form, acceptedAt: event.target.value })} className="form-input" /></Field>
                <Field label="验收结果"><select value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value as any, reworkItems: event.target.value === "rework" && form.reworkItems.length === 0 ? [blankReworkItem()] : form.reworkItems })} className="form-input"><option value="pass">验收通过</option><option value="rework">需返工</option></select></Field>
              </div>
              <Field label="验收备注"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className="form-input resize-none" placeholder="验收意见、质量情况、现场说明" /></Field>
              <div><div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium text-slate-700">验收照片 <span className="text-rose-500">*</span></label><span className="text-xs text-slate-400">至少 1 张，最多 6 张</span></div>{renderPhotos(form.photos, index => setForm({ ...form, photos: form.photos.filter((_, i) => i !== index) }))}<button type="button" onClick={() => { setPhotoTarget({ type: "record" }); photoInputRef.current?.click(); }} className="mt-3 inline-flex h-20 w-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600"><Camera className="h-5 w-5" /><span className="mt-1 text-xs">上传</span></button></div>
              {form.result === "rework" && <div className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">返工记录</h4><button type="button" onClick={() => setForm({ ...form, reworkItems: [...form.reworkItems, blankReworkItem()] })} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">+ 添加返工项</button></div>{form.reworkItems.map(item => <div key={item.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4"><div className="grid grid-cols-3 gap-3"><Field label="问题描述"><input value={item.issue} onChange={(event) => setForm({ ...form, reworkItems: form.reworkItems.map(current => current.id === item.id ? { ...current, issue: event.target.value } : current) })} className="form-input" placeholder="返工问题" /></Field><Field label="责任人"><input value={item.owner} onChange={(event) => setForm({ ...form, reworkItems: form.reworkItems.map(current => current.id === item.id ? { ...current, owner: event.target.value } : current) })} className="form-input" placeholder="责任人" /></Field><Field label="整改期限"><input type="date" value={item.deadline} onChange={(event) => setForm({ ...form, reworkItems: form.reworkItems.map(current => current.id === item.id ? { ...current, deadline: event.target.value } : current) })} className="form-input" /></Field></div><div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => { setPhotoTarget({ type: "rework", id: item.id }); photoInputRef.current?.click(); }} className="text-xs font-medium text-indigo-600">上传返工照片</button><button type="button" onClick={() => setForm({ ...form, reworkItems: form.reworkItems.filter(current => current.id !== item.id) })} className="text-xs font-medium text-rose-600">删除返工项</button></div>{item.photos.length > 0 && <div className="mt-3">{renderPhotos(item.photos, index => setForm({ ...form, reworkItems: form.reworkItems.map(current => current.id === item.id ? { ...current, photos: current.photos.filter((_, i) => i !== index) } : current) }))}</div>}</div>)}</div>}
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(event) => { void uploadPhotos(event.target.files); event.target.value = ""; }} />
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">取消</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">保存验收记录</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "text-slate-900" }: { label: string; value: number; icon: any; tone?: string }) {
  return <div className="flex items-center rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><span className="mr-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-indigo-600"><Icon className="h-5 w-5" /></span><div><p className={cn("text-2xl font-bold", tone)}>{value}</p><p className="text-sm text-slate-500">{label}</p></div></div>;
}

function Field({ label, children }: { label: string; children: any }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}
