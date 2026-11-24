/*
 * config.ts - resolves the .claude/viber.yml switches into the block a skill
 * preloads when it loads, on the real file system and git adapters. The entry
 * holds no logic: viber/lib/config/ resolves, runConfig returns the stdout.
 *
 * It exists because a grep|sed YAML parser is a compound command, and Claude
 * Code asks for approval on every member of one - which stalls the step on any
 * permission mode that does not auto-accept everything. One script is ONE
 * command to the permission engine. It is also the only way `implementor` can
 * read the file at all: that skill's body forbids it to open a file. Callers
 * run it through the wrapper config.sh, which keeps its call line.
 *
 * The file is resolved against the REPOSITORY ROOT, not the caller's cwd: a `!`
 * preload runs wherever the session started, and a session started in a
 * subdirectory would otherwise find no file and fail open with every switch
 * false - silently turning off every layer the user configured.
 *
 * Every key lives INSIDE its group, and the group is the disambiguation: `runs`
 * on its own reads like a count and `memory` like anything, where
 * `directories.runs` and `build.memory` cannot be read as anything else, so a
 * key of that name outside its group is not this key and is ignored - a legacy
 * flat switch included, until /viber:setup moves it. A directory value is
 * sanitized because "docs/ is the one home for persisted knowledge" rests on
 * it: a slash, a traversal or an absolute path is a configuration error, so the
 * default stands and the run is unaffected.
 *
 * Contract:
 *   argv   : none -> the block below. `--branching` -> the branching report,
 *            `--red-check` -> the red-check report, `--questions` -> the
 *            questions-per-round report, `--specifications` -> the archive
 *            directory report (see their own stdout paragraphs) in place of the
 *            block. Anything else -> the block.
 *   cwd    : any directory inside the host project - the repository root is
 *            resolved here. Outside a repository, the cwd is the base.
 *   env    : none.
 *   file   : <repo root>/.claude/viber.yml (optional). No file -> every switch
 *            false, every other key at its default.
 *   keys   : A group is `<group>:` at column 0; its children are the indented
 *            key lines below it, the group ending at the next column-0 key (a
 *            blank line or a column-0 comment leaves it open). The first
 *            assignment of a child wins; a CR is never part of a value.
 *            planning.adr, planning.outside-plan-review,
 *            build.baseline-tests, build.final-review, build.memory,
 *            build.rules, build.qa, build.cleanup, build.red-check,
 *            github.issues - switches. A line of a key no longer in this list
 *            (planning.plain-plan-review, planning.fast-path) is never read and
 *            never printed.
 *            One is `true` ONLY as a child of its own group, spelled exactly
 *            (case-sensitive), whose value is `true` in any letter case (ended
 *            by a space, a comment or the end of the line). A column-0 key of
 *            the same name, the key under another group, or an absent key ->
 *            false.
 *            build.baseline-tests is the one three-valued switch, read the same
 *            group-bound way: `full` or `true` (any letter case) -> full, `fast`
 *            (any letter case) -> fast, `false`, any other value, an absent key,
 *            a column-0 key or the key under another group -> off.
 *            github.issue-title (default `{summary}`) and
 *            github.pr-title (default `[{issue-number}] {summary}`) - title
 *            patterns, children of `github:`. A value opening on a quote with its
 *            closing pair -> everything between the two, kept whole; otherwise
 *            cut at the first blank followed by `#`, trailing blanks dropped.
 *            Empty, a comment alone or absent -> the default.
 *            build.extensions - a map of agent entries, owned by the first
 *            `extensions:` key line among the indented lines of `build:`:
 *              build:
 *                extensions:          # empty or a comment after the colon
 *                  <name>:            # an entry
 *                    parallel: true   # an option of that entry
 *            A value after the key other than a comment -> no entry. Map lines
 *            run from the line after the key up to the first line that is
 *            neither blank nor a comment and is indented no deeper than the key
 *            (a column-0 line included); no map line is a child of `build:` for
 *            any other key. The first key line of the map sets the entry depth:
 *            a key line there is an entry named by its trimmed key, any inline
 *            value ignored; a deeper key line is an option of the entry above,
 *            a shallower one is ignored. `parallel` reading `true` in any letter
 *            case (cut at a blank or a `#`) makes the entry parallel; any other
 *            value, an absent option or another option key -> not parallel, and
 *            the first `parallel` of an entry wins. A name counts once, at its
 *            first entry, with that entry's option. A name matching
 *            `^[a-z0-9][a-z0-9-]*$` whose file <repo root>/.claude/agents/<name>.md
 *            exists is found; every other name (no such file, or an invalid
 *            name) is missing. A CR is never part of a key or a value. Absent,
 *            an empty map or a map outside `build:` -> no name.
 *            directories.runs (default `_specs`) and
 *            directories.specifications (default `specs`) - the directory names
 *            under docs/ holding the open runs and the archived ones. Read ONLY
 *            from inside the `directories:` group: `directories:` at column 0,
 *            its keys indented under it, the group ending at the next top-level
 *            key. A same-named key outside the group is ignored. The value is
 *            the first such assignment, cut at the first space or `#`, and must
 *            match `[A-Za-z0-9._-]+` and be neither `.` nor `..`; anything else
 *            -> the default, silently.
 *            tiers.min (default `haiku`) and tiers.max (default `opus`) - the
 *            model range implementor clamps its dispatches into. Read the same
 *            group-bound way; the value is one of haiku, sonnet, opus, fable (any
 *            case). The default max stays opus: fable is reached only when a
 *            project names it. Anything else -> that key's default; min above
 *            max -> both defaults.
 *            branching.mode (default `off`) - whether a run works on its own
 *            branch. Taken from the first line of the `--branching` report, so
 *            both read it by indentation: off, allowed or required (any case,
 *            printed lowercase), anything else -> off. The branch
 *            bases and name patterns live in `branching.work` entries, read by
 *            `--branching` alone.
 *            build.red-check-tests and build.red-check-links - lists, children
 *            of `build:` read the same group-bound way by `--red-check` alone.
 *            The value is cut at the first blank followed by `#` (a value
 *            opening on `#` is a comment alone); its entries are separated by
 *            blanks, no quoting. Empty, a comment alone or absent -> the
 *            default: tests `__tests__/ tests/ test/ *.Tests/ *.UnitTests/
 *            *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py
 *            *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/
 *            __fixtures__/ fixtures/ jest.config.* vitest.config.*`, links
 *            `node_modules`.
 *            planning.questions-per-round (default `5`) - how many decisions one
 *            round of the intent interview carries. A child of `planning:` read
 *            the same group-bound way by `--questions` alone; the value is cut at
 *            the first blank or `#`, case-sensitive, and valid when it matches
 *            `^([1-9]|10|all)$`. Empty, a comment alone, absent or any other
 *            value -> 5.
 *   file   : <repo root>/.claude/viber.local.yml (optional, the same layout and
 *            key grammar, personal and git-ignored; outside a repository
 *            .claude/viber.local.yml under the cwd). It overrides exactly five
 *            keys: tiers.min and tiers.max (haiku, sonnet, opus or fable, any
 *            case), build.baseline-tests (off, fast, full, true -> full,
 *            false -> off), github.issues (true or false) and
 *            planning.questions-per-round (1 to 10 or all, case-sensitive). A
 *            valid local value replaces that one key; an empty or invalid one
 *            leaves the shared value. The min-above-max reset runs on the
 *            merged range.
 *            Every other direct child of any group, and every column-0 key
 *            carrying a value, is ignored. A direct child is a key line at the
 *            indentation of the first key line inside its group; a deeper line
 *            is neither read nor named. The first assignment of a key wins, and
 *            a key is named once however often the file repeats it.
 *            `--branching` and `--red-check` never read this file; `--questions`
 *            reads it for its one key.
 *   stdout : a header line, then one `<group>.<key>: <true|false>` line per
 *            switch (`build.baseline-tests: <off|fast|full>`), one
 *            `github.<key>: <pattern>` line per title, the two extension lines,
 *            one `directories.<key>: <name>` line per directory key, one
 *            `tiers.<key>: <tier>` line per tier key and the
 *            `branching.mode: <mode>` line - dotted, so the block reads the
 *            way the file does - in a fixed order:
 *              # viber config (resolved)
 *              planning.adr: true
 *              planning.outside-plan-review: true
 *              build.baseline-tests: off
 *              build.final-review: true
 *              build.memory: true
 *              build.rules: true
 *              build.qa: false
 *              build.cleanup: true
 *              build.red-check: true
 *              github.issues: false
 *              github.issue-title: {summary}
 *              github.pr-title: [{issue-number}] {summary}
 *              build.extensions: <step>, <step> | none
 *              build.extensions-missing: <name>, <name> | none
 *              directories.runs: _specs
 *              directories.specifications: specs
 *              tiers.min: haiku
 *              tiers.max: opus
 *              branching.mode: off
 *            Missing names are dropped before the found ones are grouped, so a
 *            missing name never splits a run. A <step> is a run of consecutive
 *            found parallel entries joined by ` + `, or one found entry that is
 *            not parallel, alone (a parallel entry with no parallel neighbour is
 *            a step of one name). build.extensions holds the steps,
 *            build.extensions-missing the missing names, each in listed order
 *            joined by `, `, `none` when there is none. Example: `a` and `b`
 *            parallel, `c`, `d` parallel, `ghost` missing, `e` parallel ->
 *            `build.extensions: a + b, c, d + e` and
 *            `build.extensions-missing: ghost`.
 *            When the local file exists, one line follows the header:
 *              # local: <overridden> | ignored: <ignored>
 *            <overridden> is the keys that took a local value, in block order
 *            (planning.questions-per-round after tiers.max), joined by `, `
 *            (`none` when empty); <ignored> the ignored keys in file order (a
 *            group child as <group>.<key>, a column-0 key as <key>), joined by
 *            `, ` (`none` when empty). Every other line is unchanged. An
 *            unreadable local file reads as `none` twice.
 *   stdout (--branching): the `branching:` group read by indentation - its
 *            direct children are `mode`, `work` and `issue-type-mappings`; a
 *            child of `work` is one work entry, its own `base`, `name` and
 *            `target` fields below it; a child of `issue-type-mappings` maps an
 *            issue type to an entry key. Values are cut at the first space or
 *            `#`. Lines, in this order:
 *              mode: off|allowed|required
 *              entry: <key> | base: <branch> | name: <pattern> | target: <branch>
 *              map: <issue type> | <entry key>
 *              error: <reason>
 *            mode: off unless the direct child `mode` (a quoted key allowed)
 *            reads off, allowed or required in any case, printed lowercase; the
 *            block's branching.mode is this line. `entry:` once per valid work
 *            entry, `map:` once per mapping naming a valid entry, each in file
 *            order. Entry key `[A-Za-z0-9._-]+`; base and target
 *            `[A-Za-z0-9._/-]+`, not starting with `-` or `/`, no `..`; name
 *            with one surrounding quote pair stripped, `[A-Za-z0-9._/{}-]+`; an
 *            issue type with one surrounding quote pair stripped, kept verbatim.
 *            `error:` lines, in this order, zero or more:
 *              branching.base and branching.name are no longer read - move them into a branching.work entry
 *                (a `base:` or `name:` directly under `branching:`)
 *              work entry <key>: invalid key: <key>
 *              work entry <key>: missing <base|name|target>
 *              work entry <key>: invalid <base|name|target>: <value>
 *              work entry <key>: {issue} is now {issue-number}
 *                (each of these drops the entry; one entry may print several,
 *                its fields checked in base, name, target order)
 *              issue-type-mappings: <type> names no work entry: <key>
 *                (the mapping is dropped)
 *              no valid branching.work entry
 *                (a mode other than off only)
 *            No file or no group -> `mode: off` alone.
 *   stdout (--red-check): exactly two lines, each list's entries joined by one
 *            space:
 *              red-check.tests: <pattern> <pattern> ...
 *              red-check.links: <directory name> ...
 *            No file -> both defaults.
 *   stdout (--questions): exactly one line, `1` to `10` as written or `all`, `5`
 *            for any other value or none. A valid local value wins over the
 *            shared one. The no-argument block carries no line for the key; its
 *            `# local:` line names the key after tiers.max when a local value
 *            took, and under ignored when the local value was invalid.
 *   stdout (--specifications): exactly one line, the directories.specifications
 *            value resolved as for the block (default `specs`; an invalid value
 *            or the key outside the `directories:` group -> `specs`). Only the
 *            `directories:` group of the shared file is read.
 *   exit   : 0. The core never throws; every line of stdout ends by a newline.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runConfig } from "../lib/config/run.ts";

process.stdout.write(runConfig(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand }));
