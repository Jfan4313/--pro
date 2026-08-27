import * as XLSX from "xlsx";
import { STAGES } from "./projectLifecycle";
import { PROJECT_ARCHIVE_STRUCTURE } from "./projectArchiveStructure";

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
  projectKey?: string;
  projectName?: string;
  pathStageKey?: string;
  pathStageName?: string;
  pathStageEvidence?: string;
  folderLabels: string[];
  classificationSource: "folder" | "filename" | "content" | "none";
  folderEvidence?: string;
  contentConflict?: string;
  needsReview: boolean;
  logicalPath?: string;
  error?: string;
};

export type ProjectStageSummary = {
  stageKey: string;
  stageName: string;
  fileCount: number;
  classifiedCount: number;
  reviewCount: number;
  categories: Array<{ category: string; count: number }>;
  sampleFiles: string[];
};

export type ScannedProject = {
  projectKey: string;
  projectNumber?: string;
  projectName: string;
  confidence: number;
  evidence: string[];
  fileCount: number;
  stageSummaries: ProjectStageSummary[];
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
  projectName?: string;
  projectNameConfidence?: number;
  projects: ScannedProject[];
  stageSummaries: ProjectStageSummary[];
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

const GENERIC_PROJECT_NAMES = new Set(["项目", "资料", "文件", "文档", "项目资料", "工作区", "根目录", "outputs", "output", "temp", "tmp", "开工资料"]);

function cleanProjectName(value: string) {
  return value.replace(/\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)$/i, "").replace(/^[【\[(（].*?[】\])）]\s*/u, "").replace(/[-_](资料|文件|归档|整理)(?:[-_（(].*)?$/u, "").trim();
}

export function getScannedProjectIdentity(value: string) {
  const raw = cleanProjectName(value);
  const numbered = raw.match(/^(PRJ[-_ ]?\d{1,})[ _-]+(.+)$/i);
  return {
    projectNumber: numbered?.[1] || "",
    projectName: (numbered?.[2] || raw).trim(),
  };
}

function getPathSegments(relativePath: string) {
  return relativePath.split("/").filter(Boolean);
}

const DIRECTORY_STAGE_RULES: Array<{ stage: typeof STAGES[number]; terms: RegExp }> = [
    // Specific business folders must be checked before generic construction
    // wording. A tender can contain construction dates without becoming a
    // construction-stage document.
    { stage: STAGES[2], terms: /招投标|招标|投标|标书|技术标|商务标|报价|澄清答疑|商务|预算|成本|收益|加分项|方案汇报/i },
    { stage: STAGES[4], terms: /项目备案|备案|报建|规划许可|接入系统|接入批复|并网申请|接入申请|供电局|许可|批复/i },
    { stage: STAGES[9], terms: /运营维护|运维|运行数据|发电量|巡检|维修工单|备品备件|质保|保险|客户运维/i },
    { stage: STAGES[8], terms: /验收|并网验收|并网供电|竣工|运维|移交|运行/i },
    { stage: STAGES[6], terms: /项目交底|交底|安全教育|安全技术|人员资格|特种作业|危险源/i },
    // 开工资料/施工前申报是一个完整的前置报审资料包。
    // 目录命名优先于文件名和正文，不能把其中的合同、施工日期等内容拆到其他阶段。
    { stage: STAGES[7], terms: /开工资料整理|开工资料包|施工前申报|开工前申报|开工资料|开工报审/i },
    { stage: STAGES[7], terms: /施工进场|进场|开工|施工|材料.*设备|设备.*材料|现场照片|作业指导|专项施工方案|分包方|开工资料|施工方案|日程安排/i },
    { stage: STAGES[5], terms: /深化设计|施工图|蓝图|设计变更|物料.?bom|图纸|设计资料|光伏图纸/i },
    { stage: STAGES[3], terms: /合同|协议|签约|补充协议|购售电|权属|营业执照|身份证|产权/i },
    { stage: STAGES[1], terms: /初步设计|初设|pvsyst|发电分析|设备清单|组件|逆变器|可研/i },
    { stage: STAGES[0], terms: /项目立项|现场勘察|前期收资|勘察|航拍|测量|屋顶结构|电费详情/i },
];

export function getSanitizedFolderLabels(relativePath: string) {
  return getPathSegments(relativePath).slice(1, -1).map((segment) => segment.replace(/[\\/:*?"<>|]/g, "_").trim()).filter(Boolean);
}

export function detectPathStage(relativePath: string) {
  const segments = getSanitizedFolderLabels(relativePath);
  const matches: Array<{ stageKey: string; stageName: string; evidence: string; index: number }> = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const normalized = normalizeText(segment);
    const matched = DIRECTORY_STAGE_RULES.find((rule) => rule.terms.test(normalized));
    if (matched) matches.push({ stageKey: matched.stage.id, stageName: matched.stage.name, evidence: segment, index });
  }
  const winner = matches.at(-1);
  if (!winner) return undefined;
  const parentConflicts = matches.filter((item) => item.stageKey !== winner.stageKey).map((item) => `${item.evidence}→${item.stageName}`);
  return { ...winner, parentConflicts };
}

function nearestFolderLabel(folderLabels: string[], terms: RegExp) {
  return [...folderLabels].reverse().find((label) => terms.test(normalizeText(label)));
}

function getProjectKey(relativePath: string) {
  const first = getPathSegments(relativePath)[0];
  if (!first || extensionOf(first) || GENERIC_PROJECT_NAMES.has(normalizeText(first))) return "未分组";
  return first;
}

function categoryCounts(files: ScannedFile[]) {
  return [...files.reduce((map, file) => map.set(file.category, (map.get(file.category) || 0) + 1), new Map<string, number>())]
    .map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

function buildStageSummaries(files: ScannedFile[]): ProjectStageSummary[] {
  const groups = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const stageKey = file.pathStageKey || file.stageId || "needs-review";
    const stageName = file.pathStageName || file.stageName || "待复核阶段";
    const key = `${stageKey}\u0000${stageName}`;
    const group = groups.get(key) || [];
    group.push(file);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [stageKey, stageName] = key.split("\u0000");
    return { stageKey, stageName, fileCount: group.length, classifiedCount: group.filter((file) => file.status === "classified").length, reviewCount: group.filter((file) => file.status === "needs-review" || file.status === "unreadable").length, categories: categoryCounts(group), sampleFiles: group.slice(0, 8).map((file) => file.name) };
  }).sort((a, b) => b.fileCount - a.fileCount);
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
const scanHandleRegistry = new Map<string, Map<string, any>>();

function classifySignal(value: string) {
  const haystack = normalizeText(value);
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

export function classifyArchiveCategory(name: string, content = "", folderLabels: string[] = []) {
  const folderValue = normalizeText(folderLabels.join(" "));
  const value = normalizeText(`${folderValue} ${name} ${content}`);
  // 目录已经明确表达“开工前申报”时，整包资料保持在同一类别。
  // 不能因为单个文件名或正文出现合同、施工、并网等词而拆散目录。
  const preStartFolder = nearestFolderLabel(folderLabels, /开工资料整理|开工资料包|施工前申报|开工前申报|开工资料|开工报审/);
  if (preStartFolder) return "开工前申报";
  // 目录中的业务文件夹是最高证据。保留目录层级，归档器会据此创建
  // 真正的子文件夹；正文里的“施工日期”等词只能产生冲突提示。
  const folderRules: Array<[RegExp, string]> = [
    [/招标文件/, "招投标资料/招标文件"],
    [/技术标/, "招投标资料/技术标"],
    [/商务标/, "招投标资料/商务标"],
    [/报价文件|报价单/, "招投标资料/报价文件"],
    [/澄清答疑|答疑/, "招投标资料/澄清答疑"],
    [/投标过程/, "招投标资料/投标过程"],
    [/招投标资料|招投标|招标|投标|标书/, "招投标资料/其他"],
    [/并网资料整理/, "并网资料整理"],
    [/接入批复|并网申请|并网通知/, "并网资料整理/接入批复资料"],
    [/发改委项目备案|备案申请|备案证书/, "发改委项目备案"],
    [/合同协议|总承包合同|能源管理合同|购售电合同/, "合同协议"],
    [/合同审批与盖章/, "合同审批与盖章"],
    [/业主交底/, "业主交底"],
    [/施工交底/, "施工交底"],
    [/施工日程与进度|施工周报|施工日志/, "施工管理"],
    [/施工实施/, "施工实施"],
    [/隐蔽工程与节点报验/, "隐蔽工程与节点报验"],
    [/施工质量与安全/, "施工质量与安全"],
    [/施工照片与影像/, "施工照片与影像"],
    [/运营维护|运行数据与发电量|发电量|设备巡检|故障维修|备品备件|保险与质保|客户运维/, "运营维护"],
    [/现场勘察/, "现场勘察"],
    [/前期收资/, "前期收资"],
    [/项目模型/, "项目模型"],
    [/项目照片/, "项目照片"],
    [/设备与成本/, "设备与成本"],
    [/电气设计|结构设计|项目设计资料|项目模型|深化电气设计|深化结构设计|设计院盖章蓝图/, "设计与技术"],
    [/方案汇报|会议纪要|商务条款|投资收益测算|成本与报价/, "商务沟通"],
  ];
  const normalizedFolders = folderLabels.map((label) => normalizeText(label));
  if (/项目模型/.test(folderValue)) {
    if (/pvsyst|发电分析/.test(value)) return "项目模型/PVsyst模型";
    if (/三维/.test(value)) return "项目模型/三维模型";
    if (/组件排布|排布/.test(value)) return "项目模型/组件排布模型";
  }
  if (/招投标|招标|投标|标书/.test(folderValue)) {
    if (/技术标/.test(value)) return "招投标资料/技术标";
    if (/商务标/.test(value)) return "招投标资料/商务标";
    if (/澄清|答疑/.test(value)) return "招投标资料/澄清答疑";
    if (/报价|报价单|清单价/.test(value)) return "招投标资料/报价文件";
  }
  const knownFolderMatch = Object.values(PROJECT_ARCHIVE_STRUCTURE).flatMap((paths) => paths)
    .map((path) => ({ path, leaf: normalizeText(path.split("/").at(-1) || path) }))
    .map((item) => ({ ...item, index: normalizedFolders.lastIndexOf(item.leaf) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => b.index - a.index || b.path.length - a.path.length)[0];
  if (knownFolderMatch) return knownFolderMatch.path;
  const folderMatch = folderRules.find(([terms]) => terms.test(folderValue));
  if (folderMatch) {
    if (folderMatch[1] === "招投标资料/其他" && /报价/.test(folderValue)) return "招投标资料/报价文件";
    return folderMatch[1];
  }
  if (/招投标|招标|投标|标书|技术标|商务标|澄清答疑/.test(value)) {
    if (/技术标/.test(value)) return "招投标资料/技术标";
    if (/商务标/.test(value)) return "招投标资料/商务标";
    if (/澄清|答疑/.test(value)) return "招投标资料/澄清答疑";
    if (/报价|报价单|清单价/.test(value)) return "招投标资料/报价文件";
    return "招投标资料/其他";
  }
  if (/合同|协议|盖章|营业执照|身份证|产权|租赁|发票|付款/.test(value)) return "合同协议";
  if (/备案|许可|批复|报建/.test(value)) return "发改委项目备案";
  if (/运维|运行数据|发电量|巡检|维修工单|备品备件|质保|保险/.test(value)) return "运营维护";
  if (/设计|图纸|蓝图|方案|pvsyst|建模|bom|设备清单/.test(value)) return "设计与技术";
  if (/勘察|航拍|现场|照片|录像|测量/.test(value)) return "现场勘察";
  if (/施工|进场|日志|隐蔽|安全|交底|验收|并网|竣工/.test(value)) return "施工与验收";
  if (/预算|成本|造价|收益|irr|报价/.test(value)) return "商务与成本";
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
      files.push({ id: fileId(entry.relativePath, 0, ""), name: entry.relativePath.split("/").pop() || entry.relativePath, relativePath: entry.relativePath, extension: extensionOf(entry.relativePath), size: 0, modifiedAt: "", status: "unreadable", category: "待复核", confidence: 0, evidence: [], folderLabels: getSanitizedFolderLabels(entry.relativePath), classificationSource: "none", needsReview: true, error: error?.message || "无法读取文件" });
      continue;
    }
    const extension = extensionOf(file.name);
    const base = { id: fileId(entry.relativePath, file.size, new Date(file.lastModified).toISOString()), name: file.name, relativePath: entry.relativePath, extension, size: file.size, modifiedAt: new Date(file.lastModified).toISOString() };
    const folderLabels = getSanitizedFolderLabels(entry.relativePath);
    const pathStage = detectPathStage(entry.relativePath);
    if (file.size > maxFileSize) {
      files.push({ ...base, status: pathStage ? "classified" : "needs-review", category: classifyArchiveCategory(file.name, "", folderLabels), stageId: pathStage?.stageKey, stageName: pathStage?.stageName, pathStageKey: pathStage?.stageKey, pathStageName: pathStage?.stageName, pathStageEvidence: pathStage?.evidence, confidence: pathStage ? 0.96 : 0, evidence: pathStage ? [`目录：${pathStage.evidence}`] : [`超过 ${(maxFileSize / 1024 / 1024).toFixed(0)} MB 限制`], folderLabels, classificationSource: pathStage ? "folder" : "none", folderEvidence: pathStage?.evidence, contentConflict: pathStage?.parentConflicts.length ? `上层目录冲突：${pathStage.parentConflicts.join("、")}` : undefined, needsReview: !pathStage || Boolean(pathStage.parentConflicts.length), error: "文件过大，未读取内容" });
      continue;
    }
    let content = "";
    let sheetNames: string[] | undefined;
    try { const extracted = await extractContent(file, extension, maxTextLength); content = extracted.text || ""; sheetNames = extracted.sheetNames; } catch (error: any) {
      files.push({ ...base, status: pathStage ? "classified" : "needs-review", category: classifyArchiveCategory(file.name, "", folderLabels), stageId: pathStage?.stageKey, stageName: pathStage?.stageName, pathStageKey: pathStage?.stageKey, pathStageName: pathStage?.stageName, pathStageEvidence: pathStage?.evidence, confidence: pathStage ? 0.96 : 0, evidence: pathStage ? [`目录：${pathStage.evidence}`] : [], folderLabels, classificationSource: pathStage ? "folder" : "none", folderEvidence: pathStage?.evidence, contentConflict: pathStage?.parentConflicts.length ? `上层目录冲突：${pathStage.parentConflicts.join("、")}` : undefined, needsReview: !pathStage || Boolean(pathStage.parentConflicts.length), error: error?.message || "内容解析失败" });
      continue;
    }
    const filenameStage = classifySignal(file.name);
    const contentStage = classifySignal(content);
    const fallbackStage = filenameStage.stageId ? filenameStage : contentStage;
    const chosenStage = pathStage ? { stageId: pathStage.stageKey, stageName: pathStage.stageName, confidence: 0.96, evidence: [`目录：${pathStage.evidence}`], needsReview: false } : fallbackStage;
    const conflicts: string[] = [];
    if (pathStage?.parentConflicts.length) conflicts.push(`上层目录冲突：${pathStage.parentConflicts.join("、")}`);
    if (pathStage && filenameStage.stageId && filenameStage.stageId !== pathStage.stageKey) conflicts.push(`文件名更接近“${filenameStage.stageName}”`);
    if (pathStage && contentStage.stageId && contentStage.stageId !== pathStage.stageKey) conflicts.push(`正文更接近“${contentStage.stageName}”`);
    const classificationSource = pathStage ? "folder" : filenameStage.stageId ? "filename" : contentStage.stageId ? "content" : "none";
    const needsReview = !chosenStage.stageId || chosenStage.needsReview || Boolean(pathStage?.parentConflicts.length);
    const hash = await sha256(file).catch(() => undefined);
    const archiveCategory = classifyArchiveCategory(file.name, content, folderLabels);
    files.push({ ...base, hash, status: SUPPORTED_EXTENSIONS.has(extension) ? (needsReview ? "needs-review" : "classified") : (pathStage ? "classified" : "needs-review"), category: archiveCategory, stageId: chosenStage.stageId, stageName: chosenStage.stageName, confidence: chosenStage.confidence, evidence: chosenStage.evidence, contentSummary: content ? truncate(content.replace(/\s+/g, " "), 240) : undefined, sheetNames, suggestedPath: chosenStage.stageId ? `${chosenStage.stageId}/已归档/${archiveCategory}/${file.name}` : undefined, logicalPath: chosenStage.stageId ? `${chosenStage.stageId}/已归档/${archiveCategory}/${file.name}` : undefined, pathStageKey: pathStage?.stageKey, pathStageName: pathStage?.stageName, pathStageEvidence: pathStage?.evidence, folderLabels, classificationSource, folderEvidence: pathStage?.evidence, contentConflict: conflicts.length ? conflicts.join("；") : undefined, needsReview });
  }
  const projectFileGroups = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const projectKey = getProjectKey(file.relativePath);
    file.projectKey = projectKey;
    file.projectName = getScannedProjectIdentity(projectKey).projectName;
    const group = projectFileGroups.get(projectKey) || [];
    group.push(file);
    projectFileGroups.set(projectKey, group);
  }
  const issues: ScannerIssue[] = [];
  const byHash = new Map<string, ScannedFile[]>();
  files.filter((file) => file.hash).forEach((file) => { const list = byHash.get(file.hash!) || []; list.push(file); byHash.set(file.hash!, list); });
  for (const group of byHash.values()) if (group.length > 1) issues.push({ type: "duplicate", title: "发现内容重复文件", detail: group.map((file) => file.relativePath).join("、"), fileIds: group.map((file) => file.id), confidence: 0.99 });
  const byName = new Map<string, ScannedFile[]>();
  files.forEach((file) => { const key = normalizeText(file.name); const list = byName.get(key) || []; list.push(file); byName.set(key, list); });
  for (const group of byName.values()) if (group.length > 1 && new Set(group.map((file) => file.hash).filter(Boolean)).size > 1) issues.push({ type: "version-conflict", title: "同名文件内容不同", detail: group.map((file) => `${file.relativePath}（${file.modifiedAt.slice(0, 10)}）`).join("、"), fileIds: group.map((file) => file.id), confidence: 0.86 });
  files.filter((file) => file.contentConflict).forEach((file) => issues.push({ type: "misplaced", title: "目录与其他证据不一致", detail: `${file.relativePath} 保持归入“${file.stageName || "未确定"}”：${file.contentConflict}`, fileIds: [file.id], confidence: 0.9 }));
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
  const projects = [...projectFileGroups.entries()].map(([projectKey, projectFiles]) => {
    const identity = getScannedProjectIdentity(projectKey);
    const projectName = identity.projectName;
    const contentNames = Array.from(new Set(projectFiles.flatMap((file) => (file.name.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}(?:项目|工程)/g) || []).slice(0, 3)))).slice(0, 5);
    return { projectKey, projectNumber: identity.projectNumber, projectName: projectName === "未分组" ? (contentNames[0] || "未分组资料") : projectName, confidence: projectName === "未分组" ? 0.35 : 0.93, evidence: [projectKey, ...contentNames].filter(Boolean).slice(0, 6), fileCount: projectFiles.length, stageSummaries: buildStageSummaries(projectFiles) };
  }).sort((a, b) => b.fileCount - a.fileCount);
  const projectNames = projects.filter((project) => project.projectName !== "未分组资料").map((project) => project.projectName).slice(0, 20);
  const primaryProject = projects[0];
  const overallStageSummaries = buildStageSummaries(files);
  const readableCount = files.filter((file) => file.status !== "unreadable").length;
  const scanId = `scan-${Date.now()}`;
  const handlesByPath = new Map(allEntries.map((entry) => [entry.relativePath, entry.handle]));
  scanHandleRegistry.set(scanId, new Map(files.map((file) => [file.id, handlesByPath.get(file.relativePath)]).filter((entry): entry is [string, any] => Boolean(entry[1]))));
  return { id: scanId, rootNames: Array.from(new Set(allEntries.map((entry) => entry.rootName))), scannedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), fileCount: files.length, readableCount, reviewCount: files.filter((file) => file.status === "needs-review" || file.status === "unreadable").length, inferredProjectNames: projectNames, projectName: projects.length > 1 ? `多项目资料库（${projects.length} 个项目）` : primaryProject?.projectName, projectNameConfidence: projects.length === 1 ? primaryProject?.confidence : undefined, projects, stageSummaries: overallStageSummaries, inferredStage, files, issues };
}

export function getScannedFileHandle(scanId: string, fileId: string) {
  return scanHandleRegistry.get(scanId)?.get(fileId);
}

export function downloadScanReport(report: ProjectScanReport, format: "json" | "xlsx") {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${report.rootNames[0] || "项目"}-文件扫描报告.json`; link.click(); URL.revokeObjectURL(url); return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.files.map((file) => ({ 项目: file.projectName || "未分组", 文件名: file.name, 相对路径: file.relativePath, 类型: file.extension, 大小: file.size, 修改时间: file.modifiedAt, 阶段: file.pathStageName || file.stageName || "待复核", 阶段目录证据: file.pathStageEvidence || "", 置信度: `${Math.round(file.confidence * 100)}%`, 分类: file.category, 状态: file.status, 证据: file.evidence.join("、"), 摘要: file.contentSummary || "" }))), "文件清单");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.projects.flatMap((project) => project.stageSummaries.map((stage) => ({ 项目: project.projectName, 项目置信度: `${Math.round(project.confidence * 100)}%`, 项目文件数: project.fileCount, 阶段: stage.stageName, 文件数: stage.fileCount, 已分类: stage.classifiedCount, 待复核: stage.reviewCount, 资料类别: stage.categories.map((item) => `${item.category}（${item.count}）`).join("、"), 示例文件: stage.sampleFiles.join("、") })))), "项目阶段汇总");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.issues.map((issue) => ({ 类型: issue.type, 标题: issue.title, 说明: issue.detail, 置信度: `${Math.round(issue.confidence * 100)}%` }))), "问题与建议");
  XLSX.writeFile(workbook, `${report.rootNames[0] || "项目"}-文件扫描报告.xlsx`);
}

export async function pickScanDirectory() {
  const picker = (window as any).showDirectoryPicker;
  if (!picker) throw new Error("archive_picker_unsupported");
  return picker({ mode: "read" });
}
