/**
 * Pure, string-in parsing for the Posts tab's Hugo support: a site's own
 * config (just the one key the scanner needs, `contentDir`), a post's
 * frontmatter (`title`/`draft`/`date`), and a minimal archetype-template
 * renderer for "new post."
 *
 * No `fs` here — so `hugoParser.test.ts` can exercise everything directly.
 * The file-reading wrapper lives in `HugoScanner.ts`, matching how
 * `PlanParser.ts`'s pure `parsePlan` pairs with `ProjectMetadata.extractPlanSummary`.
 *
 * There is no YAML/TOML parser dependency in this plugin (see
 * `ProjectMetadata.ts`'s own module comment on reimplementing rather than
 * shelling out) — these are hand-rolled regex extractors, not general
 * parsers. `parsePostFrontmatter` mirrors `ProjectSyncManager.ts`'s
 * `parseFrontmatter` delimiter/line-split approach, typed for this use
 * instead of that one's untyped `Map`.
 */

export interface ParsedHugoConfig {
  contentDir: string;
}

export interface ParsedPostFrontmatter {
  title?: string;
  draft: boolean;
  date?: string;
}

const DEFAULT_CONTENT_DIR = "content";

function unquoteScalar(value: string): string {
  const match = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
  return match ? match[1] : value;
}

/**
 * Extracts `contentDir` from a Hugo site config file's raw text — TOML
 * (`contentDir = "..."`) or YAML (`contentDir: ...`), whichever the file
 * turns out to be; tries both patterns rather than requiring the caller to
 * know the dialect up front. Defaults to Hugo's own default, `"content"`,
 * when the key isn't set (the common case — most sites never override it).
 */
export function parseHugoConfig(content: string): ParsedHugoConfig {
  const tomlMatch = content.match(/^\s*contentDir\s*=\s*["']([^"']+)["']/m);
  if (tomlMatch) return { contentDir: tomlMatch[1] };

  const yamlMatch = content.match(/^\s*contentDir\s*:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  if (yamlMatch) return { contentDir: yamlMatch[1].trim() };

  return { contentDir: DEFAULT_CONTENT_DIR };
}

/**
 * Parses a post's frontmatter block — YAML (`---`/`---`) or TOML
 * (`+++`/`+++`), Hugo supports either. `draft` defaults to `false` when the
 * key is absent (Hugo's own default: no `draft` key means published).
 */
export function parsePostFrontmatter(content: string): ParsedPostFrontmatter {
  const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const tomlMatch = !yamlMatch ? content.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?/) : null;
  const block = yamlMatch?.[1] ?? tomlMatch?.[1];
  if (block === undefined) return { draft: false };

  const separator = tomlMatch ? "=" : ":";
  const entries = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(separator);
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    entries.set(key, unquoteScalar(line.slice(idx + 1).trim()));
  }

  return {
    title: entries.get("title") || undefined,
    draft: entries.get("draft")?.toLowerCase() === "true",
    date: entries.get("date") || entries.get("lastmod") || undefined,
  };
}

/** Filesystem-safe slug for a new post's filename, derived from its title. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

export const DEFAULT_ARCHETYPE = `---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true
---
`;

/**
 * Renders a Hugo archetype template for "new post." Archetypes are Go
 * templates; fully evaluating them is out of scope here. This substitutes
 * the handful of tokens that appear in virtually every Hugo starter's
 * `archetypes/default.md` — `{{ .Date }}`, `{{ .Name }}`,
 * `{{ .TranslationBaseName }}`, and the ubiquitous
 * `{{ replace .Name "-" " " | title }}` idiom (substituted with the real
 * title text, which is more accurate than reconstructing title-case from
 * the slug) — and leaves anything else in the template untouched.
 */
export function renderArchetype(
  template: string,
  vars: { name: string; date: string; title: string }
): string {
  return template
    .replace(/\{\{\s*replace\s+\.Name\s+"-"\s+"\s*"\s*\|\s*title\s*\}\}/g, vars.title)
    .replace(/\{\{\s*\.Date\s*\}\}/g, vars.date)
    .replace(/\{\{\s*\.TranslationBaseName\s*\}\}/g, vars.name)
    .replace(/\{\{\s*\.Name\s*\}\}/g, vars.name);
}
