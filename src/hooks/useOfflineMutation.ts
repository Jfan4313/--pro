import { queueEntityOperation } from "@/src/lib/syncEngine";

export function useOfflineMutation(resource: string) {
  return {
    upsert: (payload: Record<string, unknown>) => queueEntityOperation(resource, "upsert", payload),
    remove: (id: string, version?: number) => queueEntityOperation(resource, "delete", { id, version }),
  };
}
