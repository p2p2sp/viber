/*
 * simple-stages.ts - the stages of a simple plan: one `## <n>. <goal>` heading
 * each, in plan order, with the paths of the `Files:` line under it.
 */

export interface Stage {
  num: number;
  goal: string;
  files: string[];
}

/** The stages in plan order; none when the plan holds no stage heading. */
export function parseStages(text: string): Stage[] {
  const stages: Stage[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = /^## +(\d+)\. +(\S.*?)\s*$/.exec(line);
    if (heading !== null) {
      stages.push({ num: Number(heading[1]), goal: heading[2], files: [] });
      continue;
    }
    const files = /^Files:\s*(.*?)\s*$/.exec(line);
    const last = stages.at(-1);
    // A `Files:` line belongs to the heading above it; one above the first heading is a settled fact.
    if (files !== null && last !== undefined && last.files.length === 0)
      last.files = files[1]
        .split(",")
        .map((path) => path.trim().replace(/^`|`$/g, "").replaceAll("\\", "/"))
        .filter((path) => path !== "");
  }
  return stages;
}
