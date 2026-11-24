/*
 * extension.ts - the facts and the one write the `extension` skill needs: which agents the host
 * project has, which of them carry the extension marker, what `build.extensions` lists, and the
 * registration of one more name. The entry holds no logic: viber/lib/extension.ts reads the files
 * and builds the lines.
 *
 * It exists because the skill must not parse `.claude/viber.yml` or read every agent file itself:
 * the list state comes from the config core, the one parser of that file, and the one insertion of
 * a map entry is a deterministic text change, so a model never rewrites the configuration by hand.
 * The skill runs it through the wrapper extension.sh, which keeps its call line.
 *
 * The file is resolved against the REPOSITORY ROOT, like the config: a session started in a
 * subdirectory still finds the project's own `.claude/`. Outside a repository the cwd is the base.
 *
 * Contract:
 *   argv   : none -> the report below. `--add <name>` -> register <name>. Anything else -> the
 *            report.
 *   cwd    : any directory inside the host project - the repository root is resolved here. Outside
 *            a repository, the cwd is the base.
 *   env    : none.
 *   file   : <root>/.claude/viber.yml (read; `--add` inserts two lines into its `extensions:` map),
 *            <root>/.claude/agents/*.md (read). No other file is read or written.
 *   stdout : no argument -> these lines, in this order:
 *              CONFIG=ok | no-config | stale
 *              LISTED=<name>, <name> | none
 *              MISSING=<name>, <name> | none
 *              AGENT=<name> | contract | plain
 *            CONFIG is `no-config` without a viber.yml, `stale` when the file has no `extensions:`
 *            key directly under `build:`, that key carries an inline value (`extensions: {}`) or
 *            the file cannot be read, else `ok`. LISTED is the `build.extensions` steps of the
 *            config with every ` + ` written as `, `: a plain list of the entries with an agent
 *            file in run order. MISSING is `build.extensions-missing`: the entries without one (or
 *            invalid), `none` when empty. AGENT is one line per .claude/agents/*.md, a name
 *            opening with a dot left out, sorted by name (byte order), the name being the file
 *            name without `.md`; `contract` when the file holds a line that is exactly
 *            `<!-- viber:extension -->` (trailing blanks allowed), else `plain`.
 *            `--add <name>` -> one line:
 *              STATUS=added | present | no-config | stale | invalid-name
 *            invalid-name: <name> does not match `^[a-z0-9][a-z0-9-]*$`. Then no-config, then stale
 *            (as CONFIG). present: the name is already an entry of the `extensions:` map, wherever
 *            its agent file stands and whatever its option - nothing is written. added: two lines
 *            go in after the last map line that is neither blank nor a comment (right after the
 *            `extensions:` line when the map holds none): the entry `<name>:` at the map's entry
 *            depth (the `extensions:` line's indentation plus two spaces for an empty map) and, two
 *            spaces deeper, `parallel: false`. Both lines end in CR LF when the `extensions:` line
 *            does; every other byte of the file, a comment on the `extensions:` line included,
 *            stays as it was. A file that cannot be written answers stale. Every refusal leaves
 *            every file untouched.
 *   exit   : ALWAYS 0 (a refusal is a STATUS= line; the caller reads stdout only).
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runExtension } from "../../../lib/extension.ts";

process.stdout.write(runExtension(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand }));
