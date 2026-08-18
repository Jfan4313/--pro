import { analyzeIntake } from "./intakeAnalysis.js";

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

export async function analyzeIntakeWithAI(payload) {
  const endpoint = env("AI_API_URL");
  const apiKey = env("AI_API_KEY");
  const model = env("AI_MODEL", "gpt-4o-mini");
  if (!endpoint || !apiKey) return analyzeIntake(payload);

  const prompt = `请从以下工作信息中提取任务，必须只返回 JSON：{"title":"","projectName":"","assignee":"","deadline":"YYYY-MM-DD","summary":"","confidence":0.0}。项目候选：${JSON.stringify(payload.projects || [])}。人员候选：${JSON.stringify(payload.personnel || [])}。输入类型：${payload.inputType}；文字：${payload.text || ""}；附件地址：${payload.attachmentUrl || ""}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: "system", content: "你是项目管理任务识别助手。" }, { role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(Number(env("AI_TIMEOUT_MS", "30000"))),
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || result.output_text || "";
  const parsed = extractJson(content);
  const project = (payload.projects || []).find((item) => item.id === parsed.projectId || item.name === parsed.projectName);
  return { title: String(parsed.title || "待办任务"), projectId: project?.id || parsed.projectId || "", projectName: project?.name || parsed.projectName || "", assignee: String(parsed.assignee || ""), deadline: String(parsed.deadline || ""), summary: String(parsed.summary || payload.text || ""), confidence: Number(parsed.confidence || 0.5), needsManualReview: Number(parsed.confidence || 0.5) < 0.75 };
}
