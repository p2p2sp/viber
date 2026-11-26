/*
 * node-requirement.ts - the rule keeping the Node requirement token in the three user documents
 * and in the text the session start hook injects when Node is too old.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "token-contract/node-requirement",
    type: "token-contract",
    params: {
      token: "Node.js 22.18",
      files: [
        "README.md",
        "viber/README.md",
        "viber/hooks/content/node-missing.md",
      ],
    },
    why: "every viber skill and hook needs Node.js 22.18 or newer, and the docs and the refusal text must say the same version",
  },
];
