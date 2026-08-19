import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { offlineDb } from "@/src/lib/offlineDb";
import { onSyncEvent, queueAppDataUpdate } from "@/src/lib/syncEngine";
import { emptyWorkspaceValue } from "@/src/lib/workspaceDefaults";

export function useSyncedAppData<T>(key: string, initialValue: T, legacyKeys: string[] = []) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cached = await offlineDb.getAppData<T>(key);
      if (!cancelled && cached !== undefined) setData(cached);

      try {
        const remote = await apiClient.getAppData<T>(key);
        let migratedValue: T | undefined;
        if (remote.exists === false && legacyKeys.length > 0) {
          for (const legacyKey of legacyKeys) {
            if (!legacyKey || legacyKey === key) continue;
            const legacy = await apiClient.getAppData<T>(legacyKey);
            if (legacy.exists !== false) {
              migratedValue = legacy.value;
              break;
            }
          }
        }
        const value = remote.exists === false
          ? (migratedValue === undefined ? emptyWorkspaceValue(key, initialValue) : migratedValue)
          : remote.value;
        if (remote.exists !== false) {
          await offlineDb.putAppData(key, value, { version: remote.version, pending: false });
        } else if (migratedValue !== undefined) {
          // Move old per-account board data into the shared company key once.
          await offlineDb.putAppData(key, value, { pending: true });
          await queueAppDataUpdate(key, value);
        } else {
          // A key removed from the server must not keep reappearing from an old
          // IndexedDB cache on the next page load. Offline requests still keep
          // the cache because they enter the catch branch above. Preserve a
          // cache that has a pending local write, since it is valid user work.
          const pending = await offlineDb.getOutbox();
          if (!pending.some((item: any) => item.kind === "appData" && item.key === key)) {
            await offlineDb.deleteAppData(key);
          }
        }
        if (!cancelled) setData(value);
      } catch (error: any) {
        if (error?.status === 404) {
          const seedValue = cached !== undefined ? cached : emptyWorkspaceValue(key, initialValue);
          if (!cancelled) setData(seedValue);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const unsubscribe = onSyncEvent((event) => {
      if (event.type === "app_data_changed" && event.key === key) {
        setData(event.value as T);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const updateData = async (newValue: T | ((val: T) => T)) => {
    const valueToStore = newValue instanceof Function ? newValue(dataRef.current) : newValue;
    // Functional updaters commonly return the current reference when no data
    // changed. Do not enqueue a write or emit a sync state in that case.
    if (Object.is(valueToStore, dataRef.current)) return;
    dataRef.current = valueToStore;
    setData(valueToStore);
    await queueAppDataUpdate(key, valueToStore);
  };

  return [data, updateData, loading] as const;
}
