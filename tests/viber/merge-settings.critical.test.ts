/*
 * merge-settings.critical.test.ts - the critical tier of
 * viber/skills/setup/scripts/merge-settings.sh, the wrapper of the
 * merge-settings.ts entry: a missing settings.json is created from the template,
 * a merge keeps host entries, a rerun changes nothing, invalid JSON is left
 * untouched, and a reset keeps a backup. With no node on PATH the wrapper still
 * creates and resets, and prints the block in place of a merge.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven in process by
 * tests/viber/lib/merge-settings.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/merge-settings.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { shellUtilsPath } from "../harness/stub.ts";
import { withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  TEMPLATE_SETTINGS,
  writeJson,
  fixtureTemplate,
  targetPath,
  run,
  readJson,
} from "./merge-settings-fixture.ts";

test("no settings.json at all: the default target is created byte-identical to the shipped template, exit 0", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const result = await run(dir, TEMPLATE_SETTINGS);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "settings.json: created from template\n");
    assert.equal(fs.readFileSync(targetPath(dir), "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
  });
});

test("partial coverage: only the missing template entries are appended, after the host's own, and every other key survives", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, {
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      disableWorkflows: true,
      permissions: {
        additionalDirectories: ["C:/somewhere"],
        allow: ["Read", "HostOnlyTool"],
        ask: ["Bash(hostask:*)"],
        deny: ["Bash(hostonly:*)", "Bash(sudo:*)"],
      },
    });

    const result = await run(dir, fixtureTemplate(dir), target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 3 keys, 4 list entries, updated 0 values, moved 0 deny to ask\n",
    );

    const merged = readJson(target);
    assert.deepEqual(merged.permissions.allow, ["Read", "HostOnlyTool", "Write", "Bash"]);
    assert.deepEqual(merged.permissions.ask, ["Bash(hostask:*)", "Bash(git push:*)"]);
    assert.deepEqual(merged.permissions.deny, ["Bash(hostonly:*)", "Bash(sudo:*)", "Bash(rm -rf:*)"]);
    assert.equal(merged.permissions.defaultMode, "acceptEdits");
    assert.equal(merged.permissions.disableAutoMode, "disable");
    // Host-only keys, at both levels, are carried over untouched.
    assert.equal(merged.disableWorkflows, true);
    assert.deepEqual(merged.permissions.additionalDirectories, ["C:/somewhere"]);
    // The template's own top-level key is seeded beside them.
    assert.equal(merged.showClearContextOnPlanAccept, true);
    // The atomic rewrite leaves no scratch file behind.
    assert.equal(fs.existsSync(`${target}.tmp`), false);
  });
});

test("idempotence: the second run reports 'already up to date' and leaves the file byte-identical", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    const template = fixtureTemplate(dir);
    writeJson(target, { permissions: { allow: ["HostOnlyTool"] } });

    const first = await run(dir, template, target);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    assert.equal(
      first.stdout,
      "settings.json: merged - added 6 keys, 3 list entries, updated 0 values, moved 0 deny to ask\n",
    );
    const afterFirst = fs.readFileSync(target, "utf-8");

    const second = await run(dir, template, target);

    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.equal(second.stdout, "settings.json: already up to date\n");
    assert.equal(fs.readFileSync(target, "utf-8"), afterFirst);
  });
});

test("a settings.json that is not valid JSON (comments) is left byte-for-byte untouched, reported on one line, exit 2", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const before = '{\n  // a comment JSON does not allow\n  "permissions": {}\n}\n';
    fs.writeFileSync(target, before);

    const result = await run(dir, fixtureTemplate(dir), target);

    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(fs.readFileSync(target, "utf-8"), before);
    const lines = result.stdout.split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^settings\.json: not valid JSON - left untouched \(.+\)$/);
    assert.equal(fs.existsSync(`${target}.tmp`), false);
  });
});

test("--reset replaces an existing target byte-identical to the template and keeps the old file in .temp/viber/setup/, exit 0", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, { permissions: { allow: ["HostOnlyTool"] }, hostKey: 1 });
    const before = fs.readFileSync(target, "utf-8");

    const result = await runScript(SUT, ["--reset", TEMPLATE_SETTINGS], { cwd: dir });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: reset from template (previous file saved to .temp/viber/setup/settings.json.bak)\n",
    );
    assert.equal(fs.readFileSync(target, "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
    assert.equal(fs.readFileSync(path.join(dir, ".temp", "viber", "setup", "settings.json.bak"), "utf-8"), before);
    assert.equal(fs.existsSync(`${target}.tmp`), false);
  });
});

test("with no node on PATH a missing target is created and a reset keeps its backup, both byte-identical to the template, a merge is skipped with the recommended block and the target untouched, and a missing template exits 1", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    const shipped = fs.readFileSync(TEMPLATE_SETTINGS, "utf-8");
    const bare = (...args: string[]) => runScript(SUT, args, { cwd: dir, env: { PATH: shellUtilsPath() } });

    const created = await bare(TEMPLATE_SETTINGS, target);
    assert.deepEqual([created.status, created.stdout], [0, "settings.json: created from template\n"], created.stderr);
    assert.equal(fs.readFileSync(target, "utf-8"), shipped);

    writeJson(target, { permissions: { allow: ["HostOnlyTool"] } });
    const before = fs.readFileSync(target, "utf-8");
    const skipped = await bare(TEMPLATE_SETTINGS, target);
    assert.deepEqual([skipped.status, skipped.stdout], [0, `settings.json: node not found - merge skipped, recommended block:\n${shipped}`], skipped.stderr);
    assert.equal(fs.readFileSync(target, "utf-8"), before);

    const missing = await bare(path.join(dir, "nowhere.json"), target);
    assert.equal(missing.status, 1);
    assert.equal(fs.readFileSync(target, "utf-8"), before);

    const reset = await bare("--reset", TEMPLATE_SETTINGS);
    assert.deepEqual([reset.status, reset.stdout], [0, "settings.json: reset from template (previous file saved to .temp/viber/setup/settings.json.bak)\n"], reset.stderr);
    assert.equal(fs.readFileSync(target, "utf-8"), shipped);
    assert.equal(fs.readFileSync(path.join(dir, ".temp", "viber", "setup", "settings.json.bak"), "utf-8"), before);
  });
});
