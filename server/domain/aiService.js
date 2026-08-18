import fs from "node:fs";
import path from "node:path";
import { analyzeIntake } from "./intakeAnalysis.js";

const configPath = process.env.AI_CONFIG_PATH || path.resolve("data", "ai-config.json");
let runtimeConfig = {};
try { runtimeConfig = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { runtimeConfig = {}; }

function userConfig(userId) { return runtimeConfig.users?.[userId] || runtimeConfig; }
export function getAIConfig(userId = "default") { const config = userConfig(userId); return { endpoint: config.endpoint || process.env.AI_API_URL || "", model: config.model || process.env.AI_MODEL || "gpt-4o-mini", hasKey: Boolean(config.apiKey || process.env.AI_API_KEY), timeoutMs: Number(config.timeoutMs || process.env.AI_TIMEOUT_MS || 30000) }; }
export function updateAIConfig(userId, next) {
  runtimeConfig = { ...runtimeConfig, users: { ...(runtimeConfig.users || {}), [userId]: { ...userConfig(userId), endpoint: String(next.endpoint || "").trim(), model: String(next.model || "gpt-4o-mini").trim(), timeoutMs: Number(next.timeoutMs || 30000) } } };
  if (next.apiKey) runtimeConfig.users[userId].apiKey = String(next.apiKey).trim();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), { mode: 0o600 });
  return getAIConfig();
}

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function extractJson(text) {
  const raw = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned invalid JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function analyzeIntakeWithAI(payload, userId = "default") {
  const config = getAIConfig(userId);
  const endpoint = config.endpoint;
  const apiKey = userConfig(userId).apiKey || env("AI_API_KEY");
  const model = config.model;
  if (!endpoint || !apiKey) return analyzeIntake(payload);

  const prompt = `请从以下工作信息中提取任务，必须只返回 JSON：{"title":"","projectName":"","assignee":"","deadline":"YYYY-MM-DD","summary":"","confidence":0.0}。项目候选：${JSON.stringify(payload.projects || [])}。人员候选：${JSON.stringify(payload.personnel || [])}。输入类型：${payload.inputType}；文字：${payload.text || ""}；附件地址：${payload.attachmentUrl || ""}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: "system", content: "你是项目管理任务识别助手。" }, { role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || result.output_text || "";
  const parsed = extractJson(content);
  const project = (payload.projects || []).find((item) => item.id === parsed.projectId || item.name === parsed.projectName);
  return { title: String(parsed.title || "待办任务"), projectId: project?.id || parsed.projectId || "", projectName: project?.name || parsed.projectName || "", assignee: String(parsed.assignee || ""), deadline: String(parsed.deadline || ""), summary: String(parsed.summary || payload.text || ""), confidence: Number(parsed.confidence || 0.5), needsManualReview: Number(parsed.confidence || 0.5) < 0.75 };
}
