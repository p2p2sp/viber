/*
 * synthesize.test.ts - proves synthesize.sh's `sh synthesize.sh <ws>` contract
 * (C6) for the part that builds findings.md: the run's ledger, the head lines of
 * each report and each critic's verdict file become the title line, the header
 * line, the full entries (cap of ten, severity 4.0 or more), the further
 * findings and the coverage notes, and stdout is the `summary:` line followed by
 * the `NEXT: fill` block with one `entry:` line per full entry.
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
  const unit = /^U\d+$/.test(id) ? id : "none";
  const angle = id.startsWith("A-") ? id.slice(2) : "none";
  return `hunt: ${id} | wave: 1 | unit: ${unit} | angle: ${angle}`;
}

/** Builds a run workspace under `dir` and returns its path. */
function build(dir: string, fx: Fixture): string {
  const ws = path.join(dir, "20260101-000000");
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

async function synthesize(shell: Shell, ws: string): Promise<RunResult> {
  return await runScript(SUT, [ws], { shell, cwd: path.dirname(ws) });
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
