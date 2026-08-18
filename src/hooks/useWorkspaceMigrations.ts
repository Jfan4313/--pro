import { useEffect } from "react";
import { useAuth } from "@/src/lib/auth";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";

const DEMO_CHANNELS = [
  { id: "1", name: "全局公告", type: "announcement", unread: 2, members: ["所有人"] },
  { id: "2", name: "智建公司 - A区商业综合体", type: "project", unread: 0, members: ["张伟", "李娜", "王强"] },
  { id: "3", name: "智建公司 - B区住宅一期", type: "project", unread: 5, members: ["张伟", "陈杰"] },
];

const DEMO_POSTS = [
  { id: 1, channelId: "1", author: "张伟 (项目经理)", time: "今天 10:24", content: "A区商业综合体主体结构施工进度已达60%，请各班组注意安全规范，下午3点进行现场联合检查。", type: "announcement", attachments: [] },
  { id: 2, channelId: "2", author: "李娜 (安全员)", time: "今天 09:15", content: "上传了最新的《现场安全施工规范V2.0.pdf》，请所有新进场人员务必下载学习。", type: "document", attachments: [{ name: "现场安全施工规范V2.0.pdf", size: "2.4 MB", type: "pdf" }] },
  { id: 3, channelId: "3", author: "王强 (高级电工)", time: "昨天 16:30", content: "地下室二层桥架安装完毕，附上现场照片，请监理查验。", type: "update", attachments: [{ name: "现场照片_桥架.jpg", size: "1.1 MB", type: "image" }] },
];

const DEMO_TASKS = [
  { id: "t1", name: "方案深化与图纸审批", deadline: "2026-07-21", assignee: "陈杰" },
  { id: "t2", name: "设备招标及订单下达", deadline: "2026-07-22", assignee: "赵敏" },
  { id: "t3", name: "电房现场联合检查", deadline: "2026-07-20", assignee: "王强" },
  { id: "t4", name: "光伏支架测量复核", deadline: "2026-07-21", assignee: "李娜" },
];

function sameArray(a: unknown, b: unknown) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function isExactDemoPost(post: any) {
  return DEMO_POSTS.some((demo) => demo.id === post?.id
    && demo.channelId === post?.channelId
    && demo.author === post?.author
    && demo.time === post?.time
    && demo.content === post?.content
    && demo.type === post?.type
    && sameArray(demo.attachments, post?.attachments));
}

function isExactDemoChannel(channel: any) {
  return DEMO_CHANNELS.some((demo) => demo.id === channel?.id
    && demo.name === channel?.name
    && demo.type === channel?.type
    && demo.unread === channel?.unread
    && sameArray(demo.members, channel?.members)
    && !channel?.externalLinks?.length);
}

function isExactDemoTask(task: any) {
  return DEMO_TASKS.some((demo) => demo.id === task?.id
    && demo.name === String(task?.name || "").replace(/^.*：/, "")
    && demo.deadline === task?.deadline
    && demo.assignee === task?.assignee);
}

function removeGeneratedArchiveFiles(states: Record<string, any>) {
  let changed = false;
  const next = Object.fromEntries(Object.entries(states || {}).map(([projectId, projectState]) => [projectId, Object.fromEntries(
    Object.entries(projectState || {}).map(([stageId, stageState]: [string, any]) => {
      if (!Array.isArray(stageState?.files)) return [stageId, stageState];
      const files = stageState.files.filter((file: any) => {
        const generated = file?.isCustom === false && !file?.relativePath && file?.version === "V1" && String(file?.uploadTime || "").startsWith("2026-04-");
        if (generated) changed = true;
        return !generated;
      });
      return [stageId, files.length === stageState.files.length ? stageState : { ...stageState, files }];
    }),
  )]));
  return { changed, value: next };
}

export function useWorkspaceMigrations() {
  useProjectNumbering();
  const { user } = useAuth();
  const scope = user?.isDemo ? "demo" : user?.id || "anonymous";
  const [channels, setChannels, channelsLoading] = useSyncedAppData<any[]>("chatChannels", []);
  const [posts, setPosts, postsLoading] = useSyncedAppData<any[]>("chatPosts", []);
  const [schedule, setSchedule, scheduleLoading] = useSyncedAppData<any[]>("scheduleData", []);
  const [lifecycleStates, setLifecycleStates, lifecycleLoading] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [cleanupDone, setCleanupDone, cleanupLoading] = useSyncedAppData<boolean>(`demoDataCleanupV1:${scope}`, false);

  useEffect(() => {
    if (cleanupDone || channelsLoading || postsLoading || scheduleLoading || lifecycleLoading || cleanupLoading) return;

    const cleanedPosts = (Array.isArray(posts) ? posts : []).filter((post) => !isExactDemoPost(post));
    const channelsWithRealPosts = new Set(cleanedPosts.map((post) => String(post.channelId)));
    const cleanedChannels = (Array.isArray(channels) ? channels : []).filter((channel) => !isExactDemoChannel(channel) || channelsWithRealPosts.has(String(channel.id)));
    const cleanedSchedule = (Array.isArray(schedule) ? schedule : []).map((group) => ({
      ...group,
      tasks: (group.tasks || []).filter((task: any) => !isExactDemoTask(task)),
    })).filter((group) => (group.tasks || []).length > 0 || !["p1", "p2"].includes(String(group.id)));
    const cleanedLifecycle = removeGeneratedArchiveFiles(lifecycleStates || {});

    if (cleanedPosts.length !== posts.length) void setPosts(cleanedPosts);
    if (cleanedChannels.length !== channels.length) void setChannels(cleanedChannels);
    if (JSON.stringify(cleanedSchedule) !== JSON.stringify(schedule)) void setSchedule(cleanedSchedule);
    if (cleanedLifecycle.changed) void setLifecycleStates(cleanedLifecycle.value);
    void setCleanupDone(true);
  }, [channels, channelsLoading, cleanupDone, cleanupLoading, lifecycleLoading, lifecycleStates, posts, postsLoading, schedule, scheduleLoading]);
}
