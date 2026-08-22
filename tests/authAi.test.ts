import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhijian-ai-test-"));
process.env.AI_CONFIG_PATH = path.join(configDir, "ai-config.json");
const auth = await import("../server/auth.js");
const ai = await import("../server/domain/aiService.js");

test("role defaults expose settings to every role and accounts only to managers", () => {
  for (const role of Object.keys(auth.ROLE_PERMISSIONS)) {
    assert.ok(auth.ROLE_PERMISSIONS[role].includes("*") || auth.ROLE_PERMISSIONS[role].includes("settings"));
  }
  assert.ok(auth.ROLE_PERMISSIONS.company_admin.includes("accounts"));
  assert.equal(auth.ROLE_PERMISSIONS.project_manager.includes("accounts"), false);
  const customProjectManager = auth.permissionsForUser({ role: "project_manager", permissions: JSON.stringify(["accounts", "organization"]) });
  assert.ok(customProjectManager.includes("settings"));
  assert.equal(customProjectManager.includes("accounts"), false);
  assert.deepEqual(auth.permissionsForUser({ role: "admin", permissions: JSON.stringify(["dashboard"]) }), ["*"]);
  assert.ok(auth.permissionsForUser({ role: "company_admin", permissions: JSON.stringify(["dashboard"]) }).includes("accounts"));
});

test("company administrators can manage only lower roles in their company", () => {
  const companyAdmin = { id: "ca", role: "company_admin", companyId: "company-default" };
  assert.equal(auth.canAssignRole(companyAdmin, "project_manager"), true);
  assert.equal(auth.canAssignRole(companyAdmin, "company_admin"), false);
  assert.equal(auth.canAssignRole(companyAdmin, "admin"), false);
  assert.equal(auth.canManageAccount(companyAdmin, { id: "pm", role: "project_manager", companyId: "company-default" }), true);
  assert.equal(auth.canManageAccount(companyAdmin, { id: "other", role: "project_manager", companyId: "other-company" }), false);
  assert.equal(auth.canManageAccount(companyAdmin, { id: "peer", role: "company_admin", companyId: "company-default" }), false);
  assert.equal(auth.canManageAccount(companyAdmin, companyAdmin), false);
});

test("system administrators can assign all known roles and manage other accounts", () => {
  const admin = { id: "root", role: "admin", companyId: "company-default" };
  assert.equal(auth.canAssignRole(admin, "company_admin"), true);
  assert.equal(auth.canAssignRole(admin, "unknown"), false);
  assert.equal(auth.canManageAccount(admin, { id: "ca", role: "company_admin", companyId: "other-company" }), true);
  assert.equal(auth.canManageAccount(admin, admin), false);
});

test("AI usage normalization supports common provider response shapes", () => {
  assert.deepEqual(ai.normalizeAIUsage({ usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }), { inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  assert.deepEqual(ai.normalizeAIUsage({ usage: { input_tokens: 8, output_tokens: 3 } }), { inputTokens: 8, outputTokens: 3, totalTokens: 11 });
  assert.deepEqual(ai.normalizeAIUsage({}), { inputTokens: null, outputTokens: null, totalTokens: null });
});

test("DeepSeek-compatible endpoints accept base URLs and full chat paths", () => {
  assert.equal(ai.resolveChatCompletionsEndpoint("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
  assert.equal(ai.resolveChatCompletionsEndpoint("https://api.deepseek.com/"), "https://api.deepseek.com/chat/completions");
  assert.equal(ai.resolveChatCompletionsEndpoint("https://api.deepseek.com/chat/completions"), "https://api.deepseek.com/chat/completions");
});

test("company AI configuration keeps keys secret and supports explicit clearing", () => {
  const saved = ai.updateAIConfig("company-default", { endpoint: "https://example.test/v1/chat/completions", model: "test-model", apiKey: "secret-key", timeoutMs: 9000 });
  assert.equal(saved.hasKey, true);
  assert.equal((saved as any).apiKey, undefined);
  assert.equal(saved.configured, true);
  const persisted = JSON.parse(fs.readFileSync(process.env.AI_CONFIG_PATH!, "utf8"));
  assert.equal(persisted.companies["company-default"].apiKey, "secret-key");
  const cleared = ai.updateAIConfig("company-default", { clearApiKey: true });
  assert.equal(cleared.hasKey, false);
  assert.equal(cleared.configured, false);
});

test("remote AI calls record successful and failed usage events without estimating missing tokens", async () => {
  ai.updateAIConfig("company-default", { endpoint: "https://example.test/v1/chat/completions", model: "usage-model", apiKey: "secret-key", timeoutMs: 9000 });
  const inserted: unknown[][] = [];
  const fakeDb = { prepare: () => ({ run: (...args: unknown[]) => inserted.push(args) }) };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ cleanedTranscript: "测试", backgroundNotes: [], items: [{ title: "执行测试", summary: "测试", confidence: 0.9 }] }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    await ai.analyzeIntakeWithAI({ inputType: "text", text: "测试" }, { id: "user-1", companyId: "company-default" }, fakeDb);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][5], null);
    assert.equal(inserted[0][7], null);
    assert.equal(inserted[0][8], "success");

    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    const fallback = await ai.analyzeIntakeWithAI({ inputType: "text", text: "失败" }, { id: "user-1", companyId: "company-default" }, fakeDb);
    assert.equal(fallback.skillVersion, "local-fallback-v1");
    assert.equal(inserted.length, 2);
    assert.equal(inserted[1][8], "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("company intake glossary is normalized and persisted separately from public AI config", () => {
  const entries = ai.updateAIEntityGlossary("company-default", [{ standardName: "化万里轮胎", aliases: ["化万里", "化万里"], category: "project", enabled: true }]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].aliases, ["化万里"]);
  assert.equal((ai.getAIConfig("company-default") as any).intakeGlossary, undefined);
  assert.deepEqual(ai.getAIEntityGlossary("company-default"), entries);
});

test("work instruction agent separates completed background and resolves multiple responsible entities", async () => {
  ai.updateAIConfig("company-default", { endpoint: "https://example.test/v1/chat/completions", model: "agent-model", apiKey: "secret-key", timeoutMs: 9000 });
  const appData: Record<string, unknown> = {
    personnelData: [{ id: "p1", name: "张顺超", accountId: "u1" }, { id: "p2", name: "李越", accountId: "u2" }],
    externalPartners: [{ id: "o1", name: "顺超公司", contact: "王工" }],
    suppliers: [],
    projectBoardData: [{ projects: [{ id: "project-1", name: "化万里轮胎" }] }],
  };
  const recorded: unknown[][] = [];
  const fakeDb = { prepare: (sql: string) => ({
    get: (key: string) => sql.includes("app_data") && key in appData ? { value: JSON.stringify(appData[key]) } : undefined,
    run: (...args: unknown[]) => recorded.push(args),
  }) };
  const aiPayload = { cleanedTranscript: "化万里轮胎项目：确认事故分析报告和整改通知书；顺超公司落实各区域应急预案。", backgroundNotes: ["数据库已经完成了"], items: [
    { title: "确认事故分析报告和整改通知书", summary: "明天下午三点前确认", projectName: "化万里轮胎", responsibleEntities: [{ name: "张顺超" }, { name: "李越" }], deadline: "2026-08-21", dueTime: "15:00", confidence: 0.95 },
    { title: "落实各区域应急预案", summary: "周五前落实开关位置和负责人", projectName: "化万里轮胎", responsibleEntities: [{ name: "顺超公司" }], deadline: "2026-08-21", confidence: 0.9 },
  ] };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "create_work_memo_draft", arguments: JSON.stringify(aiPayload) } }] } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    const result = await ai.analyzeIntakeWithAI({ inputType: "text", text: "嗯，化万里轮胎这个项目，事故报告，不是，只要事故分析报告和整改通知书，明天下午三点前让张顺超、李越确认。数据库已经完成了。然后周五前让顺超公司落实各区域应急预案里的开关位置和负责人。" }, { id: "user-1", companyId: "company-default" }, fakeDb);
    assert.equal(result.reviewPassApplied, true);
    assert.deepEqual(result.backgroundNotes, ["数据库已经完成了"]);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items[0].assignees, ["张顺超", "李越"]);
    assert.equal(result.items[1].responsibleEntities.length, 0);
    assert.equal(result.items[1].assignees.length, 0);
    assert.equal(result.items[0].projectMatchType, "existing");
  } finally { globalThis.fetch = originalFetch; }
});

test("AI connection debug reuses the saved company key when the form key is blank", async () => {
  ai.updateAIConfig("company-default", { endpoint: "https://example.test/v1/chat/completions", model: "debug-model", apiKey: "saved-company-key", timeoutMs: 9000 });
  const originalFetch = globalThis.fetch;
  let authorization = "";
  try {
    globalThis.fetch = async (_input, init) => {
      authorization = new Headers(init?.headers).get("Authorization") || "";
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "调试测试", deadline: "2026-08-20", confidence: 0.9 }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await ai.debugAI(
      { id: "user-1", companyId: "company-default" },
      null,
      { endpoint: "https://example.test/v1/chat/completions", model: "debug-model", apiKey: "", timeoutMs: 9000 },
    );
    assert.equal(result.ok, true);
    assert.equal(authorization, "Bearer saved-company-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(() => fs.rmSync(configDir, { recursive: true, force: true }));
