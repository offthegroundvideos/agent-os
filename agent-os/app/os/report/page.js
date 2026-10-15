"use client";
import Link from "next/link";
import { dollars, pacificTime, useOsData, words } from "../../../components/os/client";
import { Badge, Card, Loading, Meter, PageTitle, StageBadge } from "../../../components/os/ui";

const ROWS = [
  ["found", "New prospects"],
  ["researched", "Researched"],
  ["pitchesDrafted", "Pitches drafted"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["pitched", "Pitched"],
  ["gmailDrafts", "Gmail drafts"],
  ["emailsSent", "Emails sent"],
  ["replied", "Replies"],
  ["booked", "Booked"],
];

function Delta({ now, before }) {
  const diff = now - before;
  if (!diff) return <span className="os-mono text-[10px] text-slate-500">= last wk</span>;
  return <span className={`os-mono text-[10px] ${diff > 0 ? "text-emerald-300" : "text-rose-300"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}</span>;
}

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);

export default function ReportPage() {
  const { data, error, loading, reload } = useOsData("report", { interval: 120_000 });
  if (!data) return <><PageTitle title="Report" /><Loading error={loading ? null : error} reload={reload} /></>;
  const { week, previous, metrics } = data;
  const maxLane = Math.max(1, ...data.lanes.map((lane) => lane.pitched + lane.found));

  return (
    <>
      <PageTitle title="Report" subtitle={`Last 7 days: ${pacificTime(data.from)} to ${pacificTime(data.to)}. Sent to Telegram every Sunday at 6pm.`} />
      <div className="os-stagger space-y-4">
        <Card title="The week in one breath">
          <div className="os-mono space-y-1.5 text-[13px] leading-relaxed text-cyan-50 sm:text-sm">
            {data.highlights.map((line) => <p key={line}><span className="mr-2 text-cyan-500/70" aria-hidden="true">&gt;</span>{line}</p>)}
          </div>
          {data.nextSteps.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/5 p-3">
              <div className="os-hud mb-1 text-[11px] font-semibold uppercase text-amber-200">Next moves</div>
              <ul className="space-y-1 text-sm text-amber-50/90">{data.nextSteps.map((line) => <li key={line}>• {line}</li>)}</ul>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Spend this week">
            <div className="os-hud os-glow-text text-3xl font-bold text-cyan-50">{dollars(week.spendMicros)}</div>
            <div className="mt-1 text-xs text-slate-400">Last week {dollars(previous.spendMicros)}</div>
          </Card>
          <Card title="Cost per pitch">
            <div className="os-hud os-glow-text text-3xl font-bold text-cyan-50">{metrics.costPerPitchMicros == null ? "—" : dollars(metrics.costPerPitchMicros)}</div>
            <div className="mt-1 text-xs text-slate-400">AI and data spend ÷ pitches drafted</div>
          </Card>
          <Card title="Reply and approval rate">
            <div className="flex items-baseline gap-4">
              <div><div className="os-hud os-glow-text text-3xl font-bold text-cyan-50">{percent(metrics.replyRate)}</div><div className="text-xs text-slate-400">replies per pitch</div></div>
              <div><div className="os-hud text-xl font-bold text-violet-200">{percent(metrics.approvalRate)}</div><div className="text-xs text-slate-400">drafts approved</div></div>
            </div>
          </Card>
        </div>

        <Card title="This week vs last">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ROWS.map(([key, label]) => (
              <div key={key} className="rounded-xl border border-cyan-300/10 bg-slate-950/40 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="os-hud os-glow-text text-xl font-bold tabular-nums text-cyan-50">{week[key]}</span>
                  <Delta now={week[key]} before={previous[key]} />
                </div>
                <div className="os-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Lanes">
            <ul className="space-y-3">
              {data.lanes.map((lane) => (
                <li key={lane.lane}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-100">{words(lane.label)}</span>
                    <span className="os-mono text-[11px] text-slate-400">{lane.found} found · {lane.pitched} pitched · {lane.replied} replied · {lane.open} open</span>
                  </div>
                  <div className="mt-1"><Meter value={lane.pitched + lane.found} max={maxLane} /></div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Where the money went">
            {data.spendByModel.length ? (
              <ul className="divide-y divide-white/5 text-sm">
                {data.spendByModel.map((row) => (
                  <li key={row.model} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-slate-300">{row.model} <span className="text-slate-500">· {row.calls} calls</span></span>
                    <span className="tabular-nums text-slate-100">{dollars(row.micros)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No spend this week.</p>}
            {data.closed.length > 0 && (
              <>
                <div className="os-hud mt-4 mb-2 text-[11px] font-semibold uppercase text-cyan-300/90">Closed this week</div>
                <div className="flex flex-wrap gap-2">{data.closed.map((row) => <Badge key={row.stage}>{words(row.stage.replace("closed_", ""))}: {row.count}</Badge>)}</div>
              </>
            )}
          </Card>
        </div>

        {data.hot.length > 0 && (
          <Card title="Hot leads right now">
            <ul className="divide-y divide-white/5">
              {data.hot.map((opp) => (
                <li key={opp.id}>
                  <Link href={`/os/pipeline/${opp.id}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-slate-100">{opp.business} <span className="text-xs text-slate-500">· {words(opp.lane)}</span></span>
                    <StageBadge stage={opp.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-xs text-slate-500">Goal: {data.goal} paid shoot days a month. Quotes and deposits join this report with Plan 3.</p>
      </div>
    </>
  );
}
