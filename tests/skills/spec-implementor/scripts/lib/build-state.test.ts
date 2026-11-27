/*
 * Characterization of the `before` filter of leftOf: the files the run answers for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leftOf, phaseOf, renderOutcome } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-state.ts";
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

describe("phaseOf", () => {
  it("reads the Phase line plan.sh land writes", () => {
    assert.deepEqual(phaseOf("# Plan\n\nSpec: docs/_specs/a-p2-of-3/spec.md\nPhase: P2 of 3\nPlan: x\n"), { n: 2, of: 3 });
  });

  it("no line, another form or a part past the count: none", () => {
    assert.equal(phaseOf("Spec: s\n"), null);
    assert.equal(phaseOf("Phase: 2 of 3\n"), null);
    assert.equal(phaseOf("Phase: P4 of 3\n"), null);
  });
});

describe("renderOutcome", () => {
  it("a part: the Phase line under the title", () => {
    const ctx = { ...fakeCtx(), phase: { n: 2, of: 3 } };
    assert.equal(renderOutcome(ctx), "# Outcome: Run\n\nPhase: P2 of 3\n\n## Tasks\n\n");
  });

  it("a part with an issue: the Issue line under the Phase line, a number as #<n>", () => {
    assert.equal(renderOutcome({ ...fakeCtx(), phase: { n: 1, of: 2 }, issue: "42" }), "# Outcome: Run\n\nPhase: P1 of 2\nIssue: #42\n\n## Tasks\n\n");
    assert.match(renderOutcome({ ...fakeCtx(), phase: { n: 1, of: 2 }, issue: "https://github.com/o/r/issues/4" }), /^Issue: https:\/\/github\.com\/o\/r\/issues\/4$/m);
  });

  it("an issue with no part: no Issue line", () => {
    assert.doesNotMatch(renderOutcome({ ...fakeCtx(), issue: "42" }), /Issue:/);
  });

  it("no part: no Phase line", () => {
    assert.equal(renderOutcome(fakeCtx()), "# Outcome: Run\n\n## Tasks\n\n");
  });
});
