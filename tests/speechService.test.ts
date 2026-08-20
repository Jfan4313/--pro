import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildSpeechHotwords,
  cleanupExpiredAudio,
  correctTranscriptWithKnowledge,
  deletePrivateAudio,
  savePrivateAudio,
  transcribePrivateAudio,
} from "../server/domain/speechService.js";

function fakeDb(values: Record<string, unknown>) {
  return {
    prepare() {
      return { get(key: string) { return key in values ? { value: JSON.stringify(values[key]) } : undefined; } };
    },
  };
}

const glossary = [
  { id: "g-person", standardName: "张顺超", aliases: ["朝顺操"], category: "person", enabled: true },
  { id: "g-term", standardName: "整改通知书", aliases: ["整改通知"], category: "industry_term", enabled: true },
];

test("speech hotwords are built from safe company entities and glossary", () => {
  const db = fakeDb({
    personnelData: [{ id: "p1", name: "张顺超", phone: "13800000000", accountId: "u1" }],
    externalPartners: [{ id: "o1", name: "顺超公司", contact: "李越" }],
    suppliers: [],
    projectBoardData: [{ projects: [{ id: "project-1", name: "化万里轮胎", projectNumber: "H001" }] }],
  });
  const { hotwords } = buildSpeechHotwords(db as any, glossary as any);
  assert.ok(hotwords.some((item) => item.text === "化万里轮胎" && item.weight === 20));
  assert.ok(hotwords.some((item) => item.text === "张顺超"));
  assert.ok(hotwords.some((item) => item.text === "顺超公司"));
  assert.equal(JSON.stringify(hotwords).includes("13800000000"), false);
});

test("company aliases correct unique proper nouns and preserve ambiguity", () => {
  const result = correctTranscriptWithKnowledge("朝顺操确认整改通知", { projects: [], entities: [] }, glossary as any);
  assert.equal(result.correctedTranscript, "张顺超确认整改通知书");
  assert.equal(result.corrections.length, 2);

  const ambiguousGlossary = [
    { id: "a", standardName: "李越", aliases: ["李总"], category: "person", enabled: true },
    { id: "b", standardName: "李强", aliases: ["李总"], category: "person", enabled: true },
  ];
  const ambiguous = correctTranscriptWithKnowledge("让李总确认", { projects: [], entities: [] }, ambiguousGlossary as any);
  assert.equal(ambiguous.correctedTranscript, "让李总确认");
  assert.equal(ambiguous.ambiguousCorrections[0].candidates.length, 2);
});

test("private audio is company scoped, deleted on confirmation and expires after 24 hours", () => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhijian-audio-"));
  try {
    const saved = savePrivateAudio(audioDir, { filename: "task.webm", contentBase64: Buffer.from("audio").toString("base64"), mimeType: "audio/webm", durationMs: 1000, companyId: "company-a", userId: "u1" });
    assert.equal(deletePrivateAudio(audioDir, saved.audioId, "company-b"), false);
    assert.equal(deletePrivateAudio(audioDir, saved.audioId, "company-a"), true);

    const expired = savePrivateAudio(audioDir, { filename: "old.webm", contentBase64: Buffer.from("old").toString("base64"), mimeType: "audio/webm", durationMs: 1000, companyId: "company-a", userId: "u1" });
    const metadataPath = path.join(audioDir, `${expired.audioId}.json`);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    fs.writeFileSync(metadataPath, JSON.stringify({ ...metadata, createdAt: "2020-01-01T00:00:00.000Z" }));
    assert.equal(cleanupExpiredAudio(audioDir, Date.parse("2020-01-03T00:00:00.000Z")), 1);
  } finally {
    fs.rmSync(audioDir, { recursive: true, force: true });
  }
});

test("formal transcription always calls ASR and falls back to SenseVoice once", async () => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhijian-asr-"));
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.ASR_SERVICE_URL;
  const calls: string[] = [];
  process.env.ASR_SERVICE_URL = "http://asr.test";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const model = String((init?.body as FormData).get("model"));
    calls.push(model);
    if (calls.length === 1) return new Response(JSON.stringify({ detail: "primary failed" }), { status: 500, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ text: "朝顺操确认整改通知", durationMs: 1200 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const db = fakeDb({ personnelData: [], externalPartners: [], suppliers: [], projectBoardData: [] });
    const saved = savePrivateAudio(audioDir, { filename: "task.webm", contentBase64: Buffer.from("audio").toString("base64"), mimeType: "audio/webm", durationMs: 1000, companyId: "company-a", userId: "u1" });
    const result = await transcribePrivateAudio({ audioDir, audioId: saved.audioId, companyId: "company-a", browserTranscript: "浏览器错误文字", db: db as any, glossary: glossary as any });
    assert.deepEqual(calls, ["paraformer-zh", "sensevoice-small"]);
    assert.equal(result.model, "sensevoice-small");
    assert.equal(result.fallbackApplied, true);
    assert.equal(result.correctedTranscript, "张顺超确认整改通知书");
    assert.equal(result.browserTranscript, "浏览器错误文字");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.ASR_SERVICE_URL; else process.env.ASR_SERVICE_URL = originalUrl;
    fs.rmSync(audioDir, { recursive: true, force: true });
  }
});
