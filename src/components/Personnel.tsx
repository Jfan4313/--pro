import React, { useState, useMemo, useRef } from "react";
import { Users, UserCheck, ShieldAlert, Search, Filter, MoreHorizontal, CheckCircle2, AlertCircle, X, Download, UploadCloud, FileBadge, Image as ImageIcon, Edit, Trash2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

const personnelDataInitial = [
  { id: "W001", name: "张伟", role: "项目经理", team: "管理组", entryDate: "2025-10-01", status: "on-site", safetyTrained: true, projects: [{ name: "A区商业综合体", status: "active" }], idCardNumber: "110105198508123456", specialCerts: "无", idCardImage: null, specialCertsImage: null },
  { id: "W002", name: "李娜", role: "安全员", team: "管理组", entryDate: "2025-10-05", status: "on-site", safetyTrained: true, projects: [{ name: "A区商业综合体", status: "active" }], idCardNumber: "310104199203157890", specialCerts: "安全员C证", idCardImage: null, specialCertsImage: null },
  { id: "W003", name: "王强", role: "高级电工", team: "电气一班", entryDate: "2026-01-15", status: "on-site", safetyTrained: true, projects: [{ name: "B区住宅一期", status: "active" }], idCardNumber: "420102198811224567", specialCerts: "高压电工作业证", idCardImage: null, specialCertsImage: null },
  { id: "W004", name: "赵敏", role: "结构工程师", team: "土建组", entryDate: "2025-11-20", status: "off-site", safetyTrained: true, projects: [{ name: "C区地下车库", status: "archived" }], idCardNumber: "440305199506081234", specialCerts: "无", idCardImage: null, specialCertsImage: null },
  { id: "W005", name: "陈杰", role: "焊工", team: "安装二班", entryDate: "2026-02-10", status: "on-site", safetyTrained: false, projects: [{ name: "B区住宅一期", status: "active" }], idCardNumber: "510108199012123456", specialCerts: "熔化焊接与热切割作业证", idCardImage: null, specialCertsImage: null },
  { id: "W006", name: "刘洋", role: "普工", team: "土建组", entryDate: "2026-03-01", status: "on-site", safetyTrained: true, projects: [{ name: "市政道路标段", status: "active" }], idCardNumber: "320102199805207890", specialCerts: "无", idCardImage: null, specialCertsImage: null },
  { id: "W007", name: "孙宇", role: "吊车司机", team: "机械组", entryDate: "2026-02-28", status: "on-site", safetyTrained: true, projects: [{ name: "市政道路标段", status: "active" }], idCardNumber: "130104198709154567", specialCerts: "起重机驾驶证", idCardImage: null, specialCertsImage: null },
];

export function Personnel() {
  const [data, setData] = useFirebaseSync("personnelData", personnelDataInitial);
  const [boardData] = useFirebaseSync("projectBoardData", []);

  const dynamicProjects = React.useMemo(() => {
    const list = new Set<string>();
    const formattedData = Array.isArray(data) ? data : [];
    formattedData.forEach((p: any) => {
        if (Array.isArray(p.projects)) {
            p.projects.forEach((proj: any) => proj.name && list.add(proj.name));
        } else if (p.project) list.add(p.project);
    });
    if (Array.isArray(boardData)) {
        boardData.forEach((col: any) => {
            if (Array.isArray(col.projects)) {
                col.projects.forEach((p: any) => p.name && list.add(p.name));
            }
        });
    }
    return ["全部项目", ...Array.from(list)];
  }, [data, boardData]);

  const filterOptions = [...dynamicProjects, "已归档人员"];

  const [selectedProject, setSelectedProject] = useState("全部项目");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // New state for Add Personnel Form
  const [formData, setFormData] = useState({
    name: "",
    id: "",
    projects: [{ name: dynamicProjects[1] || "", status: "active" as const }],
    role: "",
    team: "",
    idCardNumber: "",
    specialCerts: "",
    idCardImage: null as string | null,
    specialCertsImage: null as string | null
  });

  // 如果 dynamicProjects 更新，确保 formData 的项目名称存在
  React.useEffect(() => {
    if ((!formData.projects[0]?.name || !dynamicProjects.includes(formData.projects[0].name)) && dynamicProjects.length > 1) {
      setFormData(prev => ({
        ...prev,
        projects: [{ name: dynamicProjects[1], status: "active" as const }]
      }));
    }
  }, [dynamicProjects, formData.projects]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  const normalizedData = useMemo(() => {
    return data.map((p: any) => ({
      ...p,
      projects: p.projects || [{ name: p.project, status: 'active' }],
      specialCertsImage: p.specialCertsImage || null
    }));
  }, [data]);

  const filteredData = useMemo(() => {
    return normalizedData.filter(p => {
      const activeProjects = p.projects.filter((proj: any) => proj.status === 'active').map((proj: any) => proj.name);
      const archivedProjects = p.projects.filter((proj: any) => proj.status === 'archived').map((proj: any) => proj.name);
      
      let matchesProject = false;
      if (selectedProject === "已归档人员") {
        matchesProject = activeProjects.length === 0 && archivedProjects.length > 0;
      } else {
        matchesProject = selectedProject === "全部项目" || activeProjects.includes(selectedProject);
      }
      
      const matchesSearch = p.name.includes(searchQuery) || p.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesProject && matchesSearch;
    });
  }, [normalizedData, selectedProject, searchQuery]);

  const handleExportCSV = () => {
    const headers = ["工号", "姓名", "所属项目", "职务", "班组", "入场时间", "安全培训", "状态"];
    const rows = filteredData.map(p => [
      p.id,
      p.name,
      p.projects.map((proj: any) => `${proj.name}${proj.status === 'archived' ? '(已归档)' : ''}`).join('; '),
      p.role,
      p.team,
      p.entryDate,
      p.safetyTrained ? '已培训' : '未培训',
      p.status === 'on-site' ? '在场' : '离场'
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `人员名单_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '已导出人员名单' }));
  };

  const handleAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: `${action} 操作已执行` }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      name: "", id: "", projects: [{ name: dynamicProjects[1] || "", status: "active" as const }], role: "", team: "", idCardNumber: "", specialCerts: "", idCardImage: null, specialCertsImage: null
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      name: "", id: "", projects: [{ name: dynamicProjects[1] || "", status: "active" as const }], role: "", team: "", idCardNumber: "", specialCerts: "", idCardImage: null, specialCertsImage: null
    });
  };

  const handleEdit = (person: any) => {
    setFormData({
      name: person.name,
      id: person.id,
      projects: person.projects || [{ name: person.project, status: "active" }],
      role: person.role,
      team: person.team,
      idCardNumber: person.idCardNumber || "",
      specialCerts: person.specialCerts || "",
      idCardImage: person.idCardImage || null,
      specialCertsImage: person.specialCertsImage || null
    });
    setEditingId(person.id);
    setIsModalOpen(true);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      setData(data.filter(p => p.id !== deleteConfirmId));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '人员已删除' }));
      setDeleteConfirmId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.idCardNumber && !/^\d{17}[\dXx]$/.test(formData.idCardNumber)) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '身份证号格式不正确' }));
      return;
    }

    if (editingId) {
      setData(data.map(p => p.id === editingId ? { ...p, ...formData } : p));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '人员信息已更新' }));
    } else {
      const newPerson = {
        ...formData,
        entryDate: new Date().toISOString().split('T')[0],
        status: "on-site",
        safetyTrained: false,
      };
      setData([newPerson, ...data]);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '添加人员成功' }));
    }
    
    closeModal();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, idCardImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCertImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, specialCertsImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">施工人员管理</h2>
          <p className="text-slate-500 text-sm mt-1">现场劳动力调配与安全培训追踪</p>
        </div>
        <div className="flex gap-3">
          <select 
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm"
          >
            {filterOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
            <Download className="w-4 h-4 mr-2" />
            导出
          </button>
          <button onClick={openAddModal} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20">
            添加人员
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl mr-4">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">在册总人数</p>
            <p className="text-2xl font-bold text-slate-900">{filteredData.length} <span className="text-sm font-normal text-slate-400">人</span></p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl mr-4">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">今日出勤</p>
            <p className="text-2xl font-bold text-slate-900">{filteredData.filter(p => p.status === 'on-site').length} <span className="text-sm font-normal text-slate-400">人</span></p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-xl mr-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">待安全培训</p>
            <p className="text-2xl font-bold text-slate-900">{filteredData.filter(p => !p.safetyTrained).length} <span className="text-sm font-normal text-slate-400">人</span></p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-64 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input 
              type="text" 
              placeholder="搜索姓名或工号..." 
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
              <th className="px-6 py-4">工号</th>
              <th className="px-6 py-4">姓名</th>
              <th className="px-6 py-4">所属项目</th>
              <th className="px-6 py-4">工种/职务</th>
              <th className="px-6 py-4">所属班组</th>
              <th className="px-6 py-4">特种作业证</th>
              <th className="px-6 py-4">进场时间</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4">安全培训</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredData.map((person) => (
              <tr key={person.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-6 py-4 font-mono text-slate-500">{person.id}</td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    {person.name}
                    {person.idCardImage && (
                      <button 
                        onClick={() => setViewingImage(person.idCardImage)}
                        className="text-indigo-500 hover:text-indigo-700"
                        title="查看身份证"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex flex-wrap gap-1">
                    {person.projects.map((p: any, i: number) => (
                      <span key={i} className={cn(
                        "inline-block px-2 py-1 rounded text-xs",
                        p.status === 'active' ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-slate-100 text-slate-500 border border-slate-200"
                      )}>
                        {p.name} {p.status === 'archived' && '(已归档)'}
                      </span>
                    ))}
                    {person.projects.length === 0 && (
                      <span className="inline-block px-2 py-1 bg-slate-50 text-slate-400 rounded text-xs">无项目</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{person.role}</td>
                <td className="px-6 py-4 text-slate-600">{person.team}</td>
                <td className="px-6 py-4">
                  {person.specialCerts && person.specialCerts !== "无" ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <FileBadge className="w-3 h-3 mr-1" />
                        {person.specialCerts}
                      </span>
                      {person.specialCertsImage && (
                        <button 
                          onClick={() => setViewingImage(person.specialCertsImage)}
                          className="text-indigo-500 hover:text-indigo-700"
                          title="查看特种作业证"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">无</span>
                  )}
                </td>
                <td className="px-6 py-4 text-slate-500 font-mono">{person.entryDate}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium",
                    person.status === 'on-site' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-600 border border-slate-200"
                  )}>
                    {person.status === 'on-site' ? '在岗' : '休息'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {person.safetyTrained ? (
                    <span className="text-emerald-600 flex items-center text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 已完成</span>
                  ) : (
                    <span className="text-amber-600 flex items-center text-xs font-medium"><AlertCircle className="w-3.5 h-3.5 mr-1" /> 待培训</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleEdit(person)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="编辑">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirmId(person.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="删除">
                      <Trash2 className="w-4 h-4" />
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
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">{editingId ? '编辑人员及资质信息' : '添加人员及资质信息'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* 身份信息区域 */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">基本身份信息</h4>
                
                <div className="flex gap-6">
                  {/* 身份证照片上传 */}
                  <div className="w-48 shrink-0">
                    <label className="block text-sm font-medium text-slate-700 mb-2">身份证正面照片</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "w-full aspect-[1.6/1] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative",
                        formData.idCardImage ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-indigo-400"
                      )}
                    >
                      {formData.idCardImage ? (
                        <img src={formData.idCardImage} alt="ID Card" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                          <span className="text-xs text-slate-500 font-medium">点击上传身份证</span>
                          <span className="text-[10px] text-slate-400 mt-1">支持 JPG, PNG</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>
                  </div>

                  {/* 文本信息 */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">姓名 <span className="text-rose-500">*</span></label>
                        <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="真实姓名" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">身份证号 <span className="text-rose-500">*</span></label>
                        <input type="text" required value={formData.idCardNumber} onChange={e => setFormData({...formData, idCardNumber: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-sm" placeholder="18位身份证号" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">工号 <span className="text-rose-500">*</span></label>
                        <input type="text" required value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="分配工号" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">参与项目 <span className="text-rose-500">*</span></label>
                        <div className="space-y-2">
                          {formData.projects.map((proj, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <select 
                                value={proj.name} 
                                onChange={e => {
                                  const newProjects = [...formData.projects];
                                  newProjects[idx].name = e.target.value;
                                  setFormData({...formData, projects: newProjects});
                                }}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                              >
                                {dynamicProjects.filter(p => p !== "全部项目").map(p => <option key={p}>{p}</option>)}
                              </select>
                              <select
                                value={proj.status}
                                onChange={e => {
                                  const newProjects = [...formData.projects];
                                  newProjects[idx].status = e.target.value as 'active' | 'archived';
                                  setFormData({...formData, projects: newProjects});
                                }}
                                className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                              >
                                <option value="active">在建</option>
                                <option value="archived">已归档</option>
                              </select>
                              <button type="button" onClick={() => {
                                const newProjects = formData.projects.filter((_, i) => i !== idx);
                                setFormData({...formData, projects: newProjects});
                              }} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => {
                            setFormData({...formData, projects: [...formData.projects, { name: dynamicProjects[1] || "", status: 'active' }]});
                          }} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center mt-2">
                            + 添加项目
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 岗位与资质区域 */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">岗位与资质信息</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">工种/角色 <span className="text-rose-500">*</span></label>
                    <input type="text" required value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="例如：焊工、电工、安全员" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">所属班组 <span className="text-rose-500">*</span></label>
                    <input type="text" required value={formData.team} onChange={e => setFormData({...formData, team: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="例如：安装二班" />
                  </div>
                </div>
                <div className="flex gap-6 mt-4">
                  <div className="w-48 shrink-0">
                    <label className="block text-sm font-medium text-slate-700 mb-2">特种作业证照片</label>
                    <div 
                      onClick={() => certInputRef.current?.click()}
                      className={cn(
                        "w-full aspect-[1.6/1] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative",
                        formData.specialCertsImage ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-indigo-400"
                      )}
                    >
                      {formData.specialCertsImage ? (
                        <img src={formData.specialCertsImage} alt="Cert" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                          <span className="text-xs text-slate-500 font-medium">点击上传证书</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={certInputRef} 
                        onChange={handleCertImageUpload} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                      特种作业证名称
                      <span className="text-xs text-slate-400 ml-2 font-normal">(选填，如涉及特种作业必须填写)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FileBadge className="h-4 w-4 text-slate-400" />
                      </div>
                      <input 
                        type="text" 
                        value={formData.specialCerts} 
                        onChange={e => setFormData({...formData, specialCerts: e.target.value})} 
                        className="w-full pl-10 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                        placeholder="例如：高压电工作业证、熔化焊接与热切割作业证" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  {editingId ? '保存修改' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <button onClick={() => setViewingImage(null)} className="absolute -top-12 right-0 text-white hover:text-slate-200 transition-colors">
              <X className="w-8 h-8" />
            </button>
            <img src={viewingImage} alt="ID Card Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 p-6">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-2 bg-rose-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">确认删除</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              您确定要删除该人员信息吗？此操作无法撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                取消
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
