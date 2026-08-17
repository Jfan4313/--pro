import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CheckCircle2, FileWarning, Phone, Plus, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects } from "@/src/lib/management";
import { readAndUploadFile } from "@/src/lib/fileUpload";

export const partnerTypes = ["设计单位", "施工分包", "劳务队", "设备租赁", "检测/监理", "咨询服务", "外包个人"];
export const partnerRequiredDocs = ["营业执照", "资质证书", "安全协议", "人员证件", "施工方案", "验收资料"];

const initialPartners = [
  {
    id: "EP-001",
    name: "华东新能源设计院",
    type: "设计单位",
    contact: "周工",
    phone: "13800010001",
    projectIds: ["p1"],
    projectNames: ["C区绿色建筑改造"],
    scope: "初步设计、深化设计、竣工图",
    contractId: "C-2025-105",
    status: "active",
    qualification: "电力行业设计乙级",
    requiredDocs: ["营业执照", "资质证书", "施工图交付清单"],
    uploadedDocs: ["营业执照", "资质证书"],
  },
  {
    id: "EP-002",
    name: "安达光伏安装劳务队",
    type: "劳务队",
    contact: "刘队",
    phone: "13800010002",
    projectIds: ["p1", "p4"],
    projectNames: ["C区绿色建筑改造", "智能微电网二期"],
    scope: "支架安装、组件安装、现场收尾",
    contractId: "",
    status: "pending-contract",
    qualification: "劳务作业备案",
    requiredDocs: ["营业执照", "安全协议", "人员证件", "施工方案"],
    uploadedDocs: ["营业执照"],
  },
  {
    id: "EP-003",
    name: "明检第三方检测",
    type: "检测/监理",
    contact: "陈工",
    phone: "13800010003",
    projectIds: ["p6"],
    projectNames: ["北侧风力发电机组"],
    scope: "隐蔽工程检测、并网验收资料",
    contractId: "",
    status: "active",
    qualification: "CMA 检测资质",
    requiredDocs: ["营业执照", "资质证书", "验收资料"],
    uploadedDocs: ["营业执照", "资质证书", "验收资料"],
  },
];

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "合作中", className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  "pending-contract": { label: "待签合同", className: "bg-amber-50 text-amber-700 border-amber-100" },
  suspended: { label: "暂停", className: "bg-slate-100 text-slate-600 border-slate-200" },
  archived: { label: "已归档", className: "bg-blue-50 text-blue-700 border-blue-100" },
};

export function ExternalPartners() {
  const [partners, setPartners] = useSyncedAppData<any[]>("externalPartners", []);
  const [boardData] = useProjectBoardData();
  const [contracts] = useSyncedAppData<any[]>("project_contracts", []);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [focusedPartnerId, setFocusedPartnerId] = useState<string | null>(null);
  const [pendingDocUpload, setPendingDocUpload] = useState<{ partnerId: string; doc: string } | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleFocusRisk = (event: Event) => {
      const risk = (event as CustomEvent).detail;
      if (risk?.actionTab !== "partners" || !risk.partnerId) return;
      setSearchQuery(risk.partnerId);
      setFocusedPartnerId(risk.partnerId);
      window.setTimeout(() => document.getElementById(`partner-${risk.partnerId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      window.setTimeout(() => setFocusedPartnerId(null), 3200);
    };
    window.addEventListener("focus-risk", handleFocusRisk);
    return () => window.removeEventListener("focus-risk", handleFocusRisk);
  }, []);

  const projects = useMemo(() => flattenProjects(boardData), [boardData]);
  const filteredPartners = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner: any) =>
      [partner.name, partner.type, partner.contact, partner.scope, ...(partner.projectNames || [])]
        .filter(Boolean)
        .some((value: string) => String(value).toLowerCase().includes(query))
    );
  }, [partners, searchQuery]);

  const riskCount = partners.filter((partner: any) => !partner.contractId || getMissingDocs(partner).length > 0).length;

  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !pendingDocUpload) return;
    if (file.size > 8 * 1024 * 1024) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "资料不能超过 8MB" }));
      return;
    }
    try {
        setIsUploadingDoc(true);
        const uploaded = await readAndUploadFile(file);
        setPartners((current: any[]) => current.map((partner: any) => partner.id !== pendingDocUpload.partnerId ? partner : {
          ...partner,
          uploadedDocs: Array.from(new Set([...(partner.uploadedDocs || []), pendingDocUpload.doc])),
          uploadedDocFiles: { ...(partner.uploadedDocFiles || {}), [pendingDocUpload.doc]: { name: file.name, url: uploaded.url, dataUrl: uploaded.dataUrl, storage: uploaded.storage, uploadedAt: new Date().toISOString() } },
        }));
        window.dispatchEvent(new CustomEvent("show-toast", { detail: `${pendingDocUpload.doc} 已上传` }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "资料上传失败，请重试" }));
    } finally {
      setIsUploadingDoc(false);
      setPendingDocUpload(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedProjectId = String(form.get("projectId") || "");
    const project = projects.find((item: any) => item.id === selectedProjectId);
    const type = String(form.get("type") || partnerTypes[0]);
    const docs = type === "外包个人" ? ["人员证件", "安全协议"] : partnerRequiredDocs;
    const newPartner = {
      id: `EP-${Date.now()}`,
      name: String(form.get("name") || ""),
      type,
      contact: String(form.get("contact") || ""),
      phone: String(form.get("phone") || ""),
      projectIds: selectedProjectId ? [selectedProjectId] : [],
      projectNames: project ? [project.name] : [],
      scope: String(form.get("scope") || ""),
      contractId: String(form.get("contractId") || ""),
      status: String(form.get("status") || "pending-contract"),
      qualification: String(form.get("qualification") || ""),
      requiredDocs: docs,
      uploadedDocs: [],
    };
    setPartners((prev: any[]) => [newPartner, ...prev]);
    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "参建单位已添加" }));
  };

  const toggleDoc = (partnerId: string, docName: string) => {
    setPartners((prev: any[]) => prev.map((partner: any) => {
      if (partner.id !== partnerId) return partner;
      const uploaded = new Set(partner.uploadedDocs || []);
      if (uploaded.has(docName)) uploaded.delete(docName);
      else uploaded.add(docName);
      return { ...partner, uploadedDocs: Array.from(uploaded) };
    }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">参建单位与外协管理</h2>
          <p className="text-slate-500 text-sm mt-1">管理设计、分包、劳务、检测、租赁和外包人员的责任闭环</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 flex items-center justify-center">
          <Plus className="w-4 h-4 mr-2" />
          新增参建单位
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Metric icon={Building2} label="参建单位总数" value={`${partners.length} 家/人`} color="text-indigo-600 bg-indigo-50" />
        <Metric icon={ShieldCheck} label="合作中" value={`${partners.filter((p: any) => p.status === "active").length} 个`} color="text-emerald-600 bg-emerald-50" />
        <Metric icon={FileWarning} label="需关注" value={`${riskCount} 项`} color="text-amber-600 bg-amber-50" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full max-w-md focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="搜索单位、联系人、负责范围..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-4">单位/个人</th>
                <th className="px-5 py-4">类型</th>
                <th className="px-5 py-4">关联项目</th>
                <th className="px-5 py-4">负责范围</th>
                <th className="px-5 py-4">合同</th>
                <th className="px-5 py-4">资料</th>
                <th className="px-5 py-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredPartners.map((partner: any) => {
                const missingDocs = getMissingDocs(partner);
                return (
                  <tr id={focusedPartnerId === partner.id ? `partner-${partner.id}` : undefined} key={partner.id} className={cn("hover:bg-slate-50/80 transition-colors align-top", focusedPartnerId === partner.id && "bg-amber-50 ring-2 ring-inset ring-amber-300")}>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900">{partner.name}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1"><Phone className="w-3 h-3" /> {partner.contact} · {partner.phone}</div>
                    </td>
                    <td className="px-5 py-4"><span className="inline-flex px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">{partner.type}</span></td>
                    <td className="px-5 py-4 text-slate-600">{(partner.projectNames || []).join("、") || "未关联"}</td>
                    <td className="px-5 py-4 text-slate-600 max-w-[260px]"><div className="line-clamp-2" title={partner.scope}>{partner.scope || "未填写"}</div></td>
                    <td className="px-5 py-4 text-slate-600">
                      {partner.contractId ? <span className="font-mono text-xs">{partner.contractId}</span> : <span className="text-amber-600 text-xs font-medium">待关联合同</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {(partner.requiredDocs || []).map((doc: string) => {
                          const done = (partner.uploadedDocs || []).includes(doc);
                          return (
                            <button
                              key={doc}
                              onClick={() => { if (done) toggleDoc(partner.id, doc); else { setPendingDocUpload({ partnerId: partner.id, doc }); docInputRef.current?.click(); } }}
                              className={cn("inline-flex items-center px-2 py-1 rounded text-[11px] border transition-colors", done ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100")}
                              title={done ? "点击标记为缺失" : "选择文件上传资料"}
                            >
                              {done && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {doc}
                            </button>
                          );
                        })}
                      </div>
                      {missingDocs.length > 0 && <div className="text-[11px] text-amber-600 mt-2">缺 {missingDocs.length} 项资料</div>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium border", statusConfig[partner.status]?.className || statusConfig.active.className)}>
                        {statusConfig[partner.status]?.label || "合作中"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={(event) => void handleDocUpload(event)} />
      {isUploadingDoc && <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">资料上传中…</div>}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新增参建单位/外协对象</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field name="name" label="单位/个人名称" placeholder="例如：某某设计院" required />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                  <select name="type" className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm">
                    {partnerTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field name="contact" label="联系人" placeholder="联系人姓名" required />
                <Field name="phone" label="联系电话" placeholder="手机号/座机" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">关联项目</label>
                  <select name="projectId" className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm">
                    <option value="">暂不关联</option>
                    {projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">关联合同</label>
                  <select name="contractId" className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm">
                    <option value="">待签/待关联</option>
                    {contracts.map((contract: any) => <option key={contract.id} value={contract.id}>{contract.id} · {contract.name}</option>)}
                  </select>
                </div>
              </div>
              <Field name="qualification" label="资质/证书摘要" placeholder="例如：建筑施工总承包二级" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">负责范围</label>
                <textarea name="scope" rows={3} required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" placeholder="例如：支架安装、组件安装、现场收尾" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                <select name="status" className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm">
                  <option value="pending-contract">待签合同</option>
                  <option value="active">合作中</option>
                  <option value="suspended">暂停</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">确认添加</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function getMissingDocs(partner: any) {
  const uploaded = new Set(partner.uploadedDocs || []);
  return (partner.requiredDocs || []).filter((doc: string) => !uploaded.has(doc));
}

function Metric({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center">
      <div className={cn("p-4 rounded-xl mr-4", color)}><Icon className="w-6 h-6" /></div>
      <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div>
    </div>
  );
}

function Field({ name, label, placeholder, required }: { name: string; label: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-rose-500"> *</span>}</label>
      <input name={name} required={required} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder={placeholder} />
    </div>
  );
}
