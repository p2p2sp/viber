/*
 * Characterization of the `before` filter of leftOf: the files the run answers for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leftOf } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-state.ts";
import { fakeCtx, fakeGit } from "../../../../fake-ports.ts";

describe("leftOf", () => {
  const dirty = ["src/a.ts", "src/user.ts", "docs/_specs/run1/outcome.md", ".temp/x"];

  it("leaves out a path of before, the run directory and .temp/", () => {
    const ctx = fakeCtx({ git: fakeGit(dirty), before: ["src/user.ts"] });
    assert.deepEqual(leftOf(ctx), ["src/a.ts"]);
  });

  it("a state without before has no user files", () => {
    const ctx = fakeCtx({ git: fakeGit(dirty) });
    assert.equal(ctx.state.before, undefined);
    assert.deepEqual(leftOf(ctx), ["src/a.ts", "src/user.ts"]);
  });
});
