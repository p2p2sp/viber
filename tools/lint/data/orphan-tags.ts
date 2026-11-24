/*
 * orphan-tags.ts - instances of the `orphan-tags` rule type.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "orphan-tags/tracked",
    type: "orphan-tags",
    params: {
      exclude: ["docs/", ".docs/"],
      binaryExtensions: [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"],
    },
    why: "a write call leaks its closing tag as the last line of a file; docs/ keeps run records verbatim",
  },
];
