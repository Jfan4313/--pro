import { useMemo, useState } from "react";
import { Building2, FileText, Image as ImageIcon, Megaphone, MoreHorizontal, Paperclip, Plus, Search, Send, Users } from "lucide-react";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";
import { cn } from "@/src/lib/utils";

const initialChannels = [
  { id: "1", name: "全局公告", type: "announcement", unread: 2, members: ["所有人"] },
  { id: "2", name: "智建公司 - A区商业综合体", type: "project", unread: 0, members: ["张伟", "李娜", "王强"] },
  { id: "3", name: "智建公司 - B区住宅一期", type: "project", unread: 5, members: ["张伟", "陈杰"] },
];

const initialPosts = [
  { id: 1, channelId: "1", author: "张伟 (项目经理)", time: "今天 10:24", content: "A区商业综合体主体结构施工进度已达60%，请各班组注意安全规范，下午3点进行现场联合检查。", type: "announcement", attachments: [] },
  { id: 2, channelId: "2", author: "李娜 (安全员)", time: "今天 09:15", content: "上传了最新的《现场安全施工规范V2.0.pdf》，请所有新进场人员务必下载学习。", type: "document", attachments: [{ name: "现场安全施工规范V2.0.pdf", size: "2.4 MB", type: "pdf" }] },
  { id: 3, channelId: "3", author: "王强 (高级电工)", time: "昨天 16:30", content: "地下室二层桥架安装完毕，附上现场照片，请监理查验。", type: "update", attachments: [{ name: "现场照片_桥架.jpg", size: "1.1 MB", type: "image" }] },
];

export function MobileCollaboration() {
  const [channels] = useFirebaseSync<any[]>("chatChannels", initialChannels);
  const [posts, setPosts] = useFirebaseSync<any[]>("chatPosts", initialPosts);
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || "1");
  const [postText, setPostText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const activeChannel = channels.find((channel: any) => channel.id === activeChannelId) || channels[0];
  const activePosts = useMemo(() => posts.filter((post: any) => post.channelId === activeChannelId), [posts, activeChannelId]);

  const handlePost = async () => {
    if (!postText.trim() || !activeChannel) return;
    const newPost = { id: Date.now(), channelId: activeChannelId, author: "我 (项目经理)", time: "刚刚", content: postText.trim(), type: "update", attachments: [] };
    await setPosts([newPost, ...posts]);
    setPostText("");
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目动态已发布" }));
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="bg-slate-950 px-4 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-medium text-indigo-300">项目协作</p><h2 className="mt-1 text-2xl font-bold tracking-tight">消息与动态</h2></div>
          <div className="flex gap-2"><button onClick={() => setSearchOpen((value) => !value)} className="rounded-xl bg-white/10 p-2.5" aria-label="搜索群组"><Search className="h-5 w-5" /></button><button onClick={() => window.dispatchEvent(new CustomEvent("show-toast", { detail: "请在桌面端创建和管理项目群组" }))} className="rounded-xl bg-indigo-600 p-2.5" aria-label="新建群组"><Plus className="h-5 w-5" /></button></div>
        </div>
        {searchOpen && <div className="mt-4 flex items-center rounded-2xl bg-white/10 px-3 py-2.5"><Search className="mr-2 h-4 w-4 text-slate-400" /><input autoFocus placeholder="搜索项目群组" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></div>}
      </header>

      <div className="border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {channels.map((channel: any) => {
            const Icon = channel.type === "announcement" ? Megaphone : Building2;
            return <button key={channel.id} onClick={() => setActiveChannelId(channel.id)} className={cn("relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold", activeChannelId === channel.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}><Icon className="h-3.5 w-3.5" /><span className="max-w-36 truncate">{channel.name.replace("智建公司 - ", "")}</span>{channel.unread > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] text-white">{channel.unread}</span>}</button>;
          })}
        </div>
      </div>

      <section className="border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">{activeChannel?.name || "项目群组"}</h3><p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Users className="h-3 w-3" />{activeChannel?.members?.length || 0} 名成员 · 内部公开</p></div><button className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="群组详情"><MoreHorizontal className="h-4 w-4" /></button></div>
      </section>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {activePosts.map((post: any) => (
          <article key={post.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">{post.author.substring(0, 1)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{post.author}</p><p className="mt-0.5 text-[10px] text-slate-400">{post.time}</p></div></div>{post.type === "announcement" && <span className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600"><Megaphone className="h-3 w-3" />公告</span>}</div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{post.content}</p>
            {post.attachments?.map((file: any, index: number) => <button key={`${file.name}-${index}`} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", file.type === "image" ? "bg-blue-100 text-blue-600" : "bg-rose-100 text-rose-600")}>{file.type === "image" ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-700">{file.name}</span><span className="mt-1 block text-[10px] text-slate-400">{file.size}</span></span></button>)}
          </article>
        ))}
        {activePosts.length === 0 && <div className="py-16 text-center text-sm text-slate-400">这个群组还没有动态</div>}
      </main>

      <footer className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-3 py-3 backdrop-blur-xl">
        <div className="flex items-end gap-2"><button onClick={() => window.dispatchEvent(new CustomEvent("show-toast", { detail: "图片与文件上传功能即将接入" }))} className="mb-0.5 rounded-full bg-slate-100 p-2.5 text-slate-500" aria-label="添加附件"><Paperclip className="h-5 w-5" /></button><textarea value={postText} onChange={(event) => setPostText(event.target.value)} rows={1} placeholder="发布项目动态..." className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300" /><button onClick={() => void handlePost()} disabled={!postText.trim()} className="mb-0.5 rounded-full bg-indigo-600 p-2.5 text-white disabled:bg-slate-200" aria-label="发送"><Send className="h-5 w-5" /></button></div>
      </footer>
    </div>
  );
}
