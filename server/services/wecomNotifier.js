function cleanWebhook(value) {
  return String(value || "").trim();
}

function markdownEscape(value) {
  return String(value || "").replace(/[<>]/g, "");
}

export function createWecomNotifier({ nowIso }) {
  const webhookUrl = cleanWebhook(process.env.WECOM_WEBHOOK_URL);
  const morningHour = Number.isFinite(Number(process.env.WECOM_DAILY_REMINDER_HOUR))
    ? Math.min(23, Math.max(0, Number(process.env.WECOM_DAILY_REMINDER_HOUR)))
    : 9;
  const eveningHour = Number.isFinite(Number(process.env.WECOM_DAILY_SUMMARY_HOUR))
    ? Math.min(23, Math.max(0, Number(process.env.WECOM_DAILY_SUMMARY_HOUR)))
    : 18;
  let lastMorningDate = "";
  let lastEveningDate = "";

  async function sendMarkdown(content) {
    if (!webhookUrl) return { enabled: false };
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.errcode) {
        console.warn("WeCom notification failed", result.errmsg || response.statusText);
        return { enabled: true, ok: false, error: result.errmsg || response.statusText };
      }
      return { enabled: true, ok: true };
    } catch (error) {
      console.warn("WeCom notification unavailable", error.message);
      return { enabled: true, ok: false, error: error.message };
    }
  }

  function formatMemo(item) {
    const priority = item.priority === "high" ? "【重要】" : "";
    return `${priority}${markdownEscape(item.title)}\n>负责人：${markdownEscape(item.assignee)}\n>截止：${markdownEscape(item.dueDate)}`;
  }

  function notifyMemoChange(previous = [], next = []) {
    // Task changes are intentionally batched into the fixed 18:00/09:00 digests.
    // Keep this hook for compatibility with the app-data route.
  }

  function buildDigest(memos, mode, now) {
    const today = now.toISOString().slice(0, 10);
    const current = Array.isArray(memos) ? memos : [];
    const unresolved = current.filter(item => item.status !== "confirmed");
    const todayItems = current.filter(item => item.createdAt?.slice?.(0, 10) === today || item.updatedAt?.slice?.(0, 10) === today);
    const dueToday = unresolved.filter(item => item.dueDate === today);
    const overdue = unresolved.filter(item => item.dueDate && item.dueDate < today);
    const completedToday = current.filter(item => item.status === "confirmed" && item.confirmedAt?.slice?.(0, 10) === today);
    const items = mode === "evening" ? todayItems : [...dueToday, ...overdue, ...unresolved.filter(item => !dueToday.includes(item) && !overdue.includes(item))];
    const unique = Array.from(new Map(items.map(item => [item.id, item])).values());
    const sections = [];
    if (mode === "evening" && todayItems.length) sections.push(`**今日新增/调整（${todayItems.length}）**\n${todayItems.slice(0, 12).map(formatMemo).join("\n")}`);
    if (completedToday.length) sections.push(`**今日已完成（${completedToday.length}）**\n${completedToday.slice(0, 12).map(formatMemo).join("\n")}`);
    if (dueToday.length) sections.push(`**今日待处理（${dueToday.length}）**\n${dueToday.slice(0, 12).map(formatMemo).join("\n")}`);
    if (overdue.length) sections.push(`**已逾期（${overdue.length}）**\n${overdue.slice(0, 12).map(formatMemo).join("\n")}`);
    if (mode === "morning" && unique.length && !sections.some(section => section.includes("今日待处理"))) sections.push(`**未完成任务（${unique.length}）**\n${unique.slice(0, 12).map(formatMemo).join("\n")}`);
    return { today, title: mode === "evening" ? "今日任务总结" : "今日任务提醒", sections, count: unique.length + completedToday.length, items: unique };
  }

  function startScheduledDigest(getMemos, onDigest) {
    const check = () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const memos = getMemos();
      if (now.getHours() === eveningHour && lastEveningDate !== today) {
        lastEveningDate = today;
        const digest = buildDigest(memos, "evening", now);
        if (digest.sections.length) { void sendMarkdown(`## 今日任务总结\n>时间：${nowIso()}\n\n${digest.sections.join("\n\n")}`); onDigest?.({ ...digest, mode: "evening" }); }
      }
      if (now.getHours() === morningHour && lastMorningDate !== today) {
        lastMorningDate = today;
        const digest = buildDigest(memos, "morning", now);
        if (digest.sections.length) { void sendMarkdown(`## 今日任务提醒\n>时间：${nowIso()}\n\n${digest.sections.join("\n\n")}`); onDigest?.({ ...digest, mode: "morning" }); }
      }
    };
    check();
    return setInterval(check, 60 * 1000);
  }

  return {
    enabled: Boolean(webhookUrl),
    dailyHour: morningHour,
    morningHour,
    eveningHour,
    sendMarkdown,
    notifyMemoChange,
    startScheduledDigest,
  };
}
