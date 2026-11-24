/*
 * extension.unit.test.ts - the extension core on fake ports: with no argument
 * it reports the configuration state, the listed agents (a plain comma list of
 * names in run order), the listed names with no file, and one AGENT= line per
 * project agent saying whether it carries the extension marker; with
 * `--add <name>` it registers a name once as an entry of the `extensions:` map
 * under `build:`.
 *
 * Two properties carry the design. A refusal is a STATUS= line, never a
 * failure, and a refusal - no config, a config without the key, an invalid
 * name, a name that already has an entry - leaves every file untouched. A
 * written entry is two lines inserted below the map's last content line, in
 * the file's own line ending; every other byte stays as it was.
 *
 * The wrapper is run as a process by tests/viber/extension.critical.test.ts,
 * and its exec bit is held by the `invocations` lint rule.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runExtension } from "../../../viber/lib/extension.ts";
import type { Fs } from "../../../viber/lib/ports.ts";

const ROOT = "/r";
const CONFIG = `${ROOT}/.claude/viber.yml`;
const MARKER = "<!-- viber:extension -->";

/** A viber.yml whose `build:` group carries the given extension-map lines, a key after them and a group after that. */
function config(extensionLines: string[]): string {
  return ["schema: 3", "build:", "  memory: true", ...extensionLines, "  rules: true", "github:", "  issues: false", ""].join("\n");
}

/** files: repo-relative path to its text. repo false: no repository holds the cwd. */
function scene(files: Record<string, string>, opts: { repo?: boolean; dirs?: string[] } = {}) {
  const seeded = Object.fromEntries(Object.entries(files).map(([rel, text]) => [`${ROOT}/${rel}`, text]));
  const fs = fakeFs(seeded, { dirs: [ROOT, ...(opts.dirs ?? []).map((rel) => `${ROOT}/${rel}`)] });
  const git = fakeGit(opts.repo === false ? null : { root: ROOT, tracked: [] });
  const run = (argv: string[], cwd = ROOT): string[] =>
    runExtension(argv, cwd, { fs, git })
      .split("\n")
      .filter((line) => line !== "");
  return { fs, run, read: () => fs.readText(CONFIG) };
}

test("with entries a and b both parallel and both found, LISTED is the plain list `a, b`", () => {
  const s = scene({
    ".claude/viber.yml": config(["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: true"]),
    ".claude/agents/a.md": "a agent\n",
    ".claude/agents/b.md": "b agent\n",
  });
  assert.equal(s.run([])[1], "LISTED=a, b");
});

test("with no argument it prints the state, the listed agents that exist and the listed names with no file", () => {
  const s = scene({
    ".claude/viber.yml": config(["  extensions:", "    docs:", "      parallel: false", "    gone:"]),
    ".claude/agents/docs.md": "docs agent\n",
  });
  assert.deepEqual(s.run([]), ["CONFIG=ok", "LISTED=docs", "MISSING=gone", "AGENT=docs | plain"]);
});

test("with no argument it prints one AGENT= line per agent file, sorted by name, contract only for a file holding the marker line", () => {
  const s = scene({
    ".claude/viber.yml": config(["  extensions:"]),
    ".claude/agents/zeta.md": `intro\n${MARKER}\nbody\n`,
    ".claude/agents/alpha.md": `plain agent\nmentions ${MARKER} inside a sentence\n`,
    ".claude/agents/mid.md": `${MARKER}\n`,
  });
  assert.deepEqual(s.run([]).slice(3), ["AGENT=alpha | plain", "AGENT=mid | contract", "AGENT=zeta | contract"]);
});

test("a marker line ending in blanks and a carriage return still reads as the contract", () => {
  const s = scene({ ".claude/agents/crlf.md": `intro\r\n${MARKER} \t\r\nbody\r\n` });
  assert.deepEqual(s.run([]).slice(3), ["AGENT=crlf | contract"]);
});

test("an agents entry that is no .md file, a directory named like one and a name opening with a dot get no AGENT= line", () => {
  const s = scene({ ".claude/agents/notes.txt": "x\n", ".claude/agents/.hidden.md": "x\n", ".claude/agents/real.md": "x\n" }, { dirs: [".claude/agents/dir.md"] });
  assert.deepEqual(s.run([]).slice(3), ["AGENT=real | plain"]);
});

test("--add x on an empty map writes `    x:` and `      parallel: false` right below `  extensions:`", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:"]) });
  assert.deepEqual([s.run(["--add", "x"]), s.read()], [["STATUS=added"], config(["  extensions:", "    x:", "      parallel: false"])]);
});

test("--add y after entries writes it below the last entry's last option line at the entry depth, before a trailing comment", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: false", "", "    # trailing note"]) });
  s.run(["--add", "y"]);
  assert.equal(s.read(), config(["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: false", "    y:", "      parallel: false", "", "    # trailing note"]));
});

test("--add keeps a comment on the extensions line and every other line byte-identical", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:   # run order", "    # first the docs", "    a:   # docs", "      parallel: true   # safe"]) });
  s.run(["--add", "y"]);
  assert.equal(s.read(), config(["  extensions:   # run order", "    # first the docs", "    a:   # docs", "      parallel: true   # safe", "    y:", "      parallel: false"]));
});

test("--add on a CRLF file writes the two new lines in CRLF", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:", "    a:", "      parallel: true"]).replace(/\n/g, "\r\n") });
  s.run(["--add", "y"]);
  assert.equal(s.read(), config(["  extensions:", "    a:", "      parallel: true", "    y:", "      parallel: false"]).replace(/\n/g, "\r\n"));
});

test("--add below a last map line with no newline ends that line first", () => {
  const s = scene({ ".claude/viber.yml": "build:\n  extensions:\n    a:" });
  s.run(["--add", "y"]);
  assert.equal(s.read(), "build:\n  extensions:\n    a:\n    y:\n      parallel: false\n");
});

test("--add keeps a byte that is no valid UTF-8 elsewhere in the file as it is", () => {
  const head = new TextEncoder().encode("# ");
  const tail = new TextEncoder().encode("\nbuild:\n  extensions:\n");
  const fs = fakeFs({ [CONFIG]: new Uint8Array([...head, 0xff, ...tail]) });
  runExtension(["--add", "x"], ROOT, { fs, git: fakeGit({ root: ROOT, tracked: [] }) });
  const added = new TextEncoder().encode("    x:\n      parallel: false\n");
  assert.deepEqual([...(fs.readBytes(CONFIG) ?? [])], [...head, 0xff, ...tail, ...added]);
});

test("--add of a name that already has an entry prints STATUS=present and leaves the file byte-identical (whatever its agent file or option)", () => {
  const before = config(["  extensions:   # run order", "    x:", "      parallel: true", "    y:"]);
  const s = scene({ ".claude/viber.yml": before });
  assert.deepEqual([s.run(["--add", "x"]), s.read()], [["STATUS=present"], before]);
});

test("--add into a file that cannot be written prints STATUS=stale (an entry that never landed is never reported as added)", () => {
  const fake = fakeFs({ [CONFIG]: config(["  extensions:"]) });
  const fs: Fs = { ...fake, writeBytes: () => false };
  assert.equal(runExtension(["--add", "x"], ROOT, { fs, git: fakeGit({ root: ROOT, tracked: [] }) }), "STATUS=stale\n");
});

test("--add with no .claude/viber.yml prints STATUS=no-config and creates no file", () => {
  const s = scene({});
  assert.deepEqual([s.run(["--add", "x"]), s.fs.exists(`${ROOT}/.claude`)], [["STATUS=no-config"], false]);
});

test("--add on a config with no extensions: key under build: prints STATUS=stale and leaves the file untouched", () => {
  const before = ["schema: 2", "build:", "  memory: true", "github:", "  extensions:", "    x:", ""].join("\n");
  const s = scene({ ".claude/viber.yml": before });
  assert.deepEqual([s.run(["--add", "x"]), s.read()], [["STATUS=stale"], before]);
});

test("--add under an extensions: key carrying an inline value prints STATUS=stale and leaves the file byte-identical", () => {
  const before = config(["  extensions: {}"]);
  const s = scene({ ".claude/viber.yml": before });
  assert.deepEqual([s.run(["--add", "doc-writer"]), s.read()], [["STATUS=stale"], before]);
});

test("--add of the same name twice under a bare extensions: key prints STATUS=added, then STATUS=present", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:"]) });
  assert.deepEqual([s.run(["--add", "doc-writer"]), s.run(["--add", "doc-writer"])], [["STATUS=added"], ["STATUS=present"]]);
});

for (const name of ["Docs", "-docs", "../escape", "a b", ""]) {
  test(`--add of the invalid name ${JSON.stringify(name)} prints STATUS=invalid-name and leaves the file untouched`, () => {
    const before = config(["  extensions:"]);
    const s = scene({ ".claude/viber.yml": before });
    assert.deepEqual([s.run(["--add", name]), s.read()], [["STATUS=invalid-name"], before]);
  });
}

test("--add with no name prints STATUS=invalid-name", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:"]) });
  assert.deepEqual(s.run(["--add"]), ["STATUS=invalid-name"]);
});

test("with no argument and no .claude/viber.yml it prints CONFIG=no-config with nothing listed", () => {
  assert.deepEqual(scene({}).run([]), ["CONFIG=no-config", "LISTED=none", "MISSING=none"]);
});

test("with no argument and no extensions: key under build: it prints CONFIG=stale", () => {
  const s = scene({ ".claude/viber.yml": ["schema: 2", "build:", "  memory: true", ""].join("\n") });
  assert.equal(s.run([])[0], "CONFIG=stale");
});

test("an argument other than --add prints the report", () => {
  assert.deepEqual(scene({}).run(["--list"]), ["CONFIG=no-config", "LISTED=none", "MISSING=none"]);
});

test("from a subdirectory, a Windows spelling of it included, the configuration of the repository root is the one read and written", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:"]), "src/a.txt": "1\n" });
  assert.deepEqual([s.run(["--add", "x"], `${ROOT}/src`), s.run([], "\\r\\src\\")[0]], [["STATUS=added"], "CONFIG=ok"]);
  assert.equal(s.read(), config(["  extensions:", "    x:", "      parallel: false"]));
});

test("outside a repository the cwd is the base", () => {
  const s = scene({ ".claude/viber.yml": config(["  extensions:"]), ".claude/agents/a.md": `${MARKER}\n`, "src/a.txt": "1\n" }, { repo: false });
  assert.deepEqual([s.run([]), s.run([], `${ROOT}/src`)], [["CONFIG=ok", "LISTED=none", "MISSING=none", "AGENT=a | contract"], ["CONFIG=no-config", "LISTED=none", "MISSING=none"]]);
});
