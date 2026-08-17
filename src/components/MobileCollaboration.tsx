import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Building2, FileText, Image as ImageIcon, Megaphone, MoreHorizontal, Paperclip, Plus, Search, Send, Users } from "lucide-react";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { cn } from "@/src/lib/utils";
import { readAndUploadFile } from "@/src/lib/fileUpload";

export function MobileCollaboration() {
  const [channels] = useSyncedAppData<any[]>("chatChannels", []);
  const [posts, setPosts] = useSyncedAppData<any[]>("chatPosts", []);
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || "1");
  const [postText, setPostText] = useState("");
  const [postAttachments, setPostAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const activeChannel = channels.find((channel: any) => channel.id === activeChannelId) || channels[0];
  const activePosts = useMemo(() => posts.filter((post: any) => post.channelId === activeChannelId), [posts, activeChannelId]);

  useEffect(() => {
    if (channels.length > 0 && !channels.some((channel: any) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  const handlePost = async () => {
    if ((!postText.trim() && postAttachments.length === 0) || !activeChannel) return;
    const newPost = { id: Date.now(), channelId: activeChannelId, author: "我 (项目经理)", time: "刚刚", content: postText.trim(), type: "update", attachments: postAttachments };
    await setPosts([newPost, ...posts]);
    setPostText("");
    setPostAttachments([]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目动态已发布" }));
  };

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(event.target.files || []) as File[]).slice(0, 3 - postAttachments.length);
    event.target.value = "";
    if (files.length === 0) return;
    setIsUploading(true);
    const next = await Promise.all(files.map((file) => readAndUploadFile(file))).catch((error) => {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: error?.message || "附件读取失败" }));
      return [];
    });
    setIsUploading(false);
    setPostAttachments((current) => [...current, ...next]);
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
          {channels.length === 0 && <span className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-500">暂无项目群组</span>}
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
            {post.attachments?.map((file: any, index: number) => <a key={`${file.name}-${index}`} href={file.url || file.dataUrl || undefined} download={file.name} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl", file.type === "image" ? "bg-blue-100 text-blue-600" : "bg-rose-100 text-rose-600")}>{file.type === "image" && file.dataUrl ? <img src={file.dataUrl} alt={file.name} className="h-full w-full object-cover" /> : file.type === "image" ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-700">{file.name}</span><span className="mt-1 block text-[10px] text-slate-400">{file.size} · 点击下载</span></span></a>)}
          </article>
        ))}
        {activePosts.length === 0 && <div className="py-16 text-center text-sm text-slate-400">{channels.length === 0 ? "创建项目后，在桌面端建立项目群组" : "这个群组还没有动态"}</div>}
      </main>

      <footer className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-3 py-3 backdrop-blur-xl">
        {postAttachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{postAttachments.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"><span className="max-w-48 truncate">{file.name}</span><button type="button" onClick={() => setPostAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-rose-600" aria-label={`移除${file.name}`}>×</button></span>)}</div>}
        <div className="flex items-end gap-2"><button onClick={() => attachmentInputRef.current?.click()} disabled={isUploading} className="mb-0.5 rounded-full bg-slate-100 p-2.5 text-slate-500 disabled:opacity-50" aria-label="添加附件"><Paperclip className="h-5 w-5" /></button><input ref={attachmentInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.zip" className="hidden" onChange={(event) => void handleAttachmentChange(event)} /><textarea value={postText} onChange={(event) => setPostText(event.target.value)} rows={1} placeholder={isUploading ? "附件上传中…" : "发布项目动态..."} className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300" /><button onClick={() => void handlePost()} disabled={isUploading || (!postText.trim() && postAttachments.length === 0)} className="mb-0.5 rounded-full bg-indigo-600 p-2.5 text-white disabled:bg-slate-200" aria-label="发送"><Send className="h-5 w-5" /></button></div>
      </footer>
    </div>
  );
}
