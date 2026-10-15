"use client";
import Link from "next/link";
import { useState } from "react";
import { hourLabel, osFetch, pacificTime, timeAgo, useOsData } from "../../../components/os/client";
import { Badge, Button, Card, Loading, Notice, PageTitle } from "../../../components/os/ui";

// Same keys and labels as the Telegram reject buttons (lib/os/telegram/format.js REJECT_REASONS).
const REJECT_REASONS = [
  ["wrong_target", "Wrong target"],
  ["wrong_tone", "Wrong tone"],
  ["bad_timing", "Bad timing"],
  ["other", "Other"],
];

function ApprovalCard({ item, nextBundleHour, onDone }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'reject'
  const [text, setText] = useState(item.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(body) {
    setBusy(true);
    setError("");
    try {
      const result = await osFetch("approvals", { method: "POST", body: { id: item.id, ...body } });
      onDone(result.message);
    } catch (problem) {
      setError(problem.message);
      if (problem.status === 409) onDone(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">{item.actionType}</Badge>
        {item.urgent && <Badge tone="bad">urgent</Badge>}
        {item.edited && <Badge tone="info">edited</Badge>}
        <span className="text-xs text-slate-500">{timeAgo(item.createdAt)} · {item.inTelegram ? "in Telegram" : `goes to Telegram at ${hourLabel(nextBundleHour)}`}</span>
      </div>

      {(item.business || item.to) && (
        <div className="mt-3">
          <div className="text-base font-semibold text-slate-50">
            {item.opportunityId ? <Link href={`/os/pipeline/${item.opportunityId}`} className="hover:underline">{item.business || "Prospect"}</Link> : item.business}
          </div>
          {item.to && <div className="break-all text-sm text-slate-400">To {item.to}</div>}
          {item.subject && <div className="mt-1 text-sm text-slate-200"><span className="text-slate-500">Subject:</span> {item.subject}</div>}
        </div>
      )}

      {mode === "edit" ? (
        <div className="mt-3">
          <label htmlFor={`edit-${item.id}`} className="text-xs text-slate-400">New text for the draft (the footer is added when it goes out)</label>
          <textarea
            id={`edit-${item.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-[15px] leading-relaxed text-slate-100 outline-none focus:border-cyan-400"
          />
        </div>
      ) : (
        <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-sans text-[15px] leading-relaxed text-slate-100">{item.subject ? item.draft : (item.description || item.draft)}</pre>
      )}

      <dl className="mt-3 space-y-1 text-sm">
        <div><dt className="inline text-slate-500">Why: </dt><dd className="inline text-slate-200">{item.why?.goal}</dd></div>
        <div><dt className="inline text-slate-500">Expected: </dt><dd className="inline text-slate-200">{item.why?.expected}</dd></div>
        {item.why?.evidence?.length > 0 && (
          <div>
            <dt className="text-slate-500">Evidence:</dt>
            <dd><ul className="ml-4 list-disc text-slate-300">{item.why.evidence.map((line, i) => <li key={i} className="break-words">{line}</li>)}</ul></dd>
          </div>
        )}
      </dl>
      {item.needsReview && <Notice tone="warn">Drafted by the local model. Read it carefully.</Notice>}

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      {mode === "reject" ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-300">Why are you rejecting it?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REJECT_REASONS.map(([key, label]) => (
              <Button key={key} tone="bad" disabled={busy} onClick={() => act({ op: "reject", reason: key })}>{label}</Button>
            ))}
          </div>
          <Button tone="ghost" className="mt-2" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      ) : mode === "edit" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button tone="primary" disabled={busy || !text.trim()} onClick={() => act({ op: "edit", text })}>Save draft</Button>
          <Button tone="ghost" onClick={() => { setMode(null); setText(item.draft); }}>Cancel</Button>
          <p className="w-full text-xs text-slate-500">Saving keeps it waiting so you can approve the new version.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button tone="good" disabled={busy} onClick={() => act({ op: "approve" })}>Approve</Button>
          <Button disabled={busy} onClick={() => setMode("edit")}>Edit</Button>
          <Button tone="bad" disabled={busy} onClick={() => setMode("reject")}>Reject</Button>
        </div>
      )}
    </Card>
  );
}

export default function ApprovalsPage() {
  const { data, error, loading, reload } = useOsData("approvals", { interval: 30_000 });
  const [flash, setFlash] = useState("");

  async function done(message) {
    setFlash(message);
    await reload();
  }

  return (
    <>
      <PageTitle
        title="Approvals"
        subtitle="The same items Telegram shows. Approve, edit or reject here or there; both stay in step."
      />
      {flash && <div className="mb-4"><Notice tone="good">{flash}</Notice></div>}
      {!data ? (
        <Loading error={loading ? null : error} reload={reload} />
      ) : data.items.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-slate-400">Nothing is waiting for approval.</p></Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">{data.items.length} waiting, oldest first{data.items[0] ? ` (since ${pacificTime(data.items[0].createdAt)})` : ""}.</p>
          {data.items.map((item) => <ApprovalCard key={`${item.id}-${item.draft.length}`} item={item} nextBundleHour={data.nextBundleHour} onDone={done} />)}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-500">Approved emails run through the worker within a minute; in draft mode they become Gmail drafts for you to send.</p>
    </>
  );
}
