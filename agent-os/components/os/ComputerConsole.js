"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { dollars, hourLabel, timeAgo } from "./client";

function greeting(hour) {
  if (hour < 5) return "Working the night shift";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// What the computer says, built from the Today data. Plain sentences, the way it would talk.
export function consoleLines(data) {
  const name = data.ownerName ? `, ${data.ownerName}` : "";
  const lines = [`${greeting(data.pacificHour)}${name}.`];
  if (data.paused) lines.push("All outgoing work is paused. Say the word and I'll resume.");
  else if (data.worker.alive) lines.push(`All systems online. Worker heartbeat ${timeAgo(data.worker.heartbeatAt)}.`);
  else lines.push(`I can't hear the worker. Last heartbeat ${timeAgo(data.worker.heartbeatAt)}. Check the OTG-OS Worker task.`);
  lines.push(...data.summary.filter((line) => !/paused|approval/.test(line)));
  if (data.waiting) {
    const bundle = data.nextBundleHour != null ? ` They also go to Telegram at ${hourLabel(data.nextBundleHour)}.` : "";
    lines.push(`${data.waiting} draft${data.waiting === 1 ? " needs" : "s need"} your decision.${bundle}`);
  }
  lines.push(`Shoot days booked this month: ${data.goal.booked} of ${data.goal.target}. Spend ${dollars(data.spend.spentMicros)} of ${dollars(data.spend.capMicros)}.`);
  return lines;
}

function Core({ tone }) {
  const color = { ok: "text-cyan-300", paused: "text-amber-300", down: "text-rose-400" }[tone];
  return (
    <div className={`os-core ${color}`} aria-hidden="true">
      <span className="os-core-ring r1" />
      <span className="os-core-ring r2" />
      <span className="os-core-ring r3" />
      <span className="os-core-wave" />
      <span className="os-core-heart" />
    </div>
  );
}

// Types the report out once per visit; later refreshes update it in place.
export default function ComputerConsole({ data, children }) {
  const lines = useMemo(() => consoleLines(data), [data]);
  const script = lines.join("\n");
  const [shown, setShown] = useState(0);
  const typedOnce = useRef(false);

  useEffect(() => {
    if (typedOnce.current) {
      setShown(script.length);
      return undefined;
    }
    setShown(0);
    let count = 0;
    const timer = setInterval(() => {
      count += 2;
      setShown(count);
      if (count >= script.length) {
        typedOnce.current = true;
        clearInterval(timer);
      }
    }, 18);
    return () => clearInterval(timer);
  }, [script]);

  const typed = script.slice(0, shown).split("\n");
  const done = shown >= script.length;
  const tone = data.paused ? "paused" : data.worker.alive ? "ok" : "down";

  return (
    <section className="os-panel overflow-hidden rounded-2xl p-4 sm:p-5" aria-label="OTG-OS report">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-col items-center gap-2">
          <Core tone={tone} />
          <span className={`os-mono text-[10px] uppercase tracking-[0.3em] ${tone === "ok" ? "text-cyan-300/80" : tone === "paused" ? "text-amber-300" : "text-rose-300"}`}>
            {tone === "ok" ? "Online" : tone === "paused" ? "Paused" : "No signal"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="os-mono mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" aria-hidden="true" />
            OTG-OS // status report
          </div>
          <div className="os-mono space-y-1.5 text-[13px] leading-relaxed text-cyan-50 sm:text-sm" aria-live="polite">
            {typed.map((line, i) => (
              <p key={i} className={i === typed.length - 1 && !done ? "os-caret" : ""}>
                <span className="mr-2 text-cyan-500/70" aria-hidden="true">&gt;</span>{line}
              </p>
            ))}
            {done && <p className="os-caret text-cyan-500/70" aria-hidden="true">&gt;</p>}
          </div>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}
