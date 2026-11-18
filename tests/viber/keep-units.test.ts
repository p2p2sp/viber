/*
 * keep-units.test.ts - proves keep-units.sh's `sh keep-units.sh <ws>` contract
 * (C4) for the map gate and the hunters of a scope whose hunts fit the budget:
 * a trailing closing tag of map.md is stripped before the gate; a missing file or
 * heading prints the mapper block once more with `retry` and, on the second miss,
 * the stop line; a `none:` units section stops with its reason; a passed gate
 * appends `## Map` and map.md to run.md once however often the script runs; the
 * diff scope prints one hunter block per angle of the lens's `## Hunts`, a
 * directory or repo scope with no more units than its budget one per unit; every
 * printed hunt is a `hunt:` ledger line and a later call prints `NEXT: none`.
 * Above the budget the first call prints the scout batches (8 units each, `model:
 * sonnet` on the security lens) and the `scouts:` ledger line, the next call sends
 * the unscored units once to `-retry` batches (`scouts-retried`), and every call
 * after that prints the hunter blocks of the kept units: highest score first, equal
 * scores in map order, still unscored units after every scored one. Score files that
 * end on a closing tag or hold a line that is no score line still yield their scores.
 *
 * keep-units.sh is `#!/bin/sh` and the skill invokes it through `sh`, so every case
 * runs through forEachShell("posix", ...) via opts.shell. Each case builds its own
 * temp workspace; the lens and run files are small fixtures, never a shipped lens.
 * Every closing-tag fixture is built from an escape (`\x3c`), so no line of this
 * file is a bare closing tag and orphan-tags.unit.test.ts stays green over it.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/keep-units.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/keep-units.sh");
const SKILL_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/code-auditor"));
const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));

const CONTENT = "\x3c/content>";

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

function lines(...rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

/** The four headings of a map, in order, with the given `## Units` lines. */
function mapOf(units: string[]): string {
  return lines(
    "## Conventions",
    "build: none; fast test: node --test",
    "",
    "## History",
    "Already fixed: 0 commits",
    "",
    "## Severity calibration",
    "- 9-10 data loss",
    "",
    "## Units",
    ...units,
  );
}

function unitLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `- U${i + 1} | src/m${i + 1} | why ${i + 1}`);
}

interface Frame {
  lens?: string;
  scope?: string;
  map?: string | null;
  worktree?: boolean;
  angles?: string[];
}

/** Writes lens.md, run.md and (unless null) map.md under `dir`, returns the workspace. */
function frame(dir: string, opts: Frame = {}): { ws: string; lensFile: string; runBefore: string } {
  const ws = slash(path.join(dir, "ws"));
  fs.mkdirSync(path.join(ws, "reports"), { recursive: true });
  const lensFile = `${ws}/lens.md`;
  const angles = opts.angles ?? ["alpha", "beta"];
  fs.writeFileSync(
    lensFile,
    lines(
      "# Lens",
      "Intro.",
      "",
      "## Hunts",
      ...angles.flatMap((slug) => [`### ${slug}`, "what to look for.", ""]),
      "## Excluded",
      "### not-an-angle",
      "",
      "## Verify",
      `Worktree: ${opts.worktree ? "required" : "none"}`,
    ),
  );
  const run = lines(
    `Lens: ${opts.lens ?? "bugs"}`,
    `Lens file: ${lensFile}`,
    `Scope: ${opts.scope ?? "diff"}`,
    `Target root: ${slash(dir)}`,
  );
  fs.writeFileSync(path.join(ws, "run.md"), run);
  if (opts.map !== null) fs.writeFileSync(path.join(ws, "map.md"), opts.map ?? mapOf(unitLines(2)));
  return { ws, lensFile, runBefore: run };
}

async function run(shell: Shell, ws: string): Promise<RunResult> {
  return await runScript(SUT, [ws], { shell, cwd: path.dirname(ws) });
}

function read(ws: string, name: string): string {
  return fs.readFileSync(path.join(ws, name), "utf-8");
}

function ledgerOf(ws: string): string {
  return fs.existsSync(path.join(ws, "ledger.md")) ? read(ws, "ledger.md") : "";
}

test("a trailing closing tag of map.md is stripped before the gate, so the appended map never carries it", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const map = mapOf(unitLines(2));
      const { ws, runBefore } = frame(dir, { map: `${map}${CONTENT}\n` });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^hunters-at-once: 16\nNEXT: hunter \| id: A-alpha \| background\n/);
      assert.equal(read(ws, "map.md"), map);
      assert.equal(read(ws, "run.md"), `${runBefore}\n## Map\n${map}`);
    });
  });
});

test("a map.md that is missing prints the mapper block once more with retry, then the stop line on the next call", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { map: null });
      const first = await run(shell, ws);
      assert.equal(first.status, 0, `stderr=${first.stderr}`);
      assert.equal(
        slash(first.stdout),
        lines("NEXT: mapper | retry", `Run file: ${ws}/run.md`, `Lens file: ${lensFile}`, `Signals: ${ws}/signals.md`, `Output: ${ws}/map.md`),
      );
      assert.equal(ledgerOf(ws), "mapper-retried\n");
      const second = await run(shell, ws);
      assert.equal(second.status, 0, `stderr=${second.stderr}`);
      assert.equal(second.stdout, "STOP: code-auditor: map unavailable after two attempts\n");
    });
  });
});

const HEADINGS = ["## Conventions", "## History", "## Severity calibration", "## Units"];

for (const missing of HEADINGS) {
  test(`a map.md lacking the heading ${missing} prints the mapper retry block, then the stop line on the next call`, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("keep-units-", async (dir) => {
        const map = mapOf(unitLines(2)).replace(`${missing}\n`, "");
        const { ws } = frame(dir, { map });
        const first = await run(shell, ws);
        assert.equal(first.status, 0, `stderr=${first.stderr}`);
        assert.match(first.stdout, /^NEXT: mapper \| retry\n/);
        const second = await run(shell, ws);
        assert.equal(second.stdout, "STOP: code-auditor: map unavailable after two attempts\n");
        assert.equal(read(ws, "run.md").includes("## Map"), false);
      });
    });
  });
}

test("a map whose second attempt holds all four headings passes the gate after one retry", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { map: null });
      await run(shell, ws);
      fs.writeFileSync(path.join(ws, "map.md"), mapOf(unitLines(2)));
      const second = await run(shell, ws);
      assert.match(second.stdout, /^hunters-at-once: 16\nNEXT: hunter \| id: A-alpha/);
    });
  });
});

test("a Units section reading none: <reason> stops with the nothing-to-audit line and appends no map", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, runBefore } = frame(dir, { lens: "web-performance", map: mapOf(["none: no frontend in this repository"]) });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "STOP: code-auditor: nothing to audit for web-performance: no frontend in this repository\n");
      assert.equal(read(ws, "run.md"), runBefore);
      assert.equal(ledgerOf(ws), "");
    });
  });
});

test("a passed gate appends ## Map and map.md verbatim to run.md once, however often the script runs", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const map = mapOf(unitLines(2));
      const { ws, runBefore } = frame(dir, { map });
      await run(shell, ws);
      await run(shell, ws);
      await run(shell, ws);
      assert.equal(read(ws, "run.md"), `${runBefore}\n## Map\n${map}`);
      assert.equal(ledgerOf(ws).split("\n").filter((row) => row === "map-appended").length, 1);
    });
  });
});

test("the diff scope prints one hunter block per angle of the lens's Hunts, none for a heading of another section", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { angles: ["wrong-result", "race-state"] });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const block = (slug: string) =>
        lines(
          `NEXT: hunter | id: A-${slug} | background`,
          `Run file: ${ws}/run.md`,
          `Lens file: ${lensFile}`,
          `Schema: ${SKILL_DIR}/references/synthesis.md`,
          `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
          `Hunt: A-${slug}`,
          `Angle: ${slug}`,
          `Reports: ${ws}/reports/A-${slug}`,
        );
      assert.equal(slash(result.stdout), `hunters-at-once: 16\n${block("wrong-result")}${block("race-state")}`);
    });
  });
});

test("a worktree lens on the diff scope adds the worktree script, the hunt's worktree and the overlay script to each block", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { worktree: true, angles: ["only"] });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(
        slash(result.stdout).endsWith(
          lines(
            `Reports: ${ws}/reports/A-only`,
            `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
            `Worktree: ${ws}/worktrees/A-only`,
            `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
          ),
        ),
        result.stdout,
      );
    });
  });
});

test("a directory scope with no more units than 8 prints one hunter block per unit, the unit line verbatim, id U<n>", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", map: mapOf(unitLines(8)) });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const out = slash(result.stdout);
      assert.equal(out.split("NEXT: hunter").length - 1, 8);
      assert.ok(
        out.includes(
          lines(
            "NEXT: hunter | id: U3 | background",
            `Run file: ${ws}/run.md`,
            `Lens file: ${lensFile}`,
            `Schema: ${SKILL_DIR}/references/synthesis.md`,
            `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
            "Hunt: U3",
            "Unit: - U3 | src/m3 | why 3",
            `Reports: ${ws}/reports/U3`,
          ),
        ),
        out,
      );
      assert.equal(out.includes("Angle:"), false);
    });
  });
});

test("a repo scope takes up to 16 units where a directory scope stops at 8 (9 units: nine blocks on repo)", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "repo", map: mapOf(unitLines(9)) });
      const result = await run(shell, ws);
      assert.equal(result.stdout.split("NEXT: hunter").length - 1, 9);
    });
  });
});

test("a worktree lens on a directory scope adds the worktree lines but no overlay script", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "repo", worktree: true, map: mapOf(unitLines(1)) });
      const result = await run(shell, ws);
      const out = slash(result.stdout);
      assert.ok(out.includes(`Worktree script: ${SKILL_DIR}/scripts/worktree.sh\nWorktree: ${ws}/worktrees/U1\n`), out);
      assert.equal(out.includes("Overlay script:"), false);
    });
  });
});

test("the tests lens prints hunters-at-once: 4 where every other lens prints 16", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { lens: "tests" });
      const result = await run(shell, ws);
      assert.match(result.stdout, /^hunters-at-once: 4\nNEXT: hunter/);
    });
  });
});

test("every printed hunt is a hunt ledger line, and a later call with wave 1 hunts in the ledger prints NEXT: none", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { angles: ["alpha", "beta"] });
      await run(shell, ws);
      assert.equal(
        ledgerOf(ws),
        lines(
          "map-appended",
          "hunt: A-alpha | wave: 1 | unit: none | angle: alpha",
          "hunt: A-beta | wave: 1 | unit: none | angle: beta",
        ),
      );
      const again = await run(shell, ws);
      assert.equal(again.status, 0, `stderr=${again.stderr}`);
      assert.equal(again.stdout, "NEXT: none\n");
    });
  });
});

test("a unit hunt is recorded with its unit id and no angle", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "src", map: mapOf(unitLines(2)) });
      await run(shell, ws);
      assert.equal(
        ledgerOf(ws),
        lines("map-appended", "hunt: U1 | wave: 1 | unit: U1 | angle: none", "hunt: U2 | wave: 1 | unit: U2 | angle: none"),
      );
    });
  });
});

/** One score line of a scout's output. */
function score(unit: number, value: number): string {
  return `{"unit":"U${unit}","score":${value},"reason":"r"}`;
}

function writeScores(ws: string, name: string, rows: string[]): void {
  fs.mkdirSync(path.join(ws, "scores"), { recursive: true });
  fs.writeFileSync(path.join(ws, "scores", `${name}.md`), lines(...rows));
}

function hunterIds(stdout: string): string[] {
  return [...stdout.matchAll(/^NEXT: hunter \| id: (\S+) \| background$/gm)].map((m) => m[1]);
}

test("above the budget with no scouts line, one scout block per batch of 8 units in map order is printed and recorded as one scouts line", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        lines(
          "NEXT: scout | id: S1",
          `Run file: ${ws}/run.md`,
          `Lens file: ${lensFile}`,
          `Out: ${ws}/scores/S1.md`,
          "Unit: - U1 | src/m1 | why 1",
          "Unit: - U2 | src/m2 | why 2",
          "Unit: - U3 | src/m3 | why 3",
          "Unit: - U4 | src/m4 | why 4",
          "Unit: - U5 | src/m5 | why 5",
          "Unit: - U6 | src/m6 | why 6",
          "Unit: - U7 | src/m7 | why 7",
          "Unit: - U8 | src/m8 | why 8",
          "NEXT: scout | id: S2",
          `Run file: ${ws}/run.md`,
          `Lens file: ${lensFile}`,
          `Out: ${ws}/scores/S2.md`,
          "Unit: - U9 | src/m9 | why 9",
          "Unit: - U10 | src/m10 | why 10",
        ),
      );
      assert.equal(ledgerOf(ws), lines("map-appended", "scouts: S1,S2"));
    });
  });
});

test("the security lens passes model: sonnet on every scout block", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { lens: "security", scope: "src", map: mapOf(unitLines(9)) });
      const first = await run(shell, ws);
      assert.ok(first.stdout.includes("NEXT: scout | id: S1 | model: sonnet\n"), first.stdout);
      assert.ok(first.stdout.includes("NEXT: scout | id: S2 | model: sonnet\n"), first.stdout);
    });
  });
});

test("the security lens passes model: sonnet on the scout retry block", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { lens: "security", scope: "src", map: mapOf(unitLines(9)) });
      await run(shell, ws);
      const second = await run(shell, ws);
      assert.ok(second.stdout.startsWith("NEXT: scout | id: S1-retry | model: sonnet\n"), second.stdout);
    });
  });
});

test("a repo scope scouts only above 16 units: 17 units print three batches (8, 8 and 1)", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "repo", map: mapOf(unitLines(17)) });
      const result = await run(shell, ws);
      assert.equal(result.stdout.split("NEXT: scout").length - 1, 3);
      assert.equal(ledgerOf(ws), lines("map-appended", "scouts: S1,S2,S3"));
    });
  });
});

test("on the next call the units with no score line, a missing score file's units included, go once to retry batches recorded as scouts-retried", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
      await run(shell, ws);
      writeScores(ws, "S1", [score(1, 2), score(2, 2), score(3, 2), score(4, 2), score(5, 2), score(6, 2), score(8, 2)]);
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        lines(
          "NEXT: scout | id: S1-retry",
          `Run file: ${ws}/run.md`,
          `Lens file: ${lensFile}`,
          `Out: ${ws}/scores/S1-retry.md`,
          "Unit: - U7 | src/m7 | why 7",
          "Unit: - U9 | src/m9 | why 9",
          "Unit: - U10 | src/m10 | why 10",
        ),
      );
      assert.equal(ledgerOf(ws), lines("map-appended", "scouts: S1,S2", "scouts-retried"));
    });
  });
});

test("no call after the retry prints a scout block, the units still unscored being hunted in map order", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
      await run(shell, ws);
      await run(shell, ws);
      const third = await run(shell, ws);
      assert.equal(third.stdout.includes("NEXT: scout"), false, third.stdout);
      assert.deepEqual(hunterIds(third.stdout), ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8"]);
    });
  });
});

test("the kept units are the budget's count, highest score first, equal scores in map order", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
      await run(shell, ws);
      writeScores(ws, "S1", [score(1, 2), score(2, 5), score(3, 2), score(4, 5), score(5, 1), score(6, 3), score(7, 3), score(8, 4)]);
      writeScores(ws, "S2", [score(9, 1), score(10, 4)]);
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(
        slash(result.stdout).startsWith(
          lines(
            "hunters-at-once: 16",
            "NEXT: hunter | id: U2 | background",
            `Run file: ${ws}/run.md`,
            `Lens file: ${lensFile}`,
            `Schema: ${SKILL_DIR}/references/synthesis.md`,
            `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
            "Hunt: U2",
            "Unit: - U2 | src/m2 | why 2",
            `Reports: ${ws}/reports/U2`,
          ),
        ),
        result.stdout,
      );
      assert.deepEqual(hunterIds(result.stdout), ["U2", "U4", "U8", "U10", "U6", "U7", "U1", "U3"]);
    });
  });
});

test("units still unscored after the retry come after every scored unit, in map order, and each kept unit is a hunt ledger line", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
      await run(shell, ws);
      writeScores(ws, "S1", [score(1, 1), score(2, 3), score(3, 3)]);
      writeScores(ws, "S2", [score(9, 5), score(10, 1)]);
      await run(shell, ws);
      const result = await run(shell, ws);
      assert.deepEqual(hunterIds(result.stdout), ["U9", "U2", "U3", "U1", "U10", "U4", "U5", "U6"]);
      assert.equal(
        ledgerOf(ws),
        lines(
          "map-appended",
          "scouts: S1,S2",
          "scouts-retried",
          "hunt: U9 | wave: 1 | unit: U9 | angle: none",
          "hunt: U2 | wave: 1 | unit: U2 | angle: none",
          "hunt: U3 | wave: 1 | unit: U3 | angle: none",
          "hunt: U1 | wave: 1 | unit: U1 | angle: none",
          "hunt: U10 | wave: 1 | unit: U10 | angle: none",
          "hunt: U4 | wave: 1 | unit: U4 | angle: none",
          "hunt: U5 | wave: 1 | unit: U5 | angle: none",
          "hunt: U6 | wave: 1 | unit: U6 | angle: none",
        ),
      );
    });
  });
});

const NOISY_SCORE_FILES: [string, string[]][] = [
  ["ending on a closing tag", [score(1, 1), score(2, 5), score(3, 4), score(4, 1), score(5, 1), score(6, 1), score(7, 1), score(8, 3), CONTENT]],
  [
    "holding a line that is not a score line",
    [score(1, 1), "```json", score(2, 5), "no score for this unit", score(3, 4), score(4, 1), score(5, 1), score(6, 1), score(7, 1), score(8, 3)],
  ],
];

for (const [label, rows] of NOISY_SCORE_FILES) {
  test(`a score file ${label} still yields its score lines`, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("keep-units-", async (dir) => {
        const { ws } = frame(dir, { scope: "src", map: mapOf(unitLines(10)) });
        await run(shell, ws);
        writeScores(ws, "S1", rows);
        writeScores(ws, "S2", [score(9, 2), score(10, 1)]);
        const result = await run(shell, ws);
        assert.deepEqual(hunterIds(result.stdout), ["U2", "U3", "U8", "U9", "U1", "U4", "U5", "U6"]);
      });
    });
  });
}
