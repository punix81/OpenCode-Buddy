import { ERROR_CODES, type McpStatusData, type StateData } from '../protocol/types.js';

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (cleaned.length === 0) return null;
  if (/https?:\/\//i.test(cleaned) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(cleaned) || /\b[A-Za-z0-9+/_-]{40,}\b/.test(cleaned)) {
    return '[redacted]';
  }
  return cleaned.slice(0, maxLength);
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// The firmware stores display strings in fixed byte arrays and composes only
// Latin-1 accents. A limit expressed in UTF-16 characters would let a multi-byte
// identifier pass the bridge and make the device reject the whole frame.
function displayText(value: string | null | undefined, maxBytes: number): string | null {
  const cleaned = cleanText(value, 4096);
  if (cleaned === null) return null;
  for (const character of cleaned) {
    if ((character.codePointAt(0) ?? 0) > 0xff) return null;
  }
  let out = '';
  let bytes = 0;
  for (const character of cleaned) {
    const size = character.charCodeAt(0) < 0x80 ? 1 : 2;
    if (bytes + size > maxBytes) break;
    out += character;
    bytes += size;
  }
  return out.length > 0 ? out : null;
}

// A token counter that v1 cannot represent is reported as unknown. Clamping it
// would claim a value the provider never produced; dropping the whole usage
// event would freeze every counter (V02).
function u32OrUnknown(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value < 0 || value > 0xffffffff) return null;
  return Math.trunc(value);
}

// Final outbound projection. It rebuilds the object field by field, so a value
// added upstream cannot reach the device without an explicit change here.
export class PrivacyFilter {
  projectState(input: StateData): StateData {
    const contextPct = input.tokens?.contextPct;
    const inputValue = input.tokens?.input;
    const outputValue = input.tokens?.output;
    const totalValue = input.tokens?.total;
    const state: StateData = {
      status: input.status,
      model: displayText(input.model, 40),
      agent: displayText(input.agent, 24),
      activeSessions: clamp(input.activeSessions, 0, 65535, 0),
      elapsedSeconds: clamp(input.elapsedSeconds, 0, 0xffffffff, 0),
      pendingPermissions: clamp(input.pendingPermissions, 0, 255, 0),
      pendingQuestions: clamp(input.pendingQuestions, 0, 255, 0),
      notifications: clamp(input.notifications, 0, 99, 0),
      retryAttempt: clamp(input.retryAttempt, 0, 255, 0),
      tokens: {
        input: u32OrUnknown(inputValue),
        output: u32OrUnknown(outputValue),
        // The protocol field is a uint32. When the wide sum exceeds it, omit the
        // field: the firmware derives total = input + output in 64-bit. An
        // unrepresentable operand also forces the total to be unknown rather
        // than letting a clamped operand contradict it.
        ...(totalValue !== null && totalValue !== undefined &&
        totalValue >= 0 && totalValue <= 0xffffffff &&
        (inputValue === null || inputValue === undefined ||
          (inputValue >= 0 && inputValue <= 0xffffffff)) &&
        (outputValue === null || outputValue === undefined ||
          (outputValue >= 0 && outputValue <= 0xffffffff))
          ? { total: Math.trunc(totalValue) }
          : {}),
        contextPct:
          contextPct === null || contextPct === undefined
            ? null
            : Math.min(100, Math.max(0, contextPct)),
      },
      tools: {
        success: clamp(input.tools?.success, 0, 0xffffffff, 0),
        failed: clamp(input.tools?.failed, 0, 0xffffffff, 0),
        running: clamp(input.tools?.running, 0, 255, 0),
        categories: {
          read: clamp(input.tools?.categories?.read, 0, 0xffffffff, 0),
          edit: clamp(input.tools?.categories?.edit, 0, 0xffffffff, 0),
          shell: clamp(input.tools?.categories?.shell, 0, 0xffffffff, 0),
          search: clamp(input.tools?.categories?.search, 0, 0xffffffff, 0),
          mcp: clamp(input.tools?.categories?.mcp, 0, 0xffffffff, 0),
          other: clamp(input.tools?.categories?.other, 0, 0xffffffff, 0),
        },
      },
      connection: {
        bridge: input.connection.bridge,
        opencode: input.connection.opencode,
      },
      versions: {
        bridge: displayText(input.versions.bridge, 16) ?? '--',
        protocol: clamp(input.versions.protocol, 1, 255, 1),
        ...(input.versions.opencode !== undefined
          ? { opencode: displayText(input.versions.opencode, 16) ?? '--' }
          : {}),
      },
      source: input.source,
    };

    if (input.mcp !== undefined) {
      state.mcp = {
        online: clamp(input.mcp.online, 0, 255, 0),
        total: clamp(input.mcp.total, 0, 255, 0),
      };
    }
    if (input.diagnostic !== undefined && ERROR_CODES.includes(input.diagnostic.code)) {
      state.diagnostic = { code: input.diagnostic.code };
    }
    return state;
  }

  projectMcp(input: McpStatusData): McpStatusData {
    return {
      online: clamp(input.online, 0, 255, 0),
      total: clamp(input.total, 0, 255, 0),
      source: input.source,
      servers: input.servers.slice(0, 8).map((server) => ({
        alias: displayText(server.alias, 12) ?? 'MCP',
        status: server.status,
      })),
    };
  }
}
