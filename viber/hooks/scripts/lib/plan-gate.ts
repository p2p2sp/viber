/*
 * plan-gate.ts - the plan gate core: reads a session transcript and says
 * whether the planner's plan may leave plan mode. The contract lives in the
 * header of ../plan-gate.ts.
 */

export interface Use {
  kind: "use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface Result {
  kind: "result";
  id: string;
  text: string;
  error: boolean;
}
interface Text {
  kind: "text";
  text: string;
}
type Event = Use | Result | Text;

// The verdict opens a line, or the <result> element of a background agent's notification, and ends its line.
const VERDICT_RE = /(?:^|\n|<result>)[ \t]*[*_`]*VERDICT:[*_`]*[ \t]+[*_`]*(PASS|FAIL)[*_`]*[ \t]*(?:\r?\n|$|<)/g;
const PLANNER_RE = /^(viber:)?planner$/;
const SIMPLE_PLAN_RE = /^(viber:)?simple-plan$/;
const REVIEWER_RE = /^(viber:)?plan-reviewer$/;
// Any call of the planner's own script.
const PLAN_SH_RE = /planner\/scripts\/plan\.sh\b/;
// `plan.sh land`, the script and the subcommand each quoted or not.
const LAND_RE = /plan\.sh["']?\s+["']?land\b/;

function flat(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("\n");
}

/** The events of the main session, in order. Subagent records and replayed requests carry none. */
function eventsOf(lines: string[]): Event[] {
  const events: Event[] = [];
  for (const line of lines) {
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || record.isSidechain === true) continue;
    if (record.type === "queue-operation" && typeof record.content === "string") {
      events.push({ kind: "text", text: record.content });
      continue;
    }
    if (record.type !== "assistant" && record.type !== "user") continue;
    const content = record.message?.content;
    if (typeof content === "string") {
      events.push({ kind: "text", text: content });
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") events.push({ kind: "use", id: String(block.id ?? ""), name: String(block.name ?? ""), input: block.input ?? {} });
      else if (block?.type === "tool_result") events.push({ kind: "result", id: String(block.tool_use_id ?? ""), text: flat(block.content), error: block.is_error === true });
      else if (block?.type === "text" && record.type === "user") events.push({ kind: "text", text: String(block.text ?? "") });
    }
  }
  return events;
}

function resultOf(events: Event[], id: string, from: number): Result | null {
  for (let i = from; i < events.length; i++) {
    const event = events[i];
    if (event.kind === "result" && event.id === id) return event;
  }
  return null;
}

/** The reason to refuse ExitPlanMode, each opening with "Next step:"; null lets the call through. */
export function gateReason(lines: string[]): string | null {
  const all = eventsOf(lines);

  // The episode: everything after the last ExitPlanMode that was not refused, so an approved plan never arms the gate again.
  let start = 0;
  all.forEach((event, index) => {
    if (event.kind !== "use" || event.name !== "ExitPlanMode") return;
    const result = resultOf(all, event.id, index + 1);
    if (result && !result.error) start = all.indexOf(result) + 1;
  });
  const events = all.slice(start);

  // Armed by the planner in the episode: the skill loaded, or its own script ran. A later simple-plan call that was not refused disarms it.
  const armed = events.findLastIndex(
    (event) =>
      (event.kind === "use" && event.name === "Skill" && PLANNER_RE.test(String(event.input.skill ?? ""))) ||
      (event.kind === "text" && /<command-name>\/?(viber:)?planner<\/command-name>/.test(event.text)) ||
      (event.kind === "use" && event.name === "Bash" && PLAN_SH_RE.test(String(event.input.command ?? ""))),
  );
  const simple = events.findLastIndex(
    (event, index) =>
      (event.kind === "use" && event.name === "Skill" && SIMPLE_PLAN_RE.test(String(event.input.skill ?? "")) && resultOf(events, event.id, index + 1)?.error !== true) ||
      (event.kind === "text" && /<command-name>\/?(viber:)?simple-plan<\/command-name>/.test(event.text)),
  );
  if (armed < 0 || simple > armed) return null;

  const suffix = " (This is the planner's review gate, not an error.)";

  // The last landing that wrote the plan.
  let landed = -1;
  let plan = "";
  events.forEach((event, index) => {
    if (event.kind !== "use" || event.name !== "Bash" || !LAND_RE.test(String(event.input.command ?? ""))) return;
    const result = resultOf(events, event.id, index + 1);
    const line = result && !result.error ? /(?:^|\n)LANDED: (.+)/.exec(result.text) : null;
    if (!line) return;
    landed = index;
    plan = line[1].trim();
  });
  if (landed < 0) {
    return `Next step: land the plan. No plan.sh land call wrote this plan: run the planner skill's steps up to it, then dispatch viber:plan-reviewer and retry ExitPlanMode.${suffix}`;
  }

  // The last review dispatched after that landing: an earlier one judged another text.
  let review = -1;
  events.forEach((event, index) => {
    if (index > landed && event.kind === "use" && (event.name === "Agent" || event.name === "Task") && REVIEWER_RE.test(String(event.input.subagent_type ?? ""))) review = index;
  });
  if (review < 0) {
    return `Next step: review the plan. The plan landed but viber:plan-reviewer has not judged this text: dispatch it with the plan, spec and report paths, then retry ExitPlanMode.${suffix}`;
  }

  // Its verdict: in the tool result of the dispatch, or in the notification of a background agent, which names the dispatch id.
  const id = (events[review] as Use).id;
  let verdict = "";
  for (const event of events.slice(review + 1)) {
    const own = (event.kind === "result" && event.id === id) || (event.kind === "text" && id !== "" && event.text.includes(id));
    if (!own) continue;
    for (const match of event.text.matchAll(VERDICT_RE)) verdict = match[1];
  }
  if (verdict === "") {
    return `Next step: wait for the review. viber:plan-reviewer has returned no VERDICT line yet: take its return, or dispatch it again, then retry ExitPlanMode.${suffix}`;
  }
  if (verdict === "FAIL") {
    return `Next step: answer the failed review. Dispatch viber:plan-writer with the review path, land its draft with plan.sh land, dispatch viber:plan-reviewer again and retry ExitPlanMode only on VERDICT: PASS.${suffix}`;
  }

  const edited = events.slice(review + 1).some((event) => event.kind === "use" && (event.name === "Write" || event.name === "Edit") && String(event.input.file_path ?? "") === plan);
  if (edited) {
    return `Next step: review the changed plan. The plan file was edited after its PASS: change it through viber:plan-writer and plan.sh land, then dispatch viber:plan-reviewer again.${suffix}`;
  }
  return null;
}
