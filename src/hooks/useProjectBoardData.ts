import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";
import { useAuth } from "@/src/lib/auth";
import { emptyBoardData, initialBoardData } from "@/src/data/initialBoardData";

export function useProjectBoardData() {
  const { user } = useAuth();
  const isDemoAccount = Boolean(user?.isDemo);
  const dataKey = isDemoAccount
    ? "projectBoardData"
    : `projectBoardData:${user?.id || "anonymous"}`;
  const seed = isDemoAccount ? initialBoardData : emptyBoardData;
  const syncedData = useFirebaseSync<any[]>(dataKey, seed);

  return [...syncedData, seed] as const;
}
