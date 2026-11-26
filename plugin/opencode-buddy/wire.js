// Wire-level bounds shared by the plugin. Extracted so the byte-based limits can
// be tested without a socket.

export const MAX_FRAME_BYTES = 8192;
export const MAX_SOCKET_BUFFER = 256 * 1024;

export function frameTooLarge(line, maxBytes = MAX_FRAME_BYTES) {
  return Buffer.byteLength(String(line), 'utf8') > maxBytes;
}

// Heartbeats and the hello are small and must always flow; an event that would
// grow the socket's internal buffer past the bound is dropped instead.
export function shouldDropForBackpressure(writableLength, type, maxBytes = MAX_SOCKET_BUFFER) {
  if (type === 'heartbeat' || type === 'hello') return false;
  return typeof writableLength === 'number' && writableLength > maxBytes;
}
