# Dialog keys

The cursor row starts with `❯`. Move it with `UP` / `DOWN` until it sits on the wanted row, confirm on the printed screen, then press `ENTER`. Prefer arrows over digits: a digit acts at once on some rows and only moves the cursor on others.

## AskUserQuestion

- The header row (`←  ☐ Owoce  ☐ Miasto  ✔ Submit  →`) appears with two or more questions; `☒` marks an answered one. `TAB` / `RIGHT` goes to the next question, `LEFT` back.
- Single-select: cursor to the option, `ENTER`. With one question this submits at once.
- Multi-select (`[ ]` before each option): cursor to an option, `SPACE` toggles it to `[✔]`; when all are set, cursor to `Next` and `ENTER`, or `TAB`.
- Free answer: cursor to the `Type something` row, `type <session> <text>`, then `ENTER`.
- With several questions the last page is `Review your answers`: check every `→` line against what you chose, then `ENTER` on `1. Submit answers`. A wrong answer: `LEFT` back to its question and fix it.
- `Chat about this` and `ESC` abandon the dialog; never use them to answer.

## Plan approval (ExitPlanMode)

- Header: `Claude has written up a plan and is ready to execute. Would you like to proceed?`. The registry reports it as `waiting (permission prompt)`; `pending` shows `tool: ExitPlanMode` and the plan.
- Choose the row containing `clear context` and `bypass permissions` (usually 1). When the session runs without bypass and no such row exists, choose the first `Yes` row.
- To reject with feedback: cursor to `Tell Claude what to change`, `type` the feedback, `ENTER`.
- After approval with a cleared context the session may take a new name; keep using its pid.

## Permission prompt

- Header names the tool (`Bash command`) with the exact command, then `Do you want to proceed?`. Rows: `1. Yes`, sometimes `2. Yes, and don't ask again ...`, last `No`; a command matching an `ask` permission rule offers only `Yes` and `No`. `pending` shows the tool and its full input.
- Choose `Yes` for an action the goal needs; never `don't ask again`, it changes the session's permission rules. For an action outside the goal, ask the user.
- `No` interrupts the whole turn (`Interrupted · What should Claude do instead?`) and the session goes idle: follow it with `send` telling the session what to do instead.

## Permission mode

- The footer shows the mode (`accept edits on`, `plan mode on`, `manual mode on`, `bypass permissions on`). `SHIFT+TAB` cycles to the next one; press it once and read the footer before pressing again.
