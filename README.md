# WebGPT

<img width="871" height="40" alt="image" src="https://github.com/user-attachments/assets/97d758f5-4666-4d21-9cc0-68a3f0fbcc88" />

**Save your Codex quota.** A Codex skill that offloads work to ChatGPT on the web.

## Install

Paste this into Codex:

```text
Install https://github.com/Nhahan/WebGPT/tree/main/skills/webgpt
Follow the included references/setup.md and set up everything needed.
Handle installation, configuration and verification yourself; assume no setup knowledge.
I authorize the local worker and HTTPS forwarding, sharing its private connection
URL with my signed-in ChatGPT, and granting WebGPT full terminal access as my local
OS user for projects I assign (the project folder is not a sandbox).
Run the setup test, then permanently delete its test chats
and close its tabs. Do not ask again for these approved actions.
Ask only for sign-in or another action that genuinely requires me; continue afterward.
```

## Use

### Delegate with Codex — `xh` / `p`

Codex sends the task to WebGPT and collects the result. Tell Codex:

```text
Use webgpt xh as subagents to develop this project's planned features in parallel.
```

```text
webgpt p Research this topic and summarize the findings.
```

`xh` = Extra High · `p` = Pro.

### Use ChatGPT yourself — `open`

Open the current project:

```text
webgpt open
```

Or specify another project:

```text
webgpt open /path/to/project
```

Open a blank ChatGPT tab connected to your project's terminal. You start the conversation,
run the work and close the chat; Codex only sets up the connection.
Terminal access expires after 24 hours without use; each use resets the timer.
