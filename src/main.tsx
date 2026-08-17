import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MobilePreviewFrame } from './components/MobilePreviewFrame.tsx';
import './index.css';
import { startRealtimeSync } from './lib/syncEngine';
import { offlineDb } from './lib/offlineDb';
import { AuthProvider } from './lib/auth.tsx';

const viteEnv = (import.meta as any).env || {};

const EMPTY_WORKSPACE_VERSION = "2026-08-16-empty-business-data-v3";
// Do not delete cached business data or pending writes during startup. The previous
// migration cleared local work unconditionally; new versions only record the schema
// marker and let the normal sync/data migration path preserve user work.
void offlineDb.setMeta("workspace-data-version", EMPTY_WORKSPACE_VERSION)
  .catch(() => undefined)
  .finally(() => startRealtimeSync());

if (viteEnv.DEV && "serviceWorker" in navigator) {
  // A production PWA service worker can remain registered on localhost and
  // mix cached React chunks with the Vite development graph, causing a blank
  // screen and "Invalid hook call" errors. Keep development completely fresh.
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    const reloadKey = "zhijian-dev-cache-cleared";
    if (!window.sessionStorage.getItem(reloadKey)) {
      window.sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    }
  }).catch(() => {
    // The app can still run if the browser blocks service-worker cleanup.
  });
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still runs normally if PWA registration is unavailable.
    });
  });
}

const isMobilePreview = window.location.pathname === '/mobile' || new URLSearchParams(window.location.search).get('preview') === 'mobile';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>{isMobilePreview ? <MobilePreviewFrame /> : <App />}</AuthProvider>
  </StrictMode>,
);
