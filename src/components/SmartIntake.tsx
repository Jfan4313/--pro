import React, { useMemo, useState } from "react";
import { AudioLines, CalendarDays, CheckCircle2, ClipboardList, FileUp, Image as ImageIcon, Loader2, Mic, Send, Sparkles, Type, X } from "lucide-react";
import { apiClient } from "@/src/lib/apiClient";
import { cn } from "@/src/lib/utils";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { formatLocalDate } from "@/src/lib/management";

type InputType = "text" | "image" | "audio";

interface AnalysisResult {
  title: string;
  projectId: string;
  projectName: string;
  assignee: string;
  deadline: string;
  summary: string;
  confidence: number;
  needsManualReview: boolean;
}

const today = () => formatLocalDate();

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function SmartIntake({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputType, setInputType] = useState<InputType>("text");
  const [rawText, setRawText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; url: string; type: InputType } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [projectBoardData] = useProjectBoardData();
  const [personnelData] = useSyncedAppData<any[]>("personnelData", []);
  const [quickIntakeItems, setQuickIntakeItems] = useSyncedAppData<any[]>("quickIntakeItems", []);

  const allProjects = useMemo(() => {
    return Array.isArray(projectBoardData) ? projectBoardData.flatMap((col: any) => col.projects || []) : [];
  }, [projectBoardData]);

  const reset = () => {
    setInputType("text");
    setRawText("");
    setAttachment(null);
    setAnalysis(null);
    setIsAnalyzing(false);
    setIsSaving(false);
    setError("");
  };

  const close = () => {
    setIsOpen(false);
    reset();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setAnalysis(null);
    setIsAnalyzing(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const uploaded = await apiClient.uploadFile(file.name, contentBase64);
      setAttachment({ name: uploaded.filename, url: uploaded.url, type: inputType });
      const result = await apiClient.analyzeIntake({
        inputType,
        attachmentUrl: uploaded.url,
        projects: allProjects,
        personnel: personnelData,
      });
      setAnalysis({
        ...result,
        title: result.title === "根据附件补充待办事项" ? "" : result.title,
        deadline: result.deadline || today(),
      });
    } catch {
      setError("附件上传或分析失败，请确认本地后端正在运行。");
    } finally {
      setIsAnalyzing(false);
      event.target.value = "";
    }
  };

  const analyzeText = async () => {
    if (!rawText.trim()) {
      setError("请先粘贴或输入一段待办来源内容。");
      return;
    }
    setError("");
    setIsAnalyzing(true);
    try {
      const result = await apiClient.analyzeIntake({
        inputType: "text",
        text: rawText,
        projects: allProjects,
        personnel: personnelData,
      });
      setAnalysis({ ...result, deadline: result.deadline || today() });
    } catch {
      const matchedProject = allProjects.find((p: any) => rawText.includes(p.name) || rawText.includes(String(p.name).slice(0, 2)));
      const matchedPerson = personnelData.find((p: any) => rawText.includes(p.name));
      setAnalysis({
        title: rawText.slice(0, 40),
        projectId: matchedProject?.id || "",
        projectName: matchedProject?.name || "",
        assignee: matchedPerson?.name || "",
        deadline: today(),
        summary: rawText,
        confidence: 0.15,
        needsManualReview: true,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateAnalysis = (patch: Partial<AnalysisResult>) => {
    setAnalysis((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const confirmTask = async () => {
    if (!analysis?.title.trim() || !analysis.projectName) {
      setError("请填写待办标题并选择所属项目。");
      return;
    }

    setIsSaving(true);
    setError("");
    const item = {
      id: `qi-${Date.now()}`,
      title: analysis.title.trim(),
      projectId: analysis.projectId,
      projectName: analysis.projectName,
      assignee: analysis.assignee || "待指派",
      deadline: analysis.deadline || today(),
      status: "pending",
      sourceType: inputType,
      summary: analysis.summary || attachment?.name || rawText,
      attachmentUrl: attachment?.url || "",
      createdAt: new Date().toISOString(),
      createdBy: "项目经理",
      auditTrail: [
        { action: "created", actor: "项目经理", at: new Date().toISOString(), note: "快速待办采集" }
      ],
    };
    await setQuickIntakeItems([item, ...(Array.isArray(quickIntakeItems) ? quickIntakeItems : [])]);

    setIsSaving(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "快速待办已进入待确认池" }));
    close();
    setActiveTab("dashboard");
  };

  const selectedProjectValue = analysis?.projectId || analysis?.projectName || "";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-28 md:bottom-6 md:right-6 z-40 h-12 md:h-14 px-4 md:px-5 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-700 transition-colors flex items-center gap-2 font-semibold"
      >
        <ClipboardList className="w-5 h-5" />
        <span className="hidden sm:inline">快速待办</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  快速待办采集
                </h3>
                <p className="text-sm text-slate-500 mt-1">先采集来源，进入待确认池后再写入日程。</p>
              </div>
              <button onClick={close} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
                {[
                  { id: "text", label: "文字", icon: Type },
                  { id: "image", label: "截图", icon: ImageIcon },
                  { id: "audio", label: "语音", icon: Mic },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = inputType === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setInputType(item.id as InputType);
                        setAnalysis(null);
                        setError("");
                      }}
                      className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors", active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {inputType === "text" ? (
                <div className="space-y-3">
                  <textarea
                    value={rawText}
                    onChange={(event) => {
                      setRawText(event.target.value);
                      setAnalysis(null);
                    }}
                    placeholder="例如：明天安排王强去C区检查逆变器接线"
                    className="w-full min-h-32 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                  />
                  <button
                    onClick={analyzeText}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    生成预览
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                    {inputType === "image" ? <ImageIcon className="w-6 h-6" /> : <AudioLines className="w-6 h-6" />}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{inputType === "image" ? "上传聊天截图" : "上传口述音频"}</p>
                  <p className="text-xs text-slate-500 mt-1">当前无 AI，附件会作为来源凭证保存，待办标题需手动补充。</p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    <FileUp className="w-4 h-4" />
                    选择文件
                    <input
                      type="file"
                      className="hidden"
                      accept={inputType === "image" ? "image/*" : "audio/*"}
                      onChange={handleFileChange}
                    />
                  </label>
                  {attachment && <p className="text-xs text-slate-500 mt-3">已上传：{attachment.name}</p>}
                </div>
              )}

              {error && <div className="rounded-lg bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-600">{error}</div>}

              {analysis && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      待办预览
                    </h4>
                    <span className="text-xs text-slate-500">置信度 {Math.round(analysis.confidence * 100)}%</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">待办标题</span>
                      <input
                        value={analysis.title}
                        onChange={(event) => updateAnalysis({ title: event.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="请输入待办标题"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium text-slate-700">所属项目</span>
                      <select
                        value={selectedProjectValue}
                        onChange={(event) => {
                          const selected = allProjects.find((p: any) => p.id === event.target.value || p.name === event.target.value);
                          updateAnalysis({ projectId: selected?.id || "", projectName: selected?.name || "" });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white"
                      >
                        <option value="">请选择项目</option>
                        {allProjects.map((project: any) => (
                          <option key={project.id || project.name} value={project.id || project.name}>{project.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium text-slate-700">负责人</span>
                      <input
                        value={analysis.assignee}
                        onChange={(event) => updateAnalysis({ assignee: event.target.value })}
                        list="quick-intake-personnel"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="待指派"
                      />
                      <datalist id="quick-intake-personnel">
                        {personnelData.map((person: any) => <option key={person.id || person.name} value={person.name} />)}
                      </datalist>
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium text-slate-700">截止日期</span>
                      <div className="relative">
                        <CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="date"
                          value={analysis.deadline}
                          onChange={(event) => updateAnalysis({ deadline: event.target.value })}
                          className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">来源摘要</span>
                      <textarea
                        value={analysis.summary}
                        onChange={(event) => updateAnalysis({ summary: event.target.value })}
                        className="w-full min-h-20 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setAnalysis(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                      重新采集
                    </button>
                    <button
                      onClick={confirmTask}
                      disabled={isSaving || !analysis.title.trim() || !analysis.projectName}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                      加入待确认池
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
