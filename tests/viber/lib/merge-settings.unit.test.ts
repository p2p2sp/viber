/*
 * merge-settings.unit.test.ts - the merge-settings core on fake ports: the
 * bundled permissions template is merged into a host project's
 * .claude/settings.json key by key at any depth (missing keys added, lists
 * gaining only the entries they lack, a differing scalar taking the template's
 * value), idempotently (a second run rewrites nothing) and safely (a target that
 * is not valid JSON is left untouched and reported).
 *
 * In the three permission lists a template rule a host rule already covers
 * (bare `Tool`, or a match-all specifier, over any `Tool(...)`) is not added.
 * The one removal: a host deny entry the template carries in ask is dropped,
 * because deny outranks ask and the move would never reach an older project.
 * The template wins a scalar conflict because a project's own override belongs
 * in .claude/settings.local.json, which the merge never touches.
 *
 * A missing target is created as a copy of the template; `--reset` replaces the
 * target by one after the old file is saved to .temp/viber/setup/settings.json.bak.
 *
 * The wrapper, and what it does with no node on PATH, is run as a process by
 * tests/viber/merge-settings.critical.test.ts; the shape of the shipped template
 * is held by tests/viber/settings-template.unit.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runMergeSettings } from "../../../viber/lib/merge-settings.ts";
import type { Fs } from "../../../viber/lib/ports.ts";

const ROOT = "/r";
const TEMPLATE = "/r/template.json";
const TARGET = "/r/.claude/settings.json";
const BACKUP = "/r/.temp/viber/setup/settings.json.bak";

/** A small template so a merge assertion can name the exact entries and counts. */
const FIXTURE_TEMPLATE = {
  $schema: "https://json.schemastore.org/claude-code-settings.json",
  showClearContextOnPlanAccept: true,
  permissions: {
    defaultMode: "acceptEdits",
    disableAutoMode: "disable",
    allow: ["Read", "Write", "Bash"],
    ask: ["Bash(git push:*)"],
    deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
  },
};

function host(opts: FakeFsOpts = {}): Fs {
  return fakeFs({}, { dirs: [ROOT], ...opts });
}

function write(fs: Fs, file: string, text: string): void {
  fs.makeDir(file.slice(0, file.lastIndexOf("/")));
  assert.equal(fs.writeBytes(file, new TextEncoder().encode(text)), true);
}

function writeJson(fs: Fs, file: string, value: unknown): void {
  write(fs, file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixtureTemplate(fs: Fs): string {
  writeJson(fs, TEMPLATE, FIXTURE_TEMPLATE);
  return TEMPLATE;
}

function readJson(fs: Fs, file: string): any {
  return JSON.parse(fs.readText(file) ?? "");
}

/** A call in the directory cwd, the repository at /r when repo is set, else in none. */
function run(fs: Fs, args: string[], cwd = ROOT, repo = false) {
  return runMergeSettings(args, cwd, { fs, git: fakeGit(repo ? { root: ROOT, tracked: [] } : null) });
}

test("no settings.json at all: the default target is created byte-identical to the template, a byte that is no UTF-8 included, exit 0", () => {
  const fs = host();
  const bytes = Uint8Array.of(0x7b, 0xff, 0x7d);
  assert.equal(fs.writeBytes(TEMPLATE, bytes), true);

  assert.deepEqual(run(fs, [TEMPLATE]), { stdout: "settings.json: created from template\n", stderr: "", exit: 0 });
  assert.deepEqual([...(fs.readBytes(TARGET) ?? [])], [...bytes]);
});

test("run from a subdirectory of a repository, the default target is the root's .claude/settings.json (never a nested sub/.claude/), a relative template read from the subdirectory", () => {
  const fs = host({ dirs: [`${ROOT}/sub`] });
  fixtureTemplate(fs);

  const result = run(fs, ["../template.json"], `${ROOT}/sub`, true);

  assert.equal(result.stdout, "settings.json: created from template\n");
  assert.deepEqual([fs.exists(TARGET), fs.exists(`${ROOT}/sub/.claude`)], [true, false]);
});

test("an existing defaultMode: plan takes the template's mode (a project's own mode belongs in settings.local.json)", () => {
  const fs = host();
  writeJson(fs, TARGET, {
    permissions: {
      defaultMode: "plan",
      allow: ["Read", "Write"],
      ask: ["Bash(git push:*)"],
      deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
    },
  });

  const result = run(fs, [fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 3 keys, 1 list entries, updated 1 values, moved 0 deny to ask\n",
  );
  const merged = readJson(fs, TARGET);
  assert.equal(merged.permissions.defaultMode, "acceptEdits");
  assert.deepEqual(merged.permissions.allow, ["Read", "Write", "Bash"]);
});

test("an existing disableAutoMode: allow takes the template's value (the template is designed for auto mode off)", () => {
  const fs = host();
  writeJson(fs, TARGET, {
    permissions: {
      disableAutoMode: "allow",
      allow: ["Read", "Write", "Bash"],
      ask: ["Bash(git push:*)"],
      deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
    },
  });

  const result = run(fs, [fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 3 keys, 0 list entries, updated 1 values, moved 0 deny to ask\n",
  );
  assert.equal(readJson(fs, TARGET).permissions.disableAutoMode, "disable");
});

test("a top-level scalar the host carries with another value takes the template's value (a project's own override belongs in settings.local.json)", () => {
  const fs = host();
  writeJson(fs, TARGET, {
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

  const result = run(fs, [fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 0 keys, 1 list entries, updated 2 values, moved 0 deny to ask\n",
  );
  const merged = readJson(fs, TARGET);
  assert.equal(merged.showClearContextOnPlanAccept, true);
  assert.equal(merged.$schema, "https://json.schemastore.org/claude-code-settings.json");
});

test("a nested object is merged key by key at any depth: a missing child is added, a differing one updated, a host-only one kept, and a nested list gains only what it lacks", () => {
  const fs = host();
  writeJson(fs, TEMPLATE, { outer: { inner: { flag: true, added: "new", list: ["a", "b"] } } });
  writeJson(fs, TARGET, { outer: { hostOnly: 1, inner: { flag: false, list: ["b", "host"] } } });

  const result = run(fs, [TEMPLATE, TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 1 keys, 1 list entries, updated 1 values, moved 0 deny to ask\n",
  );
  assert.deepEqual(readJson(fs, TARGET), {
    outer: { hostOnly: 1, inner: { flag: true, list: ["b", "host", "a"], added: "new" } },
  });
});

test("a host deny entry the template now carries in ask is dropped from deny and lands in ask once (deny outranks ask, so a project set up before the move would stay hard-blocked)", () => {
  const fs = host();
  writeJson(fs, TEMPLATE, FIXTURE_TEMPLATE);
  writeJson(fs, TARGET, {
    permissions: {
      defaultMode: "acceptEdits",
      disableAutoMode: "disable",
      allow: ["Read", "Write", "Bash"],
      deny: ["Bash(hostonly:*)", "Bash(git push:*)", "Bash(sudo:*)", "Bash(rm -rf:*)"],
    },
  });

  const result = run(fs, [TEMPLATE, TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 3 keys, 0 list entries, updated 0 values, moved 1 deny to ask\n",
  );
  const merged = readJson(fs, TARGET);
  assert.deepEqual(merged.permissions.ask, ["Bash(git push:*)"]);
  assert.deepEqual(merged.permissions.deny, ["Bash(hostonly:*)", "Bash(sudo:*)", "Bash(rm -rf:*)"]);

  const second = run(fs, [TEMPLATE, TARGET]);
  assert.equal(second.stdout, "settings.json: already up to date\n");
});

test("a template rule a host rule of the same list already covers is not appended: bare Tool covers Tool(<specifier>), and a match-all specifier counts as bare both ways (no Edit beside Edit(**/*))", () => {
  const fs = host();
  writeJson(fs, TEMPLATE, {
    permissions: {
      allow: ["Edit(**/*)", "Bash(npm test:*)", "Read", "Glob(*)", "Write"],
      ask: ["Bash(git push:*)"],
      deny: ["Read(**/.env)"],
    },
  });
  writeJson(fs, TARGET, {
    permissions: { allow: ["Edit", "Bash", "Read(**)", "Glob"], ask: ["Bash"], deny: ["Read"] },
  });

  const result = run(fs, [TEMPLATE, TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 0 keys, 1 list entries, updated 0 values, moved 0 deny to ask\n",
  );
  assert.deepEqual(readJson(fs, TARGET).permissions, {
    allow: ["Edit", "Bash", "Read(**)", "Glob", "Write"],
    ask: ["Bash"],
    deny: ["Read"],
  });

  const second = run(fs, [TEMPLATE, TARGET]);
  assert.equal(second.stdout, "settings.json: already up to date\n");
});

test("partial coverage: only the missing template entries are appended, after the host's own, and every other key survives", () => {
  const fs = host();
  writeJson(fs, TARGET, {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    disableWorkflows: true,
    permissions: {
      additionalDirectories: ["C:/somewhere"],
      allow: ["Read", "HostOnlyTool"],
      ask: ["Bash(hostask:*)"],
      deny: ["Bash(hostonly:*)", "Bash(sudo:*)"],
    },
  });

  const result = run(fs, [fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 3 keys, 4 list entries, updated 0 values, moved 0 deny to ask\n",
  );

  const merged = readJson(fs, TARGET);
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
  assert.equal(fs.exists(`${TARGET}.tmp`), false);
});

test("a narrower host rule, a sibling specifier, a rule in another list or an array outside the permission lists covers nothing (Bash(sudo:*) must never keep Bash(aws:*) out of deny)", () => {
  const fs = host();
  writeJson(fs, TEMPLATE, {
    permissions: { allow: ["Edit(**/*)"], deny: ["Bash(aws:*)", "Bash(sudo:*)"] },
    other: ["Edit(**/*)"],
  });
  writeJson(fs, TARGET, {
    permissions: { allow: ["Edit(src/**)", "Bash"], deny: ["Bash(sudo:*)"] },
    other: ["Edit"],
  });

  const result = run(fs, [TEMPLATE, TARGET]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    "settings.json: merged - added 0 keys, 3 list entries, updated 0 values, moved 0 deny to ask\n",
  );
  const merged = readJson(fs, TARGET);
  assert.deepEqual(merged.permissions.allow, ["Edit(src/**)", "Bash", "Edit(**/*)"]);
  assert.deepEqual(merged.permissions.deny, ["Bash(sudo:*)", "Bash(aws:*)"]);
  assert.deepEqual(merged.other, ["Edit", "Edit(**/*)"]);
});

test("idempotence: the second run reports 'already up to date' and leaves the file byte-identical", () => {
  const fs = host();
  writeJson(fs, TEMPLATE, FIXTURE_TEMPLATE);
  writeJson(fs, TARGET, { permissions: { allow: ["HostOnlyTool"] } });

  const first = run(fs, [TEMPLATE, TARGET]);
  assert.equal(first.exit, 0, `stderr: ${first.stderr}`);
  assert.equal(
    first.stdout,
    "settings.json: merged - added 6 keys, 3 list entries, updated 0 values, moved 0 deny to ask\n",
  );
  const afterFirst = fs.readText(TARGET);

  const second = run(fs, [TEMPLATE, TARGET]);

  assert.equal(second.exit, 0, `stderr: ${second.stderr}`);
  assert.equal(second.stdout, "settings.json: already up to date\n");
  assert.equal(fs.readText(TARGET), afterFirst);
});

test("a settings.json that is not valid JSON (comments) is left byte-for-byte untouched, reported on one line, exit 2", () => {
  const fs = host();
  const before = '{\n  // a comment JSON does not allow\n  "permissions": {}\n}\n';
  write(fs, TARGET, before);

  const result = run(fs, [fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 2, `stderr: ${result.stderr}`);
  assert.equal(fs.readText(TARGET), before);
  const lines = result.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^settings\.json: not valid JSON - left untouched \(.+\)$/);
  assert.equal(fs.exists(`${TARGET}.tmp`), false);
});

test("--reset replaces an existing target by the template and keeps the old file in .temp/viber/setup/, an earlier backup overwritten, exit 0", () => {
  const fs = host();
  writeJson(fs, TARGET, { hostKey: 1 });
  write(fs, BACKUP, "an earlier backup, longer than the file it is replaced by");
  const before = fs.readText(TARGET);

  const result = run(fs, ["--reset", fixtureTemplate(fs)]);

  assert.deepEqual(result, { stdout: "settings.json: reset from template (previous file saved to .temp/viber/setup/settings.json.bak)\n", stderr: "", exit: 0 });
  assert.deepEqual([fs.readText(TARGET), fs.readText(BACKUP), fs.exists(`${TARGET}.tmp`)], [fs.readText(TEMPLATE), before, false]);
});

test("--reset over a target that is not valid JSON still replaces it (the one way out of a broken file)", () => {
  const fs = host();
  write(fs, TARGET, "{ // broken\n");

  const result = run(fs, ["--reset", fixtureTemplate(fs), TARGET]);

  assert.equal(result.exit, 0);
  assert.equal(fs.readText(TARGET), fs.readText(TEMPLATE));
});

test("--reset with no target yet creates it and writes no backup", () => {
  const fs = host();

  const result = run(fs, ["--reset", fixtureTemplate(fs)]);

  assert.deepEqual([result.exit, result.stdout], [0, "settings.json: created from template\n"]);
  assert.deepEqual([fs.readText(TARGET), fs.exists("/r/.temp")], [fs.readText(TEMPLATE), false]);
});

test("--reset whose backup cannot be written leaves the target untouched, exit 2", () => {
  const fs = host();
  writeJson(fs, TARGET, { hostKey: 1 });
  write(fs, "/r/.temp", "a file in the way");

  const result = run(fs, ["--reset", fixtureTemplate(fs)]);

  assert.deepEqual([result.exit, result.stdout], [2, "settings.json: backup failed - left untouched (cannot create .temp/viber/setup)\n"]);
  assert.deepEqual(readJson(fs, TARGET), { hostKey: 1 });
});

test("--reset of a target that cannot be read is refused at the backup, exit 2", () => {
  const fs = host({ unreadable: [TARGET] });
  const result = run(fs, ["--reset", fixtureTemplate(fs)]);
  assert.deepEqual([result.exit, result.stdout], [2, "settings.json: backup failed - left untouched (cannot read the file)\n"]);
});

test("a write that fails names the target and exits 2, a half-done reset or merge leaving the old file in place", () => {
  const fs = host({ dirs: [ROOT, `${TARGET}.tmp`] });
  writeJson(fs, TARGET, { hostKey: 1 });
  fixtureTemplate(fs);
  const failed = { stdout: `settings.json: write failed (cannot write ${TARGET})\n`, stderr: "", exit: 2 };

  assert.deepEqual([run(fs, [TEMPLATE]), run(fs, ["--reset", TEMPLATE])], [failed, failed]);
  assert.deepEqual(readJson(fs, TARGET), { hostKey: 1 });
  assert.equal(run(fs, [TEMPLATE, `${TEMPLATE}/x.json`]).stdout, `settings.json: write failed (cannot create ${TEMPLATE}/x.json)\n`);
});

test("a merge whose rename fails leaves the merged result in <target>.tmp, a reset whose rename fails leaves nothing behind", () => {
  const fs: Fs = { ...host(), replace: () => false };
  writeJson(fs, TARGET, { hostKey: 1 });
  fixtureTemplate(fs);

  assert.equal(run(fs, [TEMPLATE]).exit, 2);
  assert.equal(readJson(fs, `${TARGET}.tmp`).hostKey, 1);
  assert.equal(run(fs, ["--reset", TEMPLATE]).exit, 2);
  assert.deepEqual([fs.exists(`${TARGET}.tmp`), readJson(fs, TARGET)], [false, { hostKey: 1 }]);
});

test("a target that cannot be read, and one whose top-level value is no object, is left untouched, exit 2", () => {
  const locked = host({ unreadable: [TARGET] });
  assert.deepEqual(run(locked, [fixtureTemplate(locked)]), { stdout: `settings.json: unreadable - left untouched (cannot read ${TARGET})\n`, stderr: "", exit: 2 });

  const fs = host();
  write(fs, TARGET, "[]\n");
  assert.deepEqual(run(fs, [fixtureTemplate(fs)]), { stdout: "settings.json: not valid JSON - left untouched (top-level value is not an object)\n", stderr: "", exit: 2 });
  assert.equal(fs.readText(TARGET), "[]\n");
});

for (const { label, text } of [
  { label: "does not exist", text: null },
  { label: "is not valid JSON", text: "{" },
  { label: "holds no object", text: "null" },
]) {
  test(`a template that ${label} is reported missing under the name it was given, exit 1, target untouched`, () => {
    const fs = host();
    writeJson(fs, TARGET, { hostKey: 1 });
    if (text !== null) write(fs, TEMPLATE, text);

    assert.deepEqual(run(fs, ["./template.json"]), { stdout: "settings.json: template missing at ./template.json - skipped\n", stderr: "", exit: 1 });
    assert.deepEqual(readJson(fs, TARGET), { hostKey: 1 });
  });
}

for (const args of [[], ["--reset"], [""], [TEMPLATE, "a", "b"]]) {
  test(`a call with the arguments ${JSON.stringify(args)} prints the usage on stderr and exits 1`, () => {
    assert.deepEqual(run(host(), args), { stdout: "", stderr: "usage: merge-settings.sh [--reset] <template> [<target>]\n", exit: 1 });
  });
}
