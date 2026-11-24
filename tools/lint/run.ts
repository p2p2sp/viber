/*
 * run.ts - entry of the lint job: node tools/lint/run.ts [<type or rule id>...]
 * Discovers every rules/*.ts type and data/*.ts instance list, runs them and prints the lines.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { nodeFs } from "../../viber/lib/adapters/fs.ts";
import { gitCommand } from "../../viber/lib/adapters/git.ts";
import { runLint, type RuleInstance, type RuleType } from "./engine.ts";
import { repoTree } from "./tree.ts";

async function modulesOf(dir: string): Promise<any[]> {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".ts")).sort();
  return Promise.all(names.map((n) => import(pathToFileURL(path.join(dir, n)).href)));
}

const root = gitCommand.repoRoot(process.cwd());
if (root === null) {
  console.log("lint: not inside a repository");
  process.exit(1);
}

const types: RuleType<any>[] = (await modulesOf(path.join(import.meta.dirname, "rules"))).map((m) => m.default);
const rules: RuleInstance[] = (await modulesOf(path.join(import.meta.dirname, "data"))).flatMap((m) => m.rules);
const { lines, status } = runLint(repoTree(nodeFs, gitCommand, root), types, rules, process.argv.slice(2));
console.log(lines.join("\n"));
process.exitCode = status;
