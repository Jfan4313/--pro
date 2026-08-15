export type InventoryStatus = "sufficient" | "warning" | "critical";

export interface InventoryMaterial {
  id: string;
  name: string;
  spec: string;
  stock: number;
  unit: string;
  location: string;
  status: InventoryStatus;
  supplier: string;
  project: string;
  type: string;
  sourceProject?: string;
  inboundAt?: string;
  photos?: string[];
  sourceType?: "project" | "purchase" | "other";
}

export interface WarehouseTransaction {
  id: string;
  direction: "inbound" | "outbound";
  materialId: string;
  materialName: string;
  spec: string;
  quantity: number;
  unit: string;
  occurredAt: string;
  sourceProject?: string;
  destinationProject?: string;
  location: string;
  supplier?: string;
  photos: string[];
  remark?: string;
  sourceType?: "project" | "purchase" | "other";
  orderId?: string;
  orderNo?: string;
  batch?: string;
}

export type WarehouseOutboundOrderStatus = "draft" | "pending" | "approved" | "cancelled";

export interface WarehouseOutboundOrderItem {
  id: string;
  materialId: string;
  materialName: string;
  spec: string;
  batch: string;
  location: string;
  quantity: number;
  unit: string;
  stockAtSubmit: number;
}

export interface WarehouseApprovalRecord {
  userId: string;
  userName: string;
  actionAt: string;
  remark?: string;
}

export interface WarehouseCancelRecord extends WarehouseApprovalRecord {
  reason: string;
}

export interface WarehouseOutboundOrder {
  id: string;
  orderNo: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  submittedAt: string;
  status: WarehouseOutboundOrderStatus;
  destinationProject: string;
  receiver: string;
  remark: string;
  photos: string[];
  items: WarehouseOutboundOrderItem[];
  auditRecord?: WarehouseApprovalRecord;
  cancelRecord?: WarehouseCancelRecord;
}

export type MaterialImportType = "BOM" | "PO" | "INVENTORY" | "PRICE";

export interface MaterialImportPreview {
  isOpen: boolean;
  type: MaterialImportType;
  data: any[];
  file: File | null;
  addToInventory: boolean;
}
