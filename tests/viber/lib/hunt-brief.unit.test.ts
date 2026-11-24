/*
 * hunt-brief.unit.test.ts - what keep-units and hunt-return share: the run read
 * from run.md, the lines of a section, the ledger append and the hunter block.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { hunterBlock, openRun, record, sectionLines, unitLines, type HuntRun } from "../../../viber/lib/hunt-brief.ts";

const SCRIPT = "/plugin/skills/code-auditor/scripts/keep-units.ts";
const RUN = "Lens: bugs\nLens file: /lens.md\nScope: diff\n";

function open(files: Record<string, string>): HuntRun {
  const run = openRun("/ws/", SCRIPT, fakeFs(files));
  assert.ok(typeof run !== "string", String(run));
  return run;
}

test("a workspace given with a trailing slash is spelled without it, and the directories are cut from the entry path", () => {
  const run = open({ "/ws/run.md": RUN });
  assert.deepEqual([run.runFile, run.skillDir, run.pluginRoot, run.worktree], ["/ws/run.md", "/plugin/skills/code-auditor", "/plugin", false]);
});

test("a run file lacking a header line is named with the first missing key", () => {
  assert.equal(openRun("/ws", SCRIPT, fakeFs({ "/ws/run.md": "Lens: bugs\nScope: diff\n" })), "run file has no Lens file: line: /ws/run.md");
});

test("record appends to the bytes the ledger holds, a line with no end included", () => {
  const fs = fakeFs({ "/ws/run.md": RUN, "/ws/ledger.md": Uint8Array.of(0xff) });
  const run = openRun("/ws", SCRIPT, fs);
  assert.ok(typeof run !== "string");
  record(run, "x", fs);
  assert.deepEqual([...(fs.readBytes("/ws/ledger.md") ?? [])], [0xff, 0x78, 0x0a]);
});

test("a section ends at the next ## line and never opens on a longer title", () => {
  const fs = fakeFs({ "/m.md": "## Units of work\n- no\n## Units \r\n- U1 | a\n## Other\n- U2 | b\n" });
  assert.deepEqual(sectionLines(fs, "/m.md", "Units"), ["- U1 | a"]);
});

test("the unit lines are the `- U<n> |` lines of Units alone", () => {
  const files = { "/ws/run.md": RUN, "/ws/map.md": "## Units\n- U1 | a\n-  U2 | b\n- Ux | c\n- U3 | d\n" };
  assert.deepEqual(unitLines(open(files), fakeFs(files)), ["- U1 | a", "- U3 | d"]);
});

test("a retry block differs from the first one by its directive and its worktree alone", () => {
  const run = open({ "/ws/run.md": RUN, "/lens.md": "Worktree: required\n" });
  const hunt = { id: "A-x", unitLine: "", angle: "x", seeds: [] };
  const [first, retry] = [hunterBlock(run, hunt, false), hunterBlock(run, hunt, true)];
  assert.deepEqual(
    retry.filter((line) => !first.includes(line)),
    ["NEXT: hunter | id: A-x | background | retry", "Worktree: /ws/worktrees/A-x-retry"],
  );
});
