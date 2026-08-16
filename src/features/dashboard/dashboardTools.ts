import { offlineDb } from "@/src/lib/offlineDb";
import { queueAppDataUpdate } from "@/src/lib/syncEngine";

export const DASHBOARD_DATA_KEYS = [
  "projectBoardData", "personnelData", "scheduleData", "project_contracts", "costDataV2",
  "materialsData", "supplyOrders", "suppliers", "externalPartners", "organizationData", "workMemos",
];

export async function exportWorkspaceSnapshot() {
  const data: Record<string, unknown> = {};
  for (const key of DASHBOARD_DATA_KEYS) data[key] = await offlineDb.getAppData(key);
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `智建协同工作区_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importWorkspaceSnapshot(file: File) {
  const parsed = JSON.parse(await file.text());
  if (!parsed?.data || typeof parsed.data !== "object") throw new Error("不是有效的工作区配置文件");
  const entries = Object.entries(parsed.data).filter(([key]) => DASHBOARD_DATA_KEYS.includes(key));
  if (entries.length === 0) throw new Error("配置文件中没有可导入的数据");
  for (const [key, value] of entries) await queueAppDataUpdate(key, value);
  return entries.length;
}
