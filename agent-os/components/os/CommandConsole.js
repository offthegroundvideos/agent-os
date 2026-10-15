"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { osFetch } from "./client";

const QUICK = [
  "What needs me right now?",
  "Approve the best pitch waiting",
  "How is the pipeline looking?",
  "What did the worker do overnight?",
  "Which prospect looks most promising?",
];

const VOICE_KEY = "otg-os-voice";
const HISTORY_KEY = "otg-os-console";

function load(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off in private windows; the console still works for this visit.
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, "link"));
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((voice) => /en(-|_)(US|GB)/i.test(voice.lang) && /natural|neural|google|samantha|aria|jenny|guy/i.test(voice.name))
    ?? voices.find((voice) => /^en/i.test(voice.lang));
  if (preferred) utterance.voice = preferred;
  utterance.rate = 1.03;
  utterance.pitch = 0.95;
  window.speechSynthesis.speak(utterance);
}

const REASON_LABELS = { wrong_target: "wrong target", wrong_tone: "wrong tone", bad_timing: "bad timing", other: "other" };

function describeProposal(proposal) {
  if (proposal.kind === "decision") {
    const what = proposal.business ? `${proposal.actionType} to ${proposal.business}` : proposal.actionType;
    return proposal.decision === "approve" ? `Approve ${what}` : `Reject ${what} (${REASON_LABELS[proposal.reason] ?? "other"})`;
  }
  const lane = proposal.lane ? proposal.lane.replaceAll("_", " ") : "";
  return {
    pause_all: "Pause all outgoing work",
    resume_all: "Resume all outgoing work",
    pause_lane: `Pause ${lane} outreach`,
    resume_lane: `Resume ${lane} outreach`,
  }[proposal.op];
}

// Runs a confirmed proposal through the same routes the buttons elsewhere use. The brain never calls these.
async function carryOut(proposal) {
  if (proposal.kind === "decision") {
    const body = proposal.decision === "approve" ? { id: proposal.actionId, op: "approve" } : { id: proposal.actionId, op: "reject", reason: proposal.reason || "other" };
    return (await osFetch("approvals", { method: "POST", body })).message;
  }
  if (proposal.op === "pause_all" || proposal.op === "resume_all") {
    return (await osFetch("control", { method: "POST", body: { op: proposal.op === "pause_all" ? "pause" : "resume" } })).message;
  }
  return (await osFetch("settings", { method: "POST", body: { op: "pauseLane", lane: proposal.lane, paused: proposal.op === "pause_lane" } })).message;
}

function ProposalCard({ proposal, onChange }) {
  const risky = proposal.kind === "decision" ? proposal.decision === "reject" : proposal.op.startsWith("pause");
  async function confirm() {
    onChange({ status: "working" });
    try {
      onChange({ status: "done", result: await carryOut(proposal) });
    } catch (error) {
      onChange({ status: "failed", result: error.message });
    }
  }
  return (
    <div className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/5 p-2.5 text-left">
      <div className="os-mono text-[10px] uppercase tracking-[0.25em] text-amber-200/80">Needs your OK</div>
      <div className="mt-1 text-[13px] text-amber-50">{describeProposal(proposal)}</div>
      {proposal.subject && <div className="text-[11px] text-slate-400">“{proposal.subject}”</div>}
      {proposal.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            className={`os-hud rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase ${risky ? "border-rose-300/50 bg-rose-500/20 text-rose-50" : "border-emerald-300/60 bg-emerald-400/20 text-emerald-50"}`}
          >
            Confirm
          </button>
          <button type="button" onClick={() => onChange({ status: "dismissed" })} className="os-hud rounded-lg px-3 py-1.5 text-[11px] uppercase text-slate-400 hover:text-cyan-100">
            Dismiss
          </button>
        </div>
      )}
      {proposal.status === "working" && <p className="os-caret mt-2 text-[11px] text-amber-200">Working</p>}
      {proposal.status === "done" && <p className="mt-2 text-[11px] text-emerald-300">✓ {proposal.result}</p>}
      {proposal.status === "failed" && <p className="mt-2 text-[11px] text-rose-300">{proposal.result}</p>}
      {proposal.status === "dismissed" && <p className="mt-2 text-[11px] text-slate-500">Dismissed.</p>}
    </div>
  );
}

function MicIcon({ live }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${live ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

// Answers type in like the computer is talking.
function Typed({ text, instant }) {
  const [count, setCount] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant) return undefined;
    let n = 0;
    const timer = setInterval(() => {
      n += 3;
      setCount(n);
      if (n >= text.length) clearInterval(timer);
    }, 14);
    return () => clearInterval(timer);
  }, [text, instant]);
  return <span className={count < text.length ? "os-caret" : ""}>{text.slice(0, count)}</span>;
}

export default function CommandConsole() {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const scrollRef = useRef(null);
  const restored = useRef(0);

  useEffect(() => {
    const saved = load(HISTORY_KEY, []);
    restored.current = saved.length;
    setTurns(saved);
    setVoice(Boolean(load(VOICE_KEY, false)));
    setCanListen(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    const onKey = (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    store(HISTORY_KEY, turns.slice(-20));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const ask = useCallback(async (question) => {
    const text = String(question ?? "").trim();
    if (!text || busy) return;
    const history = turns.filter((turn) => !turn.error).slice(-8).map((turn) => ({ role: turn.role, text: turn.text }));
    setTurns((current) => [...current, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const { answer, proposals = [] } = await osFetch("chat", { method: "POST", body: { question: text, history } });
      setTurns((current) => [...current, { role: "assistant", text: answer, proposals: proposals.map((proposal) => ({ ...proposal, status: "pending" })) }]);
      if (voice) speak(answer);
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", text: error.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, turns, voice]);

  // /os?ask=... (from a prospect page) asks straight away, once.
  const askedFromLink = useRef(false);
  useEffect(() => {
    if (askedFromLink.current) return;
    const question = new URLSearchParams(window.location.search).get("ask");
    if (!question) return;
    askedFromLink.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    ask(question.slice(0, 500));
    inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ask]);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      setInput((finalText + interim).trim());
    };
    recognition.onend = () => {
      setListening(false);
      if (finalText.trim()) ask(finalText);
    };
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    store(VOICE_KEY, next);
    if (!next) window.speechSynthesis?.cancel();
    else speak("Voice replies on.");
  }

  return (
    <div className="rounded-xl border border-cyan-300/15 bg-black/40">
      {turns.length > 0 && (
        <div ref={scrollRef} className="os-mono max-h-80 space-y-3 overflow-y-auto p-3 text-[13px] leading-relaxed" aria-live="polite">
          {turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "text-right" : ""}>
              {turn.role === "user" ? (
                <span className="inline-block max-w-[90%] rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-left text-violet-100">{turn.text}</span>
              ) : (
                <div className="max-w-[95%]">
                  <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${turn.error ? "text-rose-300" : "text-cyan-50"}`}>
                    <span className="mr-2 text-cyan-500/70" aria-hidden="true">&gt;</span>
                    <Typed text={turn.text} instant={i < restored.current} />
                  </p>
                  {(turn.proposals ?? []).map((proposal, k) => (
                    <ProposalCard
                      key={`${proposal.kind}-${proposal.actionId ?? proposal.op}-${k}`}
                      proposal={proposal}
                      onChange={(patch) => setTurns((current) => current.map((item, n) => (n === i
                        ? { ...item, proposals: item.proposals.map((p, m) => (m === k ? { ...p, ...patch } : p)) }
                        : item)))}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="os-caret text-cyan-300/80"><span className="mr-2 text-cyan-500/70" aria-hidden="true">&gt;</span>Thinking</p>}
        </div>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2 p-3">
          {QUICK.map((question) => (
            <button
              type="button"
              key={question}
              onClick={() => ask(question)}
              disabled={busy}
              className="os-mono rounded-lg border border-cyan-300/20 bg-cyan-400/5 px-2.5 py-1.5 text-left text-[11px] text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:opacity-40"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-cyan-300/10 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <span className="os-mono pl-1 text-cyan-400" aria-hidden="true">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={listening ? "Listening…" : "Ask OTG-OS anything  ( / )"}
          aria-label="Ask OTG-OS"
          maxLength={2000}
          className="os-mono min-w-0 flex-1 bg-transparent py-2 text-[15px] text-cyan-50 placeholder:text-slate-500 focus:outline-none"
        />
        {canListen && (
          <button
            type="button"
            onClick={toggleListening}
            aria-label={listening ? "Stop listening" : "Speak a question"}
            className={`rounded-lg border p-2 transition ${listening ? "border-rose-300/60 bg-rose-500/20 text-rose-100 shadow-[0_0_16px_-2px_rgb(251,113,133)]" : "border-cyan-300/20 text-cyan-200 hover:bg-cyan-400/10"}`}
          >
            <MicIcon live={listening} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={voice ? "Turn spoken replies off" : "Turn spoken replies on"}
          aria-pressed={voice}
          className={`rounded-lg border p-2 transition ${voice ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "border-cyan-300/20 text-slate-400 hover:text-cyan-100"}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />{voice ? <path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" /> : <path d="M17 9l4 6M21 9l-4 6" />}
          </svg>
        </button>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="os-hud rounded-lg border border-cyan-300/60 bg-cyan-400/20 px-3 py-2 text-[11px] font-semibold uppercase text-cyan-50 shadow-[0_0_14px_-4px_rgb(34,211,238)] disabled:opacity-40"
        >
          Send
        </button>
      </form>
      {turns.length > 0 && (
        <div className="flex justify-end px-3 pb-2">
          <button type="button" onClick={() => { setTurns([]); restored.current = 0; }} className="os-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-cyan-200">Clear</button>
        </div>
      )}
    </div>
  );
}
