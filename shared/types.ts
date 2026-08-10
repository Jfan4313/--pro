export type ResourceName =
  | "projects"
  | "project_lifecycle_states"
  | "contracts"
  | "procurement_orders"
  | "materials"
  | "material_prices"
  | "cost_ledgers"
  | "schedule_tasks"
  | "personnel"
  | "organizations"
  | "chat_channels"
  | "chat_posts"
  | "attachments"
  | "users"
  | "sync_events";

export interface SyncMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  clientId: string;
  updatedBy: string;
}

export type EntityRecord<T = Record<string, unknown>> = SyncMetadata & T;

export type SyncOperationType = "upsert" | "delete";

export interface SyncOperation<T = Record<string, unknown>> {
  id: string;
  resource: ResourceName | string;
  recordId: string;
  type: SyncOperationType;
  payload?: T;
  baseVersion?: number;
  clientId: string;
  updatedBy?: string;
  createdAt: string;
}

export interface SyncConflict<T = Record<string, unknown>> {
  operation: SyncOperation<T>;
  serverRecord: EntityRecord<T> | null;
  reason: "version_conflict";
}

export interface SyncPushResponse<T = Record<string, unknown>> {
  applied: EntityRecord<T>[];
  conflicts: SyncConflict<T>[];
  serverVersion: number;
}

export interface SyncPullResponse<T = Record<string, unknown>> {
  changes: EntityRecord<T>[];
  serverVersion: number;
}

export interface AppDataEnvelope<T> {
  key: string;
  value: T;
  updatedAt: string;
  version: number;
}
