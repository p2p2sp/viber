/*
 * settings-template.unit.test.ts - the shape of the shipped permissions template
 * viber/skills/setup/templates/settings.json, the single source of the
 * recommended allow/ask/deny lists /viber:setup offers.
 *
 * The template is designed for a session with auto mode OFF: it seeds
 * permissions.disableAutoMode, so there is no classifier and every outcome is
 * decided by the static rules alone.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "../harness/test.ts";

test("the shipped template carries the recommended block only: built-in tools, recoverable operations asked, irreversible ones denied, no host-specific key", () => {
  const template = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/settings.json"), "utf-8"));

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
