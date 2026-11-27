/*
 * build-config.ts - reads the settings a build takes from
 * .claude/viber.yml: `build.rules`, whether its close runs the rules
 * writer, `build.qa`, whether it runs the QA writer, `build.extensions`, the
 * host agents it runs at its close, and `directories`, where a run lives
 * under docs/ and where its archive lands.
 */

/** The path of the config file in the project at `root`. */
export const configPath = (root: string): string => `${root}/.claude/viber.yml`;

interface Line {
  /** The line, counted from 0. */
  at: number;
  indent: number;
  /** The text up to the colon, trimmed: empty with no colon. */
  key: string;
  /** The text after the colon, trimmed and without the surrounding `"` or `'`: empty with no colon. */
  value: string;
}

/** The lines holding a setting: a trailing comment cut, empty and comment lines skipped. */
function* linesOf(yaml: string | null): Generator<Line> {
  const raws = (yaml ?? "").split(/\r?\n/);
  for (let at = 0; at < raws.length; at++) {
    const line = raws[at].replace(/\s+#.*$/, "");
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const colon = line.indexOf(":");
    const key = colon < 0 ? "" : line.slice(indent, colon).trim();
    const value = colon < 0 ? "" : line.slice(colon + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    yield { at, indent, key, value };
  }
}

/** The value of the key `name`, a direct child of `build:`, lowercased: null with no file, no `build:` or no key. */
function buildValue(yaml: string | null, name: string): string | null {
  let inBuild = false;
  // The indent of the direct children of `build:`, set by the first one read.
  let childIndent = -1;
  let value: string | null = null;
  for (const { indent, key, value: text } of linesOf(yaml)) {
    if (indent === 0) {
      inBuild = key === "build";
      childIndent = -1;
    } else if (inBuild) {
      if (childIndent < 0) childIndent = indent;
      if (indent === childIndent && key === name) value = text.toLowerCase();
    }
  }
  return value;
}

/** `build.rules`: off only when the key reads `false`. No file, no `build:`, no key or any other value: on. */
export const rulesOn = (yaml: string | null): boolean => buildValue(yaml, "rules") !== "false";

/** `build.qa`: on only when the key reads `true`. No file, no `build:`, no key or any other value: off. */
export const qaOn = (yaml: string | null): boolean => buildValue(yaml, "qa") === "true";

export interface Extensions {
  /** The steps in run order: the names of one step run together. */
  steps: string[][];
  /** The entries whose name is no agent name. */
  bad: string[];
}

/** The name an extension entry and its agent file carry. */
export const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;

export interface ExtensionMap {
  /** The entries in file order. */
  entries: Array<{ name: string; parallel: boolean }>;
  /** The line of the `extensions:` key, counted from 0: -1 with none. */
  key: number;
  /** The last line of the map, the key's own while it holds no entry. */
  last: number;
  /** The indent of an entry. */
  indent: number;
}

/**
 * The `extensions:` map under `build:`, the one reader of it: an entry is a
 * key under `extensions:`, `parallel: true` its only option. A key carrying a
 * value on its own line other than `""` or `''` holds no map.
 */
export function extensionMap(yaml: string | null): ExtensionMap {
  const map: ExtensionMap = { entries: [], key: -1, last: -1, indent: -1 };
  let inBuild = false;
  // The indent of `extensions:` while inside it, of its entries once the first is read.
  let listIndent = -1;
  let entryIndent = -1;
  for (const { at, indent, key, value } of linesOf(yaml)) {
    if (indent === 0) {
      inBuild = key === "build";
      listIndent = -1;
    } else if (!inBuild) continue;
    else if (listIndent >= 0 && indent > listIndent) {
      if (entryIndent < 0) entryIndent = indent;
      if (indent === entryIndent && key !== "") map.entries.push({ name: key, parallel: false });
      else if (indent > entryIndent && key === "parallel" && map.entries.length > 0) map.entries[map.entries.length - 1].parallel = value.toLowerCase() === "true";
      map.last = at;
      map.indent = entryIndent;
    } else {
      listIndent = key === "extensions" && value === "" ? indent : -1;
      entryIndent = -1;
      if (listIndent >= 0) Object.assign(map, { key: at, last: at, indent: indent + 2 });
    }
  }
  return map;
}

/**
 * An entry carrying `parallel: true` joins the step of the parallel entry
 * right before it, every other entry is a step of its own. No file, no
 * `build:` or no entry: no step.
 */
export function extensionSteps(yaml: string | null): Extensions {
  const steps: string[][] = [];
  const bad: string[] = [];
  let joins = false;
  for (const entry of extensionMap(yaml).entries) {
    if (!AGENT_NAME.test(entry.name)) bad.push(entry.name);
    else if (entry.parallel && joins) steps[steps.length - 1].push(entry.name);
    else steps.push([entry.name]);
    if (AGENT_NAME.test(entry.name)) joins = entry.parallel;
  }
  return { steps, bad };
}

export interface Directories {
  /** The directory under docs/ holding the open runs. */
  runs: string;
  /** The directory under docs/ a finished run is archived to. */
  specifications: string;
}

/**
 * The two names of the `directories:` group, read from inside it only. A value
 * that is empty, `.`, `..` or holds a slash is no directory name: the default
 * stands. spec-paths.sh of the spec skill reads `runs` by the same rules.
 */
export function directoriesOf(yaml: string | null): Directories {
  const dirs: Directories = { runs: "_specs", specifications: "specs" };
  let inside = false;
  for (const { indent, key, value } of linesOf(yaml)) {
    if (indent === 0) inside = key === "directories";
    else if (inside && (key === "runs" || key === "specifications")) {
      if (value !== "" && value !== "." && value !== ".." && !/[\\/]/.test(value)) dirs[key] = value;
    }
  }
  return dirs;
}
