import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowUpProject } from "../src/lib/followUpProject";

const projects = [{ id: "p-1", name: "腰古好邻居" }, { id: "p-2", name: "智能微电网二期" }];

test("follow-up resolves the exact parent project", () => {
  assert.deepEqual(resolveFollowUpProject(projects, { projectId: "p-2", projectName: "智能微电网二期" }), { projectId: "p-2", projectName: "智能微电网二期" });
});

test("follow-up resolves names with a location prefix", () => {
  assert.deepEqual(resolveFollowUpProject(projects, { projectName: "云浮腰古好邻居" }), { projectId: "p-1", projectName: "腰古好邻居" });
});

test("follow-up keeps a stored project when the board is not loaded yet", () => {
  assert.deepEqual(resolveFollowUpProject([], { projectId: "p-3", projectName: "待加载项目" }), { projectId: "p-3", projectName: "待加载项目" });
  assert.deepEqual(resolveFollowUpProject([], { projectName: "当前项目" }), { projectId: "当前项目", projectName: "当前项目" });
});
