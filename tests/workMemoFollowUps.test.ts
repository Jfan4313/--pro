import assert from "node:assert/strict";
import test from "node:test";
import { appendFollowUpToSchedule, buildTaskChain, canCreateFollowUp, createFollowUpRecord } from "../src/lib/workMemoFollowUps";

const parent = {
  id: "memo-1",
  title: "完成并网",
  projectId: "project-1",
  projectName: "腰古好邻居",
  creator: "安排人",
  assignee: "张三",
  assignees: ["张三"],
};

test("follow-up permissions allow the assignee and creator only", () => {
  assert.equal(canCreateFollowUp(parent, { name: "张三" }), true);
  assert.equal(canCreateFollowUp(parent, { name: "安排人" }), true);
  assert.equal(canCreateFollowUp(parent, { name: "其他人" }), false);
  assert.equal(canCreateFollowUp(parent, { role: "admin" }), true);
});

test("follow-up record keeps the task chain and inherits the project", () => {
  const record = createFollowUpRecord(parent, { title: "  复核整改  ", detail: "现场复核并记录照片", projectId: parent.projectId, projectName: parent.projectName, assignee: "李四", dueDate: "2026-08-25", priority: "normal" }, { name: "张三" }, "2026-08-22T00:00:00.000Z", "memo-2");
  assert.deepEqual({ parentMemoId: record.parentMemoId, rootMemoId: record.rootMemoId, relationType: record.relationType }, { parentMemoId: "memo-1", rootMemoId: "memo-1", relationType: "follow-up" });
  assert.equal(record.title, "复核整改");
  assert.equal(record.assignees[0], "李四");
});

test("follow-up is appended to the matching project schedule", () => {
  const record = createFollowUpRecord(parent, { title: "复核整改", detail: "", projectId: parent.projectId, projectName: parent.projectName, assignee: "李四", dueDate: "2026-08-25", priority: "normal" }, { name: "张三" }, "2026-08-22T00:00:00.000Z", "memo-2");
  const schedule = appendFollowUpToSchedule([{ id: "project-1", name: "腰古好邻居", tasks: [] }], record);
  assert.equal(schedule[0].tasks[0].parentMemoId, "memo-1");
  assert.equal(schedule[0].tasks[0].relationType, "follow-up");
});

test("task chain keeps parallel follow-ups and nested follow-ups", () => {
  const records = [
    { id: "root", title: "完成并网" },
    { id: "a", title: "整改接地", parentMemoId: "root", rootMemoId: "root", chainId: "root" },
    { id: "b", title: "补充影像", parentMemoId: "root", rootMemoId: "root", chainId: "root" },
    { id: "c", title: "复核整改", parentMemoId: "a", rootMemoId: "root", chainId: "root" },
  ];
  const chain = buildTaskChain(records, "root");
  assert.equal(chain.chainId, "root");
  assert.deepEqual(chain.byParent.get("root")?.map((item) => item.id), ["a", "b"]);
  assert.equal(chain.byParent.get("a")?.[0].title, "复核整改");
});
