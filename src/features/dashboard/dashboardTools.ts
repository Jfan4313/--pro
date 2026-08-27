import { offlineDb } from "@/src/lib/offlineDb";
import { queueAppDataUpdate } from "@/src/lib/syncEngine";

export const DASHBOARD_DATA_KEYS = [
  "projectBoardData", "personnelData", "tasks", "scheduleData", "project_contracts", "costDataV2",
  "materialsData", "supplyOrders", "suppliers", "externalPartners", "organizationData", "workMemos",
];
export const WORKSPACE_SNAPSHOT_VERSION = 2;

export async function createLocalSnapshot(actor?: { id?: string; name?: string; companyId?: string }) {
  const data: Record<string, unknown> = {};
  for (const key of DASHBOARD_DATA_KEYS) data[key] = await offlineDb.getAppData(key);
  const snapshot = { id: `snapshot-${Date.now()}`, version: WORKSPACE_SNAPSHOT_VERSION, createdAt: new Date().toISOString(), createdBy: actor?.name || actor?.id || "当前用户", companyId: actor?.companyId || "", keys: DASHBOARD_DATA_KEYS, data };
  const snapshots = (await offlineDb.getMeta<any[]>("workspaceSnapshots")) || [];
  await offlineDb.setMeta("workspaceSnapshots", [snapshot, ...snapshots].slice(0, 10));
  return snapshot;
}

export async function listLocalSnapshots() {
  return (await offlineDb.getMeta<any[]>("workspaceSnapshots")) || [];
}

export async function restoreLocalSnapshot(snapshot: any) {
  if (!snapshot?.data || snapshot.version > WORKSPACE_SNAPSHOT_VERSION) throw new Error("不支持的快照版本");
  const entries = Object.entries(snapshot.data).filter(([key]) => DASHBOARD_DATA_KEYS.includes(key));
  if (!entries.length) throw new Error("快照中没有可恢复的数据");
  for (const [key, value] of entries) await queueAppDataUpdate(key, value);
  return entries.length;
}

export async function previewWorkspaceSnapshot(snapshot: any) {
  if (!snapshot?.data || typeof snapshot.data !== "object") throw new Error("快照格式无效");
  const entries = Object.entries(snapshot.data).filter(([key]) => DASHBOARD_DATA_KEYS.includes(key));
  const changes = [] as Array<{ key: string; before: unknown; after: unknown; changed: boolean }>;
  for (const [key, value] of entries) {
    const before = await offlineDb.getAppData(key);
    changes.push({ key, before, after: value, changed: JSON.stringify(before) !== JSON.stringify(value) });
  }
  return { version: snapshot.version || 1, createdAt: snapshot.createdAt || snapshot.exportedAt, changes, changedCount: changes.filter((item) => item.changed).length };
}

export async function exportWorkspaceSnapshot() {
  const data: Record<string, unknown> = {};
  for (const key of DASHBOARD_DATA_KEYS) data[key] = await offlineDb.getAppData(key);
  const blob = new Blob([JSON.stringify({ version: WORKSPACE_SNAPSHOT_VERSION, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
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
  if (parsed.version && Number(parsed.version) > WORKSPACE_SNAPSHOT_VERSION) throw new Error(`配置文件版本 ${parsed.version} 高于当前版本`);
  const entries = Object.entries(parsed.data).filter(([key]) => DASHBOARD_DATA_KEYS.includes(key));
  if (entries.length === 0) throw new Error("配置文件中没有可导入的数据");
  for (const [key, value] of entries) await queueAppDataUpdate(key, value);
  return entries.length;
}
