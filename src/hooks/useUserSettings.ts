import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/src/lib/apiClient";
import { useAuth } from "@/src/lib/auth";

const EVENT_NAME = "zhijian-user-settings-changed";

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
    apiClient.getUserSettings<T>()
      .then((response) => {
        if (cancelled) return;
        dataRef.current = response.value;
        setData(response.value);
        window.localStorage.setItem(cacheKey, JSON.stringify(response.value));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
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
    window.localStorage.setItem(cacheKey, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { cacheKey, value } }));
    await apiClient.updateUserSettings(value).catch(() => undefined);
  };

  return [data, updateData, loading] as const;
}
