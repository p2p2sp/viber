/*
 * token-contract.ts - the `token-contract` rule type: every listed file must exist and hold a token.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface TokenContractParams { token: string; files: string[] }

function check(tree: Tree, params: TokenContractParams): Finding[] {
  const findings: Finding[] = [];
  for (const path of params.files) {
    const text = tree.read(path);
    if (text === null) findings.push({ path, line: 0, message: "file not found" });
    else if (!text.includes(params.token)) findings.push({ path, line: 0, message: `missing token ${params.token}` });
  }
  return findings;
}

const tokenContract: RuleType<TokenContractParams> = {
  name: "token-contract",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "a.md", mode: "100644" }],
      read: () => "nothing here",
      list: () => [],
    },
    params: { token: "needle", files: ["a.md"] },
  },
};

export default tokenContract;
