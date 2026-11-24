/*
 * forbidden.ts - the `forbidden` rule type: no tracked file under the include globs, outside the
 * exclude globs, may hold one of the tokens.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface ForbiddenParams { tokens: string[]; include: string[]; exclude: string[] }

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (c === "*") {
      source += "[^/]*";
    } else if (c === "?") {
      source += "[^/]";
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function check(tree: Tree, params: ForbiddenParams): Finding[] {
  const include = params.include.map(globToRegExp);
  const exclude = params.exclude.map(globToRegExp);
  const findings: Finding[] = [];
  for (const file of tree.files) {
    if (!include.some((r) => r.test(file.path)) || exclude.some((r) => r.test(file.path))) continue;
    const text = tree.read(file.path);
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      for (const token of params.tokens) {
        if (line.includes(token)) findings.push({ path: file.path, line: i + 1, message: `forbidden token ${JSON.stringify(token)}` });
      }
    });
  }
  return findings;
}

const forbidden: RuleType<ForbiddenParams> = {
  name: "forbidden",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "a.md", mode: "100644" }],
      read: () => "fine\nbad token here",
      list: () => [],
    },
    params: { tokens: ["bad token"], include: ["**"], exclude: [] },
  },
};

export default forbidden;
