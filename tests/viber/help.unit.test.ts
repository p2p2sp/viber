/*
 * help.unit.test.ts - keeps viber/skills/setup/assets/help.html, the help page
 * `/viber:help` and `/viber:setup` open, from falling behind the plugin.
 *
 * Every rule is a pure function over the page text (plus the source texts it
 * is checked against: plugin.json, each skill's SKILL.md frontmatter and the
 * viber.yml template) returning violation strings. Each rule has a self-check
 * proving it fires on a synthetic bad sample, so its green run on the real
 * page is meaningful rather than vacuous.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/help.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrastRatio, parseColor } from "../../viber/skills/pro-designer/scripts/check_contrast.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");
const PAGE_PATH = path.join(VIBER, "skills/setup/assets/help.html");
const TEMPLATE_PATH = path.join(VIBER, "skills/setup/templates/viber.yml");

/** The template ships this key commented out, yet the page still documents it. */
const REQUIRED_EXTRA_KEYS = ["branching-issue-type-mappings"];

type Skill = { name: string; auto: boolean };

// ---------------------------------------------------------------------------
// Sources - pure readers over the text of plugin.json, a SKILL.md, viber.yml
// ---------------------------------------------------------------------------

function lastSegment(entry: string): string {
  return entry.replace(/\/+$/, "").split("/").pop() ?? "";
}

function skillNames(pluginJson: string): string[] {
  return (JSON.parse(pluginJson).skills as string[]).map(lastSegment);
}

function agentNames(pluginJson: string): string[] {
  return (JSON.parse(pluginJson).agents as string[]).map((entry) => lastSegment(entry).replace(/\.md$/, ""));
}

/** True when the SKILL.md frontmatter says `user-invocable: false`. */
function isSelfStarting(skillMd: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  return match !== null && /^user-invocable:[ \t]*false[ \t]*$/m.test(match[1]);
}

/** One `key-<path>` per uncommented template line opening a key at indent 0
 *  (`<key>`) or indent 2 (`<group>-<child>`); deeper lines need no entry. */
function templateKeyPaths(template: string): string[] {
  const paths: string[] = [];
  let group = "";
  for (const line of template.split(/\r?\n/)) {
    const match = /^( *)([A-Za-z][\w-]*)[ \t]*:/.exec(line);
    if (match === null) continue;
    const indent = match[1].length;
    if (indent === 0) {
      group = match[2];
      paths.push(group);
    } else if (indent === 2 && group !== "") {
      paths.push(`${group}-${match[2]}`);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** The text between the end of the opener at `start` (a `<tag` of name `tag`)
 *  and its balanced closing tag; to the end of the text when never closed. */
function balancedInner(text: string, start: number, tag: string): string {
  const openEnd = text.indexOf(">", start) + 1;
  const token = new RegExp(`<(/?)${escapeRegExp(tag)}(?=[\\s>/])[^>]*>`, "gi");
  token.lastIndex = openEnd;
  let depth = 1;
  for (let match = token.exec(text); match !== null; match = token.exec(text)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return text.slice(openEnd, match.index);
  }
  return text.slice(openEnd);
}

/** The inner HTML of the element carrying `id="<id>"`, or null when absent. */
function elementInner(page: string, id: string): string | null {
  const match = new RegExp(`<([A-Za-z][\\w-]*)\\b[^>]*\\sid="${escapeRegExp(id)}"[^>]*>`).exec(page);
  return match === null ? null : balancedInner(page, match.index, match[1]);
}

function hasId(page: string, id: string): boolean {
  return new RegExp(`\\sid="${escapeRegExp(id)}"`).test(page);
}

function bodyOf(page: string): { text: string; offset: number } {
  const start = page.search(/<body[\s>]/);
  const offset = start < 0 ? 0 : start;
  const end = page.indexOf("</body>", offset);
  return { text: page.slice(offset, end < 0 ? page.length : end), offset };
}

// ---------------------------------------------------------------------------
// Rules - pure over the page text (and the source texts)
// ---------------------------------------------------------------------------

function missingSkillCards(page: string, skills: string[]): string[] {
  return skills.filter((name) => !hasId(page, `skill-${name}`)).map((name) => `no card id="skill-${name}"`);
}

/** A well-formed label: `<span class="tag auto">` holding one `lang="en"` and
 *  one `lang="pl"` element. */
function hasAutoLabel(card: string): boolean {
  const match = /<span class="tag auto">/.exec(card);
  if (match === null) return false;
  const label = balancedInner(card, match.index, "span");
  return (label.match(/\slang="en"/g) ?? []).length === 1 && (label.match(/\slang="pl"/g) ?? []).length === 1;
}

function autoLabelViolations(page: string, skills: Skill[]): string[] {
  const violations: string[] = [];
  for (const skill of skills) {
    const card = elementInner(page, `skill-${skill.name}`);
    if (card === null) continue;
    if (skill.auto && !hasAutoLabel(card)) {
      violations.push(`skill-${skill.name}: user-invocable: false, but the card lacks <span class="tag auto"> with one en and one pl element`);
    }
    if (!skill.auto && /class="tag auto"/.test(card)) {
      violations.push(`skill-${skill.name}: the card carries the self-starting label, but the skill is user-invocable`);
    }
  }
  return violations;
}

function missingAgentLines(page: string, agents: string[]): string[] {
  return agents.filter((name) => !hasId(page, `agent-${name}`)).map((name) => `no line id="agent-${name}"`);
}

function missingKeyEntries(page: string, keyPaths: string[]): string[] {
  return keyPaths.filter((key) => !hasId(page, `key-${key}`)).map((key) => `no entry id="key-${key}"`);
}

/** Inside `<body>`, `lang` attributes alternate en, pl, en, pl, each pl on the
 *  same tag name as the en before it. Stops at the first break in the order. */
function languagePairViolations(page: string): string[] {
  const body = bodyOf(page);
  const tags = [...body.text.matchAll(/<([A-Za-z][\w-]*)\b[^>]*?\slang="([^"]*)"/g)].map((m) => ({
    tag: m[1].toLowerCase(),
    lang: m[2],
    line: lineOf(page, body.offset + (m.index ?? 0)),
  }));
  const violations: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const expected = i % 2 === 0 ? "en" : "pl";
    if (tags[i].lang !== expected) {
      violations.push(`line ${tags[i].line}: <${tags[i].tag} lang="${tags[i].lang}"> where lang="${expected}" was due`);
      return violations;
    }
    if (expected === "pl" && tags[i].tag !== tags[i - 1].tag) {
      violations.push(`line ${tags[i].line}: <${tags[i].tag} lang="pl"> pairs with <${tags[i - 1].tag} lang="en">`);
    }
  }
  if (tags.length % 2 === 1) violations.push(`line ${tags[tags.length - 1].line}: the last lang="en" has no lang="pl" pair`);
  return violations;
}

/** The inner HTML of every `<p>` carrying `lang="<lang>"`. */
function langParagraphs(text: string, lang: string): string[] {
  return [...text.matchAll(new RegExp(`<p\\b[^>]*\\slang="${lang}"[^>]*>([\\s\\S]*?)</p>`, "g"))].map((m) => m[1]);
}

const OVERRIDES_PARAGRAPH: [string, RegExp, string][] = [
  ["en", /It overrides/, "five keys"],
  ["pl", /Nadpisuje/, "pięć kluczy"],
];

/** The local-overrides paragraph of each language names five keys, the
 *  question cap among them. */
function localOverridesViolations(page: string): string[] {
  const violations: string[] = [];
  for (const [lang, opener, count] of OVERRIDES_PARAGRAPH) {
    const paragraph = langParagraphs(page, lang).find((p) => opener.test(p) && p.includes("viber.local.yml"));
    if (paragraph === undefined) violations.push(`no lang="${lang}" paragraph on viber.local.yml`);
    else if (!paragraph.includes(count)) violations.push(`the lang="${lang}" overrides paragraph does not say "${count}"`);
    else if (!paragraph.includes("<code>planning.questions-per-round</code>")) {
      violations.push(`the lang="${lang}" overrides paragraph does not name planning.questions-per-round`);
    }
  }
  return violations;
}

const ROUND_CAP: [string, string][] = [
  ["en", "at most"],
  ["pl", "nie więcej niż"],
];

/** The intent card of each language says a round carries at most that many
 *  decisions, linking the key's entry. */
function intentRoundCapViolations(page: string): string[] {
  const card = elementInner(page, "skill-intent") ?? "";
  const violations: string[] = [];
  for (const [lang, phrase] of ROUND_CAP) {
    const paragraph = langParagraphs(card, lang).find((p) => p.includes('href="#key-planning-questions-per-round"'));
    if (paragraph === undefined) violations.push(`the lang="${lang}" intent card never links key-planning-questions-per-round`);
    else if (!paragraph.includes(phrase)) violations.push(`the lang="${lang}" intent card does not say "${phrase}"`);
  }
  return violations;
}

function brokenInternalLinks(page: string): string[] {
  return [...page.matchAll(/href="#([^"]*)"/g)]
    .filter((m) => !hasId(page, m[1]))
    .map((m) => `line ${lineOf(page, m.index ?? 0)}: href="#${m[1]}" has no id="${m[1]}"`);
}

function unknownCommands(page: string, skills: string[]): string[] {
  return [...page.matchAll(/\/viber:([A-Za-z0-9_-]+)/g)]
    .filter((m) => !skills.includes(m[1]))
    .map((m) => `line ${lineOf(page, m.index ?? 0)}: /viber:${m[1]} names no skill in plugin.json`);
}

/** Built from code points so this file itself holds neither character. */
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

function dashViolations(page: string): string[] {
  return [...page.matchAll(new RegExp(`[${EN_DASH}${EM_DASH}]`, "g"))].map(
    (m) => `line ${lineOf(page, m.index ?? 0)}: U+${m[0].charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

const EXTERNAL_LOADS: [string, RegExp][] = [
  ["<script src=", /<script\b[^>]*\ssrc\s*=/gi],
  ['<link rel="stylesheet"', /<link\b[^>]*\srel\s*=\s*["']?stylesheet/gi],
  ["@import", /@import\b/gi],
  ["url(http", /url\(\s*["']?\s*https?:/gi],
];

function externalLoadViolations(page: string): string[] {
  return EXTERNAL_LOADS.flatMap(([label, pattern]) =>
    [...page.matchAll(pattern)].map((m) => `line ${lineOf(page, m.index ?? 0)}: ${label}`),
  );
}

/** Every `<section ... id="guide-<slug>">` carries `class="guide"` and nothing else in it. */
function guideClassViolations(page: string): string[] {
  return [...page.matchAll(/<section\b[^>]*\sid="guide-[^"]*"[^>]*>/g)]
    .filter((m) => !/\sclass="guide"/.test(m[0]))
    .map((m) => `line ${lineOf(page, m.index ?? 0)}: ${m[0]} lacks class="guide" alone`);
}

// ---------------------------------------------------------------------------
// Navigation hooks - C2: the markup the inline script reads
// ---------------------------------------------------------------------------

/** The first opener matching `opener` and its balanced inner HTML, or null. */
function openerInner(text: string, opener: RegExp): { tag: string; inner: string } | null {
  const match = opener.exec(text);
  if (match === null) return null;
  const tag = /^<([A-Za-z][\w-]*)/.exec(match[0])?.[1] ?? "";
  return { tag: match[0], inner: balancedInner(text, match.index, tag) };
}

/** Inner text of every inline `<script>` (no `src`), joined. */
function scriptText(page: string): string {
  return [...page.matchAll(/<script\b(?![^>]*\ssrc)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
}

function styleText(page: string): string {
  return [...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
}

/** The text inside the `{` found at or after `from`, up to its balanced `}`. */
function braceBlock(text: string, from: number): { start: number; end: number } {
  const open = text.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return { start: open + 1, end: i };
  }
  return { start: open + 1, end: text.length };
}

function hasLangPair(fragment: string): boolean {
  return (fragment.match(/\slang="en"/g) ?? []).length === 1 && (fragment.match(/\slang="pl"/g) ?? []).length === 1;
}

function hrefSet(fragment: string): string[] {
  return [...new Set([...fragment.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]))].sort();
}

const FOCUSABLE = /<(?:a\b[^>]*\shref\s*=|button\b|input\b(?![^>]*\stype="hidden")|select\b|textarea\b|summary\b|iframe\b|[A-Za-z][\w-]*\b[^>]*\stabindex="\d)[^>]*>/i;

/** `<main id="main">`, and the first focusable element in `<body>` is `<a class="skip" href="#main">`. */
function skipLinkViolations(page: string): string[] {
  const violations: string[] = [];
  if (!/<main\b[^>]*\sid="main"/.test(page)) violations.push('no <main id="main">');
  const first = FOCUSABLE.exec(bodyOf(page).text);
  if (first === null || !/^<a\b(?=[^>]*\sclass="skip")(?=[^>]*\shref="#main")/.test(first[0])) {
    violations.push(`the first focusable element is ${first?.[0] ?? "missing"}, not <a class="skip" href="#main">`);
  }
  return violations;
}

/** `<div class="search" hidden>` holding `<input type="search" id="help-search">` and a
 *  `<label for="help-search">` with one en and one pl element. */
function searchFieldViolations(page: string): string[] {
  const box = openerInner(page, /<div\b(?=[^>]*\sclass="search")(?=[^>]*\shidden(?=[\s>]))[^>]*>/);
  if (box === null) return ['no <div class="search" hidden>'];
  const violations: string[] = [];
  if (!/<input\b(?=[^>]*\stype="search")(?=[^>]*\sid="help-search")[^>]*>/.test(box.inner)) {
    violations.push('the search container lacks <input type="search" id="help-search">');
  }
  const labelEl = openerInner(box.inner, /<label\b[^>]*\sfor="help-search"[^>]*>/);
  if (labelEl === null || !hasLangPair(labelEl.inner)) {
    violations.push('the search container lacks <label for="help-search"> with one en and one pl element');
  }
  return violations;
}

/** Every `<section` is searchable: it carries `data-search`. */
function searchMarkerViolations(page: string): string[] {
  return [...page.matchAll(/<section\b[^>]*>/g)]
    .filter((m) => !/\sdata-search(?=[\s=>])/.test(m[0]))
    .map((m) => `line ${lineOf(page, m.index ?? 0)}: ${m[0]} lacks data-search`);
}

/** `<p id="help-no-results" hidden>` holding one en and one pl element. */
function noResultsViolations(page: string): string[] {
  const line = openerInner(page, /<p\b(?=[^>]*\sid="help-no-results")(?=[^>]*\shidden(?=[\s>]))[^>]*>/);
  return line !== null && hasLangPair(line.inner) ? [] : ['no <p id="help-no-results" hidden> with one en and one pl element'];
}

/** Every `<pre` in the page and every `<code` inside `id="cheat-sheet"` carries `data-copy`. */
function copyMarkerViolations(page: string): string[] {
  const unmarked = (text: string, tag: string): string[] =>
    [...text.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))].filter((m) => !/\sdata-copy(?=[\s=>])/.test(m[0])).map((m) => m[0]);
  return [...unmarked(page, "pre"), ...unmarked(elementInner(page, "cheat-sheet") ?? "", "code")].map((tag) => `${tag} lacks data-copy`);
}

/** The script reads and writes `viber-usage-lang`, naming it only inside a `try` block. */
function languageStorageViolations(page: string): string[] {
  const script = scriptText(page);
  const guarded = [...script.matchAll(/\btry\s*\{/g)].map((m) => braceBlock(script, m.index ?? 0));
  const violations = [...script.matchAll(/viber-usage-lang/g)]
    .filter((m) => !guarded.some((block) => (m.index ?? 0) >= block.start && (m.index ?? 0) < block.end))
    .map((m) => `script offset ${m.index}: viber-usage-lang named outside a try block`);
  if (!/getItem\(\s*['"]viber-usage-lang['"]/.test(script)) violations.push("the script never reads viber-usage-lang");
  if (!/setItem\(\s*['"]viber-usage-lang['"]/.test(script)) violations.push("the script never writes viber-usage-lang");
  return violations;
}

/** Every `<h2` and `<h3` inside `<main>` has an id and holds `<a class="self" href="#<that id>">`. */
function selfLinkViolations(page: string): string[] {
  const main = openerInner(page, /<main\b[^>]*>/)?.inner ?? "";
  return [...main.matchAll(/<(h2|h3)\b[^>]*>/g)].flatMap((m) => {
    const id = /\sid="([^"]*)"/.exec(m[0])?.[1];
    if (id === undefined) return [`${m[0]} has no id`];
    const self = new RegExp(`<a\\b(?=[^>]*\\sclass="self")(?=[^>]*\\shref="#${escapeRegExp(id)}")`);
    return self.test(balancedInner(main, m.index ?? 0, m[1])) ? [] : [`${m[0]} lacks <a class="self" href="#${id}">`];
  });
}

/** `<details class="toc-narrow">` links to exactly the ids `<nav class="toc">` links to. */
function narrowTocViolations(page: string): string[] {
  const wide = openerInner(page, /<nav\b[^>]*\sclass="toc"[^>]*>/);
  const narrow = openerInner(page, /<details\b[^>]*\sclass="toc-narrow"[^>]*>/);
  if (wide === null || narrow === null) return ['no <nav class="toc"> beside a <details class="toc-narrow">'];
  const [wideSet, narrowSet] = [hrefSet(wide.inner), hrefSet(narrow.inner)];
  return JSON.stringify(wideSet) === JSON.stringify(narrowSet)
    ? []
    : [`the narrow table of contents links to ${narrowSet.join(", ")}, the wide one to ${wideSet.join(", ")}`];
}

/** An `@media print` block hides `.toc`, `.toc-narrow` and `.search` with `display: none`. */
function printViolations(page: string): string[] {
  const style = styleText(page);
  const at = style.search(/@media\s+print\b/);
  if (at < 0) return ["no @media print block"];
  const block = braceBlock(style, at);
  const hidden = [...style.slice(block.start, block.end).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /display\s*:\s*none/.test(m[2]))
    .flatMap((m) => m[1].split(",").map((selector) => selector.trim()));
  return [".toc", ".toc-narrow", ".search"].filter((s) => !hidden.includes(s)).map((s) => `@media print does not hide ${s}`);
}

const SCRIPT_HOOKS = ["help-search", "data-search", "help-no-results", "data-copy", "beforeprint"];

/** The inline script's own text names every hook the markup carries. */
function scriptHookViolations(page: string): string[] {
  const script = scriptText(page);
  return SCRIPT_HOOKS.filter((hook) => !script.includes(hook)).map((hook) => `the script never names ${hook}`);
}

// ---------------------------------------------------------------------------
// Theme colors and closing tags - C4
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";

/** WCAG AA for body text. */
const AA_BODY = 4.5;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The declarations of the theme's `:root` block: the dark one sits inside
 *  `@media (prefers-color-scheme: dark)`, the light one is the first outside it. */
function rootBlock(page: string, theme: Theme): string {
  const style = styleText(page);
  const at = style.search(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  const media = at < 0 ? { start: -1, end: -1 } : braceBlock(style, at);
  const opener = [...style.matchAll(/:root\s*\{/g)].find((m) => {
    const inside = (m.index ?? 0) >= media.start && (m.index ?? 0) < media.end;
    return inside === (theme === "dark");
  });
  if (opener === undefined) return "";
  const block = braceBlock(style, opener.index ?? 0);
  return style.slice(block.start, block.end);
}

/** Every `--fg-*` (text) and `--bg-*` (background) token the theme declares, in order. */
function colorTokens(page: string, theme: Theme): [string, string][] {
  return [...rootBlock(page, theme).matchAll(/(--(?:fg|bg)-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);
}

/** In the theme, every `--fg-*` on every `--bg-*` reaches 4.5:1; a theme with no
 *  `--fg-*` or no `--bg-*` token, or a token that is no hex color, fails. */
function contrastViolations(page: string, theme: Theme): string[] {
  const tokens = colorTokens(page, theme);
  const violations = tokens.filter(([, value]) => !HEX.test(value)).map(([name, value]) => `${theme}: ${name} is ${value}, not a hex color`);
  const fg = tokens.filter(([name, value]) => name.startsWith("--fg-") && HEX.test(value));
  const bg = tokens.filter(([name, value]) => name.startsWith("--bg-") && HEX.test(value));
  if (fg.length === 0) violations.push(`${theme}: no --fg-* token`);
  if (bg.length === 0) violations.push(`${theme}: no --bg-* token`);
  const pairs = fg.flatMap(([fgName, fgValue]) =>
    bg.map(([bgName, bgValue]) => ({ fgName, bgName, ratio: contrastRatio(parseColor(fgValue), parseColor(bgValue)) })),
  );
  return [
    ...violations,
    ...pairs.filter((p) => p.ratio < AA_BODY).map((p) => `${theme}: ${p.fgName} on ${p.bgName} is ${p.ratio.toFixed(2)}:1, under 4.5:1`),
  ];
}

/** Every `--fg-*` and `--bg-*` token is declared in both themes, so neither theme inherits an unchecked value. */
function unpairedTokenViolations(page: string): string[] {
  const [light, dark] = [colorTokens(page, "light"), colorTokens(page, "dark")].map((tokens) => tokens.map(([name]) => name));
  return [
    ...light.filter((name) => !dark.includes(name)).map((name) => `${name} has no dark value`),
    ...dark.filter((name) => !light.includes(name)).map((name) => `${name} has no light value`),
  ];
}

/** Every closing tag in the page has an opener of the same name in the page. */
function orphanClosingTagViolations(page: string): string[] {
  return [...page.matchAll(/<\/([A-Za-z][\w.:-]*)\s*>/g)]
    .filter((m) => !new RegExp(`<${escapeRegExp(m[1])}(?=[\\s/>])`, "i").test(page))
    .map((m) => `line ${lineOf(page, m.index ?? 0)}: </${m[1]}> has no <${m[1]}> opener`);
}

// ---------------------------------------------------------------------------
// Self-checks - synthetic samples, no filesystem
// ---------------------------------------------------------------------------

const html = (body: string): string => `<!doctype html>\n<html lang="en">\n<head></head>\n<body>\n${body}\n</body>\n</html>\n`;
const label = '<span class="tag auto"><span lang="en">starts on its own</span><span lang="pl">startuje sam</span></span>';

test("self-check: templateKeyPaths keeps indent 0 and 2 keys, skips comments and deeper lines", () => {
  const template = "# adr: comment\nadr: true\n\ngroup:\n  child: x\n  deep:\n    leaf: y\n  # hidden: z\nnext: 1\n";

  assert.deepEqual(templateKeyPaths(template), ["adr", "group", "group-child", "group-deep", "next"]);
});

for (const [name, skillMd, expected] of [
  ["user-invocable: false in the frontmatter", "---\nname: a\nuser-invocable: false\n---\nbody\n", true],
  ["user-invocable: true in the frontmatter", "---\nname: b\nuser-invocable: true\n---\nbody\n", false],
  ["user-invocable: false in the body only", "---\nname: c\n---\nuser-invocable: false\n", false],
] as const) {
  test(`self-check: isSelfStarting reads ${name} as ${expected}`, () => {
    assert.equal(isSelfStarting(skillMd), expected);
  });
}

test("self-check: missingSkillCards fires on a sample missing a skill card", () => {
  const page = html('<article id="skill-setup"></article>');

  assert.deepEqual(missingSkillCards(page, ["setup", "commit"]), ['no card id="skill-commit"']);
});

for (const [name, card, skill] of [
  ["a self-starting card lacking its label", '<article id="skill-tdd"><h3>tdd</h3></article>', { name: "tdd", auto: true }],
  ["a self-starting card whose label misses its pl element", '<article id="skill-tdd"><span class="tag auto"><span lang="en">auto</span></span></article>', { name: "tdd", auto: true }],
  ["a user-invocable card carrying the label", `<article id="skill-commit">${label}</article>`, { name: "commit", auto: false }],
] as const) {
  test(`self-check: autoLabelViolations fires on ${name}`, () => {
    assert.equal(autoLabelViolations(html(card), [skill]).length, 1);
  });
}

test("self-check: autoLabelViolations stays quiet on a labelled self-starting card beside an unlabelled one", () => {
  const page = html(`<article id="skill-tdd"><h3>tdd</h3>${label}</article>\n<article id="skill-commit"><h3>commit</h3></article>`);

  assert.deepEqual(autoLabelViolations(page, [{ name: "tdd", auto: true }, { name: "commit", auto: false }]), []);
});

test("self-check: missingAgentLines fires on a sample missing an agent line", () => {
  const page = html('<li id="agent-prover"></li>');

  assert.deepEqual(missingAgentLines(page, ["prover", "closeout"]), ['no line id="agent-closeout"']);
});

test("self-check: missingKeyEntries fires on a sample missing a key entry", () => {
  const page = html('<div id="key-adr"></div>');

  assert.deepEqual(missingKeyEntries(page, ["adr", "tiers-min"]), ['no entry id="key-tiers-min"']);
});

const OVERRIDES_OK =
  '<p lang="en">It overrides five keys, <code>planning.questions-per-round</code> among them, in viber.local.yml.</p>' +
  '<p lang="pl">Nadpisuje pięć kluczy, w tym <code>planning.questions-per-round</code>, w viber.local.yml.</p>';

test("self-check: localOverridesViolations stays quiet on a paragraph in each language naming five keys with the cap", () => {
  assert.deepEqual(localOverridesViolations(html(OVERRIDES_OK)), []);
});

for (const [name, from, to] of [
  ["an English paragraph still saying four keys", "five keys", "four keys"],
  ["a Polish paragraph still saying four keys", "pięć kluczy", "cztery klucze"],
  ["an English paragraph without the cap", "<code>planning.questions-per-round</code> among them", "<code>github.issues</code> among them"],
  ["a Polish paragraph without the cap", "w tym <code>planning.questions-per-round</code>", "w tym <code>github.issues</code>"],
] as const) {
  test(`self-check: localOverridesViolations fires on ${name}`, () => {
    assert.equal(localOverridesViolations(html(OVERRIDES_OK.replace(from, to))).length, 1);
  });
}

const ROUND_OK =
  '<article id="skill-intent"><p lang="en">A round carries <a href="#key-planning-questions-per-round">the cap</a>, at most that many decisions.</p>' +
  '<p lang="pl">Runda niesie <a href="#key-planning-questions-per-round">limit</a>, nie więcej niż tyle decyzji.</p></article>';

test("self-check: intentRoundCapViolations stays quiet on an intent card saying at most in each language", () => {
  assert.deepEqual(intentRoundCapViolations(html(ROUND_OK)), []);
});

for (const [name, from, to] of [
  ["an English card without the cap sentence", ", at most that many decisions", ""],
  ["a Polish card without the cap sentence", ", nie więcej niż tyle decyzji", ""],
  ["an English card that never links the key", 'href="#key-planning-questions-per-round">the cap', 'href="#skill-planner">the cap'],
] as const) {
  test(`self-check: intentRoundCapViolations fires on ${name}`, () => {
    assert.equal(intentRoundCapViolations(html(ROUND_OK.replace(from, to))).length, 1);
  });
}

for (const [name, body] of [
  ["two en in a row", '<span lang="en">a</span><span lang="en">b</span>'],
  ["a pl on another tag than its en", '<p lang="en">a</p><span lang="pl">b</span>'],
  ["an en with no pl after it", '<p lang="en">a</p><p lang="pl">b</p><p lang="en">c</p>'],
  ["a pl first", '<p lang="pl">a</p><p lang="en">b</p>'],
] as const) {
  test(`self-check: languagePairViolations fires on ${name}`, () => {
    assert.equal(languagePairViolations(html(body)).length, 1);
  });
}

test("self-check: languagePairViolations ignores the lang on <html>, outside <body>", () => {
  assert.deepEqual(languagePairViolations(html('<p lang="en">a</p><p lang="pl">b</p>')), []);
});

test("self-check: brokenInternalLinks fires on a link to a missing id", () => {
  const page = html('<a href="#here">ok</a><a href="#gone">bad</a><section id="here"></section>');

  assert.deepEqual(brokenInternalLinks(page), ['line 5: href="#gone" has no id="gone"']);
});

test("self-check: unknownCommands fires on a /viber:<name> no skill carries", () => {
  const page = html("<code>/viber:setup</code> <code>/viber:deploy</code>");

  assert.deepEqual(unknownCommands(page, ["setup"]), ["line 5: /viber:deploy names no skill in plugin.json"]);
});

for (const [name, char] of [
  ["an em dash", EM_DASH],
  ["an en dash", EN_DASH],
] as const) {
  test(`self-check: dashViolations fires on ${name}`, () => {
    assert.equal(dashViolations(html(`<p>a ${char} b</p>`)).length, 1);
  });
}

for (const [name, head] of [
  ["an external script", '<script src="https://cdn.example.com/x.js"></script>'],
  ["an external stylesheet", '<link rel="stylesheet" href="https://cdn.example.com/x.css">'],
  ["an @import", "<style>@import 'x.css';</style>"],
  ["a url( pointing to http", "<style>body { background: url(http://example.com/x.png); }</style>"],
] as const) {
  test(`self-check: externalLoadViolations fires on ${name}`, () => {
    assert.equal(externalLoadViolations(`<html><head>${head}</head><body></body></html>`).length, 1);
  });
}

test("self-check: externalLoadViolations stays quiet on an inline script and style and an outbound link", () => {
  const page = '<html><head><script>var a = 1;</script><style>a { color: red; }</style></head><body><a href="https://github.com/">repo</a></body></html>';

  assert.deepEqual(externalLoadViolations(page), []);
});

for (const [name, body] of [
  ["a guide section with no class", '<section id="guide-fix"></section>'],
  ["a guide section with a second class", '<section class="guide wide" id="guide-fix"></section>'],
] as const) {
  test(`self-check: guideClassViolations fires on ${name}`, () => {
    assert.equal(guideClassViolations(html(body)).length, 1);
  });
}

/** A page carrying every C2 hook; each bad sample below breaks exactly one of them. */
const NAV_LINKS = '<ol><li><a href="#one">One</a></li></ol>';
const HOOKED = `<!doctype html>
<html lang="en">
<head>
<script>
  try { lang = localStorage.getItem('viber-usage-lang'); } catch (e) {}
</script>
<style>
  @media print {
    .toc, .toc-narrow, .search { display: none !important; }
  }
</style>
</head>
<body>
<a class="skip" href="#main"><span lang="en">Skip</span><span lang="pl">Pomiń</span></a>
<nav class="toc">${NAV_LINKS}</nav>
<main id="main">
<div class="search" hidden><label for="help-search"><span lang="en">Search</span><span lang="pl">Szukaj</span></label><input type="search" id="help-search"></div>
<p id="help-no-results" hidden><span lang="en">Nothing</span><span lang="pl">Nic</span></p>
<details class="toc-narrow"><summary>Contents</summary>${NAV_LINKS}</details>
<section id="one" data-search>
<h2 id="one-title">One <a class="self" href="#one-title">#</a></h2>
<h3 id="one-sub">Sub <a class="self" href="#one-sub">#</a></h3>
<pre data-copy>claude plugin install viber@p2p2</pre>
</section>
<section id="cheat-sheet" data-search><a href="#one"><code data-copy>/viber:setup</code></a></section>
</main>
<script>
  // help-search data-search help-no-results data-copy
  window.addEventListener('beforeprint', openAll);
  try { localStorage.setItem('viber-usage-lang', lang); } catch (e) {}
</script>
</body>
</html>
`;

const NAV_RULES: [string, (page: string) => string[]][] = [
  ["skipLinkViolations", skipLinkViolations],
  ["searchFieldViolations", searchFieldViolations],
  ["searchMarkerViolations", searchMarkerViolations],
  ["noResultsViolations", noResultsViolations],
  ["copyMarkerViolations", copyMarkerViolations],
  ["languageStorageViolations", languageStorageViolations],
  ["selfLinkViolations", selfLinkViolations],
  ["narrowTocViolations", narrowTocViolations],
  ["printViolations", printViolations],
  ["scriptHookViolations", scriptHookViolations],
];

for (const [name, rule] of NAV_RULES) {
  test(`self-check: ${name} stays quiet on a page carrying every navigation hook`, () => {
    assert.deepEqual(rule(HOOKED), []);
  });
}

for (const [name, rule, from, to] of [
  ["main without id=\"main\"", skipLinkViolations, '<main id="main">', "<main>"],
  ["a skip link pointing elsewhere", skipLinkViolations, '<a class="skip" href="#main">', '<a class="skip" href="#one">'],
  ["a button before the skip link", skipLinkViolations, '<body>\n<a class="skip"', '<body>\n<button>x</button>\n<a class="skip"'],
  ["a search container shown without the script", searchFieldViolations, '<div class="search" hidden>', '<div class="search">'],
  ["a search field with another id", searchFieldViolations, 'id="help-search">', 'id="find">'],
  ["a search label missing its pl element", searchFieldViolations, '<span lang="pl">Szukaj</span>', ""],
  ["a section without data-search", searchMarkerViolations, '<section id="cheat-sheet" data-search>', '<section id="cheat-sheet">'],
  ["a no-results line missing its pl element", noResultsViolations, '<span lang="pl">Nic</span>', ""],
  ["a no-results line shown without the script", noResultsViolations, '<p id="help-no-results" hidden>', '<p id="help-no-results">'],
  ["a pre without data-copy", copyMarkerViolations, "<pre data-copy>", "<pre>"],
  ["a cheat-sheet command without data-copy", copyMarkerViolations, "<code data-copy>", "<code>"],
  ["the language read outside a try block", languageStorageViolations, "try { lang = localStorage.getItem('viber-usage-lang'); } catch (e) {}", "lang = localStorage.getItem('viber-usage-lang');"],
  ["the language never written", languageStorageViolations, "  try { localStorage.setItem('viber-usage-lang', lang); } catch (e) {}\n", ""],
  ["an h2 without an id", selfLinkViolations, '<h2 id="one-title">', "<h2>"],
  ["an h3 self-link pointing elsewhere", selfLinkViolations, 'href="#one-sub"', 'href="#one"'],
  ["a narrow table of contents with other links", narrowTocViolations, `${NAV_LINKS}</details>`, '<ol><li><a href="#two">Two</a></li></ol></details>'],
  ["no narrow table of contents", narrowTocViolations, '<details class="toc-narrow">', "<details>"],
  ["a print block leaving the narrow table of contents", printViolations, ".toc, .toc-narrow, .search {", ".toc, .search {"],
  ["a print block hiding the search without display: none", printViolations, ".toc, .toc-narrow, .search { display: none !important; }", ".toc, .toc-narrow { display: none !important; }\n    .search { visibility: hidden; }"],
  ["a script not naming data-copy", scriptHookViolations, "help-no-results data-copy", "help-no-results"],
  ["a script not listening for beforeprint", scriptHookViolations, "'beforeprint'", "'afterprint'"],
] as const) {
  test(`self-check: ${rule.name} fires on ${name}`, () => {
    const page = HOOKED.replace(from, to);

    assert.equal(rule(page).length, 1);
  });
}

/** A page carrying only the two theme blocks; `--rule` is neither text nor background. */
const themed = (light: string, dark: string): string =>
  `<!doctype html>\n<html lang="en">\n<head>\n<style>\n  :root {\n    ${light}\n  }\n  :root[data-lang="en"] body [lang="pl"] { display: none; }\n  @media (prefers-color-scheme: dark) {\n    :root {\n      ${dark}\n    }\n  }\n</style>\n</head>\n<body></body>\n</html>\n`;
const LIGHT_OK = "--bg-page: #ffffff; --bg-code: #eeeeee; --fg-text: #111111; --fg-muted: #555555; --rule: #dddddd;";
const DARK_OK = "--bg-page: #111111; --bg-code: #222222; --fg-text: #eeeeee; --fg-muted: #aaaaaa; --rule: #333333;";
const DARK_NO_FG = "--bg-page: #111111; --bg-code: #222222; --rule: #333333;";

for (const theme of ["light", "dark"] as const) {
  test(`self-check: contrastViolations stays quiet on a ${theme} theme whose text colors all reach 4.5:1, a faint rule token aside`, () => {
    assert.deepEqual(contrastViolations(themed(LIGHT_OK, DARK_OK), theme), []);
  });
}

for (const [name, page, theme] of [
  ["a light text color at 3.92:1 on one light background", themed(LIGHT_OK.replace("#555555", "#767676"), DARK_OK), "light"],
  ["a dark text color at 4.03:1 on one dark background", themed(LIGHT_OK, DARK_OK.replace("#aaaaaa", "#808080")), "dark"],
  ["a dark theme with no --fg-* token", themed(LIGHT_OK, DARK_NO_FG), "dark"],
  ["a light theme with no --bg-* token", themed("--fg-text: #111111; --rule: #dddddd;", DARK_OK), "light"],
  ["a background that is no hex color", themed(LIGHT_OK.replace("--bg-code: #eeeeee", "--bg-code: var(--bg-page)"), DARK_OK), "light"],
] as const) {
  test(`self-check: contrastViolations fires on ${name}`, () => {
    assert.equal(contrastViolations(page, theme).length, 1);
  });
}

test("self-check: unpairedTokenViolations fires on a text color the dark theme never declares", () => {
  const page = themed(LIGHT_OK, DARK_OK.replace("--fg-muted: #aaaaaa;", ""));

  assert.deepEqual(unpairedTokenViolations(page), ["--fg-muted has no dark value"]);
});

test("self-check: unpairedTokenViolations stays quiet when both themes declare the same tokens", () => {
  assert.deepEqual(unpairedTokenViolations(themed(LIGHT_OK, DARK_OK)), []);
});

for (const [name, page] of [
  ["a sample ending in a bare </content>", `${html("<p>a</p>")}</content>\n`],
  ["an inline </parameter> with no opener", html("<p>a</parameter></p>")],
] as const) {
  test(`self-check: orphanClosingTagViolations fires on ${name}`, () => {
    assert.equal(orphanClosingTagViolations(page).length, 1);
  });
}

test("self-check: orphanClosingTagViolations stays quiet on balanced tags, an attribute-bearing opener included", () => {
  assert.deepEqual(orphanClosingTagViolations(html('<p lang="en">a</p><section id="x" data-search></section>')), []);
});

// ---------------------------------------------------------------------------
// The real page against the real sources
// ---------------------------------------------------------------------------

const PAGE = fs.readFileSync(PAGE_PATH, "utf-8");
const PLUGIN_JSON = fs.readFileSync(path.join(VIBER, ".claude-plugin/plugin.json"), "utf-8");
const SKILLS: Skill[] = skillNames(PLUGIN_JSON).map((name) => ({
  name,
  auto: isSelfStarting(fs.readFileSync(path.join(VIBER, "skills", name, "SKILL.md"), "utf-8")),
}));
const KEY_PATHS = [...templateKeyPaths(fs.readFileSync(TEMPLATE_PATH, "utf-8")), ...REQUIRED_EXTRA_KEYS];

for (const [name, violations] of [
  ["has a card for every skill plugin.json lists", () => missingSkillCards(PAGE, SKILLS.map((s) => s.name))],
  ["labels exactly the user-invocable: false cards as self-starting", () => autoLabelViolations(PAGE, SKILLS)],
  ["has a line for every agent plugin.json lists", () => missingAgentLines(PAGE, agentNames(PLUGIN_JSON))],
  ["has an entry for every viber.yml key", () => missingKeyEntries(PAGE, KEY_PATHS)],
  ["names five local overrides, the question cap among them, in both languages", () => localOverridesViolations(PAGE)],
  ["says in both languages that an intent round carries at most the capped decisions", () => intentRoundCapViolations(PAGE)],
  ["pairs every English piece with a Polish one", () => languagePairViolations(PAGE)],
  ["links only to ids it holds", () => brokenInternalLinks(PAGE)],
  ["names only /viber: commands a skill carries", () => unknownCommands(PAGE, SKILLS.map((s) => s.name))],
  ["holds no em dash and no en dash", () => dashViolations(PAGE)],
  ["loads no external script, stylesheet or resource", () => externalLoadViolations(PAGE)],
  ["gives every task guide class=\"guide\" alone", () => guideClassViolations(PAGE)],
  ["opens on a skip link to <main id=\"main\">", () => skipLinkViolations(PAGE)],
  ["hides the labelled search field until the script reveals it", () => searchFieldViolations(PAGE)],
  ["marks every section searchable", () => searchMarkerViolations(PAGE)],
  ["carries a hidden no-results line in both languages", () => noResultsViolations(PAGE)],
  ["marks every pre block and cheat-sheet command for copying", () => copyMarkerViolations(PAGE)],
  ["reads and writes the language choice only inside try", () => languageStorageViolations(PAGE)],
  ["gives every h2 and h3 a self-link to its own id", () => selfLinkViolations(PAGE)],
  ["folds a narrow table of contents holding the wide one's links", () => narrowTocViolations(PAGE)],
  ["hides the navigation in print", () => printViolations(PAGE)],
  ["has a script naming every navigation hook", () => scriptHookViolations(PAGE)],
  ["gives every text color 4.5:1 on every background in the light theme", () => contrastViolations(PAGE, "light")],
  ["gives every text color 4.5:1 on every background in the dark theme", () => contrastViolations(PAGE, "dark")],
  ["declares every text and background color in both themes", () => unpairedTokenViolations(PAGE)],
  ["holds no closing tag without its opener", () => orphanClosingTagViolations(PAGE)],
] as const) {
  test(`the help page ${name}`, () => {
    assert.deepEqual(violations(), []);
  });
}
