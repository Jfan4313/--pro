import React, { useState } from "react";
import { Folder, FileText, CheckCircle2, ChevronRight, Upload, Clock, Shield, Download, Briefcase, ListTodo, FileCheck, ArrowRight, Save } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

export const STAGES = [
  { 
    id: "1_initiation", 
    name: "① 项目立项(前期收资)", 
    desc: "地理位置、环境条件、用电需求、相关政策等基础资料收集", 
    checklist: [
      { id: "c1", label: "屋顶结构材质及荷载初步勘察" },
      { id: "c2", label: "业主资信及财务状况初筛(如涉及融资)" },
      { id: "c3", label: "项目所在地航拍图及周边环境录像" },
      { id: "c4", label: "项目建筑图、平面图、结构图" },
      { id: "c5", label: "项目电费详情单（过去完整12个月）" },
      { id: "c6", label: "变压器规格、数量、电房位置、结算户信息" },
      { id: "c7", label: "项目产权资料与土地租赁/房产证证明" }
    ],
    fields: [
      { id: "f1", label: "建筑屋顶可利用面积估算(㎡)", type: "text", placeholder: "㎡" },
      { id: "f2", label: "电价水平及用电性质", type: "text", placeholder: "例如: 大工业/一般工商业" },
      { id: "f3", label: "项目概况分析", type: "textarea", placeholder: "填写初步收集的项目概况..." }
    ],
    files: ["无人机航拍.mp4", "项目概况表.pdf"] 
  },
  { 
    id: "2_preliminary", 
    name: "② 初步设计", 
    desc: "初步的光伏铺设方案设计和材料清单编制", 
    checklist: [
      { id: "c1", label: "光照条件及地形初步分析" },
      { id: "c2", label: "周边阴影遮挡分析及排布优化" },
      { id: "c3", label: "电气接入点(并网点)初步确认" },
      { id: "c4", label: "初步设备的选型(组件、逆变器等)" },
      { id: "c5", label: "完成初步设计并提交技术总监审核" }
    ],
    fields: [
      { id: "f1", label: "初步预计装机容量(kW)", type: "text", placeholder: "kW" },
      { id: "f2", label: "拟定并网模式", type: "text", placeholder: "自发自用余电上网 / 全额上网" }
    ],
    files: ["初步设计方案.pdf", "Pvsyst发电分析.pdf", "初步设备清单及成本预算.xlsx"] 
  },
  { 
    id: "3_business", 
    name: "③ 商务沟通", 
    desc: "与甲方对接初步方案，商务洽谈与成本预估", 
    checklist: [
      { id: "c1", label: "投资收益率(IRR)及静态回收期测算" },
      { id: "c2", label: "项目付款节点及商务条款初步对齐" },
      { id: "c3", label: "方案通过项目经理、管理层内部审批" },
      { id: "c4", label: "向客户汇报技术与商务方案" },
      { id: "c5", label: "甲方确认方案设计并定稿" }
    ],
    fields: [
      { id: "f1", label: "预估单瓦造价(元/W)", type: "text", placeholder: "元/W" },
      { id: "f2", label: "预估项目IRR(%)", type: "text", placeholder: "%" },
      { id: "f3", label: "最终预计总装机量(KW)", type: "text", placeholder: "KW" },
      { id: "f4", label: "整体预算造价(万元)", type: "text", placeholder: "万元" }
    ],
    files: ["会议纪要_方案汇报.pdf", "最终实施造价表.xlsx"] 
  },
  { 
    id: "4_contract", 
    name: "④ 签订合同(最高权)", 
    desc: "商务合同签署。完成此阶段后方可确定施工日程和竣工时间", 
    requiresAuth: true, 
    checklist: [
      { id: "c1", label: "法务及财务人员核对商务合同" },
      { id: "c2", label: "签订总承包合同并盖章" },
      { id: "c3", label: "甲方付款账户及收票信息确认" },
      { id: "c4", label: "项目预付款(首笔款)到账核实或履约保证开具" }
    ], 
    fields: [
      { id: "f1", label: "合同总金额(万元)", type: "text", placeholder: "万元" },
      { id: "f2", label: "预付款/首付款比例(%)", type: "text", placeholder: "%" },
      { id: "f3", label: "合同生效日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f4", label: "约定的拟竣工时间", type: "text", placeholder: "YYYY-MM-DD" }
    ], 
    files: ["总承包合同_已盖章.pdf"] 
  },
  { 
    id: "5_filing", 
    name: "⑤ 项目备案", 
    desc: "发改委立项与电力、规划部门的相关报建手续", 
    checklist: [
      { id: "c1", label: "发改委项目立项备案" },
      { id: "c2", label: "项目环境影响评估表(如需)" },
      { id: "c3", label: "施工图审查及规划报建许可" },
      { id: "c4", label: "消防设计告知及审批(如需)" },
      { id: "c5", label: "供电局接入批复申请与获取" }
    ], 
    fields: [
      { id: "f1", label: "发改委备案代码/文号", type: "text", placeholder: "填写备案号" },
      { id: "f2", label: "供电局批复接入容量(kW)", type: "text", placeholder: "kW" }
    ], 
    files: ["发改委项目备案证.pdf", "规划许可证.pdf", "接入批复文件.pdf"] 
  },
  {
    id: "6_detailed_design",
    name: "⑥ 深化设计",
    desc: "出具最终版施工蓝图，指导现场施工",
    checklist: [
      { id: "c1", label: "完成深化版电气接线图" },
      { id: "c2", label: "完成深化版结构加固/支架图" },
      { id: "c3", label: "电缆路径敷设规划及线损计算书" },
      { id: "c4", label: "数据采集与监控通信系统方案设计" },
      { id: "c5", label: "最终物料BOM清单输出并锁定" },
      { id: "c6", label: "蓝图由设计院盖出图章" }
    ],
    fields: [
      { id: "f1", label: "深化设计直流侧装机容量(kW)", type: "text", placeholder: "kW" },
      { id: "f2", label: "设计方案容配比", type: "text", placeholder: "如: 1.25" }
    ],
    files: ["最终蓝图施工图(全套).dwg", "设计变更单.pdf", "物料BOM明细单.xlsx"]
  },
  {
    id: "7_briefing",
    name: "⑦ 项目交底",
    desc: "技术与安全的现场交底与培训",
    checklist: [
      { id: "c1", label: "技术交底会议召开并记录签署" },
      { id: "c2", label: "现场危险源辨识及应急预案确认" },
      { id: "c3", label: "施工方特种作业人员资质(电工证/登高证等)审查" },
      { id: "c4", label: "三级安全教育与现场交底完成" },
      { id: "c5", label: "建立施工项目部管理体系" }
    ],
    fields: [
      { id: "f1", label: "现场项目经理/负责人姓名", type: "text", placeholder: "姓名" },
      { id: "f2", label: "专职安全生产监督员姓名", type: "text", placeholder: "姓名" },
      { id: "f3", label: "计划开工日期(二次确认)", type: "text", placeholder: "YYYY-MM-DD" }
    ],
    files: ["安全培训记录表.pdf", "技术交底记录.pdf", "危险源辨识清单.pdf"]
  },
  { 
    id: "8_construction", 
    name: "⑧ 施工进场", 
    desc: "材料进场、施工日志及进度跟踪", 
    checklist: [
      { id: "c1", label: "支架基础生根固化验证通过" },
      { id: "c2", label: "光伏组件、逆变器到场开箱抽检签收" },
      { id: "c3", label: "隐蔽工程(接地/预埋等)及关键节点报验" },
      { id: "c4", label: "直流/交流线缆敷设完成并进行绝缘电阻测试" },
      { id: "c5", label: "每日进度日志与台账更新录入" }
    ], 
    fields: [
      { id: "f1", label: "实际进场施工日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f2", label: "首批组件安装日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f3", label: "施工高峰期最高进场人数", type: "text", placeholder: "人数" }
    ], 
    files: ["第一周施工周报.docx", "现场施工照片与台账.zip", "隐蔽工程验收单.pdf"] 
  },
  { 
    id: "9_acceptance", 
    name: "⑨ 验收并网", 
    desc: "供电局验收、项目并网、竣工交付及决算", 
    checklist: [
      { id: "c1", label: "逆变器通信调试及监控平台打通" },
      { id: "c2", label: "内部竣工预验收及消缺整改完成" },
      { id: "c3", label: "编制并提交竣工图纸资料合集" },
      { id: "c4", label: "供电局智能双向电表安装完成" },
      { id: "c5", label: "供电局并网验收及并网供电成功" },
      { id: "c6", label: "甲方运维操作交底与资产移交" },
      { id: "c7", label: "项目整体资料归档最终决算" }
    ], 
    fields: [
      { id: "f1", label: "实际并网日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f2", label: "实际首日产出并网电量(kWh)", type: "text", placeholder: "kWh" },
      { id: "f3", label: "项目最终决算金额(万元)", type: "text", placeholder: "万元" }
    ], 
    files: ["竣工验收报告.pdf", "并网通知书.pdf", "移交证书.pdf"] 
  },
];

export const getProjectCurrentStageInfo = (projectId: string, lifecycleStates: Record<string, any>) => {
  const projState = lifecycleStates[projectId] || {};
  
  let currentStageIndex = 0;
  
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const stageId = STAGES[i].id;
    const stageState = projState[stageId];
    if (stageState) {
      const hasCheckedItems = stageState.checklist && Object.values(stageState.checklist).some(v => v === true);
      const hasFiles = stageState.files && stageState.files.length > 0;
      const hasFields = stageState.fields && Object.values(stageState.fields).some(v => v !== "");
      
      if (hasCheckedItems || hasFiles || hasFields) {
        currentStageIndex = i;
        break;
      }
    }
  }
  
  return {
    stage: STAGES[currentStageIndex],
    index: currentStageIndex,
    progressPercent: Math.round(((currentStageIndex + 1) / STAGES.length) * 100)
  };
};

export function ProjectLifecycle() {
  const [boardData] = useFirebaseSync("projectBoardData", []);
  const [lifecycleStates, setLifecycleStates] = useFirebaseSync<Record<string, any>>("projectLifecycleStates", {});
  
  const allProjects = Array.isArray(boardData) 
    ? boardData.flatMap((col: any) => col.projects || [])
    : [];

  const [selectedProject, setSelectedProject] = useState<string | null>(allProjects[0]?.id || null);
  const [activeStage, setActiveStage] = useState(STAGES[0].id);

  const activeProj = allProjects.find((p: any) => p.id === selectedProject) || allProjects[0];
  
  // Safe accessor for current project state
  const projState = activeProj ? (lifecycleStates[activeProj.id] || {}) : {};
  const stageState = projState[activeStage] || { checklist: {}, fields: {} };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if(!activeProj) return;
      const file = e.target.files[0];
      const stage = STAGES.find(s => s.id === activeStage);
      if(!stage) return;
      
      const projName = activeProj.name;
      
      const extMatch = file.name.match(/\.([^.]+)$/);
      const ext = extMatch ? `.${extMatch[1]}` : "";
      const baseName = file.name.replace(ext, "");
      
      // Default files if the state is empty
      const defaultFiles = stage.files.map((f, i) => ({
        name: f,
        originalBase: f.split('.')[0],
        uploadTime: `2026-04-${(20 + i).toString().padStart(2, '0')} 14:30`,
        version: "V1",
        isCustom: false
      }));

      const currentFiles = stageState.files || defaultFiles;
      
      const sameBaseFiles = currentFiles.filter((f: any) => f.originalBase === baseName);
      const version = `V${sameBaseFiles.length + 1}`;
      
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const stageShortName = stage.name.split(' ')[1] || '阶段';
      
      const newFileName = `${projName}_${stageShortName}_${baseName}_${version}${ext}`;
      
      const newFileObj = {
        name: newFileName,
        originalBase: baseName,
        uploadTime: timeStr,
        version: version,
        isCustom: true
      };
      
      setLifecycleStates(prev => ({
        ...prev,
        [activeProj.id]: {
          ...(prev[activeProj.id] || {}),
          [activeStage]: {
            ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
            files: [...currentFiles, newFileObj]
          }
        }
      }));
      
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件已自动命名并记录上传时间' }));
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveData = () => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '阶段数据已保存' }));
  };

  const updateChecklist = (checkId: string, checked: boolean) => {
    if(!activeProj) return;
    setLifecycleStates(prev => ({
      ...prev,
      [activeProj.id]: {
        ...(prev[activeProj.id] || {}),
        [activeStage]: {
          ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
          checklist: {
            ...((prev[activeProj.id] || {})[activeStage] || {}).checklist,
            [checkId]: checked
          }
        }
      }
    }));
  };

  const updateField = (fieldId: string, value: string) => {
    if(!activeProj) return;
    setLifecycleStates(prev => ({
      ...prev,
      [activeProj.id]: {
        ...(prev[activeProj.id] || {}),
        [activeStage]: {
          ...((prev[activeProj.id] || {})[activeStage] || { checklist: {}, fields: {} }),
          fields: {
            ...((prev[activeProj.id] || {})[activeStage] || {}).fields,
            [fieldId]: value
          }
        }
      }
    }));
  };

  return (
    <div className="flex h-full bg-[#f8fafc] animate-in fade-in duration-300">
      {/* Sidebar: Projects List */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0 z-10 shadow-sm relative">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 tracking-tight">
            <Folder className="w-5 h-5 text-indigo-600" />
            项目档案与流程
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">进行中的项目</div>
          {allProjects.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={cn(
                "w-full flex flex-col text-left px-4 py-3 rounded-xl transition-all duration-200 border",
                selectedProject === p.id 
                  ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                  : "bg-white border-slate-100 hover:border-indigo-100 hover:bg-slate-50"
              )}
            >
              <div className={cn("font-medium text-sm truncate mb-1.5", selectedProject === p.id ? "text-indigo-900" : "text-slate-900")}>
                {p.name}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{p.type}</span>
                <span>{p.manager}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {activeProj ? (
          <>
            <div className="p-6 bg-slate-50/50 border-b border-slate-200 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{activeProj.name}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md text-xs font-medium">编号: TS-{activeProj.id.toUpperCase().replace('P', '2026')}</span>
                    <span className="text-slate-500 text-sm flex items-center gap-1.5"><Briefcase className="w-4 h-4" />负责人: {activeProj.manager}</span>
                    <span className="text-slate-500 text-sm flex items-center gap-1.5"><Clock className="w-4 h-4" />竣工计划: {activeProj.dueDate}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Stages Timeline */}
              <div className="w-64 bg-slate-50/80 border-r border-slate-200 p-4 overflow-y-auto shrink-0 flex flex-col gap-1 custom-scrollbar">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 pt-2">归档七阶段 (EPC流程)</div>
                {STAGES.map((stage, idx) => {
                  const isActive = activeStage === stage.id;
                  const isCompleted = STAGES.findIndex(s => s.id === activeStage) > idx;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveStage(stage.id)}
                      className={cn(
                        "w-full text-left px-3 py-3 rounded-lg flex gap-3 transition-colors duration-200 border mt-1",
                        isActive ? "bg-white border-indigo-200 shadow-sm" : "border-transparent hover:bg-slate-100/80"
                      )}
                    >
                      <div className="shrink-0 pt-0.5 relative z-10 bg-inherit">
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 bg-white rounded-full" />
                        ) : isActive ? (
                          <div className="w-5 h-5 rounded-full border-2 border-indigo-600 flex items-center justify-center bg-white">
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300 bg-white" />
                        )}
                      </div>
                      <div className="flex-1 relative z-10">
                        <div className={cn(
                          "text-sm font-bold flex items-center gap-1.5 leading-tight",
                          isActive ? "text-indigo-700" : "text-slate-700"
                        )}>
                          {stage.name.split(' ')[1]}
                        </div>
                        {stage.requiresAuth && (
                          <div className="text-[10px] mt-1 text-rose-500 flex items-center gap-1 font-medium bg-rose-50 w-max px-1.5 py-0.5 rounded border border-rose-100">
                            <Shield className="w-3 h-3" /> 高权限要求
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Stage Details */}
              <div className="flex-1 bg-white p-8 overflow-y-auto w-full custom-scrollbar">
                {(() => {
                  const stage = STAGES.find(s => s.id === activeStage)!;
                  return (
                    <div className="max-w-4xl">
                      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            {stage.name}
                          </h2>
                          <p className="text-slate-500 text-sm mt-2 flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                            {stage.desc}
                          </p>
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <button 
                          onClick={handleUploadClick}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          上传规范资料
                        </button>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-6">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-indigo-500" />
                            阶段任务与表单
                          </h3>
                        </div>
                        <div className="p-6">
                          {(!stage.checklist || stage.checklist.length === 0) && (!stage.fields || stage.fields.length === 0) ? (
                            <div className="text-slate-400 text-sm py-4 text-center">本阶段无需填写表单或待办</div>
                          ) : (
                            <div className="space-y-6">
                              {stage.checklist && stage.checklist.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-slate-400" />前置工作清单
                                  </h4>
                                  <div className="space-y-2">
                                    {stage.checklist.map((item: any) => (
                                      <label key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors">
                                        <input 
                                          type="checkbox" 
                                          className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                          checked={stageState.checklist?.[item.id] || false}
                                          onChange={(e) => updateChecklist(item.id, e.target.checked)}
                                        />
                                        <span className={cn("text-sm transition-colors", stageState.checklist?.[item.id] ? "text-slate-400 line-through" : "text-slate-700 font-medium")}>{item.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {stage.fields && stage.fields.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-slate-400" />阶段数据录入
                                  </h4>
                                  <div className="space-y-4">
                                    {stage.fields.map((field: any) => (
                                      <div key={field.id}>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                                        {field.type === 'textarea' ? (
                                          <textarea 
                                            rows={3} 
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none text-sm"
                                            placeholder={field.placeholder}
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
                                          />
                                        ) : (
                                          <input 
                                            type="text" 
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                                            placeholder={field.placeholder}
                                            value={stageState.fields?.[field.id] || ''}
                                            onChange={(e) => updateField(field.id, e.target.value)}
                                            onBlur={handleSaveData}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Folder className="w-4 h-4 text-indigo-500" />
                            阶段归档文件
                          </h3>
                        </div>
                        
                        {(!stageState.files && stage.files.length === 0) || (stageState.files && stageState.files.length === 0) ? (
                          <div className="px-6 py-16 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                            <Folder className="w-16 h-16 mb-4 text-slate-200 fill-slate-100" />
                            <p className="text-base font-medium text-slate-600">该阶段暂无对应归档资料</p>
                            <p className="text-sm mt-1">请项目经理和审核人员及时上传相关过程文件进行记录</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {(() => {
                              const filesToRender = stageState.files || stage.files.map((f: string, i: number) => ({
                                name: f,
                                originalBase: f.split('.')[0],
                                uploadTime: `2026-04-${(20 + i).toString().padStart(2, '0')} 14:30`,
                                version: "V1",
                                isCustom: false
                              }));
                              
                              return filesToRender.map((fileObj: any, i: number) => {
                                const fileName = fileObj.name;
                                const isPdf = fileName.endsWith('.pdf');
                                const isDwg = fileName.endsWith('.dwg');
                                const isXlsx = fileName.endsWith('.xlsx');
                                const isZip = fileName.endsWith('.zip');
                                const isVideo = fileName.endsWith('.mp4');
                                
                                let FileIcon = FileText;
                                let iconColor = "text-indigo-600";
                                let bgColor = "bg-indigo-50";
                                let borderColor = "border-indigo-100";
                                
                                if (isPdf) { iconColor = "text-rose-600"; bgColor = "bg-rose-50"; borderColor = "border-rose-100"; }
                                if (isDwg) { iconColor = "text-blue-600"; bgColor = "bg-blue-50"; borderColor = "border-blue-100"; }
                                if (isXlsx) { iconColor = "text-emerald-600"; bgColor = "bg-emerald-50"; borderColor = "border-emerald-100"; }
                                if (isZip) { iconColor = "text-amber-600"; bgColor = "bg-amber-50"; borderColor = "border-amber-100"; }
                                
                                return (
                                  <div key={i} className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors group">
                                    <div className="flex items-center gap-4">
                                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm", bgColor, borderColor, iconColor)}>
                                        <FileIcon className="w-6 h-6" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{fileName}</p>
                                          {fileObj.version && (
                                            <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono text-slate-500 font-bold">
                                              {fileObj.version}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                          <span>{fileObj.uploadTime}</span>
                                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600 font-sans font-medium">已归档</span></span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => window.dispatchEvent(new CustomEvent('show-toast', { detail: '已开始下载' }))} className="p-2.5 px-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium text-xs rounded-lg transition-colors border border-indigo-100 flex items-center gap-1.5">
                                        <Download className="w-4 h-4" /> 下载
                                      </button>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <Folder className="w-20 h-20 mb-4 text-slate-200 fill-slate-100" />
            <p className="text-xl font-bold text-slate-600">暂无项目数据</p>
            <p className="text-sm mt-2">请先在多项目看板中创建项目，这里将统一管理各项目的7大流程与档案</p>
          </div>
        )}
      </div>
    </div>
  );
}
