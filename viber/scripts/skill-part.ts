/*
 * skill-part.ts - prints one part file of a skill, each switch fragment block in
 * it replaced by the fragment the switch-text core selects, so a skill loads a
 * long stretch of its instructions on demand instead of holding it in context
 * from the start. The entry holds no logic: viber/lib/skill-part.ts reads the
 * part, runSkillPart returns the answer.
 *
 * It exists because a `!` preload runs only when the skill loads, so text a
 * skill needs late (and sometimes never) was held in every turn before it. That
 * text lives in <skill dir>/parts/<part>.md, and the skill prints it with one
 * call when it reaches the step. A part keeps the fenced `switch-text.sh` calls
 * it would have carried as preloads; the core resolves them in place, in
 * process, so the part reaches the model exactly as the preloads would have
 * produced it. Only the call shape below is ever resolved: any other fenced
 * block is plain text, and no command of a part is ever run. Placeholders are
 * expanded here for the reason switch-text.ts states: nothing substitutes the
 * output of a command. Callers run it through the wrapper skill-part.sh, which
 * keeps its call line.
 *
 * Contract:
 *   argv   : <skill dir> <part>
 *            skill dir : the skill's directory as passed, never canonicalised.
 *            part      : [a-z0-9-]+.
 *            <plugin root> is <skill dir> without its last two path segments
 *            (separator / or \, a trailing separator ignored), as switch-text.ts
 *            derives it.
 *   cwd    : any directory inside the host project (the config core resolves
 *            the repository root from it); it also resolves a relative
 *            <skill dir>.
 *   env    : none.
 *   file   : <skill dir>/parts/<part>.md, read as UTF-8.
 *   stdout : that file's content, where every fenced block whose opening line is
 *            ```! and whose only body line is
 *            "${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" <key> "${CLAUDE_SKILL_DIR}" <name>
 *            is replaced, fence lines included, by what switch-text.ts prints
 *            for <key, quotes stripped> <skill dir> <name>;
 *            every other line verbatim; then every literal ${CLAUDE_SKILL_DIR}
 *            replaced by <skill dir> and every literal ${CLAUDE_PLUGIN_ROOT} by
 *            <plugin root>. A trailing carriage return is ignored when matching
 *            a line.
 *   stderr : error: <reason>, one line, on exit 1 only.
 *   exit   : 0 printed; 1 on a missing argument, a name outside its pattern or
 *            a part file that is absent, no regular file or unreadable, nothing
 *            on stdout.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runSkillPart } from "../lib/skill-part.ts";

const result = runSkillPart(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
