import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { useAuth } from "@/src/lib/auth";

const EVENT_NAME = "zhijian-user-settings-changed";
const settingsCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>();

export function useUserSettings<T>(initialValue: T) {
  const { user } = useAuth();
  const cacheKey = `zhijian-user-settings:${user?.companyId || "company-default"}:${user?.id || "guest"}`;
  const [data, setData] = useState<T>(() => {
    try { return JSON.parse(window.localStorage.getItem(cacheKey) || "null") || initialValue; } catch { return initialValue; }
  });
  const [loading, setLoading] = useState(true);
  const dataRef = useRef(data);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const cached = settingsCache.get(cacheKey) || {};
    if (cached.value !== undefined) {
      dataRef.current = cached.value as T;
      setData(cached.value as T);
    }
    const request: Promise<{ value: T; updatedAt: string }> = (cached.promise as Promise<{ value: T; updatedAt: string }> | undefined) || apiClient.getUserSettings<T>().then((response) => {
      settingsCache.set(cacheKey, { value: response.value });
      return response;
    });
    settingsCache.set(cacheKey, { ...cached, promise: request });
    request
      .then((response) => {
        if (cancelled) return;
        dataRef.current = response.value;
        setData(response.value);
        window.localStorage.setItem(cacheKey, JSON.stringify(response.value));
      })
      .catch(() => undefined)
      .finally(() => {
        const current = settingsCache.get(cacheKey);
        if (current?.promise === request) settingsCache.set(cacheKey, { value: current.value });
        if (!cancelled) setLoading(false);
      });
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.cacheKey !== cacheKey) return;
      dataRef.current = detail.value;
      setData(detail.value);
    };
    window.addEventListener(EVENT_NAME, listener);
    return () => { cancelled = true; window.removeEventListener(EVENT_NAME, listener); };
  }, [cacheKey]);

  const updateData = async (next: T | ((current: T) => T)) => {
    const value = next instanceof Function ? next(dataRef.current) : next;
    dataRef.current = value;
    setData(value);
    settingsCache.set(cacheKey, { value });
    window.localStorage.setItem(cacheKey, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { cacheKey, value } }));
    await apiClient.updateUserSettings(value).catch(() => undefined);
  };

  return [data, updateData, loading] as const;
}
