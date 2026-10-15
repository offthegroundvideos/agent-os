"use client";
import Link from "next/link";
import { useState } from "react";
import { dollars, osFetch, useOsData, words } from "../../../components/os/client";
import { Badge, Button, Card, Loading, PageTitle, Stat } from "../../../components/os/ui";

const STATUS_TONE = { booked: "info", held: "good", no_show: "bad", cancelled: "neutral" };

function CallCard({ call, onSaved }) {
  const [notes, setNotes] = useState(call.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const past = Date.parse(call.startsAt) < Date.now();

  async function outcome(status) {
    if (status === "cancelled" && !window.confirm("Cancel this call? The guest gets a cancellation from Google Calendar.")) return;
    setBusy(true);
    setError("");
    try {
      await osFetch("calls", { method: "POST", body: { id: call.id, status, notes } });
      await onSaved();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/os/pipeline/${call.opportunityId}`} className="text-base font-semibold text-slate-50 hover:underline">{call.business}</Link>
          <div className="os-mono text-[12px] text-cyan-200">{call.label}</div>
          <div className="text-xs text-slate-400">{call.guestName} · {call.guestEmail} · {words(call.lane)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[call.status]}>{words(call.status)}</Badge>
          <Badge tone="violet">closer: {call.closer}</Badge>
        </div>
      </div>
      {call.guestNote && <p className="mt-2 rounded-lg bg-black/30 px-3 py-2 text-sm text-slate-200">“{call.guestNote}”</p>}
      {!call.onCalendar && call.status === "booked" && <p className="mt-2 text-xs text-amber-300">Not on Google Calendar: add it by hand.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/os/pipeline/${call.opportunityId}`} className="os-hud rounded-lg border border-violet-300/40 bg-violet-400/10 px-3 py-2 text-[11px] font-semibold uppercase text-violet-100">
          {call.hasBrief ? "Open brief & questions" : "Build the brief"}
        </Link>
        <Link href={`/os?ask=${encodeURIComponent(`Prep me for my discovery call with ${call.business}: what to ask and what to offer.`)}`} className="os-hud rounded-lg border border-cyan-300/30 px-3 py-2 text-[11px] font-semibold uppercase text-cyan-100">
          Prep me
        </Link>
      </div>
      <label className="mt-3 block text-xs text-slate-400">
        Call notes
        <textarea rows={2} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[15px] text-slate-100 outline-none focus:border-cyan-300" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </label>
      {call.status === "booked" && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button tone="good" disabled={busy || !past} title={past ? "" : "After the call"} onClick={() => outcome("held")}>Held</Button>
          <Button tone="bad" disabled={busy || !past} onClick={() => outcome("no_show")}>No-show</Button>
          <Button disabled={busy} onClick={() => outcome("cancelled")}>Cancel</Button>
        </div>
      )}
      {call.status !== "booked" && notes !== call.notes && <Button className="mt-2" disabled={busy} onClick={() => outcome(call.status)}>Save notes</Button>}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </Card>
  );
}

export default function CallsPage() {
  const { data, error, loading, reload } = useOsData("calls", { interval: 60_000 });
  if (!data) return <><PageTitle title="Calls" /><Loading error={loading ? null : error} reload={reload} /></>;
  const now = Date.now();
  const upcoming = data.calls.filter((call) => call.status === "booked" && Date.parse(call.endsAt) >= now).reverse();
  const toLog = data.calls.filter((call) => call.status === "booked" && Date.parse(call.endsAt) < now);
  const done = data.calls.filter((call) => call.status !== "booked").slice(0, 20);
  const s = data.summary;
  return (
    <>
      <PageTitle title="Calls" subtitle={`OTG-OS books the discovery calls; ${data.closers.join(" and ")} ${data.closers.length === 1 ? "closes" : "close"}.`} />
      <div className="os-stagger space-y-4">
        <Card title="Last 30 days">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Calls booked" value={s.callsBooked} />
            <Stat label="Calls held" value={s.callsHeld} hint={s.noShows ? `${s.noShows} no-show${s.noShows === 1 ? "" : "s"}` : ""} />
            <Stat label="Proposals out" value={s.proposalsOut} hint={s.proposedMonthlyCents ? `${dollars(s.proposedMonthlyCents * 10_000)}/mo` : ""} />
            <Stat label="Retainers won" value={s.wonDeals} hint={s.wonMonthlyCents ? `${dollars(s.wonMonthlyCents * 10_000)}/mo` : ""} />
          </div>
          {!data.publicBase && <p className="mt-3 text-xs text-amber-200">Prospects can't book yet: turn on the public pages and set the public address in Settings.</p>}
        </Card>
        {toLog.length > 0 && <h2 className="os-hud text-[11px] font-semibold uppercase text-amber-300">How did these go?</h2>}
        {toLog.map((call) => <CallCard key={call.id} call={call} onSaved={reload} />)}
        <h2 className="os-hud text-[11px] font-semibold uppercase text-cyan-300/90">Upcoming</h2>
        {upcoming.length ? upcoming.map((call) => <CallCard key={call.id} call={call} onSaved={reload} />)
          : <Card><p className="py-4 text-center text-sm text-slate-400">No calls booked yet. Each pitch links to a page where they can book one.</p></Card>}
        {done.length > 0 && (
          <Card title="Past calls">
            <ul className="divide-y divide-white/5">
              {done.map((call) => (
                <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/os/pipeline/${call.opportunityId}`} className="text-slate-100 hover:underline">{call.business}</Link>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{call.label}</span><Badge tone={STATUS_TONE[call.status]}>{words(call.status)}</Badge></span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
