/*
 * script-portability.ts - the instance of the `script-portability` rule over the tracked shell and
 * TypeScript files that ship, outside tests/ and docs/.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "script-portability/shipped",
    type: "script-portability",
    params: { extensions: [".sh", ".ts"], exclude: ["tests/", "docs/"] },
    why: "every shipped script must run on Windows (Git Bash) and macOS",
  },
];
