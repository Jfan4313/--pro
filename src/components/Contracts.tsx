import React, { useEffect, useState, useMemo } from "react";
import { FileText, Upload, Search, Filter, MoreHorizontal, Download, Eye, FileSignature, X, History, Paperclip } from "lucide-react";
import { apiClient, API_BASE_URL } from "@/src/lib/apiClient";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { flattenProjects } from "@/src/lib/management";

const initialContracts: any[] = [
  { id: "C-2026-001", name: "A区商业综合体总承包合同", type: "施工合同", partyA: "城建集团", partyB: "第一建筑工程公司", amount: "¥12,500万", date: "2026-01-15", status: "active", projectId: "p1" },
  { id: "C-2026-002", name: "钢材采购年度框架协议", type: "采购合同", partyA: "第一建筑工程公司", partyB: "宝钢股份", amount: "按实结算", date: "2026-02-01", status: "active" },
  { id: "C-2026-003", name: "B区塔吊租赁合同", type: "租赁合同", partyA: "第一建筑工程公司", partyB: "宏达机械租赁", amount: "¥85万", date: "2026-02-20", status: "pending" },
  { id: "C-2025-105", name: "前期地勘服务协议", type: "服务合同", partyA: "城建集团", partyB: "省地质勘查院", amount: "¥120万", date: "2025-11-10", status: "completed" },
];

export function Contracts() {
  const [contracts, setContracts] = useSyncedAppData("project_contracts", []);
  const [externalPartners] = useSyncedAppData<any[]>("externalPartners", []);
  const [projectBoardData] = useProjectBoardData();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [focusedContractId, setFocusedContractId] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuContractId, setMenuContractId] = useState<string | null>(null);
  const [previewContract, setPreviewContract] = useState<any | null>(null);
  const [pendingContractFile, setPendingContractFile] = useState<File | null>(null);
  const projects = useMemo(() => flattenProjects(projectBoardData), [projectBoardData]);

  useEffect(() => {
    const handleFocusRisk = (event: Event) => {
      const risk = (event as CustomEvent).detail;
      if (risk?.actionTab !== "contracts") return;
      setSelectedProjectId(risk.projectId || "all");
      if (risk.action === "create-contract") {
        setPendingProjectId(risk.projectId || "");
        setIsModalOpen(true);
      }
      if (risk.contractId) {
        setSearchQuery(risk.contractId);
        setFocusedContractId(risk.contractId);
        window.setTimeout(() => document.getElementById(`contract-${risk.contractId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
        window.setTimeout(() => setFocusedContractId(null), 3200);
      }
    };
    window.addEventListener("focus-risk", handleFocusRisk);
    return () => window.removeEventListener("focus-risk", handleFocusRisk);
  }, []);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c: any) => {
      const query = searchQuery.toLowerCase();
      const matchesProject = selectedProjectId === "all" || c.projectId === selectedProjectId;
      const matchesType = selectedType === "all" || c.type === selectedType;
      return matchesProject && matchesType && (c.name.toLowerCase().includes(query) ||
             c.id.toLowerCase().includes(query) || 
             c.partyA.toLowerCase().includes(query) || 
             c.partyB.toLowerCase().includes(query));
    });
  }, [contracts, searchQuery, selectedProjectId]);

  const handleAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: `${action} 操作已执行` }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Read file content as data URL to store locally
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileData = event.target?.result;
        const newContract = {
          id: `C-2026-NEW-${Math.floor(Math.random() * 1000)}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          type: "上传模板",
          partyA: "-",
          partyB: "-",
          amount: "-",
          date: new Date().toISOString().split('T')[0],
          status: "draft",
          fileData: fileData // Store the file data locally
          ,isTemplate: true,
          versionHistory: [{ version: 1, action: "上传模板", at: new Date().toISOString(), note: "模板初始上传" }],
        };
        setContracts([newContract, ...contracts]);
        handleAction(`已本地上传: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };

  const recordModification = (contract: any) => {
    const note = window.prompt("请输入本次合同修改说明", "修改合同条款") || "";
    if (!note.trim()) return;
    const history = [...(contract.versionHistory || []), { version: (contract.versionHistory?.length || 0) + 1, action: "合同修改", at: new Date().toISOString(), note: note.trim() }];
    setContracts((current: any[]) => current.map((item) => item.id === contract.id ? { ...item, version: history.length, versionHistory: history, status: item.status === "completed" ? "draft" : item.status } : item));
    setPreviewContract((current: any) => current?.id === contract.id ? { ...current, version: history.length, versionHistory: history, status: current.status === "completed" ? "draft" : current.status } : current);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `已记录第 ${history.length} 版合同修改` }));
  };

  const handleDownload = (contract: any) => {
    if (contract.fileUrl) {
      window.open(contract.fileUrl, "_blank", "noopener,noreferrer");
      handleAction('打开合同附件');
    } else if (contract.fileData) {
      // If we have the file data stored locally, download it
      const a = document.createElement('a');
      a.href = contract.fileData;
      a.download = `${contract.name}.pdf`; // Assuming PDF for simplicity, in a real app store the mime type
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      handleAction('下载本地模板');
    } else {
      handleAction('下载合同');
    }
  };

  const handleDelete = (contract: any) => {
    if (!window.confirm(`确定删除合同“${contract.name}”吗？删除后无法恢复。`)) return;
    setContracts((current: any[]) => current.filter((item) => item.id !== contract.id));
    setMenuContractId(null);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '合同已删除' }));
  };

  const handleApprove = (contract: any) => {
    setContracts((current: any[]) => current.map((item) => item.id === contract.id ? { ...item, status: "active", approvedAt: new Date().toISOString() } : item));
    setMenuContractId(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `合同“${contract.name}”已审批通过` }));
  };

  const handleArchive = (contract: any) => {
    if (!window.confirm(`确认将合同“${contract.name}”最终归档吗？归档后如需修改会生成新版本。`)) return;
    setContracts((current: any[]) => current.map((item) => item.id === contract.id ? { ...item, status: "completed", archivedAt: new Date().toISOString(), versionHistory: [...(item.versionHistory || []), { version: (item.versionHistory?.length || 0) + 1, action: "最终归档", at: new Date().toISOString(), note: "合同完成最终归档" }] } : item));
    setMenuContractId(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "合同已最终归档" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const partnerId = String(form.get("partnerId") || "");
    const partner = externalPartners.find((item: any) => item.id === partnerId);
    let uploadedFile: any = null;
    if (pendingContractFile) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(pendingContractFile); });
        uploadedFile = await apiClient.uploadFile(`contract-${Date.now()}-${pendingContractFile.name}`, dataUrl.split(",")[1] || "");
      } catch { window.dispatchEvent(new CustomEvent("show-toast", { detail: "合同文件上传失败，请检查本地服务后重试" })); return; }
    }
    const newContract = {
      id: `C-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      name: String(form.get("name") || ""),
      type: String(form.get("type") || "施工合同"),
      partyA: String(form.get("partyA") || ""),
      partyB: String(form.get("partyB") || partner?.name || ""),
      amount: String(form.get("amount") || ""),
      date: String(form.get("date") || new Date().toISOString().split("T")[0]),
      status: String(form.get("status") || "pending"),
      projectId: String(form.get("projectId") || ""),
      partnerId,
      paymentNodes: [],
      deliverables: partner?.requiredDocs || [],
      fileUrl: uploadedFile ? `${API_BASE_URL}${uploadedFile.url}` : "",
      fileName: pendingContractFile?.name || "",
      version: 1,
      versionHistory: [{ version: 1, action: "创建合同", at: new Date().toISOString(), note: pendingContractFile ? "创建并上传合同文件" : "创建合同记录" }],
    };
    setContracts((prev: any[]) => [newContract, ...prev]);
    setIsModalOpen(false);
    setPendingContractFile(null);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '新建合同成功' }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">合同管理</h2>
          <p className="text-slate-500 text-sm mt-1">管理项目相关合同与模板（仅本地存储）</p>
        </div>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center">
            <Upload className="w-4 h-4 mr-2" />
            上传模板
            <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileUpload} />
          </label>
          <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 flex items-center">
            <FileSignature className="w-4 h-4 mr-2" />
            新建合同
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-xl mr-4">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">合同总数</p>
            <p className="text-2xl font-bold text-slate-900">{filteredContracts.length} <span className="text-sm font-normal text-slate-400">份</span></p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl mr-4">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">执行中</p>
            <p className="text-2xl font-bold text-slate-900">{filteredContracts.filter(c => c.status === 'active').length} <span className="text-sm font-normal text-slate-400">份</span></p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-xl mr-4">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">待签批</p>
            <p className="text-2xl font-bold text-slate-900">{filteredContracts.filter(c => c.status === 'pending').length} <span className="text-sm font-normal text-slate-400">份</span></p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-80 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input 
              type="text" 
              placeholder="搜索合同编号、名称或相对方..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
            />
          </div>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="all">全部项目</option>
            {projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="all">全部合同类别</option>{Array.from(new Set(contracts.map((contract: any) => contract.type).filter(Boolean))).map((type: any) => <option key={type} value={type}>{type}</option>)}</select>
          </div>
          <button onClick={() => handleAction('筛选')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
        
        <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
            <tr>
              <th className="px-6 py-4">合同编号</th>
              <th className="px-6 py-4">合同名称</th>
              <th className="px-6 py-4">类型</th>
              <th className="px-6 py-4">甲方/乙方</th>
              <th className="px-6 py-4">关联</th>
              <th className="px-6 py-4">合同金额</th>
              <th className="px-6 py-4">签订日期</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredContracts.map((contract) => (
              <tr id={focusedContractId === contract.id ? `contract-${contract.id}` : undefined} key={contract.id} className={cn("hover:bg-slate-50/80 transition-colors", focusedContractId === contract.id && "bg-amber-50 ring-2 ring-inset ring-amber-300")}>
                <td className="px-6 py-4 font-mono text-slate-500">{contract.id}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{contract.name}</td>
                <td className="px-6 py-4 text-slate-600">{contract.type}</td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400">甲: {contract.partyA}</span>
                    <span className="text-xs text-slate-500">乙: {contract.partyB}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex flex-col text-xs">
                    <span>{projects.find((p: any) => p.id === contract.projectId)?.name || "未关联项目"}</span>
                    <span className="text-slate-400 mt-1">{externalPartners.find((p: any) => p.id === contract.partnerId)?.name || "未关联合协"}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-slate-700">{contract.amount}</td>
                <td className="px-6 py-4 text-slate-500 font-mono">{contract.date}</td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium",
                    contract.status === 'active' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : 
                    contract.status === 'pending' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                    contract.status === 'draft' ? "bg-slate-100 text-slate-600 border border-slate-200" :
                    "bg-blue-50 text-blue-700 border border-blue-100"
                  )}>
                    {contract.status === 'active' ? '执行中' : 
                     contract.status === 'pending' ? '待签批' : 
                     contract.status === 'draft' ? '草稿/模板' : '已归档'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPreviewContract(contract)} title="查看合同" className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDownload(contract)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button onClick={() => setMenuContractId((current) => current === contract.id ? null : contract.id)} title="更多操作" className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuContractId === contract.id && <div className="absolute bottom-8 right-0 z-20 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-xl">
                        <button onClick={() => { setPreviewContract(contract); setMenuContractId(null); }} className="block w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">查看详情</button>
                        <button onClick={() => { handleDownload(contract); setMenuContractId(null); }} className="block w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">下载合同</button>
                        {contract.status === "pending" && <button onClick={() => handleApprove(contract)} className="block w-full px-3 py-2 text-xs text-emerald-600 hover:bg-emerald-50">审批通过</button>}
                        {contract.status !== "completed" && <button onClick={() => handleArchive(contract)} className="block w-full px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50">最终归档</button>}
                        <button onClick={() => handleDelete(contract)} className="block w-full px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">删除合同</button>
                      </div>}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {previewContract && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPreviewContract(null)}>
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="text-xs font-bold text-indigo-600">合同详情</p><h3 className="mt-1 text-lg font-bold text-slate-900">{previewContract.name}</h3></div><button onClick={() => setPreviewContract(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm"><Detail label="合同编号" value={previewContract.id} /><Detail label="类型" value={previewContract.type} /><Detail label="甲方" value={previewContract.partyA} /><Detail label="乙方" value={previewContract.partyB} /><Detail label="金额" value={previewContract.amount} /><Detail label="签订日期" value={previewContract.date} /><Detail label="状态" value={previewContract.status === 'active' ? '执行中' : previewContract.status === 'pending' ? '待签批' : previewContract.status === 'draft' ? '草稿/模板' : '已归档'} /><Detail label="当前版本" value={`第 ${previewContract.version || previewContract.versionHistory?.length || 1} 版`} /></div>
          {previewContract.fileUrl && <div className="px-5 pb-3"><a href={previewContract.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-600 hover:underline">打开合同文件：{previewContract.fileName || "查看附件"}</a></div>}
          <div className="border-t border-slate-100 px-5 py-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><History className="h-4 w-4 text-indigo-600" />合同修改记录</div><div className="space-y-2">{(previewContract.versionHistory || []).map((item: any) => <div key={`${item.version}-${item.at}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-bold">第 {item.version} 版 · {item.action}</span><span className="ml-2 text-slate-400">{new Date(item.at).toLocaleString("zh-CN")}</span><p className="mt-1">{item.note}</p></div>)}</div></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 p-5"><button onClick={() => recordModification(previewContract)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">记录修改</button><button onClick={() => handleDownload(previewContract)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">下载合同</button></div>
        </div>
      </div>}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新建合同</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">合同名称</label>
                <input name="name" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入合同名称" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同类型</label>
                  <select name="type" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option>施工合同</option>
                    <option>采购合同</option>
                    <option>设计合同</option>
                    <option>分包合同</option>
                    <option>劳务合同</option>
                    <option>检测合同</option>
                    <option>租赁合同</option>
                    <option>服务合同</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同金额</label>
                  <input name="amount" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="如：¥100万" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">甲方</label>
                  <input name="partyA" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入甲方名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">乙方</label>
                  <input name="partyB" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入乙方名称" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">关联项目</label>
                  <select name="projectId" defaultValue={pendingProjectId} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option value="">暂不关联</option>
                    {projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">参建/外协单位</label>
                  <select name="partnerId" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option value="">暂不关联</option>
                    {externalPartners.map((partner: any) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">签订日期</label>
                <input name="date" type="date" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">合同状态</label>
                <select name="status" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                  <option value="pending">待签批</option>
                  <option value="active">执行中</option>
                  <option value="draft">草稿/模板</option>
                  <option value="completed">已归档</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">合同文件</label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/40"><Paperclip className="h-5 w-5 text-indigo-500" /><span className="min-w-0 flex-1 truncate">{pendingContractFile?.name || "上传 PDF / Word 合同文件（可选）"}</span><input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(event) => setPendingContractFile(event.target.files?.[0] || null)} /></label>
                <p className="mt-1 text-xs text-slate-400">上传后会保留文件地址，并作为第 1 版合同记录。</p>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 break-words font-medium text-slate-800">{value || "未填写"}</p></div>;
}
