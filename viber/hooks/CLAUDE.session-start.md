# viber/hooks - editing the session start hook

Read for a change to `session-start.sh`, `content/manifest.md` or `content/node-missing.md`: what the hook injects, where the banner goes and how it judges Node. The rules every hook shares (exit 0, fail open) stay in the node.

## Contracts

- `session-start.sh` puts `manifest.md` verbatim into `additionalContext`; wrapping markers or a preamble belong in `manifest.md`, never in the script. The banner `viber loaded <version>` goes in the top-level `systemMessage`, shown to the user and never to the model; `<version>` is the basename of `CLAUDE_PLUGIN_ROOT`, `dev` when unset. The schema note compares the column-0 `schema:` of the project's `.claude/viber.yml` (git top level of `cwd`, else `cwd`) with the template's.
- The Node check of `session-start.sh` reads `node -v` once: usable is `v22.18` or newer; no `node`, an older one or an output not shaped `v<major>.<minor>...` is no Node. Then the banner ends ` - Node.js 22.18 or newer is required, found <node -v output | none>` and `additionalContext` opens with `content/node-missing.md` (the text that makes every viber skill answer with one refusal line), a blank line, then the manifest; with no readable manifest the refusal text is injected alone, with no readable `node-missing.md` the note still prints and the manifest alone is injected. With a usable Node the output is unchanged.

## Change together

- The Node requirement: the banner note and `content/node-missing.md` carry the same `Node.js 22.18` as `README.md` and `../README.md` (`tools/lint/data/node-requirement.ts`).

## Traps

- `systemMessage` nested inside `hookSpecificOutput` is silently ignored by Claude Code: it must stay top-level.
- `resume` is excluded by the `hooks.json` matcher, not by `session-start.sh`; SessionStart never fires for subagents.
- `session-start.sh` runs on bash alone and calls `node` only to read its version: a missing Node is what it reports, so it must never need one.
