import React, { useState, useMemo } from "react";
import { Building2, Users, FolderTree, Plus, MoreVertical, Search, ChevronRight, Edit2, Trash2, UserPlus, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { createEmptyOrganization } from "@/src/lib/workspaceDefaults";
import { motion, AnimatePresence } from "motion/react";

type OrgNodeType = "company" | "department" | "team";

type OrgNode = {
  id: string;
  name: string;
  type: OrgNodeType;
  children: OrgNode[];
};

type OrgDialogState =
  | { mode: "add"; parentId: string; parentName: string; nodeType: OrgNodeType; name: string }
  | { mode: "edit"; nodeId: string; originalName: string; name: string };

const initialOrgData = {
  id: "org-1",
  name: "智建建筑工程有限公司",
  type: "company",
  children: [
    {
      id: "dept-1",
      name: "工程部",
      type: "department",
      children: [
        { id: "team-1", name: "土建组", type: "team", children: [] },
        { id: "team-2", name: "电气一班", type: "team", children: [] },
        { id: "team-3", name: "安装二班", type: "team", children: [] },
        { id: "team-4", name: "机械组", type: "team", children: [] },
      ]
    },
    {
      id: "dept-2",
      name: "管理层",
      type: "department",
      children: [
        { id: "team-5", name: "管理组", type: "team", children: [] }
      ]
    },
    {
      id: "dept-3",
      name: "安监部",
      type: "department",
      children: []
    },
    {
      id: "dept-4",
      name: "采购部",
      type: "department",
      children: []
    }
  ]
};

export function Organization() {
  const [orgData, setOrgData] = useSyncedAppData<OrgNode>("organizationData", createEmptyOrganization() as OrgNode);
  const [personnelData, setPersonnelData] = useSyncedAppData("personnelData", []);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("org-1");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["org-1", "dept-1", "dept-2"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [orgDialog, setOrgDialog] = useState<OrgDialogState | null>(null);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);

  const showToast = (detail: string) => window.dispatchEvent(new CustomEvent('show-toast', { detail }));

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Helper to find a node by ID
  const findNode = (node: OrgNode, id: string): OrgNode | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper to get all team names under a node
  const getTeamNames = (node: OrgNode): string[] => {
    let names: string[] = [node.name];
    if (node.children) {
      node.children.forEach((child: OrgNode) => {
        names = names.concat(getTeamNames(child));
      });
    }
    return names;
  };

  const getChildType = (node: OrgNode): OrgNodeType => node.type === "company" ? "department" : "team";

  const getTypeLabel = (type: OrgNodeType) => type === "company" ? "公司" : type === "department" ? "部门" : "班组";

  const createNode = (name: string, type: OrgNodeType): OrgNode => ({
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    type,
    children: [],
  });

  const addNode = (node: OrgNode, parentId: string, child: OrgNode): OrgNode => {
    if (node.id === parentId) return { ...node, children: [...(node.children || []), child] };
    return { ...node, children: (node.children || []).map((item) => addNode(item, parentId, child)) };
  };

  const renameNode = (node: OrgNode, nodeId: string, name: string): OrgNode => {
    if (node.id === nodeId) return { ...node, name };
    return { ...node, children: (node.children || []).map((item) => renameNode(item, nodeId, name)) };
  };

  const removeNode = (node: OrgNode, nodeId: string): OrgNode => ({
    ...node,
    children: (node.children || [])
      .filter((item) => item.id !== nodeId)
      .map((item) => removeNode(item, nodeId)),
  });

  const selectedNode = useMemo(() => findNode(orgData, selectedNodeId), [orgData, selectedNodeId]);

  const displayMembers = useMemo(() => {
    if (!selectedNode) return [];
    
    // If company or department, show all members in sub-teams
    const validTeams = getTeamNames(selectedNode);
    
    let members = personnelData;
    if (selectedNode.type !== 'company') {
      members = personnelData.filter((p: any) => validTeams.includes(p.team));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      members = members.filter((p: any) => 
        p.name.toLowerCase().includes(query) || 
        p.id.toLowerCase().includes(query) ||
        p.role.toLowerCase().includes(query)
      );
    }

    return members;
  }, [selectedNode, personnelData, searchQuery]);

  const availablePersonnel = useMemo(() => {
    if (!selectedNode) return [];
    const validTeams = getTeamNames(selectedNode);
    
    let available = personnelData.filter((p: any) => !validTeams.includes(p.team));
    
    if (memberSearchQuery.trim()) {
      const query = memberSearchQuery.toLowerCase();
      available = available.filter((p: any) => 
        p.name.toLowerCase().includes(query) || 
        p.id.toLowerCase().includes(query) ||
        p.role.toLowerCase().includes(query) ||
        (p.team && p.team.toLowerCase().includes(query))
      );
    }
    return available;
  }, [selectedNode, personnelData, memberSearchQuery]);

  const handleAddMember = (personId: string) => {
    if (!selectedNode) return;
    setPersonnelData((prev: any[]) => 
      prev.map(p => p.id === personId ? { ...p, team: selectedNode.name } : p)
    );
    showToast('成员已添加到该组织');
  };

  const openAddDialog = (parent: OrgNode) => {
    const nodeType = getChildType(parent);
    setOrgDialog({ mode: "add", parentId: parent.id, parentName: parent.name, nodeType, name: "" });
  };

  const openEditDialog = (node: OrgNode) => {
    setOrgDialog({ mode: "edit", nodeId: node.id, originalName: node.name, name: node.name });
  };

  const handleSaveOrgDialog = (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgDialog) return;
    const name = orgDialog.name.trim();
    if (!name) {
      showToast("请填写组织名称");
      return;
    }

    if (orgDialog.mode === "add") {
      const child = createNode(name, orgDialog.nodeType);
      void setOrgData((current) => addNode(current, orgDialog.parentId, child));
      setExpandedNodes(prev => new Set(prev).add(orgDialog.parentId));
      setSelectedNodeId(child.id);
      setOrgDialog(null);
      showToast(`${getTypeLabel(orgDialog.nodeType)}已新增`);
      return;
    }

    void setOrgData((current) => renameNode(current, orgDialog.nodeId, name));
    if (orgDialog.originalName !== name) {
      void setPersonnelData((prev: any[]) => prev.map((person) => person.team === orgDialog.originalName ? { ...person, team: name } : person));
    }
    setOrgDialog(null);
    showToast("组织名称已更新");
  };

  const handleDeleteNode = (node: OrgNode) => {
    if (node.type === "company") {
      showToast("公司根节点不能删除");
      return;
    }
    const teamNames = getTeamNames(node);
    const memberCount = personnelData.filter((person: any) => teamNames.includes(person.team)).length;
    const childCount = (node.children || []).length;
    const message = `确定删除“${node.name}”吗？${childCount ? `将同时删除 ${childCount} 个下级组织。` : ""}${memberCount ? `相关 ${memberCount} 名成员会变为未分配。` : ""}`;
    if (!window.confirm(message)) return;

    void setOrgData((current) => removeNode(current, node.id));
    void setPersonnelData((prev: any[]) => prev.map((person) => teamNames.includes(person.team) ? { ...person, team: "" } : person));
    if (selectedNodeId === node.id || teamNames.includes(selectedNode?.name || "")) setSelectedNodeId("org-1");
    setOrgDialog(null);
    showToast("组织已删除");
  };

  const renderTree = (node: OrgNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div 
          className={cn(
            "flex items-center py-2 px-3 cursor-pointer rounded-lg transition-colors group",
            isSelected ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-700",
            level === 0 ? "font-semibold" : "font-medium text-sm"
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => setSelectedNodeId(node.id)}
        >
          <div className="flex items-center gap-2 flex-1 overflow-hidden">
            <div 
              className={cn("w-4 h-4 flex items-center justify-center shrink-0", hasChildren ? "cursor-pointer" : "opacity-0")}
              onClick={(e) => hasChildren && toggleExpand(node.id, e)}
            >
               {hasChildren && <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isExpanded && "rotate-90")} />}
            </div>
            {node.type === 'company' ? <Building2 className="w-4 h-4 text-indigo-600 shrink-0" /> : 
             node.type === 'department' ? <FolderTree className="w-4 h-4 text-amber-500 shrink-0" /> : 
             <Users className="w-4 h-4 text-emerald-500 shrink-0" />}
            <span className="truncate">{node.name}</span>
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
            <button className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors" title={`新增${getTypeLabel(getChildType(node))}`} onClick={(e) => { e.stopPropagation(); openAddDialog(node); }}>
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors" title="重命名" onClick={(e) => { e.stopPropagation(); openEditDialog(node); }}>
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {node.type !== 'company' && (
              <button className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="删除" onClick={(e) => { e.stopPropagation(); handleDeleteNode(node); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {isExpanded && hasChildren && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-0.5 overflow-hidden"
            >
              {node.children.map((child: OrgNode) => renderTree(child, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-white animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Left Sidebar: Org Tree */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-600" />
            组织架构
          </h2>
          <button onClick={() => openAddDialog(orgData)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="添加顶级部门">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {renderTree(orgData)}
        </div>
      </div>

      {/* Right Content: Members List */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{selectedNode?.name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {selectedNode?.type === 'company' ? '全公司人员' : 
               selectedNode?.type === 'department' ? '部门及下属班组人员' : '班组人员'} 
              · 共 {displayMembers.length} 人
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="搜索姓名、工号、职务..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64"
              />
            </div>
            <button 
              onClick={() => setIsAddMemberModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              添加成员
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {displayMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Users className="w-12 h-12 mb-4 text-slate-300" />
              <p>该组织下暂无人员</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayMembers.map((person: any) => (
                <div key={person.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all bg-white group">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0">
                    {person.name.substring(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-900 truncate">{person.name}</h4>
                      <span className="text-xs font-medium text-slate-500">{person.id}</span>
                    </div>
                    <div className="text-sm text-slate-600 mb-2">{person.role}</div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md truncate">
                        {person.team}
                      </span>
                      {person.status === 'on-site' ? (
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs rounded-md border border-emerald-100">在场</span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-50 text-slate-500 text-xs rounded-md border border-slate-200">离场</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelectedMember(person)} title="查看成员详情" className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                添加成员至 {selectedNode?.name}
              </h3>
              <button onClick={() => setIsAddMemberModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input 
                  type="text" 
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="搜索姓名、工号或部门..." 
                  className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
                />
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                {availablePersonnel.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">未找到可添加的成员</div>
                ) : (
                  availablePersonnel.map((person: any) => (
                    <div key={person.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {person.name.substring(0, 1)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 text-sm">{person.name}</div>
                          <div className="text-xs text-slate-500">工号: {person.id} | {person.role} | {person.team}</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleAddMember(person.id)}
                        className="text-xs font-medium text-indigo-600 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                      >
                        添加
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedMember && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedMember(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div><p className="text-xs font-bold text-indigo-600">成员详情</p><h3 className="mt-1 text-lg font-bold text-slate-900">{selectedMember.name}</h3></div>
              <button onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-6 text-sm">
              {[['工号', selectedMember.id], ['职务', selectedMember.role], ['所属组织', selectedMember.team], ['状态', selectedMember.status === 'on-site' ? '在场' : '离场'], ['手机号', selectedMember.phone || '未填写'], ['备注', selectedMember.note || '暂无']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 break-words font-medium text-slate-800">{value}</p></div>)}
            </div>
          </div>
        </div>
      )}

      {orgDialog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <form onSubmit={handleSaveOrgDialog} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{orgDialog.mode === "add" ? `新增${getTypeLabel(orgDialog.nodeType)}` : "重命名组织"}</h3>
                <p className="mt-1 text-xs text-slate-500">{orgDialog.mode === "add" ? `上级：${orgDialog.parentName}` : `原名称：${orgDialog.originalName}`}</p>
              </div>
              <button type="button" onClick={() => setOrgDialog(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">组织名称</label>
              <input
                autoFocus
                type="text"
                value={orgDialog.name}
                onChange={(event) => setOrgDialog({ ...orgDialog, name: event.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="请输入部门或班组名称"
              />
              {orgDialog.mode === "edit" && (
                <p className="mt-2 text-xs text-slate-400">如果已有人员挂在该班组/部门名下，保存后会同步更新人员所属组织。</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button type="button" onClick={() => setOrgDialog(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">取消</button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
