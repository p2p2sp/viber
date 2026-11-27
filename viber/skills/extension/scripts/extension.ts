/*
 * extension.ts - the state the extension skill starts from and its one write:
 * whether the host's config can take an entry, which agents the host has, and
 * the registration of one agent in `build.extensions`.
 *
 * It exists because a model must not parse or rewrite .claude/viber.yml:
 * the map is read by `extensionMap` of the spec-implementor skill, the reader
 * the build itself uses, and the entry is one inserted line.
 *
 * Contract:
 *   argv   : none -> the state. `add <name>` -> registers <name>.
 *   cwd    : any directory inside the host project: <root> is the repository
 *            root, the cwd outside a repository.
 *   reads  : <root>/.claude/viber.yml, the names in <root>/.claude/agents/.
 *   writes : `add` only: one line into <root>/.claude/viber.yml.
 *   stdout : none ->
 *              CONFIG=ok | no-file | no-key
 *              AGENTS=<name>, <name> | none
 *            no-key: the file has no `extensions:` key directly under `build:`,
 *            or the key carries a value on its own line other than `""` or
 *            `''`. AGENTS: each
 *            .claude/agents/<name>.md, sorted.
 *            add <name> ->
 *              STATUS=added | present | invalid-name | no-file | no-key | no-agent
 *            read in this order: invalid-name (<name> is no `[a-z0-9][a-z0-9-]*`),
 *            no-file and no-key (as CONFIG), present (the map holds the entry),
 *            no-agent (no .claude/agents/<name>.md). added: the line `<name>:`
 *            goes in after the last line of the map, right after the key while
 *            the map is empty, at the indent of its entries (the key's plus two
 *            spaces for the first), with the line ending of the key line; a
 *            `""` or `''` after the key goes. Every other byte stays. Any other
 *            status writes nothing.
 *   exit   : 0.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { AGENT_NAME, configPath, extensionMap } from "../../spec-implementor/scripts/lib/build-config.ts";

function root(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim() || process.cwd();
  } catch {
    return process.cwd();
  }
}

const base = root();
const config = configPath(base);
const agents = `${base}/.claude/agents`;
const yaml = existsSync(config) ? readFileSync(config, "utf-8") : null;
const map = extensionMap(yaml);
const state = yaml === null ? "no-file" : map.key < 0 ? "no-key" : "ok";

function add(name: string): string {
  if (!AGENT_NAME.test(name)) return "invalid-name";
  if (yaml === null || state !== "ok") return state;
  if (map.entries.some((entry) => entry.name === name)) return "present";
  if (!existsSync(`${agents}/${name}.md`)) return "no-agent";
  const lines = yaml.split("\n");
  const cr = lines[map.key].endsWith("\r") ? "\r" : "";
  lines[map.key] = lines[map.key].replace(/:\s*(""|'')/, ":");
  lines.splice(map.last + 1, 0, `${" ".repeat(map.indent)}${name}:${cr}`);
  writeFileSync(config, lines.join("\n"));
  return "added";
}

if (process.argv[2] === "add") console.log(`STATUS=${add(process.argv[3] ?? "")}`);
else {
  const names = existsSync(agents)
    ? readdirSync(agents)
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.slice(0, -3))
        .sort()
    : [];
  console.log(`CONFIG=${state}\nAGENTS=${names.join(", ") || "none"}`);
}
