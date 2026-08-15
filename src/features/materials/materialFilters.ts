import type { InventoryMaterial } from "./types";

export function filterInventoryMaterials({
  data,
  selectedProject,
  selectedType,
  searchQuery,
  showAlertsOnly,
}: {
  data: InventoryMaterial[];
  selectedProject: string;
  selectedType: string;
  searchQuery: string;
  showAlertsOnly: boolean;
}) {
  return data.filter((material) => {
    const matchesProject = selectedProject === "全部项目" || (material.sourceProject || material.project) === selectedProject;
    const matchesType = selectedType === "全部类型" || material.type === selectedType;
    const matchesSearch = material.name.includes(searchQuery) || material.id.toLowerCase().includes(searchQuery.toLowerCase()) || material.spec.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAlerts = showAlertsOnly ? material.status !== "sufficient" : true;
    return matchesProject && matchesType && matchesSearch && matchesAlerts;
  });
}

export function filterBomMaterials(data: any[], selectedProject: string, searchQuery: string) {
  return data.filter((material: any) => {
    const matchesProject = selectedProject === "全部项目" || material.project === selectedProject;
    const matchesSearch = material.name.includes(searchQuery) || material.id.toLowerCase().includes(searchQuery.toLowerCase()) || material.spec.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProject && matchesSearch;
  });
}

export function filterPriceMaterials(data: any[], searchQuery: string) {
  return data.filter((material: any) => material.name.includes(searchQuery) || material.id.toLowerCase().includes(searchQuery.toLowerCase()) || material.spec.toLowerCase().includes(searchQuery.toLowerCase()));
}

export function buildInventoryCsvRows(data: InventoryMaterial[]) {
  const headers = ["物资编号", "物资名称", "规格型号", "来源项目", "当前库存", "单位", "存放位置", "供应商", "最近入库时间", "照片数量", "状态"];
  const rows = data.map((material) => [
    material.id,
    material.name,
    material.spec,
    material.sourceProject || material.project,
    material.stock.toString(),
    material.unit,
    material.location,
    material.supplier,
    material.inboundAt || "",
    String(material.photos?.length || 0),
    material.status === "sufficient" ? "充足" : material.status === "warning" ? "预警" : "短缺",
  ]);

  return [headers, ...rows];
}
