/*
 * extensions.ts - resolves the build.extensions map of viber.yml into the
 * steps of build.extensions and the names of build.extensions-missing.
 */

import { mapClassifier } from "./lines.ts";

interface Entry { name: string; parallel: boolean }

function readEntries(text: string): Entry[] {
  const role = mapClassifier();
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let noEntry = false;
  let entryIndent = 0;
  let current: Entry | null = null;
  let parallelSet = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const r = role(line);
    if (r === "key") {
      noEntry = !/^(#|$)/.test(line.slice(line.indexOf(":") + 1).trimStart());
      continue;
    }
    if (r !== "map" || noEntry || /^\s*(#|$)/.test(line)) continue;
    const indent = /^\s*/.exec(line)![0].length;
    const rest = line.slice(indent);
    const colon = rest.indexOf(":");
    if (colon === -1) continue;
    const key = rest.slice(0, colon).trimEnd();
    if (key === "") continue;
    if (entryIndent === 0) entryIndent = indent;
    if (indent === entryIndent) {
      current = null;
      if (seen.has(key)) continue;
      seen.add(key);
      current = { name: key, parallel: false };
      parallelSet = false;
      entries.push(current);
      continue;
    }
    if (indent < entryIndent || current === null || key !== "parallel" || parallelSet) continue;
    parallelSet = true;
    current.parallel = rest.slice(colon + 1).trimStart().replace(/[\s#].*$/s, "").toLowerCase() === "true";
  }
  return entries;
}

/** steps and missing: the comma-joined values of the two lines, "none" when empty; hasAgent tells whether a valid name has its agent file. */
export function resolveExtensions(text: string | null, hasAgent: (name: string) => boolean): { steps: string; missing: string } {
  const steps: string[] = [];
  const missing: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 0) steps.push(run.join(" + "));
    run = [];
  };
  for (const { name, parallel } of readEntries(text ?? "")) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !hasAgent(name)) {
      missing.push(name);
    } else if (parallel) {
      run.push(name);
    } else {
      flush();
      steps.push(name);
    }
  }
  flush();
  return { steps: steps.join(", ") || "none", missing: missing.join(", ") || "none" };
}
