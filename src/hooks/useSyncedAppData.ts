import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { offlineDb } from "@/src/lib/offlineDb";
import { onSyncEvent, queueAppDataUpdate } from "@/src/lib/syncEngine";

function isEmptySeed(value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return value === "" || value === null || value === undefined;
}

export function useSyncedAppData<T>(key: string, initialValue: T) {
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
        const shouldPromoteLocalSeed = isEmptySeed(remote.value) && !isEmptySeed(initialValue);
        const value = shouldPromoteLocalSeed ? initialValue : remote.value;
        if (shouldPromoteLocalSeed) {
          await queueAppDataUpdate(key, value);
        } else {
          await offlineDb.putAppData(key, value, { version: remote.version, pending: false });
        }
        if (!cancelled) setData(value);
      } catch (error: any) {
        if (error?.status === 404) {
          const seedValue = cached !== undefined && !isEmptySeed(cached) ? cached : initialValue;
          if (!isEmptySeed(seedValue)) {
            await queueAppDataUpdate(key, seedValue);
          }
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
    dataRef.current = valueToStore;
    setData(valueToStore);
    await queueAppDataUpdate(key, valueToStore);
  };

  return [data, updateData, loading] as const;
}
