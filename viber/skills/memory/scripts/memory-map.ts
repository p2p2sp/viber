/*
 * memory-map.ts - maps the host project's CLAUDE.md cascade, and on --reset
 * deletes the nodes and sections it is handed. The entry holds no logic:
 * viber/lib/memory-map.ts does all of it, and the skill runs it through the
 * wrapper memory-map.sh, which keeps its call line.
 *
 * It is what the memory command loads before it decides anything: the routing,
 * the budgets and the uncommitted-work check are deterministic, so the model is
 * handed a map instead of walking the tree itself and guessing at sizes.
 *
 * Contract:
 *   argv   : none                       -> the map.
 *            --reset <path> [<path>...] -> delete those nodes and sections,
 *                                          all or none.
 *            --targets review|extend|both
 *            --targets reset --removed <path> [--removed <path>...]
 *                                       -> the target list of a mode, derived
 *                                          from the map (see "targets" below).
 *            any --targets call + --id <map id> --keep <node path>
 *            [--keep <node path>...]    -> the kept targets, briefed (see "keep"
 *                                          below).
 *            --reconcile --planned <node>,<node>,...
 *            [--fix <node> --files <path>,<path>,...]...
 *            [--create <node> --files <path>,<path>,...]...
 *            [--done <node> --files <path>,...|""]...
 *                                       -> the reconcile wave of the nodes the
 *                                          write waves left off (see
 *                                          "reconcile" below).
 *   cwd    : any directory inside the host project - the repository root is
 *            resolved here, every path printed is relative to it, and every
 *            path handed to --reset is read relative to it. Outside a
 *            repository the cwd IS the root and nothing is tracked there.
 *   env    : none.
 *   plugin root : every `<plugin root>` printed is the path the entry was
 *            started by cut three directories above its own, as text, with
 *            forward slashes: `C:/...` on Windows whichever spelling invoked the
 *            wrapper.
 *   writes : the deletions of a --reset that passed, never staged and never
 *            committed. Nothing in any other mode.
 *   stdout : map mode, in this order, one line each:
 *              # viber memory map
 *              id: 2026-09-22-17-06-39
 *              state: none | partial | complete
 *              node: docs/CLAUDE.md 4210 chain 11880 ok | OVER-NODE | OVER-CHAIN
 *              section: docs/CLAUDE.tests.md 3100 ok | OVER-NODE
 *              unlinked: docs/CLAUDE.tests.md
 *              orphan: docs/legacy/CLAUDE.md
 *              cand: src/api files 37 bytes 91204 toolchain | plain
 *              dirty: CLAUDE.md modified | untracked
 *              total: nodes 7
 *            --reset, one line per file deleted, a node followed by its
 *            sections, targets in the order given, then the count:
 *              removed: docs/CLAUDE.md
 *              removed: docs/CLAUDE.tests.md
 *              removed: 2
 *            or, when the call is refused and NOTHING was deleted:
 *              refused: docs/CLAUDE.md modified | untracked | not-a-node
 *            --targets, the target lines, fix lines first, then create lines,
 *            then the directive line:
 *              target: fix <node> <own> chain <chain> ok | OVER-NODE | OVER-CHAIN
 *              target: create <dir>/CLAUDE.md files <n> bytes <n> toolchain | plain
 *              target: create <dir>/CLAUDE.md unlinked <section path>
 *              target: create <dir>/CLAUDE.md removed
 *              target: create CLAUDE.md root
 *              NEXT: approve          (or NEXT: none alone, when no target line)
 *            --targets with --id and --keep, in place of the target lines:
 *              planned: <node>,<node>,...
 *              NEXT: memory-auditor   (one block per kept fix target)
 *              target: <node>
 *              scope: <the directory holding it, . for the root node>
 *              out: .temp/viber/<map id>/
 *              refs: <plugin root>/references
 *              shape: <file>: heading outside the template: <heading>
 *              shape: <file>: out of order: <heading>
 *              shape: <file>: empty heading: <heading>
 *              NEXT: none             (alone after planned:, when no kept target
 *                                      is a fix target)
 *            --reconcile, one block per off node of the deepest depth no --done
 *            flag names, or NEXT: none alone when no such node remains:
 *              NEXT: memory-node-writer | wave: <depth>
 *              mode: fix
 *              node: <node>
 *              findings: none
 *              planned: <the existing nodes, root first, then by depth>
 *              refs: <plugin root>/references
 *   exit   : map mode ALWAYS 0. It is a `!` preload, where a non-zero exit
 *            aborts the whole skill load, so a directory that is no repository
 *            at all is the empty map rather than an error.
 *            --reset: 0 once every target is deleted; 2 on unusable argv (no
 *            path, or an unknown first argument - usage on stderr, nothing
 *            printed on stdout); 3 when the call was refused.
 *            --targets: 0; 2 on unusable argv (an unknown mode, a --removed
 *            path outside reset, reset with no --removed path, --keep without
 *            --id, --id without --keep, any other argument) or a --keep path
 *            that is no target of the mode, with one "error: <reason>" line on
 *            stderr and nothing on stdout.
 *            --reconcile: 0; 2 on unusable argv (no --planned, --planned twice,
 *            a --files with no --fix, --create or --done before it, --files
 *            twice for one dispatch, any other argument), with one
 *            "error: <reason>" line on stderr and nothing on stdout.
 *
 * excluded - memory never maps a path below a directory whose name starts
 *            with ".", nor a file the host repository's own ignore rules
 *            (.gitignore, .git/info/exclude, core.excludesFile) exclude, even
 *            a tracked one: no line of any kind names one, none counts toward
 *            a candidate or an orphan, and --reset refuses one as not-a-node.
 *            A file whose own name starts with "." is mapped like any other.
 * id      - this run's stamp, which the caller spends as .temp/viber/<id>/.
 * state   - "none" when no CLAUDE.md is tracked anywhere, "complete" when a
 *           root node exists and every candidate directory carries its own
 *           node, "partial" otherwise.
 * node    - one line per tracked CLAUDE.md still present in the working tree,
 *           root first then depth order. The first count is the bytes of
 *           the file, "chain" that plus every ancestor node up to the root - what
 *           a reader loads by the time it reaches this one. OVER-NODE past
 *           4000 bytes for the root node CLAUDE.md, which every session
 *           loads first, and past 12000 bytes for every other node,
 *           OVER-CHAIN past 32000 on the chain, OVER-NODE
 *           winning when both hold. A node deleted but not yet committed -
 *           staged with `git rm` or plainly `rm`'d - is no node at all: no
 *           line here, no dirty line, not counted toward total or state, and
 *           its directory is a plain candidate again once it qualifies.
 * section - one line per tracked CLAUDE.<topic>.md still present, in the same
 *           order: a block of its node moved beside it, read on demand, so it
 *           never counts toward any chain. <topic> is lowercase letters,
 *           digits and hyphens; CLAUDE.local.md is the user's own auto-loaded
 *           file and never a section. OVER-NODE past 12000 bytes.
 * unlinked - a section no reader can reach: no node sits beside it, or the
 *            text of that node never names its file.
 * orphan  - a node with no other tracked file anywhere beneath its directory,
 *           its own sections not counted: it documents nothing.
 * cand    - a directory that deserves a node and has none: tracked, not
 *           excluded, and at depth 1 or 2 at least three
 *           tracked files beneath it. Deeper, it directly holds a build
 *           manifest (below), or at least twenty tracked files beneath it
 *           while it is no passthrough - a directory holding no file of its
 *           own and exactly one subdirectory, whose node would only repeat
 *           that subdirectory's. The deeper bar is higher because a deep tree
 *           carries many small directories a node would not pay for, and the
 *           map is read whole on every run. "toolchain" when it directly
 *           holds one of package.json, pyproject.toml, setup.py,
 *           requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle,
 *           build.gradle.kts, Gemfile, composer.json, mix.exs, pubspec.yaml,
 *           CMakeLists.txt, Makefile, or any *.csproj / *.sln; "plain"
 *           otherwise. "files" and "bytes" count every tracked file beneath it.
 * dirty   - one line per node or section the git index reports modified, or
 *           present in the tree and untracked. An untracked node or section
 *           is none anywhere else in the map: it is neither counted nor sized.
 *           One deleted but not yet committed carries no working-tree file
 *           either way, so it is absent rather than dirty - `--reset` alone
 *           still treats its uncommitted deletion as "modified" and refuses to
 *           touch it again.
 *
 * targets - what the memory command audits or writes, derived from the map as
 *           it stands, so --targets reset runs on the map taken after the
 *           deletion. review: one fix line per node line. extend: the create
 *           lines. both: the fix lines, then the create lines. reset: the
 *           create lines of candidates and of --removed paths alone.
 *           A create line is one of four forms, one line per directory and the
 *           first form to claim the directory keeping it: a candidate; the
 *           directory of an unlinked section with no node beside it; a
 *           directory a --removed node or section emptied (the root among
 *           them), none when a node still stands there; the repository root
 *           when no root node stands (extend and both only). A directory
 *           holding a section on a dirty line gets no create line.
 * keep    - the targets the user kept, each named by its node path (a fix
 *           target is a node line, a create target the CLAUDE.md of its
 *           directory). planned: is every node line of the map plus the node of
 *           every kept create target, root first then by depth. A kept fix
 *           target gets one memory-auditor block, in that order. Its shape lines
 *           are the form departures of the node and of each tracked section
 *           beside it, the node first and its sections alphabetically, within a
 *           file in line order, judged against the template list below: a
 *           ## heading outside it, a listed one followed later by one the list
 *           puts ahead of it, and one with nothing but blank lines before the
 *           next # or ## line (a ### line is content). A ## line inside a
 *           fenced block is no heading. The root node and the sections beside
 *           it are outside the template and get none. The list, in order:
 *           Terms, Relationships, Contracts, Commands, Change together, Traps,
 *           Sections - the last one only in a node, never in a section.
 *
 * reconcile - judges the nodes the write waves left off, from the tree as it
 *           stands: it reads the working tree alone (a node is there or not,
 *           tracked or not) and never the map. A --fix or --create dispatch is
 *           a write wave one that returned VERDICT: UPDATED, a --done one a
 *           reconcile dispatch that returned, any verdict; --files names the
 *           paths its return listed, only the CLAUDE.md among them counting.
 *           Each dispatch created every CLAUDE.md of its --files present in
 *           the tree that is its own node on --create or lies outside
 *           --planned, deleted every one absent from it, and wrote every one
 *           present. The existing nodes are the --planned paths present plus
 *           the present CLAUDE.md of a write wave --files outside --planned;
 *           the root is never off, and only an existing node is. An existing
 *           node a write wave dispatch wrote is off when the existing nodes
 *           below its directory differ from the --planned ones below it plus
 *           the ones that dispatch created; one no write wave dispatch wrote
 *           is off when any write wave dispatch created or deleted a node below
 *           its directory. A --done return never changes which nodes are off,
 *           judged from the tree as the write waves left it (a node a --done
 *           dispatch deleted counted, one it created not): it only keeps its
 *           node out of the next call, and planned: counts the nodes it
 *           created and drops the ones it deleted. The call prints the off nodes of the deepest
 *           depth no --done flag names, a block each; the depth of a node is
 *           the number of path segments of its directory, the root being 0.
 *
 * A kind of line with nothing to report prints none at all; "total:" always
 * prints, counting nodes only. --reset takes a node or a section; a node
 * takes every tracked section beside it along. It judges every file it would
 * delete before deleting the first one, so one modified or untracked file
 * leaves the whole cascade untouched - a user never loses half a layer.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runMemoryMap } from "../../../lib/memory-map.ts";

const result = runMemoryMap(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
