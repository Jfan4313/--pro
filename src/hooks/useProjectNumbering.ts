import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/src/lib/auth";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { flattenProjects } from "@/src/lib/management";
import {
  formatProjectNumber,
  getHighestProjectSequence,
  getProjectNumberConflicts,
  migrateProjectNumbers,
} from "@/src/lib/projectNumbering";

export function useProjectNumbering() {
  const { user } = useAuth();
  const [boardData, setBoardData, boardLoading] = useProjectBoardData();
  const [archivedProjects, setArchivedProjects, archiveLoading] = useSyncedAppData<any[]>("projectArchive", []);
  const scope = user?.isDemo ? "demo" : user?.id || "anonymous";
  const [reservedSequence, setReservedSequence, sequenceLoading] = useSyncedAppData<number>(`projectNumberSequence:${scope}`, 0);
  const [migrationDone, setMigrationDone, migrationLoading] = useSyncedAppData<boolean>(`projectNumberMigrationV1:${scope}`, false);
  const sequenceRef = useRef(0);

  const activeProjects = useMemo(() => flattenProjects(boardData), [boardData]);
  const allProjects = useMemo(() => [...activeProjects, ...(Array.isArray(archivedProjects) ? archivedProjects : [])], [activeProjects, archivedProjects]);

  useEffect(() => {
    sequenceRef.current = Math.max(sequenceRef.current, Number(reservedSequence || 0), getHighestProjectSequence(allProjects));
  }, [allProjects, reservedSequence]);

  useEffect(() => {
    if (boardLoading || archiveLoading || sequenceLoading || migrationLoading) return;
    const migration = migrateProjectNumbers(boardData, archivedProjects, reservedSequence);
    if (migration.changedBoard) void setBoardData(migration.board);
    if (migration.changedArchive) void setArchivedProjects(migration.archived);
    if (migration.sequence > Number(reservedSequence || 0)) void setReservedSequence(migration.sequence);
    if (!migrationDone) void setMigrationDone(true);
  }, [archiveLoading, archivedProjects, boardData, boardLoading, migrationDone, migrationLoading, reservedSequence, sequenceLoading]);

  const reserveProjectNumber = useCallback(async () => {
    const next = Math.max(sequenceRef.current, getHighestProjectSequence(allProjects, reservedSequence)) + 1;
    sequenceRef.current = next;
    await setReservedSequence(next);
    return formatProjectNumber(next);
  }, [allProjects, reservedSequence, setReservedSequence]);

  const resetProjectNumbering = useCallback(async () => {
    sequenceRef.current = 0;
    await setReservedSequence(0);
  }, [setReservedSequence]);

  return {
    allProjects,
    // 已归档项目不再阻塞当前项目的编号跳转；只有仍在项目看板中的项目才参与冲突提示。
    conflicts: getProjectNumberConflicts(activeProjects),
    loading: boardLoading || archiveLoading || sequenceLoading || migrationLoading,
    reserveProjectNumber,
    resetProjectNumbering,
  };
}
