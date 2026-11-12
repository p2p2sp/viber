/**
 * The first line starting with "## " + heading, up to (excluding) the next line starting
 * with "## ", or the end of the text. Throws when no line starts so.
 */
export function section(text: string, heading: string): string {
  const all = text.split("\n");
  const start = all.findIndex((line) => line.startsWith(`## ${heading}`));
  if (start === -1) throw new Error(`no "## ${heading}" heading`);
  const next = all.findIndex((line, index) => index > start && line.startsWith("## "));
  if (next === -1) return all.slice(start).join("\n");
  return `${all.slice(start, next).join("\n")}\n`;
}
