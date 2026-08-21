import { flattenProjects, getProjectNumber } from "@/src/lib/management";

export const PROJECT_NUMBER_PREFIX = "PRJ-";

export function formatProjectNumber(sequence: number) {
  return `${PROJECT_NUMBER_PREFIX}${String(Math.max(1, Math.trunc(sequence))).padStart(4, "0")}`;
}

export function parseProjectSequence(value: unknown) {
  const match = String(value || "").trim().match(/^PRJ-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

export function normalizeProjectNumber(value: unknown) {
  const normalized = String(value || "").trim().toLocaleUpperCase();
  const digits = normalized.match(/^(?:PRJ[-_ ]?)?(\d+)$/)?.[1];
  return digits ? formatProjectNumber(Number(digits)) : normalized;
}

export function isValidProjectNumber(value: unknown) {
  return /^PRJ-\d{4,}$/.test(normalizeProjectNumber(value));
}

export function normalizeProjectName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function compareProjectNames(a: any, b: any) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortProjectsNaturally<T = any>(projects: T[] = []): T[] {
  return [...projects].sort((a: any, b: any) => {
    const aNumber = normalizeProjectNumber(a?.projectNumber || a?.code);
    const bNumber = normalizeProjectNumber(b?.projectNumber || b?.code);
    const aSequence = parseProjectSequence(aNumber);
    const bSequence = parseProjectSequence(bNumber);
    if (aSequence && bSequence && aSequence !== bSequence) return aSequence - bSequence;
    if (aSequence && !bSequence) return -1;
    if (!aSequence && bSequence) return 1;
    const numberOrder = aNumber.localeCompare(bNumber, "zh-CN", { numeric: true, sensitivity: "base" });
    if (numberOrder) return numberOrder;
    const nameOrder = compareProjectNames(a, b);
    return nameOrder || String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

export function getProjectNumberConflicts(projects: any[] = []) {
  const byNumber = new Map<string, any[]>();
  projects.forEach((project) => {
    const value = normalizeProjectNumber(project?.projectNumber || project?.code);
    if (!value) return;
    byNumber.set(value, [...(byNumber.get(value) || []), project]);
  });
  return [...byNumber.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([projectNumber, matches]) => ({ projectNumber, projects: matches }));
}

export function getProjectNameConflicts(projects: any[] = []) {
  const byName = new Map<string, any[]>();
  projects.forEach((project) => {
    const key = normalizeProjectName(project?.name);
    if (!key) return;
    byName.set(key, [...(byName.get(key) || []), project]);
  });
  return [...byName.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([, matches]) => ({ projectName: String(matches[0]?.name || "").trim(), projects: matches }));
}

export function hasProjectIdentityConflict(projects: any[] = [], candidate: { id?: string; name?: string; projectNumber?: string }) {
  const candidateName = normalizeProjectName(candidate.name);
  const candidateNumber = normalizeProjectNumber(candidate.projectNumber);
  const others = projects.filter((project) => String(project?.id) !== String(candidate.id || ""));
  return {
    nameConflict: Boolean(candidateName) && others.some((project) => normalizeProjectName(project?.name) === candidateName),
    numberConflict: Boolean(candidateNumber) && others.some((project) => normalizeProjectNumber(project?.projectNumber || project?.code) === candidateNumber),
  };
}

export function resolveProjectReference(projects: any[] = [], reference?: string | null) {
  const rawReference = String(reference || "").trim();
  const normalized = normalizeProjectNumber(rawReference);
  if (!normalized) return { project: null, conflict: false };
  const idMatch = projects.find((project) => String(project.id) === rawReference);
  if (idMatch) return { project: idMatch, conflict: false };
  const matches = projects.filter((project) => normalizeProjectNumber(project.projectNumber || project.code) === normalized);
  return { project: matches.length === 1 ? matches[0] : null, conflict: matches.length > 1 };
}

export function getHighestProjectSequence(projects: any[] = [], reservedSequence = 0) {
  return projects.reduce((max, project) => Math.max(max, parseProjectSequence(normalizeProjectNumber(project?.projectNumber || project?.code))), Number(reservedSequence || 0));
}

export function migrateProjectNumbers(boardData: any[] = [], archivedProjects: any[] = [], reservedSequence = 0) {
  const activeProjects = flattenProjects(boardData);
  const allProjects = [...activeProjects, ...(Array.isArray(archivedProjects) ? archivedProjects : [])];
  const explicitlyUsed = new Set(
    allProjects
      .map((project) => normalizeProjectNumber(project?.projectNumber || project?.code))
      .filter(Boolean),
  );
  const legacyIndexes = new Map(allProjects.map((project, index) => [String(project.id), index]));
  let sequence = getHighestProjectSequence(allProjects, reservedSequence);

  const assign = (project: any) => {
    const explicit = normalizeProjectNumber(project?.projectNumber || project?.code);
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
