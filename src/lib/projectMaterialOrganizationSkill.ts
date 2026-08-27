import { ProjectScanReport } from "./projectScanner";
import { STAGES } from "./projectLifecycle";
import { getArchiveStageFolder } from "./archiveStorage";

export type MaterialOrganizationItem = {
  fileId: string;
  sourceDisplayPath: string;
  targetLogicalPath: string;
  stageId?: string;
  category: string;
  operation: "copy" | "skip-duplicate" | "needs-review" | "conflict";
  confidence: number;
  evidence: string[];
};

export type MaterialOrganizationPlan = {
  id: string;
  projectKey: string;
  projectName: string;
  projectNumber?: string;
  sourceRootName: string;
  generatedAt: string;
  status: "draft" | "ready" | "confirmed" | "completed" | "failed";
  items: MaterialOrganizationItem[];
};

function dateFolder(value = new Date()) {
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
}

export function createMaterialOrganizationPlan(
  report: ProjectScanReport,
  projectKey: string,
  projectName: string,
  projectNumber: string | undefined,
  categoryOverrides: Record<string, { stageId: string; category: string }> = {}
): MaterialOrganizationPlan {
  const files = report.files.filter((file) => file.projectKey === projectKey);
  const items = files.map((file) => {
    const override = categoryOverrides[file.id];
    const stageId = override?.stageId || file.stageId;
    const category = override?.category || file.category || "其他资料";
    const stage = STAGES.find((candidate) => candidate.id === stageId);
    const operation = file.status === "unreadable" || !stageId
      ? "needs-review"
      : file.needsReview && !override
        ? "needs-review"
        : "copy";
    return {
      fileId: file.id,
      sourceDisplayPath: file.relativePath,
      targetLogicalPath: stage ? `${getArchiveStageFolder(stage)}/整理预览_${dateFolder()}/${category}/${file.name}` : `未确定/${category}/${file.name}`,
      stageId,
      category,
      operation,
      confidence: override ? 1 : file.confidence,
      evidence: override ? ["项目经理人工确认"] : file.evidence,
    } satisfies MaterialOrganizationItem;
  });
  return {
    id: `organization-${report.id}-${projectKey}`,
    projectKey,
    projectName,
    projectNumber,
    sourceRootName: report.rootNames.join("、"),
    generatedAt: new Date().toISOString(),
    status: items.some((item) => item.operation === "needs-review") ? "draft" : "ready",
    items,
  };
}

export function summarizeOrganizationPlan(plan: MaterialOrganizationPlan) {
  return {
    total: plan.items.length,
    ready: plan.items.filter((item) => item.operation === "copy").length,
    review: plan.items.filter((item) => item.operation === "needs-review").length,
    conflicts: plan.items.filter((item) => item.operation === "conflict").length,
  };
}
