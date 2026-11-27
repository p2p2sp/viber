/*
 * build-adr.ts - the decision records of a run: moves the files the planner's
 * adr agent staged, named by the `ADR:` lines of the landed plan, to docs/adr/
 * and commits them before the first task starts.
 */

import { commitRun, rel, under, type Ctx } from "./build-state.ts";

// Where a project keeps its architecture decision records: the adr agent reads the existing ones there.
const ADR_DIR = "docs/adr";
// The lines of a refused commit's output kept in the outcome: the cause stands at its top.
const REFUSAL_LINES = 20;

/**
 * Moves each staged record to docs/adr/ under its own name, a record of that
 * name replaced: the agent staged it as the new text of that record. A start
 * that resumes the run finds the files moved already and moves nothing; it
 * commits the records an earlier start left uncommitted.
 */
export function landRecords(ctx: Ctx, landed: string): void {
  const targets: string[] = [];
  for (const line of landed.matchAll(/^ADR:[ \t]*(\S.*?)\s*$/gm)) {
    const staged = line[1].replaceAll("\\", "/");
    const source = staged.startsWith("/") || /^[A-Za-z]:/.test(staged) ? staged : `${ctx.root}/${staged}`;
    const target = `${ADR_DIR}/${source.slice(source.lastIndexOf("/") + 1)}`;
    if (ctx.fs.exists(source) && !ctx.fs.move(source, `${ctx.root}/${target}`)) ctx.state.close.notes.push(`- decision record | cannot move ${rel(ctx, source)} to ${target}`);
    else if (ctx.fs.exists(`${ctx.root}/${target}`)) targets.push(target);
    else ctx.state.close.notes.push(`- decision record | ${rel(ctx, source)} is gone, ${target} was not written`);
  }
  if (targets.length === 0 || ctx.git.dirty(ctx.root, targets).length === 0) return;
  const done = commitRun(ctx, "docs(viber): decision records", targets, () => false);
  if (done.kind === "refused") ctx.state.close.notes.push("- decision records | git refused the commit, the records are left in the tree", ...under(done.output).slice(0, REFUSAL_LINES));
}
