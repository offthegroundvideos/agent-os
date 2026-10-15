"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LIVE_PULSE_EVENT } from "./client";

const SOUND_KEY = "otg-os-sound";

function readSound() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

let audio = null;

// Browsers only allow sound after a tap, so the audio context is unlocked on the first one.
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch {
    audio = null;
  }
}

// A short rising two-note chime; lower and longer for problems.
function chime(kind) {
  if (!audio || audio.state !== "running") return;
  const notes = kind === "bad" ? [392, 311] : kind === "hot" ? [659, 880, 1175] : [784, 1047];
  const start = audio.currentTime;
  notes.forEach((frequency, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const at = start + i * 0.11;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + (kind === "bad" ? 0.5 : 0.35));
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.6);
  });
}

const TONES = {
  good: "border-cyan-300/50 shadow-[0_0_30px_-8px_rgb(34,211,238)]",
  hot: "border-amber-300/60 shadow-[0_0_30px_-8px_rgb(251,191,36)]",
  bad: "border-rose-300/60 shadow-[0_0_30px_-8px_rgb(251,113,133)]",
};

export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(readSound()), []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setOn(next);
        try {
          window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
        } catch {
          // The choice lasts for this visit only.
        }
        if (next) {
          unlockAudio();
          chime("good");
        }
      }}
      aria-label={on ? "Mute alert sounds" : "Turn alert sounds on"}
      aria-pressed={on}
      className={`rounded-lg px-2 py-1.5 ${on ? "text-cyan-200" : "text-slate-500"} hover:text-cyan-100`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" />
        {!on && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}

// Toasts (and a chime) when something new needs Jack: a draft to approve, a lead that replied, a failure.
export default function Alerts() {
  const [toasts, setToasts] = useState([]);
  const last = useRef(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const onPulse = (event) => {
      const now = event.detail;
      const before = last.current;
      last.current = now;
      if (!before || now.first) return;
      const fresh = [];
      if (now.hot > before.hot) fresh.push({ kind: "hot", text: `${now.hot - before.hot === 1 ? "A lead" : `${now.hot - before.hot} leads`} just moved forward. Replies are where bookings come from.`, href: "/os" });
      if (now.waiting > before.waiting) {
        const n = now.waiting - before.waiting;
        fresh.push({ kind: "good", text: `${n} new draft${n === 1 ? "" : "s"} waiting for your OK.`, href: "/os/approvals" });
      }
      if (now.failed > before.failed) fresh.push({ kind: "bad", text: "Something failed and needs a look.", href: "/os" });
      if (!fresh.length) return;
      if (readSound()) chime(fresh[0].kind);
      const stamped = fresh.map((toast) => ({ ...toast, id: `${Date.now()}-${Math.random()}` }));
      setToasts((current) => [...current, ...stamped].slice(-4));
      for (const toast of stamped) setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 9000);
    };
    window.addEventListener(LIVE_PULSE_EVENT, onPulse);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener(LIVE_PULSE_EVENT, onPulse);
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <Link
          key={toast.id}
          href={toast.href}
          onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          className={`os-panel pointer-events-auto w-full max-w-md rounded-xl border bg-slate-950/90 px-4 py-3 text-sm text-slate-100 ${TONES[toast.kind]}`}
        >
          <span className="os-mono mr-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300">Incoming</span>
          {toast.text}
        </Link>
      ))}
    </div>
  );
}
