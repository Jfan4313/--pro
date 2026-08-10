import { useEntityList } from "./useEntityList";

export function useFirebaseCollection<T extends { id?: string }>(collectionName: string) {
  return useEntityList<T>(collectionName);
}
