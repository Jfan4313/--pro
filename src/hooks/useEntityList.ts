import { useEffect, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { offlineDb } from "@/src/lib/offlineDb";
import { onSyncEvent, queueEntityOperation } from "@/src/lib/syncEngine";

export function useEntityList<T extends { id?: string }>(resource: string, initialValue: T[] = []) {
  const [data, setData] = useState<T[]>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cached = await offlineDb.listEntities<T>(resource);
      if (!cancelled && cached.length > 0) setData(cached);

      try {
        const remote = await apiClient.list<T>(resource);
        await Promise.all(remote.map((item: any) => offlineDb.putEntity(resource, item)));
        if (!cancelled) setData(remote);
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    return onSyncEvent(async (event) => {
      if (event.type === "entity_changed" && event.resource === resource) {
        const latest = await offlineDb.listEntities<T>(resource);
        if (!cancelled) setData(latest.length > 0 ? latest : initialValue);
      }
    });
  }, [resource]);

  const addDocument = async (item: Omit<T, "id">) => queueEntityOperation(resource, "upsert", item);
  const updateDocument = async (id: string, item: Partial<T>) => queueEntityOperation(resource, "upsert", { ...item, id });
  const deleteDocument = async (id: string) => queueEntityOperation(resource, "delete", { id });

  return { data, loading, error, addDocument, updateDocument, deleteDocument };
}
