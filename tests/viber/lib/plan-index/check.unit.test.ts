/*
 * check.unit.test.ts - the plan contract as a whole: every defect of the task
 * blocks, of the dependency graph, of the criteria and of the contract files, as
 * the exact FIX: and SPLIT: lines and all of them in one run; what is no defect;
 * and the checks a plan that already landed is spared. The command of a
 * Verification is verification.unit.test.ts, the defects of a single line
 * read.unit.test.ts. The Open items section is checked here against the tasks:
 * an item names a task of the plan or the plan, and a task holds at most 3 notes.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { CONTRACT, planBody, type TaskFields } from "../../plan-body.ts";
import { answerOf, indexOf, refused, type Scene } from "./scene.ts";

/** A contract block whose shape lives in a file: the task holding that path is its writer. */
const owned = (file: string): string[] => ["### C1 - Login endpoint", "", `File: ${file}`, "", "POST /login -> 200 | 401"];
const NO_FILE = ["### C1 - Login endpoint", "", "POST /login -> 200 | 401"];
const one = (task: TaskFields, contracts?: string[]): string => planBody([{ id: "T1", ...task }], 1, contracts);
const two = (first: TaskFields, second: TaskFields, contracts?: string[]): string => planBody([{ id: "T1", ...first }, { id: "T2", ...second }], 1, contracts);

/** The plan with these lines as its Open items section, above the Tasks heading. */
const withOpen = (plan: string, ...items: string[]): string => plan.replace("## Tasks\n", ["## Open items", "", ...items, "", "## Tasks", ""].join("\n"));
const notes = (count: number): string[] => Array.from({ length: count }, (_, k) => `- note | T1 | note ${k + 1}`);

const MISPLACED = ["<!-- TASK -->", "### T0 - Misplaced", "- TDD: required", "- Covers: AC1", "- Uses: none", "- Depends-on: none", "- Files: src/m.ts", "- Delivers: x", "- Verification: npm test", "- DoD: it works", "<!-- /TASK -->", "", ""].join("\n");

/** A defect a plan is refused for at any time, landed or not. */
const ALWAYS: Array<[string, string, string[]]> = [
  ["a repeated id", two({ files: "src/a.ts" }, { id: "T1", files: "src/b.ts" }), ["FIX: duplicate task id: T1"]],
  ["an id that is no bare token", one({ id: "T 1/x" }), ['FIX: task id "T 1/x": letters, digits, "-" and "_" only - it names the task file']],
  ["a criterion the plan does not hold", one({ covers: "AC1, AC9" }), ["FIX: task T1: Covers AC9, absent from acceptance criteria"]],
  ["a Covers naming no criterion", one({ covers: "#1" }), ["FIX: task T1: Covers references no acceptance criterion", "FIX: acceptance criterion AC1 is covered by no task"]],
  ["no Uses line", one({ uses: null }, []), ['FIX: task T1: missing Uses - name its contract blocks, or "none"']],
  ["a contract block the plan does not hold", one({ uses: "C1, C9" }), ["FIX: task T1: Uses C9, no such contract block"]],
  ["a glob in Files", one({ files: "src/*.ts" }), ['FIX: task T1: Files entry "src/*.ts" is a glob, list exact paths']],
  ["a character class inside a segment of a Files entry", one({ files: "src/a[bc].ts" }), ['FIX: task T1: Files entry "src/a[bc].ts" is a glob, list exact paths']],
  ["an absolute path in Files", one({ files: "/abs/a.ts" }), ['FIX: task T1: Files entry "/abs/a.ts" must be repo-relative']],
  ["a directory in Files", one({ files: "src/" }), ['FIX: task T1: Files entry "src/" is a directory, list each file']],
  ["an annotation in Files", one({ files: "src/a.ts (new)" }), ['FIX: task T1: Files entry "src/a.ts (new)" is not a bare path, drop the annotation']],
  ["a backticked path in Files", one({ files: "`src/a.ts`" }), ['FIX: task T1: Files entry "`src/a.ts`" is not a bare path, drop the quoting']],
  ["a quoted path in Files", one({ files: '"src/a.ts"' }), ['FIX: task T1: Files entry ""src/a.ts"" is not a bare path, drop the quoting']],
  ["an empty entry in Files", one({ files: "src/a.ts," }), ["FIX: task T1: empty entry in Files"]],
  ["a TDD value that is neither required nor none", one({ tdd: "maybe" }), ['FIX: task T1: TDD must be "required" or "none", got: "maybe"']],
  ["an Exclusive value other than true", one({ exclusive: "false" }), ['FIX: task T1: Exclusive must be "true" or the line left out, got: "false"']],
  ["a Hard line with no reason", one({ hard: "" }), ["FIX: task T1: Hard needs its reason, or the line left out"]],
  ["a Repro path outside the task's Files", one({ tdd: "none", repro: "test/other.test.ts" }), ['FIX: task T1: Repro "test/other.test.ts" must be one path of its own Files']],
  ["a Repro on a TDD: required task", one({ repro: "src/a.ts" }), ['FIX: task T1: Repro needs "TDD: none" - the reproduction test is already RED']],
  ["a dependency on a later task", two({ deps: "T2", files: "src/a.ts" }, { files: "src/b.ts" }), ["FIX: task T1: Depends-on T2 must reference an earlier task"]],
  ["two tasks sharing a file with no dependency path between them", two({ files: "src/a.ts" }, { files: "src/a.ts" }), ["FIX: tasks T1 and T2 both list src/a.ts, with no dependency path between them"]],
  ["two contract blocks sharing an id", one({}, [...CONTRACT, "", "### C1 - Again", "", "File: none"]), ["FIX: duplicate contract id: C1"]],
  ["a criterion no task covers", planBody([{ id: "T1", covers: "AC1 (see S2)" }]), ["FIX: acceptance criterion AC2 is covered by no task"]],
  ["a contract block no task uses", one({ uses: "none" }), ["FIX: contract C1 is used by no task"]],
  ["a contract block without File beside one that has it", one({ uses: "C1, C2" }, [...owned("src/a.ts"), "", "### C2 - Cookie", "", "Set-Cookie: sid"]), ['FIX: contract C2: missing File - name the paths the shape is declared in, or "none"']],
  ["a contract file nothing creates", one({}, owned("src/session.ts")), ["FIX: contract C1 declares src/session.ts, which no task creates - put it in the Files of the task that writes the shape"]],
  ["a contract file whose holders never name the block", two({ uses: "none", files: "src/login.ts" }, { uses: "C1", deps: "T1", files: "src/b.ts" }, owned("src/login.ts")), ["FIX: contract C1 declares src/login.ts, held by T1, but no holder names C1 in Uses - its writer would never see the shape"]],
  ...["src/*.ts", "src/", "/abs/login.ts", "src/a[bc].ts"].map((entry): [string, string, string[]] => [`the contract File entry ${entry}`, one({}, owned(entry)), [`FIX: contract C1: File entry "${entry}" must be one bare repo-relative file path`]]),
  ["an open item naming no task of the plan", withOpen(one({}), "- note | T9 | name the cap", "- critical | plan | still open", "- critical | T8 | wrong"), ["FIX: open items: T9 names no task of the plan (Open items)", "FIX: open items: T8 names no task of the plan (Open items)"]],
  ["a task holding more than 3 notes", withOpen(one({}), ...notes(4), "- critical | T1 | counts as no note", "- note | plan | nor does this"), ["FIX: open items: task T1 holds 4 notes, past 3 (Open items)"]],
  ["a block above the Tasks heading", one({}).replace("## Goal\n", `## Goal\n\n${MISPLACED}`), ['FIX: task T0: <!-- TASK --> block sits above the "## Tasks" heading']],
];
for (const [label, plan, lines] of ALWAYS) {
  test(`${label} is refused, on a landed plan too`, () => {
    assert.deepEqual(answerOf(indexOf(plan, [], { status: ["done: none"] })), refused(4, ...lines));
  });
}

const files = (count: number): string => Array.from({ length: count }, (_, k) => `src/f${k + 1}.ts`).join(", ");
/** The clauses as one DoD value, with an empty one the count skips. */
const clauses = (count: number): string => [...Array.from({ length: count }, (_, k) => `case ${k + 1} holds`), " "].join("; ");
const past = (count: number, most: number, tdd: string): string => `SPLIT: task T1: ${count} DoD clauses, past the ${most} a TDD: ${tdd} task may hold - split it, one behaviour per task; clauses are cut at each semicolon outside backticks, so a semicolon inside a list cuts a clause`;
const withMap = (body: string, ...entries: string[]): string => ["---", "source: .temp/plan.md", "attachments:", ...entries, "---", body].join("\n");
const badName = (name: string): string => `FIX: attachments: name "${name}" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)`;
const reads = (writer: string): string => `FIX: task T2 reads src/login.ts, listed by ${writer}, but has no dependency path to ${writer} - add ${writer} to its Depends-on`;
const readAfter = (reader: TaskFields): string => two({ files: "src/login.ts" }, { uses: "none", files: "src/reject.ts", ...reader });
const FORWARD = "FIX: task T1 reads src/new.ts, which only the later task T2 creates - move the reading after T2 (Read after)";
/** T2 and T3 list src/new.ts, so only later tasks create what T1 reads. */
const forward = (reader: TaskFields): string =>
  planBody([{ id: "T1", files: "src/reject.ts", ...reader }, { id: "T2", uses: "none", files: "src/new.ts" }, { id: "T3", uses: "none", deps: "T2", files: "src/new.ts" }], 1);
const TWO_BLOCKS = [...CONTRACT, "", "### C2 - Logout endpoint", "", "File: none", "", "POST /logout -> 204"];
/** C2 sits in T2's Uses, so every block is used. */
const usesGap = (task: TaskFields): string => two({ uses: "C1", files: "src/a.ts", ...task }, { uses: "C2", files: "src/b.ts" }, TWO_BLOCKS);
const MEMORY_ON: Scene = { config: "build:\n  memory: true\n" };
const memory = (path: string): string => `FIX: task T1: Files lists ${path} while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)`;

/** A defect of a fresh plan alone: a check added after plans were frozen. */
const FRESH: Array<[string, string, string[], Scene?]> = [
  ["a skipped task id", two({ files: "src/a.ts" }, { id: "T3", files: "src/b.ts" }), ["FIX: task T3: id must be T2, the 2th task block in order - renumber the tasks (Ids)"]],
  ["a skipped contract id", two({ uses: "C1", files: "src/a.ts" }, { uses: "C3", files: "src/b.ts" }, [...CONTRACT, "", "### C3 - Logout", "", "File: none"]), ["FIX: contract C3: id must be C2, the 2th block in order - renumber the blocks (Blocks)"]],
  ...[["feat(viber): Add x", "feat(viber):"], ["fix: Add x", "fix:"], ["Fix: Add x", "Fix:"], ["chore!: Add x", "chore!:"]].map(([title, prefix]): [string, string, string[]] => [`the title "${title}"`, one({ title }), [`FIX: task T1: title opens with the commit type prefix "${prefix}" - drop it, the commit subject is "<id> - <title>" (Title)`]]),
  ["a dependency another entry reaches directly", planBody([{ id: "T1", files: "src/a.ts" }, { id: "T2", deps: "T1", files: "src/b.ts" }, { id: "T3", deps: "T1, T2", files: "src/c.ts" }], 1), ["FIX: task T3: Depends-on T1 is already reached through T2 - drop it"]],
  ["a dependency another entry reaches through a third task", planBody([{ id: "T1", files: "src/a.ts" }, { id: "T2", deps: "T1", files: "src/b.ts" }, { id: "T3", deps: "T2", files: "src/c.ts" }, { id: "T4", deps: "T1, T3", files: "src/d.ts" }], 1), ["FIX: task T4: Depends-on T1 is already reached through T3 - drop it"]],
  ["an appendix where no block carries File", one({}, NO_FILE), ['FIX: contract C1: missing File - name the paths the shape is declared in, or "none"']],
  ["a consumer beside the writer of its contract", two({ uses: "C1", files: "src/login.ts" }, { uses: "C1", files: "src/b.ts" }, owned("src/login.ts")), ["FIX: task T2 uses C1, written by T1, but has no dependency path to T1 - add T1 to its Depends-on"]],
  ["a Verification naming a file an unrelated lower task lists", readAfter({ verification: "node --test src/login.ts -> green" }), [reads("T1")]],
  ["a DoD naming such a file in backticks", readAfter({ dod: "it reads `src/login.ts`" }), [reads("T1")]],
  ["a DoD naming such a file before a sentence period", readAfter({ dod: "the handler in ./src/login.ts. It works" }), [reads("T1")]],
  ["a Delivers naming such a file", readAfter({ delivers: "the handler in src/login.ts" }), [reads("T1")]],
  ["a Verification naming a file only later tasks create", forward({ verification: "node --test src/new.ts -> green" }), [FORWARD]],
  ["a Delivers naming a file only later tasks create", forward({ delivers: "the helper in src/new.ts" }), [FORWARD]],
  ["a DoD naming such a file twice, reported once", forward({ dod: "it reads `src/new.ts` and src/new.ts again" }), [FORWARD]],
  ["the Delivers of a record task holding a file outside docs/adr/", two({ files: "docs/adr/0001-login.md,src/record.ts", delivers: "the record of src/login.ts" }, { uses: "none", files: "src/login.ts" }), ["FIX: task T1 reads src/login.ts, which only the later task T2 creates - move the reading after T2 (Read after)"]],
  ["a DoD naming another task", two({ files: "src/a.ts" }, { deps: "T1", files: "src/b.ts", dod: "proven by T1" }), ["FIX: task T2: DoD names task T1 - prove each clause inside this task, naming a file or symbol instead"]],
  ["13 Files on a TDD: required task", one({ files: files(13) }), ["SPLIT: task T1: 13 Files, past the 12 a TDD: required task may hold - split it, one behaviour per task"]],
  ["7 DoD clauses on a TDD: required task", one({ dod: clauses(7) }), [past(7, 6, "required")]],
  ["26 Files and 11 DoD clauses on a TDD: none task", one({ tdd: "none", files: files(26), dod: clauses(11) }), ["SPLIT: task T1: 26 Files, past the 25 a TDD: none task may hold - split it, one behaviour per task", past(11, 10, "none")]],
  ["a DoD naming a block its Uses does not", usesGap({ dod: "the handler follows C2" }), ["FIX: task T1: DoD names C2, missing from its Uses - add it to Uses"]],
  ["a Delivers naming a block its Uses does not", usesGap({ delivers: "a handler that implements C2" }), ["FIX: task T1: Delivers names C2, missing from its Uses - add it to Uses"]],
  ...["src/CLAUDE.md", "CLAUDE.md", "./src/CLAUDE.md"].map((path): [string, string, string[], Scene] => [`${path} in Files while build.memory is on`, one({ files: `src/a.ts, ${path}` }), [memory(path.replace("./", ""))], MEMORY_ON]),
  ...["my file.png", "-a.png"].map((name): [string, string, string[]] => [`the attachment name "${name}"`, withMap(one({}), `  ${name}: .temp/x.png`), [badName(name)]]),
  ["an attachment name repeated in another case", withMap(one({}), "  a.png: .temp/a.png", "  A.png: .temp/b.png"), ['FIX: attachments: name "A.png" repeats an earlier one - rename one of them (Attachments)']],
  ["a DoD naming an attachment the map lacks", withMap(one({ dod: "the page matches attachments/b.png" }), "  a.png: .temp/a.png"), ["FIX: task T1: DoD names attachments/b.png, absent from the attachments map - add a b.png entry or drop the reference (Attachments)"]],
  ["an unprovable Verification", one({ verification: "node -e 1 -> ok" }), ['FIX: task T1: Verification runs inline interpreter code "node -e" - run a project test or script instead (Provable)']],
  ["a file map path the tree lacks", one({}).replace("- add - src/login.ts", "- modify - src/gone.ts"), ["FIX: file map: modify src/gone.ts, which the tree does not hold - correct the path or list it as add (File map)"]],
  ["an unnumbered scenario", planBody([{ id: "T1" }], 1, CONTRACT, "full").replace("### S1 - Signing in [NEW]", "### Signing in"), ['FIX: line 22: scenario heading "Signing in" must be "### S<k> - <title>", the 1th scenario in order - number it (Scenarios)']],
  ["a template slot", one({}).replace("The session is durable.", "<n>"), ["FIX: line 6: template slot <n> left unfilled - replace it (Filled)"], { files: { "/plug/skills/planner/templates/tasks.md": "<n>\n" } }],
];
for (const [label, plan, lines, given] of FRESH) {
  test(`${label} is refused on a fresh plan`, () => {
    assert.deepEqual(answerOf(indexOf(plan, [], given)), refused(4, ...lines));
  });

  test(`${label} passes on a landed plan: it is frozen, and a run resumed after the rule must still validate`, () => {
    assert.equal(indexOf(plan, [], { ...given, status: ["done: none"] }).exit, 0);
  });
}

/** What none of the checks refuses. */
const OPEN_SOUND = withOpen(one({}), ...notes(3), "- critical | T1 | the DoD contradicts AC1", "- critical | plan | AC1 - unproven", "- note | plan | for the user");
const SOUND: Array<[string, string, Scene?]> = [
  ["an Open items section of 3 notes for one task, open critical problems and a plan note", OPEN_SOUND],
  ["a dependency on an Exclusive task (the script computes the edge from Files and contract use, so no author could drop it)", two({ exclusive: "true", files: "src/a.ts" }, { deps: "T1", files: "src/b.ts" })],
  ["two dependencies with no path between them", planBody([{ id: "T1", files: "src/a.ts" }, { id: "T2", files: "src/b.ts" }, { id: "T3", deps: "T1, T2", files: "src/c.ts" }], 1)],
  ["a contract file the tree already holds", one({}, owned("src/session.ts")), { files: { "src/session.ts": "x\n" } }],
  ["one holder of a contract file naming the block", two({ uses: "C1", files: "src/login.ts" }, { uses: "none", deps: "T1", files: "src/login.ts" }, owned("src/login.ts"))],
  ["a consumer reaching its writer through another task", planBody([{ id: "T1", uses: "C1", files: "src/login.ts" }, { id: "T2", uses: "none", deps: "T1", files: "src/b.ts" }, { id: "T3", uses: "C1", deps: "T2", files: "src/c.ts" }], 1, owned("src/login.ts"))],
  ["two tasks using a block on File: none", two({ files: "src/a.ts" }, { files: "src/b.ts" })],
  ["a consumer numbered below its only writer", two({ uses: "C1", files: "src/b.ts" }, { uses: "C1", files: "src/login.ts" }, owned("src/login.ts"))],
  ["a reader depending on the writer", readAfter({ deps: "T1", verification: "node --test src/login.ts -> green", delivers: "src/login.ts" })],
  ["a reader reaching the writer through another task", planBody([{ id: "T1", files: "src/login.ts" }, { id: "T2", uses: "none", deps: "T1", files: "src/b.ts" }, { id: "T3", uses: "none", deps: "T2", files: "src/c.ts", dod: "it reads `src/login.ts`" }], 1)],
  ["a token that is the tail of a listed path", readAfter({ dod: "it reads login.ts" })],
  ["a listed path that is the head of a longer token", readAfter({ dod: "it reads src/login.tsx" })],
  ["a forward path the tree already holds", forward({ dod: "it reads src/new.ts" }), { files: { "src/new.ts": "x\n" } }],
  ["a forward path the reading task lists itself", two({ files: "src/a.ts,src/new.ts", dod: "it reads src/new.ts" }, { uses: "none", deps: "T1", files: "src/new.ts" })],
  ["the Delivers of a task whose every file is under docs/adr/", two({ files: "docs/adr/0001-login.md", delivers: "the record of src/login.ts" }, { uses: "none", files: "src/login.ts" })],
  ["12 Files and 6 DoD clauses on a TDD: required task", one({ files: files(12), dod: clauses(6) })],
  ["25 Files and 10 DoD clauses on a TDD: none task", one({ tdd: "none", files: files(25), dod: clauses(10) })],
  ["a DoD naming the task's own id", one({ dod: "T1 handles this case" })],
  ["a DoD word that only contains another task's id", two({ files: "src/a.ts" }, { deps: "T1", files: "src/b.ts", dod: "handles case T10" })],
  ["another task's id inside a backtick span of a DoD", two({ files: "src/a.ts" }, { deps: "T1", files: "src/b.ts", dod: "the fixture quotes `T1`" })],
  ["a block named in a DoD and in its Uses", usesGap({ uses: "C1, C2", dod: "the handler follows C2", delivers: "a handler that implements C2" })],
  ["a block named only inside backtick spans", usesGap({ dod: "the fixture quotes `C2`", delivers: "a handler that quotes `C2`" })],
  ["a token with no block in the appendix", usesGap({ dod: "the handler follows C9" })],
  ["a word that only contains a block id", usesGap({ dod: "the handler follows C21 and C2x" })],
  ["the title Fix the parser", one({ title: "Fix the parser" })],
  ...["docs/CLAUDE-notes.md", "viber/scripts/CLAUDE.run-scripts.md", "src/NOTCLAUDE.md"].map((path): [string, string, Scene] => [`${path} in Files while build.memory is on`, one({ files: path }), MEMORY_ON]),
  ...["the page matches `attachments/a.png`.", "the page matches attachments/mock/ closely", "the page matches attachments/mock/home.png"].map((dod): [string, string] => [`"${dod}" over a map holding a.png and mock`, withMap(one({ dod }), "  a.png: .temp/a.png", "  mock: .temp/mock")]),
  ["a DoD naming an attachment when the frontmatter has no map", ["---", "source: .temp/plan.md", "---", one({ dod: "the page matches attachments/b.png" })].join("\n")],
  ["a contract File whose bracket wraps a whole segment", one({ files: "src/app/[siteId]/route.ts" }, owned("src/app/[siteId]/route.ts"))],
  ["a plan introducing no shape at all", one({ uses: "none" }, [])],
];
for (const [label, plan, given] of SOUND) {
  test(`${label} passes`, () => {
    assert.deepEqual(indexOf(plan, [], given).stderr, "");
  });
}

/** One run reports every defect, whatever an earlier check found. */
const TOGETHER: Array<[string, string, string[]]> = [
  ["a malformed Files entry and a shared file", planBody([{ id: "T1", files: "src/a.ts, src/dir/" }, { id: "T2", covers: "AC2", uses: "none", files: "src/a.ts" }]), ['FIX: task T1: Files entry "src/dir/" is a directory, list each file', "FIX: tasks T1 and T2 both list src/a.ts, with no dependency path between them"]],
  ["an uncovered criterion and a consumer beside its writer", planBody([{ id: "T1", files: "src/login.ts" }, { id: "T2", uses: "C1", files: "src/b.ts" }], 2, owned("src/login.ts")), ["FIX: acceptance criterion AC2 is covered by no task", "FIX: task T2 uses C1, written by T1, but has no dependency path to T1 - add T1 to its Depends-on"]],
  ["a redundant dependency and a reader beside its writer", planBody([{ id: "T1", files: "src/a.ts" }, { id: "T2", uses: "none", deps: "T1", files: "src/b.ts" }, { id: "T3", uses: "none", deps: "T1, T2", files: "src/c.ts" }, { id: "T4", uses: "none", files: "src/d.ts", dod: "it reads `src/a.ts`" }], 1), ["FIX: task T3: Depends-on T1 is already reached through T2 - drop it", "FIX: task T4 reads src/a.ts, listed by T1, but has no dependency path to T1 - add T1 to its Depends-on"]],
];
for (const [label, plan, lines] of TOGETHER) {
  test(`${label} are both printed in one run`, () => {
    assert.deepEqual(answerOf(indexOf(plan)), refused(4, ...lines));
  });
}

test("a Verification holding a bare word is checked as any command: a task writing an integration test file it does not name is refused (no word stands in for a line still to be written)", () => {
  const path = "tests/integration/store.test.ts";
  assert.deepEqual(answerOf(indexOf(one({ files: path, verification: "PENDING", dod: "PENDING - later" }))), refused(4, `FIX: task T1: Files writes ${path} under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`));
});
