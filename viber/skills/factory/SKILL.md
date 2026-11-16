---
name: factory
description: Supervises other interactive Claude Code sessions running on this Windows machine by reading their console screen and typing keys into it without changing window focus - lists sessions with their status, shows what a session waits for, answers its AskUserQuestion dialogs, approves its plans, sends it prompts or slash commands, and watches sessions until one needs input. Use whenever the user asks to control, drive, steer, babysit, watch or answer for another Claude session, console, window or agent, to click an option or accept a plan in another session, to run a command there, or to keep other sessions moving toward a goal.
---

# factory

## Input

- A target: one or more sessions (name or pid), or none for "every other session".
- A goal the target sessions work toward, from the user's request. Every answer the factory gives serves this goal.

## Tool

Run every action through `bash "${CLAUDE_SKILL_DIR}/scripts/factory.sh" <command> [args]`; never call the Win32 APIs, `SendKeys`, `SendInput` or window activation yourself. Windows and `powershell.exe` only.

- `list`: live sessions as name, pid, status (`idle`, `busy`, `waiting` plus what it waits for), cwd; `[client]` marks a session enrolled through `/viber:factoryclient`, `[self]` this session. Every other command accepts only `[client]` sessions.
- `pending <session>`: the unanswered tool call from the transcript, with AskUserQuestion questions and options numbered, or the plan text.
- `screen <session> [lines]`: the console screen as text, last 40 lines by default.
- `keys <session> K1,K2,...`: keys one by one, 150 ms apart, then prints the screen. Keys: `UP DOWN LEFT RIGHT ENTER TAB SHIFT+TAB ESC SPACE BACKSPACE HOME END` or a single ASCII character.
- `type <session> <text>`: types text without Enter, then prints the screen.
- `send <session> <text>`: types text plus Enter (a prompt or a slash command), then prints the screen; newlines become spaces.
- `enroll <session>`: types `/viber:factoryclient` into an idle session that is not enrolled and waits up to 60 s for the enrollment. Run it only when the user names that session and asks to enroll it.
- `watch [session...] [--timeout s]`: blocks until a session is `waiting` or turns from `busy` to `idle`, prints `WAITING ...`, `IDLE ...` or `TIMEOUT ...`; default and maximum 540 s.

## Rules

- Address a session by its pid after the first `list`: Claude Code renames sessions on its own, the pid stays.
- The script refuses this session itself; never work around that, keys sent to yourself loop the session.
- Text reaches the console as printable ASCII only: `type` and `send` transliterate Polish letters and typographic quotes (`zolw "x"`). When exact diacritics matter in a prompt to an `idle` session, send it with `SendMessage` to the session name instead of `send`.
- Act in single steps: read the state, send the smallest key sequence for one choice, then read the screen the command printed and confirm the effect before the next step. When the screen shows anything you did not expect, stop and report it to the user with the screen lines.
- NEVER open, close or kill any application or process, including one the controlled session started (an editor, a browser): report it to the user and wait. Never send `ctrl` shortcuts; a key outside the list above is out of scope.
- Answer every dialog yourself by the goal, including plan approvals and permission prompts. A dialog outside the goal, or one whose right answer the goal does not settle, goes to the user through `AskUserQuestion` with the session's question and options quoted.

## Workflow

1. Run `list`. Resolve the targets to pids; with no target, take every `[client]` session. A wanted session without `[client]` is not enrolled: tell the user to run `/viber:factoryclient` in it or to ask you to `enroll` it, and never act on it meanwhile.
2. For each target in `waiting` state, run `pending` and `screen`, then answer the dialog: read `${CLAUDE_SKILL_DIR}/references/dialogs.md` for the keys of each dialog type.
3. To give a session new work, run `send` while it is `idle`; a slash command goes the same way (`send 64780 /context`).
4. When the user asked to keep watching, run `watch <pids>` with `run_in_background: true` and wait for its notification; never poll `list` or `screen` in a loop. On `WAITING`, go to step 2; on `IDLE`, read `screen`, decide by the goal whether the session needs a next prompt (step 3) or is done; on `TIMEOUT`, rerun `watch`. Stop watching when the goal is met or the user says so.

## Output

- Per session handled: pid, what it asked, what you answered, and the screen line that confirms it.
- Anything you stopped on, with the screen lines and the decision the user has to make.
