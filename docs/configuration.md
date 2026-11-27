# Configuration

Date: 2026-11-27. One JSON schema is shared by Linux and Windows. Unknown keys are rejected; an
invalid value is an error, never a silent default. No secret belongs in this file.

## 1. File location and precedence

1. `BUDDY_CONFIG` (explicit file) — highest.
2. An existing `config.local.json` in the current development directory.
3. Platform user configuration:
   - Linux: `$XDG_CONFIG_HOME/opencode-buddy/config.json` or
     `~/.config/opencode-buddy/config.json`;
   - Windows: `%APPDATA%\opencode-buddy\config.json`.

`bridge/config.example.json` is the reference example; copy it to the platform path, not into the
repository. The file is read at bridge start; restart the bridge after an edit.

## 2. Schema

| Key | Type / range | Default | Meaning |
| --- | --- | --- | --- |
| `port` | string or null | null | Explicit serial path (`COM7`, `/dev/ttyACM0`). Overrides auto-detection |
| `autoDetect` | boolean | true | Enumerate compatible Espressif devices |
| `deviceSerial` | string or null | null | Stable device selection when several are connected |
| `baudRate` | 9600–3 000 000 | 115200 | Serial baud (the native CDC ignores it; kept for compatibility) |
| `heartbeatMs` | 250–60 000 | 2000 | Bridge keep-alive interval |
| `linkTimeoutMs` | 500–120 000 | 6000 | Link timeout before degraded/offline |
| `stateIntervalMs` | 100–60 000 | 1000 | State pacing |
| `autoReturnSeconds` | 10–600 | 60 | Dashboard auto-return to Buddy |
| `reconnectDelaysMs` | non-empty array, 100–300 000 | 1000…15000 | Reconnect backoff |
| `logLevel` | error/warn/info/debug | info | Local log level |
| `allowRealMcpNames` | boolean | false | Send real MCP names instead of aliases (privacy opt-in) |
| `language` | null/en/fr/de | null | Host override; null = device-owned |
| `quietMode` | null/boolean | null | Host override; null = device-owned |
| `autoStart` | boolean | false | Installer/startup preference; the bridge does not register a service |
| `diagnostics` | boolean | false | Opt-in additional local diagnostics; never prompts/tool content |
| `mcpAliases` | object, ≤16 entries | {} | User-chosen aliases for named MCP servers |
| `source` | live/mock | live | LIVE is production; MOCK is explicitly simulated |

`mcpAliases` keys are bounded to 64 printable characters; values to 12; duplicates are rejected.
They apply only when `allowRealMcpNames` is false; the device still receives only aliases.

## 3. Device selection

1. `port` explicitly selects a path.
2. `deviceSerial` selects that Espressif candidate.
3. Exactly one compatible `303a:1001` candidate is selected.
4. Zero or multiple candidates produce an error listing serial/path candidates; set `deviceSerial`
   or `port`. There is no arbitrary first-device selection.

Discovery never opens unrelated serial ports and never flashes a discovered device. The firmware
hello confirms compatibility after the selected port is opened. See `docs/phase-6-architecture.md`.

## 4. Host overrides versus device preferences

The device owns language and quiet mode. The host sends an override only when the config value is
not null and the firmware advertises `config.partial`; a missing value never resets the device.
`autoReturnSeconds` is a host runtime setting within the protocol limits. Gestures remain the local
workflow and are unchanged.

## 5. Example

```json
{
  "autoDetect": true,
  "deviceSerial": "AA:BB:CC:DD:EE:FF",
  "logLevel": "info",
  "language": null,
  "quietMode": null,
  "autoStart": true,
  "diagnostics": false,
  "mcpAliases": { "filesystem": "FILES", "github": "GH" },
  "source": "live"
}
```

## 6. Errors

Startup fails with a message naming the key and the expected range, for example
`config: baudRate must be an integer between 9600 and 3000000` or
`config: unknown configuration key: telemetry`. A malformed file is reported with its path; its
content is never printed. The installer/management CLI must surface the same errors.
