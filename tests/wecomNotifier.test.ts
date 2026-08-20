import assert from "node:assert/strict";
import test from "node:test";
import { createWecomNotifier } from "../server/services/wecomNotifier.js";

test("scheduled digests render multiple structured responsibility entities", () => {
  const notifier = createWecomNotifier({ nowIso: () => "2026-08-20T18:00:00.000Z" });
  const digest = notifier.buildDigest([
    {
      id: "memo-1",
      title: "落实应急预案",
      status: "pending",
      dueDate: "2026-08-20",
      createdAt: "2026-08-20T08:00:00.000Z",
      responsibleEntities: [
        { entityId: "person-1", entityType: "internal_person", name: "张顺超", matchType: "existing" },
        { entityId: "partner-1", entityType: "partner_organization", name: "顺超公司", contactName: "李越", matchType: "existing" },
        { entityId: "pending-1", entityType: "external_person", name: "王工", matchType: "pending" },
      ],
    },
  ], "evening", new Date("2026-08-20T10:00:00.000Z"));

  assert.equal(digest.title, "今日任务总结");
  assert.match(digest.sections.join("\n"), /张顺超、顺超公司＋李越、王工/);
});
