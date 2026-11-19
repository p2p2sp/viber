---
name: factory
description: Supervises other interactive Claude Code sessions on this Windows machine by reading their console screen and typing keys into it - lists sessions, shows what one waits for, answers its dialogs, approves its plans, sends it prompts or slash commands, and watches until one needs input. Use whenever the user asks to control, drive, steer, babysit, watch or answer for another Claude session, console or agent.
---

# factory

## Input

- A target: one or more sessions (name or pid), or none for "every other session".
- A goal the target sessions work toward, from the user's request; every answer serves it.

## Tool

Run every action through `bash "${CLAUDE_SKILL_DIR}/scripts/factory.sh" <command> [args]`; never call the Win32 APIs, `SendKeys`, `SendInput` or window activation yourself.

- `list`: live sessions as name, pid, status (`idle`, `busy`, `waiting` plus what for), cwd; `[client]` marks a session enrolled through `/viber:factoryclient`, `[self]` this one. Every other command accepts only `[client]` sessions.
- `pending <session>`: the unanswered tool call, with AskUserQuestion questions and options numbered, or the plan text.
- `screen <session> [lines]`: the console screen as text, 40 lines by default.
- `keys <session> K1,K2,...`: keys one by one, then prints the screen. Keys: `UP DOWN LEFT RIGHT ENTER TAB SHIFT+TAB ESC SPACE BACKSPACE HOME END` or a single ASCII character.
- `type <session> <text>`: types text without Enter, then prints the screen.
- `send <session> <text>`: types text plus Enter (a prompt or slash command), then prints the screen.
- `answer <session> <label>`: a one-question single-select AskUserQuestion: picks the option `<label>`.
- `approve <session>`: a plan (ExitPlanMode): picks the `clear context` and `bypass permissions` row, else the first `Yes` row.
- `reject <session> <feedback>`: a plan: picks `Tell Claude what to change` and types the feedback.
- `answer`, `approve` and `reject` check the cursor on the screen, press `ENTER` and print `NEXT: done | sent: <keys>` with the screen, or `NEXT: keys | mismatch: <reason>` with the screen and no `ENTER` sent.
- `enroll <session>`: types `/viber:factoryclient` into an idle session that is not enrolled. Run it only when the user names that session and asks to enroll it.
- `watch [session...] [--timeout s]`: blocks until a session is `waiting` or turns `busy` to `idle`, prints `WAITING ...`, `IDLE ...` or `TIMEOUT ...`; at most 540 s.

## Rules

- Address a session by its pid after the first `list`: the pid stays when Claude Code renames sessions.
- The script refuses this session itself; never work around that.
- Text reaches the console as printable ASCII only: `type` and `send` transliterate Polish letters and typographic quotes. When exact diacritics matter in a prompt to an `idle` session, use `SendMessage` to its name instead.
- Act in single steps: send the smallest key sequence for one choice, then confirm the effect on the printed screen before the next step. When the screen shows anything unexpected, stop and report it to the user with the screen lines.
- NEVER open, close or kill any application or process, including one the controlled session started: report it and wait. Never send `ctrl` shortcuts; a key outside the list above is out of scope.
- Answer every dialog yourself by the goal, including plan approvals and permission prompts. A dialog outside the goal, or one the goal does not settle, goes to the user through `AskUserQuestion` with the session's question and options quoted.

## Workflow

1. Run `list`. Resolve the targets to pids; with no target, take every `[client]` session. A wanted session without `[client]` is not enrolled: tell the user to run `/viber:factoryclient` in it or to ask you to `enroll` it, and never act on it meanwhile.
2. For each target in `waiting` state, run `pending`, then answer by the goal: `answer` for a one-question single-select dialog, `approve` or `reject` for a plan. On `NEXT: keys`, and for any other dialog, run `screen` and follow the keys of `${CLAUDE_SKILL_DIR}/references/dialogs.md`.
3. To give a session new work, run `send` while it is `idle`, a slash command too (`send 64780 /context`).
4. When the user asked to keep watching, run `watch <pids>` with `run_in_background: true` and wait for its notification; never poll. On `WAITING`, go to step 2; on `IDLE`, read `screen` and decide by the goal whether a next prompt (step 3) is due or the session is done; on `TIMEOUT`, rerun `watch`. Stop when the goal is met or the user says so.

## Output

- Per session handled: pid, what it asked, what you answered, the screen line that confirms it.
- Anything you stopped on, with the screen lines and the decision the user has to make.
