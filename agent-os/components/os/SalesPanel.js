"use client";
import { useState } from "react";
import { osFetch, pacificTime, readKey, timeAgo, useOsData } from "./client";
import { Badge, Button, Card } from "./ui";

const MANUAL = [
  ["call", "Phone call"], ["text", "Text"], ["dm", "Social DM"], ["in_person", "In person"], ["email_manual", "Email (by hand)"], ["note", "Note"],
];
const DEAL_STATUS = [["open", "Open"], ["proposal_sent", "Proposal sent"], ["won", "Won"], ["lost", "Lost"]];
const inputClass = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[15px] text-slate-100 outline-none focus:border-cyan-300";
const KIND_TONE = { page_viewed: "warn", video_played: "warn", call_booked: "good", call_held: "good", deal: "violet", reply: "warn", no_show: "bad" };

function CopyLink({ url }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="!min-h-[34px] !px-3 !text-[10px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

// Uploads with progress (fetch can't report upload progress), to the route outside /api that allows big clips.
function uploadClip(id, file, title, onProgress) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("video", file);
    body.append("title", title);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/os/upload/${encodeURIComponent(id)}`);
    const key = readKey();
    if (key) xhr.setRequestHeader("x-agent-os-secret", key);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
    xhr.send(body);
  });
}

export default function SalesPanel({ id, business }) {
  const { data, reload } = useOsData(`pipeline/${encodeURIComponent(id)}/sales`);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [intro, setIntro] = useState(null);
  const [touch, setTouch] = useState({ kind: "call", note: "" });
  const [deal, setDeal] = useState(null);
  const [upload, setUpload] = useState({ file: null, title: "", progress: 0 });

  async function post(body, label) {
    setBusy(label);
    setMessage("");
    try {
      await osFetch(`pipeline/${encodeURIComponent(id)}/sales`, { method: "POST", body });
      await reload();
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function sendClip() {
    if (!upload.file) return;
    setBusy("upload");
    setMessage("");
    try {
      await uploadClip(id, upload.file, upload.title || `Hello ${business}`, (progress) => setUpload((current) => ({ ...current, progress })));
      setUpload({ file: null, title: "", progress: 0 });
      await reload();
      setMessage("Clip uploaded and added to their page.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  if (!data) return null;
  const page = data.page;
  const dealForm = deal ?? {
    status: data.deal?.status ?? "open",
    monthly: data.deal ? String(data.deal.monthlyCents / 100) : "",
    closer: data.deal?.closer ?? data.closers[0] ?? "",
    notes: data.deal?.notes ?? "",
  };
  const shareUrl = page?.url || "";

  return (
    <Card title="Sales" className="mt-4">
      {message && <p className="mb-3 text-sm text-cyan-200">{message}</p>}

      <section className="rounded-xl border border-cyan-300/15 bg-slate-950/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="os-hud text-[11px] font-semibold uppercase text-cyan-300/90">Their personal page</h3>
          {page && <span className="os-mono text-[11px] text-slate-400">{page.views} view{page.views === 1 ? "" : "s"}{page.lastViewedAt ? ` · last ${timeAgo(page.lastViewedAt)}` : ""}</span>}
        </div>
        {!page ? (
          <>
            <p className="text-sm text-slate-400">A private page just for {business}: a short hello, work that fits, your clip, and a button to book a free 20-minute call. Pitches link to it automatically once the public address is set.</p>
            <Button tone="primary" className="mt-3" disabled={Boolean(busy)} onClick={() => post({ op: "page" }, "page")}>Create their page</Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {shareUrl ? (
                <>
                  <code className="os-mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 text-[11px] text-cyan-100">{shareUrl}</code>
                  <CopyLink url={shareUrl} />
                </>
              ) : (
                <span className="text-xs text-amber-200">Not public yet: set the public address in Settings to share it.</span>
              )}
              <a href={page.path} target="_blank" rel="noreferrer" className="os-mono text-[11px] uppercase text-cyan-300 hover:text-cyan-100">Preview →</a>
              <Button tone={page.active ? "neutral" : "bad"} className="!min-h-[34px] !px-3 !text-[10px]" disabled={Boolean(busy)} onClick={() => post({ op: "active", active: !page.active }, "active")}>
                {page.active ? "Page on" : "Page off"}
              </Button>
            </div>
            <label className="block text-xs text-slate-400">
              Hello text on their page
              <textarea rows={3} className={`${inputClass} mt-1`} value={intro ?? page.intro} maxLength={1200} onChange={(event) => setIntro(event.target.value)} />
            </label>
            {intro !== null && intro !== page.intro && (
              <Button tone="primary" disabled={Boolean(busy)} onClick={async () => { if (await post({ op: "intro", intro }, "intro")) setIntro(null); }}>Save hello text</Button>
            )}
          </div>
        )}
      </section>

      {page && (
        <section className="mt-3 rounded-xl border border-violet-300/20 bg-violet-400/5 p-3">
          <h3 className="os-hud mb-2 text-[11px] font-semibold uppercase text-violet-200">Your clip</h3>
          {data.videos.length > 0 && (
            <ul className="mb-3 space-y-1.5 text-sm">
              {data.videos.map((video) => (
                <li key={video.id} className="flex items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2">
                    <input type="radio" name={`clip-${id}`} checked={page.videoId === video.id} onChange={() => post({ op: "video", videoId: video.id }, "video")} />
                    <span className="truncate text-slate-200">{video.title || `Clip ${video.id}`}</span>
                  </label>
                  <span className="os-mono shrink-0 text-[11px] text-slate-500">{(video.size / 1_048_576).toFixed(1)} MB · {pacificTime(video.createdAt)}</span>
                </li>
              ))}
              {page.videoId && <li><button type="button" className="text-xs text-slate-400 hover:text-cyan-100" onClick={() => post({ op: "video", videoId: null }, "video")}>Hide the clip from their page</button></li>}
            </ul>
          )}
          <p className="mb-2 text-xs text-slate-400">Record a 30–60 second hello on your phone (say their name and one idea for them), or pick a video.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept="video/*" aria-label="Choose or record a video" className="min-w-0 flex-1 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-400/20 file:px-3 file:py-2 file:text-violet-100"
              onChange={(event) => setUpload({ file: event.target.files?.[0] ?? null, title: "", progress: 0 })} />
            <Button tone="primary" disabled={!upload.file || Boolean(busy)} onClick={sendClip}>{busy === "upload" ? `${Math.round(upload.progress * 100)}%` : "Upload"}</Button>
          </div>
          {busy === "upload" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${Math.round(upload.progress * 100)}%` }} /></div>}
        </section>
      )}

      <section className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-3">
        <h3 className="os-hud mb-2 text-[11px] font-semibold uppercase text-emerald-200">Retainer deal</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="Deal status" className={inputClass} value={dealForm.status} onChange={(event) => setDeal({ ...dealForm, status: event.target.value })}>
            {DEAL_STATUS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input aria-label="Monthly value in dollars" className={inputClass} inputMode="decimal" placeholder="$ / month" value={dealForm.monthly} onChange={(event) => setDeal({ ...dealForm, monthly: event.target.value })} />
          <select aria-label="Closer" className={inputClass} value={dealForm.closer} onChange={(event) => setDeal({ ...dealForm, closer: event.target.value })}>
            {[...new Set([...data.closers, dealForm.closer].filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <Button tone="good" disabled={!deal || Boolean(busy)} onClick={async () => {
            if (await post({ op: "deal", status: dealForm.status, monthly: dealForm.monthly, closer: dealForm.closer, notes: dealForm.notes }, "deal")) setDeal(null);
          }}>Save deal</Button>
        </div>
        <textarea aria-label="Deal notes" rows={2} className={`${inputClass} mt-2`} placeholder="What they want each month, decision date…" value={dealForm.notes} onChange={(event) => setDeal({ ...dealForm, notes: event.target.value })} />
      </section>

      <section className="mt-3 rounded-xl border border-white/10 p-3">
        <h3 className="os-hud mb-2 text-[11px] font-semibold uppercase text-cyan-300/90">Log a touch point</h3>
        <form className="flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault();
          if (await post({ op: "touch", kind: touch.kind, note: touch.note }, "touch")) setTouch({ kind: touch.kind, note: "" });
        }}>
          <select aria-label="Kind of touch point" className={`${inputClass} !w-auto`} value={touch.kind} onChange={(event) => setTouch({ ...touch, kind: event.target.value })}>
            {MANUAL.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input aria-label="What happened" className={`${inputClass} min-w-0 flex-1`} placeholder="What happened?" maxLength={1000} value={touch.note} onChange={(event) => setTouch({ ...touch, note: event.target.value })} />
          <Button tone="primary" type="submit" disabled={Boolean(busy)}>Log</Button>
        </form>
      </section>

      <section className="mt-3">
        <h3 className="os-hud mb-2 text-[11px] font-semibold uppercase text-cyan-300/90">Touch points ({data.timeline.length})</h3>
        <ol className="space-y-2 border-l border-white/10 pl-4">
          {data.timeline.map((row, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-cyan-400" />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={KIND_TONE[row.kind] ?? "neutral"}>{row.label}</Badge>
                <span className="text-[11px] text-slate-500">{pacificTime(row.at)}{row.actor ? ` · ${row.actor}` : ""}</span>
              </div>
              {row.note && <p className="mt-0.5 text-sm text-slate-300 [overflow-wrap:anywhere]">{row.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </Card>
  );
}
