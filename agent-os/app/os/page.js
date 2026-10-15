"use client";
import Link from "next/link";
import { useState } from "react";
import { dollars, hourLabel, osFetch, pacificTime, timeAgo, useOsData, words } from "../../components/os/client";
import ComputerConsole from "../../components/os/ComputerConsole";
import { Badge, Button, Card, Loading, Meter, Notice, PageTitle, Stat, StageBadge } from "../../components/os/ui";

function StatusBar({ data, reload }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      const result = await osFetch("control", { method: "POST", body: { op: data.paused ? "resume" : "pause" } });
      setMessage(result.message);
      await reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  const pausedLanes = Object.keys(data.pausedLanes ?? {});
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {data.paused ? <Badge tone="bad">Paused</Badge> : <Badge tone="good">Running</Badge>}
          <Badge tone={data.mode === "send" ? "warn" : "info"}>{data.mode === "send" ? "Send mode: approved emails send" : "Draft mode: approvals make Gmail drafts"}</Badge>
          {pausedLanes.map((lane) => <Badge key={lane} tone="warn">{words(lane)} outreach paused</Badge>)}
        </div>
        <Button tone={data.paused ? "good" : "bad"} onClick={toggle} disabled={busy}>
          {data.paused ? "Resume" : "Pause everything"}
        </Button>
      </div>
      {message && <p className="mt-2 text-sm text-slate-400">{message}</p>}
    </Card>
  );
}

function GoalCard({ goal }) {
  return (
    <Card title="Goal this month">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-50">{goal.booked}</span>
        <span className="text-slate-400">of {goal.target} paid shoot days</span>
      </div>
      <div className="mt-3"><Meter value={goal.booked} max={goal.target} /></div>
      <p className="mt-2 text-xs text-slate-500">Counts prospects moved to booked this month (UTC). Quotes and deposits arrive with Plan 3.</p>
    </Card>
  );
}

function SpendCard({ spend }) {
  const tone = spend.state === "capped" ? "bad" : spend.state === "warning" ? "warn" : "good";
  return (
    <Card title="AI and data spend" action={<Badge tone={tone}>{spend.state}</Badge>}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-50">{dollars(spend.spentMicros)}</span>
        <span className="text-slate-400">of {dollars(spend.capMicros)} cap</span>
      </div>
      <div className="mt-3"><Meter value={spend.spentMicros} max={spend.capMicros} warnAt={spend.warningMicros} /></div>
      <p className="mt-1 text-xs text-slate-500">Warning at {dollars(spend.warningMicros)} · UTC month</p>
      {spend.byModel.length > 0 && (
        <ul className="mt-3 divide-y divide-white/5 text-sm">
          {spend.byModel.map((row) => (
            <li key={`${row.provider}-${row.model}`} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-slate-300">{row.model} <span className="text-slate-500">· {row.calls} call{row.calls === 1 ? "" : "s"}</span></span>
              <span className="tabular-nums text-slate-200">{dollars(row.micros)}</span>
            </li>
          ))}
        </ul>
      )}
      {spend.toolCaps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {spend.toolCaps.map((cap) => <Badge key={cap.tool}>{cap.tool}: {cap.used}/{cap.cap} today</Badge>)}
        </div>
      )}
    </Card>
  );
}

function WorkerCard({ worker }) {
  const line = worker.line;
  return (
    <Card title="Worker" action={worker.alive ? <Badge tone="good">Alive</Badge> : <Badge tone="bad">No heartbeat</Badge>}>
      <p className="text-sm text-slate-300">Last heartbeat {timeAgo(worker.heartbeatAt)}{worker.heartbeatAt ? ` (${pacificTime(worker.heartbeatAt)})` : ""}.</p>
      {line ? (
        <div className="mt-3 rounded-xl bg-black/40 p-3">
          <div className="text-[11px] text-slate-500">{line.at ? `${pacificTime(line.at)} · ${timeAgo(line.at)}` : line.file}</div>
          <p className="os-mono mt-1 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">{line.message}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No worker log for today yet.</p>
      )}
      {!worker.alive && <p className="mt-2 text-xs text-slate-500">Check the &quot;OTG-OS Worker&quot; scheduled task on the PC.</p>}
    </Card>
  );
}

export default function TodayPage() {
  const { data, error, loading, reload } = useOsData("today", { interval: 30_000 });
  if (!data) return <><PageTitle title="Today" /><Loading error={loading ? null : error} reload={reload} /></>;
  const { day } = data;
  return (
    <>
      <PageTitle title="Today" subtitle={new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric" }).format(new Date(data.now))} />
      <div className="os-stagger space-y-4">
        <ComputerConsole data={data} />
        <StatusBar data={data} reload={reload} />

        {data.waiting > 0 && (
          <Link href="/os/approvals" className="block">
            <Notice tone="warn">
              <div className="flex items-center justify-between gap-3">
                <span><strong>{data.waiting}</strong> waiting for approval{data.nextBundleHour != null ? ` · next Telegram bundle ${hourLabel(data.nextBundleHour)}` : ""}</span>
                <span aria-hidden="true">→</span>
              </div>
            </Notice>
          </Link>
        )}
        {data.failed > 0 && <Notice tone="bad">{data.failed} action{data.failed === 1 ? "" : "s"} failed. Open Pipeline to see which.</Notice>}

        <Card title="The day so far">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="New prospects" value={day.found} />
            <Stat label="Researched" value={day.researched} />
            <Stat label="Pitches drafted" value={day.pitchesDrafted} />
            <Stat label="Follow-ups drafted" value={day.followUpsDrafted} />
            <Stat label="Gmail drafts" value={day.gmailDrafts} />
            <Stat label="Emails sent" value={day.emailsSent} />
            <Stat label="Replies" value={day.replies} />
            <Stat label="Closed" value={day.closed} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <GoalCard goal={data.goal} />
          <SpendCard spend={data.spend} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <WorkerCard worker={data.worker} />
          <Card title="Latest pipeline moves" action={<Link href="/os/pipeline" className="text-xs text-cyan-300">All →</Link>}>
            {data.recent.length ? (
              <ul className="divide-y divide-white/5">
                {data.recent.map((event) => (
                  <li key={`${event.id}-${event.at}-${event.toStage}`}>
                    <Link href={`/os/pipeline/${event.id}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-100">{event.business}</span>
                        <span className="block truncate text-xs text-slate-500">{event.reason || words(event.lane)} · {timeAgo(event.at)}</span>
                      </span>
                      <StageBadge stage={event.toStage} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No prospects yet.</p>}
          </Card>
        </div>
        {error && <p className="text-xs text-rose-300">Refresh failed: {error.message}</p>}
      </div>
    </>
  );
}
