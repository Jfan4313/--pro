export const EMPTY_BOARD_COLUMNS = [
  ["1_initiation", "项目立项"],
  ["2_preliminary", "初步设计"],
  ["3_business", "商务沟通"],
  ["4_contract", "签订合同"],
  ["5_filing", "项目备案"],
  ["6_detailed_design", "深化设计"],
  ["7_briefing", "项目交底"],
  ["8_construction", "施工进场"],
  ["9_acceptance", "验收并网"],
] as const;

export const EMPTY_WORKSPACE_KEYS = new Set([
  "projectBoardData", "personnelData", "scheduleData", "project_contracts", "costDataV2",
  "materialsData", "bomData", "bomHistory", "bomVersion", "materialPrices", "materialPriceHistory",
  "supplyOrders", "suppliers", "externalPartners", "organizationData", "chatChannels", "chatPosts",
  "workMemos", "quickIntakeItems", "appNotifications", "warehouseTransactions", "warehouseOutboundOrders",
]);

export function createEmptyBoardColumns() {
  return EMPTY_BOARD_COLUMNS.map(([id, title]) => ({ id, title, count: 0, projects: [] as any[] }));
}

export function createEmptyOrganization() {
  return { id: "org-1", name: "公司组织", type: "company" as const, children: [] as any[] };
}

export function emptyWorkspaceValue<T>(key: string, fallback: T): T {
  const isProjectBoard = key === "projectBoardData" || key.startsWith("projectBoardData:");
  if (isProjectBoard) return createEmptyBoardColumns() as T;
  if (!EMPTY_WORKSPACE_KEYS.has(key)) return fallback;
  return (key === "organizationData" ? createEmptyOrganization() : []) as T;
}
