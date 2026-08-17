const DB_NAME = "zhijian-offline";
const DB_VERSION = 1;

type StoreName = "appData" | "entities" | "outbox" | "conflicts" | "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("appData")) db.createObjectStore("appData", { keyPath: "key" });
      if (!db.objectStoreNames.contains("entities")) db.createObjectStore("entities", { keyPath: "cacheKey" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("conflicts")) db.createObjectStore("conflicts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function tx<T>(storeName: StoreName, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export const offlineDb = {
  async getAppData<T>(key: string): Promise<T | undefined> {
    const row = await tx<any>("appData", "readonly", (store) => store.get(key));
    return row?.value as T | undefined;
  },
  putAppData<T>(key: string, value: T, metadata: Record<string, unknown> = {}) {
    return tx("appData", "readwrite", (store) => store.put({ key, value, updatedAt: new Date().toISOString(), ...metadata }));
  },
  deleteAppData(key: string) {
    return tx("appData", "readwrite", (store) => store.delete(key));
  },
  async listEntities<T>(resource: string): Promise<T[]> {
    const rows = await tx<any[]>("entities", "readonly", (store) => store.getAll());
    return rows.filter((row) => row.resource === resource && !row.deletedAt).map((row) => row.value as T);
  },
  putEntity(resource: string, value: any) {
    return tx("entities", "readwrite", (store) => store.put({ cacheKey: `${resource}:${value.id}`, resource, value, deletedAt: value.deletedAt || null }));
  },
  deleteEntity(resource: string, id: string) {
    return tx("entities", "readwrite", (store) => store.delete(`${resource}:${id}`));
  },
  async moveAppDataToEntity(draftKey: string, resource: string, value: any) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["appData", "entities"], "readwrite");
      transaction.objectStore("appData").delete(draftKey);
      transaction.objectStore("entities").put({
        cacheKey: `${resource}:${value.id}`,
        resource,
        value,
        deletedAt: value.deletedAt || null,
      });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        const error = transaction.error;
        db.close();
        reject(error);
      };
      transaction.onabort = () => {
        const error = transaction.error;
        db.close();
        reject(error);
      };
    });
  },
  queue(operation: any) {
    return tx("outbox", "readwrite", (store) => store.put(operation));
  },
  async getOutbox() {
    return tx<any[]>("outbox", "readonly", (store) => store.getAll());
  },
  deleteOutbox(id: string) {
    return tx("outbox", "readwrite", (store) => store.delete(id));
  },
  saveConflict(conflict: any) {
    return tx("conflicts", "readwrite", (store) => store.put({ id: conflict.operation?.id || crypto.randomUUID(), ...conflict, createdAt: new Date().toISOString() }));
  },
  listConflicts() {
    return tx<any[]>("conflicts", "readonly", (store) => store.getAll());
  },
  deleteConflict(id: string) {
    return tx("conflicts", "readwrite", (store) => store.delete(id));
  },
  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await tx<any>("meta", "readonly", (store) => store.get(key));
    return row?.value as T | undefined;
  },
  setMeta<T>(key: string, value: T) {
    return tx("meta", "readwrite", (store) => store.put({ key, value }));
  },
};
