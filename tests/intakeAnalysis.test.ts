import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntake, splitExplicitTaskList } from "../server/domain/intakeAnalysis.js";

test("splits explicitly numbered work arrangements into independent task lines", () => {
  const input = "1 惠州 600 千瓦制定合同，龙玲和公司签订施工合同\n2 新厂除锈，污水池，洗板运维和重新安装拆卸下来的组件\n3 强港红冲补开发票";
  assert.equal(splitExplicitTaskList(input).length, 3);
  assert.match(splitExplicitTaskList(input)[0], /惠州 600 千瓦/);
});

test("keeps the six-line work arrangement list as six fallback tasks", () => {
  const input = "1 惠州 600 千瓦制定合同，龙玲和公司签订施工合同。同步陈翔搞电网接入。向公司请款施工。\n2 新厂除锈，污水池，洗板运维和重新安装拆卸下来的组件，在节后进行，现在安排老曹把污水池的造价报给公司核价同意后推进。\n3 强港红冲补开发票，嫂子跟进一下，搞掂以后告诉我，需要把尾款收回了\n4 腰古好邻居把四可和电表时间安排好，小苏跟进这事。\n5，tgt 和威成坤我跟进。\n6 万力要等到陈仕斌确定时间再开工，提前落实好一些细节，一次搞掂不要留收尾，同时钻石需要收款加固费用的就收羊羽，现在并网了，加固钱还不给。";
  const result = analyzeIntake({ inputType: "text", text: input, projects: [], personnel: [] });
  assert.equal(result.items.length, 6);
});

test("quick intake recognizes an existing project and splits multiple assignees/tasks", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "明天 A区商业综合体让王强检查设备，李娜准备材料",
    projects: [{ id: "project-a", name: "A区商业综合体", projectNumber: "PRJ-0001" }],
    personnel: [{ id: "person-w", name: "王强" }, { id: "person-l", name: "李娜" }],
  });

  assert.equal(result.projectMatchType, "existing");
  assert.equal(result.projectId, "project-a");
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.assignees, ["王强", "李娜"]);
});

test("quick intake marks an explicitly mentioned unknown project as new", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "新项目滨江光伏项目明天让王强整理资料",
    projects: [],
    personnel: [{ id: "person-w", name: "王强" }],
  });

  assert.equal(result.projectMatchType, "new");
  assert.equal(result.projectName, "滨江光伏项目");
  assert.equal(result.items[0].assignee, "王强");
});

test("local fallback keeps completed statements as background and leaves missing fields blank", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "数据库已经完成了。然后整理事故分析报告",
    projects: [],
    personnel: [],
  });

  assert.deepEqual(result.backgroundNotes, ["数据库已经完成了"]);
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].title, /整理事故分析报告/);
  assert.equal(result.items[0].deadline, "");
  assert.ok(result.items[0].reviewReasons.includes("缺少负责人"));
});

test("local fallback matches a project name fragment and keeps coordinated objects in one detailed task", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "万力轮胎的处罚清单和事故分析报告今天做完，负责人后面选择",
    projects: [{ id: "project-penalty", name: "处罚万力轮胎" }],
    personnel: [],
  });

  assert.equal(result.projectMatchType, "existing");
  assert.equal(result.projectId, "project-penalty");
  assert.equal(result.projectName, "处罚万力轮胎");
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].title, /处罚清单/);
  assert.match(result.items[0].title, /事故分析报告/);
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.equal(result.items[0].deadline, localToday);
  assert.doesNotMatch(result.items[0].summary, /完成标准|负责人|截止日期|归属项目/);
});

test("local fallback extracts a spoken responsible person and creates a complete task title", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "万力轮胎今天需要把事故分析报告和处罚单完成，负责人苏俊鹏。",
    projects: [{ id: "project-penalty", name: "处罚万力轮胎" }],
    personnel: [],
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "完成事故分析报告和处罚单");
  assert.deepEqual(result.items[0].assignees, []);
  assert.deepEqual(result.items[0].responsibleEntities, []);
  assert.doesNotMatch(result.items[0].summary, /负责人|截止日期|项目：/);
});

test("local fallback merges project travel context into the following field task", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "今天去处罚万力轮胎，然后拍无人机以及飞一些无人机照片",
    projects: [{ id: "project-penalty", name: "处罚万力轮胎" }],
    personnel: [],
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].projectId, "project-penalty");
  assert.match(result.items[0].title, /拍摄无人机/);
  assert.doesNotMatch(result.items[0].title, /今天|去处罚万力轮胎/);
  assert.doesNotMatch(result.items[0].summary, /负责人|截止日期|归属项目/);
});

test("local fallback corrects a common speech variant to the strongest existing project", () => {
  const result = analyzeIntake({
    inputType: "text",
    text: "今天去腰鼓好邻居现场完成并网作业",
    projects: [{ id: "project-neighbor", name: "云浮腰古好邻居" }, { id: "project-grid", name: "智能微电网二期", projectNumber: "PRJ-0002" }],
    personnel: [],
  });

  assert.equal(result.projectId, "project-neighbor");
  assert.equal(result.projectName, "云浮腰古好邻居");
  assert.equal(result.projectMatchType, "existing");
  assert.doesNotMatch(result.items[0].summary, /负责人|截止日期|归属项目/);
});
