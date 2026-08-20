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
