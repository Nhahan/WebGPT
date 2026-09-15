---
name: webgpt
description: Use when the user requests WebGPT, including xh/xhigh or p/pro. Delegate tasks to the user's signed-in ChatGPT on the web, collect and verify results, and clean up task chats.
---

# WebGPT

Delegate to signed-in Web ChatGPT through documented, authorized browser controls.
Read [setup.md](references/setup.md) only for an installation request or an observed missing
capability. Normal delegation reads workspace.md, not setup.md or the worker source.

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
- Prepare the complete prompt and registration before opening the task tab. Include its session
  name in tab creation instead of a separate naming call when supported.
- Batch tab creation, current-mode/composer observation, any grounded mode selection, prompt
  entry and submission as far as documented controls allow. If the requested mode is already
  visible, skip selection. Return to the model only for unknown controls, ambiguity or a required
  gate; do not force a single blind call. Never invent model URL parameters or assume a mode.
  Fill and send together, then verify submission before any retry.

For browser observations, use documented `getAXState({emit:false})` after actions as well as before
them; output only lines needed for the next decision. Do not call bare `getAXState()` or write the
whole returned string: either can reintroduce large automatic output. For example:
`nodeRepl.write((await tab.getAXState({emit:false})).split('\n').filter(line => /Delete|Cancel/.test(line)).join('\n'))`.
Choose the filter for the actual UI language and needed controls; expand only if it misses them.
Reuse a visibly correct mode instead of reopening its settings. Request images only when text
cannot resolve the next action. Preserve mandatory first-use output, fresh target grounding and
permission gates; never echo image/base64 payloads as text or export the conversation by default.

After required browser initialization, import the pure CUA helpers where supported:
`var {sendOnce, deleteAndClose} = await import('<installed-skill>/scripts/browser.mjs')`.
Use `sendOnce(tab, prompt, 'xh'|'pro')` on the new owned tab; after collection use
`deleteAndClose(tab, cua, browserId, ownedChatUrl, true)`. Pass `true` only when tool confirmation
policy is satisfied. Helpers return compact outcomes and stop on unknown controls; handle those
with grounded UI actions. Never resend an unconfirmed submission. If imports are unavailable,
use documented CUA directly. Do not reread helper source during normal use.

## Collect

Use result acceptance, never continuous supervision. Delegate implementation and its relevant
tests together; request a concise result with changed files, check results, existing evidence paths and
remaining issues. Leave execution to WebGPT.

Wait for the saved completion event. Between events, do not inspect chats, screenshots, logs,
files or processes to track progress. Only when the worker returns `backupDue` (every **20 minutes**
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
- Batch grounded menu/delete/dialog actions, deletion verification, tab closure and absence
  verification in one call when supported. Keep intermediate state checks inside that call and
  return only the final outcome. Pause only for a newly unknown control or required confirmation;
  never bypass those gates or close before deletion is verified.
- Preserve unrelated chats, tabs, user data and shared services. Never delete uncollected work.
- Perform cleanup without unnecessary delays or repeated observations. If blocked, retain exact
  chat/tab identifiers and report the remaining action; do not claim cleanup complete.

For workflow smoke tests, use a trivial operation that executes in about one second, such as
printing a value. Do not assign development, research, or a test suite merely to test delegation.
Model, browser and network latency are separate and cannot be promised to finish in one second.
