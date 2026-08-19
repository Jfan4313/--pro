import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";
import { createEmptyBoardColumns } from "@/src/lib/workspaceDefaults";

export function useProjectBoardData() {
  const { user } = useAuth();
  const isDemoAccount = Boolean(user?.isDemo);
  const dataKey = isDemoAccount
    ? "projectBoardData"
    : `projectBoardData:${user?.companyId || "company-default"}`;
  // Stage columns are structure, not demo business data. A new workspace has nine empty columns.
  const seed = createEmptyBoardColumns();
  const legacyKeys = isDemoAccount || !user?.id ? [] : [`projectBoardData:${user.id}`];
  const syncedData = useSyncedAppData<any[]>(dataKey, seed, legacyKeys);

  return [...syncedData, seed] as const;
}
