const viteEnv = (import.meta as any).env || {};

export const PRODUCT_VERSION = viteEnv.VITE_APP_VERSION || "0.5.0";
export const PRODUCT_VERSION_DATE = viteEnv.VITE_BUILD_DATE || "2026-08-18";
export const PRODUCT_BUILD_SHA = viteEnv.VITE_BUILD_SHA || "development";
export const PRODUCT_BUILD_TIME = viteEnv.VITE_BUILD_TIME || "未记录";

export const PRODUCT_RELEASE_SUMMARY = "版本更新、施工阶段门槛与供应链协同优化版本";
