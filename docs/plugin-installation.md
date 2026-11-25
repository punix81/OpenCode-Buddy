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
3. Restart OpenCode: `opencode service restart`.

> The restart ends any running agent session. Do it when no session matters.

### Project-local (recommended for a first test)

```sh
node scripts/install-buddy-plugin.mjs --project /path/to/a/git/repository
```

It writes or updates `<project>/opencode.json`, keeps a timestamped backup, and refuses to touch a
file it cannot parse exactly. Nothing global is modified.

## 4. Verify

```sh
cd bridge
npm run live            # terminal 1: LIVE bridge
npm run diagnose:opencode   # terminal 2
```

Expected:

```
OK   opencode 2.4.1
OK   config /home/<you>/.config/opencode/opencode.json
OK   plugin configured: /…/plugin/opencode-buddy
OK   ipc directory /run/user/1000/opencode-buddy mode 0700
OK   IPC handshake accepted (token valid)
OK   device /dev/ttyACM0
```

Then start OpenCode normally and send a prompt. The bridge log must show
`opencode peer=N app=cli version=2.4.1`.

## 5. Uninstall

1. Remove the entry from `plugins` (global) or delete the project's `opencode.json` entry.
2. `opencode service restart`.
3. Stop the bridge. The socket and token disappear from the runtime directory; nothing else is
   written outside the repository.

## 6. What the plugin is allowed to do

It only reads. It never approves a permission, answers a form, runs a tool, sends a prompt or writes a
file. It forwards a fixed set of metadata fields and nothing else; see
`docs/opencode-v2-event-mapping.md` §4 for the ignored events.
