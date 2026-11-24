// merge-settings.ts - merges the bundled permissions template into the host
// project's .claude/settings.json key by key, idempotently. The entry holds no
// logic: viber/lib/merge-settings.ts does all of it, and the setup skill runs it
// through the wrapper merge-settings.sh, which keeps its call line and answers
// alone when no node is on PATH.
//
// Contract:
// Usage:
//   merge-settings.sh [--reset] <template> [<target>]
//
// --reset  (optional) - replace the target with the template instead of
//                       merging. An existing target is first copied to
//                       <root>/.temp/viber/setup/settings.json.bak (overwritten
//                       on every reset); a failed backup leaves the target
//                       untouched. A plain copy, staged in <target>.tmp and
//                       renamed over the target.
// template (required) - the bundled permissions template
//                       (viber/skills/setup/templates/settings.json).
// target   (optional) - the host settings file; defaults to
//                       .claude/settings.json at the repository root (the
//                       current dir outside a repository), so a run from a
//                       subdirectory never seeds a nested .claude/.
//
// A missing target (with or without --reset) is always created from the
// template by a plain copy.
//
// cwd: any directory inside the host project; a relative path argument resolves
// against it. env: none.
//
// Merge rules (applied only when the target already exists), walked recursively
// over every key of the template:
//   - a key the host lacks is added with the template's value.
//   - an object on both sides is merged key by key, at any depth.
//   - an array on both sides keeps the host's entries in the host's order;
//     template entries missing from it are appended at its end, each exactly
//     once. Arrays only ever gain entries.
//   - in permissions.allow, permissions.ask and permissions.deny a template
//     rule already covered by a host rule of the same list is not appended: a
//     bare `Tool` covers every `Tool(<specifier>)`, and a match-all specifier
//     (`*`, `**`, `**/*`) counts as bare, so a host carrying `Edit` never gains
//     `Edit(**/*)`, and the reverse. A narrower host rule (`Edit(src/**)`)
//     covers nothing broader, and a host rule is never removed.
//   - anything else (a scalar, or a type mismatch) takes the template's value
//     when it differs. The template wins because a project's own override
//     belongs in .claude/settings.local.json, which this merge never touches.
//   - the one removal: an entry the template carries in permissions.ask is
//     dropped from the host's permissions.deny. deny outranks ask, so a rule
//     the template moved from deny to ask would otherwise stay a hard block in
//     every project set up before the move.
//   - a key the template does not carry is never changed or removed.
//   - a semantically unchanged file is not rewritten at all, so a second run
//     leaves it byte-identical.
//   - the rewrite is atomic: the result is written to <target>.tmp and
//     renamed over the target.
//
// Output (stdout, exactly one line; a <message> says what could not be read,
// created or written, or quotes the JSON parse error):
//   settings.json: created from template
//   settings.json: reset from template (previous file saved to .temp/viber/setup/settings.json.bak)
//   settings.json: backup failed - left untouched (<message>)
//   settings.json: merged - added <k> keys, <e> list entries, updated <u> values, moved <d> deny to ask
//   settings.json: already up to date
//   settings.json: template missing at <path> - skipped
//   settings.json: not valid JSON - left untouched (<message>)
//   settings.json: unreadable - left untouched (<message>)
//   settings.json: write failed (<message>)
//
// Exit codes:
//   0 - merged, already up to date, created or reset
//   1 - template missing/unreadable, or a wrong argument count
//   2 - the target could not be read or parsed, the backup failed, or the
//       write failed

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runMergeSettings } from "../../../lib/merge-settings.ts";

const result = runMergeSettings(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
