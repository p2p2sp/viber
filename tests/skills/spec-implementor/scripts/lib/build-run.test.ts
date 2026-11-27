/*
 * Characterization of the config read of runBuild: the `directories` names in
 * the refusal of a run archived by a call that died in the archive commit.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBuild } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-run.ts";
import { fakeFs, fakeGh, fakeGit, ROOT } from "../../../../fake-ports.ts";

function archived(yaml: string | null, runs: string, specifications: string) {
  const fs = fakeFs({ [`${ROOT}/plan.md`]: `Spec: docs/${runs}/run1/spec.md\n\n# Plan\n`, [`${ROOT}/docs/${specifications}/run1/spec.md`]: "spec" });
  if (yaml !== null) fs.writeText(`${ROOT}/.claude/viber.yml`, yaml);
  const git = fakeGit([`docs/${runs}/run1/outcome.md`]);
  return runBuild(["plan.md", "start"], ROOT, "/refs", { fs, git, gh: fakeGh(), tree: { root: () => ROOT, files: () => [] } });
}

describe("runBuild", () => {
  it("reads directories from <root>/.claude/viber.yml", () => {
    assert.deepEqual(archived("directories:\n  runs: open-runs\n  specifications: done\n", "open-runs", "done"), {
      stdout: "",
      stderr: "build.sh: the run is archived at docs/done/run1, the archive commit did not finish: commit docs/open-runs/run1 and docs/done/run1\n",
      exit: 2,
    });
  });

  it("no config: the default directories", () => {
    assert.equal(archived(null, "_specs", "specs").stderr, "build.sh: the run is archived at docs/specs/run1, the archive commit did not finish: commit docs/_specs/run1 and docs/specs/run1\n");
    assert.equal(archived(null, "open-runs", "done").stderr, `build.sh: cannot read the spec ${ROOT}/docs/open-runs/run1/spec.md\n`);
  });
});
