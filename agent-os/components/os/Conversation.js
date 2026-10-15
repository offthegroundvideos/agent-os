"use client";
import { useState } from "react";
import { osFetch } from "./client";
import { Badge, Button, Card } from "./ui";

// The Gmail back-and-forth with a prospect, loaded on demand (it is a live Gmail call).
export default function Conversation({ id, hasThread }) {
  const [state, setState] = useState({ loading: false, messages: null, note: "", error: "" });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await osFetch(`pipeline/${encodeURIComponent(id)}/conversation`);
      setState({ loading: false, messages: data.messages, note: data.note ?? "", error: "" });
    } catch (problem) {
      setState({ loading: false, messages: null, note: "", error: problem.message });
    }
  }

  return (
    <Card
      title="Email conversation"
      className="mt-4"
      action={hasThread && <Button tone="ghost" className="!min-h-[32px] !px-3 !text-[10px]" disabled={state.loading} onClick={load}>{state.messages ? "Reload" : "Open"}</Button>}
    >
      {!hasThread && <p className="text-sm text-slate-500">No emails with them yet.</p>}
      {hasThread && !state.messages && !state.loading && !state.error && <p className="text-sm text-slate-400">Open to read the thread from Gmail.</p>}
      {state.loading && <p className="os-mono os-caret text-sm text-cyan-200/80">Reading Gmail</p>}
      {state.note && <p className="text-sm text-slate-400">{state.note}</p>}
      {state.error && <p className="text-sm text-rose-300">{state.error}</p>}
      {state.messages?.length > 0 && (
        <ol className="space-y-3">
          {state.messages.map((message) => {
            const ours = message.sent || message.draft;
            return (
              <li key={message.id} className={`rounded-xl border p-3 ${ours ? "ml-6 border-cyan-300/15 bg-cyan-400/5" : "mr-6 border-amber-300/25 bg-amber-400/5"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-200">{message.from}</span>
                  {message.draft && <Badge tone="warn">draft, not sent</Badge>}
                  <span>{message.date}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-100 [overflow-wrap:anywhere]">{message.text || "(no text)"}</p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
