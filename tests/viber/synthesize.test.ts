/*
 * synthesize.test.ts - proves synthesize.sh's `sh synthesize.sh <ws>` contract
 * (C6) for the part that builds findings.md: the run's ledger, the head lines of
 * each report and each critic's verdict file become the title line, the header
 * line, the full entries (cap of ten, severity 4.0 or more), the further
 * findings and the coverage notes, and stdout is the `summary:` line followed by
 * the `NEXT: fill` block with one `entry:` line per full entry; and for the merge
 * step: the undecided pairs of findings close in one file print as a `NEXT: merge`
 * block before anything is written, each `--merge` group becomes one finding, and
 * every printed pair is recorded in the ledger as merged or apart. A finding of the
 * unit re-hunt `R-U<n>` ranks right after the `U<n>` findings of its unit, and the
 * re-hunt's report counts that unit as investigated.
 *
 * synthesize.sh is `#!/bin/sh` and the skill calls it as
 * `sh "${CLAUDE_SKILL_DIR}/scripts/synthesize.sh" ...`, so every case runs
 * through forEachShell("posix", ...) via opts.shell. Each case builds its own
 * run workspace in a temp dir. Verdict files are fixtures as hunt-return.sh
 * leaves them (closing tag already stripped), so no case writes a closing tag.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/synthesize.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/synthesize.sh");

const DOT = "·";

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

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

function huntOf(id: string): string {
  return id.replace(/-\d$/, "");
}

function put(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

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
    "The body is never read by the script.",
    "",
  ].join("\n");
}

function verdictFile(f: Finding): string {
  return [
    `VERDICT: ${f.verdict}`,
    "COMMAND: sh repro.sh",
    `OBSERVED: ${f.observed ?? "it failed"}`,
    `SEVERITY: ${f.crit ?? f.sev ?? "6.0"}`,
    "",
  ].join("\n");
}

function huntLine(id: string): string {
  const unit = /^(R-)?U\d+$/.test(id) ? id.replace(/^R-/, "") : "none";
  const angle = id.startsWith("A-") ? id.slice(2) : "none";
  return `hunt: ${id} | wave: ${id.startsWith("R-") ? 2 : 1} | unit: ${unit} | angle: ${angle}`;
}

/** Builds a run workspace under `dir` and returns its path. */
function build(dir: string, fx: Fixture, name = "20260101-000000"): string {
  const ws = path.join(dir, name);
  const lensFile = path.join(dir, "bugs.md");
  const angles = fx.angles ?? ["first", "second"];
  put(lensFile, ["# Bugs lens", "", "## Hunts", ...angles.flatMap((a) => [`### ${a}`, "text", ""]), "## Excluded", "- nothing", ""].join("\n"));
  const units = fx.units ?? [];
  put(
    path.join(ws, "run.md"),
    [
      "Lens: bugs",
      `Lens file: ${lensFile}`,
      `Scope: ${fx.scope ?? "repo"}`,
      "Target root: /repo",
      "",
      "## Map",
      "## Conventions",
      "none",
      "",
      "## Units",
      ...units.map((u) => `- ${u} | src/${u}.ts | why`),
      "",
    ].join("\n"),
  );
  const findings = fx.findings ?? [];
  const hunts: string[] = [];
  for (const id of [...findings.map((f) => huntOf(f.id)), ...(fx.zeros ?? []), ...(fx.bare ?? [])]) {
    if (!hunts.includes(id)) hunts.push(id);
  }
  put(path.join(ws, "ledger.md"), hunts.map(huntLine).join("\n") + "\n");
  for (const f of findings) {
    put(path.join(ws, "reports", `${f.id}.md`), report(f));
    if (f.verdictBody !== undefined) put(path.join(ws, "verdicts", `${f.id}.md`), f.verdictBody);
    else if (f.verdict !== undefined) put(path.join(ws, "verdicts", `${f.id}.md`), verdictFile(f));
  }
  for (const id of fx.zeros ?? []) put(path.join(ws, "reports", `${id}-0.md`), "NO FINDING\nchecked: src\n");
  for (const [name, content] of Object.entries(fx.files ?? {})) put(path.join(ws, "reports", name), content);
  return ws;
}

async function synthesize(shell: Shell, ws: string, args: string[] = []): Promise<RunResult> {
  return await runScript(SUT, [ws, ...args], { shell, cwd: path.dirname(ws) });
}

/** Builds the fixture and hands the shell and the workspace to `check`, which runs the script itself. */
async function inRun(fx: Fixture, check: (shell: Shell, ws: string) => Promise<void>) {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      await check(shell, build(dir, fx));
    });
  });
}

function ledgerLines(ws: string): string[] {
  return fs.readFileSync(path.join(ws, "ledger.md"), "utf8").trimEnd().split("\n");
}

/** Files a report the way a later wave would: its report, its verdict file and its ledger line. */
function addFinding(ws: string, f: Finding) {
  put(path.join(ws, "reports", `${f.id}.md`), report(f));
  if (f.verdict !== undefined) put(path.join(ws, "verdicts", `${f.id}.md`), verdictFile(f));
  fs.appendFileSync(path.join(ws, "ledger.md"), huntLine(huntOf(f.id)) + "\n");
}

/** Builds the fixture, runs the script, hands both to `check`. */
async function scenario(fx: Fixture, check: (ws: string, result: RunResult, findings: string) => void) {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, fx);
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
      check(ws, result, fs.readFileSync(path.join(ws, "findings.md"), "utf8"));
    });
  });
}

function markers(text: string): string[] {
  return [...text.matchAll(/^<!-- finding: (.*) -->$/gm)].map((m) => m[1]);
}

/** The lines of entry `n`: its heading up to the blank line closing it. */
function entry(text: string, n: number): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${n}. `));
  const end = lines.indexOf("", start);
  return lines.slice(start, end);
}

function verified(id: string, extra: Partial<Finding> = {}): Finding {
  return { id, verdict: "VERIFIED", ...extra };
}

test("a VERIFIED finding adopts the critic severity and the entry notes it beside the filed one", async () => {
  await scenario({ findings: [verified("U1-1", { sev: "6.0", crit: "8.0", conf: "high" })] }, (_ws, _r, text) => {
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

test("a PARTIALLY VERIFIED finding adopts a lower critic severity and keeps its confidence", async () => {
  await scenario(
    { findings: [{ id: "U1-1", verdict: "PARTIALLY VERIFIED", sev: "7.0", crit: "5.5", conf: "medium" }] },
    (_ws, _r, text) => {
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
    },
  );
});

test("a REFUTED finding is dropped: no entry, no further-findings line and no count", async () => {
  await scenario(
    { findings: [{ id: "U1-1", verdict: "REFUTED", sev: "9.0" }, verified("U2-1", { sev: "5.0" })] },
    (_ws, result, text) => {
      assert.deepEqual(markers(text), ["U2-1"]);
      assert.ok(!text.includes("Title U1-1"), "a refuted finding leaves no trace in findings.md");
      assert.ok(text.includes("## Further findings (0)"));
      assert.ok(result.stdout.startsWith("summary: units 0 | hunts 2 | confirmed 1 | not investigated 0\n"));
    },
  );
});

test("an INCONCLUSIVE verdict keeps the filed severity, lowers high to medium and names the missing oracle", async () => {
  await scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", sev: "7.0", crit: "2.0", conf: "high" }] }, (_ws, _r, text) => {
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

test("an INCONCLUSIVE finding already at low confidence stays low", async () => {
  await scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", conf: "low" }] }, (_ws, _r, text) => {
    assert.ok(entry(text, 1).includes("CONFIDENCE: low"));
  });
});

test("a finding with no verdict file is INCONCLUSIVE with confidence one step lower and the filed severity", async () => {
  await scenario({ findings: [{ id: "U1-1", sev: "7.0", conf: "medium" }] }, (_ws, _r, text) => {
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

test("a verdict file holding no VERDICT line counts as no verdict", async () => {
  await scenario({ findings: [{ id: "U1-1", conf: "high", verdictBody: "COMMAND: sh repro.sh\nOBSERVED: nothing\n" }] }, (_ws, _r, text) => {
    assert.ok(entry(text, 1).includes("STATUS: INCONCLUSIVE - critic returned no verdict"));
  });
});

test("findings rank by severity, then verdict, then confidence, then hunt order", async () => {
  await scenario(
    {
      findings: [
        verified("U2-1", { sev: "7.0", conf: "low" }),
        { id: "U1-1", verdict: "INCONCLUSIVE", sev: "7.0", conf: "high" },
        verified("U4-1", { sev: "7.0", conf: "high" }),
        verified("U3-1", { sev: "7.0", conf: "high" }),
        { id: "U5-1", verdict: "PARTIALLY VERIFIED", sev: "9.0" },
      ],
    },
    (_ws, _r, text) => {
      assert.deepEqual(markers(text), ["U5-1", "U3-1", "U4-1", "U2-1", "U1-1"]);
    },
  );
});

test("equal findings rank by hunt order: U hunts by number, then angles in the lens order, then V hunts, then k", async () => {
  await scenario(
    {
      angles: ["first", "second"],
      findings: [
        verified("V-1-1"),
        verified("A-second-1"),
        verified("U10-1"),
        verified("A-first-2"),
        verified("A-first-1"),
        verified("U9-1"),
      ],
    },
    (_ws, _r, text) => {
      assert.deepEqual(markers(text), ["U9-1", "U10-1", "A-first-1", "A-first-2", "A-second-1", "V-1-1"]);
    },
  );
});

test("a finding of the unit re-hunt R-U<n> ranks right after the U<n> findings of its unit, ahead of the next unit, the angles and the V hunts", async () => {
  await scenario(
    {
      angles: ["first"],
      findings: [
        verified("V-1-1"),
        verified("A-first-1"),
        verified("R-U2-1"),
        verified("U3-1"),
        verified("U2-2"),
        verified("U2-1"),
        verified("U1-1"),
        verified("R-U2-2"),
      ],
    },
    (_ws, _r, text) => {
      assert.deepEqual(markers(text), ["U1-1", "U2-1", "U2-2", "R-U2-1", "R-U2-2", "U3-1", "A-first-1", "V-1-1"]);
    },
  );
});

test("a unit whose own hunt left no report counts as investigated once its re-hunt R-U<n> left one", async () => {
  await scenario(
    { scope: "repo", units: ["U1", "U2", "U3"], findings: [verified("R-U2-1"), verified("U1-1")], bare: ["U2"] },
    (_ws, result, text) => {
      assert.ok(text.includes("- Units not investigated: U3\n"), text);
      assert.ok(text.includes("- Hunts with no report: U2\n"), text);
      assert.ok(result.stdout.startsWith("summary: units 3 | hunts 3 | confirmed 2 | not investigated 1\n"), result.stdout);
    },
  );
});

test("only the first ten findings get full entries and the eleventh drops into the further-findings list", async () => {
  const sevs = ["9.9", "9.8", "9.7", "9.6", "9.5", "9.4", "9.3", "9.2", "9.1", "9.0", "8.9"];
  await scenario({ findings: sevs.map((s, i) => verified(`U${i + 1}-1`, { sev: s })) }, (ws, _r, text) => {
    assert.equal(markers(text).length, 10);
    assert.ok(text.includes("\n## 10. Title U10-1\n"));
    assert.ok(!text.includes("## 11. "));
    assert.ok(
      text.includes(`## Further findings (1)\n8.9 ${DOT} src/U11-1.ts:L10-L20 ${DOT} bugs: class U11-1 ${DOT} Title U11-1 ${DOT} ${ws}/reports/U11-1.md\n`),
    );
  });
});

test("a severity below 4.0 never gets a full entry even with slots left, and 4.0 does", async () => {
  await scenario(
    { findings: [verified("U1-1", { sev: "3.9" }), verified("U2-1", { sev: "4.0" })] },
    (ws, _r, text) => {
      assert.deepEqual(markers(text), ["U2-1"]);
      assert.ok(
        text.includes(`## Further findings (1)\n3.9 ${DOT} src/U1-1.ts:L10-L20 ${DOT} bugs: class U1-1 ${DOT} Title U1-1 ${DOT} ${ws}/reports/U1-1.md\n`),
      );
    },
  );
});

test("the title line, the header line and the three coverage lines hold the run's counts", async () => {
  await scenario(
    {
      scope: "repo",
      units: ["U1", "U2", "U3"],
      findings: [verified("U1-1")],
      zeros: ["U2"],
    },
    (_ws, _r, text) => {
      const lines = text.split("\n");
      assert.equal(lines[0], "# Findings - 20260101-000000 (bugs, repo)");
      assert.equal(lines[1], `bugs ${DOT} repo ${DOT} 3 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 1 units not investigated.`);
      assert.ok(
        text.endsWith(
          "## Coverage notes\n- Units not investigated: U3\n- Hunts with no finding: U2\n- Hunts with no report: none\n",
        ),
      );
    },
  );
});

const WINDOWS = process.platform === "win32";
const RUN_TITLE = "# Findings - 20260101-000000 (bugs, repo)";
const SPELLINGS: [string, (ws: string) => string][] = [
  ["backslash separators", (ws) => ws.replaceAll("/", "\\")],
  ["backslash separators and a trailing backslash", (ws) => ws.replaceAll("/", "\\") + "\\"],
  ["slash separators and a trailing slash", (ws) => ws.replaceAll("\\", "/") + "/"],
  ["slash separators and a trailing backslash", (ws) => ws.replaceAll("\\", "/") + "\\"],
  ["backslash separators and a trailing slash", (ws) => ws.replaceAll("/", "\\") + "/"],
];

for (const [spelling, spell] of SPELLINGS) {
  test(`a workspace written with ${spelling} gets the run id of its last component in findings.md`, { skip: WINDOWS ? false : "a Windows path resolves only on win32" }, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-synth-", async (dir) => {
        const ws = build(dir, { findings: [verified("U1-1")] });
        const result = await runScript(SUT, [spell(ws)], { shell, cwd: dir });
        assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
        assert.equal(fs.readFileSync(path.join(ws, "findings.md"), "utf8").split("\n")[0], RUN_TITLE);
      });
    });
  });
}

test("a workspace whose last component holds a backslash gets the run id after the backslash", { skip: WINDOWS ? "a backslash is a separator on win32, never a file name character" : false }, async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, { findings: [verified("U1-1")] }, "code-auditor\\20260101-000000");
      const result = await runScript(SUT, [ws], { shell, cwd: dir });
      assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
      assert.equal(fs.readFileSync(path.join(ws, "findings.md"), "utf8").split("\n")[0], RUN_TITLE);
    });
  });
});

test("on a directory scope a unit hunt with no report counts as not investigated and under hunts with no report", async () => {
  await scenario(
    { scope: "src/api", units: ["U1", "U2"], findings: [verified("U2-1")], bare: ["U1"] },
    (_ws, _r, text) => {
      assert.equal(text.split("\n")[1], `bugs ${DOT} src/api ${DOT} 2 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 1 units not investigated.`);
      assert.ok(
        text.endsWith(
          "## Coverage notes\n- Units not investigated: U1\n- Hunts with no finding: none\n- Hunts with no report: U1\n",
        ),
      );
    },
  );
});

test("on the diff scope J is 0 and the units not investigated read none, however many units the map holds", async () => {
  await scenario(
    { scope: "diff", units: ["U1", "U2"], findings: [verified("A-second-1")], zeros: ["A-first"] },
    (_ws, result, text) => {
      assert.equal(text.split("\n")[1], `bugs ${DOT} diff ${DOT} 2 units mapped ${DOT} 2 hunts ${DOT} 1 confirmed findings ${DOT} 0 units not investigated.`);
      assert.ok(
        text.endsWith(
          "## Coverage notes\n- Units not investigated: none\n- Hunts with no finding: A-first\n- Hunts with no report: none\n",
        ),
      );
      assert.ok(result.stdout.startsWith("summary: units 2 | hunts 2 | confirmed 1 | not investigated 0\n"));
    },
  );
});

test("a directory named diff (Scope: ./diff) is a directory scope: the unit no hunt covered counts as not investigated (only the bare word diff is the diff scope)", async () => {
  await scenario(
    { scope: "./diff", units: ["U1", "U2"], zeros: ["U1"] },
    (_ws, result, text) => {
      assert.equal(text.split("\n")[1], `bugs ${DOT} ./diff ${DOT} 2 units mapped ${DOT} 1 hunts ${DOT} 0 confirmed findings ${DOT} 1 units not investigated.`);
      assert.ok(text.includes("- Units not investigated: U2\n"));
      assert.ok(result.stdout.startsWith("summary: units 2 | hunts 1 | confirmed 0 | not investigated 1\n"));
    },
  );
});

test("a report of hunt A-x-y is never counted as a report of hunt A-x", async () => {
  await scenario(
    {
      scope: "diff",
      zeros: ["A-x"],
      files: { "A-x-y-1.md": report({ id: "A-x-y-1" }) },
    },
    (_ws, result, text) => {
      assert.deepEqual(markers(text), []);
      assert.ok(text.includes("- Hunts with no finding: A-x\n"));
      assert.equal(result.stdout, "summary: units 0 | hunts 1 | confirmed 0 | not investigated 0\nNEXT: none\n");
    },
  );
});

test("stdout is the summary line, then the fill block with one entry line per full entry and the cited report", async () => {
  await scenario(
    {
      scope: "repo",
      units: ["U1", "U2", "U3"],
      findings: [
        verified("U1-1", { sev: "8.0", observed: "segfault seen" }),
        { id: "U2-1", verdict: "INCONCLUSIVE", sev: "5.0", observed: "no oracle" },
        verified("U3-1", { sev: "2.0" }),
      ],
    },
    (ws, result) => {
      assert.equal(
        result.stdout,
        [
          "summary: units 3 | hunts 3 | confirmed 2 | not investigated 0",
          `last-line: /viber:intent ${ws}/findings.md`,
          `NEXT: fill | findings: ${ws}/findings.md`,
          `entry: 1 | reports: ${ws}/reports/U1-1.md | verdict: VERIFIED | observed: segfault seen`,
          `entry: 2 | reports: ${ws}/reports/U2-1.md | verdict: INCONCLUSIVE | observed: no oracle`,
          "",
        ].join("\n"),
      );
    },
  );
});

test("an entry whose finding has no verdict file reads observed none on its entry line", async () => {
  await scenario({ findings: [{ id: "U1-1" }] }, (ws, result) => {
    assert.ok(result.stdout.includes(`entry: 1 | reports: ${ws}/reports/U1-1.md | verdict: INCONCLUSIVE | observed: none\n`));
  });
});

test("a run with no confirmed finding and no entry prints the summary and NEXT none", async () => {
  await scenario({ zeros: ["U1"], units: ["U1"] }, (_ws, result) => {
    assert.equal(result.stdout, "summary: units 1 | hunts 1 | confirmed 0 | not investigated 0\nNEXT: none\n");
  });
});

test("a missing run.md exits 2 with one error line on stderr and nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, {});
      fs.rmSync(path.join(ws, "run.md"));
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n$/);
    });
  });
});

test("a missing ledger exits 2 with one error line on stderr and nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, {});
      fs.rmSync(path.join(ws, "ledger.md"));
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n$/);
    });
  });
});

const NEAR = { loc: "src/a.ts:L10-L20" };

test("two findings of one file with overlapping ranges print one merge pair with a finding line each, and write nothing", async () => {
  await inRun(
    {
      findings: [
        verified("U1-1", { loc: "src/a.ts:L10-L20", cls: "bugs: c1", observed: "seg" }),
        { id: "U2-1", loc: "src/a.ts:L15-L25", cls: "perf: c2" },
      ],
    },
    async (shell, ws) => {
      const before = ledgerLines(ws);
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0);
      assert.equal(
        result.stdout,
        [
          "NEXT: merge",
          "merge?: U1-1 U2-1",
          "finding: U1-1 | src/a.ts:L10-L20 | bugs: c1 | seg",
          "finding: U2-1 | src/a.ts:L15-L25 | perf: c2 | none",
          "",
        ].join("\n"),
      );
      assert.ok(!fs.existsSync(path.join(ws, "findings.md")), "no findings.md before the pairs are decided");
      assert.deepEqual(ledgerLines(ws), before);
    },
  );
});

test("a gap of 5 lines between two ranges of one file still prints a merge pair", async () => {
  await inRun(
    { findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L26-L30" })] },
    async (shell, ws) => {
      const result = await synthesize(shell, ws);
      assert.ok(result.stdout.startsWith("NEXT: merge\nmerge?: U1-1 U2-1\n"));
    },
  );
});

const apartRows: [string, string][] = [
  ["a gap of 6 lines between the ranges", "src/a.ts:L27-L30"],
  ["a range in another file", "src/b.ts:L12-L18"],
  ["a LOCATION that is no path with a line range", "somewhere in a.ts"],
];
for (const [name, loc] of apartRows) {
  test(`${name} prints no merge pair`, async () => {
    await inRun({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc })] }, async (shell, ws) => {
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0);
      assert.ok(result.stdout.startsWith("summary: units 0 | hunts 2 |"), `stdout: ${result.stdout}`);
      assert.ok(fs.existsSync(path.join(ws, "findings.md")));
    });
  });
}

const GROUP: Fixture = {
  findings: [
    { id: "U1-1", verdict: "INCONCLUSIVE", sev: "5.0", conf: "low", cls: "bugs: c1", loc: "src/a.ts:L10-L20", observed: "o1" },
    verified("U2-1", { sev: "7.0", crit: "7.5", conf: "high", cls: "perf: c2", loc: "src/a.ts:L22-L30", observed: "o2" }),
    { id: "A-first-1", verdict: "PARTIALLY VERIFIED", sev: "3.0", crit: "3.0", conf: "medium", cls: "x: c3", loc: "src/a.ts:L32-L40", observed: "o3" },
  ],
};

test("a merge group becomes one finding with the first member's title, class and name, every location, the strongest verdict and the highest severity and confidence", async () => {
  await inRun(GROUP, async (shell, ws) => {
    const result = await synthesize(shell, ws, ["--merge", "A-first-1,U2-1,U1-1"]);
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(path.join(ws, "findings.md"), "utf8");
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
        `last-line: /viber:intent ${ws}/findings.md`,
        `NEXT: fill | findings: ${ws}/findings.md`,
        `entry: 1 | reports: ${ws}/reports/U1-1.md, ${ws}/reports/U2-1.md, ${ws}/reports/A-first-1.md | verdict: VERIFIED | observed: o2`,
        "",
      ].join("\n"),
    );
  });
});

test("a merged group takes one slot against the cap of ten", async () => {
  const others = ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9"].map((s, i) => verified(`U${i + 3}-1`, { sev: s }));
  await inRun(
    { findings: [verified("U1-1", { sev: "5.0", loc: "src/a.ts:L10-L20" }), verified("U2-1", { sev: "5.0", loc: "src/a.ts:L12-L22" }), ...others] },
    async (shell, ws) => {
      const result = await synthesize(shell, ws, ["--merge", "U1-1,U2-1"]);
      assert.equal(result.status, 0, result.stderr);
      const text = fs.readFileSync(path.join(ws, "findings.md"), "utf8");
      assert.equal(markers(text).length, 10);
      assert.ok(text.includes("## Further findings (0)\n"));
    },
  );
});

const TRIPLE: Fixture = {
  findings: [
    verified("U1-1", { loc: "src/a.ts:L10-L20" }),
    verified("U2-1", { loc: "src/a.ts:L12-L22" }),
    verified("U3-1", { loc: "src/a.ts:L14-L24" }),
  ],
};

test("a call with a merge group records the group and every printed pair it does not merge as apart", async () => {
  await inRun(TRIPLE, async (shell, ws) => {
    const before = ledgerLines(ws);
    const result = await synthesize(shell, ws, ["--merge", "U1-1,U2-1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(ledgerLines(ws), [...before, "merge: U1-1,U2-1", "apart: U1-1 U3-1", "apart: U2-1 U3-1"]);
  });
});

test("merge none records every printed pair as apart and the run goes on to findings.md", async () => {
  await inRun({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }, async (shell, ws) => {
    const before = ledgerLines(ws);
    const result = await synthesize(shell, ws, ["--merge", "none"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(ledgerLines(ws), [...before, "apart: U1-1 U2-1"]);
    assert.deepEqual(markers(fs.readFileSync(path.join(ws, "findings.md"), "utf8")), ["U1-1", "U2-1"]);
  });
});

test("a later call prints only the pairs not decided yet", async () => {
  await inRun({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }, async (shell, ws) => {
    await synthesize(shell, ws, ["--merge", "none"]);
    addFinding(ws, verified("U3-1", { loc: "src/a.ts:L14-L24" }));
    const result = await synthesize(shell, ws);
    assert.equal(result.status, 0);
    assert.deepEqual(
      result.stdout.split("\n").filter((l) => l.startsWith("merge?:")),
      ["merge?: U1-1 U3-1", "merge?: U2-1 U3-1"],
    );
  });
});

test("a merge group stays one finding on a later call that prints no pair", async () => {
  await inRun(TRIPLE, async (shell, ws) => {
    await synthesize(shell, ws, ["--merge", "U1-1,U2-1"]);
    const result = await synthesize(shell, ws);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.startsWith("summary: units 0 | hunts 3 | confirmed 2 |"), `stdout: ${result.stdout}`);
    assert.deepEqual(markers(fs.readFileSync(path.join(ws, "findings.md"), "utf8")), ["U1-1", "U3-1"]);
  });
});

test("a merge id naming no finding exits 2 with one error line, writes no findings.md and leaves the ledger alone", async () => {
  await inRun({ findings: [verified("U1-1", NEAR), verified("U2-1", { loc: "src/a.ts:L12-L22" })] }, async (shell, ws) => {
    const before = ledgerLines(ws);
    const result = await synthesize(shell, ws, ["--merge", "U1-1,U9-1"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]+\n$/);
    assert.ok(!fs.existsSync(path.join(ws, "findings.md")));
    assert.deepEqual(ledgerLines(ws), before);
  });
});

const ASK = "ASK: run the variant wave -> wave | end the run -> end";

const waveRows: [string, Fixture, boolean][] = [
  ["the diff scope with a confirmed finding", { scope: "diff", findings: [verified("A-first-1")] }, true],
  [
    "a repository scope with a unit not investigated",
    { scope: "repo", units: ["U1", "U2"], findings: [verified("U1-1")] },
    true,
  ],
  [
    "a repository scope with every unit investigated",
    { scope: "repo", units: ["U1"], findings: [verified("U1-1")] },
    false,
  ],
  ["the diff scope with no confirmed finding", { scope: "diff", findings: [{ id: "A-first-1", verdict: "INCONCLUSIVE" }] }, false],
];
for (const [name, fx, asked] of waveRows) {
  test(`${name}: the variant wave ${asked ? "is offered, seeded and recorded" : "is not offered"}`, async () => {
    await inRun(fx, async (shell, ws) => {
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        [result.stdout.includes(ASK), ledgerLines(ws).includes("wave-offered"), fs.existsSync(path.join(ws, "seeds.md"))],
        [asked, asked, asked],
      );
    });
  });
}

test("the wave question closes the fill block and the seeds file holds one line per distinct confirmed class", async () => {
  await inRun(
    {
      scope: "diff",
      findings: [
        verified("A-first-1", { cls: "bugs: unchecked cast", observed: "boom" }),
        verified("A-first-2", { cls: "bugs: unchecked cast" }),
        verified("A-second-1", { cls: "perf: n+1 query" }),
        { id: "U1-1", verdict: "INCONCLUSIVE", cls: "style: naming" },
      ],
    },
    async (shell, ws) => {
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.endsWith(`observed: it failed\n${ASK}\n`), `stdout: ${result.stdout}`);
      assert.equal(fs.readFileSync(path.join(ws, "seeds.md"), "utf8"), "Seed: bugs: unchecked cast\nSeed: perf: n+1 query\n");
    },
  );
});

test("a wave already offered is never offered again", async () => {
  await inRun({ scope: "diff", findings: [verified("A-first-1")] }, async (shell, ws) => {
    await synthesize(shell, ws);
    const result = await synthesize(shell, ws);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      [result.stdout.includes("ASK:"), ledgerLines(ws).filter((l) => l === "wave-offered").length],
      [false, 1],
    );
  });
});

/** Runs the script, fills the one entry by hand, files a later wave's finding and runs the script again. */
async function rebuiltAfterWave(check: (ws: string, result: RunResult, text: string) => void) {
  await inRun({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE", sev: "5.0", conf: "high" }] }, async (shell, ws) => {
    await synthesize(shell, ws);
    const file = path.join(ws, "findings.md");
    const filled = fs
      .readFileSync(file, "utf8")
      .replace("<!-- oracle -->", "needs a database oracle")
      .replace("<!-- fill -->", "The cause is a stale cache.\n\nFix: drop the cache.");
    fs.writeFileSync(file, filled);
    addFinding(ws, verified("V-1-1", { sev: "9.0" }));
    const result = await synthesize(shell, ws);
    assert.equal(result.status, 0, result.stderr);
    check(ws, result, fs.readFileSync(file, "utf8"));
  });
}

test("a rebuild after the wave ranks both waves and keeps the paragraphs and the filled status of an entry already filled", async () => {
  await rebuiltAfterWave((_ws, _r, text) => {
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

test("a rebuild after the wave prints an entry line for the new entry alone, not for the filled one", async () => {
  await rebuiltAfterWave((ws, result, text) => {
    assert.deepEqual(entry(text, 1).slice(-3), [
      "<!-- finding: V-1-1 -->",
      "Severity adopted from the critic: 9.0 (filed 9.0)",
      "<!-- fill -->",
    ]);
    assert.equal(
      result.stdout,
      [
        "summary: units 0 | hunts 2 | confirmed 1 | not investigated 0",
        `last-line: /viber:intent ${ws}/findings.md`,
        `NEXT: fill | findings: ${ws}/findings.md`,
        `entry: 1 | reports: ${ws}/reports/V-1-1.md | verdict: VERIFIED | observed: it failed`,
        "",
      ].join("\n"),
    );
  });
});

test("with no confirmed finding stdout carries no closing line", async () => {
  await scenario({ findings: [{ id: "U1-1", verdict: "INCONCLUSIVE" }] }, (_ws, result) => {
    assert.ok(!result.stdout.includes("last-line:"), `stdout: ${result.stdout}`);
  });
});
