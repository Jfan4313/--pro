import { Smartphone } from "lucide-react";

export function MobilePreviewFrame() {
  const requestedScreen = new URLSearchParams(window.location.search).get("screen") || "dashboard";
  const appUrl = `${window.location.origin}/?embedded=mobile&tab=${encodeURIComponent(requestedScreen)}`;

  return (
    <div className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_top,#334155_0%,#0f172a_42%,#020617_100%)] px-4 py-6 text-white">
      <header className="mx-auto mb-5 flex max-w-[446px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"><Smartphone className="h-5 w-5" /></span>
          <div>
            <h1 className="text-sm font-bold">智建协同 Pro · 手机版</h1>
            <p className="mt-0.5 text-xs text-slate-400">iPhone 15 Pro Max · 430 × 932</p>
          </div>
        </div>
        <a href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10">返回桌面版</a>
      </header>

      <div className="mx-auto h-[948px] w-[446px] overflow-hidden rounded-[46px] border-[8px] border-slate-950 bg-white shadow-2xl shadow-black/50">
        <iframe
          src={appUrl}
          title="智建协同 Pro 手机版"
          allow="camera"
          className="h-[932px] w-[430px] border-0 bg-slate-50"
        />
      </div>
      <p className="mx-auto mt-4 max-w-[446px] text-center text-xs text-slate-500">这是独立手机画布；实际手机访问系统首页时会自动使用同一套界面。</p>
    </div>
  );
}
