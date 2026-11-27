/*
 * Characterization of the config read of listOf: the close entries follow
 * build.rules, build.qa and build.extensions of .claude/viber.yml.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listOf } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-list.ts";
import { fakeCtx, fakeFs, ROOT } from "../../../../fake-ports.ts";

const list = (yaml: string | null): string[] => listOf(fakeCtx({ fs: fakeFs(yaml === null ? {} : { [`${ROOT}/.claude/viber.yml`]: yaml }) }));

describe("listOf", () => {
  it("no config: the rules writer, no QA writer, no extensions", () => {
    assert.deepEqual(list(null), ["pending | Final review", "pending | Final test run", "pending | Update project memory", "pending | Update project rules", "pending | Finalize"]);
  });

  it("reads <root>/.claude/viber.yml", () => {
    assert.deepEqual(list("build:\n  rules: false\n  qa: true\n  extensions:\n    my-agent:\n"), [
      "pending | Final review",
      "pending | Final test run",
      "pending | Update project memory",
      "pending | Write QA scenarios",
      "pending | Run extensions",
      "pending | Finalize",
    ]);
  });
});
