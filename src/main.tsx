import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MobilePreviewFrame } from './components/MobilePreviewFrame.tsx';
import './index.css';
import { startRealtimeSync } from './lib/syncEngine';
import { AuthProvider } from './lib/auth.tsx';

const viteEnv = (import.meta as any).env || {};

startRealtimeSync();

if (!viteEnv.DEV && "serviceWorker" in navigator) {
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
