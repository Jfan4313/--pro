import { useState, useMemo } from "react";
import { Send, Paperclip, Search, MoreVertical, FileText, Image as ImageIcon, Megaphone, Users, Plus, X, Building2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

const initialChannels = [
  { id: "1", name: "全局公告", type: "announcement", unread: 2, members: ["所有人"] },
  { id: "2", name: "智建公司 - A区商业综合体", type: "project", unread: 0, members: ["张伟", "李娜", "王强"] },
  { id: "3", name: "智建公司 - B区住宅一期", type: "project", unread: 5, members: ["张伟", "陈杰"] },
];

const initialPosts = [
  { 
    id: 1, 
    channelId: "1",
    author: "张伟 (项目经理)", 
    time: "今天 10:24", 
    content: "A区商业综合体主体结构施工进度已达60%，请各班组注意安全规范，下午3点进行现场联合检查。",
    type: "announcement",
    attachments: []
  },
  { 
    id: 2, 
    channelId: "2",
    author: "李娜 (安全员)", 
    time: "今天 09:15", 
    content: "上传了最新的《现场安全施工规范V2.0.pdf》，请所有新进场人员务必下载学习。",
    type: "document",
    attachments: [{ name: "现场安全施工规范V2.0.pdf", size: "2.4 MB", type: "pdf" }]
  },
  { 
    id: 3, 
    channelId: "3",
    author: "王强 (高级电工)", 
    time: "昨天 16:30", 
    content: "地下室二层桥架安装完毕，附上现场照片，请监理查验。",
    type: "update",
    attachments: [{ name: "现场照片_桥架.jpg", size: "1.1 MB", type: "image" }]
  },
];

export function Chat() {
  const [channels, setChannels] = useFirebaseSync("chatChannels", initialChannels);
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || "1");
  const [postText, setPostText] = useState("");
  const [posts, setPosts] = useFirebaseSync("chatPosts", initialPosts);
  const [personnelData] = useFirebaseSync("personnelData", []);
  const [projectBoardData] = useFirebaseSync("projectBoardData", []);

  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  
  const [newChannelName, setNewChannelName] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const activeChannel = channels.find((c: any) => c.id === activeChannelId) || channels[0];
  const activePosts = posts.filter((p: any) => p.channelId === activeChannelId);

  const allProjects = useMemo(() => {
    return projectBoardData.flatMap((col: any) => col.projects || []);
  }, [projectBoardData]);

  const filteredPersonnel = useMemo(() => {
    if (!memberSearchQuery.trim()) return personnelData;
    const query = memberSearchQuery.toLowerCase();
    return personnelData.filter((p: any) => 
      p.name.toLowerCase().includes(query) || 
      p.id.toLowerCase().includes(query) ||
      p.team.toLowerCase().includes(query)
    );
  }, [personnelData, memberSearchQuery]);

  const groupedPersonnel = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredPersonnel.forEach((p: any) => {
      const teamName = p.team || "未分配部门";
      if (!groups[teamName]) groups[teamName] = [];
      groups[teamName].push(p);
    });
    return groups;
  }, [filteredPersonnel]);

  const handleAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: `${action} 操作已执行` }));
  };

  const handlePost = () => {
    if (!postText.trim()) return;
    
    const newPost = {
      id: Date.now(),
      channelId: activeChannelId,
      author: "我 (项目经理)",
      time: "刚刚",
      content: postText,
      type: "update",
      attachments: []
    };
    
    setPosts([newPost, ...posts]);
    setPostText("");
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '发布动态成功' }));
  };

  const handleCreateChannel = () => {
    if (!newChannelName.trim()) return;
    const newChannel = {
      id: Date.now().toString(),
      name: selectedProject ? `智建公司 - ${selectedProject}` : newChannelName,
      type: "project",
      unread: 0,
      members: ["我 (项目经理)"]
    };
    setChannels([...channels, newChannel]);
    setActiveChannelId(newChannel.id);
    setIsCreateChannelModalOpen(false);
    setNewChannelName("");
    setSelectedProject("");
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '群组创建成功' }));
  };

  const handleAddMember = (personName: string) => {
    if (activeChannel.members.includes(personName)) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '该成员已在群组中' }));
      return;
    }
    const updatedChannels = channels.map((c: any) => {
      if (c.id === activeChannelId) {
        return { ...c, members: [...c.members, personName] };
      }
      return c;
    });
    setChannels(updatedChannels);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '成员添加成功' }));
  };

  return (
    <div className="p-8 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">项目信息共享</h2>
          <p className="text-slate-500 text-sm mt-1">跨部门项目动态发布、文件共享与进度同步</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsCreateChannelModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 flex items-center gap-2">
            <Plus className="w-4 h-4" /> 新建项目群组
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden flex h-[calc(100%-100px)]">
        {/* Sidebar */}
        <div className="w-72 border-r border-slate-100 flex flex-col bg-slate-50/50 shrink-0">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input 
                type="text" 
                placeholder="搜索群组..." 
                className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-3 mt-2">群组列表</div>
            {channels.map((channel: any) => (
              <div 
                key={channel.id}
                onClick={() => setActiveChannelId(channel.id)}
                className={cn(
                  "px-3 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between group",
                  activeChannelId === channel.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-100/80 text-slate-700"
                )}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {channel.type === 'announcement' ? (
                    <Megaphone className={cn("w-4 h-4", activeChannelId === channel.id ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                  ) : (
                    <Building2 className={cn("w-4 h-4", activeChannelId === channel.id ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                  )}
                  <span className="font-medium text-sm truncate">{channel.name}</span>
                </div>
                {channel.unread > 0 && (
                  <div className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {channel.unread}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Feed Area */}
        <div className="flex-1 flex flex-col bg-slate-50/30 overflow-hidden">
          {/* Header */}
          <div className="h-16 border-b border-slate-100 bg-white flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900 text-lg">{activeChannel.name}</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">内部公开</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <button onClick={() => handleAction('群组设置')} className="hover:text-indigo-600 transition-colors"><MoreVertical className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex">
            <div className="flex-1 max-w-3xl mx-auto space-y-6 pr-6">
              
              {/* Post Input Box */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-8">
                <textarea 
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="发布项目动态、通知或共享文件..."
                  className="w-full bg-transparent border-none outline-none resize-none min-h-[80px] text-sm text-slate-700 placeholder:text-slate-400"
                />
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleAction('上传图片')} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium">
                      <ImageIcon className="w-4 h-4" /> 图片
                    </button>
                    <button onClick={() => handleAction('上传文件')} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium">
                      <Paperclip className="w-4 h-4" /> 文件
                    </button>
                  </div>
                  <button 
                    onClick={handlePost}
                    disabled={!postText.trim()}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" /> 发布
                  </button>
                </div>
              </div>

              {/* Posts Feed */}
              <div className="space-y-6">
                {activePosts.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">暂无动态，来说点什么吧</div>
                ) : (
                  activePosts.map((post: any) => (
                    <div key={post.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                            {post.author.substring(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{post.author}</div>
                            <div className="text-xs text-slate-400">{post.time}</div>
                          </div>
                        </div>
                        {post.type === 'announcement' && (
                          <span className="px-2 py-1 bg-rose-50 text-rose-600 text-xs font-medium rounded border border-rose-100 flex items-center gap-1">
                            <Megaphone className="w-3 h-3" /> 公告
                          </span>
                        )}
                      </div>
                      
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap mb-4">
                        {post.content}
                      </p>

                      {post.attachments && post.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-50">
                          {post.attachments.map((file: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors w-64">
                              <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                file.type === 'pdf' ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                              )}>
                                {file.type === 'image' ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <div className="text-sm font-medium text-slate-700 truncate">{file.name}</div>
                                <div className="text-xs text-slate-400">{file.size}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Members Sidebar */}
            <div className="w-64 border-l border-slate-100 pl-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" /> 
                  群成员 ({activeChannel.members?.length || 0})
                </h3>
                <button 
                  onClick={() => setIsAddMemberModalOpen(true)}
                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {activeChannel.members?.map((memberName: string, idx: number) => {
                  const person = personnelData.find((p: any) => p.name === memberName);
                  return (
                    <div key={idx} className="flex items-center gap-3 group cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                        {memberName.substring(0, 1)}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-sm text-slate-700 truncate font-medium">{memberName}</div>
                        {person && (
                          <div className="text-[10px] text-slate-400 truncate">{person.role}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Channel Modal */}
      {isCreateChannelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">新建项目群组</h3>
              <button onClick={() => setIsCreateChannelModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">关联项目</label>
                <select 
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    if (e.target.value) {
                      setNewChannelName(`智建公司 - ${e.target.value}`);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">-- 选择关联项目 --</option>
                  {allProjects.map((p: any) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">群组名称</label>
                <input 
                  type="text" 
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="例如：智建公司 - A区商业综合体"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreateChannelModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors">
                取消
              </button>
              <button onClick={handleCreateChannel} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                创建群组
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">邀请成员加入群组</h3>
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
              <div className="space-y-6">
                {Object.entries(groupedPersonnel).map(([team, members]: [string, any]) => (
                  <div key={team}>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">{team}</div>
                    <div className="space-y-1">
                      {(members as any[]).map((person: any) => (
                        <div key={person.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {person.name.substring(0, 1)}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 text-sm">{person.name}</div>
                              <div className="text-xs text-slate-500">工号: {person.id} | {person.role}</div>
                            </div>
                          </div>
                          {activeChannel.members?.includes(person.name) ? (
                            <span className="text-xs font-medium text-slate-400 px-3 py-1 bg-slate-100 rounded-full">已加入</span>
                          ) : (
                            <button 
                              onClick={() => handleAddMember(person.name)}
                              className="text-xs font-medium text-indigo-600 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                            >
                              邀请
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedPersonnel).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">未找到匹配的账号</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
