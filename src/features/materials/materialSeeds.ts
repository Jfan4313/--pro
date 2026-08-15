import type { InventoryMaterial } from "./types";

export const materialsDataInitial: InventoryMaterial[] = [
  { id: "M-001", name: "单晶硅光伏组件", spec: "550Wp", stock: 1200, unit: "块", location: "A区露天堆场", status: "sufficient", supplier: "隆基绿能", project: "A区商业综合体", type: "光伏组件" },
  { id: "M-002", name: "磷酸铁锂电池簇", spec: "280Ah/1P52S", stock: 4, unit: "套", location: "B区恒温库", status: "warning", supplier: "宁德时代", project: "B区住宅一期", type: "储能设备" },
  { id: "M-003", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", stock: 500, unit: "米", location: "A区钢材库", status: "sufficient", supplier: "宝钢股份", project: "A区商业综合体", type: "钢材构件" },
  { id: "M-004", name: "交联聚乙烯电缆", spec: "YJV22-8.7/15kV 3x70", stock: 150, unit: "米", location: "C区线缆库", status: "critical", supplier: "远东电缆", project: "C区地下车库", type: "线缆" },
  { id: "M-005", name: "智能逆变器", spec: "100kW 组串式", stock: 12, unit: "台", location: "B区设备库", status: "sufficient", supplier: "华为技术", project: "B区住宅一期", type: "逆变设备" },
  { id: "M-006", name: "高强度螺栓", spec: "M12x40 8.8级", stock: 5000, unit: "套", location: "A区五金库", status: "sufficient", supplier: "晋亿实业", project: "市政道路标段", type: "五金辅材" },
];

export const initialBomData = [
  { id: "BOM-001", name: "单晶硅光伏组件", spec: "550Wp", plannedQty: 2000, procuredQty: 1200, unit: "块", project: "A区商业综合体" },
  { id: "BOM-002", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", plannedQty: 1000, procuredQty: 500, unit: "米", project: "A区商业综合体" },
];

export const initialBomHistory = [
  { id: "H-001", date: "2026-03-01 10:00", user: "张工 (技术部)", action: "初始导入", details: "导入了A区商业综合体初始材料清单 (BOM v1.0)" },
  { id: "H-002", date: "2026-03-10 14:30", user: "李工 (采购部)", action: "采购单导入", details: "导入采购单 PO-2026-001，更新光伏组件已采购数量 +1200" },
];

export const initialPriceData = [
  { id: "M-001", name: "单晶硅光伏组件", spec: "550Wp", price: 0.95, unit: "元/W", date: "2026-03-01", supplier: "隆基绿能" },
  { id: "M-003", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", price: 5200, unit: "元/吨", date: "2026-02-15", supplier: "宝钢股份" },
];

export const initialPriceHistory = [
  { id: "M-001", price: 0.98, unit: "元/W", date: "2026-01-15", supplier: "隆基绿能" },
  { id: "M-001", price: 0.95, unit: "元/W", date: "2026-03-01", supplier: "隆基绿能" },
  { id: "M-003", price: 5000, unit: "元/吨", date: "2026-01-10", supplier: "宝钢股份" },
  { id: "M-003", price: 5200, unit: "元/吨", date: "2026-02-15", supplier: "宝钢股份" },
];

export const materialTypes = ["全部类型", "光伏组件", "储能设备", "钢材构件", "线缆", "逆变设备", "五金辅材"];
