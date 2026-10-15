"use client";
import { useState } from "react";
import { osFetch, pacificTime, useOsData } from "./client";
import { Badge, Button, Card } from "./ui";

// Today's brief from the worker (7am Pacific), with a button to write a fresh one now.
export default function MorningBrief() {
  const { data, reload } = useOsData("brief", { interval: 300_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const brief = data?.brief;

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await osFetch("brief", { method: "POST" });
      await reload();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  const lines = String(brief?.text ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <Card
      title="Morning brief"
      action={(
        <div className="flex items-center gap-2">
          {brief?.at && <Badge tone="violet">{pacificTime(brief.at)}</Badge>}
          <Button tone="ghost" className="!min-h-[32px] !px-2 !text-[10px]" disabled={busy} onClick={refresh}>{busy ? "Writing…" : brief ? "Refresh" : "Write it now"}</Button>
        </div>
      )}
    >
      {busy && <p className="os-mono os-caret text-sm text-cyan-200/80">Reading today, the pipeline and the worker log</p>}
      {!busy && lines.length > 0 && (
        <div className="space-y-1.5 text-[15px] leading-relaxed text-slate-100">
          {lines.map((line, i) => (
            <p key={i} className={/^first:/i.test(line) ? "rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 font-medium text-amber-50" : ""}>{line}</p>
          ))}
        </div>
      )}
      {!busy && !lines.length && <p className="text-sm text-slate-400">The brief arrives at 7am Pacific, here and in Telegram. Tap “Write it now” for one right away.</p>}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </Card>
  );
}
