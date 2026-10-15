"use client";
import { useMemo, useState } from "react";
import { osFetch, useOsData, words } from "../../../components/os/client";
import { Badge, Button, Card, Loading, Notice, PageTitle } from "../../../components/os/ui";

const FILTERS = [
  ["all", "All"],
  ["unconfirmed", "Not checked"],
  ["untagged", "Untagged"],
  ["confirmed", "Checked"],
];

function Select({ id, label, value, options, onChange }) {
  return (
    <label htmlFor={id} className="block text-xs text-slate-400">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-slate-100 outline-none focus:border-cyan-400"
      >
        <option value="">—</option>
        {options.map((option) => <option key={option} value={option}>{words(option)}</option>)}
      </select>
    </label>
  );
}

function PortfolioCard({ item, options, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState({ lane: item.lane, style: item.style, type: item.deliverableType, location: item.location });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setTags((current) => ({ ...current, [key]: value }));

  async function save() {
    setBusy(true);
    setError("");
    // Only send what changed; a listed tag can't be blanked (same rule as /tag).
    const changed = {};
    if (tags.lane !== item.lane && tags.lane) changed.lane = tags.lane;
    if (tags.style !== item.style && tags.style) changed.style = tags.style;
    if (tags.type !== item.deliverableType && tags.type) changed.type = tags.type;
    if (tags.location !== item.location) changed.location = tags.location;
    // Saving with no change still confirms the suggested tags, like /tag with the same values.
    if (!Object.keys(changed).length) {
      if (item.lane) changed.lane = item.lane;
      else changed.location = item.location;
    }
    try {
      await osFetch("portfolio", { method: "POST", body: { id: item.id, ...changed } });
      setEditing(false);
      onSaved(`Saved ${item.title}.`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <a href={item.url} target="_blank" rel="noreferrer" className="block bg-black/40">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
        ) : <div className="flex aspect-video items-center justify-center text-xs text-slate-500">no image</div>}
      </a>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-50" title={item.title}>#{item.id} · {item.title}</div>
            <div className="text-[11px] text-slate-500">{item.source}{item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ""}</div>
          </div>
          {item.tagsConfirmed ? <Badge tone="good">checked</Badge> : <Badge tone="warn">suggested</Badge>}
        </div>
        {!editing ? (
          <>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.lane ? <Badge tone="info">{words(item.lane)}</Badge> : <Badge>untagged</Badge>}
              {item.style && <Badge>{item.style}</Badge>}
              {item.deliverableType && <Badge>{words(item.deliverableType)}</Badge>}
              {item.location && <Badge>{item.location}</Badge>}
            </div>
            <Button className="mt-3 w-full" onClick={() => setEditing(true)}>Fix tags</Button>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select id={`lane-${item.id}`} label="Lane" value={tags.lane} options={options.lane} onChange={set("lane")} />
              <Select id={`style-${item.id}`} label="Style" value={tags.style} options={options.style} onChange={set("style")} />
              <Select id={`type-${item.id}`} label="Type" value={tags.type} options={options.type} onChange={set("type")} />
              <label htmlFor={`loc-${item.id}`} className="block text-xs text-slate-400">
                Location
                <input
                  id={`loc-${item.id}`}
                  value={tags.location}
                  onChange={(event) => set("location")(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-slate-100 outline-none focus:border-cyan-400"
                />
              </label>
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <div className="flex gap-2">
              <Button tone="primary" className="flex-1" disabled={busy} onClick={save}>Save</Button>
              <Button tone="ghost" onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function PortfolioPage() {
  const { data, error, loading, reload } = useOsData("portfolio");
  const [filter, setFilter] = useState("all");
  const [flash, setFlash] = useState("");
  const items = useMemo(() => (data?.items ?? []).filter((item) => (
    filter === "all" ? true : filter === "untagged" ? !item.lane : filter === "confirmed" ? item.tagsConfirmed : !item.tagsConfirmed
  )), [data, filter]);

  async function saved(message) {
    setFlash(message);
    await reload();
  }

  return (
    <>
      <PageTitle title="Portfolio" subtitle="Imported each morning from madebyotg.com and @madebyotg. Checked tags are never overwritten." />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
        {FILTERS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setFilter(key)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${filter === key ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {flash && <div className="mb-4"><Notice tone="good">{flash}</Notice></div>}
      {!data ? <Loading error={loading ? null : error} reload={reload} /> : items.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-slate-400">{data.items.length ? "Nothing matches this filter." : "No portfolio pieces yet."}</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => <PortfolioCard key={`${item.id}-${item.lane}-${item.style}-${item.deliverableType}-${item.location}-${item.tagsConfirmed}`} item={item} options={data.options} onSaved={saved} />)}
        </div>
      )}
    </>
  );
}
