import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useAuth } from "@/src/lib/auth";

export function useProjectBoardData() {
  const { user } = useAuth();
  const isDemoAccount = Boolean(user?.isDemo);
  const dataKey = isDemoAccount
    ? "projectBoardData"
    : `projectBoardData:${user?.id || "anonymous"}`;
  // A new workspace must remain empty; do not promote the stage layout as demo project data.
  const seed: any[] = [];
  const syncedData = useSyncedAppData<any[]>(dataKey, seed);

  return [...syncedData, seed] as const;
}
