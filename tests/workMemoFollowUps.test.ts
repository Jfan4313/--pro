import assert from "node:assert/strict";
import test from "node:test";
import {
  appendFollowUpToSchedule,
  buildTaskChain,
  canCreateFollowUp,
  canDeleteWorkMemo,
  canManageWorkMemo,
  createFollowUpRecord,
  getTaskParentOptions,
  reparentTaskRecords,
} from "../src/lib/workMemoFollowUps";

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
  const record = createFollowUpRecord(
    parent,
    {
      title: "  复核整改  ",
      detail: "现场复核并记录照片",
      projectId: parent.projectId,
      projectName: parent.projectName,
      assignee: "李四",
      dueDate: "2026-08-25",
      priority: "normal",
    },
    { name: "张三" },
    "2026-08-22T00:00:00.000Z",
    "memo-2",
  );
  assert.deepEqual(
    {
      parentMemoId: record.parentMemoId,
      rootMemoId: record.rootMemoId,
      relationType: record.relationType,
    },
    { parentMemoId: "memo-1", rootMemoId: "memo-1", relationType: "follow-up" },
  );
  assert.equal(record.title, "复核整改");
  assert.equal(record.assignees[0], "李四");
});

test("follow-up is appended to the matching project schedule", () => {
  const record = createFollowUpRecord(
    parent,
    {
      title: "复核整改",
      detail: "",
      projectId: parent.projectId,
      projectName: parent.projectName,
      assignee: "李四",
      dueDate: "2026-08-25",
      priority: "normal",
    },
    { name: "张三" },
    "2026-08-22T00:00:00.000Z",
    "memo-2",
  );
  const schedule = appendFollowUpToSchedule(
    [{ id: "project-1", name: "腰古好邻居", tasks: [] }],
    record,
  );
  assert.equal(schedule[0].tasks[0].parentMemoId, "memo-1");
  assert.equal(schedule[0].tasks[0].relationType, "follow-up");
});

test("task chain keeps parallel follow-ups and nested follow-ups", () => {
  const records = [
    { id: "root", title: "完成并网" },
    {
      id: "a",
      title: "整改接地",
      parentMemoId: "root",
      rootMemoId: "root",
      chainId: "root",
    },
    {
      id: "b",
      title: "补充影像",
      parentMemoId: "root",
      rootMemoId: "root",
      chainId: "root",
    },
    {
      id: "c",
      title: "复核整改",
      parentMemoId: "a",
      rootMemoId: "root",
      chainId: "root",
    },
  ];
  const chain = buildTaskChain(records, "root");
  assert.equal(chain.chainId, "root");
  assert.deepEqual(
    chain.byParent.get("root")?.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(chain.byParent.get("a")?.[0].title, "复核整改");
});

test("only creator and administrator can edit or delete a work memo", () => {
  assert.equal(canManageWorkMemo(parent, { name: "安排人" }), true);
  assert.equal(canManageWorkMemo(parent, { name: "张三" }), false);
  assert.equal(canManageWorkMemo(parent, { role: "admin" }), true);
  assert.equal(canManageWorkMemo(parent, { role: "company_admin" }), true);
});

test("parent options stay in the same project and prevent cycles", () => {
  const records = [
    { id: "root", title: "主任务", projectId: "p1" },
    { id: "child", title: "子任务", projectId: "p1", parentMemoId: "root" },
    { id: "leaf", title: "末级任务", projectId: "p1", parentMemoId: "child" },
    { id: "other", title: "其他项目", projectId: "p2" },
  ];
  assert.deepEqual(
    getTaskParentOptions(records, records[1]).map((item) => item.id),
    ["root"],
  );
  assert.deepEqual(
    getTaskParentOptions(records, records[2]).map((item) => item.id),
    ["root", "child"],
  );
});

test("legacy parents with only a project name remain selectable", () => {
  const records = [
    { id: "legacy-root", title: "历史主任务", projectName: "TGT办公室" },
    { id: "new-task", title: "新任务", projectId: "p1", projectName: "TGT办公室" },
  ];
  assert.deepEqual(
    getTaskParentOptions(records, records[1]).map((item) => item.id),
    ["legacy-root"],
  );
});

test("reparenting a task moves its whole branch to the selected parent chain", () => {
  const records = [
    { id: "root-a", projectId: "p1" },
    { id: "root-b", projectId: "p1" },
    {
      id: "child",
      projectId: "p1",
      parentMemoId: "root-a",
      rootMemoId: "root-a",
      chainId: "root-a",
    },
    {
      id: "leaf",
      projectId: "p1",
      parentMemoId: "child",
      rootMemoId: "root-a",
      chainId: "root-a",
    },
  ];
  const next = reparentTaskRecords(records, "child", "root-b");
  assert.deepEqual(
    next.find((item) => item.id === "child"),
    {
      id: "child",
      projectId: "p1",
      parentMemoId: "root-b",
      rootMemoId: "root-b",
      chainId: "root-b",
      relationType: "follow-up",
    },
  );
  assert.equal(next.find((item) => item.id === "leaf")?.chainId, "root-b");
});

test("tasks with direct children are protected from deletion", () => {
  const records = [{ id: "root" }, { id: "leaf", parentMemoId: "root" }];
  assert.equal(canDeleteWorkMemo(records, "root"), false);
  assert.equal(canDeleteWorkMemo(records, "leaf"), true);
});
