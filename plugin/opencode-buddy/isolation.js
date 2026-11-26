// Ownership policy for the public OpenCode event stream.
//
// The server streams every project to every plugin instance. An event is only
// accepted when its envelope names this plugin's location, or when it belongs to
// a session this instance already owns. Events without a location are accepted
// only through an explicit allowlist; a session created elsewhere can never be
// claimed by guessing.

const GLOBAL_EVENTS = new Set(['mcp.status.changed']);

function sessionOf(event) {
  const data = event?.data;
  if (typeof data?.sessionID === 'string') return data.sessionID;
  if (typeof data?.form?.sessionID === 'string') return data.form.sessionID;
  return null;
}

export function eventOwnership(event, ownDirectory, ownsSession) {
  if (event === null || typeof event !== 'object') return false;
  const type = event.type;
  if (typeof type !== 'string') return false;
  const location = event?.location?.directory;

  if (typeof location === 'string' && location.length > 0) {
    return typeof ownDirectory === 'string' && ownDirectory.length > 0 && location === ownDirectory;
  }

  // No location: a session event is accepted only for a session already known
  // from this location, and session.created can never establish ownership.
  const session = sessionOf(event);
  if (session !== null) {
    if (type === 'session.created') return false;
    return typeof ownsSession === 'function' && ownsSession(session);
  }

  return GLOBAL_EVENTS.has(type);
}
