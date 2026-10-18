/*
 * build_report.test.ts - the file-writing half of idea-validator's report builder
 * CLI: unparsable input and invalid data exit 1 and write nothing, valid data
 * exits 0 and writes the filled template with LF line endings. Integration
 * tier (each case builds a temp-dir fixture); it calls `main` in-process.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   CI=true node --test tests/viber/build_report.test.ts
 */

import { test } from "../harness/test.ts";
import { withTempDir } from "../harness/tmp.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { main } from "../../viber/skills/idea-validator/scripts/build_report.mjs";
import { capture, validReport } from "./build_report-fixture.ts";

test("unparsable input exits 1 with a 'Cannot parse' line and writes no report", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, "{not json", "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 1);
    assert.match(out.lines[0], /^Cannot parse /);
    assert.ok(!fs.existsSync(dest));
  });
});

test("invalid data exits 1, prints the problem count and one line per problem, and writes no report (the skill fixes the JSON, never the HTML)", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const d = validReport();
    d.thresholds = {};
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(d), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 1);
    assert.match(out.lines[0], /^3 problem\(s\) in /);
    assert.equal(out.lines.length, 4);
    assert.ok(!fs.existsSync(dest));
  });
});

test("a fact text holding a comment marker and a script tag builds OK and its report-data element holds no '<' and parses back to the input (a live '<!--' or '<script' would swallow the rest of the page)", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const d = validReport();
    d.research.problem.facts = [{ text: "Users paste <!-- comment markers and a <script src=x> embed snippet" }];
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(d), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 0);
    assert.match(out.lines[0], /^OK /);
    const html = fs.readFileSync(dest, "utf-8");
    const open = html.indexOf('<script id="report-data" type="application/json">');
    const start = html.indexOf(">", open) + 1;
    const payload = html.slice(start, html.indexOf("</script>", start));
    assert.ok(!payload.includes("<"), payload);
    assert.equal(JSON.parse(payload).research.problem.facts[0].text, d.research.problem.facts[0].text);
  });
});

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
