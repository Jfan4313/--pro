import assert from "node:assert/strict";
import test from "node:test";
import { browserSpeechPhrases, correctBrowserTranscript } from "../src/lib/speechHotwords";

test("browser speech correction uses company project and internal-person hotwords only", () => {
  const projects = [{ name: "云浮腰古好邻居", aliases: ["腰古好邻居"] }];
  const entities = [
    { entityType: "internal_person", name: "张顺超", aliases: ["朝顺操"] },
    { entityType: "partner_organization", name: "顺超公司", aliases: ["顺超"] },
  ];
  assert.equal(correctBrowserTranscript("今天去腰鼓好邻居，让朝顺操处理", projects, entities), "今天去云浮腰古好邻居，让张顺超处理");
  assert.ok(browserSpeechPhrases(projects, entities).includes("张顺超"));
  assert.equal(browserSpeechPhrases(projects, entities).includes("顺超公司"), false);
});
