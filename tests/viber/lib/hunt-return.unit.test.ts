/*
 * hunt-return.unit.test.ts - the hunt-return core on a fake file system: the
 * answer to the return of a hunter (a critic block per claim, the one retry
 * block, the recorded miss) and of a critic (its verdict file, its one retry),
 * the files it strips of a closing tag and the ledger lines it appends.
 *
 * Every closing-tag fixture is built from an escape (`\x3c`), so no line of
 * this file is a bare closing tag. The wrapper is run as a process by
 * tests/viber/hunt-return.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runHuntReturn } from "../../../viber/lib/hunt-return.ts";

const WS = "/r/ws";
const PLUGIN_ROOT = "/plugin";
const SKILL_DIR = `${PLUGIN_ROOT}/skills/code-auditor`;
const SCRIPT = `${SKILL_DIR}/scripts/hunt-return.ts`;

const lines = (...rows: string[]): string => rows.map((row) => `${row}\n`).join("");

function put(fs: Fs, name: string, body: string): void {
  const file = `${WS}/${name}`;
  fs.makeDir(file.slice(0, file.lastIndexOf("/")));
  assert.equal(fs.writeBytes(file, new TextEncoder().encode(body)), true);
}

function read(fs: Fs, ...parts: string[]): string {
  return fs.readText([WS, ...parts].join("/")) ?? "";
}

const UNITS = ["- U1 | src/m1 | why 1", "- U2 | src/m2 | why 2"];

interface Frame {
  lens?: string;
  scope?: string;
  worktree?: boolean;
  ledger?: string[];
  seeds?: string[];
}

/** A workspace holding lens.md, run.md, map.md and ledger.md. */
function frame(opts: Frame = {}): { fs: Fs; ws: string; lensFile: string } {
  const lensFile = `${WS}/lens.md`;
  const fs = fakeFs({
    [lensFile]: lines("# Lens", "", "## Hunts", "### alpha", "what to look for.", "", "## Verify", `Worktree: ${opts.worktree ? "required" : "none"}`),
    [`${WS}/run.md`]: lines(`Lens: ${opts.lens ?? "bugs"}`, `Lens file: ${lensFile}`, `Scope: ${opts.scope ?? "diff"}`, "Target root: /r"),
    [`${WS}/map.md`]: lines("## Conventions", "none", "", "## Units", ...UNITS),
    [`${WS}/ledger.md`]: lines(...(opts.ledger ?? [])),
    ...(opts.seeds ? { [`${WS}/seeds.md`]: lines(...opts.seeds) } : {}),
  });
  return { fs, ws: WS, lensFile };
}

function run(fs: Fs, ...rest: string[]) {
  return runHuntReturn([WS, ...(rest.length ? rest : ["hunter", "U1"])], SCRIPT, { fs });
}

const U1_LEDGER = ["hunt: U1 | wave: 1 | unit: U1 | angle: none"];

/** The critic block hunt-return.sh prints for the claim `<cid>`, `extra` the lens-dependent lines. */
function criticBlock(ws: string, lensFile: string, cid: string, extra: string[] = [], tail: string[] = [], retry = false): string {
  return lines(
    `NEXT: critic | id: ${cid} | background${retry ? " | retry" : ""}`,
    `Claim: ${ws}/reports/${cid}.claim.md`,
    `Run file: ${ws}/run.md`,
    `Lens file: ${lensFile}`,
    `Out: ${ws}/verdicts/${cid}.md`,
    ...extra,
    ...tail,
  );
}

const CONTENT = "\x3c/content>";
const PARAMETER = "\x3c/parameter>";

test("every <id>-<digit>.md and .claim.md of the hunt loses a trailing closing tag, every other byte kept", () => {
  const { fs, ws } = frame({ ledger: U1_LEDGER });
  put(fs, "reports/U1-1.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
  put(fs, "reports/U1-1.claim.md", `LOCATION: a.ts:1\n${PARAMETER}\n`);
  put(fs, "reports/U1-2.md", `LOCATION: b.ts:2\n${CONTENT}\n`);
  put(fs, "reports/U1-2.claim.md", `LOCATION: b.ts:2\n${CONTENT}\n`);
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(read(fs, "reports", "U1-1.md"), "LOCATION: a.ts:1\n");
  assert.equal(read(fs, "reports", "U1-1.claim.md"), "LOCATION: a.ts:1\n");
  assert.equal(read(fs, "reports", "U1-2.md"), "LOCATION: b.ts:2\n");
  assert.equal(read(fs, "reports", "U1-2.claim.md"), "LOCATION: b.ts:2\n");
});

test("a file of a longer id is neither stripped nor counted (A-x-y-1.md and its claim never answer for the hunt A-x)", () => {
  const { fs, ws } = frame({ ledger: ["hunt: A-x | wave: 1 | unit: none | angle: x", "hunt: A-x-y | wave: 1 | unit: none | angle: x-y"] });
  put(fs, "reports/A-x-y-1.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
  put(fs, "reports/A-x-y-1.claim.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
  const result = run(fs, "hunter", "A-x");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.match(result.stdout, /^NEXT: hunter \| id: A-x \| background \| retry\n/);
  assert.equal(read(fs, "reports", "A-x-y-1.md"), `LOCATION: a.ts:1\n${CONTENT}\n`);
  assert.equal(read(fs, "reports", "A-x-y-1.claim.md"), `LOCATION: a.ts:1\n${CONTENT}\n`);
});

test("a worktree lens on the diff scope adds the worktree script, a critic worktree named for the claim and the overlay script", () => {
  const { fs, ws, lensFile } = frame({ worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
  put(fs, "reports/A-alpha-1.claim.md", "LOCATION: a\n");
  const result = run(fs, "hunter", "A-alpha");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    criticBlock(ws, lensFile, "A-alpha-1", [
      `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
      `Worktree: ${ws}/worktrees/critic-A-alpha-1`,
      `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
    ]),
  );
});

test("a worktree lens on a directory scope prints the worktree lines and no overlay script", () => {
  const { fs, ws, lensFile } = frame({ worktree: true, scope: "src", ledger: U1_LEDGER });
  put(fs, "reports/U1-2.claim.md", "LOCATION: a\n");
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    criticBlock(ws, lensFile, "U1-2", [`Worktree script: ${SKILL_DIR}/scripts/worktree.sh`, `Worktree: ${ws}/worktrees/critic-U1-2`]),
  );
});

test("the tests lens adds the Test rules line to a critic block", () => {
  const { fs, ws, lensFile } = frame({ lens: "tests", ledger: U1_LEDGER });
  put(fs, "reports/U1-1.claim.md", "LOCATION: a\n");
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, criticBlock(ws, lensFile, "U1-1", [`Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`]));
});

test("a wave 2 hunt adds Variant: yes as the last line of its critic block", () => {
  const { fs, ws, lensFile } = frame({ worktree: true, lens: "tests", ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: alpha"] });
  put(fs, "reports/V-1-1.claim.md", "LOCATION: a\n");
  const result = run(fs, "hunter", "V-1");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    criticBlock(
      ws,
      lensFile,
      "V-1-1",
      [
        `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
        `Worktree: ${ws}/worktrees/critic-V-1-1`,
        `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
        `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
      ],
      ["Variant: yes"],
    ),
  );
});

/** The hunter block keep-units.sh printed for a hunt, as its retry reprints it. */
function retryBlock(ws: string, lensFile: string, id: string, body: string[], worktree: string[] = []): string {
  return lines(
    `NEXT: hunter | id: ${id} | background | retry`,
    `Run file: ${ws}/run.md`,
    `Lens file: ${lensFile}`,
    `Schema: ${SKILL_DIR}/references/synthesis.md`,
    `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
    `Hunt: ${id}`,
    ...body,
    `Reports: ${ws}/reports/${id}`,
    ...worktree,
  );
}

test("a unit hunt with no report prints its brief once more with retry and records retried:", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", ledger: [...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none"] });
  const result = run(fs, "hunter", "U2");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, retryBlock(ws, lensFile, "U2", ["Unit: - U2 | src/m2 | why 2"]));
  assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none", "retried: U2"));
});

test("an angle hunt on a worktree lens retries with its worktree suffixed -retry and the overlay script", () => {
  const { fs, ws, lensFile } = frame({ worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
  const result = run(fs, "hunter", "A-alpha");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    retryBlock(ws, lensFile, "A-alpha", ["Angle: alpha"], [
      `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
      `Worktree: ${ws}/worktrees/A-alpha-retry`,
      `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
    ]),
  );
});

const SEEDS = ["Seed: wrong-result: swallows the parse error", "Seed: race-state: counter updated without the lock"];

test("a wave 2 unit hunt retries with every Seed line of seeds.md after its Unit line", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", seeds: SEEDS, ledger: ["hunt: U1 | wave: 2 | unit: U1 | angle: none"] });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, retryBlock(ws, lensFile, "U1", ["Unit: - U1 | src/m1 | why 1", ...SEEDS]));
});

test("a wave 2 diff hunt V-<n> retries with its own angle and the n-th Seed line only", () => {
  const { fs, ws, lensFile } = frame({
    seeds: SEEDS,
    ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: wrong-result", "hunt: V-2 | wave: 2 | unit: none | angle: race-state"],
  });
  const result = run(fs, "hunter", "V-2");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, retryBlock(ws, lensFile, "V-2", ["Angle: race-state", SEEDS[1]]));
});

test("the second miss of a hunt records no-report: and prints NEXT: none", () => {
  const { fs, ws } = frame({ ledger: [...U1_LEDGER, "retried: U1"] });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
  assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER, "retried: U1", "no-report: U1"));
});

test("a hunt with only <id>-0.md prints NEXT: none and records nothing", () => {
  const { fs, ws } = frame({ ledger: U1_LEDGER });
  put(fs, "reports/U1-0.md", `NO FINDING\nchecked: src/m1\n${CONTENT}\n`);
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
  assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER));
  assert.equal(read(fs, "reports", "U1-0.md"), "NO FINDING\nchecked: src/m1\n");
});

const R_U2_LEDGER = [...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none", "retried: U2", "no-report: U2", "hunt: R-U2 | wave: 2 | unit: U2 | angle: none"];

test("a unit re-hunt R-U2 with a claim prints a critic block ending on Variant: yes (characterization: it is any wave 2 hunt)", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", ledger: R_U2_LEDGER });
  put(fs, "reports/R-U2-1.claim.md", "LOCATION: a\n");
  const result = run(fs, "hunter", "R-U2");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, criticBlock(ws, lensFile, "R-U2-1", [], ["Variant: yes"]));
});

test("a unit re-hunt with no report prints its retry block once, keeping its retried: and no-report: lines apart from the unit's own, then NEXT: none", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", seeds: SEEDS, ledger: R_U2_LEDGER });
  const first = run(fs, "hunter", "R-U2");
  assert.equal(first.exit, 0, `stderr=${first.stderr}`);
  assert.equal(first.stdout, retryBlock(ws, lensFile, "R-U2", ["Unit: - U2 | src/m2 | why 2", ...SEEDS]));
  assert.equal(read(fs, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2"));
  const second = run(fs, "hunter", "R-U2");
  assert.equal(second.stdout, "NEXT: none\n");
  assert.equal(read(fs, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2", "no-report: R-U2"));
  const third = run(fs, "hunter", "R-U2");
  assert.equal(third.stdout, "NEXT: none\n");
  assert.equal(read(fs, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2", "no-report: R-U2"));
});

test("a report of the re-hunt R-U2 never answers for the hunt U2, nor the report of U2 for R-U2", () => {
  const { fs, ws } = frame({
    scope: "src",
    ledger: ["hunt: U2 | wave: 1 | unit: U2 | angle: none", "hunt: R-U2 | wave: 2 | unit: U2 | angle: none"],
  });
  put(fs, "reports/R-U2-0.md", "NO FINDING\n");
  const rehunt = run(fs, "hunter", "R-U2");
  assert.equal(rehunt.stdout, "NEXT: none\n");
  const own = run(fs, "hunter", "U2");
  assert.match(own.stdout, /^NEXT: hunter \| id: U2 \| background \| retry\n/);
});

function putVerdict(fs: Fs, name: string, body: string): void {
  put(fs, `verdicts/${name}`, body);
}

const VERDICT_BODY = ["COMMAND: grep -n x a.ts", "OBSERVED: the call is unguarded", "SEVERITY: 6"];

test("the verdict file of a critic loses a trailing closing tag, every other byte kept", () => {
  const { fs, ws } = frame({ ledger: U1_LEDGER });
  putVerdict(fs, "U1-1.md", lines("VERDICT: VERIFIED", ...VERDICT_BODY) + `${CONTENT}\n`);
  const result = run(fs, "critic", "U1-1");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(read(fs, "verdicts", "U1-1.md"), lines("VERDICT: VERIFIED", ...VERDICT_BODY));
});

for (const verdict of ["VERIFIED", "REFUTED", "PARTIALLY VERIFIED", "INCONCLUSIVE"]) {
  test(`a verdict file holding the line VERDICT: ${verdict} prints NEXT: none and records nothing`, () => {
    const { fs, ws } = frame({ ledger: U1_LEDGER });
    putVerdict(fs, "U1-2.md", lines(`VERDICT: ${verdict}`, ...VERDICT_BODY));
    const result = run(fs, "critic", "U1-2");
    assert.equal(result.exit, 0, `stderr=${result.stderr}`);
    assert.equal(result.stdout, "NEXT: none\n");
    assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER));
  });
}

test("a missing verdict file prints the critic block once more with retry, its worktree suffixed -retry, and records critic-retried:", () => {
  const { fs, ws, lensFile } = frame({ worktree: true, lens: "tests", ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: alpha"] });
  const result = run(fs, "critic", "V-1-2");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    criticBlock(
      ws,
      lensFile,
      "V-1-2",
      [
        `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
        `Worktree: ${ws}/worktrees/critic-V-1-2-retry`,
        `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
        `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
      ],
      ["Variant: yes"],
      true,
    ),
  );
  assert.equal(read(fs, "ledger.md"), lines("hunt: V-1 | wave: 2 | unit: none | angle: alpha", "critic-retried: V-1-2"));
});

test("a verdict file with no VERDICT: line holding a verdict gets the same retry block on a lens with no worktree", () => {
  const { fs, ws, lensFile } = frame({ ledger: U1_LEDGER });
  putVerdict(fs, "U1-1.md", lines("VERDICT: MAYBE", ...VERDICT_BODY));
  const result = run(fs, "critic", "U1-1");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, criticBlock(ws, lensFile, "U1-1", [], [], true));
  assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER, "critic-retried: U1-1"));
});

test("the second miss of a critic prints NEXT: none and records nothing more", () => {
  const { fs, ws } = frame({ ledger: [...U1_LEDGER, "critic-retried: U1-1"] });
  putVerdict(fs, "U1-1.md", lines(...VERDICT_BODY));
  const result = run(fs, "critic", "U1-1");
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
  assert.equal(read(fs, "ledger.md"), lines(...U1_LEDGER, "critic-retried: U1-1"));
});

test("each claim prints one critic block in ascending k", () => {
  const { fs, ws, lensFile } = frame({ ledger: U1_LEDGER });
  for (const k of [3, 1, 2]) put(fs, `reports/U1-${k}.claim.md`, "LOCATION: a\n");
  put(fs, "reports/U1-1.md", "report\n");
  assert.equal(run(fs).stdout, criticBlock(ws, lensFile, "U1-1") + criticBlock(ws, lensFile, "U1-2") + criticBlock(ws, lensFile, "U1-3"));
});

const REFUSED: Array<{ label: string; argv: string[]; error: string }> = [
  { label: "no workspace", argv: [], error: "usage: hunt-return.sh <ws> hunter <hunt id> | <ws> critic <hunt id>-<k>" },
  { label: "an unknown mode", argv: [WS, "scout", "U1"], error: "usage: hunt-return.sh <ws> hunter <hunt id> | <ws> critic <hunt id>-<k>" },
  { label: "an id holding a slash", argv: [WS, "hunter", "../U1"], error: "bad hunt id: ../U1" },
  { label: "a critic id with no digit", argv: [WS, "critic", "U1-x"], error: "bad critic id: U1-x" },
  { label: "a critic id with no hunt id", argv: [WS, "critic", "-1"], error: "bad critic id: -1" },
  { label: "a workspace with no run file", argv: ["/r/none", "hunter", "U1"], error: "run file not found: /r/none/run.md" },
  { label: "a hunt no script dispatched", argv: [WS, "hunter", "U2"], error: "hunt not in the ledger: U2" },
  { label: "a unit hunt whose unit is not in the map", argv: [WS, "hunter", "U9"], error: `unit not in ${WS}/map.md: U9` },
];

for (const row of REFUSED) {
  test(`${row.label} exits 2 with one error line, nothing on stdout and no ledger line`, () => {
    const { fs } = frame({ ledger: [...U1_LEDGER, "hunt: U9 | wave: 1 | unit: U9 | angle: none"] });
    const before = read(fs, "ledger.md");
    assert.deepEqual(runHuntReturn(row.argv, SCRIPT, { fs }), { stdout: "", stderr: `error: ${row.error}\n`, exit: 2 });
    assert.equal(read(fs, "ledger.md"), before);
  });
}
