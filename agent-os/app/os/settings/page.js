"use client";
import { useState } from "react";
import { dollars, hourLabel, osFetch, useOsData, words } from "../../../components/os/client";
import { Badge, Button, Card, Loading, Notice, PageTitle } from "../../../components/os/ui";

const inputClass = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60";

function useSaver(reload) {
  const [status, setStatus] = useState({});
  async function save(id, body) {
    setStatus((current) => ({ ...current, [id]: { busy: true } }));
    try {
      const result = await osFetch("settings", { method: "POST", body });
      setStatus((current) => ({ ...current, [id]: { ok: result.message || "Saved." } }));
      await reload();
      return true;
    } catch (error) {
      setStatus((current) => ({ ...current, [id]: { error: error.message } }));
      return false;
    }
  }
  return { status, save };
}

function Feedback({ state }) {
  if (!state) return null;
  if (state.error) return <p className="mt-1 text-sm text-rose-300">{state.error}</p>;
  if (state.ok) return <p className="mt-1 text-sm text-emerald-300">{state.ok}</p>;
  return null;
}

function Row({ label, hint, children, state }) {
  return (
    <div className="py-3">
      <div className="text-sm font-medium text-slate-100">{label}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
      <div className="mt-2">{children}</div>
      <Feedback state={state} />
    </div>
  );
}

function ValueSetting({ settingKey, label, hint, initial, toValue, canEdit, saver, inputMode = "numeric" }) {
  const [text, setText] = useState(String(initial));
  const dirty = text !== String(initial);
  return (
    <Row label={label} hint={hint} state={saver.status[settingKey]}>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          saver.save(settingKey, { op: "set", key: settingKey, value: toValue(text) });
        }}
      >
        <input aria-label={label} className={inputClass} inputMode={inputMode} value={text} disabled={!canEdit} onChange={(event) => setText(event.target.value)} />
        <Button tone="primary" type="submit" disabled={!canEdit || !dirty || saver.status[settingKey]?.busy}>Save</Button>
      </form>
    </Row>
  );
}

function HoursSetting({ settingKey, label, hint, initial, keys, canEdit, saver }) {
  const [start, setStart] = useState(String(initial[keys[0]]));
  const [end, setEnd] = useState(String(initial[keys[1]]));
  const dirty = start !== String(initial[keys[0]]) || end !== String(initial[keys[1]]);
  return (
    <Row label={label} hint={hint} state={saver.status[settingKey]}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          saver.save(settingKey, { op: "set", key: settingKey, value: { [keys[0]]: Number(start), [keys[1]]: Number(end) } });
        }}
      >
        <input aria-label={`${label} start hour`} className={`${inputClass} !w-20`} inputMode="numeric" value={start} disabled={!canEdit} onChange={(event) => setStart(event.target.value)} />
        <span className="text-slate-500">to</span>
        <input aria-label={`${label} end hour`} className={`${inputClass} !w-20`} inputMode="numeric" value={end} disabled={!canEdit} onChange={(event) => setEnd(event.target.value)} />
        <span className="text-xs text-slate-500">{hourLabel(Number(start))}–{hourLabel(Number(end))}</span>
        <Button tone="primary" type="submit" disabled={!canEdit || !dirty} className="ml-auto">Save</Button>
      </form>
    </Row>
  );
}

function ModeSetting({ mode, canEdit, saver }) {
  async function choose(next) {
    if (next === mode) return;
    if (next === "send" && !window.confirm("Approved emails will send from Gmail on their own, inside each recipient's 9–5 weekday window. Switch to send mode?")) return;
    await saver.save("outreach.mode", { op: "set", key: "outreach.mode", value: next });
  }
  return (
    <Row label="Outreach mode" hint="Same as /mode in Telegram." state={saver.status["outreach.mode"]}>
      <div className="grid grid-cols-2 gap-2">
        {[["draft", "Draft", "Approvals make Gmail drafts for you to send"], ["send", "Send", "Approved emails send on their own"]].map(([key, title, text]) => (
          <button
            type="button"
            key={key}
            disabled={!canEdit}
            onClick={() => choose(key)}
            className={`rounded-xl border p-3 text-left disabled:opacity-60 ${mode === key ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 hover:bg-white/5"}`}
          >
            <div className="font-semibold text-slate-50">{title}</div>
            <div className="text-xs text-slate-400">{text}</div>
          </button>
        ))}
      </div>
    </Row>
  );
}

function ConsoleModelSetting({ value, canEdit, saver }) {
  return (
    <Row label="Console answers" hint="Which brain answers the console on Today. Telegram questions keep the local model." state={saver.status["chat.console_model"]}>
      <div className="grid grid-cols-2 gap-2">
        {[["claude", "Claude", "Fast and sharp, about a cent or two per question"], ["local", "Local Gemma", "Free, runs on this PC, can take a minute or more"]].map(([key, title, text]) => (
          <button
            type="button"
            key={key}
            disabled={!canEdit}
            onClick={() => key !== value && saver.save("chat.console_model", { op: "set", key: "chat.console_model", value: key })}
            className={`rounded-xl border p-3 text-left disabled:opacity-60 ${value === key ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 hover:bg-white/5"}`}
          >
            <div className="font-semibold text-slate-50">{title}</div>
            <div className="text-xs text-slate-400">{text}</div>
          </button>
        ))}
      </div>
    </Row>
  );
}

function LaneCard({ laneKey, lane, pausedReason, canEdit, saver }) {
  const [queries, setQueries] = useState((lane.queries ?? []).join("\n"));
  const dirty = queries !== (lane.queries ?? []).join("\n");
  const id = `lane-${laneKey}`;
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-50">{lane.label || words(laneKey)}</div>
          <div className="text-xs text-slate-500">{laneKey} · {lane.timezone}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            tone={lane.active ? "good" : "neutral"}
            disabled={!canEdit}
            onClick={() => saver.save(`${id}-active`, { op: "lane", lane: laneKey, active: !lane.active })}
          >
            {lane.active ? "Prospecting on" : "Prospecting off"}
          </Button>
          <Button
            tone={pausedReason ? "bad" : "neutral"}
            disabled={!canEdit}
            onClick={() => saver.save(`${id}-pause`, { op: "pauseLane", lane: laneKey, paused: !pausedReason })}
          >
            {pausedReason ? "Outreach paused" : "Outreach on"}
          </Button>
        </div>
      </div>
      {pausedReason && <p className="mt-2 text-xs text-amber-300">Paused: {pausedReason}</p>}
      <Feedback state={saver.status[`${id}-active`]} />
      <Feedback state={saver.status[`${id}-pause`]} />
      <label htmlFor={`${id}-queries`} className="mt-3 block text-xs text-slate-400">Search queries, one per line</label>
      <textarea id={`${id}-queries`} rows={Math.max(3, (lane.queries ?? []).length + 1)} className={`${inputClass} mt-1 text-sm`} value={queries} disabled={!canEdit} onChange={(event) => setQueries(event.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button tone="primary" disabled={!canEdit || !dirty} onClick={() => saver.save(`${id}-queries`, { op: "lane", lane: laneKey, queries: queries.split("\n") })}>Save queries</Button>
      </div>
      <Feedback state={saver.status[`${id}-queries`]} />
    </div>
  );
}

const asNumber = (text) => (text.trim() === "" ? "" : Number(text));
const asDays = (text) => text.split(/[\s,]+/).filter(Boolean).map(Number);

export default function SettingsPage() {
  const { data, error, loading, reload } = useOsData("settings");
  const saver = useSaver(reload);
  if (!data) return <><PageTitle title="Settings" /><Loading error={loading ? null : error} reload={reload} /></>;
  const { values, canEdit } = data;
  // Re-mount inputs when saved values change so they show what is stored.
  const k = (key) => `${key}:${JSON.stringify(values[key])}`;
  const props = { canEdit, saver };

  return (
    <>
      <PageTitle title="Settings" subtitle="Owner-only changes, checked the same way as the Telegram commands." />
      {!canEdit && (
        <div className="mb-4">
          <Notice tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Read-only on this device. Changes need the OTG-OS PC or the access key.</span>
              <Button tone="primary" onClick={() => window.dispatchEvent(new Event("otg-os-open-key"))}>Enter key</Button>
            </div>
          </Notice>
        </div>
      )}

      <div className="space-y-4">
        <Card title="Outreach">
          <div className="divide-y divide-white/5">
            <ModeSetting mode={values["outreach.mode"]} {...props} />
            <ValueSetting key={k("outreach.daily_pitch_limit")} settingKey="outreach.daily_pitch_limit" label="First emails per day" hint="Pitches drafted in any 24 hours." initial={values["outreach.daily_pitch_limit"]} toValue={asNumber} {...props} />
            <ValueSetting key={k("outreach.daily_email_limit")} settingKey="outreach.daily_email_limit" label="All emails per day" hint="Pitches, follow-ups and portfolio replies together." initial={values["outreach.daily_email_limit"]} toValue={asNumber} {...props} />
            <ValueSetting key={k("outreach.follow_up_days")} settingKey="outreach.follow_up_days" label="Follow-up days" hint="Days after the first email, for example 4, 9. Leave empty for no follow-ups." initial={values["outreach.follow_up_days"].join(", ")} toValue={asDays} inputMode="text" {...props} />
            <ValueSetting key={k("outreach.close_after_days")} settingKey="outreach.close_after_days" label="Close after the last follow-up (days)" initial={values["outreach.close_after_days"]} toValue={asNumber} {...props} />
            <HoursSetting key={k("outreach.window")} settingKey="outreach.window" label="Sending window" hint="Recipient's local time, weekdays; hours 0–24." initial={values["outreach.window"]} keys={["startHour", "endHour"]} {...props} />
          </div>
        </Card>

        <Card title="Lanes">
          <p className="mb-3 text-xs text-slate-500">Prospecting decides whether a lane gets searched for new businesses. Outreach pause is /lane pause|resume: drafts stop for that lane.</p>
          <div className="space-y-3">
            {data.laneOrder.map((laneKey) => (
              <LaneCard key={`${laneKey}:${JSON.stringify(data.lanes[laneKey])}:${data.pausedLanes[laneKey] ?? ""}`} laneKey={laneKey} lane={data.lanes[laneKey] ?? {}} pausedReason={data.pausedLanes[laneKey] ?? ""} {...props} />
            ))}
          </div>
        </Card>

        <Card title="Daily caps, goal and console">
          <div className="divide-y divide-white/5">
            <ValueSetting key={k("gigs.daily_searches")} settingKey="gigs.daily_searches" label="Prospect searches per weekday" hint="Each one is a paid Grok search." initial={values["gigs.daily_searches"]} toValue={asNumber} {...props} />
            <ValueSetting key={k("gigs.daily_research")} settingKey="gigs.daily_research" label="Prospects researched per day" initial={values["gigs.daily_research"]} toValue={asNumber} {...props} />
            <Row label="Local AI first" hint="Every AI job tries Gemma on this PC first (free) and only uses paid models if it fails. Reply sorting always uses Claude so unsubscribes are never missed." state={saver.status["models.local_first"]}>
              <Button tone={values["models.local_first"] ? "good" : "neutral"} disabled={!canEdit} onClick={() => saver.save("models.local_first", { op: "set", key: "models.local_first", value: !values["models.local_first"] })}>
                {values["models.local_first"] ? "On: local first (lowest cost)" : "Off: paid models first (sharper, faster)"}
              </Button>
            </Row>
            <ConsoleModelSetting value={values["chat.console_model"]} {...props} />
            <ValueSetting key={k("goals.monthly_shoot_days")} settingKey="goals.monthly_shoot_days" label="Goal: paid shoot days per month" initial={values["goals.monthly_shoot_days"]} toValue={asNumber} {...props} />
          </div>
        </Card>

        <Card title="Sales">
          <div className="divide-y divide-white/5">
            <ValueSetting key={k("public.base_url")} settingKey="public.base_url" label="Public address for lead pages" hint="The Tailscale Funnel address, e.g. https://supawizard.tailfa9e27.ts.net:8443. Leave empty to keep pages private." initial={values["public.base_url"]} toValue={(text) => text.trim()} inputMode="url" {...props} />
            <ValueSetting key={k("sales.closers")} settingKey="sales.closers" label="Closers" hint="Who runs discovery calls, comma separated. Calls rotate between them. Empty means you." initial={values["sales.closers"].join(", ")} toValue={(text) => text} inputMode="text" {...props} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Portfolio tags live on the <a className="text-cyan-300" href="/os/portfolio">Portfolio</a> page.</p>
        </Card>

        <Card title="Telegram">
          <div className="divide-y divide-white/5">
            <HoursSetting key={k("telegram.quiet_hours")} settingKey="telegram.quiet_hours" label="Quiet hours" hint="Pacific. Payment and booking notices still come through." initial={values["telegram.quiet_hours"]} keys={["start", "end"]} {...props} />
            <Row label="Approval bundles" hint="Non-urgent approvals arrive at these Pacific times.">
              <div className="flex flex-wrap gap-2">{data.bundleHours.map((hour) => <Badge key={hour}>{hourLabel(hour)}</Badge>)}</div>
            </Row>
            <Row label="Team">
              <div className="flex flex-wrap gap-2">
                {data.team.length ? data.team.map((member) => <Badge key={member.name} tone={member.role === "owner" ? "warn" : "neutral"}>{member.name} · {member.role}</Badge>) : <span className="text-sm text-slate-500">No Telegram team set up.</span>}
              </div>
            </Row>
          </div>
        </Card>

        <Card title="Budget (read only)">
          <p className="text-sm text-slate-200">Monthly cap {dollars(data.budget.monthlyCapCents * 10_000)}, warning at {dollars(data.budget.warningCents * 10_000)}.</p>
          <div className="mt-2 flex flex-wrap gap-2">{Object.entries(data.budget.dailyToolCaps).map(([tool, cap]) => <Badge key={tool}>{tool}: {cap}/day</Badge>)}</div>
          <p className="mt-2 text-xs text-slate-500">The cap only rises when OTG-OS-attributed deposits pay for it; that comes with the daily audit.</p>
        </Card>
      </div>
    </>
  );
}
