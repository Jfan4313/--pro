function normalizeProjectText(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s·・,，。/\\()（）【】\[\]_-]+/g, "");
}

/** Resolve the parent memo's project for a follow-up form. */
export function resolveFollowUpProject(projects: any[] = [], parent: { projectId?: string; projectName?: string } = {}) {
  const projectId = String(parent.projectId || "").trim();
  const projectName = String(parent.projectName || "").trim();
  const exact = projects.find((project) => projectId && String(project?.id || "") === projectId)
    || projects.find((project) => projectName && String(project?.name || project?.projectName || "").trim() === projectName);
  if (exact) return { projectId: String(exact.id || ""), projectName: String(exact.name || exact.projectName || projectName).trim() };

  const normalizedParent = normalizeProjectText(projectName);
  if (normalizedParent) {
    const fuzzy = projects.find((project) => {
      const candidate = normalizeProjectText(project?.name || project?.projectName);
      return candidate.length >= 2 && (normalizedParent.includes(candidate) || candidate.includes(normalizedParent));
    });
    if (fuzzy) return { projectId: String(fuzzy.id || ""), projectName: String(fuzzy.name || fuzzy.projectName || projectName).trim() };
  }

  // Legacy memos may only have projectName. Keep that name as the stable
  // selection key until the project board is loaded, so the follow-up does
  // not silently fall back to "未关联项目".
  return { projectId: projectId || projectName, projectName };
}
