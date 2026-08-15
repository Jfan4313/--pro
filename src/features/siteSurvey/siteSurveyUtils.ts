import { API_BASE_URL } from "@/src/lib/apiClient";
import type { PendingSurvey, SurveyRecord } from "./types";
import { getPhotoCategory } from "./siteSurveyConfig";

export function uploadedUrl(url: string) {
  return url.startsWith("http") || url.startsWith("data:") ? url : `${API_BASE_URL}${url}`;
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isStorageQuotaError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    : String((error as any)?.name || "").includes("Quota");
}

export function pendingToRecord(pending: PendingSurvey): SurveyRecord {
  return {
    id: pending.id,
    ...pending.form,
    projectName: pending.projectName,
    createdAt: pending.createdAt,
    status: "pending",
    photos: pending.photos.map((photo) => {
      const category = getPhotoCategory(photo.category);
      return photo.uploaded || {
        id: photo.id,
        name: photo.name,
        url: photo.dataUrl,
        createdAt: pending.createdAt,
        category: category.id,
        categoryLabel: category.label,
        categoryGroup: category.group,
      };
    }),
  };
}
