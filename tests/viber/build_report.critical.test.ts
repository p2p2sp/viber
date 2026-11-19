/*
 * build_report.critical.test.ts - the critical tier of
 * viber/skills/idea-validator/scripts/build_report.mjs: valid data builds the
 * report from the template with every placeholder replaced, and the research
 * prompts are written under prompts/.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by build_report.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/build_report.critical.test.ts
 */

import { test } from "../harness/test.ts";
import { withTempDir } from "../harness/tmp.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { main } from "../../viber/skills/idea-validator/scripts/build_report.mjs";
import { SUT, capture, validReport } from "./build_report-fixture.ts";

test("valid data exits 0 and writes the filled template with every placeholder replaced and LF line endings", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(validReport()), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 0);
    assert.match(out.lines[0], /^OK → .*report\.html \(\d+ KB\)$/);
    const html = fs.readFileSync(dest, "utf-8");
    assert.ok(html.includes('<html lang="pl">'));
    assert.ok(html.includes("<title>Idea</title>"));
    assert.ok(!/__REPORT_DATA__|__LANG__|__TITLE__/.test(html));
    assert.ok(!html.includes("\r\n"));
  });
});

test("--prompts research on a relative working directory creates its prompts/ and writes the three files, printing one PROMPT line each with an absolute path", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    fs.mkdirSync(path.join(dir, "wd"));
    const real = fs.realpathSync(dir);
    const result = await runScript(SUT, ["--prompts", "research", "wd"], { cwd: dir });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
      `PROMPT: problem | ${path.join(real, "wd", "prompts", "research-problem.md")}`,
      `PROMPT: market | ${path.join(real, "wd", "prompts", "research-market.md")}`,
      `PROMPT: competition | ${path.join(real, "wd", "prompts", "research-competition.md")}`,
    ]);
    const problem = fs.readFileSync(path.join(dir, "wd", "prompts", "research-problem.md"), "utf-8");
    assert.match(problem, /^### Problem research brief/);
    assert.ok(problem.includes(`Write your output to ${path.join(real, "wd", "03-research-problem.md")}.`));
    assert.ok(fs.existsSync(path.join(dir, "wd", "prompts", "research-market.md")));
    assert.ok(fs.existsSync(path.join(dir, "wd", "prompts", "research-competition.md")));
  });
});
