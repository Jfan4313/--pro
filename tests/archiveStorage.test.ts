import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildArchiveVersionView,
  getArchiveProjectFolder,
  getArchiveDisplayName,
  getArchiveStageFolder,
  getCurrentAndNextStages,
  LocalFolderStorageProvider,
} from "../src/lib/archiveStorage";
import { getProjectFolderName, listProjectFilesFromDisk } from "../server/domain/projectFiles.js";

class MemoryFileHandle {
  readonly kind = "file";
  writes = 0;
  file: File;

  constructor(readonly name: string) {
    this.file = new File([], name);
  }

  async getFile() {
    return this.file;
  }

  async createWritable() {
    let next: Blob = new Blob();
    return {
      write: async (value: Blob) => { next = value; },
      close: async () => {
        this.writes += 1;
        this.file = new File([next], this.name, { type: next.type, lastModified: Date.now() });
      },
    };
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory";
  readonly entries = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  constructor(readonly name: string) {}

  async queryPermission() {
    return "granted";
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryDirectoryHandle) return existing;
    if (!options.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
    const directory = new MemoryDirectoryHandle(name);
    this.entries.set(name, directory);
    return directory;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryFileHandle) return existing;
    if (!options.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
    const file = new MemoryFileHandle(name);
    this.entries.set(name, file);
    return file;
  }

  async removeEntry(name: string) {
    if (!this.entries.delete(name)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
  }

  async *values() {
    yield* this.entries.values();
  }
}

const stages = [
  { id: "1_initiation", name: "① 项目立项", files: ["项目概况表.pdf"] },
  { id: "2_preliminary", name: "② 初步设计", files: ["初步设计方案.pdf"] },
  { id: "3_business", name: "③ 商务沟通", files: [] },
];
const project = { id: "p-1", projectNumber: "PRJ-0001", name: "测试 / 项目" };

test("uses the stable project number and current-plus-next stage window", () => {
  assert.equal(getArchiveProjectFolder(project), "PRJ-0001_测试_项目");
  assert.equal(getArchiveStageFolder(stages[0]), "01_项目立项");
  assert.deepEqual(getCurrentAndNextStages(stages, 1).map((stage) => stage.id), ["2_preliminary", "3_business"]);
  assert.deepEqual(getCurrentAndNextStages(stages, 2).map((stage) => stage.id), ["3_business"]);
});

test("local provider creates an idempotent structure and never overwrites its checklist", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const first = await provider.ensureProjectStructure(project, stages.slice(0, 2));
  const projectDirectory = root.entries.get(first.projectFolder) as MemoryDirectoryHandle;
  const stageDirectory = projectDirectory.entries.get("01_项目立项") as MemoryDirectoryHandle;
  const checklist = stageDirectory.entries.get("文件清单.json") as MemoryFileHandle;
  assert.ok(stageDirectory.entries.has("待提交"));
  assert.ok(stageDirectory.entries.has("已归档"));
  assert.equal(checklist.writes, 1);

  await provider.ensureProjectStructure(project, stages.slice(0, 2), first.projectFolder);
  assert.equal(checklist.writes, 1);
});

test("local provider versions files and exposes provider-neutral indexes", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const file = new File(["hello"], "方案.pdf", { type: "application/pdf" });
  const first = await provider.writeFile({ project, stage: stages[0], file, fileType: "方案" });
  const second = await provider.writeFile({ project, stage: stages[0], file, fileType: "方案", projectFolder: first.storageKey.split("/")[0] });

  assert.equal(first.version, "V1");
  assert.equal(second.version, "V1");
  assert.equal(second.wasSkipped, true);
  assert.equal(first.storageProvider, "local-folder");
  assert.match(first.checksum, /^[a-f0-9]{64}$/);
  assert.equal(first.storageKey, second.storageKey);

  const listed = await provider.listFiles({ project, stages: [stages[0]], projectFolder: first.storageKey.split("/")[0] });
  assert.equal(listed.length, 1);
  assert.deepEqual(listed.map((item) => item.version), ["V1"]);
  assert.equal((await provider.readFile(first.storageKey)).size, 5);
  assert.match(first.storedName, /^方案_V1_\d{8}\.pdf$/);
  assert.doesNotMatch(first.storedName, /PRJ-0001|测试_项目|01_/);
});

test("版本视图合并重复索引并标出最新和历史版本", () => {
  const files = [
    { storageKey: "p/s/a_V1_20260820.pdf", name: "a_V1_20260820.pdf", category: "设计/初步设计方案", version: "V1", checksum: "old" },
    { storageKey: "p/s/a_V2_20260821.pdf", name: "a_V2_20260821.pdf", category: "设计/初步设计方案", version: "V2", checksum: "new" },
    { storageKey: "p/s/a_V2_20260821.pdf", name: "a_V2_20260821.pdf", category: "设计/初步设计方案", version: "V2", checksum: "new" },
  ];
  const view = buildArchiveVersionView(files);
  assert.equal(view.length, 2);
  assert.equal(view[0].versionNumber, 2);
  assert.equal(view[0].versionCount, 2);
  assert.equal(view[0].isLatestVersion, true);
  assert.equal(view[0].isDuplicate, true);
  assert.equal(view[0].duplicateRecordCount, 2);
  assert.equal(view[1].isLatestVersion, false);
  assert.equal(getArchiveDisplayName({ name: "PRJ-0021_02_很长的公司项目名称_V2_20260821.pdf", category: "设计/初步设计方案", version: "V2" }), "初步设计方案_V2.pdf");
});

test("移动归档在目标写入成功后删除源文件", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  let sourceRemoved = false;
  const sourceHandle = {
    requestPermission: async () => "granted",
    isSameEntry: async () => false,
    remove: async () => { sourceRemoved = true; },
  };

  const archived = await provider.moveFile({
    project,
    stage: stages[1],
    file: new File(["design"], "初步设计方案.pdf", { type: "application/pdf" }),
    fileType: "初步设计方案",
  }, sourceHandle);

  assert.equal(sourceRemoved, true);
  assert.match(archived.storageKey, /02_初步设计\/已归档/);
  assert.equal((await provider.readFile(archived.storageKey)).size, 6);
});

test("源文件删除失败时撤销新生成的目标文件", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const sourceHandle = {
    requestPermission: async () => "granted",
    isSameEntry: async () => false,
    remove: async () => { throw new Error("locked"); },
  };

  await assert.rejects(() => provider.moveFile({
    project,
    stage: stages[1],
    file: new File(["design"], "初步设计方案.pdf", { type: "application/pdf" }),
    fileType: "初步设计方案",
  }, sourceHandle), /archive_source_remove_failed/);

  assert.deepEqual(await provider.listFiles({ project, stages: [stages[1]] }), []);
});

test("可以只删除选中的本机文件版本", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const first = await provider.writeFile({ project, stage: stages[0], file: new File(["v1"], "方案.pdf"), fileType: "方案" });
  const second = await provider.writeFile({ project, stage: stages[0], file: new File(["v2"], "方案.pdf"), fileType: "方案", projectFolder: first.storageKey.split("/")[0] });
  await provider.deleteFile(first.storageKey);
  const remaining = await provider.listFiles({ project, stages: [stages[0]], projectFolder: first.storageKey.split("/")[0] });
  assert.deepEqual(remaining.map((file) => file.storageKey), [second.storageKey]);
});

test("归档文件保留来源子文件夹层级", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const file = new File(["hello"], "方案.pdf", { type: "application/pdf" });
  const archived = await provider.writeFile({ project, stage: stages[0], file, fileType: "方案", sourceRelativePath: "测试项目/开工资料/施工方案/方案.pdf", preserveFolders: true });
  assert.match(archived.storageKey, /已归档\/方案\/开工资料\/施工方案\/方案\.pdf$/);
});

test("旧平铺归档先重建并校验后才能删除旧副本", async () => {
  const root = new MemoryDirectoryHandle("归档") as any;
  const provider = new LocalFolderStorageProvider(root);
  const structure = await provider.ensureProjectStructure(project, [stages[2]]);
  const projectDirectory = root.entries.get(structure.projectFolder) as MemoryDirectoryHandle;
  const stageDirectory = projectDirectory.entries.get("03_商务沟通") as MemoryDirectoryHandle;
  const archived = stageDirectory.entries.get("已归档") as MemoryDirectoryHandle;
  const oldName = "PRJ-0001_03_招投标_技术标书_V1_20260821.pdf";
  const oldHandle = await archived.getFileHandle(oldName, { create: true });
  const writable = await oldHandle.createWritable();
  await writable.write(new Blob(["tender"]));
  await writable.close();

  const preview = await provider.previewGeneratedArchiveFiles();
  assert.equal(preview.length, 1);
  assert.match(preview[0].targetStorageKey, /已归档\/招投标资料\/技术标/);
  const rebuilt = await provider.rebuildGeneratedArchiveFiles(preview);
  assert.equal(rebuilt.verified.length, 1);
  assert.ok(archived.entries.has(oldName));
  const deleted = await provider.deleteGeneratedArchiveFiles(rebuilt.verified);
  assert.equal(deleted.deleted, 1);
  assert.equal(archived.entries.has(oldName), false);
  assert.equal((await provider.readFile(rebuilt.verified[0].targetStorageKey)).size, 6);
});

test("legacy server folders remain readable after project-number naming is enabled", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-legacy-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacyProject = { id: "p-legacy", projectNumber: "PRJ-0099", name: "历史项目" };
  assert.equal(getProjectFolderName(legacyProject), "PRJ-0099_历史项目");
  const archived = path.join(root, "p-legacy_历史项目", "01_项目立项", "已归档");
  fs.mkdirSync(archived, { recursive: true });
  fs.writeFileSync(path.join(archived, "历史资料.pdf"), "legacy");

  const listed = listProjectFilesFromDisk({ rootPath: root, project: legacyProject, stages: [{ id: "1_initiation", name: "① 项目立项" }] });
  assert.equal(listed.projectFolder, "p-legacy_历史项目");
  assert.equal(listed.stages[0].files[0].name, "历史资料.pdf");
});
