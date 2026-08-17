import { apiClient } from "@/src/lib/apiClient";

export const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;

export type LocalUploadResult = {
  name: string;
  size: string;
  type: "image" | "file";
  dataUrl: string;
  url?: string;
  storage: "server" | "local-pending";
};

function displaySize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function readAndUploadFile(file: File): Promise<LocalUploadResult> {
  if (file.size > MAX_UPLOAD_SIZE) return Promise.reject(new Error(`${file.name} 超过 8MB`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`));
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      const base = {
        name: file.name,
        size: displaySize(file.size),
        type: file.type.startsWith("image/") ? "image" as const : "file" as const,
        dataUrl,
      };
      try {
        const uploaded = await apiClient.uploadFile(file.name, dataUrl.split(",")[1] || dataUrl);
        resolve({ ...base, url: uploaded.url, storage: "server" });
      } catch {
        resolve({ ...base, storage: "local-pending" });
      }
    };
    reader.readAsDataURL(file);
  });
}
