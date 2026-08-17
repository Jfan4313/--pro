import { useEffect, useState } from "react";
import { getSyncStatus, onSyncEvent, type SyncStatus } from "@/src/lib/syncEngine";

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => onSyncEvent((event) => {
    if (event.type === "sync_status" && event.status) setStatus(event.status as SyncStatus);
  }), []);

  return status;
}
