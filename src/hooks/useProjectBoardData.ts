import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";
import { createEmptyBoardColumns } from "@/src/lib/workspaceDefaults";

export function useProjectBoardData() {
  const { user } = useAuth();
  const isDemoAccount = Boolean(user?.isDemo);
  const dataKey = isDemoAccount
    ? "projectBoardData"
    : `projectBoardData:${user?.id || "anonymous"}`;
  // Stage columns are structure, not demo business data. A new workspace has nine empty columns.
  const seed = createEmptyBoardColumns();
  const syncedData = useSyncedAppData<any[]>(dataKey, seed);

  return [...syncedData, seed] as const;
}
