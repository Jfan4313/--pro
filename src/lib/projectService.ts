import { hasProjectIdentityConflict, normalizeProjectNumber } from "@/src/lib/projectNumbering";

export type ProjectInput = {
  name: string;
  projectNumber?: string;
  type?: string;
  businessModel?: string;
  manager?: string;
  managerId?: string;
};

export function normalizeProjectInput(input: ProjectInput): ProjectInput {
  return {
    ...input,
    name: String(input.name || "").trim().replace(/\s+/g, " "),
    projectNumber: input.projectNumber ? normalizeProjectNumber(input.projectNumber) : undefined,
    type: input.type || "光伏项目",
    businessModel: input.businessModel || "EPC",
    manager: String(input.manager || "").trim(),
    managerId: String(input.managerId || "").trim(),
  };
}

export function validateProjectInput(projects: any[], input: ProjectInput, editingId?: string) {
  const normalized = normalizeProjectInput(input);
  const conflict = hasProjectIdentityConflict(projects, { ...normalized, id: editingId });
  return {
    input: normalized,
    valid: Boolean(normalized.name) && !conflict.nameConflict && !conflict.numberConflict,
    conflict,
  };
}

export function buildProjectRecord(input: ProjectInput, projectNumber: string, id = `p${Date.now()}`) {
  const normalized = normalizeProjectInput(input);
  return {
    id,
    projectNumber: normalizeProjectNumber(projectNumber),
    name: normalized.name,
    type: normalized.type,
    businessModel: normalized.businessModel,
    manager: normalized.manager,
    managerId: normalized.managerId,
    constructProgress: 0,
    supplyProgress: 0,
    status: "normal",
  };
}
