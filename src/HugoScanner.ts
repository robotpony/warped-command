import { existsSync, statSync } from "fs";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { basename, extname, join, relative } from "path";
import { HugoPost, HugoSite } from "./types";
import { DEFAULT_ARCHETYPE, parseHugoConfig, parsePostFrontmatter, renderArchetype, slugify } from "./HugoParser";

/**
 * Scope: vault-only, deliberately not the Projects extension.
 *
 * This module used to find "the" Hugo site by filtering the Projects
 * extension's repo scan for a `"Hugo"` stack tag (`ProjectScanner.scan()`'s
 * result) — Projects' own base-folder scan is deliberately broad, reaching
 * every repo under a configured folder, by design (that's the point of it:
 * tracking work across many repos on disk). Posts borrowed that scan
 * instead of doing its own, narrower detection, and that borrowing was the
 * bug: a *different* repo entirely, one that also had a Hugo config file
 * (e.g. this plugin's own repo, once seeded with a test fixture), could sort
 * earlier in that scan and silently shadow the real site the vault was
 * pointed at — Projects' broad scope leaking into a feature that has no
 * business scanning anywhere but the current vault.
 *
 * So: `readHugoSite` here is now always called with the *vault's own base
 * path* (see `SidebarView.vaultBasePath()`), never a Projects scan result.
 * Posts assumes the Hugo site, if there is one, *is* the vault — one
 * specific, known folder, not a search across a folder of unrelated repos.
 * No `ProjectScanner`/`ScannedProject` import here at all, on purpose:
 * reintroducing one is exactly the mistake to not repeat.
 */

// Priority order matters: modern Hugo (v0.109+) prefers `hugo.*` over the
// older `config.*` naming, and hugo.toml before hugo.yaml/yml mirrors what
// `hugo new site` scaffolds by default.
const CONFIG_FILE_CANDIDATES = [
  "hugo.toml", "hugo.yaml", "hugo.yml",
  "config.toml", "config.yaml", "config.yml",
];

// Section-index/list pages, not posts — see DESIGN.md's Hugo Posts section
// for why these are excluded while an ordinary leaf-bundle index.md isn't.
const EXCLUDED_FILENAME = "_index.md";

function findConfigFile(repoPath: string): string | null {
  for (const name of CONFIG_FILE_CANDIDATES) {
    const candidate = join(repoPath, name);
    if (existsSync(candidate)) return candidate;
  }
  // Hugo's newer config/_default/ layout — same filenames, one directory
  // level down. Checked only once no root-level file exists; mirrors
  // ProjectMetadata.ts's hasHugoConfigDir, which is what tags a repo using
  // only this layout "Hugo" in the first place (locateHugoSite's match).
  for (const name of CONFIG_FILE_CANDIDATES) {
    const candidate = join(repoPath, "config", "_default", name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Reads and parses a Hugo config to resolve its content directory. Called
 * with the vault's own base path — see this file's module comment. Null
 * when no config file is found there (no Hugo site in this vault).
 */
export async function readHugoSite(repoPath: string): Promise<HugoSite | null> {
  const configPath = findConfigFile(repoPath);
  if (!configPath) return null;
  try {
    const content = await readFile(configPath, "utf-8");
    const { contentDir } = parseHugoConfig(content);
    return { repoPath, contentDir: join(repoPath, contentDir) };
  } catch {
    return null;
  }
}

async function walkMarkdownFiles(dir: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(full, found);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md" && entry.name !== EXCLUDED_FILENAME) {
      found.push(full);
    }
  }
}

/** First path segment under contentDir — the content section a post's row groups under. Files directly at contentDir's top level (no subfolder) get "(root)". */
function sectionFor(contentDir: string, postPath: string): string {
  const rel = relative(contentDir, postPath);
  const segments = rel.split(/[\\/]/);
  return segments.length > 1 ? segments[0] : "(root)";
}

/** Walks a Hugo site's content directory and parses every post's frontmatter + mtime. */
export async function scanPosts(site: HugoSite): Promise<HugoPost[]> {
  const files: string[] = [];
  await walkMarkdownFiles(site.contentDir, files);

  const posts: HugoPost[] = [];
  for (const path of files) {
    try {
      const content = await readFile(path, "utf-8");
      const frontmatter = parsePostFrontmatter(content);
      const mtimeMs = statSync(path).mtimeMs;
      posts.push({
        title: frontmatter.title || basename(path, ".md"),
        path,
        section: sectionFor(site.contentDir, path),
        draft: frontmatter.draft,
        mtimeMs,
        summary: frontmatter.summary,
      });
    } catch {
      // Unreadable file — skip rather than fail the whole scan over one post.
    }
  }
  return posts;
}

/**
 * Creates `content/<section>/<slug>.md` from the repo's own archetype
 * (`archetypes/<section>.md`, then `archetypes/default.md`, then the
 * built-in `DEFAULT_ARCHETYPE` fallback), rendered via the limited
 * token substitution `renderArchetype` documents. Always a single file —
 * no leaf-bundle (`<slug>/index.md`) creation.
 */
export async function createPost(site: HugoSite, section: string, title: string): Promise<HugoPost> {
  const slug = slugify(title);
  const archetypePath = [
    join(site.repoPath, "archetypes", `${section}.md`),
    join(site.repoPath, "archetypes", "default.md"),
  ].find((p) => existsSync(p));

  const template = archetypePath ? await readFile(archetypePath, "utf-8") : DEFAULT_ARCHETYPE;
  const content = renderArchetype(template, { name: slug, date: new Date().toISOString(), title });

  const sectionDir = section === "(root)" ? site.contentDir : join(site.contentDir, section);
  await mkdir(sectionDir, { recursive: true });
  const postPath = join(sectionDir, `${slug}.md`);
  await writeFile(postPath, content, "utf-8");

  const frontmatter = parsePostFrontmatter(content);
  return {
    title: frontmatter.title || slug,
    path: postPath,
    section,
    draft: frontmatter.draft,
    mtimeMs: statSync(postPath).mtimeMs,
    summary: frontmatter.summary,
  };
}
