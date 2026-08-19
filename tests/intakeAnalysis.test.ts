import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntake } from "../server/domain/intakeAnalysis.js";

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
