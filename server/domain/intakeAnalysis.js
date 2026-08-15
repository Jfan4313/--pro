function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, "");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDeadline(text = "") {
  const source = String(text);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (source.includes("今天")) return formatDate(today);
  if (source.includes("明天")) return formatDate(addDays(today, 1));
  if (source.includes("后天")) return formatDate(addDays(today, 2));

  const explicitDate = source.match(/(20\d{2})[-年./](\d{1,2})[-月./](\d{1,2})日?/);
  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDay = source.match(/(\d{1,2})月(\d{1,2})日?/);
  if (monthDay) {
    const [, month, day] = monthDay;
    return `${today.getFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const weekdayMatch = source.match(/(?:周|星期)([一二三四五六日天])/);
  if (weekdayMatch) {
    const map = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
    const target = map[weekdayMatch[1]];
    const current = today.getDay();
    let diff = target - current;
    if (diff <= 0) diff += 7;
    return formatDate(addDays(today, diff));
  }

  return "";
}

export function analyzeIntake({ inputType, text = "", attachmentUrl = "", projects = [], personnel = [] }) {
  const trimmed = String(text || "").trim();
  const normalized = normalizeText(trimmed);
  const project = projects.find((item) => {
    const name = normalizeText(item?.name || item?.projectName || "");
    if (!name) return false;
    const shortName = name.slice(0, 2);
    return normalized.includes(name) || (shortName.length >= 2 && normalized.includes(shortName));
  });
  const person = personnel.find((item) => {
    const name = normalizeText(item?.name || "");
    return name && normalized.includes(name);
  });
  const inferredAssignee = !person
    ? (String(text || "").match(/(?:安排|通知|协调|交给|让)([\u4e00-\u9fa5]{2,4})(?:去|到|负责|处理|跟进|检查|对接)/)?.[1] || "")
    : "";
  const deadline = parseLocalDeadline(trimmed);
  const titleSource = trimmed || (attachmentUrl ? "根据附件补充待办事项" : "");
  const title = titleSource.length > 40 ? `${titleSource.slice(0, 40)}...` : titleSource;
  const needsManualReview = inputType !== "text" || !project || !title;

  return {
    title,
    projectId: project?.id || "",
    projectName: project?.name || "",
    assignee: person?.name || inferredAssignee,
    deadline,
    summary: trimmed || (attachmentUrl ? `来源附件：${attachmentUrl}` : ""),
    confidence: inputType === "text" ? (project || person || deadline ? 0.55 : 0.25) : 0.1,
    needsManualReview,
  };
}
