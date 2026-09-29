import { existsSync, statSync } from "fs";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { basename, extname, join, relative } from "path";
import { ScannedProject } from "./ProjectScanner";
import { HugoPost, HugoSite } from "./types";
import { DEFAULT_ARCHETYPE, parseHugoConfig, parsePostFrontmatter, renderArchetype, slugify } from "./HugoParser";

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

/**
 * First repo among an existing Projects scan whose detected stack includes
 * "Hugo" (`ProjectMetadata.ts`'s `TECH_FILES` table already tags any repo
 * with a `hugo.toml`/`config.yaml`/etc. at its root). Assumes one Hugo site
 * per vault — the first match wins; a monorepo with more than one Hugo
 * config just won't see its other sites.
 */
export function locateHugoSite(scannedProjects: ScannedProject[]): ScannedProject | null {
  return scannedProjects.find((p) => p.stack.includes("Hugo")) ?? null;
}

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

/** Reads and parses the repo's Hugo config to resolve its content directory. Null when no config file is found (shouldn't happen for a repo locateHugoSite matched, but the scan that produced `stack` and this read are separate passes). */
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
  };
}
