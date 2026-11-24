# Protocol examples

Canonical messages for the draft v1 protocol. They are documentation and future test fixtures, not
captured production traffic.

| File | Direction | Purpose |
| --- | --- | --- |
| `hello.json` | device → bridge | boot announcement and version list |
| `state.json` | bridge → device | complete snapshot with a thinking state |
| `mcp-status.json` | bridge → device | MCP summary using aliases, including degraded statuses |
| `interaction.json` | device → bridge | double press returning to the Buddy screen |

Rules reflected by these examples: no prompts, responses, code, paths, tool arguments, real MCP names,
URLs or credentials. Aliases are stable per bridge run.
