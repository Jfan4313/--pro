function cleanWebhook(value) {
  return String(value || "").trim();
}

function markdownEscape(value) {
  return String(value || "").replace(/[<>]/g, "");
}

export function createWecomNotifier({ nowIso }) {
  const webhookUrl = cleanWebhook(process.env.WECOM_WEBHOOK_URL);
  const dailyHour = Number.isFinite(Number(process.env.WECOM_DAILY_REMINDER_HOUR))
    ? Math.min(23, Math.max(0, Number(process.env.WECOM_DAILY_REMINDER_HOUR)))
    : 9;
  let lastDailyReminderDate = "";

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
    if (!webhookUrl) return;
    const before = new Map((Array.isArray(previous) ? previous : []).map(item => [item.id, item]));
    const current = Array.isArray(next) ? next : [];
    const messages = [];
    current.forEach(item => {
      const old = before.get(item.id);
      if (!old) messages.push(`### 新工作安排\n${formatMemo(item)}\n>安排人：${markdownEscape(item.creator)}`);
      else if (old.status !== item.status && item.status === "feedback") messages.push(`### 收到执行反馈\n${formatMemo(item)}\n>反馈：${markdownEscape(item.feedback)}`);
      else if (old.status !== item.status && item.status === "confirmed") messages.push(`### 工作安排已完成\n${formatMemo(item)}`);
    });
    if (messages.length) void sendMarkdown(messages.slice(0, 5).join("\n\n"));
  }

  function startDailyReminder(getMemos) {
    if (!webhookUrl) return;
    const check = () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getHours() !== dailyHour || lastDailyReminderDate === today) return;
      const memos = getMemos();
      const unresolved = (Array.isArray(memos) ? memos : []).filter(item => item.status !== "confirmed");
      const overdue = unresolved.filter(item => item.dueDate < today);
      const waiting = unresolved.filter(item => item.status === "feedback");
      if (!overdue.length && !waiting.length) return;
      lastDailyReminderDate = today;
      const sections = [];
      if (overdue.length) sections.push(`**已逾期（${overdue.length}）**\n${overdue.slice(0, 10).map(formatMemo).join("\n")}`);
      if (waiting.length) sections.push(`**待确认反馈（${waiting.length}）**\n${waiting.slice(0, 10).map(formatMemo).join("\n")}`);
      void sendMarkdown(`## 工作备忘每日提醒\n>时间：${nowIso()}\n\n${sections.join("\n\n")}`);
    };
    check();
    return setInterval(check, 60 * 1000);
  }

  return {
    enabled: Boolean(webhookUrl),
    dailyHour,
    sendMarkdown,
    notifyMemoChange,
    startDailyReminder,
  };
}
