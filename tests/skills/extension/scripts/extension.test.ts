/*
 * Characterization of the config read of extension.ts: CONFIG and the `add`
 * write follow the `build.extensions` map of <root>/.claude/viber.yml.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, it } from "node:test";
import { removeDir, runEntry, tempDir, writeFiles } from "../../../temp-repo.ts";

const ENTRY = "viber/skills/extension/scripts/extension.ts";
let dir = "";
afterEach(() => removeDir(dir));

const project = (yaml: string | null): string => {
  dir = tempDir(true);
  writeFiles(dir, { ".claude/agents/b-agent.md": "agent", ".claude/agents/a-agent.md": "agent", ...(yaml === null ? {} : { ".claude/viber.yml": yaml }) });
  return dir;
};

describe("extension.ts", () => {
  it("no file", () => {
    assert.deepEqual(runEntry(ENTRY, [], project(null)), ["CONFIG=no-file", "AGENTS=a-agent, b-agent"]);
  });

  it("reads <root>/.claude/viber.yml and adds an entry to its map", () => {
    const root = project("build:\n  extensions:\n    a-agent:\n");
    assert.deepEqual(runEntry(ENTRY, [], root), ["CONFIG=ok", "AGENTS=a-agent, b-agent"]);
    assert.deepEqual(runEntry(ENTRY, ["add", "a-agent"], root), ["STATUS=present"]);
    assert.deepEqual(runEntry(ENTRY, ["add", "b-agent"], root), ["STATUS=added"]);
    assert.equal(fs.readFileSync(`${root}/.claude/viber.yml`, "utf-8"), "build:\n  extensions:\n    a-agent:\n    b-agent:\n");
  });

  // Changed on purpose: `extensions: ""` is an empty map.
  it('extensions: "" is an empty map', () => {
    assert.deepEqual(runEntry(ENTRY, [], project('build:\n  extensions: ""\n')), ["CONFIG=ok", "AGENTS=a-agent, b-agent"]);
  });

  it("add on an empty quoted value drops the quotes, so the map stays valid YAML", () => {
    const root = project("build:\n  extensions: '' # none\n  qa: true\n");
    assert.deepEqual(runEntry(ENTRY, ["add", "a-agent"], root), ["STATUS=added"]);
    assert.equal(fs.readFileSync(`${root}/.claude/viber.yml`, "utf-8"), "build:\n  extensions: # none\n    a-agent:\n  qa: true\n");
  });
});
