import { useEffect } from "react";
import { useProjectBoardData } from "./useProjectBoardData";
import { useSyncedAppData } from "./useSyncedAppData";
import { flattenProjects } from "@/src/lib/management";
import { ArchiveFolderState, getCurrentAndNextStages, getLocalArchiveProvider } from "@/src/lib/archiveStorage";
import { STAGES, getProjectCurrentStageInfo } from "@/src/components/ProjectLifecycle";

export function useArchiveReconciler(enabled = true) {
  const [boardData, , boardLoading] = useProjectBoardData();
  const [lifecycleStates, , lifecycleLoading] = useSyncedAppData<Record<string, any>>("projectLifecycleStates", {});
  const [folderStates, setFolderStates, folderStatesLoading] = useSyncedAppData<Record<string, ArchiveFolderState>>("projectArchiveFolderStates", {});
  const [appSettings, , settingsLoading] = useSyncedAppData<any>("appSettings", {});

  useEffect(() => {
    if (!enabled || boardLoading || lifecycleLoading || folderStatesLoading || settingsLoading || appSettings?.fileManagement?.autoCreateFolders === false) return;
    let cancelled = false;

    const reconcile = async () => {
      const provider = await getLocalArchiveProvider();
      const availability = await provider?.checkAvailability();
      if (!provider || !availability?.available) return;
      const projects = flattenProjects(boardData);
      const updates: Record<string, ArchiveFolderState> = {};
      for (const project of projects) {
        if (cancelled) return;
        const current = getProjectCurrentStageInfo(project.id, lifecycleStates);
        const stages = getCurrentAndNextStages(STAGES, current.index);
        try {
          const result = await provider.ensureProjectStructure(project, stages, folderStates[project.id]?.projectFolder);
          updates[project.id] = {
            status: "ready",
            storageProvider: "local-folder",
            projectFolder: result.projectFolder,
            generatedThroughStageId: result.generatedThroughStageId,
            updatedAt: new Date().toISOString(),
          };
        } catch (error: any) {
          updates[project.id] = {
            ...folderStates[project.id],
            status: "error",
            storageProvider: "local-folder",
            updatedAt: new Date().toISOString(),
            error: error?.message || "archive_structure_failed",
          };
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        await setFolderStates((current) => ({ ...current, ...updates }));
      }
    };

    void reconcile();
    const handleRootChange = () => void reconcile();
    window.addEventListener("archive-root-changed", handleRootChange);
    return () => {
      cancelled = true;
      window.removeEventListener("archive-root-changed", handleRootChange);
    };
  }, [enabled, boardData, boardLoading, lifecycleStates, lifecycleLoading, folderStatesLoading, settingsLoading, appSettings?.fileManagement?.autoCreateFolders]);
}
