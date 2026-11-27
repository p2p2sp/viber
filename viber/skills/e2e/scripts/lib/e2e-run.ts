/*
 * e2e-run.ts - the subcommands of e2e.ts, whose header is their contract.
 * Writes the `## Automation` lines of the handoff, the work directory and
 * nothing else, and deletes a spec file that did not end green; asks git for
 * the repository root and the tracked files, never for a write.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { delimiter, dirname, relative, resolve } from "node:path";
import { configPath, directoriesOf } from "../../../spec-implementor/scripts/lib/build-config.ts";

class Usage extends Error {}

/** One probe waits this long for an answer: a local application answers at once or not at all. */
const PROBE_MS = 5000;
/** The pause between two probes of a wait. */
const POLL_MS = 2000;
/** The longest wait and the longest test run, in seconds: both end before the 600 s a Bash call may take. */
const MAX_SECONDS = 540;
/** The log lines a red run prints: one failing assertion with its call log fits. */
const TAIL = 40;
/** The longest slug of a spec file name: the name stays readable and within every file system's limit. */
const SLUG = 60;
/** The letters NFD leaves whole. */
const FOLD: Record<string, string> = { ł: "l", ø: "o", đ: "d", ß: "ss", æ: "ae", œ: "oe" };
const CONFIG = /^playwright\.config\.[cm]?[jt]s$/;

type Recorded = "file" | "blocked";
interface Scenario {
  id: string;
  title: string;
  kind: "ui" | "api";
  /** The entry as written, its heading first. */
  entry: string[];
  state: Recorded | "pending";
  detail: string;
}
interface State {
  root: string;
  handoff: string;
  specDir: string;
  baseUrl: string;
  accounts: string;
  /** The scenario in flight, its repo-relative spec path and the sends it already failed. */
  current: string;
  spec: string;
  tries: number;
  /** The scenarios this pass is done with, and why the failed ones stayed pending. */
  handled: string[];
  failed: Record<string, string>;
}

const slash = (path: string): string => path.replaceAll("\\", "/");
const filled = (line: string): boolean => line.trim() !== "";

function read(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function git(cwd: string, args: string[]): string | null {
  const done = spawnSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
  return done.status === 0 ? done.stdout : null;
}

const rootOf = (cwd: string): string => slash(git(cwd, ["rev-parse", "--show-toplevel"])?.trim() || cwd);

/** The scenarios of the handoff in file order, the not automatable ones left out; the last `## Automation` line of an ID is its state. */
function scenariosOf(text: string): Scenario[] {
  const found: Scenario[] = [];
  const skipped = new Set<string>();
  const recorded = new Map<string, { state: Recorded; detail: string }>();
  let section = "";
  let open: Scenario | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      open = null;
    } else if (section === "UI scenarios" || section === "API scenarios") {
      const head = /^### (QA-\d+)(?:\s+(.*))?$/.exec(line);
      if (head !== null) found.push((open = { id: head[1], title: head[2] ?? "", kind: section === "UI scenarios" ? "ui" : "api", entry: [], state: "pending", detail: "" }));
      else if (line.startsWith("### ")) open = null;
      open?.entry.push(line);
    } else if (section === "Not automatable") {
      const id = /^- (QA-\d+)/.exec(line);
      if (id !== null) skipped.add(id[1]);
    } else if (section === "Automation") {
      const done = /^- (QA-\d+):\s*(file|blocked)(?:\s+(?:-\s+)?(.*))?$/.exec(line);
      if (done !== null) recorded.set(done[1], { state: done[2] as Recorded, detail: done[3] ?? "" });
    }
  }
  return found.filter((scenario) => !skipped.has(scenario.id)).map((scenario) => ({ ...scenario, ...recorded.get(scenario.id) }));
}

/** A header line of the handoff, `unknown` without one. */
const header = (text: string, name: string): string => new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(text.split(/^## /m)[0])?.[1] ?? "unknown";

const onPath = (name: string): boolean =>
  (process.env.PATH ?? "").split(delimiter).some((dir) => dir !== "" && ["", ".cmd", ".exe"].some((ext) => fs.existsSync(`${dir}/${name}${ext}`)));

function find(args: string, cwd: string): string[] {
  const root = rootOf(cwd);
  const named = args.trim().replace(/^(["'])(.*)\1$/, "$2");
  let handoff: string | undefined;
  if (named !== "") {
    const path = slash(resolve(cwd, named));
    handoff = fs.statSync(path, { throwIfNoEntry: false })?.isDirectory() ? `${path}/qa.e2e.md` : path;
  } else {
    const dirs = directoriesOf(read(configPath(root)));
    // A run directory opens with its timestamp: the last name is the newest run.
    handoff = [dirs.runs, dirs.specifications]
      .flatMap((dir) => (fs.existsSync(`${root}/docs/${dir}`) ? fs.readdirSync(`${root}/docs/${dir}`).map((run) => ({ run, path: `${root}/docs/${dir}/${run}/qa.e2e.md` })) : []))
      .filter((at) => fs.existsSync(at.path))
      .sort((a, b) => (a.run < b.run ? 1 : -1))[0]?.path;
  }
  const text = handoff === undefined ? null : read(handoff);
  if (text === null) return ["HANDOFF=none"];

  const tracked = (git(root, ["ls-files", "-z"]) ?? "").split("\0");
  const testDirs = tracked
    .filter((path) => CONFIG.test(path.slice(path.lastIndexOf("/") + 1)))
    .flatMap((config) => {
      const dir = /\btestDir\s*:\s*(["'`])([^"'`$]+)\1/.exec(read(`${root}/${config}`) ?? "");
      return dir === null ? [] : [slash(relative(root, resolve(root, dirname(config), dir[2]))) || "."];
    });
  const hasTest = ["package.json", ...tracked.filter((path) => path.endsWith("/package.json"))].some((path) => (read(`${root}/${path}`) ?? "").includes('"@playwright/test"'));
  return [
    `HANDOFF=${handoff}`,
    `PENDING=${scenariosOf(text).filter((scenario) => scenario.state !== "file").length}`,
    `SPEC_DIR=${testDirs.length === 1 ? testDirs[0] : "unknown"}`,
    `BASE=${header(text, "Base")}`,
    `LAUNCH=${header(text, "Launch")}`,
    `ACCOUNTS=${header(text, "Accounts")}`,
    ...(onPath("playwright-cli") ? [] : ["MISSING=playwright-cli: npm install -g @playwright/cli@latest"]),
    ...(hasTest ? [] : ["MISSING=@playwright/test: npm i -D @playwright/test && npx playwright install chromium"]),
  ];
}

function workOf(id: string, cwd: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || /^\.+$/.test(id)) throw new Usage(`bad id ${id}`);
  return `${rootOf(cwd)}/.temp/viber/${id}/e2e`;
}

function load(work: string): State {
  const state = read(`${work}/state.json`);
  if (state === null) throw new Usage("no start for this id");
  return JSON.parse(state) as State;
}

const save = (work: string, state: State): void => fs.writeFileSync(`${work}/state.json`, JSON.stringify(state));

/** True on any HTTP answer, a 404 or a redirect included. */
async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(PROBE_MS) });
    return true;
  } catch (error) {
    // A certificate the probe does not trust still comes from a listening server.
    return /CERT|SIGNATURE|SSL|TLS/.test(String((error as { cause?: { code?: unknown } }).cause?.code ?? ""));
  }
}

function slugOf(title: string): string {
  const folded = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[łøđßæœ]/g, (letter) => FOLD[letter]);
  return folded.replace(/[^a-z0-9]+/g, "-").slice(0, SLUG).replace(/^-|-$/g, "");
}

/** Sets the one `## Automation` line of an ID: the section is created at the end of the file, an earlier line of the ID leaves. */
function record(handoff: string, id: string, rest: string): void {
  const text = read(handoff) ?? "";
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && !filled(lines[lines.length - 1])) lines.pop();
  const line = `- ${id}: ${rest}`;
  const at = lines.findIndex((each) => each.trimEnd() === "## Automation");
  if (at < 0) lines.push("", "## Automation", line);
  else {
    const next = lines.findIndex((each, i) => i > at && each.startsWith("## "));
    const end = next < 0 ? lines.length : next;
    const kept = lines.slice(at + 1, end).filter((each) => filled(each) && !each.startsWith(`- ${id}:`));
    lines.splice(at + 1, end - at - 1, ...kept, line, ...(next < 0 ? [] : [""]));
  }
  fs.writeFileSync(handoff, `${lines.join(text.includes("\r\n") ? "\r\n" : "\n")}\n`);
}

/** The brief and the DISPATCH line of the first scenario left, or END with the report. */
function advance(work: string, state: State, script: string): string[] {
  const scenarios = scenariosOf(read(state.handoff) ?? "");
  const next = scenarios.find((scenario) => scenario.state !== "file" && !state.handled.includes(scenario.id));
  if (next === undefined) {
    const count = (name: Scenario["state"]): number => scenarios.filter((scenario) => scenario.state === name).length;
    const detail = (scenario: Scenario): string => (scenario.id in state.failed ? `failed: ${state.failed[scenario.id]}` : scenario.detail || "-");
    return ["END", ...scenarios.map((scenario) => `${scenario.id} | ${scenario.state} | ${detail(scenario)}`), `counts: ${count("file")} file, ${count("blocked")} blocked, ${count("pending")} pending`];
  }
  const name = [next.id.toLowerCase(), slugOf(next.title)].filter(filled).join("-");
  Object.assign(state, { current: next.id, spec: [state.specDir, `${name}.spec.ts`].filter(filled).join("/"), tries: 0 });
  save(work, state);
  const entry = next.entry.slice(0, next.entry.findLastIndex(filled) + 1);
  const covers = entry.map((line) => /^- Covers:\s*(.+)$/.exec(line)?.[1]).find((text) => text !== undefined);
  const brief = `${work}/${next.id}.md`;
  fs.rmSync(`${work}/${next.id}.reason`, { force: true });
  fs.writeFileSync(
    brief,
    [
      `id: ${next.id}`,
      `kind: ${next.kind}`,
      `file: ${state.root}/${state.spec}`,
      `title: ${[next.id, next.title].filter(filled).join(" ")}${covers === undefined ? "" : ` (covers: ${covers})`}`,
      `base-url: ${state.baseUrl}`,
      `accounts: ${state.accounts}`,
      `reason: ${work}/${next.id}.reason`,
      `temp: ${work}`,
      `run: "${script}" run "${brief}"`,
      "",
      ...entry,
      "",
    ].join("\n"),
  );
  return [`DISPATCH: ${next.id} | brief: ${brief}`];
}

async function start(argv: string[], cwd: string, script: string): Promise<string[]> {
  const [id, handoffArg, specDirArg, baseUrl, accounts] = argv;
  const work = workOf(id, cwd);
  const root = rootOf(cwd);
  const handoff = slash(resolve(cwd, handoffArg));
  if (read(handoff) === null) throw new Usage(`no handoff file at ${handoffArg}`);
  const specDir = slash(relative(root, resolve(root, specDirArg)));
  if (specDirArg.trim() === "" || /^\.\.(\/|$)|^([A-Za-z]:|\/)/.test(specDir)) throw new Usage(`the test directory ${specDirArg} is not inside the repository`);
  if (!URL.canParse(baseUrl)) throw new Usage(`${baseUrl} is no URL`);
  if (!filled(accounts)) throw new Usage("no accounts given");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const state: State = { root, handoff, specDir, baseUrl, accounts, current: "", spec: "", tries: 0, handled: [], failed: {} };
  save(work, state);
  return (await answers(baseUrl)) ? advance(work, state, script) : [`DOWN: ${work}/launch.log`];
}

async function wait(argv: string[], cwd: string, script: string): Promise<string[]> {
  const work = workOf(argv[0], cwd);
  const seconds = /^\d{1,3}$/.test(argv[1]) ? Number(argv[1]) : 0;
  if (seconds < 1 || seconds > MAX_SECONDS) throw new Usage(`seconds must be 1 to ${MAX_SECONDS}`);
  const state = load(work);
  for (const until = Date.now() + seconds * 1000; ; ) {
    if (await answers(state.baseUrl)) return advance(work, state, script);
    if (Date.now() + POLL_MS > until) break;
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
  const log = (read(`${work}/launch.log`) ?? "").split(/\r?\n/).filter(filled).slice(-10);
  return [`SILENT: ${Math.min(seconds * 2, MAX_SECONDS)}`, ...log.map((line) => `log: ${line}`)];
}

function next(argv: string[], cwd: string, script: string): string[] {
  const [id, qa, word] = argv;
  const work = workOf(id, cwd);
  const state = load(work);
  if (qa !== state.current || state.handled.includes(qa)) throw new Usage(`${qa} is not the scenario in flight`);
  const file = `${state.root}/${state.spec}`;
  const result = `${work}/${qa}.result`;
  const reason = `${work}/${qa}.reason`;
  // A PASS stands only on a green run of the spec as it is now.
  const green = fs.existsSync(file) && read(result)?.trim() === "green" && fs.statSync(result).mtimeMs >= fs.statSync(file).mtimeMs;
  if (word === "PASS" && !green) fs.writeFileSync(reason, "PASS returned without a green run of the spec as it stands\n");
  const why = (read(reason) ?? "").split(/\r?\n/).find(filled)?.trim() ?? "no reason given";
  if (word === "PASS" && green) record(state.handoff, qa, `file ${state.spec}`);
  else if (word === "BLOCKED") {
    fs.rmSync(file, { force: true });
    record(state.handoff, qa, `blocked - ${why}`);
  } else if (state.tries < 1) {
    state.tries += 1;
    save(work, state);
    return [`DISPATCH: ${qa} | brief: ${work}/${qa}.md`];
  } else {
    fs.rmSync(file, { force: true });
    state.failed[qa] = why;
  }
  state.handled.push(qa);
  return advance(work, state, script);
}

function runSpec(briefArg: string, cwd: string): string[] {
  const brief = read(resolve(cwd, briefArg));
  if (brief === null) throw new Usage(`no brief at ${briefArg}`);
  const value = (name: string): string => new RegExp(`^${name}: (.*)$`, "m").exec(brief)?.[1].trim() ?? "";
  const [id, file, work] = [value("id"), value("file"), value("temp")];
  if (!fs.existsSync(file)) return ["RED", `no spec file at ${file}`];
  // npx resolves the project's own Playwright and its config from the nearest directory holding one, else from the nearest package.json.
  const root = rootOf(dirname(file));
  const up: string[] = [];
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    up.push(dir);
    if (dir === root || dir === dirname(dir)) break;
  }
  const holds = (dir: string, name: RegExp): boolean => fs.readdirSync(dir).some((entry) => name.test(entry));
  const base = up.find((dir) => holds(dir, CONFIG)) ?? up.find((dir) => holds(dir, /^package\.json$/)) ?? root;
  const log = `${work}/${id}.log`;
  const out = fs.openSync(log, "w");
  // The line reporter: an html one serves its report on red and never returns. --output keeps test-results/ out of the project tree.
  const done = spawnSync("npx", ["playwright", "test", slash(relative(base, file)), "--reporter=line", `--output=${work}/test-results`], {
    cwd: base,
    stdio: ["ignore", out, out],
    timeout: MAX_SECONDS * 1000,
    shell: process.platform === "win32",
  });
  fs.closeSync(out);
  const lines = (read(log) ?? "").split(/\r?\n/).filter(filled);
  // Exit 0 with no passed test is a spec that skips everything.
  const green = done.status === 0 && lines.some((line) => /\b[1-9]\d* passed\b/.test(line));
  fs.writeFileSync(`${work}/${id}.result`, green ? "green" : "red");
  if (green) return ["GREEN"];
  return ["RED", ...(done.error === undefined ? [] : [`no result: ${done.error.message}`]), ...lines.slice(-TAIL), `log: ${log}`];
}

/** The exit code of one e2e.ts call. script: the absolute path of e2e.sh, as a brief's `run:` line names it. */
export async function run(argv: string[], cwd: string, script: string): Promise<number> {
  const [command, ...rest] = argv;
  try {
    let lines: string[];
    if (command === "find" && rest.length <= 1) lines = find(rest[0] ?? "", cwd);
    else if (command === "start" && rest.length === 5) lines = await start(rest, cwd, script);
    else if (command === "wait" && rest.length === 2) lines = await wait(rest, cwd, script);
    else if (command === "next" && rest.length === 3) lines = next(rest, cwd, script);
    else if (command === "run" && rest.length === 1) lines = runSpec(rest[0], cwd);
    else throw new Usage("usage: find [<arguments>] | start <id> <handoff> <test directory> <base url> <accounts> | wait <id> <seconds> | next <id> <QA> <WORD> | run <brief>");
    console.log(lines.join("\n"));
    return 0;
  } catch (error) {
    // The preload: a failure there would stop the skill from loading.
    if (command === "find") {
      console.log("HANDOFF=none");
      return 0;
    }
    console.error(`error: e2e.sh: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
