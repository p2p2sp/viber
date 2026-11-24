/*
 * layering.ts - the instance of the layering rule: the viber core, its entries and its unit tests.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "layering/core",
    type: "layering",
    params: {
      core: ["viber/lib"],
      adapters: ["viber/lib/adapters"],
      exempt: ["viber/lib/ports.ts"],
      outside: ["node:fs", "node:child_process", "node:os", "node:net", "node:http", "node:https"],
      entries: ["viber/scripts/*.ts", "tools/lint/run.ts"],
      entryMaxLines: 40,
      tests: [{ core: "viber/lib/config", tests: "tests/viber/config" }],
      unitTests: ["tests/viber/config", "tests/viber/lib", "tests/tools/lint"],
      unitForbidden: [
        "node:child_process",
        "node:net",
        "node:http",
        "node:https",
        "harness/run.ts",
        "harness/tmp.ts",
        "harness/stub.ts",
        "harness/shells.ts",
        "harness/scene.ts",
      ],
    },
    why: "the core stays pure and tested in process, the entries stay thin and the unit tests stay off the outside world",
  },
];
