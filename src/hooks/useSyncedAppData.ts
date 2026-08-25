import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { offlineDb } from "@/src/lib/offlineDb";
import { onSyncEvent, queueAppDataUpdate } from "@/src/lib/syncEngine";
import { emptyWorkspaceValue } from "@/src/lib/workspaceDefaults";

export type LegacyDataMigration<T> = {
  keys: string[];
  shouldMigrate?: (currentValue: T, remote: { exists: boolean; version: number }) => boolean;
  mergeValues?: (currentValue: T, legacyValues: T[]) => T;
};

export function useSyncedAppData<T>(
  key: string,
  initialValue: T,
  legacyMigration: string[] | LegacyDataMigration<T> = [],
) {
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
        const migration = Array.isArray(legacyMigration)
          ? { keys: legacyMigration }
          : legacyMigration;
        const remoteExists = remote.exists !== false;
        const currentValue = remoteExists ? remote.value : emptyWorkspaceValue(key, initialValue);
        let migratedValue: T | undefined;
        const shouldCheckLegacy = migration.keys.length > 0
          && (!remoteExists || Boolean(migration.shouldMigrate?.(currentValue, { exists: remoteExists, version: remote.version })));
        if (shouldCheckLegacy) {
          const legacyValues: T[] = [];
          for (const legacyKey of migration.keys) {
            if (!legacyKey || legacyKey === key) continue;
            const legacy = await apiClient.getAppData<T>(legacyKey);
            if (legacy.exists !== false) {
              legacyValues.push(legacy.value);
            }
          }
          if (legacyValues.length > 0) {
            migratedValue = migration.mergeValues
              ? migration.mergeValues(currentValue, legacyValues)
              : legacyValues[0];
          }
        }
        const value = migratedValue === undefined ? currentValue : migratedValue;
        const migrationChangedValue = migratedValue !== undefined
          && (!remoteExists || JSON.stringify(migratedValue) !== JSON.stringify(remote.value));
        if (migrationChangedValue) {
          // Write the recovered value to the current key once. Subsequent loads
          // see a non-empty current value and no longer consult legacy keys.
          await offlineDb.putAppData(key, value, { pending: true });
          await queueAppDataUpdate(key, value);
        } else if (remoteExists) {
          await offlineDb.putAppData(key, value, { version: remote.version, pending: false });
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
