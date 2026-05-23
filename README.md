# paperclip-plugin-hermes-bridge

Third-party Paperclip plugin that exposes Hermes Agent capabilities to Paperclip agents without changing Paperclip core, replacing agent files, or editing per-agent instructions.

This plugin is meant to be installed as a normal Paperclip plugin and then enabled per Paperclip instance/company like other third-party plugins.

## What it adds

Paperclip agents get these tools:

| Tool | Purpose |
| --- | --- |
| `hermes_status` | Check that the Paperclip worker can reach the Hermes CLI and list bridge config. |
| `hermes_delegate` | Run a bounded `hermes chat -q` task with optional skills/toolsets/model/provider/cwd. |
| `hermes_skill_improve` | Ask Hermes to create, review, or improve reusable Hermes skills from Paperclip work evidence. |
| `hermes_memory_record` | Ask Hermes to save only durable user/environment facts, rejecting stale task progress. |
| `hermes_session_recall` | Search prior Hermes sessions for context before asking the user to repeat themselves. |
| `hermes_quality_check` | Ask Hermes to review whether a Paperclip task is truly done: requirements, tests, safety, and verification. |

## Design boundaries

- Does not patch Paperclip source.
- Does not replace Paperclip agent files.
- Does not edit `AGENTS.md`, prompts, or company instruction files by default.
- Runs Hermes as an external CLI process through the Paperclip plugin SDK.
- Uses Hermes' own skills/memory/session-search tools instead of duplicating Hermes internals.
- Keeps the terminal toolset disabled by default unless explicitly enabled in plugin config.

## Requirements

- Paperclip with plugin support.
- Hermes Agent installed on the same machine as the Paperclip server.
- The Paperclip plugin worker must be able to find `hermes` on `PATH`, or configure `hermesCommand` as an absolute path.

Quick check on the Paperclip host:

```bash
hermes --version
hermes skills list
```

## Install into a Paperclip instance

### Option A: install from GitHub once pushed

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"github:OWNER/paperclip-plugin-hermes-bridge"}'
```

Replace `OWNER` with the GitHub owner.

### Option B: install from a local clone

```bash
git clone https://github.com/OWNER/paperclip-plugin-hermes-bridge.git
cd paperclip-plugin-hermes-bridge
npm pack
npm install -g ./paperclip-plugin-hermes-bridge-0.1.0.tgz
```

For local development on this Mac, the package can also live under:

```text
~/.paperclip/plugins/node_modules/paperclip-plugin-hermes-bridge
```

Then restart Paperclip or use Paperclip's plugin install/reload UI/API so the plugin loader marks it ready.

## Configuration

| Setting | Default | Notes |
| --- | --- | --- |
| `hermesCommand` | `hermes` | Use absolute path if Paperclip cannot find Hermes. |
| `defaultToolsets` | `skills,memory,session_search,file,terminal` | `terminal` is stripped unless `allowTerminalToolset` is true. |
| `defaultSkills` | `hermes-agent` | Skills preloaded for generic delegation. |
| `defaultCwd` | `$HOME` | Working directory for Hermes child processes. |
| `timeoutMs` | `300000` | 5 minutes per Hermes call. |
| `maxOutputBytes` | `120000` | Captured stdout/stderr limit per tool call. |
| `allowTerminalToolset` | `false` | Safety switch for letting generic delegates use terminal. |

## Example Paperclip usage

Ask a Paperclip manager/agent:

```text
Use hermes_quality_check on this issue before marking it done. Include the acceptance criteria and the test evidence.
```

Or:

```text
Use hermes_skill_improve to save the reusable workflow we discovered here, but do not save issue numbers or temporary progress.
```

Or:

```text
Use hermes_session_recall for "Omi OR Paperclip OR task intake" before asking me to repeat context.
```

## Security notes

- The plugin spawns `hermes` without a shell (`child_process.spawn(..., shell:false)`).
- Secrets should remain in Hermes/Paperclip environment files, not in plugin config.
- Memory writes are routed through Hermes with explicit instructions to reject stale task progress.
- Generic `hermes_delegate` strips `terminal` from toolsets unless `allowTerminalToolset` is enabled.

## Development

This package is intentionally plain ESM JavaScript; no build step is required yet.

```bash
node --check dist/manifest.js
node --check dist/worker.js
git status --short
```

## Roadmap

- Add event-driven hooks for Paperclip issue lifecycle events.
- Add optional UI contribution showing Hermes status and recent bridge calls.
- Add package tests with a mocked Paperclip plugin SDK and mocked Hermes CLI.
- Publish to npm once the API surface settles.

## License

MIT
