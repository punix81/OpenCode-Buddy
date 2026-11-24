# Protocol examples

Canonical messages for **ratified v1**. They are documentation and test fixtures, not captured
production traffic.

| File | Direction | Purpose |
| --- | --- | --- |
| `hello.json` | device → bridge | boot announcement, version list, boot counter |
| `ready.json` | bridge → device | negotiated major and bridge run identifier |
| `config.json` | bridge → device | preferences and gesture timings |
| `state.json` | bridge → device | complete snapshot with a thinking state |
| `mcp-status.json` | bridge → device | MCP summary using aliases and status classes |
| `heartbeat.json` | both | keep-alive with no payload |
| `ack.json` | both | acknowledgement of an applied peer sequence |
| `interaction.json` | device → bridge | double press returning to the Buddy screen |
| `resync.json` | device → bridge | request a full snapshot after a gap |
| `error.json` | both | sanitized protocol error |

Rules reflected by these examples: no prompts, responses, code, paths, tool arguments, real MCP names,
URLs or credentials. Aliases are stable within a bridge run. The device never receives
`connection.usb` or `versions.fw`: it owns those values locally.
