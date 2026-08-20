import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCompanyKnowledge } from "./companyEntities.js";

const execFileAsync = promisify(execFile);

const AUDIO_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_AUDIO_BYTES = Number(process.env.ASR_MAX_AUDIO_BYTES || 20 * 1024 * 1024);
const MAX_HOTWORDS = Number(process.env.ASR_MAX_HOTWORDS || 500);

const normalize = (value = "") => String(value).trim().toLowerCase().replace(/[\s·•（）()_-]+/g, "");
const unique = (values = []) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

export function getSpeechConfig(overrides = {}, includeSecrets = false) {
  const provider = String(process.env.ASR_PROVIDER || "funasr").trim().toLowerCase();
  const endpoint = String(process.env.ASR_SERVICE_URL || "http://127.0.0.1:8790").replace(/\/+$/, "");
  const doubaoKey = String(process.env.DOUBAO_API_KEY || "").trim();
  const doubaoAppKey = String(process.env.DOUBAO_APP_KEY || "").trim();
  const doubaoAccessKey = String(process.env.DOUBAO_ACCESS_KEY || "").trim();
  const result = {
    provider: provider === "doubao" ? "doubao" : "funasr",
    endpoint,
    primaryModel: String(process.env.ASR_PRIMARY_MODEL || "paraformer-zh"),
    fallbackModel: String(process.env.ASR_FALLBACK_MODEL || "sensevoice-small"),
    timeoutMs: Math.max(5000, Math.min(180000, Number(process.env.ASR_TIMEOUT_MS || 90000))),
    doubaoEndpoint: String(process.env.DOUBAO_ASR_URL || "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash").trim(),
    doubaoConfigured: Boolean(doubaoKey || (doubaoAppKey && doubaoAccessKey)),
    doubaoHotwordTableId: String(process.env.DOUBAO_HOTWORD_TABLE_ID || "").trim(),
  };
  if (includeSecrets) Object.assign(result, { doubaoKey, doubaoAppKey, doubaoAccessKey });
  const safeOverrides = { ...overrides };
  if (!includeSecrets) { delete safeOverrides.doubaoKey; delete safeOverrides.doubaoAppKey; delete safeOverrides.doubaoAccessKey; }
  return { ...result, ...safeOverrides, doubaoConfigured: includeSecrets ? Boolean(overrides.doubaoKey || overrides.doubaoAppKey && overrides.doubaoAccessKey || doubaoKey || doubaoAppKey && doubaoAccessKey) : Boolean(overrides.doubaoConfigured ?? result.doubaoConfigured) };
}

function safeExtension(filename = "", mimeType = "") {
  const extension = path.extname(String(filename)).toLowerCase();
  if ([".webm", ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".mp4"].includes(extension)) return extension;
  if (/wav/i.test(mimeType)) return ".wav";
  if (/mpeg|mp3/i.test(mimeType)) return ".mp3";
  if (/mp4|m4a/i.test(mimeType)) return ".m4a";
  if (/ogg/i.test(mimeType)) return ".ogg";
  return ".webm";
}

function metadataPath(audioDir, audioId) { return path.join(audioDir, `${audioId}.json`); }

function readMetadata(audioDir, audioId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(audioId || ""))) return null;
  try { return JSON.parse(fs.readFileSync(metadataPath(audioDir, audioId), "utf8")); } catch { return null; }
}

function writeMetadata(audioDir, metadata) {
  fs.writeFileSync(metadataPath(audioDir, metadata.audioId), JSON.stringify(metadata, null, 2), { mode: 0o600 });
}

export function cleanupExpiredAudio(audioDir, now = Date.now()) {
  fs.mkdirSync(audioDir, { recursive: true, mode: 0o750 });
  let removed = 0;
  for (const name of fs.readdirSync(audioDir).filter((entry) => entry.endsWith(".json"))) {
    const audioId = name.slice(0, -5);
    const metadata = readMetadata(audioDir, audioId);
    if (!metadata || now - Date.parse(metadata.createdAt || 0) < AUDIO_RETENTION_MS) continue;
    try { if (metadata.filePath) fs.rmSync(metadata.filePath, { force: true }); } catch { /* Best effort cleanup. */ }
    try { fs.rmSync(metadataPath(audioDir, audioId), { force: true }); } catch { /* Best effort cleanup. */ }
    removed += 1;
  }
  return removed;
}

export function savePrivateAudio(audioDir, { filename, contentBase64, mimeType, durationMs, companyId, userId }) {
  const cleanBase64 = String(contentBase64 || "").replace(/^data:.*?;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  if (!buffer.length) throw new Error("empty_audio");
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("audio_too_large");
  fs.mkdirSync(audioDir, { recursive: true, mode: 0o750 });
  cleanupExpiredAudio(audioDir);
  const audioId = crypto.randomUUID();
  const filePath = path.join(audioDir, `${audioId}${safeExtension(filename, mimeType)}`);
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });
  const metadata = {
    audioId,
    filePath,
    originalName: String(filename || "recording.webm").slice(0, 180),
    mimeType: String(mimeType || "audio/webm").slice(0, 100),
    durationMs: Math.max(0, Number(durationMs || 0)),
    companyId,
    userId,
    createdAt: new Date().toISOString(),
  };
  writeMetadata(audioDir, metadata);
  return { audioId, filename: metadata.originalName, createdAt: metadata.createdAt };
}

export function deletePrivateAudio(audioDir, audioId, companyId) {
  const metadata = readMetadata(audioDir, audioId);
  if (!metadata || metadata.companyId !== companyId) return false;
  fs.rmSync(metadata.filePath, { force: true });
  fs.rmSync(metadataPath(audioDir, audioId), { force: true });
  return true;
}

function hotwordEntries(knowledge, glossary = []) {
  const weighted = [];
  for (const project of knowledge.projects || []) {
    weighted.push({ text: project.name, weight: 20, category: "project" });
    if (project.projectNumber) weighted.push({ text: project.projectNumber, weight: 18, category: "project" });
    for (const alias of project.aliases || []) weighted.push({ text: alias, weight: 18, category: "project" });
  }
  for (const entity of knowledge.entities || []) {
    weighted.push({ text: entity.name, weight: 20, category: entity.entityType });
    if (entity.contactName) weighted.push({ text: entity.contactName, weight: 18, category: "contact" });
    for (const alias of entity.aliases || []) weighted.push({ text: alias, weight: 18, category: entity.entityType });
  }
  for (const entry of glossary.filter((item) => item?.enabled !== false)) {
    weighted.push({ text: entry.standardName, weight: entry.category === "industry_term" ? 15 : 20, category: entry.category });
    for (const alias of entry.aliases || []) weighted.push({ text: alias, weight: 16, category: entry.category });
  }
  const seen = new Set();
  return weighted.filter((item) => {
    const key = normalize(item.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_HOTWORDS);
}

export function buildSpeechHotwords(db, glossary = []) {
  const knowledge = getCompanyKnowledge(db, glossary);
  return { knowledge, hotwords: hotwordEntries(knowledge, glossary) };
}

export function correctTranscriptWithKnowledge(transcript, knowledge, glossary = []) {
  let correctedTranscript = String(transcript || "").trim();
  const aliases = new Map();
  const register = (alias, standardName, entityId) => {
    const raw = String(alias || "").trim();
    if (!raw || raw === standardName) return;
    const key = normalize(raw);
    if (!aliases.has(key)) aliases.set(key, { alias: raw, candidates: [] });
    const entry = aliases.get(key);
    if (!entry.candidates.some((candidate) => candidate.entityId === entityId && candidate.name === standardName)) entry.candidates.push({ entityId, name: standardName });
  };
  for (const project of knowledge.projects || []) for (const alias of project.aliases || []) register(alias, project.name, project.id);
  for (const entity of knowledge.entities || []) for (const alias of entity.aliases || []) register(alias, entity.name, entity.entityId);
  for (const entry of glossary.filter((item) => item?.enabled !== false)) for (const alias of entry.aliases || []) register(alias, entry.standardName, entry.id);

  const corrections = [];
  const ambiguousCorrections = [];
  for (const entry of Array.from(aliases.values()).sort((a, b) => b.alias.length - a.alias.length)) {
    if (!correctedTranscript.includes(entry.alias)) continue;
    if (entry.candidates.length !== 1) {
      ambiguousCorrections.push({ original: entry.alias, candidates: entry.candidates });
      continue;
    }
    const candidate = entry.candidates[0];
    correctedTranscript = correctedTranscript.split(entry.alias).join(candidate.name);
    corrections.push({ original: entry.alias, replacement: candidate.name, entityId: candidate.entityId, confidence: 0.98 });
  }
  return { correctedTranscript, corrections, ambiguousCorrections };
}

export async function getSpeechHealth(overrides = {}) {
  const config = getSpeechConfig(overrides, true);
  if (config.provider === "doubao") {
    return { ok: config.doubaoConfigured, provider: "doubao", endpoint: config.doubaoEndpoint, durationMs: 0, message: config.doubaoConfigured ? "豆包配置已就绪，可通过录音调试验证授权" : "未配置 DOUBAO_API_KEY，或 DOUBAO_APP_KEY 与 DOUBAO_ACCESS_KEY" };
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.endpoint}/health`, { signal: AbortSignal.timeout(5000) });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.ok !== false, endpoint: config.endpoint, durationMs: Date.now() - startedAt, ...result };
  } catch (error) {
    return { ok: false, endpoint: config.endpoint, durationMs: Date.now() - startedAt, message: error?.message || "ASR service unavailable" };
  }
}

async function requestAsr(filePath, model, hotwords, config) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("model", model);
  form.append("language", "zh");
  form.append("hotwords", JSON.stringify(hotwords));
  const response = await fetch(`${config.endpoint}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(config.timeoutMs) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.detail || result.message || `ASR request failed: ${response.status}`));
  const text = String(result.text || result.transcript || "").trim();
  if (!text) throw new Error("ASR returned empty transcript");
  return { ...result, text };
}

async function prepareDoubaoAudio(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".wav", ".mp3", ".ogg"].includes(extension)) return { filePath, cleanup: false };
  const targetPath = `${filePath}.doubao.wav`;
  try {
    await execFileAsync("ffmpeg", ["-y", "-i", filePath, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", targetPath], { timeout: 30000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    throw new Error(`豆包需要 WAV/MP3/OGG 音频，当前格式转换失败：${error?.message || "ffmpeg 不可用"}`);
  }
  return { filePath: targetPath, cleanup: true };
}

async function requestDoubao(filePath, config) {
  const prepared = await prepareDoubaoAudio(filePath);
  try {
    const requestId = crypto.randomUUID();
    const headers = { "Content-Type": "application/json", "X-Api-Resource-Id": "volc.bigasr.auc_turbo", "X-Api-Request-Id": requestId, "X-Api-Sequence": "-1" };
    if (config.doubaoKey) headers["X-Api-Key"] = config.doubaoKey;
    else { headers["X-Api-App-Key"] = config.doubaoAppKey; headers["X-Api-Access-Key"] = config.doubaoAccessKey; }
    const request = { model_name: "bigmodel" };
    if (config.doubaoHotwordTableId) request.corpus = { boosting_table_id: config.doubaoHotwordTableId };
    const response = await fetch(config.doubaoEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ user: { uid: "zhijian-pro" }, audio: { data: fs.readFileSync(prepared.filePath).toString("base64") }, request }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const result = await response.json().catch(() => ({}));
    const statusCode = response.headers.get("X-Api-Status-Code");
    if (!response.ok || (statusCode && statusCode !== "20000000")) {
      const detail = result.message || result.error || "请检查资源权限和 API Key";
      if (String(statusCode || response.status) === "45000030") throw new Error("豆包语音未授权（45000030）：请在火山引擎语音控制台开通 volc.bigasr.auc_turbo，并使用豆包语音专用 API Key");
      throw new Error(`豆包语音请求失败：${statusCode || response.status} ${detail}`);
    }
    const text = String(result.result?.text || result.text || "").trim();
    if (!text) throw new Error("豆包语音返回空文字");
    return { ...result, text, durationMs: Number(result.audio_info?.duration || result.result?.additions?.duration || 0), logId: response.headers.get("X-Tt-Logid") || "" };
  } finally {
    if (prepared.cleanup) fs.rmSync(prepared.filePath, { force: true });
  }
}

export async function transcribePrivateAudio({ audioDir, audioId, companyId, browserTranscript = "", db, glossary = [], speechConfig = {} }) {
  const metadata = readMetadata(audioDir, audioId);
  if (!metadata || metadata.companyId !== companyId || !fs.existsSync(metadata.filePath)) throw new Error("audio_not_found");
  const config = getSpeechConfig(speechConfig, true);
  const { knowledge, hotwords } = buildSpeechHotwords(db, glossary);
  const startedAt = Date.now();
  let result;
  let model = config.provider === "doubao" ? "doubao-bigmodel" : config.primaryModel;
  let provider = config.provider;
  let fallbackApplied = false;
  try {
    result = config.provider === "doubao" ? await requestDoubao(metadata.filePath, config) : await requestAsr(metadata.filePath, config.primaryModel, hotwords, config);
  } catch (primaryError) {
    if (config.provider === "doubao") {
      try {
        model = config.fallbackModel;
        provider = "funasr";
        fallbackApplied = true;
        result = await requestAsr(metadata.filePath, config.fallbackModel, hotwords, config);
      } catch (fallbackError) {
        throw new Error(`豆包识别失败：${primaryError.message}；FunASR备用识别也失败：${fallbackError.message}`);
      }
    } else {
      if (!config.fallbackModel || config.fallbackModel === config.primaryModel) throw primaryError;
      model = config.fallbackModel;
      fallbackApplied = true;
      result = await requestAsr(metadata.filePath, config.fallbackModel, hotwords, config);
    }
  }
  const corrected = correctTranscriptWithKnowledge(result.text, knowledge, glossary);
  const processingMs = Date.now() - startedAt;
  writeMetadata(audioDir, { ...metadata, lastTranscribedAt: new Date().toISOString(), model, processingMs });
  return {
    audioId,
    provider,
    model,
    browserTranscript: String(browserTranscript || "").trim(),
    rawTranscript: result.text,
    transcript: corrected.correctedTranscript,
    ...corrected,
    durationMs: Number(result.durationMs || metadata.durationMs || 0),
    processingMs,
    hotwordCount: hotwords.length,
    hotwordsApplied: hotwords.length > 0,
    fallbackApplied,
    needsManualReview: corrected.ambiguousCorrections.length > 0 || result.lowConfidence === true,
  };
}
