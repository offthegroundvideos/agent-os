"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LIVE_STATE_EVENT, NEED_KEY_EVENT, liveState, readKey, saveKey, startLive } from "./client";
import Alerts, { SoundToggle } from "./Alerts";
import Starfield from "./Starfield";
import { Button } from "./ui";

const NAV = [
  { href: "/os", label: "Today", icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2" },
  { href: "/os/approvals", label: "Approvals", icon: "M5 13l4 4L19 7" },
  { href: "/os/pipeline", label: "Pipeline", icon: "M4 6h16M4 12h10M4 18h6" },
  { href: "/os/calls", label: "Calls", icon: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" },
  { href: "/os/report", label: "Report", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/os/portfolio", label: "Portfolio", desktopOnly: true, icon: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4" },
  { href: "/os/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7" },
];

function isActive(pathname, href) {
  return href === "/os" ? pathname === "/os" : pathname.startsWith(href);
}

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function LiveBadge() {
  const [state, setState] = useState("connecting");
  useEffect(() => {
    setState(liveState());
    const onState = (event) => setState(event.detail);
    window.addEventListener(LIVE_STATE_EVENT, onState);
    return () => window.removeEventListener(LIVE_STATE_EVENT, onState);
  }, []);
  const isLive = state === "live";
  return (
    <span
      className={`os-mono inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${isLive ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}
      title={isLive ? "Live: pages update the moment something changes" : "Reconnecting: pages refresh every 30 seconds meanwhile"}
    >
      <span className={`os-pulse-dot h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-400 text-emerald-400" : "bg-amber-400 text-amber-400"}`} aria-hidden="true" />
      {isLive ? "Live" : "Sync"}
    </span>
  );
}

function PacificClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!now) return <span className="os-mono w-[72px]" />;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  return <span className="os-mono text-xs tabular-nums text-cyan-200/80" title="Pacific time">{time} PT</span>;
}

function KeyDialog({ onClose }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="otg-key-title">
      <form
        className="os-panel w-full max-w-sm rounded-2xl bg-slate-950/90 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          saveKey(value.trim());
          onClose();
        }}
      >
        <h2 id="otg-key-title" className="os-hud os-title text-lg font-bold uppercase">Access key</h2>
        <p className="mt-2 text-sm text-slate-400">
          Away from the OTG-OS PC, enter the <code className="text-cyan-200">AGENT_OS_API_SECRET</code> from <code className="text-cyan-200">.env.local</code>.
          It stays on this device and also unlocks Settings.
        </p>
        <input
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="os-mono mt-4 w-full rounded-xl border border-cyan-300/20 bg-black/60 px-3 py-2.5 text-base text-cyan-50 outline-none focus:border-cyan-300 focus:shadow-[0_0_16px_-4px_rgb(34,211,238)]"
          placeholder="••••••••"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {readKey() && <Button tone="ghost" onClick={() => { saveKey(""); onClose(); }}>Forget</Button>}
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit" disabled={!value.trim()}>Connect</Button>
        </div>
      </form>
    </div>
  );
}

export default function OsShell({ children }) {
  const pathname = usePathname() || "/os";
  const [askKey, setAskKey] = useState(false);

  useEffect(() => {
    startLive();
    const open = () => setAskKey(true);
    window.addEventListener(NEED_KEY_EVENT, open);
    window.addEventListener("otg-os-open-key", open);
    return () => {
      window.removeEventListener(NEED_KEY_EVENT, open);
      window.removeEventListener("otg-os-open-key", open);
    };
  }, []);

  return (
    <div className="os-root relative min-h-screen overflow-x-clip antialiased">
      <div className="os-space" aria-hidden="true"><div className="os-nebula" /><div className="os-grid" /></div>
      <Starfield />
      <div className="os-scanlines" aria-hidden="true" />
      <div className="os-scanbeam" aria-hidden="true" />

      <header className="sticky top-0 z-30 border-b border-cyan-300/10 bg-slate-950/50 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/os" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <span className="os-pulse-dot h-2 w-2 rounded-full bg-cyan-300 text-cyan-300 shadow-[0_0_10px_rgb(34,211,238)]" aria-hidden="true" />
            <span className="os-hud os-glow-text text-lg font-black text-cyan-50">OTG-OS</span>
            <span className="os-mono hidden text-[10px] uppercase tracking-[0.3em] text-slate-500 xl:inline">Off the Ground</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="OTG-OS">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`os-hud rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase transition ${isActive(pathname, item.href)
                  ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100 shadow-[0_0_14px_-4px_rgb(34,211,238)]"
                  : "border-transparent text-slate-400 hover:text-cyan-100"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm">
            <span className="mr-1"><LiveBadge /></span>
            <span className="mr-1 hidden sm:inline"><PacificClock /></span>
            <SoundToggle />
            <Link href="/agents" className="os-mono rounded-lg px-2 py-1.5 text-[11px] uppercase text-slate-400 hover:text-cyan-100">Agents</Link>
            <Link href="/studio" className="os-mono hidden rounded-lg px-2 py-1.5 text-[11px] uppercase text-slate-400 hover:text-cyan-100 sm:inline">Studio</Link>
            <button type="button" onClick={() => setAskKey(true)} className="rounded-lg px-2 py-1.5 text-slate-400 hover:text-cyan-100" aria-label="Access key">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M15 8l2 2" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main key={pathname} className="relative z-10 mx-auto max-w-5xl px-4 pb-28 pt-6 lg:pb-14">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-cyan-300/15 bg-slate-950/80 backdrop-blur-md lg:hidden" aria-label="OTG-OS">
        <div className="mx-auto grid max-w-lg grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {NAV.filter((item) => !item.desktopOnly).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[9px] font-semibold uppercase tracking-wide transition ${active ? "text-cyan-200" : "text-slate-500"}`}
              >
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgb(34,211,238)]" aria-hidden="true" />}
                <span className={active ? "drop-shadow-[0_0_6px_rgb(34,211,238)]" : ""}><Icon d={item.icon} /></span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Alerts />
      {askKey && <KeyDialog onClose={() => setAskKey(false)} />}
    </div>
  );
}
