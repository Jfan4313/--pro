import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { offlineDb } from "@/src/lib/offlineDb";
import { onSyncEvent, queueAppDataUpdate } from "@/src/lib/syncEngine";

const EMPTY_WORKSPACE_KEYS = new Set([
  "projectBoardData", "personnelData", "scheduleData", "project_contracts", "costDataV2",
  "materialsData", "bomData", "bomHistory", "bomVersion", "materialPrices", "materialPriceHistory",
  "supplyOrders", "suppliers", "externalPartners", "organizationData", "chatChannels", "chatPosts",
  "workMemos", "quickIntakeItems", "appNotifications", "warehouseTransactions", "warehouseOutboundOrders",
]);

function emptyWorkspaceValue<T>(key: string, fallback: T): T {
  if (!EMPTY_WORKSPACE_KEYS.has(key)) return fallback;
  return (key === "organizationData" ? {} : []) as T;
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
        const value = remote.value;
        await offlineDb.putAppData(key, value, { version: remote.version, pending: false });
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
    dataRef.current = valueToStore;
    setData(valueToStore);
    await queueAppDataUpdate(key, valueToStore);
  };

  return [data, updateData, loading] as const;
}
