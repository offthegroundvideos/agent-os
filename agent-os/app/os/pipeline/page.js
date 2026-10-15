"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { timeAgo, useOsData, words } from "../../../components/os/client";
import { Badge, Card, Loading, PageTitle, StageBadge } from "../../../components/os/ui";

const isClosed = (stage) => stage.startsWith("closed_");

export default function PipelinePage() {
  const { data, error, loading, reload } = useOsData("pipeline", { interval: 60_000 });
  const [lane, setLane] = useState("all");
  const [stage, setStage] = useState("open");
  const [query, setQuery] = useState("");

  const view = useMemo(() => {
    if (!data) return null;
    const totals = {};
    for (const [laneKey, stages] of Object.entries(data.counts)) {
      if (lane !== "all" && laneKey !== lane) continue;
      for (const [stageKey, n] of Object.entries(stages)) totals[stageKey] = (totals[stageKey] ?? 0) + n;
    }
    const needle = query.trim().toLowerCase();
    const rows = data.opportunities.filter((opp) => (!needle || [opp.business, opp.location, opp.contactEmail, opp.angle].some((field) => String(field ?? "").toLowerCase().includes(needle)))
      && (needle || lane === "all" || opp.lane === lane)
      && (stage === "all" || (stage === "open" ? !isClosed(opp.stage) : stage === "closed" ? isClosed(opp.stage) : opp.stage === stage)));
    const laneTotals = Object.fromEntries(data.lanes.map((key) => [key, Object.values(data.counts[key] ?? {}).reduce((a, b) => a + b, 0)]));
    return { totals, rows, laneTotals };
  }, [data, lane, stage, query]);

  if (!data) return <><PageTitle title="Pipeline" /><Loading error={loading ? null : error} reload={reload} /></>;

  const openStages = data.stages.filter((key) => !isClosed(key));
  const closedTotal = Object.entries(view.totals).filter(([key]) => isClosed(key)).reduce((sum, [, n]) => sum + n, 0);
  const chip = (active) => `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${active ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`;

  return (
    <>
      <PageTitle title="Pipeline" subtitle={`${data.opportunities.length} prospects across ${data.lanes.length} lanes`} />

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search prospects, places, emails…"
        aria-label="Search prospects"
        className="os-mono mb-3 w-full rounded-xl border border-cyan-300/20 bg-black/40 px-3 py-2.5 text-[15px] text-cyan-50 outline-none placeholder:text-slate-500 focus:border-cyan-300 focus:shadow-[0_0_16px_-4px_rgb(34,211,238)]"
      />
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Lane">
        <button type="button" className={chip(lane === "all")} onClick={() => setLane("all")}>All lanes</button>
        {data.lanes.map((key) => (
          <button type="button" key={key} className={chip(lane === key)} onClick={() => setLane(key)}>
            {words(data.laneLabels[key] ?? key)} <span className="text-slate-500">{view.laneTotals[key]}</span>
            {data.pausedLanes[key] && <span className="ml-1 text-amber-300">⏸</span>}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          {openStages.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => setStage(stage === key ? "open" : key)}
              className={`rounded-xl px-2 py-2 text-left ${stage === key ? "bg-cyan-400/15 ring-1 ring-cyan-400" : "bg-white/[0.04] hover:bg-white/[0.07]"}`}
            >
              <div className="text-lg font-semibold tabular-nums text-slate-50">{view.totals[key] ?? 0}</div>
              <div className="truncate text-[11px] text-slate-400">{words(key)}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStage(stage === "closed" ? "open" : "closed")}
            className={`rounded-xl px-2 py-2 text-left ${stage === "closed" ? "bg-cyan-400/15 ring-1 ring-cyan-400" : "bg-white/[0.04] hover:bg-white/[0.07]"}`}
          >
            <div className="text-lg font-semibold tabular-nums text-slate-50">{closedTotal}</div>
            <div className="truncate text-[11px] text-slate-400">closed</div>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          Showing:
          <button type="button" className={chip(stage === "open")} onClick={() => setStage("open")}>Open</button>
          <button type="button" className={chip(stage === "closed")} onClick={() => setStage("closed")}>Closed</button>
          <button type="button" className={chip(stage === "all")} onClick={() => setStage("all")}>All</button>
          {!["open", "closed", "all"].includes(stage) && <Badge tone="warn">{words(stage)}</Badge>}
        </div>
      </Card>

      {view.rows.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-slate-400">No prospects here.</p></Card>
      ) : (
        <ul className="os-stagger space-y-2">
          {view.rows.map((opp) => (
            <li key={opp.id}>
              <Link href={`/os/pipeline/${opp.id}`} className="os-panel block rounded-2xl p-3 transition hover:border-cyan-300/40 hover:shadow-[0_0_24px_-8px_rgb(34,211,238)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-50">{opp.business}</div>
                    <div className="truncate text-xs text-slate-400">
                      {words(data.laneLabels[opp.lane] ?? opp.lane)}{opp.location ? ` · ${opp.location}` : ""}{opp.contactEmail ? ` · ${opp.contactEmail}` : ""}
                    </div>
                  </div>
                  <StageBadge stage={opp.stage} />
                </div>
                {opp.angle && <p className="mt-2 line-clamp-2 text-sm text-slate-300">{opp.angle}</p>}
                <div className="mt-1 text-[11px] text-slate-500">Updated {timeAgo(opp.updatedAt)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
