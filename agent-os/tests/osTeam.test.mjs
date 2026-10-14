import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createTeam } from '../lib/os/team.js';

function setup() {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  return { osDb, team: createTeam({ settings, ownerId: 42, ownerName: 'Jack' }) };
}

test('the owner is always a member', () => {
  const { osDb, team } = setup();
  assert.deepEqual(team.members(), [{ id: 42, name: 'Jack', role: 'owner' }]);
  assert.equal(team.isMember(42), true);
  assert.equal(team.isOwner(42), true);
  assert.equal(team.isMember(7), false);
  osDb.close();
});

test('an access request can be approved by the owner into an admin', () => {
  const { osDb, team } = setup();
  assert.deepEqual(team.requestAccess({ id: 7, name: 'Swope' }), { status: 'requested' });
  assert.deepEqual(team.requestAccess({ id: 7, name: 'Swope' }), { status: 'already_requested' });
  assert.deepEqual(team.pendingRequests().map((request) => request.id), [7]);
  const member = team.approveRequest(7);
  assert.deepEqual(member, { id: 7, name: 'Swope', role: 'admin' });
  assert.equal(team.isMember(7), true);
  assert.equal(team.isOwner(7), false);
  assert.deepEqual(team.pendingRequests(), []);
  assert.deepEqual(team.requestAccess({ id: 7, name: 'Swope' }), { status: 'already_member' });
  osDb.close();
});

test('denied requests are removed and members can be removed, but never the owner', () => {
  const { osDb, team } = setup();
  team.requestAccess({ id: 8, name: 'Stranger' });
  team.denyRequest(8);
  assert.deepEqual(team.pendingRequests(), []);
  assert.throws(() => team.approveRequest(8), /No access request/);
  team.requestAccess({ id: 7, name: 'Swope' });
  team.approveRequest(7);
  assert.equal(team.removeMember('swope').name, 'Swope');
  assert.equal(team.isMember(7), false);
  assert.throws(() => team.removeMember('Jack'), /owner cannot be removed/);
  osDb.close();
});

test('pending requests are capped so strangers cannot flood the owner', () => {
  const { osDb, team } = setup();
  for (let id = 100; id < 105; id += 1) assert.equal(team.requestAccess({ id, name: `u${id}` }).status, 'requested');
  assert.deepEqual(team.requestAccess({ id: 200, name: 'one too many' }), { status: 'too_many_requests' });
  osDb.close();
});
