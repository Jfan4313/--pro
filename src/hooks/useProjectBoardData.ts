import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";
import { mergeProjectBoardData } from "@/src/lib/projectBoardMigration";
import { createEmptyBoardColumns } from "@/src/lib/workspaceDefaults";

export function useProjectBoardData() {
  const { user } = useAuth();
  const isDemoAccount = Boolean(user?.isDemo);
  const dataKey = isDemoAccount
    ? "projectBoardData"
    : `projectBoardData:${user?.companyId || "company-default"}`;
  // Stage columns are structure, not demo business data. A new workspace has nine empty columns.
  const seed = createEmptyBoardColumns();
  const legacyKeys = isDemoAccount || !user?.id ? [] : [`projectBoardData:${user.id}`, "projectBoardData"];
  const syncedData = useSyncedAppData<any[]>(dataKey, seed, {
    keys: legacyKeys,
    // A partially populated company board must still merge legacy user/global
    // boards; otherwise projects that lived in the old keys silently disappear.
    shouldMigrate: () => legacyKeys.length > 0,
    mergeValues: (currentValue, legacyValues) => mergeProjectBoardData(currentValue, legacyValues, seed),
  });

  return [...syncedData, seed] as const;
}
