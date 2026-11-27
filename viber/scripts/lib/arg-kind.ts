/*
 * arg-kind.ts - the arg-kind core: classifies the first word of a skill's
 * argument as a GitHub issue reference or a pull request reference. It touches
 * no port; the contract lives in the header of ../arg-kind.ts.
 */

export interface ArgKindResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const USAGE = "usage: arg-kind.sh issue <first word> [--more] | arg-kind.sh pr <first word>";

function fail(reason: string): ArgKindResult {
  return { stdout: "", stderr: `error: arg-kind.sh: ${reason}\n`, exit: 2 };
}

/**
 * <N>, #<N>, or https://<host>/<owner>/<repo>/<seg>/<N> with an optional #...
 * or ?... suffix, a URL behind one leading # included: the shapes
 * issue-facts.sh (seg `issues`) and pr-threads.sh (seg `pull`) accept.
 */
function isRef(word: string, seg: string): boolean {
  let ref = word.startsWith("#") ? word.slice(1) : word;
  if (/^[0-9]+$/.test(ref)) return true;
  const mark = `/${seg}/`;
  if (!ref.startsWith("https://") || ref.indexOf(mark, 8) < 0) return false;
  const suffix = ref.search(/[#?]/);
  if (suffix >= 0) ref = ref.slice(0, suffix);
  const last = ref.lastIndexOf(mark);
  const n = last < 0 ? ref : ref.slice(last + mark.length);
  if (!/^[0-9]+$/.test(n)) return false;
  let mid = ref.slice(8);
  const end = mid.lastIndexOf(mark);
  if (end >= 0) mid = mid.slice(0, end);
  const parts = mid.split("/");
  return parts.length === 3 && parts.every((part) => part !== "");
}

/** The stdout, stderr and exit code of one arg-kind call. Never throws. */
export function runArgKind(argv: string[]): ArgKindResult {
  if (argv.length < 2) return fail(USAGE);
  const [kind, word] = argv;
  let more = false;
  if (kind === "issue") {
    if (argv.length === 3) {
      if (argv[2] !== "--more") return fail(`unknown argument: ${argv[2]}`);
      more = true;
    } else if (argv.length > 3) {
      return fail("too many arguments");
    }
  } else if (kind === "pr") {
    if (argv.length !== 2) return fail("too many arguments");
  } else {
    return fail(`unknown kind: ${kind}`);
  }
  const valid = isRef(word, kind === "issue" ? "issues" : "pull");
  let line: string;
  if (kind === "issue") {
    line = valid && !more ? `NEXT: issue | ref: ${word}` : "NEXT: text";
  } else {
    line = valid ? `NEXT: pr | ref: ${word}` : "STOP: usage";
  }
  return { stdout: `${line}\n`, stderr: "", exit: 0 };
}
