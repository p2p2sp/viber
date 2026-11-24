/*
 * switch-text.ts - prints the skill fragment matching one .claude/viber.yml
 * switch value, so a loaded skill holds only the instructions of the
 * configuration the project turned on. The entry holds no logic:
 * viber/lib/switch-text.ts selects, runSwitchText returns the stdout.
 *
 * It exists because a skill body branching on a switch makes the model read and
 * track the text of every feature the project turned off. Each switch-dependent
 * passage lives in its own fragment file, one per state that does something, and
 * the skill preloads it through this script at the place the text belongs. The
 * script only SELECTS the file; it never composes text. The value comes from
 * the config core, the one parser of viber.yml, so a fragment follows exactly
 * the value every other preload sees. Callers run it through the wrapper
 * switch-text.sh, which keeps its call line.
 *
 * A preload's output is never substituted by Claude Code, so the two root
 * placeholders a fragment may carry are expanded here: the skill directory is
 * handed in, and the plugin root is derived from it (a skill lives at
 * <plugin root>/skills/<name>).
 *
 * Contract:
 *   argv   : <key> <skill dir> <name>.
 *            key  : planning.adr | planning.outside-plan-review |
 *                   build.baseline-tests | build.final-review |
 *                   build.memory | build.rules | build.qa | build.cleanup |
 *                   build.red-check | github.issues
 *                   (value true | false, except build.baseline-tests: off |
 *                   fast | full) or
 *                   branching.mode (value off | allowed | required) - the
 *                   value the config block holds for it - or
 *                   build.extensions (value off | on, derived from two lines
 *                   of the config block: off when `build.extensions` and
 *                   `build.extensions-missing` both read none; otherwise on, so
 *                   a list of missing names alone never reads off).
 *                   A flat key (`memory`) is an unknown key.
 *            name : [a-z0-9-]+.
 *            A missing or empty argument, an unknown key or a name outside its
 *            pattern -> nothing printed.
 *   cwd    : any directory inside the host project - the config core resolves
 *            the repository root itself, so a session started in a subdirectory
 *            still reads the repository's config.
 *   env    : none.
 *   file   : <skill dir>/fragments/<name>.<value>.md (optional; absent or
 *            unreadable -> nothing printed).
 *   stdout : that file's content, every literal ${CLAUDE_SKILL_DIR} replaced by
 *            <skill dir> and every literal ${CLAUDE_PLUGIN_ROOT} by <skill dir>
 *            without its last two path segments (separator / or \, a trailing
 *            separator ignored). Nothing else, ever.
 *   exit   : 0. The core never throws.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runSwitchText } from "../lib/switch-text.ts";

process.stdout.write(runSwitchText(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand }));
