"use client";
import { useState } from "react";
import { osFetch, pacificTime } from "./client";
import { Badge, Button, Card } from "./ui";

const SECTIONS = [
  ["who_they_are", "Who they are"],
  ["likely_needs", "What they likely need"],
  ["talking_points", "Talking points"],
  ["discovery_questions", "Questions for the sales call"],
  ["interview_questions", "On-camera interview questions"],
  ["shot_ideas", "Shot ideas"],
  ["watch_outs", "Watch-outs"],
];

function CopyButton({ lines }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(lines.map((line, i) => `${i + 1}. ${line}`).join("\n"));
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
      className="os-mono rounded-md border border-cyan-300/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/10"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// The research brief for one prospect or client, with a button to write or refresh it.
export default function ResearchBrief({ id, dossier, onBuilt }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function build() {
    setBusy(true);
    setError("");
    try {
      await osFetch(`pipeline/${encodeURIComponent(id)}/dossier`, { method: "POST" });
      await onBuilt();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Research brief"
      className="mt-4"
      action={(
        <div className="flex items-center gap-2">
          {dossier?.updatedAt && <Badge tone="violet">{pacificTime(dossier.updatedAt)}</Badge>}
          <Button tone={dossier ? "ghost" : "primary"} className="!min-h-[32px] !px-3 !text-[10px]" disabled={busy} onClick={build}>
            {busy ? "Researching…" : dossier ? "Refresh" : "Build brief"}
          </Button>
        </div>
      )}
    >
      {busy && <p className="os-mono os-caret text-sm text-cyan-200/80">Reading their site and everything we know about them</p>}
      {!busy && !dossier && (
        <p className="text-sm text-slate-400">
          A one-page brief: who they are, what they likely need, talking points, questions for the sales call, and on-camera interview questions for the shoot.
          It writes itself for anyone who replies or books; tap Build brief for one now (a few cents).
        </p>
      )}
      {!busy && dossier && (
        <div className="space-y-4">
          <p className="text-[15px] leading-relaxed text-slate-100">{dossier.summary}</p>
          {dossier.next_step && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-50">Next: {dossier.next_step}</p>
          )}
          {dossier.needsReview && <p className="text-xs text-amber-300">Written by the local model; check it before you rely on it.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SECTIONS.filter(([key]) => dossier[key]?.length).map(([key, label]) => (
              <section
                key={key}
                className={`rounded-xl border p-3 ${key === "interview_questions" || key === "discovery_questions" ? "border-violet-300/25 bg-violet-400/5 md:col-span-2" : "border-cyan-300/10 bg-slate-950/40"}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="os-hud text-[11px] font-semibold uppercase text-cyan-300/90">{label}</h3>
                  {(key === "interview_questions" || key === "discovery_questions") && <CopyButton lines={dossier[key]} />}
                </div>
                {key === "interview_questions" || key === "discovery_questions" ? (
                  <ol className="ml-5 list-decimal space-y-1 text-sm text-slate-100">{dossier[key].map((item, i) => <li key={i}>{item}</li>)}</ol>
                ) : (
                  <ul className="ml-4 list-disc space-y-1 text-sm text-slate-200">{dossier[key].map((item, i) => <li key={i}>{item}</li>)}</ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </Card>
  );
}
