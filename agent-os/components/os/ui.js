"use client";
import { words } from "./client";

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`os-panel rounded-2xl p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="os-hud flex items-center gap-2 text-[11px] font-semibold uppercase text-cyan-300/90">
              <span className="h-1.5 w-1.5 rounded-sm bg-cyan-300 shadow-[0_0_8px_rgb(34,211,238)]" aria-hidden="true" />
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  neutral: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_10px_-2px_rgb(52,211,153)]",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300 shadow-[0_0_10px_-2px_rgb(251,191,36)]",
  bad: "border-rose-400/30 bg-rose-400/10 text-rose-300 shadow-[0_0_10px_-2px_rgb(251,113,133)]",
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_10px_-2px_rgb(34,211,238)]",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-200 shadow-[0_0_10px_-2px_rgb(167,139,250)]",
};

export function Badge({ tone = "neutral", children }) {
  return <span className={`os-mono inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${TONES[tone]}`}>{children}</span>;
}

export function stageTone(stage) {
  if (stage === "booked") return "good";
  if (String(stage).startsWith("closed_")) return "neutral";
  if (["replied", "portfolio_sent", "quoted", "held"].includes(stage)) return "warn";
  if (["pitched", "following_up"].includes(stage)) return "violet";
  return "info";
}

export function StageBadge({ stage }) {
  return <Badge tone={stageTone(stage)}>{words(stage)}</Badge>;
}

export function Button({ tone = "neutral", className = "", ...props }) {
  const styles = {
    primary: "border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_18px_-4px_rgb(34,211,238)] hover:bg-cyan-400/30",
    good: "border-emerald-300/60 bg-emerald-400/20 text-emerald-50 shadow-[0_0_18px_-4px_rgb(52,211,153)] hover:bg-emerald-400/30",
    bad: "border-rose-300/50 bg-rose-500/20 text-rose-50 shadow-[0_0_18px_-6px_rgb(251,113,133)] hover:bg-rose-500/30",
    neutral: "border-slate-300/20 bg-white/5 text-slate-100 hover:border-cyan-300/40 hover:bg-cyan-400/10",
    ghost: "border-transparent text-slate-300 hover:bg-white/5 hover:text-cyan-100",
  };
  return (
    <button
      type="button"
      className={`os-hud inline-flex min-h-[42px] items-center justify-center rounded-xl border px-4 text-[12px] font-semibold uppercase transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${styles[tone]} ${className}`}
      {...props}
    />
  );
}

export function Meter({ value, max, warnAt = null }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = warnAt != null && value >= max
    ? "from-rose-500 to-pink-400"
    : warnAt != null && value >= warnAt ? "from-amber-400 to-orange-300" : "from-cyan-400 via-sky-400 to-violet-400";
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-cyan-300/15 bg-slate-950/70" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`os-meter-fill h-full min-w-[6px] rounded-full bg-gradient-to-r ${fill} shadow-[0_0_12px_rgb(34,211,238)]`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
      {warnAt != null && max > 0 && <div className="absolute top-0 h-full w-px bg-amber-300/70" style={{ left: `${(warnAt / max) * 100}%` }} />}
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-cyan-300/10 bg-slate-950/40 px-3 py-2.5">
      <div className="os-hud os-glow-text text-xl font-bold tabular-nums text-cyan-50">{value}</div>
      <div className="os-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }) {
  const styles = {
    info: "border-cyan-400/30 bg-cyan-500/10 text-cyan-50",
    good: "border-emerald-400/30 bg-emerald-500/10 text-emerald-50",
    warn: "border-amber-400/40 bg-amber-500/10 text-amber-50 shadow-[0_0_24px_-10px_rgb(251,191,36)]",
    bad: "border-rose-400/40 bg-rose-500/10 text-rose-50 shadow-[0_0_24px_-10px_rgb(251,113,133)]",
  };
  return <div className={`rounded-xl border px-3 py-2 text-sm backdrop-blur ${styles[tone]}`}>{children}</div>;
}

export function Loading({ error, reload }) {
  if (error) {
    return (
      <Notice tone="bad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{error.status === 401 ? "This device needs the access key to reach OTG-OS." : error.message}</span>
          {reload && <Button tone="ghost" onClick={reload}>Retry</Button>}
        </div>
      </Notice>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-14">
      <div className="os-core -my-6 scale-50 text-cyan-300" aria-hidden="true">
        <span className="os-core-ring r1" /><span className="os-core-ring r2" /><span className="os-core-ring r3" /><span className="os-core-heart" />
      </div>
      <div className="os-mono os-caret text-xs uppercase tracking-[0.3em] text-cyan-300/80">Establishing link</div>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="os-mono text-[10px] uppercase tracking-[0.35em] text-cyan-400/70">OTG-OS // {title}</div>
        <h1 className="os-hud os-title mt-1 text-2xl font-bold uppercase sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
