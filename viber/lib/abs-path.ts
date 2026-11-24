/*
 * abs-path.ts - spells a path one way, as text, before a core asks a port for
 * it (attach-lines, qa-ledger): the ports and their fakes match a path as the
 * text it is.
 */

/**
 * The forward-slash path made absolute against cwd and spelled one way: no
 * doubled or trailing slash, no `.` segment, a `..` segment taking the segment
 * before it. The root is `/`, a drive as `C:/`, or the `//` of a network path.
 */
export function absolutePath(path: string, cwd: string): string {
  // The cwd joins without its own trailing slash: `/` plus a name must not read as a network path.
  const full = /^(\/|[A-Za-z]:\/)/.test(path) ? path : `${cwd.replace(/\/$/, "")}/${path}`;
  const drive = /^[A-Za-z]:/.test(full) ? full.slice(0, 2) : "";
  const rest = full.slice(drive.length);
  const root = drive !== "" ? `${drive}/` : /^\/\/[^/]/.test(rest) ? "//" : "/";
  const segments: string[] = [];
  for (const part of rest.split("/")) {
    if (part === "..") segments.pop();
    else if (part !== "" && part !== ".") segments.push(part);
  }
  return root + segments.join("/");
}
