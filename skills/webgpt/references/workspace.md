# Terminal and completion

WebGPT Worker exposes `exec_command`, `write_stdin`, `get_task`, `read_input`, and `submit_result`.
All file operations, Git, builds and tests use the terminal. No separate CRUD tools, command
allowlists, output truncation or command timeouts are supplied.

Commands inherit the worker user's OS access. The project is a default cwd, **not a sandbox**:
other files, credentials, network services and programs accessible to that user are accessible.
This does not grant root or bypass OS privacy approvals. Read-only instructions are behavioral,
not enforced restrictions. Never silently upgrade a file-only grant to shell access.

## Assign

For user-led `webgpt open`, use `node <skill>/scripts/client.mjs open /absolute/project` instead.
The path is optional and defaults to cwd. The command reuses an unexpired session for the canonical
project path and returns `reused`, `connectionName`, and a private `connectionUrl` when `publicOrigin`
is saved in config (`needsPublicOrigin` otherwise). Select the named connection in a blank chat;
create it only if missing. No per-open registration, setup scan or service restart is needed.
Reopening does not renew the lease; only terminal use does. Chats for the same live project share
that lease. Expired/cancelled URLs stay revoked; a fresh session gets a new URL and name.
Changing the forwarding origin also changes the name; do not repoint an old connection.
The URL is the session capability: keep it out of chat messages, screenshots and reports. No token
argument or bootstrap message is needed. Only `exec_command` and `write_stdin` are exposed;
the route binds the project and rejects other tools or explicit token arguments. Never repoint an
existing connection to another session: old chats must not gain access to the new project.
Terminal calls renew
its 24-hour idle lease; active commands prevent expiry. The worker checks expiry every minute and
on incoming calls/startup, persists the last-use time, and revokes expired tokens without touching
the user's chat or files. Tool discovery does not renew the lease. Expired URLs return 404;
the inactive plugin entry may remain in ChatGPT, but grants no access. Replies stay in ChatGPT.
Do not wait or collect. Existing token-based open sessions remain usable until they expire.

Run `node <skill>/scripts/client.mjs register --cwd /absolute/project`.
Registration generates the ID automatically. It needs no task document:
send only the actual assignment and task token in the single ChatGPT message. Completion submission
is already specified by the server instructions and tool description; do not repeat it in the prompt.
Do not prescribe routine terminal commands.
The worker also sets the backup deadline automatically; no extra timer setup or WebGPT reporting
is needed. Result submission/cancellation clears it, even before Codex collects or deletes anything.
The optional JSON-file/API form supports `instructions` and named `inputs` only when useful.
Omit `terminal` for text-only work. Privately send the returned task token to WebGPT, never the
controller key or connection URL. Give natural objectives and constraints, not tool sequences.

- `get_task(token)` returns registered context if needed; `read_input(token,name)` returns supplied text.
- `exec_command(token,command,cwd?,shell?,tty?,yield_ms?)` starts a command. `tty:true` enables a
  real PTY. Defaults to the assigned cwd and OS shell. Returns all available output, exit status,
  and a `session_id`. With `running:true`, the command continues between calls.
- `write_stdin(token,session_id,input?,signal?,yield_ms?)` reads new output, optionally sends input
  or SIGINT/SIGTERM/SIGKILL. HTTP calls yield within 25 seconds without stopping commands. No output
  is truncated. Sessions end on exit, task completion/cancellation or worker shutdown; they do not
  survive a worker restart.
- `submit_result(token,status,summary,result)` saves completed/failed/cancelled output and evidence,
  stops remaining task terminal sessions, and immediately removes its backup deadline. Identical
  submissions can be retried before acknowledgment. Never report unexecuted checks as passed.

There is no automatic undo or revision checking. Respect project rules and preserve others' work.
Tokens separate cooperative tasks, not hostile shell users. Do not expose this to untrusted users.

## Collect

Run `node <skill>/scripts/client.mjs wait <returned-id>` once.
For several assigned tasks, append their returned IDs to the same command.
No custom loop or extra JSON file is needed. IDs are internal bookkeeping, not user decisions.
It waits only for those tasks and renews empty HTTP responses internally without output.
It returns completion `events`, `backupDue`, recovery needs, or `settled:true` when no selected task
remains running; connection errors stop the wait. Remove collected IDs before the next wait.
Keep that process running in the host runtime without inspecting progress.
Unrelated saved events remain untouched. This is not a scheduler after Codex exits.
On `backupDue`, Codex reads only enough browser state to determine completion or a need for help.
The Node.js worker performs timing and notification without LLM calls; it does not inspect or
delete browser chats. Codex handles chat deletion and tab closure after result acceptance.

Review the result under SKILL.md, then run `node <skill>/scripts/client.mjs collect <returned-id>`.
This verifies the saved file hash and acknowledges receipt in one command, returning only summary
and artifact metadata. A mismatch fails without acknowledgment. It neither reruns tests nor
certifies correctness; keep using the existing result and evidence, not duplicate reports.
After a due backup check use `client.mjs checked <returned-id>`; abandon with
`client.mjs cancel <returned-id>`. Finished tasks are not rescheduled. Collection/cancellation
revokes tokens; saved results survive restarts. Delete task chats and close their tabs per SKILL.md.

No computer-control backend is bundled. Use a separately installed, documented and authorized
capability only when verified available; terminal access alone does not prove computer control.
