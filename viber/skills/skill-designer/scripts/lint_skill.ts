/*
 * lint_skill.ts - lints a skill directory (one holding SKILL.md) or a single agent or skill .md
 * file against the platform caps and the style rules of skill-designer. The entry holds no logic:
 * lib/lint_skill.ts reads the files and builds the lines.
 *
 * It exists because the caps and the style rules of the doctrine are mechanical, and a model that
 * checks them by reading misses some on every pass: one linter reports each break the same way, so
 * the author verifies a short list instead of rereading the doctrine. The skill and the lint job
 * run it through the wrapper lint_skill.sh, which keeps their call line.
 *
 * Contract:
 *   argv   : <skill-dir | file.md>. A directory lints its SKILL.md, every regular .md file below
 *            it (a link is neither read nor followed) and its scripts/ and references/. A file
 *            lints that file and nothing else, so an agent file never reports a sibling's breaks;
 *            a file named SKILL.md lints its directory, the same request as naming the directory.
 *            Absent or empty: the usage error.
 *   cwd    : irrelevant beyond resolving a relative argument: every path derives from argv and is
 *            printed as it was built from it.
 *   env    : none.
 *   reads  : the files named above, as UTF-8, a CR LF file like its LF copy; plus fragments/*.md
 *            beside the main file, for the reference pointers. Nothing is written.
 *   stdout : one `FAIL <path>: <text>` or `WARN <path>: <text>` line per break, then always the
 *            last line `FAIL=<n> WARN=<m>`. The main file first, then every .md file (a directory
 *            before the files after it in byte order), then scripts/, then references/.
 *            The main file (FAIL unless marked):
 *              no or unclosed YAML frontmatter; a missing `name:` or `description:`
 *              name over 64 characters, or not lower-case letters, digits and single hyphens
 *              name holding anthropic or claude (WARN)
 *              description over 1024 characters (WARN past 800), or holding `<` or `>`
 *              description under 15 or over 120 words, with no when-to-use cue (unless
 *                `user-invocable: false`), or written with I or you (all WARN)
 *              body over 500 lines (WARN past 400)
 *            Every .md file: an emoji, an em or en dash, a markdown table (FAIL); italics outside
 *            fences, code spans and call patterns, a CLAUDE.md read naming no foreign repository,
 *            more than five all-caps directives, a hedged phrase outside quotes, a caller
 *            narrative cue, `jq` or `bc` (WARN).
 *            scripts/ (no name opening with a dot, lint_skill.sh left out): `jq` or `bc`, and a
 *            .sh file this account may not execute (WARN; never on Windows, which keeps no exec
 *            bit).
 *            references/*.md: past 100 lines, no table of contents in the first 40 lines, or one
 *            that does not match the `##` headings both ways (WARN, FAIL past 300 lines); a file
 *            whose name neither the main file nor a fragment holds (WARN).
 *   stderr : the usage line when the exit is 2.
 *   exit   : 0 with no FAIL line, 1 with at least one (a missing SKILL.md or file included), 2 on
 *            a missing argument (stdout empty).
 */

import { nodeFs } from "./lib/adapters/fs.ts";
import { runLintSkill } from "./lib/lint_skill.ts";

const result = runLintSkill(process.argv.slice(2), { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
