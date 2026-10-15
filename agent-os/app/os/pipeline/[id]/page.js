"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dollars, pacificTime, useOsData, words } from "../../../../components/os/client";
import { Badge, Card, Loading, PageTitle, StageBadge } from "../../../../components/os/ui";

const STATUS_TONE = { proposed: "warn", approved: "info", executing: "info", done: "good", rejected: "neutral", failed: "bad" };

function ActionItem({ action }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[action.status] ?? "neutral"}>{action.status}</Badge>
        <span className="text-sm font-medium text-slate-100">{action.actionType}</span>
        <span className="text-xs text-slate-500">{pacificTime(action.createdAt)}</span>
      </div>
      {action.subject && <div className="mt-1 text-sm text-slate-300">Subject: {action.subject}</div>}
      <dl className="mt-1 space-y-0.5 text-sm">
        <div><dt className="inline text-slate-500">Why: </dt><dd className="inline text-slate-200">{action.why?.goal}</dd></div>
        <div><dt className="inline text-slate-500">Expected: </dt><dd className="inline text-slate-200">{action.why?.expected}</dd></div>
        {action.why?.evidence?.length > 0 && <div><dt className="inline text-slate-500">Evidence: </dt><dd className="inline break-words text-slate-300">{action.why.evidence.join("; ")}</dd></div>}
      </dl>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
        {action.approvedBy && <span>Approved by {action.approvedBy}</span>}
        {action.rejectReason && <span>Rejected: {words(action.rejectReason)}</span>}
        {action.editRatio > 0 && <span>Edited {Math.round(action.editRatio * 100)}%</span>}
        {action.costMicros > 0 && <span>{dollars(action.costMicros)}</span>}
        {action.result?.mode && <span>Result: {action.result.mode === "draft" ? "Gmail draft" : "sent"}</span>}
        {action.result?.skipped && <span>Skipped: {action.result.skipped}</span>}
      </div>
      {action.lastError && <p className="mt-1 break-words text-xs text-rose-300">Last error: {action.lastError}</p>}
      {action.draft && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-cyan-300">Show draft</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-sans text-sm text-slate-200">{action.draft}</pre>
        </details>
      )}
    </li>
  );
}

function PortfolioThumb({ item }) {
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/10 bg-black/40 hover:border-white/30">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
      ) : <div className="flex aspect-video items-center justify-center text-xs text-slate-500">no image</div>}
      <div className="p-2">
        <div className="truncate text-sm text-slate-100">{item.title}</div>
        <div className="truncate text-[11px] text-slate-500">{[item.lane, item.style, item.location].filter(Boolean).map(words).join(" · ") || "untagged"}</div>
      </div>
    </a>
  );
}

export default function OpportunityPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useOsData(`pipeline/${encodeURIComponent(id)}`);

  if (!data) {
    return (
      <>
        <Link href="/os/pipeline" className="mb-3 inline-block text-sm text-cyan-300">← Pipeline</Link>
        <Loading error={loading ? null : error} reload={reload} />
      </>
    );
  }
  const { business, contact } = data;

  return (
    <>
      <Link href="/os/pipeline" className="mb-3 inline-block text-sm text-cyan-300">← Pipeline</Link>
      <PageTitle
        title={business?.name ?? "Prospect"}
        subtitle={[words(data.laneLabel), business?.location].filter(Boolean).join(" · ")}
        action={(
          <div className="flex items-center gap-2">
            <Link
              href={`/os?ask=${encodeURIComponent(`Tell me about ${business?.name ?? "this prospect"}: where it stands and the best next step.`)}`}
              className="os-hud rounded-lg border border-violet-300/40 bg-violet-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase text-violet-100 hover:bg-violet-400/20"
            >
              Ask OTG-OS
            </Link>
            <StageBadge stage={data.stage} />
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Business and contact">
          <dl className="space-y-2 text-sm">
            {business?.website && <div><dt className="text-slate-500">Website</dt><dd><a href={business.website} target="_blank" rel="noreferrer" className="break-all text-cyan-300 hover:underline">{business.website}</a></dd></div>}
            {business?.fitReason && <div><dt className="text-slate-500">Why it fits</dt><dd className="text-slate-200">{business.fitReason}</dd></div>}
            {business?.sourceUrl && <div><dt className="text-slate-500">Found at</dt><dd><a href={business.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-slate-300 hover:underline">{business.sourceUrl}</a></dd></div>}
            {contact ? (
              <div>
                <dt className="text-slate-500">Contact</dt>
                <dd className="text-slate-200">{[contact.name, contact.role].filter(Boolean).join(", ") || "—"}<br /><span className="break-all">{contact.email}</span></dd>
                {contact.emailSourceUrl && <dd className="break-all text-xs text-slate-500">from {contact.emailSourceUrl}</dd>}
              </div>
            ) : <div><dt className="text-slate-500">Contact</dt><dd className="text-slate-400">Not found yet</dd></div>}
            {data.closeReason && <div><dt className="text-slate-500">Close reason</dt><dd className="text-slate-200">{words(data.closeReason)}</dd></div>}
            {data.nextFollowUpAt && <div><dt className="text-slate-500">Next follow-up</dt><dd className="text-slate-200">{pacificTime(data.nextFollowUpAt)} (follow-ups sent: {data.followUpsSent})</dd></div>}
          </dl>
        </Card>

        <Card title="Angle and evidence">
          <p className="text-sm text-slate-100">{data.angle || "No angle yet; it comes from research."}</p>
          {data.style && <p className="mt-1 text-xs text-slate-500">Style: {words(data.style)}</p>}
          {data.evidence?.length > 0 && (
            <ul className="mt-3 ml-4 list-disc space-y-1 text-sm text-slate-300">
              {data.evidence.map((line, i) => <li key={i} className="break-words">{line}</li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Portfolio matches" className="mt-4">
        {data.portfolioMatches.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.portfolioMatches.map((item) => <PortfolioThumb key={item.id} item={item} />)}</div>
        ) : <p className="text-sm text-slate-500">No pieces matched yet.</p>}
        {data.portfolioSent.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">Sent: {data.portfolioSent.map((sent) => sent.item?.title ?? `#${sent.itemId}`).join(", ")}</p>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Stage history">
          <ol className="space-y-3 border-l border-white/10 pl-4">
            {data.events.map((event, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-cyan-400" />
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={event.to} />
                  {event.from && <span className="text-xs text-slate-500">from {words(event.from)}</span>}
                </div>
                <p className="mt-0.5 text-sm text-slate-300">{event.reason}</p>
                <p className="text-[11px] text-slate-500">{pacificTime(event.at)} · {event.actor}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Emails">
          {data.emails.length ? (
            <ul className="divide-y divide-white/5 text-sm">
              {data.emails.map((email, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-slate-200">{words(email.kind)} <span className="text-slate-500">→ {email.toEmail}</span></span>
                  <span className="flex gap-1">
                    <Badge tone={email.mode === "send" ? "good" : "info"}>{email.mode === "send" ? "sent" : "Gmail draft"}</Badge>
                    {email.bounced ? <Badge tone="bad">bounced</Badge> : null}
                    {email.unsubscribed ? <Badge tone="bad">unsubscribed</Badge> : null}
                  </span>
                  <span className="w-full text-[11px] text-slate-500">{pacificTime(email.at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No emails yet.</p>}
        </Card>
      </div>

      <Card title="Actions and why" className="mt-4">
        {data.actions.length ? (
          <ul className="divide-y divide-white/5">{data.actions.map((action) => <ActionItem key={action.id} action={action} />)}</ul>
        ) : <p className="text-sm text-slate-500">No ledger actions for this prospect yet.</p>}
      </Card>
    </>
  );
}
