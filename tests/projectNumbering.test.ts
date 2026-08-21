import assert from "node:assert/strict";
import test from "node:test";
import { getProjectNameConflicts, hasProjectIdentityConflict, isValidProjectNumber, normalizeProjectNumber, sortProjectsNaturally } from "../src/lib/projectNumbering";

test("项目统一按编号数字升序排列", () => {
  const sorted = sortProjectsNaturally([
    { id: "c", projectNumber: "PRJ-0010", name: "十号" },
    { id: "a", projectNumber: "PRJ-0002", name: "二号" },
    { id: "b", projectNumber: "PRJ-0001", name: "一号" },
  ]);
  assert.deepEqual(sorted.map((project) => project.projectNumber), ["PRJ-0001", "PRJ-0002", "PRJ-0010"]);
});

test("项目编号输入会规范化并校验", () => {
  assert.equal(normalizeProjectNumber("prj 12"), "PRJ-0012");
  assert.equal(normalizeProjectNumber("12"), "PRJ-0012");
  assert.equal(isValidProjectNumber("PRJ-0012"), true);
  assert.equal(isValidProjectNumber("ABC-12"), false);
});

test("检测重复项目名称和编号时排除正在编辑的项目", () => {
  const projects = [
    { id: "p1", name: " 测试项目 ", projectNumber: "PRJ-0001" },
    { id: "p2", name: "测试项目", projectNumber: "PRJ-0002" },
  ];
  assert.equal(getProjectNameConflicts(projects).length, 1);
  assert.deepEqual(hasProjectIdentityConflict(projects, { id: "p2", name: "新名称", projectNumber: "PRJ-0001" }), { nameConflict: false, numberConflict: true });
  assert.deepEqual(hasProjectIdentityConflict(projects, { id: "p2", name: "新名称", projectNumber: "1" }), { nameConflict: false, numberConflict: true });
});
