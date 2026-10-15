"use client";
// Browser side of the OTG-OS dashboard: API calls (with the access key off the PC), a polling data hook, formatting.
import { useCallback, useEffect, useRef, useState } from "react";

const KEY_STORAGE = "otg-os-access-key";
export const NEED_KEY_EVENT = "otg-os-need-key";
export const KEY_SAVED_EVENT = "otg-os-key-saved";

export function readKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function saveKey(value) {
  try {
    if (value) window.localStorage.setItem(KEY_STORAGE, value);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private windows can refuse storage; the key then lasts only for this page.
  }
  window.dispatchEvent(new Event(KEY_SAVED_EVENT));
}

export const LIVE_CHANGE_EVENT = "otg-os-change";
export const LIVE_STATE_EVENT = "otg-os-live";
export const LIVE_PULSE_EVENT = "otg-os-pulse";

// One live connection per tab. "live" while the event stream is open; pages refresh on each change.
const live = { started: false, state: "connecting", abort: null, retryMs: 2000 };

export function liveState() {
  return live.state;
}

function setLiveState(state) {
  if (live.state === state) return;
  live.state = state;
  window.dispatchEvent(new CustomEvent(LIVE_STATE_EVENT, { detail: state }));
}

async function connectLive() {
  const controller = new AbortController();
  live.abort = controller;
  try {
    const headers = { accept: "text/event-stream" };
    const key = readKey();
    if (key) headers["x-agent-os-secret"] = key;
    const response = await fetch("/api/os/events", { headers, cache: "no-store", signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`events ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
        if (dataLine && (event === "ready" || event === "change")) {
          try {
            window.dispatchEvent(new CustomEvent(LIVE_PULSE_EVENT, { detail: { ...JSON.parse(dataLine.slice(5)), first: event === "ready" } }));
          } catch {
            // A malformed line only skips the alert.
          }
        }
        if (event === "ready") {
          live.retryMs = 2000;
          setLiveState("live");
        } else if (event === "change") {
          window.dispatchEvent(new Event(LIVE_CHANGE_EVENT));
        }
      }
    }
  } catch {
    // Falls through to a retry.
  }
  if (controller.signal.aborted) return;
  setLiveState("reconnecting");
  setTimeout(connectLive, live.retryMs);
  live.retryMs = Math.min(live.retryMs * 2, 60_000);
}

export function startLive() {
  if (live.started) return;
  live.started = true;
  connectLive();
  window.addEventListener(KEY_SAVED_EVENT, () => {
    live.abort?.abort();
    live.retryMs = 2000;
    connectLive();
  });
  // Coming back to the tab: catch up at once in case the phone dropped the connection.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") window.dispatchEvent(new Event(LIVE_CHANGE_EVENT));
  });
}

export async function osFetch(path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  const key = readKey();
  if (key) headers["x-agent-os-secret"] = key;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`/api/os/${path}`, { method, headers, cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 401) window.dispatchEvent(new Event(NEED_KEY_EVENT));
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const SAFETY_REFRESH_MS = 5 * 60_000;

// Loads an /api/os path and refreshes it when the live stream says something changed (or after the key is saved).
// `interval` is the fallback polling rate used only while the live stream is down.
export function useOsData(path, { interval = 30_000 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  const reload = useCallback(async () => {
    try {
      const data = await osFetch(path);
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current) setState((current) => ({ data: current.data, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    reload();
    const onKey = () => reload();
    let pending = null;
    const onChange = () => {
      clearTimeout(pending);
      pending = setTimeout(reload, 400);
    };
    window.addEventListener(KEY_SAVED_EVENT, onKey);
    window.addEventListener(LIVE_CHANGE_EVENT, onChange);
    let lastLoad = Date.now();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const wait = liveState() === "live" ? SAFETY_REFRESH_MS : interval;
      if (wait && Date.now() - lastLoad >= wait) {
        lastLoad = Date.now();
        reload();
      }
    }, 5_000);
    return () => {
      alive.current = false;
      clearTimeout(pending);
      window.removeEventListener(KEY_SAVED_EVENT, onKey);
      window.removeEventListener(LIVE_CHANGE_EVENT, onChange);
      clearInterval(timer);
    };
  }, [reload, interval]);

  return { ...state, reload };
}

export function dollars(micros) {
  return `$${(Number(micros || 0) / 1_000_000).toFixed(2)}`;
}

export function words(value) {
  return String(value ?? "").replaceAll("_", " ");
}

const PACIFIC = "America/Los_Angeles";

export function pacificTime(iso, { withDate = true } = {}) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "never";
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function hourLabel(hour) {
  if (hour == null) return "";
  const h = Number(hour) % 24;
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}${suffix}`;
}
