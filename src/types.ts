import { TFile } from "obsidian";
// Type-only — erased at compile time, so this doesn't create a runtime
// circular dependency even though ProjectsSidebarView.ts itself imports
// ProjectInfo/TodoItem from this file.
import type { ProjectSortKey } from "./ProjectsSidebarView";
import type { PlanSummary } from "./PlanParser";

export interface TeamMember {
  handle: string;
  name: string;
  isMe: boolean;
}

export interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;
  fingerprint: string;  // human text stripped of tags, dates, and markdown markers — used for stale line-number recovery
  text: string;
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
  // Header hierarchy fields
  isHeader?: boolean;           // True if this is a header line (##)
  isSubheading?: boolean;       // True if this is a bold subheading label within a header block
  headerLevel?: number;         // 1-6 for header level
  parentLineNumber?: number;    // Line number of parent header (if child)
  childLineNumbers?: number[];  // Line numbers of child items
  // Section context for orphan items (not children of a #todo header). Set to
  // the nearest preceding markdown heading or bold-subheading line. Used in
  // the sidebar to anchor every row under a heading rather than a bare arrow.
  sectionLabel?: string;
  sectionLineNumber?: number;
  // Item type discriminator
  itemType?: 'todo' | 'todone' | 'idea' | 'principle';
  // Inferred file-level tag derived from filename (e.g., "api-tasks.md" → "#api-tasks")
  inferredFileTag?: string;
  mentions: string[];
  // Absolute filesystem path outside the vault (e.g. a repo's BUGS.md). When set,
  // mutations write to this path via Node fs instead of the Obsidian vault API.
  // See DESIGN.md's Projects Extension.
  sourceFile?: string;
}

export interface TodoFilters {
  path?: string;
  tags?: string[];
  limit?: number;
  todone?: 'show' | 'hide';
  assignee?: string;
}

export interface ProjectInfo {
  tag: string;
  count: number;
  lastActivity: number;
  highestPriority: number;
  /** Whether this project has any items with #focus tag */
  hasFocusItems: boolean;
  /** Colour index 0-6 based on weighted average priority of project's tasks */
  colourIndex: number;
  // Repo-derived fields, present only when this project's tag matches a
  // detected git repo (see ProjectManager.getProjects()'s merge with
  // ProjectScanner output). Absent for tag-only projects.
  localPath?: string;
  remote?: string;
  branch?: string;
  gitStatus?: string;
  /** README-derived display title, or the repo folder name if there's no README/heading. See ProjectMetadata.ts. */
  title?: string;
  /** Detected technologies (marker files, package.json deps). See ProjectMetadata.ts. */
  stack?: string[];
  /** README's opening paragraph (after the title, before the next heading), capped to ~2-3 lines. See ProjectMetadata.ts. */
  readmeSummary?: string;
  /**
   * PLAN.md progress summary, present only when the repo has a PLAN.md. The
   * Projects detail view uses it for its progress strip; the collapsible
   * full-document render reads the file itself. See PlanParser.
   */
  planSummary?: PlanSummary;
  /**
   * Epoch ms for the Projects list's Recently updated sort/date. Repo-
   * matched projects only: CHANGELOG.md's mtime, falling back to README.md's
   * (ProjectMetadata.getRepoLastUpdated), falling back further to the vault
   * project note's own mtime if the repo has neither
   * (ProjectManager.getProjects()'s fallback pass). Absent only if none of
   * those exist.
   */
  lastUpdated?: number;
}

/**
 * One row in the TODOs/Ideas tab's active list: either a vault `TodoItem`
 * (rendered as today) or a repo project's synced-item block (rendered as
 * one collapsible group). The two interleave in a single sorted list —
 * see `compareSortableEntries` in `utils.ts` — rather than living in
 * separate sections, so a `#focus` synced item bubbles to the top the same
 * way a `#focus` vault item does.
 */
export type SortableEntry =
  | { kind: 'todo'; item: TodoItem }
  | { kind: 'project'; project: ProjectInfo };

/**
 * Source classification for a focus queue.
 * - 'focus-tagged': queue items came from explicit #focus tags
 * - 'priority-fallback': queue items came from highest-priority TODOs (no #focus items existed)
 * - 'empty': no items available at all
 */
export type FocusQueueSource = 'focus-tagged' | 'priority-fallback' | 'empty';

/**
 * Result of building a focus queue: ordered queue items plus their source classification.
 * Source is used to differentiate `#focus`-tagged queues from priority-fallback queues for downstream logic.
 */
export interface FocusQueueResult {
  items: TodoItem[];
  source: FocusQueueSource;
}

/**
 * Runtime state of the focus card view. Survives Skip-only mutations and is rebuilt
 * on any underlying data change (todos-updated, mode toggle, continue-mode flip).
 *
 * - `items`: the current queue. Head is the active card; rest are upcoming.
 * - `source`: classification used to decide whether to show the priority-fallback hint.
 * - `inContinueMode`: true after the user presses "Continue with next priority task" at
 *   the end of the curated #focus queue. While true, the queue is built from
 *   top-priority items regardless of #focus tags, and the hint is shown.
 */
export interface FocusQueueState {
  items: TodoItem[];
  source: FocusQueueSource;
  inContinueMode: boolean;
}

/**
 * Resolved date for a focus card.
 * - 'tag': came from an explicit @YYYY-MM-DD on the TODO line
 * - 'modified': came from the source file's last modified time (mtime fallback)
 * - 'none': no date available (file missing or empty)
 */
export type ItemDateKind = 'tag' | 'modified' | 'none';

export interface ItemDate {
  kind: ItemDateKind;
  iso: string | null;
}

// Configuration for unified list item rendering in SidebarView
export interface ItemRenderConfig {
  type: 'todo' | 'idea' | 'principle';
  classPrefix: string;
  tagToStrip: RegExp;
  showCheckbox: boolean;
  onComplete?: (item: TodoItem) => Promise<boolean>;
  onContextMenu?: (e: MouseEvent, item: TodoItem) => void;
}

export interface WarpedTodoSettings {
  showSidebarByDefault: boolean;
  /** Format for `#todone @date` completion stamps. Reopening a completed item (`replaceTodoneWithTodo`) tolerates any format, but completion-date sorting (`extractCompletionDate`/`compareByStatusAndDate`) only recognizes `YYYY-MM-DD` and silently falls back to original order otherwise. See DATE_FORMAT_PRESETS in utils.ts. */
  dateFormat: string;
  /** Format @today/@tomorrow/@yesterday/@date and /today, /tomorrow insert into note text. Free-form (see DATE_FORMAT_PRESETS in utils.ts) since nothing parses these back out. */
  insertDateFormat: string;
  defaultProjectsFolder: string;
  activeTodosLimit: number;
  priorityTags: string[];
  excludeFoldersFromProjects: string[];
  // Focus mode settings
  /** Max items shown in the immersive focus queue at once (1–5). */
  focusQueueLimit: number;
  /** When true, focus mode on/off survives session restart. */
  focusModePersist: boolean;
  /** Persisted on/off state for immersive focus mode. */
  focusModeActive: boolean;
  // Tab lock settings
  showTabLockButton: boolean;
  // Link rendering settings
  makeLinksClickable: boolean;
  // Move history (recent move-to targets)
  moveHistory: string[];
  // Team file path
  teamFilePath: string;
  // Default assignee for unattributed tasks ("" = none, "me" = @me, or a handle)
  defaultAssignee: string;
  // Projects extension: base folder scanned for git repos (ProjectScanner).
  // Data model only for now — settings tab UI lands with ProjectsSidebarView.
  projectsBaseFolder: string;
  projectsExcludeDirs: string[];
  projectsScanDepth: number;
  /** When true, opening a repo-matched project note jumps the sidebar to its Projects detail view even from Todos/Ideas. */
  autoOpenProjectsOnLinkedNote: boolean;
  /** App name passed to macOS `open -a` for the detail view's "Open in Terminal" action. */
  projectsTerminalApp: string;
  /** App name passed to macOS `open -a` for the detail view's "Open in Editor" action. */
  projectsEditorApp: string;
  /** Sort the Projects list opens with each session (see PROJECT_SORT_OPTIONS). The list itself stays session-only after that — picking a different sort from its own menu doesn't change this setting. */
  defaultProjectsSortKey: ProjectSortKey;
  /**
   * App name passed to macOS `open -a` for the Posts tab's "Open in Editor"
   * action. Deliberately its own setting, not `projectsEditorApp` — Posts
   * doesn't read anything from the Projects extension (see HugoScanner.ts's
   * module comment on why the two must stay independent), so it doesn't
   * borrow that setting either, even though the two will often hold the
   * same app name in practice.
   */
  postsEditorApp: string;
  /** "major.minor" of the plugin version the help note was last revealed at ("" = never). Drives HelpNoteManager: reopens (never overwrites) the help note when this falls behind the running version's major.minor. */
  helpNoteLastSeenVersion: string;
  /**
   * Per-project sync bookkeeping, keyed by project (repo folder) name. This
   * moved out of each project note's frontmatter (`repo` + `lastSynced`
   * keys) so a resync never rewrites a note the user keeps their own notes
   * in — the old keys were volatile, machine-local, derived state that
   * churned the vault's git history on every scan. Not a user-facing
   * setting; it lives here only because Obsidian persists plugin state as a
   * single `data.json` blob. See `ProjectSyncManager`.
   */
  projectSyncState: Record<string, ProjectSyncStateEntry>;
}

/** One project's persisted sync bookkeeping — see `WarpedTodoSettings.projectSyncState`. */
export interface ProjectSyncStateEntry {
  /** Absolute path to the repo root on this machine. */
  repoPath: string;
  /** ISO timestamp of the last sync that actually wrote the note, or "" if none has. */
  lastSynced: string;
}

/**
 * The Hugo site detected at the current vault's own root (see
 * `HugoScanner.readHugoSite`, called with the vault's base path — not
 * anything from the Projects extension's scan). Posts assumes the Hugo
 * site, if there is one, *is* the vault; it never looks anywhere else.
 * See DESIGN.md's Hugo Posts section, "Scope: vault-only, deliberately
 * not Projects" for why.
 */
export interface HugoSite {
  /** Absolute path to the repo root — the vault's own base path. */
  repoPath: string;
  /** Absolute path to the site's content directory — repoPath + its own `contentDir` config (default `"content"`). See HugoParser.parseHugoConfig. */
  contentDir: string;
}

/** Settings the Posts tab reads — its own, independent of `ProjectsSidebarOptions`. */
export interface PostsSidebarOptions {
  /** App name passed to macOS `open -a` for "Open in Editor" (right-click on a post row). */
  editorApp: string;
}

/** One post found under a HugoSite's contentDir. See `HugoScanner.scanPosts`. */
export interface HugoPost {
  /** Frontmatter title, or the filename (without extension) when absent. */
  title: string;
  /** Absolute filesystem path to the post's markdown file. */
  path: string;
  /** First path segment under contentDir; "(root)" for a file directly at contentDir's top level. */
  section: string;
  draft: boolean;
  /** File mtime in ms, used for the compact "~Xd" relative label and within-section sort. */
  mtimeMs: number;
  /** Frontmatter `description`/`summary`, falling back to the body's opening paragraph. See HugoParser.parsePostFrontmatter. */
  summary?: string;
}

export const DEFAULT_SETTINGS: WarpedTodoSettings = {
  showSidebarByDefault: true,
  dateFormat: "YYYY-MM-DD",
  insertDateFormat: "dddd, MMMM Do",
  defaultProjectsFolder: "projects/",
  activeTodosLimit: 0,
  priorityTags: ["#p0", "#p1", "#p2", "#p3", "#p4"],
  excludeFoldersFromProjects: ["log"],
  // Focus mode settings
  focusQueueLimit: 1,
  focusModePersist: true,
  focusModeActive: false,
  // Tab lock settings
  showTabLockButton: false,
  // Link rendering settings
  makeLinksClickable: true,
  // Move history
  moveHistory: [],
  // Team file
  teamFilePath: "team.md",
  // Default assignee
  defaultAssignee: "",
  // Projects extension
  projectsBaseFolder: "",
  projectsExcludeDirs: ["node_modules", "dist", "build", "archive"],
  projectsScanDepth: 3,
  autoOpenProjectsOnLinkedNote: true,
  projectsTerminalApp: "Terminal",
  projectsEditorApp: "Visual Studio Code",
  defaultProjectsSortKey: "recentlyUpdated",
  helpNoteLastSeenVersion: "",
  projectSyncState: {},
  // Posts (Hugo) — deliberately separate from the Projects extension above.
  postsEditorApp: "Visual Studio Code",
};
