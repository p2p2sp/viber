/*
 * hunt-return.test.ts - proves hunt-return.sh's `sh hunt-return.sh <ws> hunter <hunt id>`
 * contract (C5): every `<id>-<digit>.md` and `.claim.md` of the hunt loses a trailing
 * closing tag, a file of a longer id (`A-x-y-1.md` for `A-x`) is neither stripped nor
 * counted; each claim prints one `NEXT: critic` block in ascending k with its worktree,
 * overlay, test rules and variant lines per lens, scope and wave; a hunt with no report
 * prints once more, with `retry`, the brief keep-units.sh printed for it (a unit hunt,
 * an angle hunt, a wave 2 hunt with its seeds, the worktree suffixed `-retry`), recorded
 * as `retried:`, and on the second miss records `no-report:` and prints `NEXT: none`; a
 * hunt with only `<id>-0.md` prints `NEXT: none`. The unit re-hunt `R-U<n>` is a wave 2
 * hunt like any other, with its own retry and its own `retried:` and `no-report:` lines.
 *
 * `sh hunt-return.sh <ws> critic <hunt id>-<k>` is proven the same way: the verdict file loses
 * a trailing closing tag, a `VERDICT:` line holding one of the four verdicts prints
 * `NEXT: none`, a missing file or one with no such line prints the critic block once more
 * with `retry` and its worktree suffixed `-retry`, recorded as `critic-retried:`, and the
 * second miss prints `NEXT: none`.
 *
 * hunt-return.sh is `#!/bin/sh` and the skill invokes it through `sh`, so every case runs
 * through forEachShell("posix", ...) via opts.shell. Each case builds its own temp
 * workspace; the lens and run files are small fixtures, never a shipped lens. Every
 * closing-tag fixture is built from an escape (`\x3c`), so no line of this file is a bare
 * closing tag and orphan-tags.unit.test.ts stays green over it.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/hunt-return.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/hunt-return.sh");
const SKILL_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/code-auditor"));
const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));

const CONTENT = "\x3c/content>";
const PARAMETER = "\x3c/parameter>";

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

const UNITS = ["- U1 | src/m1 | why 1", "- U2 | src/m2 | why 2"];

interface Frame {
  lens?: string;
  scope?: string;
  worktree?: boolean;
  ledger?: string[];
  seeds?: string[];
}

/** Writes lens.md, run.md, map.md and ledger.md under `dir`, returns the workspace. */
function frame(dir: string, opts: Frame = {}): { ws: string; lensFile: string } {
  const ws = slash(path.join(dir, "ws"));
  fs.mkdirSync(path.join(ws, "reports"), { recursive: true });
  const lensFile = `${ws}/lens.md`;
  fs.writeFileSync(
    lensFile,
    lines("# Lens", "", "## Hunts", "### alpha", "what to look for.", "", "## Verify", `Worktree: ${opts.worktree ? "required" : "none"}`),
  );
  fs.writeFileSync(
    path.join(ws, "run.md"),
    lines(`Lens: ${opts.lens ?? "bugs"}`, `Lens file: ${lensFile}`, `Scope: ${opts.scope ?? "diff"}`, `Target root: ${slash(dir)}`),
  );
  fs.writeFileSync(path.join(ws, "map.md"), lines("## Conventions", "none", "", "## Units", ...UNITS));
  fs.writeFileSync(path.join(ws, "ledger.md"), lines(...(opts.ledger ?? [])));
  if (opts.seeds) fs.writeFileSync(path.join(ws, "seeds.md"), lines(...opts.seeds));
  return { ws, lensFile };
}

async function run(shell: Shell, ws: string, ...rest: string[]): Promise<RunResult> {
  return await runScript(SUT, [ws, ...(rest.length ? rest : ["hunter", "U1"])], { shell, cwd: path.dirname(ws) });
}

function put(ws: string, name: string, body: string): void {
  fs.writeFileSync(path.join(ws, "reports", name), body);
}

function read(ws: string, ...parts: string[]): string {
  return fs.readFileSync(path.join(ws, ...parts), "utf-8");
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

test("every <id>-<digit>.md and .claim.md of the hunt loses a trailing closing tag, every other byte kept", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: U1_LEDGER });
      put(ws, "U1-1.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
      put(ws, "U1-1.claim.md", `LOCATION: a.ts:1\n${PARAMETER}\n`);
      put(ws, "U1-2.md", `LOCATION: b.ts:2\n${CONTENT}\n`);
      put(ws, "U1-2.claim.md", `LOCATION: b.ts:2\n${CONTENT}\n`);
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(read(ws, "reports", "U1-1.md"), "LOCATION: a.ts:1\n");
      assert.equal(read(ws, "reports", "U1-1.claim.md"), "LOCATION: a.ts:1\n");
      assert.equal(read(ws, "reports", "U1-2.md"), "LOCATION: b.ts:2\n");
      assert.equal(read(ws, "reports", "U1-2.claim.md"), "LOCATION: b.ts:2\n");
    });
  });
});

test("a file of a longer id is neither stripped nor counted (A-x-y-1.md and its claim never answer for the hunt A-x)", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: ["hunt: A-x | wave: 1 | unit: none | angle: x", "hunt: A-x-y | wave: 1 | unit: none | angle: x-y"] });
      put(ws, "A-x-y-1.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
      put(ws, "A-x-y-1.claim.md", `LOCATION: a.ts:1\n${CONTENT}\n`);
      const result = await run(shell, ws, "hunter", "A-x");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^NEXT: hunter \| id: A-x \| background \| retry\n/);
      assert.equal(read(ws, "reports", "A-x-y-1.md"), `LOCATION: a.ts:1\n${CONTENT}\n`);
      assert.equal(read(ws, "reports", "A-x-y-1.claim.md"), `LOCATION: a.ts:1\n${CONTENT}\n`);
    });
  });
});

test("each claim prints one critic block in ascending k whatever the order the sidecars were written in", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { ledger: U1_LEDGER });
      put(ws, "U1-3.claim.md", "LOCATION: c\n");
      put(ws, "U1-1.claim.md", "LOCATION: a\n");
      put(ws, "U1-2.claim.md", "LOCATION: b\n");
      put(ws, "U1-1.md", "report\n");
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        criticBlock(ws, lensFile, "U1-1") + criticBlock(ws, lensFile, "U1-2") + criticBlock(ws, lensFile, "U1-3"),
      );
    });
  });
});

test("a worktree lens on the diff scope adds the worktree script, a critic worktree named for the claim and the overlay script", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
      put(ws, "A-alpha-1.claim.md", "LOCATION: a\n");
      const result = await run(shell, ws, "hunter", "A-alpha");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        criticBlock(ws, lensFile, "A-alpha-1", [
          `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
          `Worktree: ${ws}/worktrees/critic-A-alpha-1`,
          `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
        ]),
      );
    });
  });
});

test("a worktree lens on a directory scope prints the worktree lines and no overlay script", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { worktree: true, scope: "src", ledger: U1_LEDGER });
      put(ws, "U1-2.claim.md", "LOCATION: a\n");
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        criticBlock(ws, lensFile, "U1-2", [`Worktree script: ${SKILL_DIR}/scripts/worktree.sh`, `Worktree: ${ws}/worktrees/critic-U1-2`]),
      );
    });
  });
});

test("the tests lens adds the Test rules line to a critic block", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { lens: "tests", ledger: U1_LEDGER });
      put(ws, "U1-1.claim.md", "LOCATION: a\n");
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), criticBlock(ws, lensFile, "U1-1", [`Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`]));
    });
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; skillDir: string; pluginRoot: string }> = [
  { label: "a C:\\ path", invoked: SUT, skillDir: SKILL_DIR, pluginRoot: PLUGIN_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), skillDir: SKILL_DIR, pluginRoot: PLUGIN_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), skillDir: MSYS(SKILL_DIR), pluginRoot: MSYS(PLUGIN_ROOT) },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, a critic block prints its worktree script, overlay script and test rules in that spelling`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("hunt-return-", async (dir) => {
        const { ws } = frame(dir, { lens: "tests", worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
        put(ws, "A-alpha-1.claim.md", "LOCATION: a\n");
        const result = await runScript(row.invoked, [ws, "hunter", "A-alpha"], { shell, cwd: path.dirname(ws) });
        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.deepEqual(result.stdout.split("\n").filter((line) => /^(Test rules|Worktree script|Overlay script): /.test(line)), [
          `Worktree script: ${row.skillDir}/scripts/worktree.sh`,
          `Overlay script: ${row.skillDir}/scripts/diff-overlay.sh`,
          `Test rules: ${row.pluginRoot}/references/test-strategy.md`,
        ]);
      });
    });
  });
}

test("a wave 2 hunt adds Variant: yes as the last line of its critic block", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { worktree: true, lens: "tests", ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: alpha"] });
      put(ws, "V-1-1.claim.md", "LOCATION: a\n");
      const result = await run(shell, ws, "hunter", "V-1");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
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
  });
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

test("a unit hunt with no report prints its brief once more with retry and records retried:", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", ledger: [...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none"] });
      const result = await run(shell, ws, "hunter", "U2");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), retryBlock(ws, lensFile, "U2", ["Unit: - U2 | src/m2 | why 2"]));
      assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none", "retried: U2"));
    });
  });
});

test("an angle hunt on a worktree lens retries with its worktree suffixed -retry and the overlay script", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
      const result = await run(shell, ws, "hunter", "A-alpha");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        retryBlock(ws, lensFile, "A-alpha", ["Angle: alpha"], [
          `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
          `Worktree: ${ws}/worktrees/A-alpha-retry`,
          `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
        ]),
      );
    });
  });
});

const SEEDS = ["Seed: wrong-result: swallows the parse error", "Seed: race-state: counter updated without the lock"];

test("a wave 2 unit hunt retries with every Seed line of seeds.md after its Unit line", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", seeds: SEEDS, ledger: ["hunt: U1 | wave: 2 | unit: U1 | angle: none"] });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), retryBlock(ws, lensFile, "U1", ["Unit: - U1 | src/m1 | why 1", ...SEEDS]));
    });
  });
});

test("a wave 2 diff hunt V-<n> retries with its own angle and the n-th Seed line only", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, {
        seeds: SEEDS,
        ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: wrong-result", "hunt: V-2 | wave: 2 | unit: none | angle: race-state"],
      });
      const result = await run(shell, ws, "hunter", "V-2");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), retryBlock(ws, lensFile, "V-2", ["Angle: race-state", SEEDS[1]]));
    });
  });
});

test("the second miss of a hunt records no-report: and prints NEXT: none", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: [...U1_LEDGER, "retried: U1"] });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "NEXT: none\n");
      assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER, "retried: U1", "no-report: U1"));
    });
  });
});

test("a hunt with only <id>-0.md prints NEXT: none and records nothing", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: U1_LEDGER });
      put(ws, "U1-0.md", `NO FINDING\nchecked: src/m1\n${CONTENT}\n`);
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "NEXT: none\n");
      assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER));
      assert.equal(read(ws, "reports", "U1-0.md"), "NO FINDING\nchecked: src/m1\n");
    });
  });
});

const R_U2_LEDGER = [...U1_LEDGER, "hunt: U2 | wave: 1 | unit: U2 | angle: none", "retried: U2", "no-report: U2", "hunt: R-U2 | wave: 2 | unit: U2 | angle: none"];

test("a unit re-hunt R-U2 with a claim prints a critic block ending on Variant: yes (characterization: it is any wave 2 hunt)", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", ledger: R_U2_LEDGER });
      put(ws, "R-U2-1.claim.md", "LOCATION: a\n");
      const result = await run(shell, ws, "hunter", "R-U2");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), criticBlock(ws, lensFile, "R-U2-1", [], ["Variant: yes"]));
    });
  });
});

test("a unit re-hunt with no report prints its retry block once, keeping its retried: and no-report: lines apart from the unit's own, then NEXT: none", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", seeds: SEEDS, ledger: R_U2_LEDGER });
      const first = await run(shell, ws, "hunter", "R-U2");
      assert.equal(first.status, 0, `stderr=${first.stderr}`);
      assert.equal(slash(first.stdout), retryBlock(ws, lensFile, "R-U2", ["Unit: - U2 | src/m2 | why 2", ...SEEDS]));
      assert.equal(read(ws, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2"));
      const second = await run(shell, ws, "hunter", "R-U2");
      assert.equal(second.stdout, "NEXT: none\n");
      assert.equal(read(ws, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2", "no-report: R-U2"));
      const third = await run(shell, ws, "hunter", "R-U2");
      assert.equal(third.stdout, "NEXT: none\n");
      assert.equal(read(ws, "ledger.md"), lines(...R_U2_LEDGER, "retried: R-U2", "no-report: R-U2"));
    });
  });
});

test("a report of the re-hunt R-U2 never answers for the hunt U2, nor the report of U2 for R-U2", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, {
        scope: "src",
        ledger: ["hunt: U2 | wave: 1 | unit: U2 | angle: none", "hunt: R-U2 | wave: 2 | unit: U2 | angle: none"],
      });
      put(ws, "R-U2-0.md", "NO FINDING\n");
      const rehunt = await run(shell, ws, "hunter", "R-U2");
      assert.equal(rehunt.stdout, "NEXT: none\n");
      const own = await run(shell, ws, "hunter", "U2");
      assert.match(slash(own.stdout), /^NEXT: hunter \| id: U2 \| background \| retry\n/);
    });
  });
});

function putVerdict(ws: string, name: string, body: string): void {
  fs.mkdirSync(path.join(ws, "verdicts"), { recursive: true });
  fs.writeFileSync(path.join(ws, "verdicts", name), body);
}

const VERDICT_BODY = ["COMMAND: grep -n x a.ts", "OBSERVED: the call is unguarded", "SEVERITY: 6"];

test("the verdict file of a critic loses a trailing closing tag, every other byte kept", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: U1_LEDGER });
      putVerdict(ws, "U1-1.md", lines("VERDICT: VERIFIED", ...VERDICT_BODY) + `${CONTENT}\n`);
      const result = await run(shell, ws, "critic", "U1-1");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(read(ws, "verdicts", "U1-1.md"), lines("VERDICT: VERIFIED", ...VERDICT_BODY));
    });
  });
});

for (const verdict of ["VERIFIED", "REFUTED", "PARTIALLY VERIFIED", "INCONCLUSIVE"]) {
  test(`a verdict file holding the line VERDICT: ${verdict} prints NEXT: none and records nothing`, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("hunt-return-", async (dir) => {
        const { ws } = frame(dir, { ledger: U1_LEDGER });
        putVerdict(ws, "U1-2.md", lines(`VERDICT: ${verdict}`, ...VERDICT_BODY));
        const result = await run(shell, ws, "critic", "U1-2");
        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "NEXT: none\n");
        assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER));
      });
    });
  });
}

test("a missing verdict file prints the critic block once more with retry, its worktree suffixed -retry, and records critic-retried:", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { worktree: true, lens: "tests", ledger: ["hunt: V-1 | wave: 2 | unit: none | angle: alpha"] });
      const result = await run(shell, ws, "critic", "V-1-2");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
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
      assert.equal(read(ws, "ledger.md"), lines("hunt: V-1 | wave: 2 | unit: none | angle: alpha", "critic-retried: V-1-2"));
    });
  });
});

test("a verdict file with no VERDICT: line holding a verdict gets the same retry block on a lens with no worktree", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { ledger: U1_LEDGER });
      putVerdict(ws, "U1-1.md", lines("VERDICT: MAYBE", ...VERDICT_BODY));
      const result = await run(shell, ws, "critic", "U1-1");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(slash(result.stdout), criticBlock(ws, lensFile, "U1-1", [], [], true));
      assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER, "critic-retried: U1-1"));
    });
  });
});

test("the second miss of a critic prints NEXT: none and records nothing more", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws } = frame(dir, { ledger: [...U1_LEDGER, "critic-retried: U1-1"] });
      putVerdict(ws, "U1-1.md", lines(...VERDICT_BODY));
      const result = await run(shell, ws, "critic", "U1-1");
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "NEXT: none\n");
      assert.equal(read(ws, "ledger.md"), lines(...U1_LEDGER, "critic-retried: U1-1"));
    });
  });
});
