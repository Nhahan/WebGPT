---
name: webgpt
description: Use when the user requests WebGPT, including xh/xhigh or p/pro. Delegate tasks to the user's signed-in ChatGPT on the web, collect and verify results, and clean up task chats.
---

# WebGPT

Delegate to signed-in Web ChatGPT through documented, authorized browser controls.
For installation or missing capabilities, follow [setup.md](references/setup.md).

## Dispatch

- Verify the requested UI mode: `xh|xhigh` = Extra High (default), `p|pro` = Pro.
- Explain the objective, necessary context and success criteria naturally. Let WebGPT choose
  its tools and approach within the user's scope.
- For direct project work, use the WebGPT Worker terminal and
  [workspace.md](references/workspace.md). Set the project cwd; it is not a sandbox.
  Verify access before dispatch. Report missing access instead of silently doing the work yourself.
  Text-only tasks need no connector.
- Keep a private record sufficient to recover task IDs, owned chats/tabs, results and pending checks.
- Prepare mode, inputs and callback registration first. Fill and immediately submit the prompt
  in one browser call where supported, then verify submission before any retry.

## Collect

Prefer the worker's saved completion event and controller wait. Every **15 minutes**, check only
due unfinished chats as a backup; this is not a task timeout. Avoid polling between backup checks.
Waiting requires an active parent runtime; this skill supplies no after-exit wake-up or cron job.

Collect finished results promptly, including partial results on failure. Save evidence, inspect
actual changes and run relevant checks before acknowledgment. Report PASS/FAIL/NOT_RUN honestly;
a completion signal alone does not prove success. Preserve partial work and report a concrete
blocker if recovery cannot progress.

Immediately remove finished or abandoned tasks from periodic checks and cancel their pending
deadlines, regardless of cleanup status. Reconcile pending tasks after a context resume.

## Close

After preserving results and recording their verification status:

- Permanently delete the exact task chats and accept their matching dialogs, using the workflow's
  deletion authorization wherever tool policy permits. Ask only when action-time confirmation
  is actually required.
- Verify chat deletion, then close and verify removal of all task-owned tabs, including recovery
  duplicates. Closing a tab is not proof of deleting its chat.
- Preserve unrelated chats, tabs, user data and shared services. Never delete uncollected work.
- Perform cleanup without unnecessary delays or repeated observations. If blocked, retain exact
  chat/tab identifiers and report the remaining action; do not claim cleanup complete.
