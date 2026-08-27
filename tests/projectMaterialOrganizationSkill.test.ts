import assert from "node:assert/strict";
import test from "node:test";
import { createMaterialOrganizationPlan, summarizeOrganizationPlan } from "../src/lib/projectMaterialOrganizationSkill";

test("整理 Skill 生成带日期的阶段与子目录目标路径", () => {
  const report: any = {
    id: "scan-test",
    rootNames: ["项目资料"],
    files: [{ id: "f1", projectKey: "流花中心", relativePath: "流花中心/招投标/技术标书.pdf", name: "技术标书.pdf", stageId: "3_business", category: "招投标资料/技术标", confidence: 0.96, evidence: ["目录：招投标"], needsReview: false, status: "classified" }],
  };
  const plan = createMaterialOrganizationPlan(report, "流花中心", "流花中心", "PRJ-0004");
  assert.match(plan.items[0].targetLogicalPath, /^03_商务沟通\/整理预览_\d{8}\/招投标资料\/技术标\/技术标书\.pdf$/);
  assert.deepEqual(summarizeOrganizationPlan(plan), { total: 1, ready: 1, review: 0, conflicts: 0 });
});

test("整理 Skill 将低置信度文件保留在待确认队列", () => {
  const report: any = { id: "scan-review", rootNames: ["项目资料"], files: [{ id: "f2", projectKey: "项目A", relativePath: "项目A/未知.txt", name: "未知.txt", category: "待复核", confidence: 0, evidence: [], needsReview: true, status: "needs-review" }] };
  const plan = createMaterialOrganizationPlan(report, "项目A", "项目A", undefined);
  assert.equal(plan.status, "draft");
  assert.equal(plan.items[0].operation, "needs-review");
  assert.match(plan.items[0].targetLogicalPath, /^未确定\//);
});
