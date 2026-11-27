# Memory editor decides where nodes go

Status: accepted (2026-11-27)

The user-invoked memory skill must verify, compress, complete or rewrite a host project's `CLAUDE.md` nodes without the weight the same skill had in `viber`. One `memory-editor` agent per target directory covers every node and section in it and below it, and decides by itself where a node is created (only for a directory that owns contracts of its own); the script computes no candidate directories. This keeps the skill to one script and one dispatch of parallel agents, like the `rules` skill.

Rejected: one agent per node over script-computed candidate directories, as in `viber` - it needs writer waves from the shallowest node down plus a reconcile pass, which was the main source of the old skill's weight.

Consequences: node placement depends on the agent's judgement, not a reproducible map, so two runs may place nodes differently, and nested targets need a rule assigning each node to the deepest target containing it.
