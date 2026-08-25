import assert from "node:assert/strict";
import test from "node:test";
import { hasProjectBoardProjects, mergeProjectBoardData } from "../src/lib/projectBoardMigration";
import { createEmptyBoardColumns } from "../src/lib/workspaceDefaults";

test("detects whether a project board contains projects", () => {
  assert.equal(hasProjectBoardProjects(createEmptyBoardColumns()), false);
  assert.equal(hasProjectBoardProjects([{ id: "1_initiation", projects: [{ id: "p1" }] }]), true);
});

test("recovers and merges personal and unscoped legacy projects", () => {
  const result = mergeProjectBoardData(
    createEmptyBoardColumns(),
    [
      [{ id: "1_initiation", title: "个人立项", projects: [{ id: "personal", name: "个人项目" }] }],
      [{ id: "8_construction", title: "旧施工", projects: [{ id: "legacy", name: "旧公司项目" }] }],
    ],
    createEmptyBoardColumns(),
  );

  assert.deepEqual(result.flatMap((column) => column.projects).map((project) => project.id), ["personal", "legacy"]);
  assert.equal(result.find((column) => column.id === "1_initiation")?.count, 1);
  assert.equal(result.find((column) => column.id === "8_construction")?.count, 1);
});

test("keeps current company projects and deduplicates legacy copies", () => {
  const result = mergeProjectBoardData(
    [{ id: "2_preliminary", title: "当前阶段", projects: [{ id: "shared", name: "公司最新版", revision: 2 }] }],
    [[{ id: "1_initiation", title: "旧阶段", projects: [{ id: "shared", name: "旧副本", revision: 1 }, { id: "old", name: "历史项目" }] }]],
    createEmptyBoardColumns(),
  );

  const allProjects = result.flatMap((column) => column.projects);
  assert.equal(allProjects.filter((project) => project.id === "shared").length, 1);
  assert.equal(allProjects.find((project) => project.id === "shared")?.revision, 2);
  assert.equal(result.find((column) => column.id === "2_preliminary")?.projects[0].name, "公司最新版");
  assert.equal(result.find((column) => column.id === "1_initiation")?.projects[0].id, "old");
});
