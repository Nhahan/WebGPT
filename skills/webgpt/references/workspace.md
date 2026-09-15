# Terminal and completion

WebGPT Worker exposes `exec_command`, `write_stdin`, `get_task`, `read_input`, and `submit_result`.
All file operations, Git, builds and tests use the terminal. No separate CRUD tools, command
allowlists, output truncation or command timeouts are supplied.

Commands inherit the worker user's OS access. The project is a default cwd, **not a sandbox**:
other files, credentials, network services and programs accessible to that user are accessible.
This does not grant root or bypass OS privacy approvals. Read-only instructions are behavioral,
not enforced restrictions. Never silently upgrade a file-only grant to shell access.

## Assign

Import `request` from installed `scripts/client.mjs`, or run
`node <skill>/scripts/client.mjs register <private-task.json>` with:

```json
{
  "instructions": "Implement the requested change and verify it. Preserve unrelated edits.",
  "terminal": { "cwd": "/absolute/project" }
}
```

Registration generates the ID automatically; optional `inputs` supplies named text.
Omit `terminal` for text-only work. Privately send the returned task token to WebGPT, never the
controller key or connection URL. Give natural objectives and constraints, not tool sequences.

- `get_task(token)` returns the assignment; `read_input(token,name)` returns supplied text.
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
A due backup check reads only enough to determine completion or a need for help.

Verify saved result SHA-256 and accept the handoff under SKILL.md's result-acceptance rules;
this does not require rerunning the worker's tests. Then `request('ack',{id})`, or run `node <skill>/scripts/client.mjs ack <returned-id>`; the CLI also accepts the legacy JSON payload file. After a due check,
use `request('checked',{id})` or `client.mjs checked <returned-id>`; abandoned tasks use `request('cancel',{id})` or `client.mjs cancel <returned-id>`. `ack`, `checked`, and `cancel` each accept exactly one task ID or one legacy JSON payload file. Terminal tasks are not
rescheduled. Ack/cancel revoke tokens; saved results survive restarts. Delete task chats and close
their tabs per SKILL.md. Preserve personal chats.

No computer-control backend is bundled. Use a separately installed, documented and authorized
capability only when verified available; terminal access alone does not prove computer control.
