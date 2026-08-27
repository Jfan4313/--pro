import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectRecord, validateProjectInput } from "../src/lib/projectService";

test("project service normalizes and validates identity", () => {
  const existing = [{ id: "p1", name: "项目一", projectNumber: "PRJ-0001" }];
  assert.equal(validateProjectInput(existing, { name: "  项目一  " }).valid, false);
  const project = buildProjectRecord({ name: "  新项目 ", manager: "张三", managerId: "u1" }, "PRJ-0002", "p2");
  assert.deepEqual({ id: project.id, name: project.name, projectNumber: project.projectNumber, manager: project.manager }, { id: "p2", name: "新项目", projectNumber: "PRJ-0002", manager: "张三" });
});
