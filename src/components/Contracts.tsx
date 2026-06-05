import React, { useState, useMemo } from "react";
import { FileText, Upload, Search, Filter, MoreHorizontal, Download, Eye, FileSignature, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

const initialContracts = [
  { id: "C-2026-001", name: "A区商业综合体总承包合同", type: "施工合同", partyA: "城建集团", partyB: "第一建筑工程公司", amount: "¥12,500万", date: "2026-01-15", status: "active" },
  { id: "C-2026-002", name: "钢材采购年度框架协议", type: "采购合同", partyA: "第一建筑工程公司", partyB: "宝钢股份", amount: "按实结算", date: "2026-02-01", status: "active" },
  { id: "C-2026-003", name: "B区塔吊租赁合同", type: "租赁合同", partyA: "第一建筑工程公司", partyB: "宏达机械租赁", amount: "¥85万", date: "2026-02-20", status: "pending" },
  { id: "C-2025-105", name: "前期地勘服务协议", type: "服务合同", partyA: "城建集团", partyB: "省地质勘查院", amount: "¥120万", date: "2025-11-10", status: "completed" },
];

export function Contracts() {
  const [contracts, setContracts] = useFirebaseSync("project_contracts", initialContracts);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c: any) => {
      const query = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(query) || 
             c.id.toLowerCase().includes(query) || 
             c.partyA.toLowerCase().includes(query) || 
             c.partyB.toLowerCase().includes(query);
    });
  }, [contracts, searchQuery]);

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
        };
        setContracts([newContract, ...contracts]);
        handleAction(`已本地上传: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownload = (contract: any) => {
    if (contract.fileData) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
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
          <button onClick={() => handleAction('筛选')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
        
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
            <tr>
              <th className="px-6 py-4">合同编号</th>
              <th className="px-6 py-4">合同名称</th>
              <th className="px-6 py-4">类型</th>
              <th className="px-6 py-4">甲方/乙方</th>
              <th className="px-6 py-4">合同金额</th>
              <th className="px-6 py-4">签订日期</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredContracts.map((contract) => (
              <tr key={contract.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-6 py-4 font-mono text-slate-500">{contract.id}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{contract.name}</td>
                <td className="px-6 py-4 text-slate-600">{contract.type}</td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400">甲: {contract.partyA}</span>
                    <span className="text-xs text-slate-500">乙: {contract.partyB}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-slate-700">{contract.amount}</td>
                <td className="px-6 py-4 text-slate-500 font-mono">{contract.date}</td>
                <td className="px-6 py-4">
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
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleAction('预览合同')} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDownload(contract)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction('更多操作')} className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新建合同</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">合同名称</label>
                <input type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入合同名称" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同类型</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option>施工合同</option>
                    <option>采购合同</option>
                    <option>租赁合同</option>
                    <option>服务合同</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同金额</label>
                  <input type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="如：¥100万" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">甲方</label>
                  <input type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入甲方名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">乙方</label>
                  <input type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入乙方名称" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">签订日期</label>
                <input type="date" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
