export const STAGES = [
  { 
    id: "1_initiation", 
    name: "① 项目立项(现场勘察/前期收资)", 
    desc: "完成现场勘察，收集地理位置、建筑结构、电房设备、用电需求等基础资料", 
    checklist: [
      { id: "site-survey", label: "完成现场勘察并归档结构、电房及设备分类照片" },
      { id: "c1", label: "屋顶结构材质及荷载初步勘察" },
      { id: "c2", label: "业主资信及财务状况初筛(如涉及融资)" },
      { id: "c3", label: "项目所在地航拍图及周边环境录像" },
      { id: "c4", label: "项目建筑图、平面图、结构图" },
      { id: "c5", label: "项目电费详情单（过去完整12个月）" },
      { id: "c6", label: "变压器规格、数量、电房位置" },
      { id: "c7", label: "结算户信息" },
      { id: "c8", label: "项目产权资料与房产证/土地租赁证明" },
      { id: "c9", label: "电房电气图" },
      { id: "c10", label: "产权信息清晰度确认" }
    ],
    fields: [
      { id: "f6", label: "项目合作类型", type: "select", options: ["EPC", "EMC", "未知"], placeholder: "请选择 EPC、EMC 或未知" },
      { id: "f1", label: "建筑屋顶可利用面积估算(㎡)", type: "text", placeholder: "㎡" },
      { id: "f2", label: "电价水平及用电性质", type: "text", placeholder: "例如: 大工业/一般工商业" },
      { id: "f3", label: "项目概况分析", type: "textarea", placeholder: "填写初步收集的项目概况..." },
      { id: "f4", label: "物业类型", type: "select", options: ["自主物业", "村物业", "租赁"], placeholder: "请选择物业类型" },
      { id: "f5", label: "业主需求", type: "textarea", placeholder: "填写业主对屋面建设、用电、收益或合作方式等需求..." }
    ],
    files: ["无人机航拍.mp4", "项目概况表.pdf"] 
  },
  { 
    id: "2_preliminary", 
    name: "② 初步设计", 
    desc: "初步的光伏铺设方案设计和材料清单编制", 
    checklist: [
      { id: "c1", label: "光伏铺设设计（光照、地势、阴影遮挡及排布优化）" },
      { id: "c2", label: "模型建模完成" },
      { id: "c3", label: "结构复核及荷载适配确认" },
      { id: "c4", label: "电气接入点(并网点)初步确认" },
      { id: "c5", label: "初步设备的选型(组件、逆变器等)" },
      { id: "c6", label: "设计图纸/设计稿上传并完成确认" },
      { id: "c7", label: "完成初步设计并提交技术总监审核" }
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
      { id: "c4", label: "项目预付款(首笔款)到账核实或履约保证开具" },
      { id: "c5", label: "业主单位营业执照" },
      { id: "c6", label: "业主单位法人身份证" },
      { id: "c7", label: "产权证/土地证/不动产权证等正式产权资料" },
      { id: "c8", label: "光伏安装同意书及村物业/租赁使用协议（按物业类型）" },
      { id: "c9", label: "结算户及开票信息" },
      { id: "c10", label: "投资方营业执照" },
      { id: "c11", label: "投资方法人身份证" },
      { id: "c12", label: "投资方开户许可证" },
      { id: "c13", label: "投资方开票信息及银行联行号" },
      { id: "c14", label: "项目总投资金额" },
      { id: "c15", label: "合同能源管理合同/能源服务管理合同（EMC适用）" }
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

export function getLifecycleChecklist(stage: any, stageState: any = {}, includeInvestmentMaterials = true, projectState: any = {}) {
  let checklist = [...(stage.checklist || [])];
  const initiationState = projectState?.["1_initiation"] || (stage.id === "1_initiation" ? stageState : {});
  const projectMode = initiationState.fields?.f6 || "未知";
  const propertyType = initiationState.fields?.f4;
  const investmentItemIds = stage.id === "1_initiation"
    ? ["c13", "c14", "c15", "c16", "c17", "c18"]
    : ["c10", "c11", "c12", "c13", "c14", "c15"];
  if (stage.id === "1_initiation" && !includeInvestmentMaterials) {
    checklist = checklist.filter((item: any) => !investmentItemIds.includes(item.id));
  }
  if (stage.id === "4_contract" && projectMode !== "EMC") {
    return checklist.filter((item: any) => !investmentItemIds.includes(item.id));
  }
  if (stage.id === "1_initiation" && ["村物业", "租赁"].includes(propertyType)) {
    checklist.push({ id: "c11", label: "光伏安装同意书（村物业/租赁必需）" });
  }
  if (stage.id === "1_initiation" && propertyType === "村物业") {
    checklist.push({ id: "c12", label: "村物业租赁/屋顶使用协议" });
  }
  if (stage.id === "1_initiation" && propertyType === "租赁") {
    checklist.push({ id: "c13", label: "租赁合同/屋顶使用协议" });
  }
  return checklist;
}

export const getProjectCurrentStageInfo = (projectId: string, lifecycleStates: Record<string, any>) => {
  const projState = lifecycleStates[projectId] || {};
  let currentStageIndex = projState.currentStageId ? Math.max(0, STAGES.findIndex((stage) => stage.id === projState.currentStageId)) : 0;
  
  if (!projState.currentStageId) for (let i = STAGES.length - 1; i >= 0; i--) {
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

function formatUploadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}
