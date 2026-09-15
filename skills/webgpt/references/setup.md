# Setup

Install and verify a real browser-to-terminal connection. Honor the user's Install authorization;
ask only for genuinely user-only actions or mandatory action-time confirmations. Preserve unrelated
services, tabs and configuration. Do not delegate installation to WebGPT or substitute Chat On
Steroids, another connector or an API model for the bundled WebGPT Worker.

## Install and browser

Resolve the branch in the user's URL to a commit and install `skills/webgpt` at that commit using
Codex's skill installer. Do not replace `dev` with `main`. Record the revision privately. Preserve
customized installations unless replacement was requested. Before replacing scripts, stop only
the identified idle WebGPT worker; preserve data and credentials, and never stop active tasks.

Use Node.js 22+. Run `npm ci` and `npm test` inside the installed skill directory. Install missing
prerequisites from official sources. `node-pty` supplies the real PTY; if a prebuilt is unavailable,
install its documented native build prerequisites.

Discover browser tools, including deferred tools. Through documented APIs, inspect the user's
existing signed-in ChatGPT browser and open an owned tab there. Never create a fresh profile, copy
cookies or use private browser APIs. Verify Extra High (default) or the requested Pro mode. If
browser control is missing, configure the supported browser plugin. Ask only for the missing
sign-in/extension approval, not navigation or commands you can perform yourself.

## Worker

Read [workspace.md](workspace.md). This version grants full terminal access as the OS user, not
file-only access. A project cwd is not a sandbox. The README Install prompt authorizes this change;
never silently convert an old file-only grant.

Worker and client share optional `~/.config/webgpt/config.json`:

```json
{
  "dataDir": "/absolute/private/webgpt-data",
  "mcpPort": 43137,
  "controlPort": 43139,
  "publicMcp": true
}
```

Defaults: `~/.local/share/webgpt`, ports 43137/43139, `publicMcp:false`. Use actual OS paths.
`WEBGPT_CONFIG` selects another config; `WEBGPT_DATA_DIR` overrides dataDir. Keep config/data outside
projects and the installed skill. Protect data with POSIX mode 0700 or private Windows ACLs.
Never print keys, tokens or credentials.

Check port ownership; do not displace another process. Start
`node <installed-skill>/scripts/worker.mjs`; verify ready output, MCP `/health`, and
`node <installed-skill>/scripts/client.mjs status`. Use the OS service manager for persistence
after Codex exits and record the owned service. Keep the same data directory. Before recovering
`worker.lock/owner.json`, verify its host/PID is no longer using that directory.

## ChatGPT connection

Reuse the verified **WebGPT Worker** HTTPS connection and configuration. Inspect its URL and live
tool schemas, not just its name. No OpenAI Platform login, API key, organization role or Secure
MCP Tunnel account is needed.

1. Set `publicMcp:true` before forwarding. The worker creates private `mcp-path.key`; MCP is served
   only at `/mcp/<key>`. Verify plain `/mcp`, wrong routes and invalid task tokens are rejected.
2. Reuse authorized HTTPS forwarding or install official `cloudflared` and run
   `cloudflared tunnel --url http://127.0.0.1:43137` with the configured MCP port. Quick Tunnels need
   no account. Preserve other tunnel configs. Keep the owned tunnel alive with the OS service
   manager. Never forward the controller or project directory.
3. In ChatGPT Plugins, configure **WebGPT Worker** with Connection: URL, the HTTPS origin plus
   `/mcp/<key>`, and no OAuth. Privately read the URL into the form, never prompts/screenshots/logs.
   The URL is a bearer capability plus task-token authentication. Cloudflare terminates HTTPS;
   authorization and mandatory security confirmations must cover the exposed terminal access.
4. Refresh discovery and verify `exec_command`, `write_stdin`, `get_task`, `read_input`,
   `submit_result`, with no old CRUD tools. If the UI cannot update a connection, verify a
   replacement before removing only the obsolete WebGPT registration. Preserve other plugins.

Quick Tunnel origins change after restart: compare the live origin and update the connection.
Do not promise permanent URLs or automatic reconnection. Rotate a leaked route key while the owned
worker is stopped. No paid account or public plugin publication is needed.

## End-to-end test

Register access to an owned temporary project. In one Extra High or Pro message, ask WebGPT to
use **WebGPT Worker** to print a short value through the terminal and submit its result.
The command should execute in about one second; model/browser latency is separate.
Do not assign development, multiple file operations or interactive exercises to this smoke test.

Verify the saved command output/exit status, result/hash, callback and empty backup
deadline. Acknowledge the result. Save evidence, permanently delete the owned test chat and close
all its task tabs per SKILL.md, respecting tool confirmations. Cancel abandoned tasks. A local
test or another connector's successful command does not establish installation success.

Save a compact private setup note with installed path/revision, config path, owned worker/tunnel
services, connection name, browser/mode and PASS/FAIL/NOT_RUN evidence, without credentials.
On interruption, record the exact next action and resume the same installation. Reuse verified
setup during normal work; report the concrete blocker instead of claiming partial setup is ready.
