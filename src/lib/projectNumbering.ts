import { flattenProjects, getProjectNumber } from "@/src/lib/management";

export const PROJECT_NUMBER_PREFIX = "PRJ-";

export function formatProjectNumber(sequence: number) {
  return `${PROJECT_NUMBER_PREFIX}${String(Math.max(1, Math.trunc(sequence))).padStart(4, "0")}`;
}

export function parseProjectSequence(value: unknown) {
  const match = String(value || "").trim().match(/^PRJ-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

export function compareProjectNames(a: any, b: any) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortProjectsNaturally<T = any>(projects: T[] = []): T[] {
  return [...projects].sort(compareProjectNames);
}

export function getProjectNumberConflicts(projects: any[] = []) {
  const byNumber = new Map<string, any[]>();
  projects.forEach((project) => {
    const value = String(project?.projectNumber || project?.code || "").trim();
    if (!value) return;
    const key = value.toLocaleUpperCase();
    byNumber.set(key, [...(byNumber.get(key) || []), project]);
  });
  return [...byNumber.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([projectNumber, matches]) => ({ projectNumber, projects: matches }));
}

export function resolveProjectReference(projects: any[] = [], reference?: string | null) {
  const normalized = String(reference || "").trim().toLocaleUpperCase();
  if (!normalized) return { project: null, conflict: false };
  const idMatch = projects.find((project) => String(project.id) === String(reference));
  if (idMatch) return { project: idMatch, conflict: false };
  const matches = projects.filter((project) => String(project.projectNumber || project.code || "").trim().toLocaleUpperCase() === normalized);
  return { project: matches.length === 1 ? matches[0] : null, conflict: matches.length > 1 };
}

export function getHighestProjectSequence(projects: any[] = [], reservedSequence = 0) {
  return projects.reduce((max, project) => Math.max(max, parseProjectSequence(project?.projectNumber || project?.code)), Number(reservedSequence || 0));
}

export function migrateProjectNumbers(boardData: any[] = [], archivedProjects: any[] = [], reservedSequence = 0) {
  const activeProjects = flattenProjects(boardData);
  const allProjects = [...activeProjects, ...(Array.isArray(archivedProjects) ? archivedProjects : [])];
  const explicitlyUsed = new Set(
    allProjects
      .map((project) => String(project?.projectNumber || project?.code || "").trim().toLocaleUpperCase())
      .filter(Boolean),
  );
  const legacyIndexes = new Map(allProjects.map((project, index) => [String(project.id), index]));
  let sequence = getHighestProjectSequence(allProjects, reservedSequence);

  const assign = (project: any) => {
    const explicit = String(project?.projectNumber || project?.code || "").trim();
    if (explicit) return project.projectNumber === explicit ? project : { ...project, projectNumber: explicit };

    let candidate = getProjectNumber(project, legacyIndexes.get(String(project.id)) || 0);
    while (explicitlyUsed.has(candidate.toLocaleUpperCase())) {
      sequence += 1;
      candidate = formatProjectNumber(sequence);
    }
    explicitlyUsed.add(candidate.toLocaleUpperCase());
    sequence = Math.max(sequence, parseProjectSequence(candidate));
    return { ...project, projectNumber: candidate };
  };

  const board = (Array.isArray(boardData) ? boardData : []).map((column) => ({
    ...column,
    projects: (column.projects || []).map(assign),
  }));
  const archived = (Array.isArray(archivedProjects) ? archivedProjects : []).map(assign);
  const changedBoard = board.some((column, columnIndex) => (column.projects || []).some((project: any, projectIndex: number) => project !== boardData[columnIndex]?.projects?.[projectIndex]));
  const changedArchive = archived.some((project, index) => project !== archivedProjects[index]);

  return {
    board,
    archived,
    sequence: getHighestProjectSequence([...flattenProjects(board), ...archived], sequence),
    changedBoard,
    changedArchive,
    conflicts: getProjectNumberConflicts([...flattenProjects(board), ...archived]),
  };
}
