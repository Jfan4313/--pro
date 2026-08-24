import test from "node:test";
import assert from "node:assert/strict";
import { getTaskChains, getTaskChainRoots } from "../src/lib/workMemoFollowUps";

const records = [
  { id: "root", title: "完成并网作业", status: "confirmed" },
  { id: "follow-1", title: "现场整改复核", parentMemoId: "root", rootMemoId: "root", chainId: "root", status: "in_progress" },
  { id: "follow-2", title: "补充无人机影像", parentMemoId: "root", rootMemoId: "root", chainId: "root", status: "pending" },
  { id: "follow-3", title: "整改结果确认", parentMemoId: "follow-1", rootMemoId: "root", chainId: "root", status: "confirmed" },
  { id: "legacy", title: "历史任务", status: "pending" },
];

test("任务链从根任务构建，支持并行和多层后续", () => {
  assert.deepEqual(getTaskChainRoots(records).map((item) => item.id), ["root", "legacy"]);
  const chain = getTaskChains(records).find((item) => item.chainId === "root")!;
  assert.equal(chain.root?.id, "root");
  assert.deepEqual(chain.byParent.get("root")?.map((item) => item.id), ["follow-1", "follow-2"]);
  assert.equal(chain.byParent.get("follow-1")?.[0].id, "follow-3");
});

test("没有链路字段的历史记录仍作为单节点任务链", () => {
  const chain = getTaskChains(records).find((item) => item.root?.id === "legacy")!;
  assert.equal(chain.chainId, "legacy");
  assert.equal(chain.byParent.get("__root__")?.length, 1);
});
