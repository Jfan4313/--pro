import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyEntityIndex, matchResponsibleEntity, resolveResponsibleEntities } from "../server/domain/companyEntities.js";

test("company entity index exposes assignment fields but removes sensitive data", () => {
  const entities = buildCompanyEntityIndex({
    personnel: [{ id: "p1", name: "张顺超", role: "项目经理", phone: "13800000000", idCard: "secret", accountId: "u1" }],
    partners: [{ id: "o1", name: "顺超公司", contact: "李越", phone: "13900000000" }],
    suppliers: [{ id: "s1", name: "华东供应商", contact: "王工" }],
    glossary: [{ standardName: "顺超公司", aliases: ["顺超"], category: "organization", enabled: true }],
  });

  assert.equal(entities.length, 3);
  assert.equal(entities[0].notificationEligible, true);
  assert.equal((entities[0] as any).phone, undefined);
  assert.equal((entities[0] as any).idCard, undefined);
  assert.deepEqual(entities[1].aliases, ["顺超"]);
});

test("entity matching supports aliases, ambiguity and pending external objects", () => {
  const entities = buildCompanyEntityIndex({
    personnel: [{ id: "p1", name: "李越", aliases: ["李总"] }, { id: "p2", name: "李强", aliases: ["李总"] }],
    partners: [{ id: "o1", name: "顺超公司", aliases: ["顺超"] }],
  });

  assert.equal(matchResponsibleEntity("顺超", entities)[0].entityId, "o1");
  assert.ok(matchResponsibleEntity("李总", entities).every((item) => item.matchType === "ambiguous"));
  const pending = matchResponsibleEntity("未来检测公司", entities)[0];
  assert.equal(pending.entityType, "external_organization");
  assert.equal(pending.notificationEligible, false);
  assert.equal(resolveResponsibleEntities(["顺超", "顺超"], entities).length, 1);
});

test("entity matching can use project and role context without guessing across projects", () => {
  const entities = buildCompanyEntityIndex({
    personnel: [
      { id: "p1", name: "张顺超", role: "项目经理", projectIds: ["project-1"] },
      { id: "p2", name: "李越", role: "项目经理", projectIds: ["project-2"] },
    ],
  });

  const matched = matchResponsibleEntity("项目经理", entities, { projectId: "project-1" });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].entityId, "p1");
  assert.equal(matched[0].confidence, 0.78);
});
