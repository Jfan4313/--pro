import { apiClient, API_BASE_URL } from "./apiClient";
import { getClientId, getUserId } from "./clientIdentity";
import { offlineDb } from "./offlineDb";
import { AUTH_TOKEN_KEY } from "./clientIdentity";

const SYNC_EVENT = "zhijian-sync-event";

export function emitSyncEvent(detail: unknown) {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
}

export function onSyncEvent(listener: (detail: any) => void) {
  const handler = (event: Event) => listener((event as CustomEvent).detail);
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export async function queueAppDataUpdate<T>(key: string, value: T) {
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
  void flushOutbox();
}

export async function queueEntityOperation(resource: string, type: "upsert" | "delete", payload: any) {
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
  void flushOutbox();
  return operation.payload;
}

export async function flushOutbox() {
  if (!navigator.onLine) return;
  const operations = await offlineDb.getOutbox();
  for (const operation of operations) {
    try {
      if (operation.kind === "appData") {
        const response = await apiClient.putAppData(operation.key, operation.value);
        await offlineDb.putAppData(operation.key, response.value, { version: response.version, pending: false });
      } else {
        const response = await apiClient.push([operation]);
        for (const applied of response.applied) await offlineDb.putEntity(operation.resource, applied);
        for (const conflict of response.conflicts) await offlineDb.saveConflict(conflict);
      }
      await offlineDb.deleteOutbox(operation.id);
    } catch {
      return;
    }
  }
}

export async function pullLatest() {
  if (!navigator.onLine) return;
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
  } catch {
    // The app keeps using IndexedDB when the local backend is unreachable.
  }
}

export function startRealtimeSync() {
  void flushOutbox();
  void pullLatest();
  window.addEventListener("online", () => {
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
