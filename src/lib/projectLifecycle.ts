export const STAGES = [
  { 
    id: "1_initiation", 
    name: "① 项目立项(现场勘察/前期收资)", 
    desc: "完成现场勘察，收集地理位置、建筑结构、电房设备、用电需求等基础资料", 
    checklist: [
      { id: "site-survey", label: "现场勘察：结构照片、电房照片、设备照片归档" },
      { id: "c1", label: "现场勘察：屋顶结构与荷载初步确认" },
      { id: "c2", label: "业主与项目概况：业主资信及财务状况初筛（如涉及融资）" },
      { id: "c3", label: "现场勘察：航拍图与录像归档" },
      { id: "c4", label: "前期收资：建筑平面结构图收齐" },
      { id: "c5", label: "前期收资：过去完整12个月电费详情收齐" },
      { id: "c6", label: "前期收资：变压器与电房资料收齐" },
      { id: "c7", label: "前期收资：结算户信息确认" },
      { id: "c8", label: "产权与物业：产权证、土地证或租赁使用证明" },
      { id: "c9", label: "前期收资：电房电气图收齐" },
      { id: "c10", label: "产权与物业：产权信息清晰度确认" }
    ],
    fields: [
      { id: "f6", label: "项目合作类型", type: "select", options: ["EPC", "EMC", "未知"], placeholder: "请选择 EPC、EMC 或未知" },
      { id: "f1", label: "建筑屋顶可利用面积估算(㎡)", type: "text", placeholder: "㎡" },
      { id: "f2", label: "电价水平及用电性质", type: "text", placeholder: "例如: 大工业/一般工商业" },
      { id: "f3", label: "项目概况分析", type: "textarea", placeholder: "填写初步收集的项目概况..." },
      { id: "f4", label: "物业类型", type: "select", options: ["自主物业", "村物业", "租赁"], placeholder: "请选择物业类型" },
      { id: "f5", label: "业主需求", type: "textarea", placeholder: "填写业主对屋面建设、用电、收益或合作方式等需求..." }
    ],
    files: ["现场勘察/航拍图与录像", "前期收资/项目概况表", "产权与物业/产权资料"] 
  },
  { 
    id: "2_preliminary", 
    name: "② 初步设计", 
    desc: "初步的光伏铺设方案设计和材料清单编制", 
    checklist: [
      { id: "c1", label: "电气设计：完成并网接入点、电气系统图和设计说明" },
      { id: "c2", label: "项目模型：PVsyst、三维及组件排布模型完成" },
      { id: "c3", label: "结构设计：屋顶结构、荷载复核及支架基础确认" },
      { id: "c4", label: "项目设计资料：项目原图纸及建筑平面图收齐" },
      { id: "c5", label: "设备与成本：初步设备清单和成本预算完成" },
      { id: "c6", label: "项目照片：屋顶、电房及现场照片归档" },
      { id: "c7", label: "完成初步设计并提交技术总监审核" }
    ],
    fields: [
      { id: "f1", label: "初步预计装机容量(kW)", type: "text", placeholder: "kW" },
      { id: "f2", label: "拟定并网模式", type: "text", placeholder: "自发自用余电上网 / 全额上网" }
    ],
    files: ["项目设计资料/初步设计方案", "项目模型/PVsyst模型", "设备与成本/初步设备清单"] 
  },
  { 
    id: "3_business", 
    name: "③ 商务沟通", 
    desc: "与甲方对接初步方案，商务洽谈与成本预估", 
    checklist: [
      { id: "c1", label: "投资收益测算完成并归档" },
      { id: "c2", label: "商务条款、成本与报价初步对齐" },
      { id: "c3", label: "方案通过项目经理、管理层内部审批" },
      { id: "c4", label: "方案汇报：完成技术与商务方案汇报并记录会议纪要" },
      { id: "c5", label: "客户确认与定稿完成" },
      { id: "c6", label: "招投标资料：招标文件、技术标、商务标和报价文件归档" }
    ],
    fields: [
      { id: "f1", label: "预估单瓦造价(元/W)", type: "text", placeholder: "元/W" },
      { id: "f2", label: "预估项目IRR(%)", type: "text", placeholder: "%" },
      { id: "f3", label: "最终预计总装机量(KW)", type: "text", placeholder: "KW" },
      { id: "f4", label: "整体预算造价(万元)", type: "text", placeholder: "万元" }
    ],
    files: ["方案汇报/会议纪要", "成本与报价/最终实施造价表", "招投标资料/技术标"] 
  },
  { 
    id: "4_contract", 
    name: "④ 签订合同(最高权)", 
    desc: "商务合同签署。完成此阶段后方可确定施工日程和竣工时间", 
    requiresAuth: true, 
    checklist: [
      { id: "c1", label: "合同审批与盖章：法务、财务审核并形成盖章定稿" },
      { id: "c2", label: "合同协议：签订总承包、EMC或购售电合同" },
      { id: "c3", label: "账户与开票：付款账户、收票信息及银行联行号确认" },
      { id: "c4", label: "付款与履约：预付款到账或履约保证开具" },
      { id: "c5", label: "业主主体资料：营业执照、法人身份证、资信财务资料" },
      { id: "c6", label: "产权与使用权：产权证、安装同意书及租赁协议" },
      { id: "c7", label: "投资方资料：营业执照、法人身份证、开户及开票资料" },
      { id: "c8", label: "付款与履约：合同总金额及付款节点确认" }
    ], 
    fields: [
      { id: "f1", label: "合同总金额(万元)", type: "text", placeholder: "万元" },
      { id: "f2", label: "预付款/首付款比例(%)", type: "text", placeholder: "%" },
      { id: "f3", label: "合同生效日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f4", label: "约定的拟竣工时间", type: "text", placeholder: "YYYY-MM-DD" }
    ], 
    files: ["合同协议/EPC总承包合同", "合同审批与盖章/盖章定稿", "业主主体资料/营业执照"] 
  },
  { 
    id: "5_filing", 
    name: "⑤ 项目备案", 
    desc: "发改委项目备案与供电局接入批复", 
    checklist: [
      { id: "c1", label: "发改委项目立项备案" },
      { id: "c2", label: "发改委备案证书与文号归档" },
      { id: "c3", label: "供电局接入申请提交" },
      { id: "c4", label: "供电局接入批复及批复容量确认" }
    ], 
    fields: [
      { id: "f1", label: "发改委备案代码/文号", type: "text", placeholder: "填写备案号" },
      { id: "f2", label: "供电局批复接入容量(kW)", type: "text", placeholder: "kW" }
    ], 
    files: ["发改委项目备案/备案证书与文号", "供电局接入批复/接入批复"] 
  },
  {
    id: "6_detailed_design",
    name: "⑥ 深化设计",
    desc: "出具最终版施工蓝图，指导现场施工",
    checklist: [
      { id: "c1", label: "深化电气设计：接线图及电缆设计完成" },
      { id: "c2", label: "深化结构设计：结构加固及支架图完成" },
      { id: "c3", label: "电缆路径与线损计算书完成" },
      { id: "c4", label: "监控与通信系统方案完成" },
      { id: "c5", label: "最终物料BOM输出、版本锁定" },
      { id: "c6", label: "设计变更完成会审，设计院盖章蓝图归档" }
    ],
    fields: [
      { id: "f1", label: "深化设计直流侧装机容量(kW)", type: "text", placeholder: "kW" },
      { id: "f2", label: "设计方案容配比", type: "text", placeholder: "如: 1.25" }
    ],
    files: ["设计院盖章蓝图/已盖章", "设计变更/变更后图纸", "最终物料BOM/版本锁定"]
  },
  {
    id: "7_briefing",
    name: "⑦ 项目交底",
    desc: "技术与安全的现场交底与培训",
    checklist: [
      { id: "c1", label: "业主交底：方案范围、技术说明和施工日程确认" },
      { id: "c2", label: "业主交底：业主配合事项及确认签字完成" },
      { id: "c3", label: "施工交底：技术交底会议召开并记录签署" },
      { id: "c4", label: "施工交底：危险源辨识、应急预案和安全教育完成" },
      { id: "c5", label: "施工交底：特种作业人员资质审查" },
      { id: "c6", label: "施工交底：施工项目部管理体系建立" }
    ],
    fields: [
      { id: "f1", label: "现场项目经理/负责人姓名", type: "text", placeholder: "姓名" },
      { id: "f2", label: "专职安全生产监督员姓名", type: "text", placeholder: "姓名" },
      { id: "f3", label: "计划开工日期(二次确认)", type: "text", placeholder: "YYYY-MM-DD" }
    ],
    files: ["业主交底/业主确认与签字", "业主交底/施工日程与工期", "施工交底/交底会议记录与签字", "施工交底/安全教育与培训"]
  },
  { 
    id: "8_construction", 
    name: "⑧ 施工进场", 
    desc: "材料进场、施工日志及进度跟踪", 
    checklist: [
      { id: "c1", label: "施工图纸：电气、结构图纸及施工方案确认" },
      { id: "c2", label: "设备材料到场、开箱验收及清册签收" },
      { id: "c3", label: "施工日程、进度计划及周报台账持续更新" },
      { id: "c4", label: "施工实施：支架、组件、逆变器及电缆施工完成" },
      { id: "c5", label: "隐蔽工程、线缆测试及关键节点报验完成" },
      { id: "c6", label: "施工质量、安全检查及整改闭环" },
      { id: "c7", label: "施工照片与影像资料按子目录归档" }
    ], 
    fields: [
      { id: "f1", label: "实际进场施工日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f2", label: "首批组件安装日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f3", label: "施工高峰期最高进场人数", type: "text", placeholder: "人数" }
    ], 
    files: ["施工管理/施工周报与进度台账", "施工实施/光伏组件安装", "隐蔽工程与节点报验/关键节点报验"] 
  },
  { 
    id: "9_acceptance", 
    name: "⑨ 验收并网", 
    desc: "供电局验收、项目并网、竣工交付及决算", 
    checklist: [
      { id: "c1", label: "系统调试与监控：逆变器、通信及监控平台调试完成" },
      { id: "c2", label: "内部竣工预验收、消缺整改及复验完成" },
      { id: "c3", label: "竣工图纸与资料汇编完成" },
      { id: "c4", label: "并网资料整理：申请、批复、验收及电表资料齐全" },
      { id: "c5", label: "并网通知取得并完成并网运行记录" },
      { id: "c6", label: "运维交底、资产及设备资料移交完成" },
      { id: "c7", label: "项目决算、结算及付款收尾完成" }
    ], 
    fields: [
      { id: "f1", label: "实际并网日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f2", label: "实际首日产出并网电量(kWh)", type: "text", placeholder: "kWh" },
      { id: "f3", label: "项目最终决算金额(万元)", type: "text", placeholder: "万元" }
    ], 
    files: ["内部竣工预验收/复验确认", "并网资料整理/并网通知与证明", "运维交底与资产移交/资产移交"] 
  },
  {
    id: "10_operations",
    name: "⑩ 运营维护",
    desc: "项目并网后的运行监测、巡检、维修、质保和客户服务",
    checklist: [
      { id: "c1", label: "运维合同与联系人资料建立" },
      { id: "c2", label: "运行数据与日、月、年度发电量持续记录" },
      { id: "c3", label: "设备巡检计划和巡检报告闭环" },
      { id: "c4", label: "故障维修工单及设备更换记录闭环" },
      { id: "c5", label: "备品备件清单及出入库记录维护" },
      { id: "c6", label: "保险、质保资料和到期提醒维护" },
      { id: "c7", label: "客户运维反馈与服务记录闭环" }
    ],
    fields: [
      { id: "f1", label: "运维负责人", type: "text", placeholder: "姓名" },
      { id: "f2", label: "最近巡检日期", type: "text", placeholder: "YYYY-MM-DD" },
      { id: "f3", label: "累计发电量(kWh)", type: "text", placeholder: "kWh" }
    ],
    files: ["运行数据与发电量/月度发电量", "设备巡检/巡检报告", "故障维修记录/维修工单"]
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
