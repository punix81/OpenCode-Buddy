// Ownership regression tests: the public event stream carries every project of
// the server, and this plugin must only accept its own location's events.
import assert from 'node:assert/strict';
import test from 'node:test';

import { eventOwnership } from './isolation.js';

const OWN = '/work/project-a';
const OTHER = '/work/project-b';
const S = 'ses_0f5c1a2b3c4d5e6f7a8b9c0d';

const known = (session) => session === S;

test('a foreign location is always rejected', () => {
  assert.equal(
    eventOwnership({ type: 'session.tool.called', location: { directory: OTHER }, data: { sessionID: S } }, OWN, known),
    false,
  );
});

test('a session event from the own location is accepted', () => {
  assert.equal(
    eventOwnership({ type: 'session.tool.called', location: { directory: OWN }, data: { sessionID: S } }, OWN, known),
    true,
  );
});

test('a location-less event is accepted only for a known session', () => {
  assert.equal(
    eventOwnership({ type: 'session.execution.started', data: { sessionID: S } }, OWN, known),
    true,
  );
  assert.equal(
    eventOwnership({ type: 'session.execution.started', data: { sessionID: 'ses_unknown' } }, OWN, known),
    false,
  );
});

test('session.created without a location can never establish ownership', () => {
  assert.equal(
    eventOwnership({ type: 'session.created', data: { sessionID: S } }, OWN, known),
    false,
  );
});

test('only allowlisted global events are accepted without a location', () => {
  assert.equal(eventOwnership({ type: 'mcp.status.changed', data: {} }, OWN, known), true);
  assert.equal(eventOwnership({ type: 'server.connected', data: {} }, OWN, known), false);
  assert.equal(eventOwnership({ type: 'some.future.event', data: {} }, OWN, known), false);
});

test('a form event follows the session it belongs to', () => {
  assert.equal(
    eventOwnership({ type: 'form.created', data: { form: { sessionID: S } } }, OWN, known),
    true,
  );
  assert.equal(
    eventOwnership({ type: 'form.created', data: { form: { sessionID: 'ses_other' } } }, OWN, known),
    false,
  );
});

test('a plugin without a location cannot claim located events', () => {
  assert.equal(
    eventOwnership({ type: 'session.tool.called', location: { directory: OWN }, data: { sessionID: S } }, null, known),
    false,
  );
});
