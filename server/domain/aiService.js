import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeIntake } from "./intakeAnalysis.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = process.env.LOCAL_DATA_DIR ? path.resolve(process.env.LOCAL_DATA_DIR) : path.join(projectRoot, "data");
const configPath = process.env.AI_CONFIG_PATH || path.join(dataDir, "ai-config.json");
let runtimeConfig = {};
try { runtimeConfig = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { runtimeConfig = {}; }

function env(name, fallback = "") { return String(process.env[name] || fallback).trim(); }

function persistConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(runtimeConfig, null, 2), { mode: 0o600 });
    try { fs.chmodSync(temporaryPath, 0o600); } catch { /* Best effort on platforms without POSIX modes. */ }
    fs.renameSync(temporaryPath, configPath);
    try { fs.chmodSync(configPath, 0o600); } catch { /* Best effort on platforms without POSIX modes. */ }
  } catch (error) {
    error.message = `无法写入 AI 配置文件 ${configPath}: ${error.message}`;
    throw error;
  }
}

function migrateLegacyConfig() {
  if (runtimeConfig.companies?.["company-default"]) return;
  const legacy = runtimeConfig.users?.["admin-local"] || (runtimeConfig.endpoint || runtimeConfig.apiKey ? runtimeConfig : null);
  if (!legacy) return;
  runtimeConfig = { ...runtimeConfig, companies: { ...(runtimeConfig.companies || {}), "company-default": { ...legacy, updatedAt: legacy.updatedAt || new Date().toISOString() } } };
  delete runtimeConfig.users;
  persistConfig();
}

migrateLegacyConfig();

function companyConfig(companyId = "company-default") { return runtimeConfig.companies?.[companyId] || {}; }

export function getAIKey(companyId = "company-default") {
  return companyConfig(companyId).apiKey || env("AI_API_KEY");
}

export function resolveChatCompletionsEndpoint(endpoint) {
  const normalized = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

export function getAIConfig(companyId = "company-default") {
  const config = companyConfig(companyId);
  const endpoint = config.endpoint || env("AI_API_URL");
  const hasKey = Boolean(config.apiKey || env("AI_API_KEY"));
  return { endpoint, model: config.model || env("AI_MODEL", "gpt-4o-mini"), hasKey, configured: Boolean(endpoint && hasKey), timeoutMs: Number(config.timeoutMs || env("AI_TIMEOUT_MS", "30000")), updatedAt: config.updatedAt || null };
}

export function updateAIConfig(companyId, next) {
  const current = companyConfig(companyId);
  const updated = {
    ...current,
    endpoint: String(next.endpoint ?? current.endpoint ?? "").trim(),
    model: String(next.model ?? current.model ?? "gpt-4o-mini").trim() || "gpt-4o-mini",
    timeoutMs: Math.max(5000, Math.min(120000, Number(next.timeoutMs || current.timeoutMs || 30000))),
    updatedAt: new Date().toISOString(),
  };
  if (String(next.apiKey || "").trim()) updated.apiKey = String(next.apiKey).trim();
  if (next.clearApiKey === true) delete updated.apiKey;
  runtimeConfig = { ...runtimeConfig, companies: { ...(runtimeConfig.companies || {}), [companyId]: updated } };
  persistConfig();
  return getAIConfig(companyId);
}

function extractJson(text) {
  const raw = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned invalid JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

function finiteToken(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export function resolveTranscriptionEndpoint(endpoint) {
  const normalized = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (/\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/chat\/completions$/i, "/audio/transcriptions");
  if (/\/v1$/i.test(normalized)) return `${normalized}/audio/transcriptions`;
  return `${normalized}/audio/transcriptions`;
}

export async function transcribeAudio(filePath, config, apiKey) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("model", env("AI_TRANSCRIBE_MODEL", "whisper-1"));
  form.append("language", "zh");
  const response = await fetch(resolveTranscriptionEndpoint(config.endpoint), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Audio transcription failed: ${response.status}${detail ? ` - ${detail}` : ""}`);
  }
  const result = await response.json();
  return String(result.text || result.transcript || "").trim();
}

export function normalizeAIUsage(result) {
  const usage = result?.usage || result?.response?.usage || {};
  const inputTokens = finiteToken(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = finiteToken(usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens);
  const reportedTotal = finiteToken(usage.total_tokens ?? usage.totalTokens);
  return { inputTokens, outputTokens, totalTokens: reportedTotal ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null) };
}

function recordUsage(db, event) {
  if (!db) return;
  db.prepare(`INSERT INTO ai_usage_events (id, companyId, userId, feature, model, inputTokens, outputTokens, totalTokens, status, durationMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), event.companyId, event.userId, event.feature, event.model, event.inputTokens, event.outputTokens, event.totalTokens, event.status, event.durationMs, new Date().toISOString());
}

export async function analyzeIntakeWithAI(payload, actor = {}, db = null, aiOverride = null) {
  const companyId = actor.companyId || "company-default";
  const userId = actor.id || "admin-local";
  const config = aiOverride ? { ...getAIConfig(companyId), endpoint: String(aiOverride.endpoint || "").trim(), model: String(aiOverride.model || "gpt-4o-mini").trim() || "gpt-4o-mini", timeoutMs: Math.max(5000, Math.min(120000, Number(aiOverride.timeoutMs || 30000))), hasKey: Boolean(aiOverride.apiKey) } : getAIConfig(companyId);
  const apiKey = aiOverride ? String(aiOverride.apiKey || "").trim() : getAIKey(companyId);
  if (!config.endpoint || !apiKey) return analyzeIntake(payload);

  const startedAt = Date.now();
  let sourceText = String(payload.text || "");
  if (payload.inputType === "audio" && payload.attachmentPath) {
    try { sourceText = await transcribeAudio(payload.attachmentPath, config, apiKey); } catch (error) { console.warn("Audio transcription unavailable:", error.message); }
  }
  const prompt = `请从以下工作信息中提取一个或多个任务，必须只返回 JSON，不要 Markdown。格式：{"transcript":"","items":[{"title":"","summary":"","projectId":"","projectName":"","projectMatchType":"existing|new|unknown","assigneeIds":[],"assignees":[],"deadline":"YYYY-MM-DD","dueTime":"HH:mm","confidence":0.0}]}. 如果项目候选中能匹配全称、简称、编号、别名，projectMatchType 必须为 existing 并返回 projectId；否则如果说出了一个项目名称，标记 new；完全没有项目线索则标记 unknown。人员只能从候选人员中选择。项目候选：${JSON.stringify(payload.projects || [])}。人员候选：${JSON.stringify(payload.personnel || [])}。输入类型：${payload.inputType}；文字：${sourceText}；附件地址：${payload.attachmentUrl || ""}`;
  try {
    const response = await fetch(resolveChatCompletionsEndpoint(config.endpoint), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: config.model, temperature: 0.1, messages: [{ role: "system", content: "你是项目管理任务识别助手。" }, { role: "user", content: prompt }] }), signal: AbortSignal.timeout(config.timeoutMs) });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`AI request failed: ${response.status}${detail ? ` - ${detail}` : ""}`);
    }
    const result = await response.json();
    const usage = normalizeAIUsage(result);
    const content = result.choices?.[0]?.message?.content || result.output_text || "";
    const parsed = extractJson(content);
    recordUsage(db, { companyId, userId, feature: "intake_analysis", model: config.model, ...usage, status: "success", durationMs: Date.now() - startedAt });
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const personnel = Array.isArray(payload.personnel) ? payload.personnel : [];
    const normalizeItem = (item = {}, index = 0) => {
      const project = projects.find((candidate) => candidate.id === item.projectId || candidate.name === item.projectName || candidate.projectNumber === item.projectName || candidate.code === item.projectName);
      const people = (Array.isArray(item.assigneeIds) ? item.assigneeIds : []).map((id) => personnel.find((person) => String(person.id) === String(id))).filter(Boolean);
      const names = Array.from(new Set([...(Array.isArray(item.assignees) ? item.assignees : []), ...people.map((person) => person.name)].filter(Boolean)));
      return {
        id: `draft-${index + 1}`,
        title: String(item.title || "待办任务"),
        summary: String(item.summary || item.title || payload.text || ""),
        projectId: project?.id || String(item.projectId || ""),
        projectName: project?.name || String(item.projectName || ""),
        projectMatchType: ["existing", "new", "unknown"].includes(item.projectMatchType) ? item.projectMatchType : (project ? "existing" : item.projectName ? "new" : "unknown"),
        projectMatchConfidence: Number(item.projectMatchConfidence || (project ? 0.9 : item.projectName ? 0.45 : 0)),
        assignees: names,
        assignee: names[0] || "",
        assigneeIds: people.map((person) => person.id),
        deadline: String(item.deadline || ""),
        dueTime: String(item.dueTime || ""),
        confidence: Number(item.confidence || 0.5),
        needsManualReview: Number(item.confidence || 0.5) < 0.75 || !item.deadline || names.length === 0,
      };
    };
    const items = (Array.isArray(parsed.items) && parsed.items.length ? parsed.items : [parsed]).map(normalizeItem);
    const first = items[0] || normalizeItem({}, 0);
    return { ...first, summary: String(parsed.transcript || parsed.summary || first.summary || sourceText || ""), transcript: String(parsed.transcript || sourceText || ""), items, needsManualReview: items.some((item) => item.needsManualReview) };
  } catch (error) {
    const status = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "error";
    recordUsage(db, { companyId, userId, feature: "intake_analysis", model: config.model, inputTokens: null, outputTokens: null, totalTokens: null, status, durationMs: Date.now() - startedAt });
    // Keep a successfully uploaded recording usable when the remote AI or
    // transcription provider is temporarily unavailable. The confirmation
    // screen can then be completed manually instead of losing the audio.
    if (payload.inputType === "audio") {
      return analyzeIntake({ ...payload, text: sourceText });
    }
    throw error;
  }
}

export async function debugAI(actor = {}, db = null, aiOverride = null) {
  const companyId = actor.companyId || "company-default";
  const storedConfig = getAIConfig(companyId);
  const suppliedApiKey = String(aiOverride?.apiKey || "").trim();
  const effectiveApiKey = suppliedApiKey || getAIKey(companyId);
  const config = aiOverride ? {
    ...storedConfig,
    endpoint: String(aiOverride.endpoint ?? storedConfig.endpoint ?? "").trim(),
    model: String(aiOverride.model ?? storedConfig.model ?? "gpt-4o-mini").trim() || "gpt-4o-mini",
    timeoutMs: Math.max(5000, Math.min(120000, Number(aiOverride.timeoutMs || storedConfig.timeoutMs || 30000))),
    hasKey: Boolean(effectiveApiKey),
  } : storedConfig;
  const startedAt = Date.now();
  if (!config.endpoint || !config.hasKey) {
    return { ok: false, stage: "config", model: config.model, endpoint: config.endpoint, configured: false, message: "AI 地址或 API Key 未配置" };
  }
  try {
    const effectiveOverride = aiOverride ? { endpoint: config.endpoint, model: config.model, timeoutMs: config.timeoutMs, apiKey: effectiveApiKey } : null;
    const result = await analyzeIntakeWithAI({ inputType: "text", text: "请生成一个标题为调试测试的任务，截止日期为明天。", projects: [], personnel: [] }, actor, db, effectiveOverride);
    return { ok: true, stage: "chat_completions", model: config.model, endpoint: config.endpoint, configured: true, durationMs: Date.now() - startedAt, result: { title: result.title, deadline: result.deadline } };
  } catch (error) {
    return { ok: false, stage: "chat_completions", model: config.model, endpoint: config.endpoint, configured: true, durationMs: Date.now() - startedAt, message: error?.message || "AI 请求失败" };
  }
}
