/*
 * session-start.test.ts - proves viber/hooks/scripts/session-start.sh's
 * injection contract: hooks/content/manifest.md goes into the session verbatim
 * as additionalContext, with a user-facing systemMessage banner carrying the
 * plugin version, and the hook falls open to the banner alone whenever the
 * manifest is empty or cannot be found.
 *
 * The empty case is not an edge here: viber ships the manifest file empty, so
 * "banner only, nothing injected" is the plugin's shipped state until the file
 * carries content. The case that reads the REAL manifest therefore derives its
 * expectation from the file rather than hard-coding either state - filling the
 * manifest in must not turn this suite red.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/session-start.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { SUT, fakePluginRoot, isolatedScript, run } from "./session-start-fixture.ts";

const SHIPPED_MANIFEST = path.resolve(import.meta.dirname, "../../viber/hooks/content/manifest.md");

test("an EMPTY manifest injects nothing - the banner fires alone, so a file not yet written leaks no half-content into the session", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const root = fakePluginRoot(path.join(dir, "plugin"), "");
    const json = await run(SUT, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(json.hookSpecificOutput.additionalContext, undefined);
    assert.equal(json.systemMessage, "viber loaded plugin");
  });
});

test("a whitespace-only manifest is treated as empty too (the command substitution strips it to nothing)", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const root = fakePluginRoot(path.join(dir, "plugin"), "\n\n\n");
    const json = await run(SUT, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, undefined);
  });
});

test("a manifest file's trailing newline(s) are stripped from additionalContext ($(cat ...) command-substitution semantics)", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const root = fakePluginRoot(path.join(dir, "plugin"), "manifest body\n\n\n");
    const json = await run(SUT, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, "manifest body");
  });
});

test('source: "resume" on stdin -> the script itself does not filter by source (the matcher in hooks.json excludes it), so it still injects normally', async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const manifest = "manifest body";
    const root = fakePluginRoot(path.join(dir, "plugin"), manifest);
    const json = await run(SUT, JSON.stringify({ source: "resume" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, manifest);
    assert.ok(json.systemMessage.length > 0);
  });
});

test("malformed stdin JSON is drained and ignored - the script never parses stdin as JSON", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const manifest = "manifest body";
    const root = fakePluginRoot(path.join(dir, "plugin"), manifest);
    const json = await run(SUT, "not json { at all", { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, manifest);
  });
});

test("empty stdin (closed immediately) -> still emits the manifest normally, exit 0", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const manifest = "manifest body";
    const root = fakePluginRoot(path.join(dir, "plugin"), manifest);
    const json = await run(SUT, "", { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, manifest);
    assert.ok(json.systemMessage.length > 0);
  });
});

test("no CLAUDE_PLUGIN_ROOT set -> falls back to the SHIPPED manifest via SCRIPT_DIR, version banner reads 'dev'", async () => {
  const result = await runScript(SUT, [], { shell: "bash", input: JSON.stringify({ source: "startup" }) });
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.systemMessage, "viber loaded dev");
  // Derived from the shipped file, so this case holds both while the manifest
  // is empty (its shipped state today) and once it carries content.
  const shipped = fs.readFileSync(SHIPPED_MANIFEST, "utf-8").replace(/\n+$/, "");
  assert.equal(json.hookSpecificOutput.additionalContext, shipped === "" ? undefined : shipped);
});

/** A plugin root whose setup template carries `schema: <n>` (`templateSchema`),
 *  plus a project dir whose `.claude/viber.yml` holds `projectFile` (null: no
 *  file). Returns the env and the stdin payload the hook receives. */
function schemaSession(dir: string, templateSchema: number, projectFile: string | null) {
  const root = fakePluginRoot(path.join(dir, "plugin"), "manifest body");
  const templateDir = path.join(root, "skills", "setup", "templates");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "viber.yml"), `# comment\nschema: ${templateSchema}\nplanning:\n  adr: true\n`);
  const project = path.join(dir, "project");
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
  if (projectFile !== null) fs.writeFileSync(path.join(project, ".claude", "viber.yml"), projectFile);
  return {
    env: { CLAUDE_PLUGIN_ROOT: root },
    input: JSON.stringify({ source: "startup", cwd: project }),
  };
}

const RUN_SETUP = (n: number, m: number) =>
  `viber loaded plugin - .claude/viber.yml is at schema ${n}, this version expects ${m}: run /viber:setup`;

test("a project file without a schema key gets the run-setup note naming schema 0 and the template's number", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, "planning:\n  adr: true\n");
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, RUN_SETUP(0, 2));
  });
});

test("a schema value that is not a number gets the run-setup note naming schema 0", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, "schema: latest\nplanning:\n  adr: true\n");
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, RUN_SETUP(0, 2));
  });
});

test("an indented schema key does not count (only the column-0 key is the file's schema)", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, "planning:\n  schema: 2\n");
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, RUN_SETUP(0, 2));
  });
});

test("a file at a lower schema number gets the run-setup note", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 3, "schema: 1\r\nplanning:\r\n");
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, RUN_SETUP(1, 3));
  });
});

test("a file at a higher schema number gets the update-plugin note", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 1, "schema: 4 # newer\n");
    const json = await run(SUT, input, env);
    assert.equal(
      json.systemMessage,
      "viber loaded plugin - .claude/viber.yml is at schema 4, newer than this version's 1: update the viber plugin",
    );
  });
});

test("an equal schema number keeps the plain banner", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, "schema: 2\n");
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, "viber loaded plugin");
  });
});

test("a project without a .claude/viber.yml keeps the plain banner", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, null);
    const json = await run(SUT, input, env);
    assert.equal(json.systemMessage, "viber loaded plugin");
  });
});

test("a payload without cwd keeps the plain banner", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env } = schemaSession(dir, 2, "planning:\n");
    const json = await run(SUT, JSON.stringify({ source: "startup" }), env);
    assert.equal(json.systemMessage, "viber loaded plugin");
  });
});

test("a plugin whose setup template cannot be read keeps the plain banner", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const script = isolatedScript(path.join(dir, "isolated"));
    const { env, input } = schemaSession(dir, 2, "planning:\n");
    fs.rmSync(path.join(env.CLAUDE_PLUGIN_ROOT, "skills"), { recursive: true });
    const json = await run(script, input, env);
    assert.equal(json.systemMessage, "viber loaded plugin");
  });
});

test("without CLAUDE_PLUGIN_ROOT the template is read relative to the script", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { input } = schemaSession(dir, 2, "planning:\n");
    const scriptsDir = path.join(dir, "rel", "hooks", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(SUT, path.join(scriptsDir, "session-start.sh"));
    const templateDir = path.join(dir, "rel", "skills", "setup", "templates");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, "viber.yml"), "schema: 5\n");
    const json = await run(path.join(scriptsDir, "session-start.sh"), input);
    assert.equal(json.systemMessage, "viber loaded dev - .claude/viber.yml is at schema 0, this version expects 5: run /viber:setup");
  });
});

test("the project file is found at the git top level when cwd is a subdirectory", async () => {
  await withGitRepo(async (repo) => {
    const { env } = schemaSession(repo.dir, 2, "schema: 1\n");
    const inner = path.join(repo.dir, "project", "nested");
    fs.mkdirSync(inner, { recursive: true });
    fs.renameSync(path.join(repo.dir, "project", ".claude"), path.join(repo.dir, ".claude"));
    const json = await run(SUT, JSON.stringify({ source: "startup", cwd: inner }), { ...env, ...repo.env });
    assert.equal(json.systemMessage, RUN_SETUP(1, 2));
  });
});

test("the manifest is injected unchanged beside the run-setup note", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 2, "schema: 1\n");
    const json = await run(SUT, input, env);
    assert.equal(json.hookSpecificOutput.additionalContext, "manifest body");
  });
});

test("the manifest is injected unchanged beside the update-plugin note", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const { env, input } = schemaSession(dir, 1, "schema: 2\n");
    const json = await run(SUT, input, env);
    assert.equal(json.hookSpecificOutput.additionalContext, "manifest body");
  });
});

test("the hooks.json description names the schema note beside the banner", () => {
  const hooks = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf-8"));
  assert.match(hooks.description, /schema note/);
});

test("a manifest containing characters that must survive JSON encoding round-trips exactly", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const manifest = 'line with a "quote", a \\backslash\\, a café, and:\nsecond line after a real newline';
    const root = fakePluginRoot(path.join(dir, "plugin"), manifest);
    const json = await run(SUT, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, manifest);
  });
});
