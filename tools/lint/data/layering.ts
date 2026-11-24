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
      // A skill entry is named whole: a glob over viber/skills/*/scripts/ would also take a script that is no entry.
      entries: [
        "viber/scripts/*.ts",
        "viber/skills/intent/scripts/summary-path.ts",
        "viber/skills/code-auditor/scripts/strip-tag.ts",
        "viber/skills/handoff/scripts/handoff-path.ts",
        "viber/skills/e2e/scripts/qa-ledger.ts",
        "viber/skills/fixer/scripts/tree-record.ts",
        "viber/skills/code-auditor/scripts/diff-files.ts",
        "viber/skills/code-auditor/scripts/synthesize.ts",
        "viber/skills/planner/scripts/reach.ts",
        "viber/skills/extension/scripts/extension.ts",
        "viber/skills/code-auditor/scripts/frame.ts",
        "viber/skills/skill-designer/scripts/lint_skill.ts",
        "tools/lint/run.ts",
      ],
      entryMaxLines: 40,
      tests: [
        { core: "viber/lib/config", tests: "tests/viber/config" },
        { core: "viber/lib", tests: "tests/viber/lib" },
      ],
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
