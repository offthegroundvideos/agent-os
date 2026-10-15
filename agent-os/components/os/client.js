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

// Loads an /api/os path, refreshes every `interval` ms while the tab is visible, and again after the key is saved.
export function useOsData(path, { interval = 0 } = {}) {
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
    window.addEventListener(KEY_SAVED_EVENT, onKey);
    let timer = null;
    if (interval) {
      timer = setInterval(() => {
        if (document.visibilityState === "visible") reload();
      }, interval);
    }
    return () => {
      alive.current = false;
      window.removeEventListener(KEY_SAVED_EVENT, onKey);
      if (timer) clearInterval(timer);
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
