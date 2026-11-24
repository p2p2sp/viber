/*
 * synthesize.unit.test.ts - the synthesize core on a fake file system: the
 * run's ledger, the head lines of each report and each critic's verdict file
 * become the title line, the header line, the full entries (cap of ten,
 * severity 4.0 or more), the further findings and the coverage notes of
 * findings.md, and stdout is the `summary:` line followed by the `NEXT: fill`
 * block with one `entry:` line per full entry; and for the merge step: the
 * undecided pairs of findings close in one file print as a `NEXT: merge` block
 * before anything is written, each `--merge` group becomes one finding, and
 * every printed pair is recorded in the ledger as merged or apart. A finding of
 * the unit re-hunt `R-U<n>` ranks right after the `U<n>` findings of its unit,
 * and the re-hunt's report counts that unit as investigated.
 *
 * Each case seeds its own run workspace. Verdict files are fixtures as
 * hunt-return.sh leaves them (closing tag already stripped), so no case writes
 * a closing tag. The wrapper is run as a process, under every POSIX shell and
 * with the backslash spellings of the workspace, by
 * tests/viber/synthesize.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runSynthesize, type SynthesizeResult } from "../../../viber/lib/synthesize.ts";

const DOT = "·";
const DIR = "/audit";
const WS = `${DIR}/20260101-000000`;
const LENS = `${DIR}/bugs.md`;
const OUT = `${WS}/findings.md`;
const LEDGER = `${WS}/ledger.md`;

interface Finding {
  /** `<hunt id>-<k>`, k 1 to 3. */
  id: string;
  title?: string;
  loc?: string;
  cls?: string;
  sev?: string;
  conf?: string;
  /** Absent: no verdict file at all. */
  verdict?: string;
  observed?: string;
  crit?: string;
  /** Replaces the whole verdict file, for a file with no `VERDICT:` line. */
  verdictBody?: string;
}

interface Fixture {
  scope?: string;
  units?: string[];
  findings?: Finding[];
  /** Hunts whose only report is `<id>-0.md`. */
  zeros?: string[];
  /** Hunts the ledger names and no report file exists for. */
  bare?: string[];
  /** Extra files under reports/, name -> content. */
  files?: Record<string, string>;
  angles?: string[];
}

const huntOf = (id: string): string => id.replace(/-\d$/, "");
const verified = (id: string, extra: Partial<Finding> = {}): Finding => ({ id, verdict: "VERIFIED", ...extra });

function report(f: Finding): string {
  return [
    `# ${f.title ?? `Title ${f.id}`}`,
    `LOCATION: ${f.loc ?? `src/${f.id}.ts:L10-L20`}`,
    `CLASS: ${f.cls ?? `bugs: class ${f.id}`}`,
    `SEVERITY: ${f.sev ?? "6.0"}`,
    `CONFIDENCE: ${f.conf ?? "medium"}`,
    `HUNT: ${huntOf(f.id)}`,
    "",
    "## Root cause",
    "The body is never read by the core.",
    "",
  ].join("\n");
}

function verdictFile(f: Finding): string {
  return [`VERDICT: ${f.verdict}`, "COMMAND: sh repro.sh", `OBSERVED: ${f.observed ?? "it failed"}`, `SEVERITY: ${f.crit ?? f.sev ?? "6.0"}`, ""].join("\n");
}

function huntLine(id: string): string {
  const unit = /^(R-)?U\d+$/.test(id) ? id.replace(/^R-/, "") : "none";
  const angle = id.startsWith("A-") ? id.slice(2) : "none";
  return `hunt: ${id} | wave: ${id.startsWith("R-") ? 2 : 1} | unit: ${unit} | angle: ${angle}`;
}

/** The files of a run workspace at WS, its lens file beside it. */
function build(fx: Fixture): Record<string, string> {
  const angles = fx.angles ?? ["first", "second"];
  const findings = fx.findings ?? [];
  const hunts = [...new Set([...findings.map((f) => huntOf(f.id)), ...(fx.zeros ?? []), ...(fx.bare ?? [])])];
  const files: Record<string, string> = {
    [LENS]: ["# Bugs lens", "", "## Hunts", ...angles.flatMap((a) => [`### ${a}`, "text", ""]), "## Excluded", "- nothing", ""].join("\n"),
    [`${WS}/run.md`]: [
      "Lens: bugs",
      `Lens file: ${LENS}`,
      `Scope: ${fx.scope ?? "repo"}`,
      "Target root: /repo",
      "",
      "## Map",
      "## Conventions",
      "none",
      "",
      "## Units",
      ...(fx.units ?? []).map((u) => `- ${u} | src/${u}.ts | why`),
      "",
    ].join("\n"),
    [LEDGER]: hunts.map(huntLine).join("\n") + "\n",
  };
  for (const f of findings) {
    files[`${WS}/reports/${f.id}.md`] = report(f);
    if (f.verdictBody !== undefined) files[`${WS}/verdicts/${f.id}.md`] = f.verdictBody;
    else if (f.verdict !== undefined) files[`${WS}/verdicts/${f.id}.md`] = verdictFile(f);
  }
  for (const id of fx.zeros ?? []) files[`${WS}/reports/${id}-0.md`] = "NO FINDING\nchecked: src\n";
  for (const [name, content] of Object.entries(fx.files ?? {})) files[`${WS}/reports/${name}`] = content;
  return files;
}

const synthesize = (fs: Fs, args: string[] = []): SynthesizeResult => runSynthesize([WS, ...args], { fs });
const findingsOf = (fs: Fs): string => fs.readText(OUT) ?? "";
const ledgerLines = (fs: Fs): string[] => (fs.readText(LEDGER) ?? "").trimEnd().split("\n");
const refused = (reason: string): SynthesizeResult => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 2 });

function put(fs: Fs, file: string, content: string): void {
  assert.equal(fs.makeDir(file.slice(0, file.lastIndexOf("/"))), true);
  assert.equal(fs.writeBytes(file, new TextEncoder().encode(content)), true);
}

/** Builds the fixture, runs the core once and hands the result and findings.md to `check`. */
function scenario(fx: Fixture, check: (result: SynthesizeResult, findings: string) => void): void {
  const fs = fakeFs(build(fx));
  const result = synthesize(fs);
  assert.equal(result.exit, 0, result.stderr);
  check(result, findingsOf(fs));
}

/** Files a report the way a later wave would: its report, its verdict file and its ledger line. */
function addFinding(fs: Fs, f: Finding): void {
  put(fs, `${WS}/reports/${f.id}.md`, report(f));
  if (f.verdict !== undefined) put(fs, `${WS}/verdicts/${f.id}.md`, verdictFile(f));
  put(fs, LEDGER, `${fs.readText(LEDGER) ?? ""}${huntLine(huntOf(f.id))}\n`);
}

function markers(text: string): string[] {
  return [...text.matchAll(/^<!-- finding: (.*) -->$/gm)].map((m) => m[1]);
}

/** The lines of entry `n`: its heading up to the blank line closing it. */
function entry(text: string, n: number): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${n}. `));
  return lines.slice(start, lines.indexOf("", start));
}

test("a VERIFIED finding adopts the critic severity and the entry notes it beside the filed one", () => {
  scenario({ findings: [verified("U1-1", { sev: "6.0", crit: "8.0", conf: "high" })] }, (_r, text) => {
    assert.deepEqual(entry(text, 1), [
      "## 1. Title U1-1",
      "SEVERITY: 8.0",
      "CONFIDENCE: high",
      "VERDICT: VERIFIED",
      "LOCATION: src/U1-1.ts:L10-L20",
      "CLASS: bugs: class U1-1",
      "<!-- finding: U1-1 -->",
      "Severity adopted from the critic: 8.0 (filed 6.0)",
      "<!-- fill -->",
    ]);
  });
});

test("a PARTIALLY VERIFIED finding adopts a lower critic severity and keeps its confidence", () => {
  scenario({ findings: [{ id: "U1-1", verdict: "PARTIALLY VERIFIED", sev: "7.0", crit: "5.5", conf: "medium" }] }, (_r, text) => {
    assert.deepEqual(entry(text, 1), [
      "## 1. Title U1-1",
      "SEVERITY: 5.5",
      "CONFIDENCE: medium",
      "VERDICT: PARTIALLY VERIFIED",
      "LOCATION: src/U1-1.ts:L10-L20",
      "CLASS: bugs: class U1-1",
      "<!-- finding: U1-1 -->",
      "Severity adopted from the critic: 5.5 (filed 7.0)",
      "<!-- fill -->",
    ]);
  });
});

test("a REFUTED finding is dropped: no entry, no further-findings line and no count", () => {
  scenario({ findings: [{ id: "U1-1", verdict: "REFUTED", sev: "9.0" }, verified("U2-1", { sev: "5.0" })] }, (result, text) => {
    assert.deepEqual(markers(text), ["U2-1"]);
    assert.ok(!text.includes("Title U1-1"), "a refuted finding leaves no trace in findings.md");
    assert.ok(text.includes("## Further findings (0)"));
    assert.ok(result.stdout.startsWith("summary: units 0 | hunts 2 | confirmed 1 | not investigated 0\n"));
  });
});

test("an INCONCLUSIVE verdict keeps the filed severity, lowers high to medium and names the missing oracle", () => {
  scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", sev: "7.0", crit: "2.0", conf: "high" }] }, (_r, text) => {
    assert.deepEqual(entry(text, 1), [
      "## 1. Title U1-1",
      "SEVERITY: 7.0",
      "CONFIDENCE: medium",
      "VERDICT: INCONCLUSIVE",
      "STATUS: INCONCLUSIVE - <!-- oracle -->",
      "LOCATION: src/U1-1.ts:L10-L20",
      "CLASS: bugs: class U1-1",
      "<!-- finding: U1-1 -->",
      "<!-- fill -->",
    ]);
  });
});

test("an INCONCLUSIVE finding already at low confidence stays low", () => {
  scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", conf: "low" }] }, (_r, text) => {
    assert.ok(entry(text, 1).includes("CONFIDENCE: low"));
  });
});

test("a finding with no verdict file is INCONCLUSIVE with confidence one step lower and the filed severity", () => {
  scenario({ findings: [{ id: "U1-1", sev: "7.0", conf: "medium" }] }, (_r, text) => {
    assert.deepEqual(entry(text, 1), [
      "## 1. Title U1-1",
      "SEVERITY: 7.0",
      "CONFIDENCE: low",
      "VERDICT: INCONCLUSIVE",
      "STATUS: INCONCLUSIVE - critic returned no verdict",
      "LOCATION: src/U1-1.ts:L10-L20",
      "CLASS: bugs: class U1-1",
      "<!-- finding: U1-1 -->",
      "<!-- fill -->",
    ]);
  });
});

test("a verdict file holding no VERDICT line counts as no verdict", () => {
  scenario({ findings: [{ id: "U1-1", conf: "high", verdictBody: "COMMAND: sh repro.sh\nOBSERVED: nothing\n" }] }, (_r, text) => {
    assert.ok(entry(text, 1).includes("STATUS: INCONCLUSIVE - critic returned no verdict"));
  });
});

test("findings rank by severity, then verdict, then confidence, then hunt order", () => {
  scenario(
    {
      findings: [
        verified("U2-1", { sev: "7.0", conf: "low" }),
        { id: "U1-1", verdict: "INCONCLUSIVE", sev: "7.0", conf: "high" },
        verified("U4-1", { sev: "7.0", conf: "high" }),
        verified("U3-1", { sev: "7.0", conf: "high" }),
        { id: "U5-1", verdict: "PARTIALLY VERIFIED", sev: "9.0" },
      ],
    },
    (_r, text) => {
      assert.deepEqual(markers(text), ["U5-1", "U3-1", "U4-1", "U2-1", "U1-1"]);
    },
  );
});

test("equal findings rank by hunt order: U hunts by number, then angles in the lens order, then V hunts, then k", () => {
  scenario(
    {
      angles: ["first", "second"],
      findings: [verified("V-1-1"), verified("A-second-1"), verified("U10-1"), verified("A-first-2"), verified("A-first-1"), verified("U9-1")],
    },
    (_r, text) => {
      assert.deepEqual(markers(text), ["U9-1", "U10-1", "A-first-1", "A-first-2", "A-second-1", "V-1-1"]);
    },
  );
});

test("a finding of the unit re-hunt R-U<n> ranks right after the U<n> findings of its unit, ahead of the next unit, the angles and the V hunts", () => {
  scenario(
    {
      angles: ["first"],
      findings: [verified("V-1-1"), verified("A-first-1"), verified("R-U2-1"), verified("U3-1"), verified("U2-2"), verified("U2-1"), verified("U1-1"), verified("R-U2-2")],
    },
    (_r, text) => {
      assert.deepEqual(markers(text), ["U1-1", "U2-1", "U2-2", "R-U2-1", "R-U2-2", "U3-1", "A-first-1", "V-1-1"]);
    },
  );
});

test("a unit whose own hunt left no report counts as investigated once its re-hunt R-U<n> left one", () => {
  scenario({ scope: "repo", units: ["U1", "U2", "U3"], findings: [verified("R-U2-1"), verified("U1-1")], bare: ["U2"] }, (result, text) => {
    assert.ok(text.includes("- Units not investigated: U3\n"), text);
    assert.ok(text.includes("- Hunts with no report: U2\n"), text);
    assert.ok(result.stdout.startsWith("summary: units 3 | hunts 3 | confirmed 2 | not investigated 1\n"), result.stdout);
  });
});

test("only the first ten findings get full entries and the eleventh drops into the further-findings list", () => {
  const sevs = ["9.9", "9.8", "9.7", "9.6", "9.5", "9.4", "9.3", "9.2", "9.1", "9.0", "8.9"];
  scenario({ findings: sevs.map((s, i) => verified(`U${i + 1}-1`, { sev: s })) }, (_r, text) => {
    assert.equal(markers(text).length, 10);
    assert.ok(text.includes("\n## 10. Title U10-1\n"));
    assert.ok(!text.includes("## 11. "));
    assert.ok(text.includes(`## Further findings (1)\n8.9 ${DOT} src/U11-1.ts:L10-L20 ${DOT} bugs: class U11-1 ${DOT} Title U11-1 ${DOT} ${WS}/reports/U11-1.md\n`));
  });
});

test("a severity below 4.0 never gets a full entry even with slots left, and 4.0 does", () => {
  scenario({ findings: [verified("U1-1", { sev: "3.9" }), verified("U2-1", { sev: "4.0" })] }, (_r, text) => {
    assert.deepEqual(markers(text), ["U2-1"]);
    assert.ok(text.includes(`## Further findings (1)\n3.9 ${DOT} src/U1-1.ts:L10-L20 ${DOT} bugs: class U1-1 ${DOT} Title U1-1 ${DOT} ${WS}/reports/U1-1.md\n`));
  });
});

test("the title line, the header line and the three coverage lines hold the run's counts", () => {
  scenario({ scope: "repo", units: ["U1", "U2", "U3"], findings: [verified("U1-1")], zeros: ["U2"] }, (_r, text) => {
    const lines = text.split("\n");
    assert.equal(lines[0], "# Findings - 20260101-000000 (bugs, repo)");
    assert.equal(lines[1], `bugs ${DOT} repo ${DOT} 3 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 1 units not investigated.`);
    assert.ok(text.endsWith("## Coverage notes\n- Units not investigated: U3\n- Hunts with no finding: U2\n- Hunts with no report: none\n"));
  });
});

test("on a directory scope a unit hunt with no report counts as not investigated and under hunts with no report", () => {
  scenario({ scope: "src/api", units: ["U1", "U2"], findings: [verified("U2-1")], bare: ["U1"] }, (_r, text) => {
    assert.equal(text.split("\n")[1], `bugs ${DOT} src/api ${DOT} 2 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 1 units not investigated.`);
    assert.ok(text.endsWith("## Coverage notes\n- Units not investigated: U1\n- Hunts with no finding: none\n- Hunts with no report: U1\n"));
  });
});

test("on the diff scope J is 0 and the units not investigated read none, however many units the map holds", () => {
  scenario({ scope: "diff", units: ["U1", "U2"], findings: [verified("A-second-1")], zeros: ["A-first"] }, (result, text) => {
    assert.equal(text.split("\n")[1], `bugs ${DOT} diff ${DOT} 2 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 0 units not investigated.`);
    assert.ok(text.endsWith("## Coverage notes\n- Units not investigated: none\n- Hunts with no finding: A-first\n- Hunts with no report: none\n"));
    assert.ok(result.stdout.startsWith("summary: units 2 | hunts 2 | confirmed 1 | not investigated 0\n"));
  });
});

test("a directory named diff (Scope: ./diff) is a directory scope: the unit no hunt covered counts as not investigated (only the bare word diff is the diff scope)", () => {
  scenario({ scope: "./diff", units: ["U1", "U2"], zeros: ["U1"] }, (result, text) => {
    assert.equal(text.split("\n")[1], `bugs ${DOT} ./diff ${DOT} 2 units mapped ${DOT} 1 hunts ${DOT} 0 confirmed findings ${DOT} 1 units not investigated.`);
    assert.ok(text.includes("- Units not investigated: U2\n"));
    assert.ok(result.stdout.startsWith("summary: units 2 | hunts 1 | confirmed 0 | not investigated 1\n"));
  });
});

test("a report of hunt A-x-y is never counted as a report of hunt A-x", () => {
  scenario({ scope: "diff", zeros: ["A-x"], files: { "A-x-y-1.md": report({ id: "A-x-y-1" }) } }, (result, text) => {
    assert.deepEqual(markers(text), []);
    assert.ok(text.includes("- Hunts with no finding: A-x\n"));
    assert.equal(result.stdout, "summary: units 0 | hunts 1 | confirmed 0 | not investigated 0\nNEXT: none\n");
  });
});

test("stdout is the summary line, then the fill block with one entry line per full entry and the cited report", () => {
  scenario(
    {
      scope: "repo",
      units: ["U1", "U2", "U3"],
      findings: [verified("U1-1", { sev: "8.0", observed: "segfault seen" }), { id: "U2-1", verdict: "INCONCLUSIVE", sev: "5.0", observed: "no oracle" }, verified("U3-1", { sev: "2.0" })],
    },
    (result) => {
      assert.equal(
        result.stdout,
        [
          "summary: units 3 | hunts 3 | confirmed 2 | not investigated 0",
          `last-line: /viber:intent ${OUT}`,
          `NEXT: fill | findings: ${OUT}`,
          `entry: 1 | reports: ${WS}/reports/U1-1.md | verdict: VERIFIED | observed: segfault seen`,
          `entry: 2 | reports: ${WS}/reports/U2-1.md | verdict: INCONCLUSIVE | observed: no oracle`,
          "",
        ].join("\n"),
      );
    },
  );
});

test("an entry whose finding has no verdict file reads observed none on its entry line", () => {
  scenario({ findings: [{ id: "U1-1" }] }, (result) => {
    assert.ok(result.stdout.includes(`entry: 1 | reports: ${WS}/reports/U1-1.md | verdict: INCONCLUSIVE | observed: none\n`));
  });
});

test("a run with no confirmed finding and no entry prints the summary and NEXT none", () => {
  scenario({ zeros: ["U1"], units: ["U1"] }, (result) => {
    assert.equal(result.stdout, "summary: units 1 | hunts 1 | confirmed 0 | not investigated 0\nNEXT: none\n");
  });
});

test("a workspace given with trailing separators, slash or backslash, is read without them and its last component is the run id", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1")] }));
  const result = runSynthesize([`${WS}/\\/`], { fs });
  assert.equal(result.exit, 0, result.stderr);
  assert.equal(findingsOf(fs).split("\n")[0], "# Findings - 20260101-000000 (bugs, repo)");
  assert.ok(result.stdout.includes(`\nNEXT: fill | findings: ${OUT}\n`), result.stdout);
});

for (const [name, missing, reason] of [
  ["run.md", `${WS}/run.md`, `run file not found: ${WS}/run.md`],
  ["ledger", LEDGER, `ledger not found: ${LEDGER}`],
] as const) {
  test(`a missing ${name} exits 2 with one error line on stderr and nothing on stdout`, () => {
    const files = build({});
    delete files[missing];
    assert.deepEqual(synthesize(fakeFs(files)), refused(reason));
  });
}

for (const [name, argv, reason] of [
  ["no workspace", [], "usage: synthesize.sh <ws> [--merge <id>,<id>[,<id>]...]... | [--merge none]"],
  ["a second workspace", [WS, "extra"], "unexpected argument: extra"],
  ["a --merge with no value", [WS, "--merge"], "--merge needs a value"],
  ["--merge none beside a group", [WS, "--merge", "none", "--merge", "U1-1,U2-1"], "--merge none cannot join merge groups"],
  ["a group naming one finding twice", [WS, "--merge", "U1-1, U1-1"], "merge group needs two findings: U1-1, U1-1"],
] as const) {
  test(`${name} exits 2 with one error line, an empty stdout and nothing written`, () => {
    const fs = fakeFs(build({ findings: [verified("U1-1"), verified("U2-1")] }));
    const before = ledgerLines(fs);
    assert.deepEqual(runSynthesize([...argv], { fs }), refused(reason));
    assert.deepEqual([fs.exists(OUT), ledgerLines(fs)], [false, before]);
  });
}

const NEAR = { loc: "src/a.ts:L10-L20" };

test("two findings of one file with overlapping ranges print one merge pair with a finding line each, and write nothing", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1", { loc: "src/a.ts:L10-L20", cls: "bugs: c1", observed: "seg" }), { id: "U2-1", loc: "src/a.ts:L15-L25", cls: "perf: c2" }] }));
  const before = ledgerLines(fs);
  const result = synthesize(fs);
  assert.deepEqual(result, {
    stdout: ["NEXT: merge", "merge?: U1-1 U2-1", "finding: U1-1 | src/a.ts:L10-L20 | bugs: c1 | seg", "finding: U2-1 | src/a.ts:L15-L25 | perf: c2 | none", ""].join("\n"),
    stderr: "",
    exit: 0,
  });
  assert.ok(!fs.exists(OUT), "no findings.md before the pairs are decided");
  assert.deepEqual(ledgerLines(fs), before);
});

test("a gap of 5 lines between two ranges of one file still prints a merge pair", () => {
  const result = synthesize(fakeFs(build({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L26-L30" })] })));
  assert.ok(result.stdout.startsWith("NEXT: merge\nmerge?: U1-1 U2-1\n"));
});

for (const [name, loc] of [
  ["a gap of 6 lines between the ranges", "src/a.ts:L27-L30"],
  ["a range in another file", "src/b.ts:L12-L18"],
  ["a LOCATION that is no path with a line range", "somewhere in a.ts"],
] as const) {
  test(`${name} prints no merge pair`, () => {
    const fs = fakeFs(build({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc })] }));
    const result = synthesize(fs);
    assert.equal(result.exit, 0);
    assert.ok(result.stdout.startsWith("summary: units 0 | hunts 2 |"), `stdout: ${result.stdout}`);
    assert.ok(fs.exists(OUT));
  });
}

const GROUP: Fixture = {
  findings: [
    { id: "U1-1", verdict: "INCONCLUSIVE", sev: "5.0", conf: "low", cls: "bugs: c1", loc: "src/a.ts:L10-L20", observed: "o1" },
    verified("U2-1", { sev: "7.0", crit: "7.5", conf: "high", cls: "perf: c2", loc: "src/a.ts:L22-L30", observed: "o2" }),
    { id: "A-first-1", verdict: "PARTIALLY VERIFIED", sev: "3.0", crit: "3.0", conf: "medium", cls: "x: c3", loc: "src/a.ts:L32-L40", observed: "o3" },
  ],
};

test("a merge group becomes one finding with the first member's title, class and name, every location, the strongest verdict and the highest severity and confidence", () => {
  const fs = fakeFs(build(GROUP));
  const result = synthesize(fs, ["--merge", "A-first-1,U2-1,U1-1"]);
  assert.equal(result.exit, 0, result.stderr);
  const text = findingsOf(fs);
  assert.deepEqual(entry(text, 1), [
    "## 1. Title U1-1",
    "SEVERITY: 7.5",
    "CONFIDENCE: high",
    "VERDICT: VERIFIED",
    "LOCATION: src/a.ts:L10-L20, src/a.ts:L22-L30, src/a.ts:L32-L40",
    "CLASS: bugs: c1",
    "<!-- finding: U1-1 -->",
    "Severity adopted from the critic: 7.5 (filed 7.0)",
    "<!-- fill -->",
  ]);
  assert.deepEqual(markers(text), ["U1-1"]);
  assert.equal(
    result.stdout,
    [
      "summary: units 0 | hunts 3 | confirmed 1 | not investigated 0",
      `last-line: /viber:intent ${OUT}`,
      `NEXT: fill | findings: ${OUT}`,
      `entry: 1 | reports: ${WS}/reports/U1-1.md, ${WS}/reports/U2-1.md, ${WS}/reports/A-first-1.md | verdict: VERIFIED | observed: o2`,
      "",
    ].join("\n"),
  );
});

test("a merged group takes one slot against the cap of ten", () => {
  const others = ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9"].map((s, i) => verified(`U${i + 3}-1`, { sev: s }));
  const fs = fakeFs(build({ findings: [verified("U1-1", { sev: "5.0", loc: "src/a.ts:L10-L20" }), verified("U2-1", { sev: "5.0", loc: "src/a.ts:L12-L22" }), ...others] }));
  const result = synthesize(fs, ["--merge", "U1-1,U2-1"]);
  assert.equal(result.exit, 0, result.stderr);
  assert.equal(markers(findingsOf(fs)).length, 10);
  assert.ok(findingsOf(fs).includes("## Further findings (0)\n"));
});

const TRIPLE: Fixture = {
  findings: [verified("U1-1", { loc: "src/a.ts:L10-L20" }), verified("U2-1", { loc: "src/a.ts:L12-L22" }), verified("U3-1", { loc: "src/a.ts:L14-L24" })],
};

test("a call with a merge group records the group and every printed pair it does not merge as apart", () => {
  const fs = fakeFs(build(TRIPLE));
  const before = ledgerLines(fs);
  const result = synthesize(fs, ["--merge", "U1-1,U2-1"]);
  assert.equal(result.exit, 0, result.stderr);
  assert.deepEqual(ledgerLines(fs), [...before, "merge: U1-1,U2-1", "apart: U1-1 U3-1", "apart: U2-1 U3-1"]);
});

test("merge none records every printed pair as apart and the run goes on to findings.md", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }));
  const before = ledgerLines(fs);
  const result = synthesize(fs, ["--merge", "none"]);
  assert.equal(result.exit, 0, result.stderr);
  assert.deepEqual(ledgerLines(fs), [...before, "apart: U1-1 U2-1"]);
  assert.deepEqual(markers(findingsOf(fs)), ["U1-1", "U2-1"]);
});

test("a later call prints only the pairs not decided yet", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }));
  synthesize(fs, ["--merge", "none"]);
  addFinding(fs, verified("U3-1", { loc: "src/a.ts:L14-L24" }));
  const result = synthesize(fs);
  assert.equal(result.exit, 0);
  assert.deepEqual(
    result.stdout.split("\n").filter((l) => l.startsWith("merge?:")),
    ["merge?: U1-1 U3-1", "merge?: U2-1 U3-1"],
  );
});

test("a merge group stays one finding on a later call that prints no pair", () => {
  const fs = fakeFs(build(TRIPLE));
  synthesize(fs, ["--merge", "U1-1,U2-1"]);
  const result = synthesize(fs);
  assert.equal(result.exit, 0);
  assert.ok(result.stdout.startsWith("summary: units 0 | hunts 3 | confirmed 2 |"), `stdout: ${result.stdout}`);
  assert.deepEqual(markers(findingsOf(fs)), ["U1-1", "U3-1"]);
});

test("a merge id naming no finding exits 2 with one error line, writes no findings.md and leaves the ledger alone", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }));
  const before = ledgerLines(fs);
  assert.deepEqual(synthesize(fs, ["--merge", "U1-1,U9-1"]), refused("merge id names no finding: U9-1"));
  assert.ok(!fs.exists(OUT));
  assert.deepEqual(ledgerLines(fs), before);
});

const ASK = "ASK: run the variant wave -> wave | end the run -> end";

const waveRows: [string, Fixture, boolean][] = [
  ["the diff scope with a confirmed finding", { scope: "diff", findings: [verified("A-first-1")] }, true],
  ["a repository scope with a unit not investigated", { scope: "repo", units: ["U1", "U2"], findings: [verified("U1-1")] }, true],
  ["a repository scope with every unit investigated", { scope: "repo", units: ["U1"], findings: [verified("U1-1")] }, false],
  ["the diff scope with no confirmed finding", { scope: "diff", findings: [{ id: "A-first-1", verdict: "INCONCLUSIVE" }] }, false],
];
for (const [name, fx, asked] of waveRows) {
  test(`${name}: the variant wave ${asked ? "is offered, seeded and recorded" : "is not offered"}`, () => {
    const fs = fakeFs(build(fx));
    const result = synthesize(fs);
    assert.equal(result.exit, 0, result.stderr);
    assert.deepEqual([result.stdout.includes(ASK), ledgerLines(fs).includes("wave-offered"), fs.exists(`${WS}/seeds.md`)], [asked, asked, asked]);
  });
}

test("the wave question closes the fill block and the seeds file holds one line per distinct confirmed class", () => {
  const fs = fakeFs(
    build({
      scope: "diff",
      findings: [
        verified("A-first-1", { cls: "bugs: unchecked cast", observed: "boom" }),
        verified("A-first-2", { cls: "bugs: unchecked cast" }),
        verified("A-second-1", { cls: "perf: n+1 query" }),
        { id: "U1-1", verdict: "INCONCLUSIVE", cls: "style: naming" },
      ],
    }),
  );
  const result = synthesize(fs);
  assert.equal(result.exit, 0, result.stderr);
  assert.ok(result.stdout.endsWith(`observed: it failed\n${ASK}\n`), `stdout: ${result.stdout}`);
  assert.equal(fs.readText(`${WS}/seeds.md`), "Seed: bugs: unchecked cast\nSeed: perf: n+1 query\n");
});

test("a wave already offered is never offered again", () => {
  const fs = fakeFs(build({ scope: "diff", findings: [verified("A-first-1")] }));
  synthesize(fs);
  const result = synthesize(fs);
  assert.equal(result.exit, 0, result.stderr);
  assert.deepEqual([result.stdout.includes("ASK:"), ledgerLines(fs).filter((l) => l === "wave-offered").length], [false, 1]);
});

/** Runs the core, fills the one entry by hand, files a later wave's finding and runs the core again. */
function rebuiltAfterWave(check: (result: SynthesizeResult, text: string) => void): void {
  const fs = fakeFs(build({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", sev: "5.0", conf: "high" }] }));
  synthesize(fs);
  put(fs, OUT, findingsOf(fs).replace("<!-- oracle -->", "needs a database oracle").replace("<!-- fill -->", "The cause is a stale cache.\n\nFix: drop the cache."));
  addFinding(fs, verified("V-1-1", { sev: "9.0" }));
  const result = synthesize(fs);
  assert.equal(result.exit, 0, result.stderr);
  check(result, findingsOf(fs));
}

test("a rebuild after the wave ranks both waves and keeps the paragraphs and the filled status of an entry already filled", () => {
  rebuiltAfterWave((_r, text) => {
    assert.ok(
      text.includes(
        [
          "## 2. Title U1-1",
          "SEVERITY: 5.0",
          "CONFIDENCE: medium",
          "VERDICT: INCONCLUSIVE",
          "STATUS: INCONCLUSIVE - needs a database oracle",
          "LOCATION: src/U1-1.ts:L10-L20",
          "CLASS: bugs: class U1-1",
          "<!-- finding: U1-1 -->",
          "The cause is a stale cache.",
          "",
          "Fix: drop the cache.",
          "",
          "## Further findings (0)",
        ].join("\n"),
      ),
      text,
    );
    assert.deepEqual(markers(text), ["V-1-1", "U1-1"]);
  });
});

test("a rebuild after the wave prints an entry line for the new entry alone, not for the filled one", () => {
  rebuiltAfterWave((result, text) => {
    assert.deepEqual(entry(text, 1).slice(-3), ["<!-- finding: V-1-1 -->", "Severity adopted from the critic: 9.0 (filed 9.0)", "<!-- fill -->"]);
    assert.equal(
      result.stdout,
      [
        "summary: units 0 | hunts 2 | confirmed 1 | not investigated 0",
        `last-line: /viber:intent ${OUT}`,
        `NEXT: fill | findings: ${OUT}`,
        `entry: 1 | reports: ${WS}/reports/V-1-1.md | verdict: VERIFIED | observed: it failed`,
        "",
      ].join("\n"),
    );
  });
});

test("with no confirmed finding stdout carries no closing line", () => {
  scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE" }] }, (result) => {
    assert.ok(!result.stdout.includes("last-line:"), `stdout: ${result.stdout}`);
  });
});

test("a findings.md that cannot be written exits 2 with one error line and an empty stdout", () => {
  const fs = fakeFs(build({ findings: [verified("U1-1")] }), { dirs: [OUT] });
  assert.deepEqual(synthesize(fs), refused(`cannot write ${OUT}`));
});
