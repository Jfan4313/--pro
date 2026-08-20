import assert from "node:assert/strict";
import test from "node:test";
import { scanProjectDirectories } from "../src/lib/projectScanner";

function fileEntry(name: string, content: string, lastModified = 1700000000000) {
  const file = new File([content], name, { type: "text/plain", lastModified });
  return { kind: "file", name, getFile: async () => file };
}

function directory(name: string, entries: any[]) {
  return { kind: "directory", name, async *values() { yield* entries; } };
}

test("扫描文本文件并根据阶段关键词识别阶段", async () => {
  const root = { name: "光伏项目资料", async *values() {
    yield fileEntry("现场勘察记录.txt", "现场勘察 建筑图 电房设备 项目概况");
    yield directory("node_modules", [fileEntry("ignored.txt", "不应被扫描")]);
  } };
  const report = await scanProjectDirectories([root]);
  assert.equal(report.fileCount, 1);
  assert.equal(report.files[0].stageId, "1_initiation");
  assert.equal(report.files[0].category, "现场勘察");
  assert.equal(report.rootNames[0], "光伏项目资料");
});

test("同内容文件会生成重复文件问题，扫描不会写入目录", async () => {
  const root = { name: "项目", async *values() {
    yield fileEntry("a.txt", "合同总金额 付款节点");
    yield fileEntry("b.txt", "合同总金额 付款节点");
  } };
  const report = await scanProjectDirectories([root]);
  assert.equal(report.fileCount, 2);
  assert.ok(report.issues.some((issue) => issue.type === "duplicate"));
});

test("从多项目第一层目录和阶段目录生成项目与阶段汇总", async () => {
  const root = { name: "项目", async *values() {
    yield directory("流花中心", [directory("01_项目立项", [fileEntry("现场勘察记录.txt", "现场勘察 建筑图")]), directory("开工资料", [fileEntry("施工方案.txt", "施工方案 安全交底")])]);
    yield directory("云浮腰古好邻居", [directory("02_初步设计", [fileEntry("设计方案.txt", "初步设计 图纸 组件")])]);
  } };
  const report = await scanProjectDirectories([root]);
  assert.equal(report.projects.length, 2);
  assert.equal(report.projects[0].projectName, "流花中心");
  assert.ok(report.projects[0].stageSummaries.some((stage) => stage.stageName === "01_项目立项"));
  assert.ok(report.projects[1].stageSummaries.some((stage) => stage.stageName === "02_初步设计"));
});
