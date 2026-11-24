/*
 * retired.ts - the rule keeping the retired workflow and shard file names out of the tracked files.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "forbidden/retired",
    type: "forbidden",
    params: {
      tokens: ["full.yml", "test-shard.ts"],
      include: ["**"],
      exclude: ["docs/**", "**/CLAUDE.md", "tools/lint/data/retired.ts"],
    },
    why: "the workflow that ran every tier and the shard script are gone: the legacy tests run in legacy.yml through node's own --test-shard",
  },
];
