import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { extname, join } from "path";
import { parsePlan, PlanSummary } from "./PlanParser";

/**
 * README-derived display title and marker-file-derived tech stack for a
 * project. Ports the detection signals from `~/projects/peep/p`'s
 * `extract_project_name()` and `detect_technologies()` as native TypeScript
 * — same marker files, same fallback order — so a repo's title/Stack read
 * the same whether you're looking at `p`'s CLI output or this sidebar.
 * Reimplemented rather than shelling out to `p` itself, consistent with
 * ProjectScanner.ts's own git-facts decision (see its module comment).
 */

// Marker file -> tech tags. Mirrors `p`'s `tech_files` table exactly.
const TECH_FILES: Record<string, string[]> = {
  "package.json": ["JS", "node.js"],
  "requirements.txt": ["Python"],
  "Pipfile": ["Python"],
  "pyproject.toml": ["Python"],
  "setup.py": ["Python"],
  "setup.cfg": ["Python"],
  "tox.ini": ["Python"],
  "pytest.ini": ["Python"],
  ".python-version": ["Python"],
  "Cargo.toml": ["Rust"],
  "go.mod": ["Go"],
  "pom.xml": ["Java", "Maven"],
  "build.gradle": ["Java", "Gradle"],
  "composer.json": ["PHP"],
  "Gemfile": ["Ruby"],
  "yarn.lock": ["JS", "yarn"],
  "package-lock.json": ["JS", "npm"],
  "Dockerfile": ["Docker"],
  "docker-compose.yml": ["Docker"],
  "docker-compose.yaml": ["Docker"],
  "Makefile": ["Make"],
  "config.toml": ["Hugo"],
  "config.yaml": ["Hugo"],
  "config.yml": ["Hugo"],
  "hugo.toml": ["Hugo"],
  "hugo.yaml": ["Hugo"],
  "hugo.yml": ["Hugo"],
};

// package.json dependency (in dependencies or devDependencies) -> tech tag.
const PACKAGE_DEPS: Record<string, string> = {
  react: "react",
  vue: "vue",
  angular: "angular",
  typescript: "typescript",
};

const CODE_EXTENSIONS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".rs", ".go", ".java", ".cpp", ".c",
  ".php", ".rb", ".swift", ".kt", ".scala", ".clj", ".cs", ".fs", ".vb",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
]);

const PYTHON_SHEBANGS = [
  "#!/usr/bin/env python",
  "#!/usr/bin/python",
  "#!/usr/local/bin/python",
  "#!python",
];

const PLANNING_FILES = [
  "TODO.md", "todo.md", "TODOS.md",
  "PLANNING.md", "planning.md",
  "DESIGN.md", "design.md",
  "NOTES.md", "notes.md",
  "IDEAS.md", "ideas.md",
  "ROADMAP.md", "roadmap.md",
  "SPEC.md", "spec.md",
];

// ---------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------

function scanDirForTech(dirPath: string, technologies: string[]): void {
  for (const [filename, techs] of Object.entries(TECH_FILES)) {
    if (existsSync(join(dirPath, filename))) technologies.push(...techs);
  }

  const packageJsonPath = join(dirPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, tech] of Object.entries(PACKAGE_DEPS)) {
        if (dep in deps) technologies.push(tech);
      }
    } catch {
      // malformed package.json — marker-file detection above still counts
    }
  }
}

function listDirSafe(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function isFileSafe(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirHasFileWithExt(dirPath: string, exts: Set<string>): boolean {
  if (!existsSync(dirPath)) return false;
  for (const name of listDirSafe(dirPath)) {
    const full = join(dirPath, name);
    if (isFileSafe(full) && exts.has(extname(name).toLowerCase())) return true;
  }
  return false;
}

// Hugo's newer config/_default/ layout — recommended by Hugo's own docs once
// a site needs more than one trivial file — isn't a flat root marker file,
// so it needs its own check beyond scanDirForTech's TECH_FILES table. Same
// filenames TECH_FILES already lists for the root case, one directory level
// down. (HugoScanner.ts's own findConfigFile mirrors this same fallback when
// it actually reads the file, once this tag has matched the repo.)
const HUGO_CONFIG_DIR_FILENAMES = [
  "hugo.toml", "hugo.yaml", "hugo.yml",
  "config.toml", "config.yaml", "config.yml",
];

function hasHugoConfigDir(projectPath: string): boolean {
  return HUGO_CONFIG_DIR_FILENAMES.some((name) => existsSync(join(projectPath, "config", "_default", name)));
}

function hasPythonFiles(projectPath: string): boolean {
  const dirs = [".", "src", "lib", "tests", "test", "scripts", "bin"];
  return dirs.some((d) => dirHasFileWithExt(join(projectPath, d), new Set([".py"])));
}

function isPythonExecutable(filePath: string): boolean {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) return false;
    const firstLine = readFileSync(filePath, "utf-8").split("\n", 1)[0].trim();
    return PYTHON_SHEBANGS.some((shebang) => firstLine.startsWith(shebang));
  } catch {
    return false;
  }
}

function hasPythonExecutables(projectPath: string): boolean {
  const dirs = [".", "bin", "scripts"];
  for (const d of dirs) {
    const dirPath = join(projectPath, d);
    if (!existsSync(dirPath)) continue;
    for (const name of listDirSafe(dirPath)) {
      if (isPythonExecutable(join(dirPath, name))) return true;
    }
  }
  return false;
}

function hasAnyCodeFiles(projectPath: string): boolean {
  const dirs = [".", "src", "lib", "app", "scripts", "bin", "test", "tests"];
  return dirs.some((d) => dirHasFileWithExt(join(projectPath, d), CODE_EXTENSIONS));
}

function isEmptyOrPlanningProject(projectPath: string): boolean {
  const hasReadme = existsSync(join(projectPath, "README.md")) || existsSync(join(projectPath, "readme.md"));
  const hasGit = existsSync(join(projectPath, ".git"));
  if ((hasReadme || hasGit) && !hasAnyCodeFiles(projectPath)) return true;

  const hasPlanningFiles = PLANNING_FILES.some((f) => existsSync(join(projectPath, f)));
  if (hasPlanningFiles && !hasAnyCodeFiles(projectPath)) return true;

  return false;
}

/**
 * Immediate subdirectories worth checking for a monorepo's per-package
 * marker files (e.g. several independent plugins sharing one root README/git
 * history, but no root package.json). One level only, same skip-list the
 * repo scan itself uses.
 */
function subdirsForTechScan(projectPath: string, excludeDirs: string[]): string[] {
  const excluded = new Set(excludeDirs);
  return listDirSafe(projectPath)
    .filter((name) => !name.startsWith(".") && !excluded.has(name))
    .filter((name) => {
      try {
        return statSync(join(projectPath, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Detects technologies used in a project: marker files, package.json
 * dependencies, a one-level monorepo subdirectory scan, then Python-file/
 * shebang and static-website fallbacks. Falls back to `["n/a"]` for a
 * project that's clearly real (has a README or git) but has no detectable
 * code yet, rather than returning nothing.
 */
export function detectStack(projectPath: string, excludeDirs: string[] = []): string[] {
  const technologies: string[] = [];
  scanDirForTech(projectPath, technologies);

  if (!technologies.includes("Python")) {
    if (hasPythonFiles(projectPath)) technologies.push("Python");
    else if (hasPythonExecutables(projectPath)) technologies.push("Python");
  }

  if (!technologies.includes("Hugo") && hasHugoConfigDir(projectPath)) {
    technologies.push("Hugo");
  }

  for (const subdir of subdirsForTechScan(projectPath, excludeDirs)) {
    const subdirPath = join(projectPath, subdir);
    scanDirForTech(subdirPath, technologies);
    if (!technologies.includes("Python") && hasPythonFiles(subdirPath)) {
      technologies.push("Python");
    }
    if (!technologies.includes("Hugo") && hasHugoConfigDir(subdirPath)) {
      technologies.push("Hugo");
    }
  }

  if (technologies.length === 0 && existsSync(join(projectPath, "index.html"))) {
    technologies.push("static website");
  }

  if (technologies.length === 0 && isEmptyOrPlanningProject(projectPath)) {
    technologies.push("n/a");
  }

  return [...new Set(technologies)]; // dedupe, preserve first-seen order
}

// ---------------------------------------------------------------------
// Title detection
// ---------------------------------------------------------------------

function findReadme(projectPath: string): string | null {
  for (const name of ["README.md", "readme.md"]) {
    const candidate = join(projectPath, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findChangelog(projectPath: string): string | null {
  for (const name of ["CHANGELOG.md", "changelog.md", "Changelog.md"]) {
    const candidate = join(projectPath, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findPlan(projectPath: string): string | null {
  for (const name of ["PLAN.md", "plan.md", "Plan.md"]) {
    const candidate = join(projectPath, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Absolute path to the repo's PLAN.md (any common casing), or null. */
export function planFilePath(projectPath: string): string | null {
  return findPlan(projectPath);
}

/** Absolute path to the repo's README (README.md or readme.md), or null. */
export function readmeFilePath(projectPath: string): string | null {
  return findReadme(projectPath);
}

/**
 * Parsed PLAN.md progress summary (see PlanParser), or null when the repo
 * has no PLAN.md or the file is empty. The Projects detail view uses this
 * for its progress strip; the collapsible full-document render reads the
 * file itself, lazily, via planFilePath.
 */
export function extractPlanSummary(projectPath: string): PlanSummary | null {
  const path = findPlan(projectPath);
  if (!path) return null;
  try {
    return parsePlan(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Best available "last real update" signal for a repo, used by the Projects
 * list's Recently updated sort and its per-row date. CHANGELOG.md's own
 * mtime wins when the repo has one — it's only touched on an actual
 * versioned change, not every incidental edit — falling back to README.md's
 * mtime, then PLAN.md's. Returns null if the repo has none of the three;
 * the caller falls back further, to the vault project note's own mtime
 * (ProjectManager, which owns the vault side — this module only knows about
 * files on disk in the repo itself).
 */
export function getRepoLastUpdated(projectPath: string): number | null {
  const path = findChangelog(projectPath) ?? findReadme(projectPath) ?? findPlan(projectPath);
  if (!path) return null;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Extracts a display title from a project's README first `# heading`, ASCII-
 * filtered (drops logo glyphs/emoji, e.g. "␣⌘ Warped Command for Obsidian"
 * -> "Warped Command for Obsidian") and whitespace-collapsed. Returns null
 * if there's no README or no top-level heading — callers fall back to the
 * repo folder name, same as `p`'s `extract_project_name(...) or folder_name`.
 */
export function extractProjectTitle(projectPath: string): string | null {
  const readmePath = findReadme(projectPath);
  if (!readmePath) return null;

  let content: string;
  try {
    content = readFileSync(readmePath, "utf-8");
  } catch {
    return null;
  }

  const match = content.match(/^#\s+(.+)$/m);
  if (!match) return null;

  const title = match[1]
    .replace(/[^\x20-\x7E]/g, "") // printable ASCII only — strips logo glyphs/emoji
    .replace(/\s+/g, " ")
    .trim();

  return title || null;
}

// Character budget for extractProjectSummary's output — a hard line count
// doesn't work since README prose wraps unpredictably at sidebar width, but
// this many characters lands at roughly 2-3 lines there.
const SUMMARY_MAX_CHARS = 220;

/**
 * A line that's entirely badge images (optionally link-wrapped), e.g. the
 * shields.io row READMEs often place right under the title — not summary
 * prose, so extractProjectSummary skips it.
 */
function isBadgeLine(line: string): boolean {
  if (!line.includes("![")) return false;
  const stripped = line
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .trim();
  return stripped === "";
}

function truncateSummary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

/**
 * Extracts the README's opening summary: the prose between the first `#`
 * heading and the next heading, badge rows and blank lines dropped, ASCII-
 * filtered the same way extractProjectTitle is, and capped to roughly 2-3
 * sidebar lines. Returns null if there's no README, no top-level heading, or
 * nothing but badges/whitespace follows it — callers should just omit the
 * summary block rather than show an empty one.
 */
export function extractProjectSummary(projectPath: string): string | null {
  const readmePath = findReadme(projectPath);
  if (!readmePath) return null;

  let content: string;
  try {
    content = readFileSync(readmePath, "utf-8");
  } catch {
    return null;
  }

  const lines = content.split("\n");
  const headingIdx = lines.findIndex((line) => /^#\s+/.test(line));
  if (headingIdx === -1) return null;

  const summaryLines: string[] = [];
  for (const line of lines.slice(headingIdx + 1)) {
    if (/^#{1,6}\s/.test(line)) break; // next heading — summary is over
    const trimmed = line.trim();
    if (!trimmed || isBadgeLine(trimmed)) continue;
    summaryLines.push(trimmed);
  }
  if (summaryLines.length === 0) return null;

  const summary = summaryLines
    .join(" ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return summary ? truncateSummary(summary, SUMMARY_MAX_CHARS) : null;
}
