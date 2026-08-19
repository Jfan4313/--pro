import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { analyzeIntake } from "./intakeAnalysis.js";

const configPath = process.env.AI_CONFIG_PATH || path.resolve("data", "ai-config.json");
let runtimeConfig = {};
try { runtimeConfig = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { runtimeConfig = {}; }

function env(name, fallback = "") { return String(process.env[name] || fallback).trim(); }

function persistConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch { /* Best effort on platforms without POSIX modes. */ }
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

export async function analyzeIntakeWithAI(payload, actor = {}, db = null) {
  const companyId = actor.companyId || "company-default";
  const userId = actor.id || "admin-local";
  const config = getAIConfig(companyId);
  const apiKey = companyConfig(companyId).apiKey || env("AI_API_KEY");
  if (!config.endpoint || !apiKey) return analyzeIntake(payload);

  const startedAt = Date.now();
  const prompt = `请从以下工作信息中提取任务，必须只返回 JSON：{"title":"","projectName":"","assignee":"","deadline":"YYYY-MM-DD","summary":"","confidence":0.0}。项目候选：${JSON.stringify(payload.projects || [])}。人员候选：${JSON.stringify(payload.personnel || [])}。输入类型：${payload.inputType}；文字：${payload.text || ""}；附件地址：${payload.attachmentUrl || ""}`;
  try {
    const response = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: config.model, temperature: 0.1, messages: [{ role: "system", content: "你是项目管理任务识别助手。" }, { role: "user", content: prompt }] }), signal: AbortSignal.timeout(config.timeoutMs) });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const result = await response.json();
    const usage = normalizeAIUsage(result);
    const content = result.choices?.[0]?.message?.content || result.output_text || "";
    const parsed = extractJson(content);
    recordUsage(db, { companyId, userId, feature: "intake_analysis", model: config.model, ...usage, status: "success", durationMs: Date.now() - startedAt });
    const project = (payload.projects || []).find((item) => item.id === parsed.projectId || item.name === parsed.projectName);
    return { title: String(parsed.title || "待办任务"), projectId: project?.id || parsed.projectId || "", projectName: project?.name || parsed.projectName || "", assignee: String(parsed.assignee || ""), deadline: String(parsed.deadline || ""), summary: String(parsed.summary || payload.text || ""), confidence: Number(parsed.confidence || 0.5), needsManualReview: Number(parsed.confidence || 0.5) < 0.75 };
  } catch (error) {
    const status = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "error";
    recordUsage(db, { companyId, userId, feature: "intake_analysis", model: config.model, inputTokens: null, outputTokens: null, totalTokens: null, status, durationMs: Date.now() - startedAt });
    throw error;
  }
}
