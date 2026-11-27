# Memory skill creates a missing root CLAUDE.md

Status: accepted (2026-11-27)

A host project without a root `CLAUDE.md` used to be sent to the built-in `/init`. The memory skill now creates the missing root itself: its script adds a separate `mode: root` brief, handled by a `memory-editor` of its own dispatched beside the target agents, and the other agents get `root: new` and keep build and test commands out of their nodes. This keeps the root short and bounded, which `/init` does not.

Rejected: sending the user to the built-in `/init` - it writes a far too large root file, which the `viber` root rules already had to guard against.

Consequences: an existing root is never edited by the plugin, only verified with suggestions, so once created the root drifts unless the user maintains it; the `setup` skill's hint for a missing root points to the memory skill and must change if this does.
