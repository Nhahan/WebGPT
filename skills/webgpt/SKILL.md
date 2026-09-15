---
name: webgpt
description: Use when the user requests WebGPT, including xh/xhigh or p/pro. Delegate tasks to the user's signed-in ChatGPT on the web, collect and verify results, and clean up task chats.
---

# WebGPT

Delegate to signed-in Web ChatGPT through documented, authorized browser controls.
For installation or missing capabilities, follow [setup.md](references/setup.md).

The existing local Node.js worker, not an LLM, handles saved results, completion notification and
backup deadlines. Registration starts the deadline; completion/cancellation clears it automatically.
WebGPT only performs the assignment and submits its result. Do not ask it to report periodically,
start monitoring processes, or clean up chats. Codex receives the result and deletes the chat/tabs.
Reuse the worker and one quiet wait process; do not add per-task daemons or cron jobs.

## Dispatch

- Verify the requested UI mode: `xh|xhigh` = Extra High (default), `p|pro` = Pro.
- Send exactly one user message per task chat. Prepare the complete assignment before sending;
  never send follow-ups, corrections or continuation requests in that chat. If further work is
  needed, preserve and close the original task, then use a new chat with the necessary context.
- Explain the objective, necessary context and success criteria naturally. Let WebGPT choose
  its tools and approach within the user's scope. Put the assignment only in that chat message;
  do not duplicate it in registration files or generate task plans, ledgers or handoff documents
  unless needed for the actual deliverable. The worker already saves the result.
- For direct project work, use the WebGPT Worker terminal and
  [workspace.md](references/workspace.md). Set the project cwd; it is not a sandbox.
  Reuse verified setup; diagnose access only when unavailable or an actual call fails.
  Report missing access instead of silently doing the work yourself.
  Text-only tasks need no connector.
- Reuse registration output for the task ID; retain owned chat/tab identifiers in the current
  context. Do not create separate tracking files unless recovery genuinely requires one.
- Prepare mode, inputs and callback registration first. Fill and immediately submit the prompt
  in one browser call where supported, then verify submission before any retry.

Prefer targeted accessibility text for browser decisions. Use documented `emit:false` observations
and return only the relevant controls or outcome where supported. Do not emit screenshots,
full page trees or conversation exports unless text cannot resolve the next action; never echo
image/base64 payloads as text. Preserve required first-use documentation and tool permission gates.

## Collect

Use result acceptance, never continuous supervision. Delegate implementation and its relevant
tests together; request a concise result with changed files, check results, existing evidence paths and
remaining issues. Leave execution to WebGPT.

Wait for the saved completion event. Between events, do not inspect chats, screenshots, logs,
files or processes to track progress. Only when the worker returns `backupDue` (every **15 minutes**
for unfinished work), Codex makes one minimal chat-status check, not a progress audit or timeout.
The worker times the check; it does not read the browser. An explicit help/failure signal
or user intervention permits targeted handling, not continuous monitoring.
Keep empty wait renewals inside the runtime where supported; return to the model only for an
event, a due backup check or an actionable error. Do not narrate unchanged waiting.
Waiting requires an active parent runtime; this skill supplies no after-exit wake-up or cron job.

At completion, review the saved result once against the requested outcome. Reuse existing
evidence rather than creating duplicate reports; load only the summary, relevant diff and evidence,
not entire transcripts or logs. Distinguish PASS/FAIL/NOT_RUN; use the bundled collection command
to verify saved-result integrity and acknowledge receipt together.
Accept supported tests on the delivered version without rerunning them. Add only targeted checks
for failures, missing or conflicting evidence, subsequent integration changes, or an explicit
user/project requirement. Do not independently redo WebGPT's investigation or implementation.
A completion claim alone is not evidence. Resolve a concrete gap narrowly; otherwise acknowledge
and clean up. Preserve partial results and report blockers honestly.

The worker retires finished deadlines independently of Codex cleanup. Cancel abandoned tasks;
remove collected IDs from the next wait. Reconcile pending tasks after a context resume.

## Close

After preserving and accepting or rejecting the result (no separate report required):

- Permanently delete the exact task chats and accept their matching dialogs, using the workflow's
  deletion authorization wherever tool policy permits. Ask only when action-time confirmation
  is actually required.
- Verify chat deletion, then close and verify removal of all task-owned tabs, including recovery
  duplicates. Closing a tab is not proof of deleting its chat.
- Preserve unrelated chats, tabs, user data and shared services. Never delete uncollected work.
- Perform cleanup without unnecessary delays or repeated observations. If blocked, retain exact
  chat/tab identifiers and report the remaining action; do not claim cleanup complete.

For workflow smoke tests, use a trivial operation that executes in about one second, such as
printing a value. Do not assign development, research, or a test suite merely to test delegation.
Model, browser and network latency are separate and cannot be promised to finish in one second.
