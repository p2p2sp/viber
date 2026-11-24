/*
 * dashes.ts - the rule keeping the em dash and the en dash out of the tracked text files.
 * The characters are built from their code points so this file never holds them.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "forbidden/dashes",
    type: "forbidden",
    params: {
      tokens: [String.fromCharCode(0x2014), String.fromCharCode(0x2013)],
      include: ["**"],
      exclude: [
        "docs/**",
        "viber/hooks/content/manifest.md",
        "tests/viber/ui-tells.unit.test.ts",
        "tools/lint/data/dashes.ts",
      ],
    },
    why: "the owner's text rule: a plain hyphen, comma, colon or parentheses, never an em or en dash",
  },
];
