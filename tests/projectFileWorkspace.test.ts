import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectFileWorkspace, filesForDirectory, versionsForFile } from "../src/lib/projectFileWorkspace";

const stages = [
  { id: "1_initiation", name: "① 项目立项(现场勘察/前期收资)", files: ["现场勘察/照片"] },
  { id: "2_preliminary", name: "② 初步设计", files: ["设计资料/方案"] },
];

test("统一资料工作台建立阶段、分类和多级子目录", () => {
  const workspace = buildProjectFileWorkspace([{ stageId: "1_initiation", files: [
    { storageProvider: "local-folder", storageKey: "PRJ-0001_测试/01_项目立项(现场勘察_前期收资)/01_现场勘察/01_照片/屋顶_V1_20260827.jpg", originalName: "屋顶.jpg", storedName: "屋顶_V1_20260827.jpg", category: "01_现场勘察/01_照片", version: "V1", size: 1024, createdAt: "2026-08-27T08:00:00.000Z", checksum: "a" },
  ] }], [], stages);

  assert.equal(workspace.totalFiles, 1);
  assert.equal(workspace.localFiles, 1);
  assert.equal(workspace.directories.length, 2);
  assert.equal(workspace.directories[0].children[0].name, "01_现场勘察");
  assert.equal(workspace.directories[0].children[0].children[0].name, "01_照片");
  assert.equal(filesForDirectory(workspace, "1_initiation/01_现场勘察").length, 1);
  assert.equal(workspace.directories[1].count, 0);
});

test("本机文件和相同校验值的远程清单合并为一个条目", () => {
  const workspace = buildProjectFileWorkspace([{ stageId: "1_initiation", files: [
    { storageProvider: "local-folder", storageKey: "PRJ-0001/01_项目立项/01_现场勘察/照片_V1_20260827.jpg", originalName: "照片.jpg", storedName: "照片_V1_20260827.jpg", category: "01_现场勘察", version: "V1", size: 2048, createdAt: "2026-08-27T08:00:00.000Z", checksum: "same" },
  ] }], [{ id: "manifest-1", projectId: "p1", stageId: "1_initiation", originalName: "照片.jpg", logicalPath: "另一台电脑/照片.jpg", category: "01_现场勘察", classificationSource: "folder", classificationConfidence: 1, reviewStatus: "confirmed", classificationEvidence: "目录", size: 2048, contentType: "image/jpeg", checksum: "same", version: "V1", bucket: "已归档", availability: "uploaded", lastIndexedAt: "2026-08-27T08:00:00.000Z", visibility: "project", canViewContent: true }], stages);

  assert.equal(workspace.totalFiles, 1);
  assert.equal(workspace.files.length, 1);
  assert.equal(workspace.files[0].canOpenLocal, true);
  assert.equal(workspace.files[0].manifest?.id, "manifest-1");
});

test("远程状态、异常数量和历史版本可统一展示", () => {
  const manifests: any[] = [
    { id: "m1", projectId: "p1", stageId: "2_preliminary", originalName: "方案.docx", logicalPath: "PRJ-0001/02_初步设计/01_设计资料/方案_V1_20260826.docx", category: "01_设计资料", size: 100, version: "V1", availability: "uploaded", lastIndexedAt: "2026-08-26T08:00:00.000Z", canViewContent: true },
    { id: "m2", projectId: "p1", stageId: "2_preliminary", originalName: "方案.docx", logicalPath: "PRJ-0001/02_初步设计/01_设计资料/方案_V2_20260827.docx", category: "01_设计资料", size: 120, version: "V2", availability: "stale", lastIndexedAt: "2026-08-27T08:00:00.000Z", canViewContent: false },
    { id: "m3", projectId: "p1", stageId: "2_preliminary", originalName: "清单.xlsx", logicalPath: "PRJ-0001/02_初步设计/02_设备清单/清单.xlsx", category: "02_设备清单", size: 80, version: "V1", availability: "missing", lastIndexedAt: "2026-08-27T08:00:00.000Z", canViewContent: false },
  ];
  const workspace = buildProjectFileWorkspace([], manifests, stages);
  const latestPlan = workspace.files.find((file) => file.groupKey.includes("方案") && file.isLatestVersion)!;

  assert.equal(workspace.totalFiles, 2);
  assert.equal(workspace.remoteFiles, 0);
  assert.equal(workspace.issueFiles, 2);
  assert.equal(latestPlan.versionNumber, 2);
  assert.equal(latestPlan.versionCount, 2);
  assert.deepEqual(versionsForFile(workspace, latestPlan).map((file) => file.versionNumber), [2, 1]);
});
