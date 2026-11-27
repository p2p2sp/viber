/*
 * The part of a split change as plan-run.ts reads it from the spec's directory
 * name, and the refusal of `paths` while the part before is not built.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phaseOf, runPlan } from "../../../../../viber/skills/planner/scripts/lib/plan-run.ts";
import type { Fs } from "../../../../../viber/skills/planner/scripts/lib/ports.ts";

const ROOT = "/r";
const SPEC = "## Requirements\n\n- R1: it works\n";

function ports(files: Record<string, string>) {
  const written = new Map<string, string>();
  const fs: Fs = {
    readText: (path) => files[path] ?? null,
    writeText: (path, text) => (written.set(path, text), true),
    list: () => [],
    remove: () => {},
  };
  return { fs, written, tree: { root: () => ROOT, files: () => [] }, clock: { now: () => new Date(2026, 0, 2, 3, 4, 5) } };
}

describe("phaseOf", () => {
  it("reads the part and names the directory of the one before", () => {
    assert.deepEqual(phaseOf("/r/docs/_specs/20260101_x-p2-of-3/spec.md"), { n: 2, of: 3, previous: "/r/docs/_specs/20260101_x-p1-of-3" });
  });

  it("gives the first part no predecessor", () => {
    assert.deepEqual(phaseOf("docs/_specs/20260101_x-p1-of-3/spec.md"), { n: 1, of: 3, previous: null });
  });

  it("is null for a directory with no part suffix or a part past its count", () => {
    assert.equal(phaseOf("/r/docs/_specs/20260101_x/spec.md"), null);
    assert.equal(phaseOf("/r/docs/_specs/20260101_x-p4-of-3/spec.md"), null);
  });
});

describe("runPlan paths", () => {
  const spec = `${ROOT}/docs/_specs/20260101_x-p2-of-3/spec.md`;
  const runP1 = `${ROOT}/docs/_specs/20260101_x-p1-of-3`;
  const archiveP1 = `${ROOT}/docs/specs/20260101_x-p1-of-3`;
  const paths = (files: Record<string, string>) => runPlan(["paths", spec], ROOT, ports({ [spec]: SPEC, ...files }));

  it("refuses while the part before has no outcome: absent, or only started", () => {
    assert.deepEqual([paths({}).stdout, paths({}).exit], ["OPEN: P1 is not built\n", 1]);
    assert.equal(paths({ [`${runP1}/outcome.md`]: "o", [`${runP1}/plan.md`]: "p" }).exit, 1);
  });

  it("names the work files once the part before closed in full, archived or left in place", () => {
    const archived = paths({ [`${archiveP1}/outcome.md`]: "o" });
    assert.equal(archived.exit, 0);
    assert.match(archived.stdout, /^draft: \/r\/\.temp\/viber\/20260101_x-p2-of-3\/plan-draft\.md$/m);
    assert.equal(paths({ [`${runP1}/outcome.md`]: "o" }).exit, 0);
  });

  it("finds the archive in the configured specifications directory", () => {
    const config = { [`${ROOT}/.claude/viber.yml`]: "directories:\n  specifications: done\n" };
    assert.equal(paths({ ...config, [`${archiveP1}/outcome.md`]: "o" }).exit, 1);
    assert.equal(paths({ ...config, [`${ROOT}/docs/done/20260101_x-p1-of-3/outcome.md`]: "o" }).exit, 0);
  });
});

describe("runPlan land of a later part", () => {
  const spec = `${ROOT}/docs/_specs/20260101_x-p2-of-3/spec.md`;
  const draft = `${ROOT}/d.md`;
  const map = `${ROOT}/m.md`;
  const plan = `${ROOT}/p.md`;
  const DRAFT = "# T\n\n## Tasks\n\n### T1 - a\nDelivers: x\nCovers: R1\nFiles: +a.ts\nBlocked-by: none\nTDD: none (shape)\nTests: none\nSeam: none\nDoD:\n- done\nVerify: true\n";
  function landed(outcome: string, issue?: string): string {
    const p = ports({ [spec]: SPEC, [draft]: DRAFT, [map]: "none\n", [`${ROOT}/docs/specs/20260101_x-p1-of-3/outcome.md`]: outcome });
    const result = runPlan(["land", draft, spec, map, plan, ...(issue === undefined ? [] : [issue])], ROOT, p);
    assert.equal(result.exit, 0, result.stdout + result.stderr);
    return p.written.get(plan) ?? "";
  }

  it("with no issue given, takes the one of the part before's outcome", () => {
    assert.match(landed("# Outcome: X\n\nPhase: P1 of 3\nIssue: #42\n"), /^Phase: P2 of 3\nPlan: .*\nIssue: #42$/m);
  });

  it("a given issue wins; an outcome without one gives none", () => {
    assert.match(landed("Issue: #42\n", "7"), /^Issue: #7$/m);
    assert.doesNotMatch(landed("# Outcome: X\n"), /^Issue:/m);
  });
});
