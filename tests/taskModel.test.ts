import test from "node:test";
import assert from "node:assert/strict";
import { flattenLegacyTasks, mergeTasks, scheduleToTasks, tasksToSchedule } from "../src/lib/taskModel";

test("merges legacy work memos and schedules by stable id", () => {
  const tasks = flattenLegacyTasks(
    [{ id: "p1", name: "项目一", tasks: [{ id: "t1", name: "现场复核", deadline: "2026-08-27" }] }],
    [{ id: "t1", title: "现场复核", projectId: "p1", updatedAt: "2026-08-28" }, { id: "t2", title: "补资料" }],
  );
  assert.equal(tasks.length, 2);
  assert.equal(tasks.find((task) => task.id === "t1")?.title, "现场复核");
});

test("round trips canonical tasks through the schedule view", () => {
  const tasks = mergeTasks([{ id: "t1", title: "施工准备", projectId: "p1", projectName: "项目一", dueDate: "2026-08-27", status: "pending" }]);
  const schedule = tasksToSchedule(tasks);
  assert.equal(schedule[0].tasks[0].name, "施工准备");
  assert.equal(scheduleToTasks(schedule)[0].projectId, "p1");
});
