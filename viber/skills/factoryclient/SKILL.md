---
name: factoryclient
description: Enrolls this Claude Code session as a client of the factory skill running in another session, so the factory may read this console and answer its dialogs. Use when the user runs /viber:factoryclient or asks to register, enroll or hand this session over to the factory.
disable-model-invocation: true
---

# factoryclient

1. Run `bash "${CLAUDE_SKILL_DIR}/scripts/enroll.sh"` and print its output line verbatim; on `ERROR`, print it and stop.
2. Work as usual afterwards. A factory session answers your dialogs through the keyboard, so ask every question that has options through `AskUserQuestion` rather than in prose: a dialog is what it can see and answer.
