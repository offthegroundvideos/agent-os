import { editRatio as measureEditRatio } from './editRatio.js';

export class RegistryError extends Error {}

const REQUIRED_TOOL_FIELDS = ['name', 'actionType', 'describe', 'execute'];

export function createRegistry({ ledger, gate, settings, notifier, now = () => new Date() }) {
  const tools = new Map();

  function register(tool) {
    for (const field of REQUIRED_TOOL_FIELDS) {
      if (!tool?.[field]) throw new RegistryError(`Tool is missing ${field}.`);
    }
    tools.set(tool.name, tool);
  }

  function toolFor(action) {
    const tool = tools.get(action.tool);
    if (!tool) throw new RegistryError(`No tool registered for ${action.tool}.`);
    return tool;
  }

  function describe(action) {
    return toolFor(action).describe(action.payload);
  }

  async function presentApproval(action) {
    const sent = await notifier.requestApproval(action, describe(action));
    if (Array.isArray(sent)) ledger.addTelegramMessages(action.id, sent);
    else if (sent != null) ledger.setTelegramMessage(action.id, sent);
  }

  async function request({ tool: name, payload = {}, why, idempotencyKey, opportunityId = null, urgent = false }) {
    const tool = tools.get(name);
    if (!tool) throw new RegistryError(`Unknown tool: ${name}`);
    const level = gate.levelFor(tool.actionType);
    if (level === 'never') throw new RegistryError(`${tool.actionType} is not allowed.`);
    const { action, created } = ledger.propose({
      idempotencyKey, actionType: tool.actionType, tool: name, payload, why, autonomyLevel: level, opportunityId, urgent,
    });
    if (created && level === 'ask' && urgent) await presentApproval(action);
    return ledger.get(action.id);
  }

  async function flushPendingApprovals() {
    const pending = ledger.pendingUnsent();
    for (const action of pending) await presentApproval(action);
    return pending.length;
  }

  async function approve(actionId, { by = 'owner' } = {}) {
    const action = ledger.get(actionId);
    if (!action) throw new RegistryError(`Action not found: ${actionId}`);
    const ratio = measureEditRatio(action.originalDraft, String(action.payload.draft ?? ''));
    const approved = ledger.approve(actionId, { by, editRatio: ratio });
    const { promotionOffer } = gate.recordApproval(action.actionType, ratio);
    if (promotionOffer) await notifier.offerPromotion(promotionOffer);
    return approved;
  }

  async function reject(actionId, { reason = 'other' } = {}) {
    const rejected = ledger.reject(actionId, { reason });
    gate.recordRejection(rejected.actionType);
    return rejected;
  }

  async function revise(actionId, instruction) {
    const action = ledger.get(actionId);
    if (!action || action.status !== 'proposed') throw new RegistryError('Only actions waiting for approval can be edited.');
    const tool = toolFor(action);
    const payload = tool.revise
      ? await tool.revise(action.payload, instruction)
      : { ...action.payload, draft: String(instruction) };
    const revised = ledger.revise(actionId, payload);
    await presentApproval(revised);
    return ledger.get(actionId);
  }

  async function executeDue({ limit = 10 } = {}) {
    if (settings.get('os.paused')) return { executed: 0, paused: true };
    const retryMinutes = settings.get('executor.retry_minutes');
    let executed = 0;
    while (executed < limit) {
      const action = ledger.claimNextDue();
      if (!action) break;
      executed += 1;
      try {
        const tool = toolFor(action);
        const result = await tool.execute(action.payload, { action });
        ledger.markDone(action.id, result ?? {});
        if (action.autonomyLevel === 'tell') await notifier.tell(action, tool.describe(action.payload));
      } catch (error) {
        const message = String(error?.message ?? error);
        if (action.attempts <= retryMinutes.length) {
          const retryAt = new Date(now().getTime() + retryMinutes[action.attempts - 1] * 60_000).toISOString();
          ledger.markFailed(action.id, message, { retryAt });
        } else {
          ledger.markFailed(action.id, message);
          await notifier.alert(`${action.actionType} failed after ${action.attempts} attempts: ${message}`);
        }
      }
    }
    return { executed, paused: false };
  }

  return { register, describe, request, presentApproval, flushPendingApprovals, approve, reject, revise, executeDue };
}
