type ProjectBoardColumn = {
  id?: string;
  title?: string;
  count?: number;
  projects?: any[];
  [key: string]: any;
};

function projectIdentity(project: any) {
  const id = String(project?.id || "").trim();
  if (id) return `id:${id}`;
  const number = String(project?.projectNumber || project?.number || "").trim();
  if (number) return `number:${number}`;
  const name = String(project?.name || project?.projectName || "").trim();
  return name ? `name:${name}` : "";
}

export function hasProjectBoardProjects(value: unknown) {
  return Array.isArray(value)
    && value.some((column: any) => Array.isArray(column?.projects) && column.projects.length > 0);
}

export function mergeProjectBoardData(
  primary: unknown,
  legacyValues: unknown[],
  fallback: ProjectBoardColumn[],
) {
  const sources = [primary, ...legacyValues].filter(Array.isArray) as ProjectBoardColumn[][];
  const columnOrder: string[] = [];
  const columnIds = new Set<string>();
  const addColumnId = (id: unknown) => {
    const normalized = String(id || "").trim();
    if (!normalized || columnIds.has(normalized)) return;
    columnIds.add(normalized);
    columnOrder.push(normalized);
  };

  fallback.forEach((column) => addColumnId(column.id));
  sources.forEach((source) => source.forEach((column) => addColumnId(column?.id)));

  const columns = new Map<string, ProjectBoardColumn>();
  fallback.forEach((column) => {
    if (column.id) columns.set(column.id, { ...column, projects: [] });
  });

  // Apply lower-priority metadata first so the current company board wins.
  [...sources].reverse().forEach((source) => {
    source.forEach((column) => {
      const id = String(column?.id || "").trim();
      if (!id) return;
      columns.set(id, { ...(columns.get(id) || {}), ...column, id, projects: [] });
    });
  });

  const seenProjects = new Set<string>();
  sources.forEach((source) => {
    source.forEach((column) => {
      const columnId = String(column?.id || "").trim();
      if (!columnId) return;
      const target = columns.get(columnId) || { id: columnId, projects: [] };
      for (const project of Array.isArray(column?.projects) ? column.projects : []) {
        const identity = projectIdentity(project);
        if (identity && seenProjects.has(identity)) continue;
        if (identity) seenProjects.add(identity);
        target.projects = [...(target.projects || []), project];
      }
      columns.set(columnId, target);
    });
  });

  return columnOrder.map((id) => {
    const column = columns.get(id) || { id, projects: [] };
    const projects = Array.isArray(column.projects) ? column.projects : [];
    return { ...column, projects, count: projects.length };
  });
}
