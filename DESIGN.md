# Warped Command Architecture

Warped Command is a task management plugin that scans markdown files for tagged items (`#todo`, `#todone`, `#idea`, `#principle`) and provides interactive views for managing them. The architecture follows an event-driven pattern with clear separation between data scanning, mutation, and rendering layers.

The plugin has been renamed twice: `Space Command` → `Warped Todo` → `Warped Command` (see CHANGELOG.md). The `␣⌘` logo, a space glyph next to a command-key glyph, dates back to the original name and reads literally as "Space Command"; it survived both renames because it still works as a mark on its own, independent of what the product is called this week. The internal plugin `id` (`warped-todo`) is a fossil of the middle name for the same reason: renaming it would break every existing install's plugin folder path.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WarpedTodoPlugin (main.ts)                   │
│                    Entry point & component wiring               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  TodoScanner  │       │  TodoProcessor  │       │ ProjectManager  │
│  (Data Layer) │◀─────▶│ (Mutation Layer)│       │ (Aggregation)   │
└───────┬───────┘       └────────┬────────┘       └─────────────────┘
        │                        │
        │ todos-updated          │ triggers rescan
        │ event                  │
        ▼                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Rendering Layer                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      SidebarView                             │ │
│  │   TODOs / Ideas tabs · tag cloud · focus mode                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

## Core Components

### TodoScanner (`src/TodoScanner.ts`)

The scanner is the single source of truth for vault state. It:

- Scans markdown files for tagged items
- Maintains four separate caches (todos, todones, ideas, principles)
- Tracks header-child relationships for hierarchical TODOs
- Watches file system changes with 100ms debouncing
- Emits `todos-updated` events for reactive UI updates
- Skips code blocks and inline code to avoid false positives

**Key data structures:**
```typescript
private todosCache: Map<string, TodoItem[]>
private todonesCache: Map<string, TodoItem[]>
private ideasCache: Map<string, TodoItem[]>
private principlesCache: Map<string, TodoItem[]>
```

### TodoProcessor (`src/TodoProcessor.ts`)

Handles all file mutations:

- Complete/uncomplete TODOs (replace tags, mark checkboxes, in place)
- Refuses to complete a header TODO that has children directly (`completeTodo`
  shows a notice instead) — children must be completed individually. Avoids
  accidentally cascading a single click into a whole block; see "Header-Child
  Relationships" below
- Convert ideas to TODOs
- Manage priority tags (#p0-#p4, #focus, #future)
- Batch operations for project-level actions

After each mutation, the processor triggers a rescan to keep the cache consistent.

### ProjectManager (`src/ProjectManager.ts`)

Groups TODOs by project tags:

- Extracts project tags (all tags except reserved ones like #todo, #focus, priorities)
- Falls back to inferred file tags when no explicit tags exist
- Calculates per-project statistics (count, last activity, highest priority)
- Sorts projects by activity score
- Merges in repo-derived facts from `ProjectScanner` when a project tag matches a detected git repo (see Projects Extension)
- Owns project note creation/lookup (`getProjectFilePath`, `openProjectFile`, `createProjectFile`); repo-matched projects get the frontmatter-only template (see ProjectSyncManager below), tag-only projects keep the original simple template

### ProjectScanner (`src/ProjectScanner.ts`)

Recursively walks the configured base folder (external filesystem path,
distinct from any vault folder) for git repos:

- A directory counts as a project when it has a `.git` **directory**, not a `.git` file (submodules/worktrees have a `.git` file and are skipped as projects, but the walk still recurses past them). Once a repo is found, the walk doesn't recurse into it — a repo's own tree isn't scanned for further nested projects
- Default depth cap 3 (configurable), default excludes `node_modules`/`dist`/`build` (configurable)
- Per repo, shells to `git` via `child_process.execFile` (same pattern as `DriveProvider.ts`'s `rclone` calls) for branch, status, and remote URL — no external tool dependency

### ProjectSyncManager (`src/ProjectSyncManager.ts`)

Keeps each repo-matched project note's **frontmatter** in sync with disk, and
maintains an in-memory item cache the Projects sidebar reads from directly.
The note body is never written to for items — see "Item list" below for why
this changed from the original delimited-block design.

- `syncAll(options)`: runs `ProjectScanner`, reads each project's structured files off disk, parses them via `StructuredFileParser`, and calls `syncProject()` for each. This is the manual "Sync projects" entry point (`main.ts`'s "Sync Projects" command) and what a completed watch-debounce cycle calls.
- `syncProject(scanned, items, projectsFolder)`: finds/creates the note via `projectFilePath()` — a helper extracted from `ProjectManager` (not `createProjectFile()`, which is coupled to an interactive create-confirmation modal that shouldn't fire during an automatic background sync). Updates the item cache (`getCachedItems()`/`updateCachedItems()`) regardless of whether the note itself needs writing.
- Merges four `ProjectScanner`-derived frontmatter keys (`project`, `title`, `stack`, `remote`) into any existing frontmatter, rather than replacing it; unrecognized keys are preserved in their original order. These four are all stable — they change on a rename, a README-title edit, a stack change, or a remote repoint, nothing more. **The write guard is semantic, not byte-equality**: `ownedFrontmatterUpToDate()` writes only when one of the four (or `cssclasses`) is actually stale, or a legacy key still needs stripping. It deliberately does not rewrite the note over the user's own frontmatter formatting (compact `key:value`, reordered keys). Combined with items never touching the body, an unchanged project's note reaches a stable state and stops appearing in the vault's git diff.
- **Volatile keys left the note.** Earlier versions also wrote `repo`, `branch`, `gitStatus`, and `lastSynced`. `branch`/`gitStatus` flip whenever a tracked repo's working tree changes state; `repo` is a machine-local absolute path; `lastSynced` is bookkeeping. In a vault under git that meant a spurious commit on the note every time you switched branches or left a repo dirty, plus cross-machine frontmatter merge conflicts. `branch`/`gitStatus` are now read live from the scan by the sidebar and never persisted. `repo` + `lastSynced` moved to `WarpedTodoSettings.projectSyncState` in `data.json`, keyed by project name, written through the injected `ProjectSyncStateStore` on a debounce (`main.ts`). `LEGACY_SYNC_KEYS` is stripped from an older note's frontmatter on the first sync that writes it — a one-time migration.
- `getRepoPathForProjectName(name)`: resolves a project's repo root for "Send selection to project" (was the `repo` frontmatter key) — the live scan first, `projectSyncState` as the pre-first-scan fallback.
- `startWatching()`/`stopWatching()`: a single recursive `fs.watch` on the base folder, debounced 300ms, ignoring events under an excluded directory (`isUnderExcludedDir()`, same list the scan uses) and events within 1500ms of the last completed sync (absorbs `git status` touching `.git/index`, which sits inside the watched tree). Recursive `fs.watch` is only reliable on macOS/Windows, not Linux, which is fine given the macOS-only scope decision
- Calls `onSynced(scanned)` once per `syncAll()` batch, passing the fresh scan results directly. Callers **must not** respond by triggering another `syncAll()` (e.g. a sidebar "full reload" method) — `main.ts` learned this the hard way: wiring `onSynced` through a view's `reload()` (which itself calls `syncAll()`) is an unbounded loop, found via live testing as a project note being rewritten roughly every 200ms. `onSynced` exists only to hand fresh data to an already-open sidebar for a re-render.

### Projects tab (`src/SidebarView.ts`, logic shared from `src/ProjectsSidebarView.ts`)

**Not a second sidebar.** An earlier design put Projects in its own
`ItemView` (`VIEW_TYPE_PROJECTS_SIDEBAR`, its own ribbon icon) alongside the
TODOs sidebar; a screenshot review found it behaved structurally unlike
every other tab — its own leaf, its own icon in the sidebar dock's tab
strip, a back button where clicking the tab again would do — so it was
folded into `TodoSidebarView` as a third tab (`activeTab: 'todos' | 'ideas'
| 'projects'`), alongside the tab-switching machinery `switchTab`/
`switchToProjectsTab` already documented under SidebarView above.
`src/ProjectsSidebarView.ts` is what's left of the original file: pure,
`ItemView`-independent helpers (display formatting, hand-typed-item
grouping, the `GROUP_ORDER` constant, `getProjectPrinciples`/
`buildProjectPrincipleBlocks` for the Guiding Principles section below) the
tab's rendering code in `SidebarView.ts` calls into — safe to unit-test
directly (`groupHandTypedItems.test.ts`, `projectsSidebarDisplay.test.ts`,
`projectPrinciples.test.ts`), which was the point of keeping it a separate
file rather than inlining it. Settings
live in the *existing* `WarpedTodoSettingTab`'s "Projects" `h3` section
(already holds `defaultProjectsFolder`/`excludeFoldersFromProjects` for the
tag-based flow) — the repo-scan fields (base folder, exclude dirs, scan
depth) are added there, not a new section, since it's the same underlying
"Projects" concept now that tag- and repo-derived `ProjectInfo` are unified.

List view: flat list, sort chosen from the sort button (Default, Name (A–Z),
Most items, Needs attention, Recently updated — see below), no separate
section headers. Each row opens its vault note on click (same target
`ProjectManager` already resolves via `getProjectFilePath()`).

```
Projects                                              [⟳ Sync]

  Filter: [________________________]  [sort ⇅]

  peep
  main M? · 4 todos · 1 idea · 2 bugs · 3h ago
  Focus on the right next task. Plain #todo tags,
  surfaced in a sidebar when you need them.
  peep.md                                          →

  widget-tool
  main · 2d ago
  widget-tool.md                                   →

  obsidian-plugins
  main
  obsidian-plugins.md                              →
  ... (22 more)
```

- Each row is up to four lines: name; branch+status (one monospace chunk,
  status omitted when clean) + item counts + Recently updated, one
  dot-joined run; the repo's README excerpt (same
  `renderProjectReadmeSummary` the detail view uses), omitted when the repo
  has none; filename+arrow at the bottom, right-aligned. Was two lines with
  the filename/arrow squeezed onto the title line — that wrapped badly once
  a repo name was long enough to compete with the filename for width
  (reported via screenshot), so the filename+arrow moved to its own line
  and the title line is name-only now, free to wrap on its own. Recently
  updated first shipped floated right on its own line
  (`justify-content: space-between`); reported as not fitting visually, so
  it moved into the dot-joined run with everything else on the meta line.
- Recently updated: `getRepoLastUpdated` (ProjectMetadata.ts) — a repo's
  CHANGELOG.md mtime, falling back to README.md's, then PLAN.md's, falling
  back further to the vault project note's own mtime if the repo has none
  of the three (ProjectManager.applyNoteLastUpdatedFallback). CHANGELOG
  over an actual git-log call: only touched on a real versioned change,
  not every incidental edit, and free of a new git call per repo on every
  scan.
- Sort button (`sortProjectRows`/`PROJECT_SORT_OPTIONS` in
  ProjectsSidebarView.ts) opens a checkmarked menu, mirroring Obsidian's
  own file-explorer "Change sort order" menu rather than inventing a new
  pattern. "Active items first" (`ProjectSortKey` value `"activeFirst"`)
  is the list's original implicit sort (tracked-items first, then name)
  kept as an explicit, reselectable option — named to avoid colliding with
  the settings tab's own "Default projects sort" (see below), not literally
  called "Default" itself. Needs attention: dirty git status or at least
  one open bug. Picking a sort from this menu is session-only, like the
  filter text box — it doesn't write back to settings.
- Settings → Projects → "Default projects sort"
  (`WarpedTodoSettings.defaultProjectsSortKey`) seeds `projectsSortKey`
  once, in `TodoSidebarView`'s constructor — not re-read on every render,
  which would stomp an in-session sort-menu pick back to the configured
  default on the next todo update. Ships defaulting to Recently updated
  (`DEFAULT_SETTINGS`), not Active items first — the list reads better
  landing on what changed lately than on a fixed tracked-items-first
  ordering.
- Filter box matches on project name only (not item content) — consistent
  with `ProjectManager`'s existing tag-based filtering elsewhere.
- Empty state (no `projectsBaseFolder` configured): an inline message plus
  an "Open settings" button that jumps straight to this plugin's settings
  tab (`app.setting.open()` + `app.setting.openTabById()`), not a blank list.
- `[⟳ Sync]` calls `ProjectSyncManager.syncAll()` — the same manual entry
  point a command palette action uses.

#### Detail view

Selecting a project (click in the list, or opening its note any other
way — Quick Switcher, a link) is unified: the note opens in the main pane
*and* the sidebar swaps from the list to that project's detail view, same
"replace sidebar content" pattern Focus Mode already uses. The sidebar
auto-follows the active file the same way Obsidian's core Backlinks/
Outline panels do — open a different project note, the sidebar follows;
switch to a non-project file, it reverts to the list. An explicit back
control at the top of the detail view always works too, independent of
what's in the main pane.

```
< Back                                            [⟳ Sync]

  peep
  main [M] · synced 2m ago              [📁 reveal] [🔗 remote]

  ## Guiding principles
  1. Ship small, ship often
  2. Users own their data

  ### TODOs
  - [x] Add error handling for malformed files
  - [ ] Add caching mechanism for git operations

  ### Ideas
  - Review documentation

  ### Bugs
  - Issue: Bug/Issue tracking logic scans image files

  Notes
  - [ ] Write a proper getting-started doc #todo
```

The `### TODOs`/`### Ideas`/`### Bugs` groups above are sidebar UI only —
nothing with those headings is written into the note. The last group
("Notes" here) is whatever the user hand-typed into the note itself, under
its own real heading. "Guiding principles" above them, right below the
README blurb, is a project's `#principle`/`#principles` items
(`getProjectPrinciples`/`buildProjectPrincipleBlocks` in
`ProjectsSidebarView.ts`), same set the project-info popup's own Principles
section shows — rendered verbatim: a `#principles`-tagged header's own line
joins with its children into one markdown block, so it reads exactly as
written in the note (no synthesised title, original list markup as-is —
an earlier version reconstructed its own `<ul>` around each item, which
double-nested a source ordered list inside it; reported via screenshot).
Omitted entirely when the project has none.

**Plan section.** Below Guiding Principles, `renderProjectPlanSection`
surfaces the repo's `PLAN.md` read-only. `PLAN.md` is a reference
document, not an item source — nothing from it feeds the TODOs/Ideas tabs,
the project note, or the sync pipeline, and it is never written back to
(the survey behind this: `PLAN.md` files across `~/projects` are phased
implementation plans with hundreds of fine-grained boxes, most of them
completed sub-steps or verify lines — interleaving them into the TODOs tab
would swamp it, and the narrative-shape plans have no items at all).
`PlanParser.parsePlan` (pure, string-in, `planParser.test.ts`) reduces the
file to a `PlanSummary`: whether it has checkboxes, the `##` sections that
carry checkboxes (its "phases"), the first phase with an unchecked box,
that phase's open lines verbatim, and whole-file done/total counts. The
section renders a progress strip ("Phase 3 of 7 · 47 of 155 done") and the
current phase's open items only when `hasCheckboxes`; every `PLAN.md` also
gets a `<details>` "Full plan" that reads the file and renders it in full,
lazily on first expand. `ProjectMetadata.extractPlanSummary` is the
file-reading wrapper (mirrors `extractProjectSummary` for README); the
summary rides on `ProjectInfo.planSummary`. The README excerpt and the
Plan section each carry an `appendExternalFileLink` "FILE →" affordance
(`shell.openPath`, via `openExternalProjectFile`).

Pinned fields, rendered from the live scan result already in memory (not by
re-reading the note): project name doubling as the remote link (opens the
browsable URL), stack, branch + git status, local path as a "reveal in
Finder" action rather than raw text.

**Frontmatter is hidden in the note itself for repo-matched projects** —
the plugin applies a CSS class so the YAML block never renders in Reading/
Live Preview view for these notes specifically (not a general Obsidian
Properties-panel setting change), since the sidebar already surfaces the
fields that matter. Tag-only project notes are unaffected.

**Item list — two sources, no reverse-mapping.** The list is two things
concatenated, each already knowing how to mutate itself correctly without
needing to track the other. This changed from the original design: items were originally rendered into a
delimited block in the note body, rewritten on every sync; that block
caused a genuine content-flicker loop against `TodoScanner`'s own
checkbox↔tag correction, and — combined with a separate runaway-sync bug —
crashed Obsidian by stacking duplicate copies of the block into the note.
The note body is no longer touched for items at all:

1. **Synced items** — `ProjectSyncManager.getCachedItems()`, the actual
   `ParsedProjectItem[]` from the last sync, held in memory only. Grouped
   under `### TODOs`/`### Ideas`/`### Bugs` directly from `itemType`.
   Mutations route to `sourceFile` (the external repo file), per Phase 1,
   then update the cache directly (`updateCachedItems()`) — no vault write,
   nothing to resync.
2. **Hand-typed items** — anything in the note tagged `#todo`/`#idea`/
   `#bug`, found by scanning the vault note through `TodoScanner` as usual,
   with real section labels (`## Overview`, or whatever heading they're
   actually under) from the scanner's existing header-context logic.
   Mutations go through the normal vault `TodoProcessor` path — no
   `sourceFile`.

No visual marker distinguishes the two — the header itself
(TODOs/Ideas/Bugs vs. anything else) already communicates it.

**Context menu**: full parity with the TODOs sidebar (priority, focus,
snooze, complete) for both sources, **except "move"**, which is dropped
from this view entirely — for either source, not just synced items. A
synced item moved elsewhere would just reappear in its original note on
the next sync; keeping "move" only for hand-typed items was considered
and rejected as an inconsistent half-measure. (Separately, the plugin's
existing vault-wide move feature — `MoveTargetModal.ts`, `moveTodo()`,
the move history setting — is being removed entirely; unrelated to
Projects, tracked as its own task, not a Phase 5/6 deliverable.)

**Tags added via the context menu survive resync** for free now, with no
carry-forward logic needed: `#focus`/`#p0`/etc. added to a synced item are
written straight into the actual repo file (via `addProjectItemTag()`,
same as completion), so the next sync's parse of that file picks them up
as part of the item's own tags. There's no separate rendered copy that
could fall out of sync with the source.

**Completing an item** depends on what its source line actually looks
like:
- Has a checkbox already → toggle it (Phase 1's `sourceFile` write path,
  unchanged).
- No checkbox, no tag at all (the common case for a plain bullet in a
  real `TODO.md`) → a checkbox is added and checked in the same edit —
  `- Add caching mechanism` becomes `- [x] Add caching mechanism`.
- A `###`-nested header-report item (this repo's own `BUGS.md` shape) has
  no line to toggle at all; "complete" moves the whole multi-line block to
  under the first closed-vocabulary `##` section (creating `## Fixed` at
  the end of the file if none exists), gated on a clean `git status` for
  that file. Built as `HeaderBlockMover.ts`.
- A standalone `##` item heading (`peep/ISSUES.md`'s `## Issue: ...` shape)
  completes by appending `" ✅ RESOLVED"` to its own heading line — no move,
  just Phase 1's single-line write path again.

### Project blocks in the TODOs/Ideas tabs

Synced items were originally visible only inside the Projects tab's detail
view, one project at a time — `TodoScanner`'s vault-only cache (and
everything downstream of it: the TODOs/Ideas tabs' active lists, the tag
cloud) had no way to know they existed. Repo-matched projects with
non-completed synced items now surface directly in the TODOs/Ideas tabs
too, as one collapsible block per project, interleaved with regular items
by priority rather than shown in a separate section.

- **Aggregation**: `ProjectManager.getProjects()` takes an optional
  `getCachedItems` lookup; when supplied, `foldSyncedItemsIntoProjects`
  folds each repo-matched project's non-completed synced items into
  `count`/`highestPriority`/`hasFocusItems` alongside the vault-derived
  numbers (reusing `getPriorityValue`/`hasTag` — both already operate on
  bare `tags: string[]`, so `ParsedProjectItem` needs no adapter).
  `colourIndex` is deliberately left untouched — recomputing a cosmetic
  pill colour from a second, differently-shaped item set wasn't worth it.
  Callers that need the unified view (`renderProjects`'s tag cloud,
  `renderTopBacklogs`) pass
  `(localPath) => this.syncManager.getCachedItems(localPath)`; callers that
  only care about vault items omit the argument and the merge is skipped.
- **Interleaving**: `SortableEntry` (`src/types.ts`) is a discriminated
  union — `{kind: 'todo', item: TodoItem}` or `{kind: 'project', project:
  ProjectInfo}`. `compareSortableEntries` (`src/utils.ts`) gives both kinds
  the same tier-then-priority ordering `compareWithEffectivePriority`
  already uses for two `TodoItem`s: a `todo` entry's tier/priority come from
  `isEffectivelyFocused`/`getEffectivePriority` as before; a `project`
  entry's come straight from its (now synced-item-inclusive)
  `hasFocusItems`/`highestPriority` — no new priority logic, just combining
  two already-computed values. `renderActiveTodos`/`renderActiveIdeas`
  build one `SortableEntry[]` from the tab's filtered vault items plus
  `buildProjectBlocks()`'s project blocks, sort it, and render in order. A
  block counts as a single entry toward `activeTodosLimit`'s "+N more"
  truncation, same as a header-with-children TODO, regardless of how many
  synced items it holds.
- **Filtering**: `buildProjectBlocks()` applies the active tag filter the
  same way the vault-item path does — a filter matching a project's own tag
  collapses the result to just that project's block; any other filter
  narrows each block's items via `itemMatchesTagFilter` (already accepts
  `ParsedProjectItem`'s `{tags, inferredFileTag?}` shape) and drops a block
  that goes empty. `activeAssigneeFilter` doesn't apply — synced items carry
  no `mentions`.
- **Rendering and mutation**: `renderProjectBlockItem` builds the same
  `.todo-header-row` + `.todo-children` markup shape a header-with-children
  TODO uses, for visual consistency, but delegates each child row to the
  existing `renderSyncedProjectItemRow`/`showSyncedProjectItemMenu` — the
  same functions the Projects tab's detail view already used, unchanged.
  This is where 2-way sync comes from: nothing new was built for it. The
  one refactor needed was generalizing `resyncActiveProject()` (hardcoded to
  `this.activeProjectName`) into `resyncProject(name)`, since a project
  block's mutations aren't necessarily for the "active" detail-view project.
- **Navigation**: a block's header row and its small arrow both switch the
  sidebar to the Projects tab's detail view for that project
  (`switchToProjectsTab`/`openProjectDetail`) and open the vault note — both
  affordances fire from either control, confirmed as the intended pair
  rather than a choice between them. They differ in what the detail view's
  back button then does: the header row leaves the normal "back to the
  Projects list" behaviour; the arrow sets `projectDetailReturnTab` to
  whichever tab (TODOs/Ideas) it was clicked from, so back returns there
  instead — reported via screenshot, since the arrow felt like "look at
  this note" rather than "go browse Projects." `backToProjectsList` checks
  and clears that field first; every other entry into detail view (a
  project's own list row, Quick Switcher/wikilink auto-follow via
  `handleProjectActiveFileChange`) explicitly resets it to `null` so a
  stale return-tab from an earlier arrow click can't leak into an unrelated
  visit.
- **Why the merge happens at render time, not in `TodoScanner`**:
  `TodoScanner` stays the single source of truth for *vault* state, exactly
  as designed — folding repo items into it would mean either giving
  synced items a fake `TFile`/line-number identity they don't have, or
  teaching the vault scanner about `ProjectSyncManager`'s existence. Doing
  the merge in `SidebarView` instead mirrors the reasoning that already kept
  the synced cache itself out of the vault (see "Item list" above): the two
  item shapes (`TodoItem` vs `ParsedProjectItem`) stay distinct all the way
  through, joined only at the render/sort boundary via `SortableEntry`.

### StructuredFileParser (`src/StructuredFileParser.ts`)

Standalone parser, not part of `TodoScanner`: `parseStructuredFile(filename,
content, sourceFile) => ParsedProjectItem[]`. Deliberately its own type
rather than `TodoItem`: a repo-sourced item has no vault `TFile`/line-number
identity to hang off `TodoItem`'s shape, so it gets its own type instead of
forcing a fit. Implements the filename-default-type table and the
`###`-presence-based shape selection described under Structured-file
parsing, below.

### SidebarView (`src/SidebarView.ts`)

Custom Obsidian sidebar panel:

- Three tabs — TODOs, Ideas, Projects (`activeTab`) — plus a separate Focus
  Mode overlay toggled by the eye icon that composes with TODOs/Ideas only;
  see "Immersive Focus Mode" below.
- **TODOs tab** (`renderTodosContent`): tag cloud (`renderProjects`,
  `#focus`/`#p0` pinned first), the active TODO list grouped by header
  where applicable (`renderActiveTodos`), then a collapsible **Summary**
  section (priority counts, assignee stats, top backlogs, and a Done
  today/week/month preview).
  Repo-matched projects with non-completed synced `#todo`/`#bug` items
  interleave into the same active list as one collapsible block per
  project, sorted by priority alongside regular TODOs rather than in a
  separate section — see "Project blocks in the TODOs/Ideas tabs" below.
- **Ideas tab** (`renderIdeasContent`): its own tag cloud built from all
  ideas, then a single list sorted focus-first (`renderActiveIdeas`), with
  synced `#idea` items interleaved as project blocks the same way.
  Principles are scanned but don't get their own section here — they only
  surface inside a project's info popup.
- Snoozed items (`#future`/`#snooze`/`#snoozed`) are an ordinary tag in
  both tabs — no dedicated tab or exclusion, except Focus Mode's queue
  (see below).
- Interactive list items with context menus; tag-cloud pills drive
  `activeTagFilter`.

### ContextMenuHandler (`src/ContextMenuHandler.ts`)

Manages right-click menus:

- **TODO menu** (`showTodoMenu`): Copy, Move to... (omitted when the
  caller passes `includeMove: false`, e.g. the Projects sidebar),
  Focus/Unfocus, Later/Unlater, Snooze/Unsnooze.
- **Idea menu** (`showIdeaMenu`): Add to TODOs (converts `#idea` →
  `#todo`), Copy, Focus/Unfocus.
- **Project menu** (`showProjectMenu`): tag submenu with "Filter by",
  then batch Focus/Unfocus, Later/Unlater, Snooze/Unsnooze applied to
  every TODO carrying that project's tag.
- No dedicated principle menu — principles render read-only (via
  `MarkdownRenderer`) inside a project's info popup, with no right-click
  actions of their own.

## Data Flow

### TODO Completion

```
1. User clicks checkbox
2. Handler calls processor.completeTodo()
3. Processor reads file, updates line (#todo → #todone @date)
4. Marks checkbox [x]
5. Triggers rescan (skipped for sourceFile items — not in the vault scanner's cache)
6. Scanner emits todos-updated
7. UI components re-render
```

If `todo.isHeader` and it has children, step 2 short-circuits: `completeTodo`
shows a notice and returns `false` instead of running steps 3-8 — see
"Header-Child Relationships" below.

### Priority Change

```
1. User right-clicks → "Focus"
2. ContextMenuHandler shows menu
3. Click calls processor.setPriorityTag()
4. Processor removes old priority, adds new one
5. Rescans file
6. Scanner emits todos-updated
7. Items reorder by new priority
```

## Data Model

```typescript
interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;           // 0-indexed line in file
  fingerprint: string;          // text stripped of tags/dates/markdown markers — stale line-number recovery
  text: string;                 // Full line text
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
  isHeader?: boolean;            // Header line (##)
  isSubheading?: boolean;        // Bold subheading label within a header block — not a task
  headerLevel?: number;
  parentLineNumber?: number;    // If this is a child item
  childLineNumbers?: number[];  // If this is a header with children
  sectionLabel?: string;         // Nearest heading/bold-subheading text, for orphan (non-child) items
  sectionLineNumber?: number;
  itemType?: 'todo' | 'todone' | 'idea' | 'principle';
  inferredFileTag?: string;
  mentions: string[];
  sourceFile?: string;           // Absolute path outside the vault, for repo-sourced items
}
```

```typescript
interface ProjectInfo {
  tag: string;
  count: number;
  lastActivity: number;
  highestPriority: number;
  hasFocusItems: boolean;
  colourIndex: number;
  // Repo-derived, present only when the tag matches a detected git repo
  localPath?: string;
  remote?: string;
  branch?: string;
  gitStatus?: string;
}
```

`lastSynced` is not a `ProjectInfo` field and is not in the note. It lives
in `WarpedTodoSettings.projectSyncState` (`data.json`), keyed by project
name, alongside the repo's local path — plugin bookkeeping the sidebar
doesn't currently surface. See `ProjectSyncManager`'s `ProjectSyncStateStore`.

## Priority System

Sort order is two-dimensional, not a single numeric scale: a `#focus` tier
(boolean) always sorts first, and within each tier `getPriorityValue()`
(`src/utils.ts`) breaks ties — `#focus` isn't one of its values, it's a
separate, higher-precedence check layered on top by `compareTodoItems`/
`compareWithEffectivePriority`.

**`getPriorityValue()` — 8 values, lower sorts first:**

| Tag                        | Value | Meaning                        |
|-----------------------------|-------|---------------------------------|
| `#today`                    | 1     | Time-sensitive, due today       |
| `#p0`                        | 2     | Highest priority                |
| `#p1`                        | 3     | High priority                   |
| `#p2`                        | 4     | Medium-high priority            |
| `#p3`                        | 5     | Medium-low priority             |
| `#p4`                        | 6     | Low priority                    |
| No priority tag              | 7     | Unmarked items (`#focus` alone included — it isn't checked here) |
| `#future`/`#snooze`/`#snoozed` | 8   | Snoozed/deferred items          |

**Then the `#focus` tier**, checked separately and first: items tagged
`#focus` (or, via `isEffectivelyFocused`, a header whose child carries
`#focus`) always sort above non-focused items, regardless of priority
value. An item with both `#focus` and a priority tag (e.g. `#focus #p0`)
sorts above other focused items by that priority value — the tag doesn't
change which of the 8 values it gets, it just wins the tier check first.

**Tag count breaks remaining ties**, descending (more tags = higher).

### Key behaviours

**`#focus` is a preference for the focus queue**, not a priority value. The `#focus` tag marks items as candidates for the immersive Focus Mode card — it's what you want to work on now. If no `#focus` items exist, focus mode falls back to the highest-priority active TODOs (with a hint shown on the card). If an item has both `#focus` and a priority tag (e.g., `#focus #p0`), the priority tag determines order within the focus queue.

**Header TODOs sort by the better of their own priority or their children's average.** `getEffectivePriority()` computes the average `getPriorityValue()` across active (non-snoozed) children, then takes `Math.min()` of that average and the header's own tag-based priority — whichever is better (lower) wins. This prevents high-priority standalone items from being buried below low-priority header blocks, and lets a header's own explicit tag override a weak child average when it's the better signal.

**Unprioritized items sort low.** Items without any priority tag get value 7 — after `#p4` (6) but before snoozed items (8). This encourages explicit prioritization.

### Immersive Focus Mode

A sidebar-replacing single-task surface. When toggled on, the content area (tag cloud, active list, summary) is replaced by a focus card showing one TODO at a time; the header — title, tab nav, eye icon — stays visible throughout, only its title text and the eye icon's colour change (see "Entry and exit" below). Done advances the queue; Skip rotates the active item to the back of the queue; the in-card **Exit focus mode** link restores the sidebar.

#### Entry and exit

- **Entry:** Eye icon in the tab nav, beside TODOs/Ideas. Single-click flips `focusModeActive` and re-renders.
- **Exit, restoring position:** "Exit focus mode" text link below the Done/Skip actions inside the focus card, or clicking the eye icon again. Sets `focusModeActive` to `false`, restores the prior tab and scroll position.
- **Exit, switching directly:** clicking the TODOs or Ideas tab button while focus is active exits focus and switches to that tab in one click — same as switching between any two normal tabs (`switchTab()` in `SidebarView.ts`). No position restore here, since the user picked an explicit destination.

The header chrome (title, tab nav, eye icon) stays visible in both states — only the content area swaps between the tab list and the focus card. The eye icon shows its normal colour when off and an amber pill when focus mode is on, the one intentional visual difference from how the other tab icons indicate "active."

#### Queue computation

Queue construction lives in `buildFocusQueue` (`src/utils.ts`). Pseudocode
(matches the real implementation, not the two-function split an earlier
version of this doc described):

```
candidates = activeTodos.filter(t =>
  !isSnoozed(t.tags) &&
  !t.isSubheading &&
  !(t.isHeader && t.childLineNumbers?.length > 0)  // header-with-children: children stand in for it
)

if candidates.empty:
  return { items: [], source: 'empty' }

if not options.forceFallback:
  focused = candidates.filter(t => hasTag(t.tags, '#focus'))  // direct tag only, not isEffectivelyFocused
  if focused.nonEmpty:
    return {
      items: focused.sort(compareInMainListWalkOrder).slice(0, limit),
      source: 'focus-tagged',
    }

return {
  items: candidates.sort(compareInMainListWalkOrder).slice(0, limit),
  source: 'priority-fallback',
}
```

Notes:

- **Children of headers are eligible candidates**, standalone — the focus
  card shows their parent header's text as context (`getFocusSourceHeading`).
  Only a header *with children* is excluded as its own entry, since its
  children represent it individually; a leaf header (no children) is a
  normal candidate.
- Snoozed items (`#future`, `#snooze`, `#snoozed`) and bold-subheading
  divider lines are excluded.
- The `focused` filter checks the item's own `#focus` tag directly — it
  does not use `isEffectivelyFocused` (that function, which also credits a
  header for a focused child, is used elsewhere: inside
  `compareInMainListWalkOrder`'s tier check and `compareWithEffectivePriority`).
- Sorting goes through `compareInMainListWalkOrder`, which resolves each
  item to its top-level ancestor and orders by `compareWithEffectivePriority`
  (focus-tagged path) or `comparePriorityOnly` (priority-fallback path,
  `respectFocusTier: false`) — so `#focus`-tagged items don't dominate when
  continuing into priority via "Continue with next priority task."
- `forceFallback: true` skips the curated `#focus` filter entirely. Used by the "Continue with next priority task" path.

#### State machine

```
[off] -- toggle on, #focus items exist --> [active, focus-tagged queue]
[off] -- toggle on, no #focus items, priority items exist --> [active, priority-fallback queue]
[off] -- toggle on, no active TODOs at all --> [active, empty state]
[active, focus-tagged] -- Done on last #focus item --> [active, completion state]
[active, completion state] -- Exit --> [off]
[active, completion state] -- Continue --> [active, priority queue (forceFallback)]
[active, priority-fallback] -- Done on last item --> [active, empty state]
[active, *] -- Exit (eye icon or in-card link) --> [off], restores prior tab/scroll
[active, *] -- click TODOs or Ideas tab --> [off], switches to that tab (switchTab(), no restore)
[active] -- Skip --> [active] (head rotates to tail; rotateQueue helper)
```

`FocusQueueState` (in `src/types.ts`) holds `{ items, source, inContinueMode }`. The state is rebuilt from scratch whenever the underlying TODO data changes (`todos-updated` event in the scanner invalidates `focusQueue` and re-renders). Skip is the only operation that mutates the in-memory queue without rebuilding.

#### Settings

| Setting | Default | Range | Purpose |
|---|---|---|---|
| `focusQueueLimit` | `1` | 1–5 | Max items shown at once. Slider in settings tab. |
| `focusModePersist` | `true` | — | Whether `focusModeActive` survives session restart. When `false`, `focusModeActive` is reset to `false` on plugin load. |
| `focusModeActive` | `false` | — | Persisted on/off state. Mutated by entry/exit handlers via the `setFocusModeActive` callback passed into the view. Not exposed as a user-facing setting. |

Priority fallback is always on (no setting). When the queue source is `priority-fallback`, the card renders the same as a `#focus` queue — the surface is intentionally identical so the user stays focused on the task, not the queue's provenance.

#### Class and file touchpoints

- `src/utils.ts`: `buildFocusQueue`, `getItemDate`, `comparePriorityOnly`, `compareWithEffectivePriority`, `compareInMainListWalkOrder`, `rotateQueue`, `isEffectivelyFocused`.
- `src/types.ts`: `FocusQueueResult`, `FocusQueueSource`, `FocusQueueState`, `ItemDate`, `ItemDateKind`.
- `src/SidebarView.ts`: `renderFocusCard`, `renderFocusItem`, `renderFocusCompletion`, `renderFocusEmpty`, `getActiveTodosForFocus`, `rebuildFocusQueue`, `getFocusVisibleTags`, `switchTab` (exits focus when the user picks TODOs/Ideas directly), plus `handleFocusEnter` / `handleFocusExit` / `handleFocusSkip` / `handleFocusContinue` / `handleFocusDone`.
- `main.ts`: `setFocusModeActive` callback that writes to settings and saves; load-time reset for `focusModePersist=false`.
- `styles.css`: `.sidebar-focus-mode-active` — a font-size scale (`1.4em`) on the content wrapper only. The header (title, tab nav, eye icon) is a separate element outside this class and is never hidden; `.focus-card-*` classes style the card itself.

#### Out of scope (v1)

- Custom keyboard shortcuts for Done/Skip/Exit (standard tab+Enter/Space works).
- Multi-entry mode for header TODOs (header + children = single entry).
- Animations on advance.
- Surrounding-context preview from the source file.
- Configurable font scale.

### Priority in projects

Projects track two priority-related fields:
- `highestPriority`: The best (lowest) priority value among all items in the project
- `hasFocusItems`: Whether any item in the project has the `#focus` tag

`hasFocusItems` is used as a sort tier — projects with focus items sort first.

## Event System

The scanner extends Obsidian's `Events` class and acts as the event bus:

```typescript
// Scanner emits
this.trigger('todos-updated');

// Components listen
scanner.on('todos-updated', () => this.render());
```

This decouples components — the scanner doesn't know about the sidebar, and consumers don't know about each other.

## Editor Suggestions

Two suggester classes provide inline editing assistance:

- **SlashCommandSuggest** (`src/SlashCommandSuggest.ts`): `/todo`, `/todos`,
  `/idea`, `/ideas`, `/today`, `/tomorrow`, `/callout` — triggered at
  line start.
- **AtSuggest** (`src/AtSuggest.ts`): `@`-triggered, two purposes in one
  suggester — dates (`@today`, `@tomorrow`, `@yesterday`, `@<date>`) and
  team mentions (`@<handle>`, resolved against `team.md` via
  `TeamManager`). There is no separate `DateSuggest` class.

## Projects Extension

Adds a Projects tab that treats a folder of git repos as projects: stable
repo facts (name, README title, stack, remote) sync into frontmatter on the
same per-project vault note `ProjectManager` already owns, and tagged
`#todo`/`#idea`/`#bug` items are
read from disk into an in-memory cache the sidebar displays directly (never
written into the note — see "Item list" above for why), both in the
Projects tab's own detail view and, interleaved with regular items, in the
TODOs/Ideas tabs — see "Project blocks in the TODOs/Ideas tabs" above.
The pre-implementation design docs this extension was scoped from
(`IDEAS.md`, `OUTLINE.md`) were removed from the repo root once the feature
shipped; this document is now the source of truth for it. Desktop only —
`ProjectScanner`/`ProjectSyncManager` need Node `fs`/`child_process`, so
`manifest.json` moves to `isDesktopOnly: true`.

### Data flow

```
1. Discover : ProjectScanner walks the base folder, finds repos,
              reads git facts (execFile git ...) per repo
2. Parse    : StructuredFileParser reads each repo's structured files
              for #todo/#idea/#bug items (contextual defaults, below)
3. Sync     : ProjectSyncManager merges the four stable frontmatter keys
              into the project note (item-only and volatile-git-fact
              changes never touch the note), updates its in-memory item
              cache, records repo path + lastSynced to data.json;
              calls onSynced(scanned)
4. Watch    : fs.watch on structured files + base folder triggers
              re-sync of the affected project; manual command forces
              a full rescan
5. Mutate   : sidebar action -> writes to sourceFile (Node fs) if a
              synced item, TodoProcessor + vault API if hand-typed ->
              cache update (synced) or vault rescan (hand-typed)
```

Step 5 reuses the existing line-number mutation algorithm (see
Design Decisions, "Line-Number Based Mutations") — only the I/O layer
changes based on whether `sourceFile` is set.

### Structured-file parsing (contextual defaults)

Explicit `#todo`/`#idea`/`#bug` tags always win. Untagged content falls
back to a default type by filename:

| Filename | Default type |
|----------|---------------|
| `BUGS.md`, `ISSUES.md` | `bug` |
| `TODO.md`, `TODOS.md` | `todo` |
| `IDEAS.md` | `idea` |

Item boundaries — selected by `###` heading presence, checked first:

1. **Header-per-item reports** — if the file has any `###` heading, each one nested under a `## Open`/`## Fixed`-style status section is one item; flat-list parsing is skipped for the whole file (covers this repo's own `BUGS.md`, including the incidental `-` bullets inside one bug's root-cause paragraph — `###` presence wins over those).
2. **Flat list items** — only when there are no `###` headings at all: top-level `- ...`/`- [ ] ...` lines, one item each (covers `peep/TODO.md`).

A file matching neither shape contributes nothing.

### Project note shape

```markdown
---
project: peep
title: peep
stack: ["Python"]
remote: https://github.com/robotpony/peep
cssclasses: warped-todo-project-note
---

#peep

## Guiding Principles #principles

## Overview

Notes you write here survive every sync untouched — the whole body does,
in fact: sync only ever touches the four frontmatter keys above.
```

Branch, git status, the repo's local path, and the last-synced time are
deliberately not in the note — they're volatile or machine-local, and
mirroring them into a vault under git meant a spurious commit every time a
tracked repo's working tree changed. Branch and status are read live from
the scan for the sidebar; local path and last-synced live in
`projectSyncState` in `data.json`.

No leading `# peep` heading — Obsidian's own file-title display already
shows it. `## Guiding Principles #principles` is scaffolded above
`## Overview` for a freshly-created note; add bullets underneath it and
they're picked up automatically as this project's principles, no per-line
tagging needed (see the Detail view's Guiding Principles section above).
An empty header with no children renders nothing.

Synced `#todo`/`#idea`/`#bug` items don't appear in the note at all — see
"Item list" above for where they live instead (the Projects sidebar's
detail view, sourced from `ProjectSyncManager`'s in-memory cache).

## Hugo Posts

A fourth sidebar tab, replacing a standalone Hugo-specific plugin this
project used to ship alongside it. Deliberately thin: read/navigate the
site's content, plus create a new post from the site's own archetype. No
draft/publish toggle — flipping `draft` in frontmatter and running `hugo`
stays a terminal job.

### Scope: vault-only, deliberately not Projects

**Posts assumes the Hugo site, if there is one, *is* the current vault —
one specific, known folder — and never looks anywhere else.** This is a
hard rule, not an implementation detail: `HugoScanner.ts` imports nothing
from `ProjectScanner.ts`/`ProjectMetadata.ts`, on purpose, and
`SidebarView.ensurePostsScanned` never touches `scannedProjects` or
`ensureProjectsSynced`.

The rule exists because of a real incident, not a hypothetical. An earlier
version of this feature found "the" Hugo site by filtering the Projects
extension's repo scan (`ProjectScanner.scan()`'s result) for a `"Hugo"`
stack tag, reusing detection Projects already had. That seemed reasonable —
until this plugin's own dev repo (`warped-command`) was temporarily seeded
with its own `hugo.toml` as a manual-testing fixture. The *real* Hugo site
being developed against (`w42`, opened as its own vault) had
`projectsBaseFolder` set to a broad folder covering many repos, including
`warped-command` — Projects' base-folder scan is deliberately broad, by
design, since tracking work across many external repos is the entire point
of the Projects extension. `locateHugoSite` just took the first
`"Hugo"`-tagged repo the scan produced, no picker, and `warped-command`
happened to sort earlier — so a throwaway test fixture in an unrelated repo
silently shadowed the real site in active, daily use, with no error: the
Posts tab just quietly showed the wrong site's four fixture posts instead
of the real site's ninety-plus.

The fix isn't "sort more carefully" or "pick the right one" — it's that
Projects' scope (arbitrary, multiple, external repos) and Posts' scope (one
specific vault) are fundamentally different, and sharing one detection
pass between them means either scope can leak into the other. So: Projects
keeps its broad scan, entirely unrelated to Posts now. Posts checks exactly
one folder — the vault's own root — and nothing else, ever. If that folder
doesn't have a Hugo config, there is no Hugo site as far as Posts is
concerned, full stop; it does not fall back to searching anywhere.

### Detection

`SidebarView.vaultBasePath()` resolves the current vault's own absolute
path (`FileSystemAdapter.getBasePath()` — same approach `main.ts`'s
`chooseVaultPath` file picker already used elsewhere in this codebase).
`ensurePostsScanned` calls `HugoScanner.readHugoSite` with exactly that
path — nothing scanned, nothing filtered, no repo list involved at all.

`readHugoSite` finds the actual config file (a candidate-list-in-priority-
order pattern, same shape as `ProjectMetadata.ts`'s `findReadme`/
`findChangelog` — `hugo.*` before `config.*`, matching modern Hugo's own
preference, and also falling back to the newer `config/_default/` layout
one directory level down, same filenames) and reads its `contentDir` via
`HugoParser.parseHugoConfig`, defaulting to `"content"` when unset. No
settings field drives any of this — there's nothing to configure, by
design; the vault root either has a Hugo config or it doesn't.

Note that `ProjectMetadata.ts`'s own `TECH_FILES`/`hasHugoConfigDir` still
tag a scanned repo `"Hugo"` for the Projects list's own Stack display —
that's fine, and unrelated. The rule above is specifically that *Posts*
must never read that tag or anything else Projects produces.

### Settings: Posts has its own, not Projects'

`postsEditorApp` (Settings → Posts → "Editor app") is a separate setting
from `projectsEditorApp`, read via its own `PostsSidebarOptions`/
`getPostsOptions()` closure (`main.ts`'s `postsOptions()`), not
`ProjectsSidebarOptions`/`getProjectsOptions()`. The two will often hold
the same app name in practice, but Posts must not read Projects' copy of
it — same reasoning as the scope rule above, applied to configuration, not
just detection.

### Data flow

```
1. Locate  : vaultBasePath() reads the current vault's own absolute path
             (FileSystemAdapter) — no scan, no repo list, just one path
2. Read    : readHugoSite(vaultBasePath) finds + parses that vault's own
             config for contentDir; null if it has none
3. Scan    : scanPosts(site) walks contentDir, parses each .md's
             frontmatter (title/draft/date/summary) + mtime
4. Render  : SidebarView.renderPostsTabContent — Drafts/All filter,
             grouped by top-level section folder, sorted by mtime
             within each group
5. Open    : row click -> resolveVaultFile relativizes the post's absolute
             path against vaultBasePath() and looks it up via the vault
             API — for Posts this should always resolve, since step 1-3
             never leave the vault to begin with. Opens via the normal
             vault API, same as any other note. The "doesn't resolve"
             branch (falls back to openProjectInApp, postsEditorApp) is a
             defensive fallback for an edge case, not a real path. Right-
             click always offers the external alternatives (Editor app, OS
             default, reveal) regardless of which the row click used.
6. Create  : "New post" (kebab menu) -> createPost writes
             content/<section>/<slug>.md from the repo's own archetype
```

No live file watcher on `content/` (unlike TODOs/Ideas' vault watchers or
Projects' whole-base-folder `fs.watch` in `ProjectSyncManager`) — scanning
is lazy (`ensurePostsScanned`, mirrors `ensureProjectsSynced`'s guard
shape), triggered on tab open and by the existing "Refresh" kebab action.
A dedicated watcher scoped to one repo's `content/` directory is a
reasonable follow-up, not required for v1.

### Data model

```ts
interface HugoSite {
  repoPath: string;    // absolute path to the repo root
  contentDir: string;  // absolute path: repoPath + its own contentDir config
}

interface HugoPost {
  title: string;      // frontmatter title, or filename when absent
  path: string;       // absolute path to the post's .md file
  section: string;    // first path segment under contentDir; "(root)" if none
  draft: boolean;     // frontmatter `draft`; defaults false when absent
  mtimeMs: number;    // file mtime — drives the "~Xd" label and within-group sort
  summary?: string;   // frontmatter description/summary, else the body's opening paragraph
}
```

### Row format matches the Projects list, plus tags

The Posts tab's row renderer (`renderPostRow`) deliberately mirrors
`renderProjectSummary`'s "list" variant rather than inventing its own
layout: bold name on the title line, a dot-joined meta line below it, an
optional excerpt (same `MarkdownRenderer.render` treatment
`renderProjectReadmeSummary` gives a README's opening paragraph), and the
filename on its own line at the bottom with a → to open it — same
placement as `.warped-todo-project-row-file`. The one addition Posts needs
that Projects doesn't is per-row tags (`draft` now, room for real Hugo
taxonomy tags later); those sit on the title line as small pills, reusing
this sidebar's existing tag-pill visual language rather than folding into
the dot-joined meta text.

The bottom-line filename shows the path relative to the post's own
*section* folder, not the full `contentDir`-relative path — the group
header above already establishes the section, and showing it twice was
redundant. This also disambiguates leaf-bundle posts, where the filename
alone is always `index.md`: Projects' equivalent line can just show
`noteFile.name` because there's exactly one file per project, but two
different leaf-bundle posts in the same section would otherwise both read
as "index.md."

### Archetype rendering (v1 scope)

Hugo archetypes are Go templates; `HugoParser.renderArchetype` does not
evaluate them — it substitutes the handful of tokens present in virtually
every Hugo starter's `archetypes/default.md` (`{{ .Name }}`, `{{ .Date }}`,
`{{ .TranslationBaseName }}`, and the ubiquitous
`{{ replace .Name "-" " " | title }}` idiom — substituted with the real
title text rather than reconstructed from the slug) and leaves anything
else untouched. No archetype file found (`archetypes/<section>.md`, then
`archetypes/default.md`) falls back to a minimal built-in template
(`title`/`date`/`draft: true`). New posts are always a single file at
`content/<section>/<slug>.md` — no leaf-bundle (`<slug>/index.md`) folder
creation. `_index.md` files are excluded from the post list (Hugo section-
index/list pages, not posts); an ordinary leaf-bundle `index.md` is still
included.

### No YAML/TOML dependency

Like `PlanParser.ts`/`StructuredFileParser.ts`, `HugoParser.ts` is pure and
hand-rolled — this plugin has no runtime dependencies, and a site config's
`contentDir` plus a post's `title`/`draft`/`date` frontmatter don't need a
real parser. `parsePostFrontmatter` mirrors `ProjectSyncManager.ts`'s
`parseFrontmatter` delimiter/line-split approach (typed, and TOML `+++`
frontmatter as well as YAML `---`), not reused directly since that one
returns an untyped `Map` built for the project-note sync use case.

## File Organization

```
warped-command/          # repo root — flat since the repo split (Phase 1a)
├── main.ts              # Plugin entry, initialization
├── src/
│   ├── TodoScanner.ts        # Vault + repo file scanning & caching
│   ├── TodoProcessor.ts      # File mutations (vault or external sourceFile)
│   ├── ProjectManager.ts     # Project grouping (tag- and repo-derived)
│   ├── ProjectScanner.ts     # Git repo discovery & git fact-gathering
│   ├── ProjectMetadata.ts    # Repo title/stack, "recently updated" date, PLAN.md summary
│   ├── PlanParser.ts         # PLAN.md → PlanSummary (phase/progress, detail view only)
│   ├── StructuredFileParser.ts # BUGS.md/TODO.md/etc. → ParsedProjectItem[]
│   ├── ProjectSyncManager.ts # Vault note sync, fs.watch, manual sync command
│   ├── ProjectItemMutator.ts # Mutates a ParsedProjectItem's source line/block
│   ├── HeaderBlockMover.ts   # Multi-line block-move (Phase 6 Case 1)
│   ├── HugoParser.ts         # Pure: Hugo config/frontmatter parsing, archetype rendering
│   ├── HugoScanner.ts        # Hugo site detection, post scanning, post creation (fs)
│   ├── NewHugoPostModal.ts   # "New post" title + section prompt
│   ├── SidebarView.ts        # TODOs sidebar UI
│   ├── ProjectsSidebarView.ts # Projects sidebar UI
│   ├── ContextMenuHandler.ts # Right-click menus
│   ├── SlashCommandSuggest.ts # / commands
│   ├── AtSuggest.ts          # @ mentions and dates (no separate DateSuggest.ts)
│   ├── TeamManager.ts        # Team file parsing
│   ├── MoveTargetModal.ts    # File picker
│   ├── TabLockManager.ts     # Tab lock buttons
│   ├── HeaderSortExtension.ts      # CodeMirror extension
│   ├── HeaderChecklistExtension.ts # CodeMirror extension
│   ├── SlackConverter.ts     # Markdown → Slack mrkdwn
│   ├── NotionConverter.ts    # Markdown → Notion-friendly
│   ├── utils.ts              # Shared helpers
│   └── types.ts              # Interfaces & types
├── styles.css           # Plugin styles
└── manifest.json        # Obsidian plugin manifest
```

## Design Decisions

### Event-Driven Updates

Rather than a centralized state management library, components communicate through events. This keeps the codebase simple and leverages Obsidian's built-in event system.

### Line-Number Based Mutations

Items store their exact line numbers for precise file updates. After any mutation, the file is rescanned to maintain accuracy (line numbers can shift).

### Debounced Scanning

File watching uses 100ms debouncing to prevent cascading scans when files change rapidly.

### DOM-Based Rendering

All rendering uses DOM methods (`createEl`, `appendText`) rather than innerHTML to prevent XSS vulnerabilities.

### Header-Child Relationships

Header TODOs (e.g., `## Task Name #todo`) can have child list items. The
header itself has no checkbox and `completeTodo` refuses to complete one
directly (shows a notice instead) — completing used to cascade to every
child from a single click, and that made accidental bulk-completion too
easy. Children are ticked individually; the whole block disappears from
the active list automatically once every live child is done (see
`isActiveTodo` in `SidebarView.ts`).

### No New Runtime Dependencies

Git facts use `child_process.execFile` (matching `warped-gdrive`'s `DriveProvider.ts` and its existing `rclone` pattern) instead of shelling out to an external tool like `p` — `git` itself is the only assumption. File watching uses native `fs.watch` rather than adding `chokidar`. Frontmatter is hand-parsed/generated the same way `warped-hugo`'s `src/utils.ts` already does it, no YAML library added. Both are sibling repos post-split, not paths in this one. Consistent with how the rest of this repo avoids dependencies where a small amount of native code covers the need.

### Delimited Sync Regions

`ProjectSyncManager` regenerates only a marked block in each project note, plus a defined set of frontmatter keys, rather than the whole file. A full-file regenerate is simpler but would silently discard anything written outside the synced items — including the `## Overview` section `ProjectManager`'s template already creates. Considered and rejected for that reason.

## Extension Points

The architecture supports extension through:

1. **New item types**: Add to scanner parsing, processor methods, and UI rendering
2. **New slash commands**: Add to `SlashCommandSuggest`
3. **Context menu actions**: Extend `ContextMenuHandler`
4. **New sidebar tabs or sections**: Add render methods to `SidebarView`
