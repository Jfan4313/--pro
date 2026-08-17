import { apiClient, API_BASE_URL } from "./apiClient";
import { getClientId, getUserId } from "./clientIdentity";
import { offlineDb } from "./offlineDb";
import { AUTH_TOKEN_KEY } from "./clientIdentity";

const SYNC_EVENT = "zhijian-sync-event";

export type SyncState = "idle" | "saving" | "syncing" | "offline" | "error" | "conflict";
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

let syncStatus: SyncStatus = {
  state: typeof navigator !== "undefined" && navigator.onLine ? "idle" : "offline",
  pending: 0,
  lastSyncedAt: null,
  error: null,
};

function updateSyncStatus(patch: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...patch };
  emitSyncEvent({ type: "sync_status", status: syncStatus });
}

export function getSyncStatus() {
  return syncStatus;
}

export async function resolveSyncConflict(id: string, strategy: "server" | "local") {
  const conflicts = await offlineDb.listConflicts();
  const conflict = conflicts.find((item: any) => item.id === id);
  if (!conflict) return false;

  if (strategy === "server") {
    if (conflict.serverRecord?.id && conflict.operation?.resource) {
      await offlineDb.putEntity(conflict.operation.resource, conflict.serverRecord);
    }
  } else if (conflict.operation) {
    await offlineDb.queue({
      ...conflict.operation,
      id: crypto.randomUUID(),
      baseVersion: conflict.serverRecord?.version,
      createdAt: new Date().toISOString(),
    });
  }

  await offlineDb.deleteConflict(id);
  updateSyncStatus({ state: strategy === "local" ? "syncing" : "idle", error: null });
  if (strategy === "local") void flushOutbox();
  else {
    const remaining = await offlineDb.listConflicts();
    if (remaining.length === 0) updateSyncStatus({ state: "idle", error: null });
  }
  return true;
}

export function emitSyncEvent(detail: unknown) {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
}

export function onSyncEvent(listener: (detail: any) => void) {
  const handler = (event: Event) => listener((event as CustomEvent).detail);
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export async function queueAppDataUpdate<T>(key: string, value: T) {
  updateSyncStatus({ state: navigator.onLine ? "saving" : "offline", error: null });
  await offlineDb.putAppData(key, value, { pending: true });
  await offlineDb.queue({
    id: crypto.randomUUID(),
    kind: "appData",
    key,
    value,
    clientId: getClientId(),
    updatedBy: getUserId(),
    createdAt: new Date().toISOString(),
  });
  emitSyncEvent({ type: "app_data_changed", key, value });
  const pending = (await offlineDb.getOutbox()).length;
  updateSyncStatus({ pending, state: navigator.onLine ? "syncing" : "offline" });
  void flushOutbox();
}

export async function queueEntityOperation(resource: string, type: "upsert" | "delete", payload: any) {
  updateSyncStatus({ state: navigator.onLine ? "saving" : "offline", error: null });
  const recordId = payload.id || crypto.randomUUID();
  const operation = {
    id: crypto.randomUUID(),
    kind: "entity",
    resource,
    recordId,
    type,
    payload: { ...payload, id: recordId },
    baseVersion: payload.version,
    clientId: getClientId(),
    updatedBy: getUserId(),
    createdAt: new Date().toISOString(),
  };
  if (type === "upsert") await offlineDb.putEntity(resource, operation.payload);
  await offlineDb.queue(operation);
  emitSyncEvent({ type: "entity_changed", resource, record: operation.payload });
  const pending = (await offlineDb.getOutbox()).length;
  updateSyncStatus({ pending, state: navigator.onLine ? "syncing" : "offline" });
  void flushOutbox();
  return operation.payload;
}

export async function flushOutbox() {
  if (!navigator.onLine) {
    updateSyncStatus({ state: "offline", pending: (await offlineDb.getOutbox()).length });
    return;
  }
  const operations = await offlineDb.getOutbox();
  if (operations.length === 0) {
    updateSyncStatus({ state: "idle", pending: 0, error: null });
    return;
  }
  updateSyncStatus({ state: "syncing", pending: operations.length, error: null });
  let hadConflict = false;
  for (const operation of operations) {
    try {
      if (operation.kind === "appData") {
        const response = await apiClient.putAppData(operation.key, operation.value);
        await offlineDb.putAppData(operation.key, response.value, { version: response.version, pending: false });
      } else {
        const response = await apiClient.push([operation]);
        for (const applied of response.applied) await offlineDb.putEntity(operation.resource, applied);
        for (const conflict of response.conflicts) await offlineDb.saveConflict(conflict);
        if (response.conflicts.length > 0) {
          hadConflict = true;
          updateSyncStatus({ state: "conflict", pending: (await offlineDb.getOutbox()).length, error: "存在数据冲突，请检查同步记录" });
        }
      }
      await offlineDb.deleteOutbox(operation.id);
      updateSyncStatus({ pending: (await offlineDb.getOutbox()).length });
    } catch (error: any) {
      updateSyncStatus({ state: "error", pending: (await offlineDb.getOutbox()).length, error: error?.message || "同步失败，请稍后重试" });
      return;
    }
  }
  updateSyncStatus({ state: hadConflict ? "conflict" : "idle", pending: 0, lastSyncedAt: new Date().toISOString(), error: hadConflict ? "存在数据冲突，请检查同步记录" : null });
}

export async function pullLatest() {
  if (!navigator.onLine) {
    updateSyncStatus({ state: "offline" });
    return;
  }
  const sinceVersion = (await offlineDb.getMeta<number>("serverVersion")) || 0;
  try {
    const response = await apiClient.pull(sinceVersion);
    for (const change of response.changes) {
      if (change.resource === "app_data" && change.payload?.key) {
        await offlineDb.putAppData(change.payload.key, change.payload.value, { version: change.payload.version });
        emitSyncEvent({ type: "app_data_changed", key: change.payload.key, value: change.payload.value });
      } else if (change.payload) {
        await offlineDb.putEntity(change.resource, change.payload);
        emitSyncEvent({ type: "entity_changed", resource: change.resource, record: change.payload });
      }
    }
    await offlineDb.setMeta("serverVersion", response.serverVersion);
  } catch (error: any) {
    updateSyncStatus({ state: "error", error: error?.message || "无法连接同步服务" });
    // The app keeps using IndexedDB when the local backend is unreachable.
  }
}

export function startRealtimeSync() {
  void flushOutbox();
  void pullLatest();
  window.addEventListener("offline", () => updateSyncStatus({ state: "offline", error: null }));
  window.addEventListener("online", () => {
    updateSyncStatus({ state: "syncing", error: null });
    void flushOutbox();
    void pullLatest();
  });

  let source: EventSource | null = null;
  const connectRealtime = () => {
    source?.close();
    source = null;
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    try {
      source = new EventSource(`${API_BASE_URL}/api/events?token=${encodeURIComponent(token)}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        emitSyncEvent(payload);
        if (payload.serverVersion) void offlineDb.setMeta("serverVersion", payload.serverVersion);
      };
      source.onerror = () => { source?.close(); source = null; };
    } catch {
      source = null;
    }
  };
  connectRealtime();
  window.addEventListener("zhijian-auth-changed", connectRealtime);

  window.setInterval(() => {
    void flushOutbox();
    void pullLatest();
  }, 15000);
}
