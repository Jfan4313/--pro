import * as XLSX from "xlsx";
import { STAGES } from "./projectLifecycle";

export type ScanFileStatus = "classified" | "needs-review" | "unsupported" | "unreadable";

export type ScannedFile = {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  size: number;
  modifiedAt: string;
  hash?: string;
  status: ScanFileStatus;
  category: string;
  stageId?: string;
  stageName?: string;
  confidence: number;
  evidence: string[];
  contentSummary?: string;
  sheetNames?: string[];
  suggestedPath?: string;
  error?: string;
};

export type ScannerIssue = {
  type: "duplicate" | "version-conflict" | "misplaced" | "naming" | "missing";
  title: string;
  detail: string;
  fileIds?: string[];
  stageId?: string;
  confidence: number;
};

export type ProjectScanReport = {
  id: string;
  rootNames: string[];
  scannedAt: string;
  durationMs: number;
  fileCount: number;
  readableCount: number;
  reviewCount: number;
  inferredProjectNames: string[];
  inferredStage?: { stageId: string; stageName: string; confidence: number; evidence: string[]; needsReview: boolean };
  files: ScannedFile[];
  issues: ScannerIssue[];
};

export type ScanOptions = {
  maxFileSize?: number;
  maxTextLength?: number;
  signal?: AbortSignal;
  onProgress?: (progress: { current: number; total: number; name: string }) => void;
};

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_MAX_TEXT_LENGTH = 16_000;
const SKIP_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", "dist", "build", "coverage", ".cache", ".vite"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "log"]);
const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "txt", "md", "markdown", "json", "csv", "log"]);

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s_\-—–()[\]{}【】（）]+/g, " ").trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("扫描已取消", "AbortError");
}

async function collectEntries(root: any, path = ""): Promise<Array<{ handle: any; relativePath: string }>> {
  const entries: Array<{ handle: any; relativePath: string }> = [];
  for await (const entry of root.values()) {
    if (entry.kind === "directory") {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) entries.push(...await collectEntries(entry, path ? `${path}/${entry.name}` : entry.name));
    } else if (entry.kind === "file" && !entry.name.startsWith(".")) {
      entries.push({ handle: entry, relativePath: path ? `${path}/${entry.name}` : entry.name });
    }
  }
  return entries;
}

function stageTerms(stage: typeof STAGES[number]) {
  const sources = [
    stage.name,
    stage.desc,
    ...stage.files,
    ...stage.checklist.map((item) => item.label),
  ];
  const chunks = sources.flatMap((source) => source.match(/[\u4e00-\u9fa5]{2,8}/g) || []);
  return Array.from(new Set([...normalizeText(sources.join(" ")).split(" "), ...chunks].filter((term) => term.length >= 2)));
}

const stageTermCache = new Map<string, string[]>();

function classifyFile(name: string, relativePath: string, content = "") {
  const haystack = normalizeText(`${name} ${relativePath} ${content}`);
  const scored = STAGES.map((stage) => {
    const terms = stageTermCache.get(stage.id) || stageTerms(stage);
    stageTermCache.set(stage.id, terms);
    const matched = terms.filter((term) => haystack.includes(term));
    const uniqueMatched = Array.from(new Set(matched));
    return { stage, score: uniqueMatched.length, evidence: uniqueMatched.slice(0, 5) };
  }).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score === 0) return { confidence: 0, evidence: [], needsReview: true };
  const confidence = Math.min(0.98, 0.42 + top.score * 0.08 + (top.score > (second?.score || 0) ? 0.16 : 0));
  return { stageId: top.stage.id, stageName: top.stage.name, confidence, evidence: top.evidence, needsReview: confidence < 0.65 || top.score === second?.score };
}

function classifyCategory(name: string, content: string) {
  const value = normalizeText(`${name} ${content}`);
  if (/合同|协议|盖章|营业执照|身份证|产权|租赁|发票|付款/.test(value)) return "合同与权属";
  if (/设计|图纸|蓝图|方案|pvsyst|建模|bom|设备清单/.test(value)) return "设计与技术";
  if (/勘察|航拍|现场|照片|录像|测量/.test(value)) return "现场勘察";
  if (/施工|进场|日志|隐蔽|安全|交底|验收|并网|竣工/.test(value)) return "施工与验收";
  if (/预算|成本|造价|收益|irr|报价/.test(value)) return "商务与成本";
  if (/备案|许可|批复|报建|规划/.test(value)) return "备案与报建";
  if (/会议|纪要|沟通|汇报/.test(value)) return "会议与沟通";
  return "其他资料";
}

async function extractDocxText(file: File, maxLength: number): Promise<{ text: string; sheetNames?: string[] }> {
  // DOCX is a ZIP. This lightweight reader extracts word/document.xml without
  // adding a second archive dependency to the browser bundle.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder();
  const names: string[] = [];
  let documentXml = "";
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) continue;
    const nameLength = bytes[i + 26] | (bytes[i + 27] << 8);
    const extraLength = bytes[i + 28] | (bytes[i + 29] << 8);
    const compressedSize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    const method = bytes[i + 8] | (bytes[i + 9] << 8);
    const name = decoder.decode(bytes.slice(i + 30, i + 30 + nameLength));
    names.push(name);
    if (name !== "word/document.xml") continue;
    const payload = bytes.slice(i + 30 + nameLength + extraLength, i + 30 + nameLength + extraLength + compressedSize);
    if (method === 0) documentXml = decoder.decode(payload);
    else if (method === 8 && "DecompressionStream" in window) documentXml = decoder.decode(await new Response(new Blob([payload]).stream().pipeThrough(new (window as any).DecompressionStream("deflate-raw"))).arrayBuffer());
    break;
  }
  const text = documentXml.replace(/<w:tab\s*\/?>/g, "\t").replace(/<w:br\s*\/?>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return { text: truncate(text, maxLength), sheetNames: names };
}

async function extractContent(file: File, extension: string, maxLength: number): Promise<{ text: string; sheetNames?: string[] }> {
  if (TEXT_EXTENSIONS.has(extension)) return { text: truncate(await file.text(), maxLength) };
  if (extension === "xlsx" || extension === "xls") {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: false, cellFormula: false });
    const snippets: string[] = [];
    for (const sheetName of workbook.SheetNames.slice(0, 5)) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }).slice(0, 4) as any[][];
      snippets.push(`${sheetName}: ${rows.flat().filter(Boolean).join(" ")}`);
    }
    return { text: truncate(snippets.join(" | "), maxLength), sheetNames: workbook.SheetNames };
  }
  if (extension === "docx") return extractDocxText(file, maxLength);
  if (extension === "pdf") {
    const raw = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const text = raw.match(/\(([^)]{2,200})\)/g)?.map((part) => part.slice(1, -1)).join(" ") || "";
    return { text: truncate(text.replace(/\\[nrt]/g, " "), maxLength) };
  }
  return { text: "" };
}

function fileId(path: string, size: number, modifiedAt: string) {
  return `${path}:${size}:${modifiedAt}`;
}

export async function scanProjectDirectories(handles: any[], options: ScanOptions = {}): Promise<ProjectScanReport> {
  const started = performance.now();
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  const allEntries: Array<{ handle: any; relativePath: string; rootName: string }> = [];
  for (const root of handles) {
    checkCancelled(options.signal);
    for (const entry of await collectEntries(root)) allEntries.push({ ...entry, rootName: root.name || "项目文件夹" });
  }
  const files: ScannedFile[] = [];
  for (let index = 0; index < allEntries.length; index++) {
    checkCancelled(options.signal);
    const entry = allEntries[index];
    options.onProgress?.({ current: index + 1, total: allEntries.length, name: entry.relativePath });
    let file: File;
    try { file = await entry.handle.getFile(); } catch (error: any) {
      files.push({ id: fileId(entry.relativePath, 0, ""), name: entry.relativePath.split("/").pop() || entry.relativePath, relativePath: entry.relativePath, extension: extensionOf(entry.relativePath), size: 0, modifiedAt: "", status: "unreadable", category: "待复核", confidence: 0, evidence: [], error: error?.message || "无法读取文件" });
      continue;
    }
    const extension = extensionOf(file.name);
    const base = { id: fileId(entry.relativePath, file.size, new Date(file.lastModified).toISOString()), name: file.name, relativePath: entry.relativePath, extension, size: file.size, modifiedAt: new Date(file.lastModified).toISOString() };
    if (file.size > maxFileSize) { files.push({ ...base, status: "needs-review", category: "超大文件", confidence: 0, evidence: [`超过 ${(maxFileSize / 1024 / 1024).toFixed(0)} MB 限制`], error: "文件过大，未读取内容" }); continue; }
    let content = "";
    let sheetNames: string[] | undefined;
    try { const extracted = await extractContent(file, extension, maxTextLength); content = extracted.text || ""; sheetNames = extracted.sheetNames; } catch (error: any) {
      files.push({ ...base, status: "needs-review", category: "待复核", confidence: 0, evidence: [], error: error?.message || "内容解析失败" });
      continue;
    }
    const stage = classifyFile(file.name, entry.relativePath, content);
    const hash = await sha256(file).catch(() => undefined);
    files.push({ ...base, hash, status: SUPPORTED_EXTENSIONS.has(extension) ? (stage.needsReview ? "needs-review" : "classified") : "needs-review", category: classifyCategory(file.name, content), stageId: stage.stageId, stageName: stage.stageName, confidence: stage.confidence, evidence: stage.evidence, contentSummary: content ? truncate(content.replace(/\s+/g, " "), 240) : undefined, sheetNames, suggestedPath: stage.stageId ? `${stage.stageId}/待提交/${file.name}` : undefined });
  }
  const issues: ScannerIssue[] = [];
  const byHash = new Map<string, ScannedFile[]>();
  files.filter((file) => file.hash).forEach((file) => { const list = byHash.get(file.hash!) || []; list.push(file); byHash.set(file.hash!, list); });
  for (const group of byHash.values()) if (group.length > 1) issues.push({ type: "duplicate", title: "发现内容重复文件", detail: group.map((file) => file.relativePath).join("、"), fileIds: group.map((file) => file.id), confidence: 0.99 });
  const byName = new Map<string, ScannedFile[]>();
  files.forEach((file) => { const key = normalizeText(file.name); const list = byName.get(key) || []; list.push(file); byName.set(key, list); });
  for (const group of byName.values()) if (group.length > 1 && new Set(group.map((file) => file.hash).filter(Boolean)).size > 1) issues.push({ type: "version-conflict", title: "同名文件内容不同", detail: group.map((file) => `${file.relativePath}（${file.modifiedAt.slice(0, 10)}）`).join("、"), fileIds: group.map((file) => file.id), confidence: 0.86 });
  files.filter((file) => file.stageId && file.confidence >= 0.7).forEach((file) => { const expected = STAGES.find((stage) => stage.id === file.stageId)?.files || []; const pathStage = STAGES.find((stage) => normalizeText(file.relativePath).includes(normalizeText(stage.name))); if (pathStage && pathStage.id !== file.stageId) issues.push({ type: "misplaced", title: "目录阶段与内容判断不一致", detail: `${file.relativePath} 的内容更接近“${file.stageName}”，但目录名称更接近“${pathStage.name}”`, fileIds: [file.id], confidence: 0.74 }); void expected; });
  const stageCounts = new Map<string, number>();
  files.forEach((file) => file.stageId && stageCounts.set(file.stageId, (stageCounts.get(file.stageId) || 0) + Math.max(file.confidence, 0.1)));
  const topStage = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const inferredStageDef = topStage && STAGES.find((stage) => stage.id === topStage[0]);
  const inferredStage = inferredStageDef ? { stageId: inferredStageDef.id, stageName: inferredStageDef.name, confidence: Math.min(0.98, topStage[1] / Math.max(files.length, 1) + 0.4), evidence: files.filter((file) => file.stageId === inferredStageDef.id).flatMap((file) => file.evidence).slice(0, 8), needsReview: files.filter((file) => file.stageId === inferredStageDef.id).length === 0 } : undefined;
  if (inferredStageDef) {
    const fileNames = normalizeText(files.map((file) => file.name).join(" "));
    for (const expected of inferredStageDef.files) if (!fileNames.includes(normalizeText(expected).replace(/\.[a-z0-9]+$/, ""))) issues.push({ type: "missing", title: "阶段清单可能缺失资料", detail: `未发现与“${expected}”相近的文件名`, stageId: inferredStageDef.id, confidence: 0.62 });
  }
  files.filter((file) => !file.extension || /\s{2,}|[\\/:*?"<>|]/.test(file.name)).forEach((file) => issues.push({ type: "naming", title: "文件名需要人工确认", detail: file.relativePath, fileIds: [file.id], confidence: 0.7 }));
  const projectNames = Array.from(new Set(files.flatMap((file) => (file.name.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}(?:项目|工程)/g) || []).slice(0, 3)))).slice(0, 8);
  const readableCount = files.filter((file) => file.status !== "unreadable").length;
  return { id: `scan-${Date.now()}`, rootNames: Array.from(new Set(allEntries.map((entry) => entry.rootName))), scannedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), fileCount: files.length, readableCount, reviewCount: files.filter((file) => file.status === "needs-review" || file.status === "unreadable").length, inferredProjectNames: projectNames, inferredStage, files, issues };
}

export function downloadScanReport(report: ProjectScanReport, format: "json" | "xlsx") {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${report.rootNames[0] || "项目"}-文件扫描报告.json`; link.click(); URL.revokeObjectURL(url); return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.files.map((file) => ({ 文件名: file.name, 相对路径: file.relativePath, 类型: file.extension, 大小: file.size, 修改时间: file.modifiedAt, 阶段: file.stageName || "待复核", 置信度: `${Math.round(file.confidence * 100)}%`, 分类: file.category, 状态: file.status, 证据: file.evidence.join("、"), 摘要: file.contentSummary || "" }))), "文件清单");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.issues.map((issue) => ({ 类型: issue.type, 标题: issue.title, 说明: issue.detail, 置信度: `${Math.round(issue.confidence * 100)}%` }))), "问题与建议");
  XLSX.writeFile(workbook, `${report.rootNames[0] || "项目"}-文件扫描报告.xlsx`);
}

export async function pickScanDirectory() {
  const picker = (window as any).showDirectoryPicker;
  if (!picker) throw new Error("archive_picker_unsupported");
  return picker({ mode: "read" });
}
