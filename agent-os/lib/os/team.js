// Who may use the OTG-OS Telegram bot. The owner comes from TELEGRAM_OWNER_ID and can never be
// removed; only the owner can let new people in. Admins have the same approval rights as the owner.

const MAX_PENDING_REQUESTS = 5;

export function createTeam({ settings, ownerId, ownerName = 'Jack' }) {
  const owner = ownerId ? { id: ownerId, name: ownerName, role: 'owner' } : null;
  const stored = () => settings.get('team.members');

  function members() {
    return [...(owner ? [owner] : []), ...stored().filter((member) => member.id !== ownerId)];
  }

  function get(id) {
    return members().find((member) => member.id === id) ?? null;
  }

  function isMember(id) {
    return Boolean(get(id));
  }

  function isOwner(id) {
    return Boolean(owner) && id === ownerId;
  }

  function pendingRequests() {
    return settings.get('team.requests');
  }

  function requestAccess({ id, name }) {
    if (isMember(id)) return { status: 'already_member' };
    const requests = pendingRequests();
    if (requests.some((request) => request.id === id)) return { status: 'already_requested' };
    if (requests.length >= MAX_PENDING_REQUESTS) return { status: 'too_many_requests' };
    settings.set('team.requests', [...requests, { id, name: String(name || 'Unknown').slice(0, 60), requestedAt: new Date().toISOString() }]);
    return { status: 'requested' };
  }

  function takeRequest(id) {
    const requests = pendingRequests();
    const request = requests.find((item) => item.id === id);
    if (!request) throw new Error(`No access request from ${id}.`);
    settings.set('team.requests', requests.filter((item) => item.id !== id));
    return request;
  }

  function approveRequest(id) {
    const request = takeRequest(id);
    const member = { id: request.id, name: request.name, role: 'admin' };
    settings.set('team.members', [...stored().filter((item) => item.id !== id), member]);
    return member;
  }

  function denyRequest(id) {
    return takeRequest(id);
  }

  function removeMember(name) {
    const target = members().find((member) => member.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!target) throw new Error(`No team member named ${name}.`);
    if (target.role === 'owner') throw new Error('The owner cannot be removed.');
    settings.set('team.members', stored().filter((member) => member.id !== target.id));
    return target;
  }

  return { members, get, isMember, isOwner, pendingRequests, requestAccess, approveRequest, denyRequest, removeMember };
}
