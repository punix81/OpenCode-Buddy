# Plugin installation

The Buddy needs one entry in your OpenCode configuration. The installer never rewrites that file:
it prints the exact change, and you apply it (or let it write a project-local config).

## 1. Prerequisites

| Requirement | Check |
| --- | --- |
| OpenCode 2.4.1 (plugin API 2.0.16) | `opencode --version` |
| Node 22+ for the bridge | `node --version` |
| `jq` optional | only for copy/paste of the snippet |
| Buddy device on USB | `lsusb \| grep 303a` |

## 2. Show the change

```sh
node scripts/install-buddy-plugin.mjs
```

It prints the plugin directory and the entry to add, for example:

```jsonc
{
  "plugins": [
    "@bit-ai/opencode",
    "/absolute/path/to/OpenCode-Buddy/plugin/opencode-buddy"
  ]
}
```

OpenCode merges `plugins` arrays from every configuration file (lowest to highest precedence), so
adding one entry never removes the others.

## 3. Apply it

### Global (all projects)

1. Back up the file:
   `cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak-$(date +%Y%m%d-%H%M%S)`
2. Add the entry to the existing `plugins` array (or to `"plugin"`, the legacy key that still works).
3. Restart only if the plugin does not appear: `opencode service restart`.

> A restart ends any running agent session. Do it when no session matters.
> On OpenCode 2.4.1 a **project-local** entry was picked up by the running server without a restart
> (§3.1). The global file has not been re-tested that way: if the bridge log shows no `opencode peer=`
> within about 20 s, restart the service.

### Project-local (recommended for a first test)

```sh
node scripts/install-buddy-plugin.mjs --project /path/to/a/git/repository
```

It writes or updates `<project>/opencode.json`, keeps a timestamped backup, and refuses to touch a
file it cannot parse exactly. Nothing global is modified. No restart was needed in the verified case
(§3.1): the running server loaded the entry and the plugin connected as soon as the bridge socket
existed.

### 3.1 Reload behaviour (verified)

Verified on 2026-11-26 with OpenCode 2.4.1 and a project-local `opencode.json` (local time, CET):

| Fact | Value |
| --- | --- |
| Server | `opencode serve --service`, same PID before and after |
| Config written | 09:11:56 |
| Plugin connected | 09:12:12 (`opencode peer=1`, `peer=2`) |
| Restart | none; the running agent session was not interrupted |

So a restart is not a prerequisite for adding a plugin entry to a project configuration on this
version. Three limits:

- The **global** configuration was not tested for hot reload; treat a restart as the reliable path.
- Adding an entry is not the same as removing one: a restart is still the way to make the server
  **unload** the plugin.
- The plugin reconnects with 1 s → 15 s backoff, so allow up to about 15 s after the bridge starts
  before concluding that nothing happened. A reconnection delay is not a missing configuration.

Evidence: `docs/evidence/phase-3-plugin-reload.md`.

## 4. Verify

```sh
cd bridge
npm run live            # terminal 1: LIVE bridge
npm run diagnose:opencode   # terminal 2
```

Expected for a **global** install:

```
OK   opencode 2.4.1
OK   config /home/<you>/.config/opencode/opencode.json
OK   plugin configured (global): /…/plugin/opencode-buddy
OK   ipc directory /run/user/1000/opencode-buddy mode 0700
OK   IPC handshake accepted (token valid)
OK   device /dev/ttyACM0
```

With a **project-local** install, the diagnostic finds the entry in the project file:

```text
OK   config /…/opencode.json
OK   plugin configured (project): /…/plugin/opencode-buddy
```

It reads the global file and every `opencode.json` / `opencode.jsonc` between the working directory and
the repository root, so `plugin configured (global)` and `plugin configured (project)` are both valid
results. Only when neither file contains the entry does it warn.

The authoritative proof remains the bridge log:

```
opencode peer=N app=cli version=2.4.1 plugin=opencode-buddy version=0.1.0
```

That line must appear within about 20 s of the bridge starting (15 s maximum backoff plus connection
time). For a project-local entry no restart is needed (§3.1); if the line never appears, restart
OpenCode once and retry.

## 5. Uninstall

1. Remove the entry from `plugins` (global) or delete the project's `opencode.json` entry.
2. Restart OpenCode so the server unloads the plugin: `opencode service restart`. Removal was not
   observed to hot-reload; the restart ends any running agent session.
3. Stop the bridge. The socket and token disappear from the runtime directory; nothing else is
   written outside the repository.

## 6. What the plugin is allowed to do

It only reads. It never approves a permission, answers a form, runs a tool, sends a prompt or writes a
file. It forwards a fixed set of metadata fields and nothing else; see
`docs/opencode-v2-event-mapping.md` §4 for the ignored events.
