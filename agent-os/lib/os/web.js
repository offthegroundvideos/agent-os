// What the Next.js /api/os routes share: one OTG-OS runtime per web process (same database as the worker),
// the dashboard read models, and the owner check for settings changes.
import { createOsRuntime } from './runtime.js';
import { SettingsEditError } from './settingsEditor.js';
import { ApprovalError } from './approvalActions.js';
import { LedgerError } from './ledger.js';
import { RegistryError } from './registry.js';
import { StageError } from './gigs/stages.js';
import { GigStoreError } from './gigs/store.js';

const KNOWN_ERRORS = [LedgerError, RegistryError, ApprovalError, SettingsEditError, StageError, GigStoreError];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Next.js fills x-forwarded-for from the socket when the client sends none, so a real local request
// carries a loopback address here. A missing header fails closed.
function fromLoopback(headers) {
  const forwarded = String(headers.get('x-forwarded-for') || '').trim();
  return Boolean(forwarded) && forwarded.split(',').every((ip) => LOOPBACK_IPS.has(ip.trim()));
}

function hostOf(headers) {
  return String(headers.get('host') || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
}

function providedSecret(headers) {
  const header = headers.get('x-agent-os-secret');
  if (header) return header.trim();
  const match = String(headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// Owner-only changes are allowed on the owner's PC (loopback host and loopback client address) or with
// AGENT_OS_API_SECRET. Both headers can be forged by a peer that can reach the port, so the key is the real lock.
// Other private hosts (Tailscale 100.x peers) can read and approve, as Telegram admins can, but not change settings.
export function isOwnerRequest(request, env = process.env) {
  const headers = request.headers;
  if (LOOPBACK_HOSTS.has(hostOf(headers)) && fromLoopback(headers)) return true;
  const secret = String(env.AGENT_OS_API_SECRET || '').trim();
  return Boolean(secret) && providedSecret(headers) === secret;
}

// Who to credit in the ledger and the Telegram copies for a dashboard action.
export function actorFor(request, env = process.env) {
  return isOwnerRequest(request, env) ? `${env.TELEGRAM_OWNER_NAME || 'Jack'} (dashboard)` : 'Dashboard';
}

export function osWeb() {
  if (!globalThis.__otgOsWeb) {
    const runtime = createOsRuntime({ log: (line) => console.error(`[otg-os web] ${line}`) });
    globalThis.__otgOsWeb = { runtime, editor: runtime.settingsEditor, dashboard: runtime.dashboard };
  }
  return globalThis.__otgOsWeb;
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

// Known, user-facing errors (bad input, an action already handled) become 400/409; anything else is a 500.
export function errorResponse(error) {
  const message = String(error?.message ?? error);
  const isKnown = KNOWN_ERRORS.some((type) => error instanceof type);
  const status = /no longer waiting|expected proposed/.test(message) ? 409 : isKnown ? 400 : 500;
  if (status === 500) console.error(`[otg-os web] ${message}`);
  return jsonResponse({ error: message }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
