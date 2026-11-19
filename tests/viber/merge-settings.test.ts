/*
 * merge-settings.test.ts - proves viber/skills/setup/scripts/merge-settings.sh
 * merges the bundled permissions template into a host project's
 * .claude/settings.json key by key at any depth (missing keys added, lists
 * gaining only the entries they lack, a differing scalar taking the template's
 * value), idempotently (a second run rewrites nothing) and safely (a target that
 * is not valid JSON, or a host with no `node`, is left untouched and reported),
 * plus the shape of the shipped template itself - the single source of the
 * recommended allow/ask/deny lists /viber:setup offers.
 *
 * In the three permission lists a template rule a host rule already covers
 * (bare `Tool`, or a match-all specifier, over any `Tool(...)`) is not added.
 *
 * `--reset` skips the merge: the target is replaced by the template (a plain
 * copy, no node needed) after the old file is backed up to
 * .temp/viber/setup/settings.json.bak.
 *
 * The one removal: a host deny entry the template carries in ask is dropped,
 * because deny outranks ask and the move would never reach an older project.
 *
 * The template wins a scalar conflict because a project's own override belongs
 * in .claude/settings.local.json, which the merge never touches.
 *
 * The template is designed for a session with auto mode OFF: it seeds
 * permissions.disableAutoMode, so there is no classifier and every outcome is
 * decided by the static rules alone.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/merge-settings.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { slash } from "../harness/paths.ts";
import {
  SUT,
  TEMPLATE_SETTINGS,
  writeJson,
  fixtureTemplate,
  targetPath,
  run,
  readJson,
} from "./merge-settings-fixture.ts";

/** The no-node case starves PATH down to the core utilities (the script still
 *  needs bash, cat and command -v), so a developer's installed node cannot
 *  answer - and flip - the "not found" branch. */
async function runWithoutNode(dir: string, template: string, target: string): Promise<RunResult> {
  return await runScript(SUT, [template, target], { cwd: dir, env: { PATH: coreUtilsPath() } });
}

test("run from a subdirectory of a repository, the default target is the root's .claude/settings.json (never a nested sub/.claude/)", async () => {
  await withGitRepo(async (repo) => {
    const sub = path.join(repo.dir, "sub");
    fs.mkdirSync(sub);

    const result = await runScript(SUT, [TEMPLATE_SETTINGS], { cwd: sub, env: repo.env });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "settings.json: created from template\n");
    assert.equal(fs.existsSync(targetPath(repo.dir)), true);
    assert.equal(fs.existsSync(path.join(sub, ".claude")), false);
  });
});

test("an existing defaultMode: plan takes the template's mode (a project's own mode belongs in settings.local.json)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, {
      permissions: {
        defaultMode: "plan",
        allow: ["Read", "Write"],
        ask: ["Bash(git push:*)"],
        deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
      },
    });

    const result = await run(dir, fixtureTemplate(dir), target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 3 keys, 1 list entries, updated 1 values, moved 0 deny to ask\n",
    );
    const merged = readJson(target);
    assert.equal(merged.permissions.defaultMode, "acceptEdits");
    assert.deepEqual(merged.permissions.allow, ["Read", "Write", "Bash"]);
  });
});

test("an existing disableAutoMode: allow takes the template's value (the template is designed for auto mode off)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, {
      permissions: {
        disableAutoMode: "allow",
        allow: ["Read", "Write", "Bash"],
        ask: ["Bash(git push:*)"],
        deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
      },
    });

    const result = await run(dir, fixtureTemplate(dir), target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 3 keys, 0 list entries, updated 1 values, moved 0 deny to ask\n",
    );
    assert.equal(readJson(target).permissions.disableAutoMode, "disable");
  });
});

test("a top-level scalar the host carries with another value takes the template's value (a project's own override belongs in settings.local.json)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, {
      $schema: "https://example.invalid/other-schema.json",
      showClearContextOnPlanAccept: false,
      permissions: {
        defaultMode: "acceptEdits",
        disableAutoMode: "disable",
        allow: ["Read", "Write"],
        ask: ["Bash(git push:*)"],
        deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
      },
    });

    const result = await run(dir, fixtureTemplate(dir), target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 0 keys, 1 list entries, updated 2 values, moved 0 deny to ask\n",
    );
    const merged = readJson(target);
    assert.equal(merged.showClearContextOnPlanAccept, true);
    assert.equal(merged.$schema, "https://json.schemastore.org/claude-code-settings.json");
  });
});

test("a nested object is merged key by key at any depth: a missing child is added, a differing one updated, a host-only one kept, and a nested list gains only what it lacks", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    const template = path.join(dir, "template.json");
    writeJson(template, { outer: { inner: { flag: true, added: "new", list: ["a", "b"] } } });
    writeJson(target, { outer: { hostOnly: 1, inner: { flag: false, list: ["b", "host"] } } });

    const result = await run(dir, template, target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 1 keys, 1 list entries, updated 1 values, moved 0 deny to ask\n",
    );
    assert.deepEqual(readJson(target), {
      outer: { hostOnly: 1, inner: { flag: true, list: ["b", "host", "a"], added: "new" } },
    });
  });
});

test("a host deny entry the template now carries in ask is dropped from deny and lands in ask once (deny outranks ask, so a project set up before the move would stay hard-blocked)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    const template = fixtureTemplate(dir);
    writeJson(target, {
      permissions: {
        defaultMode: "acceptEdits",
        disableAutoMode: "disable",
        allow: ["Read", "Write", "Bash"],
        deny: ["Bash(hostonly:*)", "Bash(git push:*)", "Bash(sudo:*)", "Bash(rm -rf:*)"],
      },
    });

    const result = await run(dir, template, target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 3 keys, 0 list entries, updated 0 values, moved 1 deny to ask\n",
    );
    const merged = readJson(target);
    assert.deepEqual(merged.permissions.ask, ["Bash(git push:*)"]);
    assert.deepEqual(merged.permissions.deny, ["Bash(hostonly:*)", "Bash(sudo:*)", "Bash(rm -rf:*)"]);

    const second = await run(dir, template, target);
    assert.equal(second.stdout, "settings.json: already up to date\n");
  });
});

test("a template rule a host rule of the same list already covers is not appended: bare Tool covers Tool(<specifier>), and a match-all specifier counts as bare both ways (no Edit beside Edit(**/*))", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    const template = path.join(dir, "template.json");
    writeJson(template, {
      permissions: {
        allow: ["Edit(**/*)", "Bash(npm test:*)", "Read", "Glob(*)", "Write"],
        ask: ["Bash(git push:*)"],
        deny: ["Read(**/.env)"],
      },
    });
    writeJson(target, {
      permissions: { allow: ["Edit", "Bash", "Read(**)", "Glob"], ask: ["Bash"], deny: ["Read"] },
    });

    const result = await run(dir, template, target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "settings.json: merged - added 0 keys, 1 list entries, updated 0 values, moved 0 deny to ask\n",
    );
    assert.deepEqual(readJson(target).permissions, {
      allow: ["Edit", "Bash", "Read(**)", "Glob", "Write"],
      ask: ["Bash"],
      deny: ["Read"],
    });

    const second = await run(dir, template, target);
    assert.equal(second.stdout, "settings.json: already up to date\n");
  });
});

test("no node on PATH and no target yet: the target is created from the template byte-identical, exit 0 (a missing target is a plain copy, so it needs no node)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);

    const result = await runWithoutNode(dir, TEMPLATE_SETTINGS, target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "settings.json: created from template\n");
    assert.equal(fs.readFileSync(target, "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
  });
});

test("no node on PATH: the merge is skipped with the recommended block on stdout and the target untouched, exit 0", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, { permissions: { allow: ["HostOnlyTool"] } });
    const before = fs.readFileSync(target, "utf-8");

    const result = await runWithoutNode(dir, TEMPLATE_SETTINGS, target);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      `settings.json: node not found - merge skipped, recommended block:\n${fs.readFileSync(TEMPLATE_SETTINGS, "utf-8")}`,
    );
    assert.equal(fs.readFileSync(target, "utf-8"), before);
  });
});

test("--reset over a target that is not valid JSON still replaces it (the one way out of a broken file)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{ // broken\n");

    const result = await runScript(SUT, ["--reset", TEMPLATE_SETTINGS, target], { cwd: dir });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(fs.readFileSync(target, "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
  });
});

test("--reset with no node on PATH still resets (a plain copy needs none)", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, { permissions: { allow: ["HostOnlyTool"] } });

    const result = await runScript(SUT, ["--reset", TEMPLATE_SETTINGS, target], { cwd: dir, env: { PATH: coreUtilsPath() } });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^settings\.json: reset from template/);
    assert.equal(fs.readFileSync(target, "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
  });
});

test("--reset with no target yet creates it and writes no backup", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const result = await runScript(SUT, ["--reset", TEMPLATE_SETTINGS], { cwd: dir });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "settings.json: created from template\n");
    assert.equal(fs.readFileSync(targetPath(dir), "utf-8"), fs.readFileSync(TEMPLATE_SETTINGS, "utf-8"));
    assert.equal(fs.existsSync(path.join(dir, ".temp")), false);
  });
});

test("a template path that does not exist reports the missing template and exits 1, target untouched", async () => {
  await withTempDir("p2p2-viber-merge-settings-", async (dir) => {
    const target = targetPath(dir);
    writeJson(target, { permissions: { allow: ["HostOnlyTool"] } });
    const before = fs.readFileSync(target, "utf-8");
    const missing = path.join(dir, "nowhere", "settings.json");

    const result = await run(dir, missing, target);

    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), `settings.json: template missing at ${slash(missing)} - skipped\n`);
    assert.equal(fs.readFileSync(target, "utf-8"), before);
  });
});

test("the shipped template carries the recommended block only: built-in tools, recoverable operations asked, irreversible ones denied, no host-specific key", () => {
  const template = readJson(TEMPLATE_SETTINGS);

  assert.deepEqual(Object.keys(template), ["$schema", "showClearContextOnPlanAccept", "attribution", "permissions"]);
  assert.equal(template.$schema, "https://json.schemastore.org/claude-code-settings.json");
  assert.equal(template.showClearContextOnPlanAccept, true);
  // An empty string is what hides the harness's own byline: no Co-Authored-By
  // trailer on a commit, no "Generated with Claude Code" line in a PR body.
  assert.deepEqual(template.attribution, { commit: "", pr: "" });
  assert.deepEqual(Object.keys(template.permissions), ["defaultMode", "disableAutoMode", "allow", "ask", "deny"]);
  assert.equal(template.permissions.defaultMode, "acceptEdits");
  // "disable" is the literal the harness reads; a boolean is silently inert.
  assert.equal(template.permissions.disableAutoMode, "disable");

  const { allow, ask, deny } = template.permissions;
  assert.equal(new Set(allow).size, allow.length, "no duplicate allow entry");
  assert.equal(new Set(ask).size, ask.length, "no duplicate ask entry");
  assert.equal(new Set(deny).size, deny.length, "no duplicate deny entry");
  // An entry in both lists would be a dead ask: deny outranks it, and the
  // merge drops every asked-for entry from the host's deny anyway.
  assert.deepEqual(
    ask.filter((entry: string) => deny.includes(entry)),
    [],
  );
  // Built-in tool names only: an mcp__* entry names a server of one host.
  assert.deepEqual(
    allow.filter((entry: string) => entry.startsWith("mcp__")),
    [],
  );
  for (const expected of ["Read", "Glob", "Bash", "Skill", "Agent", "Task"]) {
    assert.ok(allow.includes(expected), `allow should carry ${expected}`);
  }
  // The write tools are allowed outright. Every byte viber puts in the tree
  // comes from a dispatched agent - seven of the eight carry Write or Edit -
  // and none of them declares a permissionMode, so each starts in the asking
  // default instead of inheriting the session's acceptEdits. That mode would
  // not cover them anyway: it is scoped to the working directory. A coder
  // stopped on a permission prompt strands the batch it was dispatched in,
  // which is why they are allowed here; the deny list is what keeps .env,
  // .git/ and the key files out.
  for (const expected of ["Edit(**/*)", "NotebookEdit"]) {
    assert.ok(allow.includes(expected), `allow should carry ${expected} - viber's coders write through it`);
  }
  // File permission checks match Edit(path) rules only: an Edit rule covers
  // every file-editing tool, and a Write(path) rule is flagged as never matched.
  assert.ok(!allow.includes("Write(**/*)"), "allow should not carry Write(**/*) - Edit(**/*) already covers Write");
  // Recoverable or user-judged operations stop the agent on a prompt instead
  // of ending its run: the user decides and the work continues.
  for (const expected of [
    "Bash(git * --force*)",
    "Bash(git reset --hard:*)",
  ]) {
    assert.ok(ask.includes(expected), `ask should carry ${expected}`);
  }
  // A general rm -rf stays out of the ask list: only the two catastrophic
  // targets are denied, so an ordinary recursive delete needs no prompt.
  assert.ok(!ask.includes("Bash(rm -rf:*)"), "ask should not carry the broad Bash(rm -rf:*)");
  for (const expected of [
    "Bash(rm -rf ~)",
    "Bash(rm -rf /)",
    "Bash(sudo:*)",
    // Prefix matching alone misses `git push origin main --force`, which the
    // asked-for `git * --force*` would otherwise let through on a click.
    "Bash(git push * --force*)",
    "Bash(git push --force:*)",
    "Bash(gh repo delete:*)",
    "Bash(gh auth token:*)",
    "Read(**/.env)",
    "Edit(./.git/**)",
  ]) {
    assert.ok(deny.includes(expected), `deny should carry ${expected}`);
  }
});
