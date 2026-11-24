/*
 * tiers.ts - the instance of the `tiers` rule over the legacy test tiers.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "tiers/legacy",
    type: "tiers",
    params: {
      root: "tests",
      // release.sh runs only in the release workflow, on ubuntu-latest
      exempt: ["tests/github/release.test.ts"],
      // The cap on `test(` call sites across the critical tier; raised only on purpose.
      budget: 270,
    },
    why: "every legacy logic file starts its script on every operating system through a critical sibling, and the critical tier stays cheap on the slowest runner",
  },
];
