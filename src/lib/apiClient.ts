import { AUTH_TOKEN_KEY, getClientId, getUserId } from "./clientIdentity";

const viteEnv = (import.meta as any).env || {};

export const API_BASE_URL =
  viteEnv.VITE_LOCAL_API_URL || "";

export function getProjectFileDownloadUrl(relativePath: string) {
  return `${API_BASE_URL}/api/project-files/download?relativePath=${encodeURIComponent(relativePath)}`;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Client-Id", getClientId());
  headers.set("X-User-Id", getUserId());
  const authToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: body as BodyInit | undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw Object.assign(new Error(error.error || response.statusText), { status: response.status, details: error });
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  login(username: string, password: string) {
    return request<{ token: string; expiresAt: string; user: any }>("/api/auth/login", { method: "POST", body: { username, password } });
  },
  requestOtp(phone: string) {
    return request<{ ok: boolean; expiresIn: number; devCode?: string; delivery: string }>("/api/auth/request-otp", { method: "POST", body: { phone } });
  },
  loginWithOtp(phone: string, code: string) {
    return request<{ token: string; expiresAt: string; user: any }>("/api/auth/login-otp", { method: "POST", body: { phone, code } });
  },
  getCurrentUser() {
    return request<{ user: any }>("/api/auth/me");
  },
  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ ok: boolean }>("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
  },
  listAccounts() {
    return request<any[]>("/api/accounts");
  },
  listAccountDirectory() {
    return request<Array<{ id: string; username: string; name: string; role: string; status: string; companyId: string }>>("/api/account-directory");
  },
  createAccount(payload: any) {
    return request<any>("/api/accounts", { method: "POST", body: payload });
  },
  updateAccount(id: string, payload: any) {
    return request<any>(`/api/accounts/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  },
  resetAccountPassword(id: string, password: string) {
    return request<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { password } });
  },
  getAppData<T>(key: string) {
    return request<{ key: string; value: T; updatedAt: string; version: number; exists?: boolean }>(`/api/app-data/${encodeURIComponent(key)}`);
  },
  putAppData<T>(key: string, value: T) {
    return request<{ key: string; value: T; updatedAt: string; version: number }>(`/api/app-data/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { value },
    });
  },
  list<T>(resource: string) {
    return request<T[]>(`/api/${encodeURIComponent(resource)}`);
  },
  create<T>(resource: string, payload: Partial<T>) {
    return request<T>(`/api/${encodeURIComponent(resource)}`, { method: "POST", body: payload });
  },
  update<T>(resource: string, id: string, payload: Partial<T>) {
    return request<T>(`/api/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  },
  remove<T>(resource: string, id: string, baseVersion?: number) {
    const query = baseVersion ? `?baseVersion=${baseVersion}` : "";
    return request<T>(`/api/${encodeURIComponent(resource)}/${encodeURIComponent(id)}${query}`, { method: "DELETE" });
  },
  pull(sinceVersion: number) {
    return request<{ changes: any[]; serverVersion: number }>("/api/sync/pull", { method: "POST", body: { sinceVersion } });
  },
  push(operations: any[]) {
    return request<{ applied: any[]; conflicts: any[]; serverVersion: number }>("/api/sync/push", { method: "POST", body: { operations } });
  },
  uploadFile(filename: string, contentBase64: string) {
    return request<{ id: string; filename: string; url: string; createdAt: string }>("/api/upload", {
      method: "POST",
      body: { filename, contentBase64 },
    });
  },
  getFileSettings() {
    return request<{
      rootPath: string;
      defaultRootPath: string;
      autoRename: boolean;
      autoCreateFolders: boolean;
    }>("/api/file-settings");
  },
  updateFileSettings(payload: { rootPath: string; autoRename?: boolean; autoCreateFolders?: boolean }) {
    return request<{
      rootPath: string;
      defaultRootPath: string;
      autoRename: boolean;
      autoCreateFolders: boolean;
      savedAt: string;
    }>("/api/file-settings", { method: "PUT", body: payload });
  },
  openFileRoot() {
    return request<{ ok: boolean; rootPath: string }>("/api/file-settings/open", { method: "POST" });
  },
  initProjectFolders(projectId: string, payload: { project: unknown; stages: unknown[] }) {
    return request<{
      ok: boolean;
      rootPath: string;
      projectFolder: string;
      projectPath: string;
      stages: unknown[];
    }>(`/api/projects/${encodeURIComponent(projectId)}/folders/init`, { method: "POST", body: payload });
  },
  initAllProjectFolders(payload: { projects: unknown[]; stages: unknown[] }) {
    return request<{
      ok: boolean;
      count: number;
      initialized: unknown[];
    }>("/api/projects/folders/init-all", { method: "POST", body: payload });
  },
  listProjectFiles(projectId: string, payload: { project: unknown; stages: unknown[] }) {
    return request<{
      rootPath: string;
      projectFolder: string;
      projectPath: string;
      stages: Array<{
        stageId: string;
        stageName: string;
        folder: string;
        files: Array<{
          name: string;
          bucket: string;
          size: number;
          updatedAt: string;
          relativePath: string;
        }>;
      }>;
    }>(`/api/projects/${encodeURIComponent(projectId)}/files/list`, { method: "POST", body: payload });
  },
  uploadProjectStageFile(payload: {
    projectId: string;
    stageId: string;
    project: unknown;
    stage: unknown;
    fileType?: string;
    filename: string;
    contentBase64: string;
  }) {
    const { projectId, stageId, ...body } = payload;
    return request<{
      id: string;
      projectId: string;
      stageId: string;
      fileType: string;
      originalName: string;
      originalBase: string;
      storedName: string;
      version: string;
      relativePath: string;
      absolutePath: string;
      uploadedAt: string;
    }>(`/api/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/upload`, {
      method: "POST",
      body,
    });
  },
  analyzeIntake(payload: {
    inputType: "text" | "image" | "audio";
    text?: string;
    attachmentUrl?: string;
    projects?: unknown[];
    personnel?: unknown[];
  }) {
    return request<{
      title: string;
      projectId: string;
      projectName: string;
      projectMatchType?: "existing" | "new" | "unknown";
      projectMatchConfidence?: number;
      projectCandidates?: Array<{ id: string; name: string; projectNumber?: string }>;
      assignee: string;
      assignees?: string[];
      deadline: string;
      summary: string;
      transcript?: string;
      confidence: number;
      needsManualReview: boolean;
      items?: Array<{
        id: string;
        title: string;
        summary: string;
        projectId: string;
        projectName: string;
        projectMatchType?: "existing" | "new" | "unknown";
        projectMatchConfidence?: number;
        assignee: string;
        assignees?: string[];
        deadline: string;
        dueTime?: string;
        confidence: number;
        needsManualReview: boolean;
      }>;
    }>("/api/intake/analyze", { method: "POST", body: payload });
  },
  transcribeAudio(attachmentUrl: string) {
    return request<{ transcript: string; model: string }>("/api/intake/transcribe", { method: "POST", body: { attachmentUrl } });
  },
  debugAI(payload?: { endpoint?: string; model?: string; apiKey?: string; timeoutMs?: number }) {
    return request<{ ok: boolean; stage: string; model: string; endpoint: string; configured: boolean; durationMs?: number; message?: string; result?: { title: string; deadline: string } }>("/api/ai-debug", { method: "POST", body: payload || {} });
  },
  getAIConfig() {
    return request<{ endpoint: string; model: string; hasKey: boolean; configured: boolean; timeoutMs: number; updatedAt?: string | null }>("/api/ai-config");
  },
  updateAIConfig(payload: { endpoint: string; model: string; apiKey?: string; clearApiKey?: boolean; timeoutMs: number }) {
    return request<{ endpoint: string; model: string; hasKey: boolean; configured: boolean; timeoutMs: number; updatedAt?: string | null }>("/api/ai-config", { method: "PUT", body: payload });
  },
  getUserSettings<T>() {
    return request<{ value: T; updatedAt: string }>("/api/user-settings");
  },
  updateUserSettings<T>(value: T) {
    return request<{ value: T; updatedAt: string }>("/api/user-settings", { method: "PUT", body: { value } });
  },
  getAIUsage(params: { from?: string; to?: string; userId?: string; model?: string; status?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
    return request<{
      summary: { calls: number; successes: number; failures: number; inputTokens: number; outputTokens: number; totalTokens: number };
      byUser: Array<{ userId: string; name: string; username: string; calls: number; inputTokens: number; outputTokens: number; totalTokens: number }>;
      records: Array<{ id: string; userId: string; userName: string; username: string; feature: string; model: string; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; status: string; durationMs: number; createdAt: string }>;
      pagination: { page: number; pageSize: number; total: number };
    }>(`/api/ai-usage${query.size ? `?${query.toString()}` : ""}`);
  },
  exportBackup() {
    return request<{ ok: boolean; path: string }>("/api/backup/export", { method: "POST" });
  },
};
