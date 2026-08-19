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
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "测试任务", confidence: 0.9 }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    await ai.analyzeIntakeWithAI({ inputType: "text", text: "测试" }, { id: "user-1", companyId: "company-default" }, fakeDb);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][5], null);
    assert.equal(inserted[0][7], null);
    assert.equal(inserted[0][8], "success");

    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(() => ai.analyzeIntakeWithAI({ inputType: "text", text: "失败" }, { id: "user-1", companyId: "company-default" }, fakeDb));
    assert.equal(inserted.length, 2);
    assert.equal(inserted[1][8], "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
