import React, { useState, useMemo } from "react";
import { Building2, Users, FolderTree, Plus, MoreVertical, Search, ChevronRight, Edit2, Trash2, UserPlus, X, Loader2, UserRound, KeyRound } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { createEmptyOrganization } from "@/src/lib/workspaceDefaults";
import { apiClient } from "@/src/lib/apiClient";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/src/lib/auth";

type OrgNodeType = "company" | "department" | "team";

type OrgNode = {
  id: string;
  name: string;
  type: OrgNodeType;
  children: OrgNode[];
  leaderAccountId?: string;
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
  const { user } = useAuth();
  const canManageSystemAccounts = user?.role === "admin" || user?.role === "company_admin";
  const [orgData, setOrgData] = useSyncedAppData<OrgNode>("organizationData", createEmptyOrganization() as OrgNode);
  const [personnelData, setPersonnelData] = useSyncedAppData("personnelData", []);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("org-1");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["org-1", "dept-1", "dept-2"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [addMemberMode, setAddMemberMode] = useState<"existing" | "new">("existing");
  const [systemAccounts, setSystemAccounts] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ username: "", name: "", email: "", phone: "", position: "", role: "surveyor", password: "" });
  const [isLeaderModalOpen, setIsLeaderModalOpen] = useState(false);
  const [leaderAccounts, setLeaderAccounts] = useState<any[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
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
  const selectedLeader = useMemo(() => leaderAccounts.find((account) => account.id === selectedNode?.leaderAccountId), [leaderAccounts, selectedNode]);

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

  const openAddMemberModal = async () => {
    setIsAddMemberModalOpen(true);
    setAddMemberMode("existing");
    setMemberSearchQuery("");
    setAccountsLoading(true);
    try {
      setSystemAccounts(await apiClient.listAccounts());
    } catch {
      showToast("系统账号加载失败，请确认当前账号有组织管理权限");
    } finally {
      setAccountsLoading(false);
    }
  };

  const resetNewAccountForm = () => setNewAccountForm({ username: "", name: "", email: "", phone: "", position: "", role: "surveyor", password: "" });

  const linkAccountToOrganization = (account: any, position = "") => {
    if (!selectedNode) return;
    void setPersonnelData((current: any[]) => {
      const existingIndex = current.findIndex((person) => person.accountId === account.id || person.username === account.username);
      const person = {
        id: existingIndex >= 0 ? current[existingIndex].id : account.username || account.id,
        accountId: account.id,
        username: account.username,
        name: account.name,
        role: position || current[existingIndex]?.role || account.role,
        systemRole: account.role,
        team: selectedNode.name,
        status: current[existingIndex]?.status || "active",
        phone: account.phone || "",
        email: account.email || "",
      };
      if (existingIndex >= 0) return current.map((item, index) => index === existingIndex ? { ...item, ...person } : item);
      return [...current, person];
    });
    setIsAddMemberModalOpen(false);
    showToast(`${account.name}已加入${selectedNode.name}`);
  };

  const handleLinkExistingAccount = (account: any) => linkAccountToOrganization(account);

  const setNodeLeader = (node: OrgNode, nodeId: string, leaderAccountId: string): OrgNode => {
    if (node.id === nodeId) return { ...node, leaderAccountId: leaderAccountId || undefined };
    return { ...node, children: (node.children || []).map((item) => setNodeLeader(item, nodeId, leaderAccountId)) };
  };

  const openLeaderModal = async () => {
    if (!selectedNode || selectedNode.type !== "team") return;
    setIsLeaderModalOpen(true);
    setLeaderLoading(true);
    try {
      setLeaderAccounts(systemAccounts.length ? systemAccounts : await apiClient.listAccounts());
    } catch {
      showToast("系统账号加载失败，请确认当前账号有组织管理权限");
    } finally {
      setLeaderLoading(false);
    }
  };

  const handleSetLeader = (accountId: string) => {
    if (!selectedNode) return;
    void setOrgData((current) => setNodeLeader(current, selectedNode.id, accountId));
    setIsLeaderModalOpen(false);
    showToast(accountId ? "班组长已设置" : "班组长已取消");
  };

  const handleCreateAndLinkAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = newAccountForm.username.trim().toLowerCase();
    const phone = newAccountForm.phone.trim().replace(/[\s-]/g, "");
    const password = newAccountForm.password.trim();
    if (!newAccountForm.name.trim() || !username) return showToast("请填写姓名和登录账号");
    if (!/^[a-z0-9._+@-]{3,40}$/.test(username)) return showToast("登录账号需为 3-40 位英文、数字或 . _ + @ -");
    if (phone && !/^[0-9+]{6,20}$/.test(phone)) return showToast("手机号需填写 6-20 位数字，可包含 +");
    if (!phone && !password) return showToast("请填写手机号或临时密码");
    if (password && password.length < 8) return showToast("临时密码至少需要 8 位");
    setAccountSaving(true);
    try {
      const account = await apiClient.createAccount({
        username,
        name: newAccountForm.name.trim(),
        email: newAccountForm.email.trim(),
        phone,
        role: newAccountForm.role,
        password,
      });
      setSystemAccounts((current) => [...current, account]);
      linkAccountToOrganization(account, newAccountForm.position.trim());
      resetNewAccountForm();
    } catch (error: any) {
      const errorCode = error?.details?.error || error?.message;
      const message = error?.status === 409
        ? "登录账号或手机号已存在，请改为选择已有账号"
        : errorCode === "invalid_account_fields"
          ? "账号信息不符合规则，请检查登录账号、手机号和临时密码"
          : error?.status === 403
            ? "当前账号没有创建系统账号的权限"
            : "系统账号创建失败，请稍后重试";
      showToast(message);
    } finally {
      setAccountSaving(false);
    }
  };

  const linkedAccountIds = useMemo(() => new Set(displayMembers.map((person: any) => person.accountId).filter(Boolean)), [displayMembers]);
  const filteredSystemAccounts = useMemo(() => {
    const query = memberSearchQuery.trim().toLowerCase();
    return systemAccounts.filter((account) => {
      if (linkedAccountIds.has(account.id)) return false;
      if (!query) return true;
      return `${account.name} ${account.username} ${account.phone || ""} ${account.email || ""}`.toLowerCase().includes(query);
    });
  }, [linkedAccountIds, memberSearchQuery, systemAccounts]);

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
            {selectedNode?.type === "team" && <p className="mt-1 text-xs text-slate-400">班组长：{selectedLeader?.name || "未设置"} · 普通施工人员请在“施工人员管理”录入</p>}
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
            {canManageSystemAccounts && selectedNode?.type === "team" && <button onClick={() => void openLeaderModal()} className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"><UserRound className="h-4 w-4" />设置班组长</button>}
            {canManageSystemAccounts && <button
              onClick={() => void openAddMemberModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              添加成员
            </button>}
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
                    <div className="mb-2 flex items-center gap-2 text-sm text-slate-600"><span>{person.role}</span>{person.accountId ? <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">系统账号</span> : <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">施工档案</span>}</div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div><h3 className="text-lg font-bold text-slate-900">添加系统成员至 {selectedNode?.name}</h3><p className="mt-1 text-xs text-slate-500">这里只关联需要登录系统的人员；普通施工人员请在“施工人员管理”录入</p></div>
              <button onClick={() => setIsAddMemberModalOpen(false)} className="text-slate-400 hover:text-slate-600" type="button">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 bg-slate-50 p-2">
              <button type="button" onClick={() => setAddMemberMode("existing")} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${addMemberMode === "existing" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}><Users className="mr-1.5 inline h-4 w-4" />选择已有账号</button>
            </div>
            {addMemberMode === "existing" ? <>
              <div className="p-4 border-b border-slate-100 shrink-0"><div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all"><Search className="w-4 h-4 text-slate-400 mr-2" /><input type="text" value={memberSearchQuery} onChange={(e) => setMemberSearchQuery(e.target.value)} placeholder="搜索姓名、登录账号、手机号或邮箱..." className="bg-transparent border-none outline-none text-sm w-full text-slate-700" /></div></div>
              <div className="p-4 overflow-y-auto flex-1"><div className="space-y-2">{accountsLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div> : filteredSystemAccounts.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm">未找到可添加的系统账号</div> : filteredSystemAccounts.map((account) => <div key={account.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors"><div className="flex items-center gap-3 min-w-0"><div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">{account.name.substring(0, 1)}</div><div className="min-w-0"><div className="font-medium text-slate-900 text-sm truncate">{account.name}</div><div className="text-xs text-slate-500 truncate">@{account.username}{account.phone ? ` · ${account.phone}` : ""}</div></div></div><button type="button" onClick={() => handleLinkExistingAccount(account)} className="text-xs font-medium text-indigo-600 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors shrink-0">加入</button></div>)}</div></div>
            </> : <form onSubmit={handleCreateAndLinkAccount} className="p-5 overflow-y-auto flex-1"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["姓名", "name", "例如：张伟"], ["登录账号", "username", "英文、数字或手机号"], ["手机号", "phone", "用于验证码登录，可选"], ["邮箱", "email", "可选"], ["职位", "position", "例如：技术总监"]].map(([label, key, placeholder]) => <label key={key} className={`block ${key === "position" ? "sm:col-span-2" : ""}`}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}{["name", "username"].includes(key) ? " *" : ""}</span><input value={(newAccountForm as any)[key]} onChange={(event) => setNewAccountForm({ ...newAccountForm, [key]: event.target.value })} placeholder={placeholder} className="survey-input" /></label>)}<label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">系统角色</span><select value={newAccountForm.role} onChange={(event) => setNewAccountForm({ ...newAccountForm, role: event.target.value })} className="survey-input"><option value="admin">系统管理员</option><option value="project_manager">项目经理</option><option value="surveyor">现场勘察员</option><option value="designer">设计人员</option><option value="finance">财务人员</option><option value="viewer">只读成员</option></select></label><label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">临时密码</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" value={newAccountForm.password} onChange={(event) => setNewAccountForm({ ...newAccountForm, password: event.target.value })} placeholder="可选；留空则使用手机号验证码登录" className="survey-input pl-9" /></div></label></div><p className="mt-3 text-xs text-slate-400">手机号和临时密码至少填写一项。创建后账号会自动加入当前组织。</p><button disabled={accountSaving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50">{accountSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}{accountSaving ? "正在创建" : "创建账号并加入组织"}</button></form>}
          </div>
        </div>
      )}

      {isLeaderModalOpen && selectedNode?.type === "team" && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div><h3 className="text-lg font-bold text-slate-900">设置班组长</h3><p className="mt-1 text-xs text-slate-500">{selectedNode.name} · 仅关联可登录系统的账号</p></div>
              <button type="button" onClick={() => setIsLeaderModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-2">
              {leaderLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div> : <>
                <button type="button" onClick={() => handleSetLeader("")} className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50">暂不设置班组长</button>
                {leaderAccounts.filter((account) => account.status === "active").map((account) => <button type="button" key={account.id} onClick={() => handleSetLeader(account.id)} className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors", selectedNode.leaderAccountId === account.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50")}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{account.name.substring(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{account.name}</span><span className="block truncate text-xs text-slate-500">@{account.username} · {account.role === "construction_leader" ? "施工班长" : "可登录账号"}</span></span>{selectedNode.leaderAccountId === account.id && <span className="text-xs font-bold text-indigo-600">当前</span>}</button>)}
                {!leaderAccounts.length && <p className="py-8 text-center text-sm text-slate-400">暂无可关联的系统账号，请先创建班长账号</p>}
              </>}
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
