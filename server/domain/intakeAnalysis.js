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

function cleanSpokenText(text = "") {
  return String(text).replace(/(^|[，,。；;\s])(嗯|呃|啊|那个|就是|然后呢)(?=$|[，,。；;\s])/gu, "$1").replace(/([，,。；;])\1+/g, "$1").replace(/\s+/g, " ").trim();
}

function parseDueTime(text = "") {
  const match = String(text).match(/(?:上午|早上|下午|晚上|傍晚)?\s*(\d{1,2})(?:点|[:：])(半|\d{1,2})?/u);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] === "半" ? 30 : Number(match[2] || 0);
  if (/(下午|晚上|傍晚)/u.test(text) && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function titleFor(part = "") {
  const withoutContext = String(part).replace(/^.*?(?:项目|工程)[，,：:\s]*/u, "").replace(/(?:今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]).*?(?=(让|由|安排|落实|确认|检查|提交|完成|处理|跟进|编制))/u, "");
  const action = withoutContext.match(/(确认|落实|检查|提交|完成|处理|跟进|编制|整理|修改|通知|协调|核对|制定|更新|补充)[^，,。；;]{1,24}/u)?.[0];
  return (action || withoutContext).replace(/^(让|由|安排)[^，,。；;]{1,12}(负责|去)?/u, "").trim().slice(0, 30);
}

export function analyzeIntake({ inputType, text = "", attachmentUrl = "", projects = [], personnel = [], entities = [] }) {
  const trimmed = String(text || "").trim();
  const cleanedTranscript = cleanSpokenText(trimmed);
  const normalized = normalizeText(cleanedTranscript);
  const projectMatches = projects.filter((item) => {
    const candidates = [item?.name, item?.projectName, item?.projectNumber, item?.code, item?.alias, ...(Array.isArray(item?.aliases) ? item.aliases : [])].map(normalizeText).filter(Boolean);
    return candidates.some((candidate) => candidate.length >= 2 && normalized.includes(candidate));
  });
  const project = projectMatches.length === 1 ? projectMatches[0] : null;
  const projectConflict = projectMatches.length > 1;
  const projectMentionRaw = String(text || "").match(/(?:新项目|项目|工程|标段)[：:\s]?([\u4e00-\u9fa5A-Za-z0-9_-]{2,30})/i)?.[1] || "";
  const projectMention = projectMentionRaw.replace(/(今天|明天|后天|让|安排|负责|去|到).*/u, "").trim();
  const projectName = project?.name || projectMention;
  const projectMatchType = project ? "existing" : (projectMention ? "new" : "unknown");
  const entityDirectory = entities.length ? entities : personnel.map((person) => ({ entityId: String(person.id || ""), entityType: "internal_person", name: person.name, notificationEligible: Boolean(person.accountId || person.loginEnabled), matchType: "existing", confidence: 1 }));
  const people = entityDirectory.filter((item) => {
    const name = normalizeText(item?.name || "");
    return name && normalized.includes(name);
  });
  const inferredAssignee = people.length === 0
    ? (String(text || "").match(/(?:安排|通知|协调|交给|让)([\u4e00-\u9fa5]{2,4})(?:和|、|及|去|到|负责|处理|跟进|检查|对接)/)?.[1] || "")
    : "";
  const deadline = parseLocalDeadline(trimmed);
  const titleSource = cleanedTranscript || (attachmentUrl ? "根据附件补充待办事项" : "");
  const title = titleSource.length > 40 ? `${titleSource.slice(0, 40)}...` : titleSource;
  const clauses = cleanedTranscript.split(/[。；;\n]+|(?:然后|另外|还有)|[，,](?=[^，,]{0,10}(?:让|由|安排|落实|确认|检查|提交|完成|处理|跟进|准备|编制|整理|修改))/u).map((part) => part.trim()).filter(Boolean);
  const backgroundNotes = clauses.filter((part) => /(已经?完成|完成了|已办结|无需再做)/u.test(part));
  const parts = clauses.filter((part) => !backgroundNotes.includes(part));
  const items = parts.map((part, index) => {
    const partPeople = people.filter((person) => normalizeText(part).includes(normalizeText(person?.name || "")));
    const matchedEntities = partPeople.length ? partPeople : people;
    const responsibleEntities = matchedEntities.map((entity) => ({ entityId: entity.entityId || entity.id || "", entityType: entity.entityType || "internal_person", name: entity.name, ...(entity.organizationId ? { organizationId: entity.organizationId } : {}), ...(entity.organizationName ? { organizationName: entity.organizationName } : {}), ...(entity.contactEntityId ? { contactEntityId: entity.contactEntityId } : {}), ...(entity.contactName ? { contactName: entity.contactName } : {}), matchType: entity.matchType || "existing", confidence: Number(entity.confidence ?? 0.8), notificationEligible: Boolean(entity.notificationEligible) }));
    const names = responsibleEntities.map((entity) => entity.name);
    const itemDeadline = parseLocalDeadline(part) || deadline;
    const reviewReasons = [...(!responsibleEntities.length ? ["缺少负责人"] : []), ...(!itemDeadline ? ["缺少截止日期"] : []), "AI不可用，已使用本地保守规则拆分"];
    return {
      id: `draft-${index + 1}`,
      title: titleFor(part),
      projectId: project?.id || "",
      projectName,
      projectMatchType,
      projectMatchConfidence: project ? 0.9 : projectMention ? 0.45 : 0,
      responsibleEntities,
      assignees: names.length ? names : (inferredAssignee ? [inferredAssignee] : []),
      assignee: names[0] || inferredAssignee,
      deadline: itemDeadline,
      dueTime: parseDueTime(part),
      summary: part,
      confidence: inputType === "text" ? (project || responsibleEntities.length || itemDeadline ? 0.55 : 0.25) : 0.1,
      needsManualReview: true,
      reviewReasons,
    };
  });

  return {
    title,
    projectId: project?.id || "",
    projectName,
    projectMatchType,
    projectMatchConfidence: project ? 0.9 : projectMention ? 0.45 : 0,
    projectCandidates: projectMatches.map((item) => ({ id: item.id, name: item.name, projectNumber: item.projectNumber || item.code || "" })),
    assignees: people.map((person) => person.name),
    assignee: people[0]?.name || inferredAssignee,
    deadline,
    summary: trimmed || (attachmentUrl ? `来源附件：${attachmentUrl}` : ""),
    confidence: inputType === "text" ? (project || people.length || deadline ? 0.55 : 0.25) : 0.1,
    needsManualReview: inputType !== "text" || !project || !title || projectConflict || items.some((item) => item.needsManualReview),
    transcript: trimmed,
    cleanedTranscript,
    backgroundNotes,
    skillVersion: "local-fallback-v1",
    reviewPassApplied: false,
    items,
  };
}
