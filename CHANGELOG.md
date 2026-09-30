# Changelog

All notable changes to the ␣⌘ Warped Command plugin will be documented in this file.

## [0.53.0] - 2026-09-29

### Added — Text filter for the Posts tab

- Posts now has a filter input, mirroring the Projects list's filter box:
  matches against post title and section, combining with the existing
  Drafts/All pill rather than replacing it.

## [0.52.0] - 2026-09-29

### Added — Posts is now vault-scoped, with its own settings

- Posts no longer detects "the" Hugo site by reusing the Projects
  extension's repo scan. It now checks only the current vault's own root
  for a `hugo.toml`/`config.yaml`/etc. (or `config/_default/`) — nothing
  else, ever.
- Fixes a real incident this surfaced: since Projects' base-folder scan is
  deliberately broad (it tracks arbitrary repos on disk, by design),
  another repo under that scan with its own Hugo config — even this
  plugin's own dev repo, briefly seeded with a test fixture — could sort
  earlier and silently shadow the *real* site in active, daily use, with
  no error shown.
- New setting: Settings → Posts → "Editor app," independent of the
  Projects section's "Editor app." Posts no longer reads
  `projectsEditorApp` or anything else from Projects' settings.
- See DESIGN.md's Hugo Posts section, "Scope: vault-only, deliberately not
  Projects," for the full rationale.

## [0.51.0] - 2026-09-29

### Changed — Posts row rework, opens in Obsidian

- The meta line (relative edit age · path) used a different font-size
  unit, was missing the top gap below the title line, and didn't fade the
  "updated" chunk the way Projects' equivalent line does — all
  unintentional drift from `.warped-todo-project-row-meta`/
  `-row-updated`, now matched exactly.
- The filename moved to its own line at the bottom of the row (with a →
  arrow to open), matching where Projects puts its note-file line, instead
  of sitting in the meta line.
- Posts rows now show a short excerpt below the meta line too, the same
  way Projects shows a repo's README opening paragraph — from the post's
  frontmatter `description`/`summary`, falling back to its own opening
  paragraph when neither is set.
- Clicking a post now opens it in Obsidian's own editor (when the post
  resolves to a vault file — the common case, since the Hugo site itself
  is usually the vault) instead of always shelling out to the configured
  editor app. Right-click still covers the alternatives: Open in Editor,
  Open in default app, Reveal in Finder.

## [0.50.0] - 2026-09-29

### Added — Posts tab (Hugo)

- A new Posts tab lists a Hugo site's content, grouped by content section
  (folder), defaulting to a Drafts filter with an "All" toggle. The Hugo
  site is auto-detected among the repos already found under the Projects
  base folder (any repo with a `hugo.toml`/`config.yaml`/etc. at its root)
  — no separate setting to configure.
- Each row shows the post's title, a DRAFT badge, a compact relative edit
  age ("~2d"), and its path relative to the site's `contentDir`. Clicking a
  row opens the file in the configured Projects editor app; right-click
  offers "Reveal in Finder."
- "New post" (kebab menu, while on the Posts tab) creates
  `content/<section>/<slug>.md` from the repo's own Hugo archetype
  (`archetypes/<section>.md`, falling back to `archetypes/default.md`, then
  a minimal built-in template), and opens the new file.
- Read/navigate + create only — no draft-toggle mutation from the sidebar
  (publishing stays a terminal operation), and no live file watcher yet;
  the tab scans on open and on the existing "Refresh" action. See
  DESIGN.md's Hugo Posts section for the full v1 scope.
- Fixed: a race between the Projects and Posts tabs' lazy-sync calls (both
  fire from `onOpen`) could leave Posts reporting "No Hugo site found" even
  though the site was there — a concurrent caller now awaits the in-flight
  sync instead of bailing out with stale/empty data.
- Hugo detection now also recognizes the `config/_default/hugo.toml` (or
  `config.yaml`/etc.) layout, not just a root-level config file.

## [0.49.0] - 2026-08-31

### Added — Plan section in the Projects detail view

- A repo's `PLAN.md` now surfaces read-only in the per-project detail
  view, below Guiding Principles. For a phased-checklist `PLAN.md` it
  shows a progress strip ("Phase 3 of 7 · 47 of 155 done"), the current
  phase heading, and that phase's open `- [ ]` items rendered verbatim.
  Every `PLAN.md` also gets a collapsible "Full plan" that renders the
  whole file, so narrative-style plans (no checkboxes) still have a home.
- `PLAN.md` is a reference document, not an item source: nothing from it
  feeds the TODOs/Ideas tabs, the project note, or the sync pipeline, and
  it is never written back to.
- The README excerpt and the new Plan section each get a "FILE →" link
  that opens the source file in the OS default app.
- `PLAN.md`'s mtime is now the last fallback for a repo's "Recently
  updated" date, after `CHANGELOG.md` and `README.md`.
## [0.48.4] - 2026-09-01

### Changed — Popup notice copy standardized

A pass over every `showNotice` call. The branding and the "See console for
details" pattern were already consistent; the tone, punctuation, and
wording had drifted.

- Synced project-item actions (Focus / Later / Snooze and the checkbox on a
  repo-matched project row) now show the same confirmation notice the
  identical action on a vault item shows. Previously they were silent on
  success, so the sidebar gave different feedback depending on where the
  row came from.
- Failures now read "Couldn't X. See console for details." everywhere,
  instead of a mix of "Failed to X" and "Couldn't X".
- Every notice ends with a period. Dropped the exclamation marks that only
  appeared on the vault todo/idea confirmations ("TODO marked as
  complete!" → "TODO completed.").
- Wording fixes: "Unlatered N TODOs" → "Cleared later on N TODOs";
  "marked as incomplete" → "reopened"; the "Send to project" notice shows
  `~/projects/foo/TODO.md` instead of the full absolute path; "Copied as
  Slack markdown" → "Copied as Slack Markdown", matching the command name.
- Batch-operation notices use the shared `pluralize` helper.
- No behaviour change beyond the added synced-item confirmations.

## [0.48.3] - 2026-09-01

### Changed — Extracted the "project has active synced work" filter

Both the TODOs tab's tag-cloud pill counts (`renderProjects`) and its
interleaved project blocks (`buildProjectBlocks`) decided which of a
repo-matched project's synced items count as active work, with the same
`!completed && <types>` filter written out twice. They drifted apart once
already: the pill count included `#idea` items the list would never render,
so a pill filtered to nothing on click (fixed in [0.47.2], with no
regression test).

- Added `activeSyncedItems(items, itemTypes)` and the
  `TODO_TAB_SYNCED_ITEM_TYPES` constant to `ProjectsSidebarView.ts` (the
  ItemView-independent, unit-testable helpers module). Both call sites now
  route through them, so the cloud and the list it filters can't be scoped
  differently by accident.
- Added `src/__tests__/activeSyncedItems.test.ts` covering the completed
  filter, the `#idea` exclusion under the TODOs tab, and the Ideas tab's
  own `["idea"]` selection.
- `BUGS.md` now keeps fixed entries in a `## Fixed` section (trimmed to a
  one-line resolution with the shipping version) instead of deleting them
  outright, so recent fix history stays visible in one place.
- No behaviour change.

## [0.48.2] - 2026-08-26

### Changed — README restructured to lead with core features

- Rewrote the tagline and added a features list up top (tag-based
  tracking, Focus Mode, Header TODOs, Mentions, Projects) so the plugin's
  two main surfaces, vault tags and cross-repo Projects sync, are visible
  before Quick Start instead of only showing up 100+ lines in.
- Moved the Projects section earlier, ahead of the Editor shortcuts and
  Commands and hotkeys reference tables.
- Folded "Automatic file tags" into "Organize with tags" as a sub-topic
  instead of its own top-level section.
- Trimmed the Contents list to top-level sections only; GitHub's own
  file outline covers the rest.
- Moved Troubleshooting and Known limitations to a new
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md), linked from Installation.
- Shortened the Insert/Completion date format note in Editor shortcuts,
  dropping the sorting edge case (still documented in the plugin's
  settings tab).

## [0.48.1] - 2026-08-26

### Changed — Completion date format uses the same preset picker as Insert date format

- "Completion date format" is now a dropdown of the same presets as
  "Insert date format" plus a custom moment.js field, instead of a bare
  text box. Default stays `YYYY-MM-DD`.
- Fixed `replaceTodoneWithTodo` (reopening a completed item) to strip the
  `#todone @date` stamp regardless of its format, instead of only
  matching a hardcoded `YYYY-MM-DD` shape. Previously, picking any other
  completion date format and then unchecking a completed item would
  leave the stale `@date` text stranded in the line.
- Completion-date sorting (newest-first among completed items) still
  only recognizes `YYYY-MM-DD` and falls back to original order for any
  other format; the setting's description now says so.

## [0.48.0] - 2026-08-26

### Added — Insert date format setting

- @today, @tomorrow, @yesterday, @date, and /today, /tomorrow now format
  the date they insert using a new "Insert date format" setting, separate
  from the existing completion-stamp format. Defaults to `dddd, MMMM Do`
  ("Tuesday, July 10th") instead of `YYYY-MM-DD`. The settings tab offers
  a handful of presets plus a custom moment.js format field.
- The `#todone @date` completion stamp keeps its own "Completion date
  format" setting (renamed from "Date format"), unchanged and still
  `YYYY-MM-DD` by default, since due-date sorting and filename-date
  parsing depend on it staying in that shape.
## [0.47.4] - 2026-08-30

### Fixed — Project notes no longer churn the vault's git history on every sync

- A repo-matched project note's frontmatter carried `branch`, `gitStatus`,
  `repo`, and `lastSynced`. Those are transient (branch and status flip
  every time you edit or commit in the tracked repo), machine-local (`repo`
  is an absolute path), or pure bookkeeping. Mirrored into a vault under
  git, they produced a spurious commit on the note whenever a tracked
  repo's working tree changed state, and frontmatter merge conflicts
  across machines.
- Frontmatter now carries only `project`, `title`, `stack`, and `remote` —
  all stable, human-meaningful facts that change on a rename, a
  README-title edit, a stack change, or a remote repoint. The sidebar's
  Projects detail view is unchanged: it already renders branch, status,
  path, and stack from the live scan, not the note.
- `repo` and `lastSynced` moved to plugin data (`data.json`), keyed by
  project name, saved on a debounce. `branch`/`gitStatus` are read live and
  never persisted.
- One-time migration: the first sync that touches an existing project note
  strips the four old keys. After that, an unchanged project's note stops
  appearing in the vault's git diff entirely.
- The write guard is now semantic (does an owned key actually differ?)
  rather than byte-equality, so sync no longer rewrites a note over the
  user's own frontmatter formatting.

## [0.47.3] - 2026-08-22

### Changed — Help note's intro uses a callout instead of a heading

- The first-use help note's "live example, not documentation" intro is
  now an Obsidian `> [!warning]` callout instead of a plain H1 + paragraph,
  so it stands out visually against the real content underneath. A couple
  of trailing em-dashes in the note's body were also tightened to plain
  punctuation.

## [0.47.2] - 2026-08-22

### Fixed — Tag filter shows nothing for a project with only non-todo synced items

- The TODOs tab's tag cloud pill count (`renderProjects`) counted a
  linked project's synced items by any type (`todo`/`idea`/`bug`), but
  the list underneath (`renderActiveTodos` → `buildProjectBlocks`) only
  shows `todo`/`bug` items. A project whose repo-linked items are all
  typed `idea` (or otherwise not `todo`/`bug`) showed a live, clickable
  pill that filtered down to "No TODOs matching #tag" every time.
- Scoped the pill's synced-item count to `itemType === "todo" || "bug"`,
  matching `buildProjectBlocks(["todo", "bug"])`'s own scope, so a pill
  only advertises items the TODOs tab can actually surface.

## [0.47.1] - 2026-08-22

### Changed — "Send selection to project" is now also on the right-click menu

- The command palette was the only way to trigger "Send selection to
  project," easy to miss. It now also appears on the editor's right-click
  menu, next to "Copy as Slack" / "Copy as Notion," under the same
  condition: a project note (has `repo` in frontmatter) with an active
  selection.
- The frontmatter/repo lookup and the modal-open logic are now shared
  (`utils.getProjectRepoForFile`, `openSendSelectionToProjectModal`)
  between the command and the menu item, so the two triggers can't drift
  out of sync.

## [0.47.0] - 2026-08-22

### Added — "Send selection to project" command

- Select text in a project note (one with `repo` in frontmatter) and run
  "Send selection to project" to append it as a new open `#todo` item in
  that project's `TODO.md`, prompted for a title first. Only available
  from project notes; there's nowhere to send a selection from a note with
  no linked repo.
- `ProjectQueue.appendQueuedTodo` picks the append format (a `- [ ]`
  bullet, or a bare `##` heading) based on whichever shape the target
  `TODO.md` is already using (`StructuredFileParser.hasHeaderReportShape`,
  now exported), not a fixed format — appending in the wrong shape would
  silently produce an item the parser can't see. Creates `TODO.md` if the
  project doesn't have one yet.

## [0.46.1] - 2026-08-22

### Changed — sidebar tab order

Reordered the sidebar's header buttons to TODOs, Projects, Ideas, Focus
(was TODOs, Focus, Ideas, Projects). No behaviour change, just the visual
order the buttons render in.

## [0.46.0] - 2026-08-22

### Added — first-use help note and richer empty states

- A `Warped Command Help.md` note is created in the vault (and opened) the
  first time the plugin runs, and reopened on any later minor version bump.
  It's a live example, not documentation: real `#todo`/`#idea` lines the
  user can check off and edit directly. `HelpNoteManager` creates it once
  and never overwrites it, so edits and completed practice items survive
  future reopens. Reachable any time via the new Help section at the
  bottom of Settings → "Show onboarding doc again".
- Empty states in the TODOs and Ideas tabs, the focus tag cloud, and the
  Projects list now show a one-line example alongside the existing message
  (e.g. "Try: - [ ] Review the API spec #todo").
- The "GitHub" links in the About modal and Settings now point directly at
  `README.md` instead of the repo root.

## [0.45.3] - 2026-08-22

### Fixed — header sort button no longer no-ops on a second press

Pressing a header's sort button a second time re-ran the identical sort
and just reported "Items already sorted." Now it reverses the order
instead: `TodoProcessor.sortHeaderChildren` tracks the last direction
applied per header and alternates between ascending and descending on
each press.

## [0.45.2] - 2026-08-22

### Fixed — some ideas couldn't be completed

A child idea — one nested under a `## Something #idea` header, like a
sub-bullet with no `#idea`/`#ideas`/`#ideation` tag of its own — could
never be checked off. Reported with a real example: a `## Ideas #ideas`
header with `- [ ] HUGO food site` under it and `- [ ] work on EAT WELL`
nested under that.

- `TodoProcessor.completeIdea`'s validation required the item's own line
  to carry an explicit idea tag before writing. Child ideas never carry
  one — they inherit it from the header — so every completion attempt
  threw and got refused. Fixed with the same `isChildItem` exception
  `TodoProcessor` already uses for TODOs.
- The sidebar checkbox made the failure invisible: clicking it flips the
  native checkbox to checked immediately (before any of this plugin's
  code runs); when the write then failed, nothing reset it back. The row
  looked completed while the file underneath was untouched. Fixed: a
  failed completion now flips the checkbox back to match reality.
- `TodoScanner` also never stopped tracking a checked child idea (unlike
  top-level ideas, which drop out of the list once checked and their tag
  is stripped) — checking one via a native `[x]` edit would leave it
  showing up in the Ideas list forever. Now skipped on scan, same as
  top-level completed ideas.
- Added `completeIdea.test.ts` covering the top-level case, the
  newly-fixed child case, and confirming the original "line was actually
  modified externally" refusal still works.

## [0.45.1] - 2026-08-22

### Fixed — dangling references to deleted design docs

`PLAN.md`, `OUTLINE.md`, and `IDEAS.md` (the original Projects-feature
planning trio) were deleted by accident on 2026-08-17, in a commit whose
stated purpose was unrelated (`install.sh`'s banner text). `BUGS.md` was
lost in the same commit. Nobody caught it because nothing in the working
plugin depends on those files at runtime — only comments cited them.

- Scrubbed roughly 20 "see PLAN.md's Phase N" / "see OUTLINE.md" / "see
  IDEAS.md" citations across `src/` and its tests. Where the citation was
  the only content, it's just gone; where it sat next to real explanation,
  the explanation stayed and the dead pointer was dropped.
- Along the way, fixed two comments that had gone stale independently of
  the deleted docs: `StructuredFileParser.ts` and a `ProjectItemMutator`
  test both still said the `headerNested` block-move was "not implemented
  yet" — it's been implemented (`HeaderBlockMover.ts`) and tested for a
  while.
- Removed the unrelated Focus Canvas `PLAN.md` (a prototype plan, unrelated
  to the above) — its prototype script stays at `prototype/focus-canvas.mjs`
  for later.
- Removed unused `@typescript-eslint/eslint-plugin` /
  `@typescript-eslint/parser` devDependencies — no `.eslintrc`/`eslint.config.*`
  or lint script has ever used them in this repo.
- Removed 13 dead CSS selector blocks with zero references in `src/`:
  leftovers from a removed LLM "Define" feature, pre-kebab-menu sidebar
  buttons, and pre-redesign summary/count styling.
- Reworded `src/shared/README.md`, which still described "the Obsidian
  plugins monorepo" and "all three plugins" — stale since the flatten to
  a single plugin.

## [0.45.0] - 2026-08-21

### Removed — TODONE archive log

Completing a TODO already marks it in place (`#todo` → `#todone @date`,
checkbox checked), so the separate archive-file copy was redundant.

- Removed the TODONE archive file feature: `TodoProcessor.completeTodo()`
  no longer appends a copy of the completed line to a log file. It still
  updates the source line in place; that behaviour is unchanged.
- Removed the now-pointless `defaultTodoneFile` and
  `excludeTodoneFilesFromRecent` settings, their settings-tab UI ("Default
  TODONE file", "Exclude TODONE archive from lists"), and
  `TodoScanner.setExcludeFiles()` (its only caller).
- Removed the Summary section's "open TODONE file" arrow link — there's
  no longer a single file for it to point at.
- "Completed" counts and Done velocity (today/week/month) are unaffected:
  they were always computed by scanning `#todone` tags vault-wide
  (`TodoScanner.getTodones()`), not from the archive file.
- If you had "Exclude TODONE archive from lists" on, your old archive
  file (default `todos/done.md`) is left on disk untouched, but it's no
  longer excluded from scans — any `#todone` items still in it now count
  toward Completed/Done-velocity stats.

## [0.44.0] - 2026-08-21

### Changed — Settings panel cleanup

A review of the whole settings tab (naming, ordering, missing fields, how
fields are represented) turned up two real bugs and several
inconsistencies.

- **Removed "Project list limit".** It was stored, threaded through
  `TodoSidebarView`'s constructor, and exposed in settings, but never
  read anywhere after that — the tag cloud it claimed to control is
  actually capped by a hardcoded constant, unrelated to this setting.
  Rather than wire it up to a feature it never controlled, it's gone:
  `focusListLimit` removed from `WarpedTodoSettings`.
- **Moved "Active TODOs limit" into the TODOs section.** It's a real,
  working setting (caps the TODOs tab's active list) that was filed
  under "Projects" for no reason — it has nothing to do with the
  Projects feature.
- **Renamed settings for clarity:**
  - "Exclude folders from projects" → "Exclude folders from
    auto-tagging" and "Projects exclude directories" → "Exclude repo
    directories from scan" — same two settings, previously worded as
    near-duplicates despite controlling different systems (vault
    tag-inference vs. repo scanning). "Folders" now consistently means
    vault-relative, "directories" the repo-scanning side.
  - "Projects sidebar" → "Open Projects tab", "Auto-open Projects
    sidebar" → "Auto-open Projects tab" — stale terminology from when
    Projects was a separate sidebar, not a tab; also fixes the
    "Toggle Projects Sidebar" command's display name (its `id` is
    unchanged, so existing hotkey bindings survive) and two code
    comments quoting the old button text.
  - Settings-tab-only CSS classes `sc-team-*` (stale "Space Command"
    branding, predating the rename to Warped Command) → `warped-todo-team-*`.
- **Added missing settings:** "Priority tags" (`priorityTags` — which
  tags are excluded from automatic project-tag inference) and "Exclude
  TODONE archive from lists" (`excludeTodoneFilesFromRecent`) were real,
  actively-used settings with no UI; only editable by hand-editing
  `data.json` before now.
- **"Projects scan depth" is now a slider** (0–6), matching "Focus queue
  limit"'s existing bounded-range treatment instead of free text with
  manual parsing — it was the odd one out among this plugin's
  loosely-bounded numeric settings.

## [0.43.0] - 2026-08-21

### Added — Folder/file pickers and wider text fields in Settings

- Added a native folder/file picker button to every settings field that
  stores a single vault-relative path: Default TODONE file, Default
  projects folder, Team file path. Matches Projects base folder's own
  existing picker button, but relativizes the OS dialog's result against
  the vault's own base path (`FileSystemAdapter.getBasePath()`) rather
  than storing an absolute path — a pick outside the vault is rejected
  with a notice. New `chooseVaultPath()` in `main.ts`.
- Every text-input field in the settings tab is now 125% of its own
  rendered width, clamped to whatever room its row actually has (never
  overflows or wraps). File/folder-path fields read cramped at Obsidian's
  default input width. New `widenTextInputs()`, run once at the end of
  `display()`; measures the real rendered width rather than assuming a
  fixed pixel default.

## [0.42.0] - 2026-08-21

### Added — Default projects sort setting

The Projects list now opens sorted by Recently updated instead of the
original tracked-items-first ordering, and which sort it opens with is
configurable.

- New Settings → Projects → "Default projects sort" dropdown
  (`WarpedTodoSettings.defaultProjectsSortKey`), listing the same options
  as the list's own sort menu. Seeds `TodoSidebarView`'s `projectsSortKey`
  once, in the constructor — picking a different sort from the list's own
  sort button stays session-only and doesn't write back to this setting.
- `DEFAULT_SETTINGS.defaultProjectsSortKey` ships as `"recentlyUpdated"`.
- Renamed the sort option previously labelled "Default" to "Active items
  first" (`ProjectSortKey` value `"default"` → `"activeFirst"`) — now that
  a real "Default projects sort" setting exists, a sort option also
  called "Default" read confusingly next to it.

## [0.41.0] - 2026-08-21

### Added — README excerpt in the Projects list row

Follow-up to 0.40.0's row redesign, from the same review.

- Each list row now shows the repo's README excerpt (same
  `renderProjectReadmeSummary` the detail view uses), below the meta line
  and above the filename+arrow line. Omitted, not guessed, when the repo
  has no README/opening paragraph.
- Recently updated moved from floating right on its own
  (`justify-content: space-between`) into the same left-aligned,
  dot-joined run as branch+status and item counts — reported as not
  fitting visually on its own; now delineated the same " · " way the rest
  of the line already is.

## [0.40.0] - 2026-08-21

### Added — Projects list: sort, recently-updated date, redesigned row

The Projects tab's list view wrapped badly once a repo name was long
enough to compete with the filename for space on the title line
(reported via screenshot). Reworked the row layout and added the sort
and recently-updated features that came out of that review.

- **Row layout**: three lines now — name; branch+status (one monospace
  chunk, e.g. `main M?`, matching the detail view's own treatment) and
  item counts on the left, Recently updated on the right; filename+arrow
  on their own line at the bottom, right-aligned. The title line is
  name-only, so a long repo name wraps on its own instead of fighting the
  filename for width.
- **Recently updated**: new `getRepoLastUpdated` (`ProjectMetadata.ts`)
  reads a repo's `CHANGELOG.md` mtime, falling back to `README.md`'s —
  only touched on a real versioned change, not every incidental edit, and
  no new `git` call per repo. Falls back further to the vault project
  note's own mtime if the repo has neither
  (`ProjectManager.applyNoteLastUpdatedFallback`). New `ProjectInfo.lastUpdated`
  field; threaded through `ScannedProject`.
- **Sort**: a sort icon beside the filter box opens a checkmarked menu —
  Default (tracked-items first, then name; the list's original implicit
  sort, kept as an explicit option), Name (A–Z), Most items, Needs
  attention (dirty git status or an open bug), Recently updated. New
  `sortProjectRows`/`PROJECT_SORT_OPTIONS` (`ProjectsSidebarView.ts`).
  Session-only, like the filter text box — resets to Default on restart.
- Test-only: `FakeTFile`/`FakeVault` (`src/__tests__/stubs/fakeVault.ts`)
  now track a settable mtime, needed to test the lastUpdated fallback
  chain.

## [0.39.0] - 2026-08-21

### Added — Guiding Principles in the Projects detail view

`#principle`/`#principles` items now surface in the Projects tab's detail
view, not just the project-info popup and Stats — a Guiding Principles
section renders them below the header and readme summary, above the
TODOs/Ideas/Bugs list.

- New `getProjectPrinciples` helper (`ProjectsSidebarView.ts`) resolves a
  project's principle items: matched by explicit tag, by
  `inferredFileTag` (principles written in the project's own note), or as
  children of a matched `#principles`-tagged header block — a header's
  children no longer need to repeat the tag themselves. The project-info
  popup's own Principles section now runs through the same helper,
  picking up header-block children it previously missed.
- `renderProjectPrinciplesSection` (`SidebarView.ts`) renders the section
  verbatim from source: `buildProjectPrincipleBlocks` joins a
  `#principles`-tagged header's own line with its children into one
  markdown block, rendered in a single pass so it reads exactly as
  written — no synthesised title, and the original list markup (numbered,
  bulleted, or plain) comes through as-is instead of being reconstructed
  into a `<ul>`. Renders nothing when a project has no principles yet.
- Both project note templates (`ProjectManager.createProjectFile`,
  `ProjectSyncManager.syncProject`) now scaffold a
  `## Guiding Principles #principles` section above `## Overview` — items
  added underneath it are picked up automatically, no per-line tagging
  needed.
- New CSS: `.warped-todo-project-principles`,
  `.warped-todo-project-principles-block` (with scoped heading/list
  resets to match the sidebar's compact scale).

## [0.38.7] - 2026-08-21

### Fixed

- The Ideas/Bugs/TODOs task groups in the Projects detail view still had a
  boxed background after the previous round of fixes (reported via
  screenshot) — that round only pulled the README blurb out of the
  Project/Stack/Status card, it didn't touch the task groups' own
  matching background further down. Removed it: the boxed-card look reads
  right once, for the summary card, but wrong repeated per group down a
  whole task list. Groups keep their padding/spacing, just with nothing
  behind them now — the Project/Stack/Status card is the only boxed
  background left in this view.

## [0.38.6] - 2026-08-21

### Fixed — clicking a project note link didn't always switch the sidebar

- Opening a repo-matched project's note from a header/orphan-section arrow
  in the TODOs/Ideas tab worked, and jumped the sidebar to that project's
  Projects detail view, only when the note *wasn't already open*. If it
  was already open (in another tab, or already the active file), the click
  did nothing to the sidebar — it stayed wherever it was, disconnected
  from what the editor was now showing.
  Root cause: `openFileAtLine` reuses an already-open leaf rather than
  opening a new one, and Obsidian doesn't reliably fire
  `active-leaf-change`/`file-open` for navigating to a file that's already
  showing — the event the sidebar's auto-follow relied on to notice.
  A second, related bug compounded it: the auto-follow's own "nothing to
  do" check compared only the file path and the sidebar's internal
  project/mode state, never the *visible tab* — so even on a genuine
  event, if the user had manually switched back to Todos/Ideas while the
  project note stayed open, re-clicking its link left the tab unchanged.
  Fixed both: note-opening clicks in the sidebar now force a direct
  resync after navigation settles, instead of depending on the event, and
  the resync's own "already in sync" check now requires the Projects tab
  to actually be active too.

## [0.38.5] - 2026-08-21

### Changed — README rewritten for newcomers, plus a real LICENSE

- README overhauled for someone exploring the plugin cold: a "What it
  solves" section leads with a concrete before/after example instead of a
  bare feature list, a table of contents (the doc runs past 300 lines
  now), and new Installation, Troubleshooting, Known limitations, and
  Releases sections. Fixed two lingering bugs while at it: the
  manual-install instructions pointed at
  `.obsidian/plugins/space-command/` instead of the actual `warped-todo`
  plugin id, and the license link pointed at `../LICENSE`, one directory
  above the repo, which never existed.
- Added a real `LICENSE` file (MIT). `package.json` has claimed MIT since
  the start, but nothing backed it up, so GitHub showed the repo as
  unlicensed.
- Added `CONTRIBUTING.md` and `.github/ISSUE_TEMPLATE/` (bug report and
  feature request forms) for anyone opening an issue or PR.

### Fixed — display name history wasn't documented

The plugin has been renamed twice: `Space Command` → `Warped Todo` at
0.25.4 (documented at the time), then `Warped Todo` → `Warped Command` at
0.35.0 (the "Phase 1a: rename this repo to warped-command" commit), which
never got a changelog entry. This file's own header still said "Space
Command" until now. The plugin id (`warped-todo`) is unchanged through
both renames and stays that way; only the display name and repo moved.

### Removed — lingering "live embeds" references

The embed feature (`{{focus-todos}}` and friends) was removed back in
0.22.0; the cross-file tracking it was reaching for ended up covered by
the Projects tab instead, added much later. The description in
`manifest.json` and the GitHub repo description still advertised "live
embeds" years after the feature was gone; both updated. Also removed two
orphaned CSS rules (`.embed-header`, `.embed-refresh-btn`) with no
remaining references in `src/`, and a stale code comment in
`TodoScanner.ts` that still mentioned embeds reading scan data.
`NotionConverter.ts`'s embed-stripping (Obsidian's native `![[file]]`
syntax) is unrelated and untouched.

## [0.38.4] - 2026-08-21

### Fixed — Project detail card, round two

- The Project/Stack/Status card sat noticeably narrower than the TODO
  group cards below it (reported via screenshot) — it was using a
  horizontal margin *on top of* its own padding, doubling its inset versus
  every other card in the view. Removed the margin; the box now sits flush
  to the same edges the group cards use, with wider padding to compensate.
- The README blurb no longer shares the card's boxed background — it's
  prose, not metadata, and picked one up as an unintended side effect of
  living inside the same card element. It's a sibling now, left aligned
  under the card via matching padding instead.

## [0.38.3] - 2026-08-21

### Fixed — Projects base folder setting

- Typing into "Projects base folder" no longer restarts the repo file
  watcher on every keystroke. The change is now applied once, on blur (or
  when Settings closes with the field still focused) — and applying it now
  does a full project resync, not just a watcher restart, so the Projects
  list actually reflects a newly-set folder without a manual "Sync."
- The sidebar's "Refresh" (kebab menu, available from any tab) now
  re-syncs projects too when a base folder is configured, not just the
  vault's own #todo/#idea items — it looked like a full refresh but
  silently skipped projects before.
- Added a "Choose a folder" button beside the field, using the OS folder
  picker. Defaults to `~/projects` if it exists, else the home directory.

## [0.38.2] - 2026-08-21

### Fixed

- Project detail view's back button now returns to whichever Todos/Ideas
  tab you actually came from, not always the Projects list — fixes a
  project block's header click and the "Show in Projects" context-menu
  entries, which previously forgot the originating tab even though the
  block's own → arrow already remembered it correctly.
- The Project detail card and item-group card backgrounds (added in
  0.38.1) were invisible: both used `--background-secondary`, the same
  colour as the sidebar's own ambient background, so the "card" painted
  identically to its surroundings no matter how many times the plugin was
  rebuilt or reinstalled. Switched both to `--background-primary`, the
  established contrast colour other sidebar elements already use against
  the grey chrome.
- `npm run build`'s version-bump check (`check-version-bump.mjs`) only
  looked at `git diff --name-only HEAD`, which never lists untracked
  files — a brand-new `src/*.ts` file could slip through unbumped until
  it was `git add`ed. Now also unions in untracked files via
  `git ls-files --others --exclude-standard`.

## [0.38.1] - 2026-08-20

### Changed — Project detail card now visually grouped

- The Project/Stack/Status summary and README blurb in the Projects
  detail view now sit inside one subtly-shaded, rounded card (`3px`),
  set off from the project title above and the TODO list below.

## [0.38.0] - 2026-08-20

### Added — Auto-open, README summary, and an overflow menu for linked project notes

- Opening a repo-matched project note anywhere in the vault now jumps the
  sidebar straight to that project's Projects detail view, even from the
  TODOs/Ideas tab — not just when the Projects tab was already active. Back
  returns to whichever tab you were on. New setting, on by default:
  Settings → Projects → "Auto-open Projects sidebar."
- The detail view now shows the README's opening paragraph (after the
  title, before the next heading), badge rows stripped, capped to roughly
  2-3 lines (`ProjectMetadata.extractProjectSummary`).
- Added a **⋯** overflow menu next to reveal-in-Finder for the
  less-frequent actions: copy local path, copy remote URL, open in a
  terminal or editor app (macOS `open -a`, app names configurable under
  Settings → Projects), and resync a project's tracked items on demand.

## [0.37.1] - 2026-08-20

### Fixed — Project block styling fired on generic tags like #work, not just project notes

`resolveProjectBlockMatch` was using `ProjectManager.resolveProjectTags()`,
which treats any non-lifecycle tag as an "explicit project tag" — correct
for `getProjects()`'s background aggregate counts, but far too loose for
visible block styling: a monthly log note's TODO tagged `#work` rendered
with the project icon+accent bar, while an untagged block in the same file
didn't. Found via live testing/screenshot review. Block styling is now
keyed on the TODO's own file location (`ProjectManager.isInProjectsFolder()`,
new) and that file's inferred tag, ignoring whatever explicit tag an
individual item happens to carry — a block only looks like a project when
its *note* is a project note.

## [0.37.0] - 2026-08-20

### Added — Project block styling extended to vault TODOs under the Projects folder

A TODO block (header-with-children, or an orphan-item run under a
synthesised section heading) whose file resolves to a project — an
explicit project tag, or an inferred tag from living under the configured
Projects folder — now gets the same folder-git icon and left accent bar a
repo-synced `.todo-project-block` gets, in the TODOs tab. A project with no
matching git repo gets a muted accent colour (`--text-faint` instead of
`--interactive-accent`) rather than a different icon, so "this note isn't
backed by an actual repo" is visible without a second icon to learn.

`ProjectManager.resolveProjectTags()` is a new public method, extracted
from `getProjects()`'s aggregation loop, so this render-path styling
resolves a single item's project using the exact same explicit-tag/
folder-inference precedence `getProjects()` already aggregates by, rather
than duplicating (and risking drift from) that logic.

## [0.36.4] - 2026-08-20

### Fixed — Project block icon sat at the top of the row instead of centred

`.todo-header-row` uses `align-items: flex-start`, which pinned the new
folder-git icon to the row's top instead of the title's vertical centre.
Same fix `.todo-checkbox-wrap` already used: an explicit height matching
`.todo-text`'s line box, centred within that.

### Fixed — Project blocks didn't appear until the Projects tab was opened once

`ensureProjectsSynced()` was only ever triggered from switching to the
Projects tab, and its render was gated on that tab being active. Neither
made sense anymore now that project blocks render in the TODOs/Ideas tabs
too: a session that never visited Projects first showed no project blocks
at all, and even a background sync's results were dropped unless you
happened to be on the Projects tab when it landed. `onOpen()` now kicks off
the sync itself, and both it and `applyProjectSyncResult()` render
unconditionally.

### Changed — Watch-triggered project resync is now scoped to the changed project

Every filesystem event under the Projects base folder used to trigger a
full `syncAll()`: a recursive walk of the whole base folder, three `git`
subprocess calls per repo, and a full reparse of every project's
`BUGS.md`/`TODO.md`/etc., regardless of which single file actually changed.
A changed path is now matched against the last known project list; only a
path matching no known project (almost always a brand-new repo) still
triggers the full walk. A matched project's git facts (branch/status/
remote) are only re-read via `ProjectScanner.scanOne()` when the changed
path is actually under `.git/` — a structured-file edit reuses the last
known facts instead of re-shelling to `git`.

## [0.36.3] - 2026-08-20

### Changed — Project TODO blocks now visually distinct from note-header blocks

`.todo-project-block` (a repo-matched project's collapsible block in the
TODOs/Ideas tabs) had no CSS of its own and inherited the same styling as a
plain note-header TODO block, making the two hard to tell apart at a
glance. Added a left accent bar (`--interactive-accent`) down the block and
a small folder-git icon before the title.

## [0.36.2] - 2026-08-20

### Fixed — Frontmatter panel never hid in Live Preview on project notes

`.warped-todo-project-note` suppressed the Properties panel with a direct
`.metadata-container { display: none }` rule, which only ever worked in
Reading view. Live Preview gates the widget's rendering on the
`--metadata-display-editing` CSS custom property, not on `display`, so
edit mode kept showing the raw YAML. Now sets both
`--metadata-display-editing` and `--metadata-display-reading` (with
`!important`, matching this file's other Obsidian-style overrides).

## [0.36.1] - 2026-08-17

### Fixed — Project block's → arrow didn't open the project in the sidebar

Clicking a project block's header (in the TODOs/Ideas tabs) already opened
the project's vault note and switched the sidebar to its Projects-tab
detail view; the small → arrow only opened the note, leaving the sidebar
on the TODOs/Ideas tab — reported via screenshot. The arrow now does both,
same as the header. They differ in what "back" does from the detail view
afterward: the header leaves the normal back-to-Projects-list behaviour;
the arrow returns to whichever TODOs/Ideas tab it was clicked from, since
that felt more like "look at this note" than "go browse Projects." Every
other way into detail view (a project's own list row, Quick Switcher, a
wikilink) still returns to the list as before.

## [0.36.0] - 2026-08-17

### Added — Project TODOs/ideas now show up in the main TODOs/Ideas tabs

Synced project items (a repo's `TODO.md`/`BUGS.md`/`IDEAS.md`, kept live by
`ProjectSyncManager`) were only ever visible one project at a time, inside
the Projects tab's detail view. They now also surface directly in the
TODOs and Ideas tabs, as one collapsible block per project, interleaved
with regular items by priority rather than off in a separate section — a
project carrying a `#focus` synced item sorts to the top of the list the
same way a `#focus` TODO does.

- Clicking a block's header switches to that project's detail view in the
  Projects tab; a small separate arrow opens its vault note directly.
- The TODOs tab's project tag-cloud pill now reflects vault + synced items
  together for repo-matched projects, both in its count and in what
  clicking it filters to.
- Checking off, focusing, or snoozing a synced item from its block writes
  straight to the repo file, same as the Projects tab's detail view — no
  new sync mechanism, this just reuses the existing one from a second
  place.
- Immersive Focus Mode's queue stays vault-only for now; folding synced
  items into it is a separate follow-up.

## [0.35.13] - 2026-08-17

### Fixed — Project row counts didn't pluralize

The project list row's todo/idea/bug count line always used the singular
form regardless of count (`3 todo`, `2 bug`, `3 idea`) — reported via
screenshot. Added a small `pluralize()` helper (`src/utils.ts`) and used it
for all three counts; each word here (todo, idea, bug) pluralizes with a
plain `s`, so no irregular-plural handling is needed.

## [0.35.12] - 2026-08-17

### Fixed — Synced project items showed completed todos; hand-typed ones never did

Reported as an inconsistency: TODOs synced from a repo's `BUGS.md`/`TODO.md`
kept showing up checked off after completion, while TODOs hand-typed into
the project note itself never did. Root cause: hand-typed items structurally
can't include a completed one — `TodoScanner` keeps `#todo` and `#todone`
items in separate caches, and `getTodos()` never returns a completed item at
all. Synced items don't have that split; `StructuredFileParser` parses a
repo's structured file into one list with a `completed` flag, open and
closed together, and `renderProjectItemGroups` never filtered it out before
rendering — unlike `projectItemCounts()`, reading the exact same cache for
the list-view row's todo/idea/bug badge, which already does. A completed
synced item stayed in the list, checked, indefinitely — nothing else prunes
a closed entry out of `BUGS.md`.

Now filtered to active-only in the render path too, matching the count
badge and matching hand-typed items: checking a synced item off makes it
disappear from the sidebar immediately, the same as a hand-typed one
already did. The completed item isn't lost — still in the file, checked
off — just no longer mirrored into this active-work view.

## [0.35.11] - 2026-08-17

### Added — Back arrow in the project detail view

Returning to the project list required clicking the Projects tab icon
again — an intentional "back" affordance (`switchToProjectsTab`'s own
comment notes it replaced a dedicated back button, removed when Projects
folded into the TODOs sidebar as a tab) but not a discoverable one from
inside the detail view itself. Added a `←` before the project title that
does the same thing, factored into a shared `backToProjectsList()` both
entry points now call.

## [0.35.10] - 2026-08-17

### Fixed — Duplicate, cut-off `.md` link in the project detail header

The detail view's title line carried its own filename+arrow link to the
project's note, on top of the same link already shown in the TODO group
heading below it and, as of 0.35.9, the new frontmatter block. Screenshot
review: with the longer README-derived title now on that line, the link
had no room left and got visibly truncated. Removed for the detail view
(`renderProjectSummary` gained a `variant` param); list view rows keep it,
where there's room and it isn't redundant.

## [0.35.9] - 2026-08-17

### Added — Project/Stack/Status frontmatter summary in the project detail view

The project detail view's header showed branch/status/counts and a raw
GitHub-URL action row that wrapped badly in a narrow sidebar (screenshot
review). Replaced with a compact three-line block between the header and
the TODO list: **Project** (the value doubles as the GitHub link — no URL
text shown, so there's no domain-vs-room trade-off; the full URL is still
on hover), **Stack** (auto-detected technologies), **Status** (branch +
a clean/dirty glyph + `(git)`).

Title and Stack are computed the way `~/projects/peep/p`'s
`extract_project_name()`/`detect_technologies()` already do — ported as
native TypeScript in new `ProjectMetadata.ts`, not shelled out to `p`,
consistent with `ProjectScanner.ts`'s existing git-facts decision — so a
repo's title/Stack reads the same whether you're looking at `p`'s CLI
output or here. Both are now also synced into the note's own frontmatter,
sync-owned alongside `project`/`branch`/`gitStatus`. Reveal-in-Finder
survives as a small icon next to the Project row rather than its own
action row.

## [0.35.8] - 2026-08-17

### Fixed — project notes with a pre-existing `cssclasses` never got their Properties panel hidden

`ProjectSyncManager` writes `cssclasses: warped-todo-project-note` into
each synced note so `styles.css` can hide its Properties panel — the
sidebar already surfaces branch/status/remote/counts, so the raw
frontmatter is just noise in the editor. That only happened when the note
had no `cssclasses` at all, though: if one already existed (predating this
feature, from a template, however it got there), the merge skipped adding
ours entirely rather than risk mangling a value the frontmatter parser
here — hand-rolled, single-line only — couldn't safely round-trip. Any
such note just kept showing its Properties panel forever, with no way to
fix it short of hand-editing the file. This is what the "front-matter is
still shown in project file" TODO was almost certainly about.

Now appends instead of skipping: a bare value (`cssclasses: foo`) or an
inline array (`cssclasses: [foo, "bar"]`) both get parsed, deduped against
`warped-todo-project-note`, and re-emitted as an inline array, so a
resync fixes any note that hit this. Doesn't cover a multi-line YAML block
list (`cssclasses:` followed by indented `- item` lines) — the parser
already couldn't represent one before this change either; that's a
pre-existing limit of hand-rolling frontmatter parsing rather than
something this introduces, and rare for a single-purpose key like this.

## [0.35.7] - 2026-08-17

### Changed — Project row branch moved down to join the item-count line

Branch (and its git-status badge, e.g. `M`/`?`) sat on the title line next
to the project name, wrapping badly for long names (`brucealderson.ca.2025
main` forcing "main" onto its own line, `development-notes` wrapping the
name itself with "main" stranded beside it) and putting it on a different
line than the todo/idea/bug counts it's conceptually part of ("what's the
current state of this repo"). Reported via screenshot with the desired
layout: branch on the same dot-separated line as the counts. Rows with no
counts (most projects, which have no open items) now get that line too,
just branch/status alone — previously they had no second line at all.
Each chunk (branch, status, counts) keeps its own styling — status keeps
its accent colour and monospace font — rather than collapsing into one
plain string.

## [0.35.6] - 2026-08-17

### Fixed — Projects list still didn't match TODOs: spacing and missing file link

Screenshot comparison against the TODOs tab (side by side, with a grid
overlay) found two more real gaps:

- **Filter sat flush against the header**, tighter than TODOs' tag cloud.
  `.sidebar-content > div:first-child { margin-top: 1em }` gives every
  tab's first section that breathing room, but the selector only matches
  `div`s — the filter is an `input`, so it never qualified. Set explicitly
  on the filter instead of broadening the shared selector.
- **Project rows had no source-file link.** TODOs shows the file a
  header/section came from as a muted filename + → arrow at the row's
  right edge; project rows had nothing pointing at their own note.
  Added, using the same `.header-filename` + arrow markup, pushed right
  via `margin-left: auto`. Click opens the note without switching into
  detail mode (`stopPropagation` keeps it separate from the row's own
  click, which does switch); omitted, not guessed, if that project's note
  hasn't synced into the vault yet.

A third reported difference — background colour between the two panels —
isn't a plugin CSS issue: neither tab sets a background on
`.sidebar-content`, and both render through the same `TodoSidebarView`
class post-0.35.3, so there's nothing left in this plugin's stylesheet
that could differ between them. Likely Obsidian's own leaf-background
handling (sidebar dock vs. main pane, or active vs. inactive leaf) rather
than anything this plugin controls — see the reply for what to check.

## [0.35.5] - 2026-08-17

### Fixed — Projects filter border looked crooked when focused

Side effect of 0.35.4's fix: removing the filter's own margin put it
directly against `.sidebar-content`'s padding, which is asymmetric on
purpose (4px left, 8px right — extra room for the scrollbar gutter).
Invisible on plain dividers and text; obvious on this input's own visible
border, especially focused, where the right side sat twice as far from
the edge as the left. Extends 4px into that reserved gutter so the border
sits the same visual distance from both edges.

## [0.35.4] - 2026-08-17

### Fixed — Projects list filter box inset further than the header and rows

The filter input had its own `margin: 0 8px 8px` on top of
`.sidebar-content`'s own padding (4px left, 8px right, reserved for the
scrollbar), stacking to a 12px/16px inset instead of matching the 4px/8px
every other element in this view uses — `.sidebar-header`, `.projects-section`
(the TODOs tab's tag cloud), and `.warped-todo-project-row` all rely on the
container's padding alone for their outer gutter, none add their own.
Reported via screenshot as a visible gap around the search box. Filter now
spans full width with no horizontal margin, matching that pattern.

## [0.35.3] - 2026-08-17

### Changed — Projects folded into the TODO sidebar as a tab, not a separate view

Screenshot review of 0.35.2 found the leaf-sharing fix was addressing the
wrong layer: Projects was still architecturally a second `ItemView`, just
now sharing a leaf with TODOs instead of opening its own. That's why it
kept looking and behaving unlike Ideas/Focus — a different header, its own
"Sync" always-visible instead of living in the kebab menu, a back-arrow
button, and (per report) the sidebar dock's own tab-strip icon still
changing to the folder-git icon whenever Projects was showing, since the
*leaf's view type itself* was swapping back and forth between two classes.

Projects is now a third mode of `TodoSidebarView` (`activeTab: 'todos' |
'ideas' | 'projects'`), exactly like Ideas — same header, same tab row,
same kebab menu (with "Sync" appearing there only while on the Projects
tab), no back button. `TodoSidebarView.getIcon()` never changes, so the
tab-strip icon this leaf shows in the sidebar dock now stays constant no
matter which internal tab is active — the root cause of the icon
"installing itself in the ribbon" the last two entries chased. Clicking
the Projects tab again while already viewing a project's detail returns
to the list, replacing the old back arrow (point 4 of the report: with
Projects/TODOs/Focus/Ideas/kebab all in one row, a dedicated back control
was redundant with just clicking the tab again).

`ProjectsSidebarView.ts` (the old standalone view) is now a small module
of pure helpers and types (`groupHandTypedItems`, `browsableUrl`,
`homeRelativePath`, etc.) that both `SidebarView.ts` and its existing unit
tests use — no `ItemView`, no `app`/`leaf` dependency. The
`toggle-projects-sidebar` command and Settings' "Open Projects sidebar"
button still work, now opening (or reusing) the one TODO sidebar leaf and
switching it to the Projects tab. A migration step in `onunload()` clears
any leftover leaf of the old, now-unregistered standalone view type for
anyone upgrading from 0.35.2 or earlier.

## [0.35.2] - 2026-08-17

### Fixed — 0.35.1's fixes didn't hold up; corrected both

A clean uninstall/rebuild/install showed both "fixed" bugs unchanged,
because 0.35.1 diagnosed the wrong cause for each.

The border: not a focus ring (0.35.1's fix, harmless but ineffective —
left in place, `.tag-cloud-pill` uses the same treatment for a real
reason elsewhere). The actual cause was a `border-left` divider added on
purpose to set the button apart from the TODOs/Focus/Ideas cluster,
styled heavily enough to read as a stray box around the icon — replaced
with plain spacing, no border.

The "won't close" bug: not a missing `toggle()` (0.35.1's fix). Clicking
the nav button opened Projects in a brand new leaf (`getRightLeaf(false)`),
giving it its own tab in the sidebar dock — structurally unlike every
other tab (TODOs/Focus/Ideas), which swap content within the *same* leaf.
That's what read as the Projects icon "installing itself in the ribbon":
a second, independent pane where a same-slot swap was expected. Fixed by
having both nav buttons — and, so switching sidebars behaves identically
everywhere, the `toggle-todo-sidebar`/`toggle-projects-sidebar` commands
and the TODO sidebar's ribbon icon too — reuse whichever leaf currently
holds the other view instead of opening a second one. TODOs and Projects
now share one dock slot, the same way TODOs/Focus/Ideas already share
theirs. The "Show in Projects" context-menu entries, which pass a
specific project tag, still always land you on that project rather than
toggling anything closed, since their intent is "show me this."

## [0.35.1] - 2026-08-17

### Fixed — Projects nav button had a stray border and couldn't be closed

Two bugs found via screenshot review of 0.35.0's new Projects nav button:
a faint border around its icon, and no way to close it once opened —
superseded by 0.35.2 above, which found both fixes here were diagnosed
wrong.

## [0.35.0] - 2026-08-17

### Changed — Projects reached from the TODO sidebar, not a ribbon icon

The Projects sidebar had its own ribbon icon in the left rail, disconnected
from the TODO sidebar's tab nav — no visible path between the two beyond
that icon. The ribbon icon is gone; a new button sits beside the Ideas tab
in the TODO sidebar's header (a left border sets it apart from the
TODOs/Focus/Ideas tab cluster, since it navigates to a different view
rather than switching tabs within this one). The Projects sidebar's header
got the same button in reverse, so the path works both ways. The
`toggle-projects-sidebar` command is unchanged for anyone using a hotkey.

Three more connection points, all additive:

- **Settings → Projects** has an "Open Projects sidebar" button, matching
  the existing "Open team file" pattern in the Team section.
- **Right-clicking a project tag pill** in the TODOs tag cloud now offers
  "Show in Projects" alongside "Filter by" in its tag submenu — jumps the
  Projects sidebar straight to that project's detail view.
- **Right-clicking a TODO or idea that carries a project tag** offers the
  same "Show in Projects" action. Left-click behaviour on tags and pills
  (filtering) is unchanged either way.

### Changed — snoozed items are an ordinary tag, not a dedicated tab

The Snoozed tab, its icon, and every special-case filter that hid
`#future`/`#snooze`/`#snoozed` items from the TODOs and Ideas tag clouds
and lists are gone. A snoozed item now surfaces wherever its tags put it,
same as `#p0` or a project tag — including the tag cloud and the active
list. The one place still excludes them: Focus Mode's queue, so snoozed
work doesn't get resurfaced there by default. Snoozing/unsnoozing an item
from the context menu is unchanged.

### Fixed — Focus mode's tab icon and title were inconsistent with the other tabs

Clicking TODOs, Ideas, or (formerly) Snoozed always updated the sidebar
title and moved the shared `active` styling to the clicked icon. Focus
mode didn't: the title stayed pinned to " TODOs" no matter what, the eye
icon used its own `focus-mode-active` styling instead of participating in
the shared active/inactive pattern, and the other tab buttons went inert
and heavily faded instead of staying clickable. Now the title reads
" Focus" while focus mode is active, and clicking any other tab exits
focus and switches in one click — same behaviour as switching between any
two tabs. The eye icon keeps its distinctive yellow tint when active;
that's the only intentional difference left.

### Fixed — tag cloud showed pills with zero matching TODOs

A header TODO whose only non-complete child was a bold subheading label
(not a real task) could still show its project tags as clickable pills in
the tag cloud — clicking one produced "No TODOs matching," dead-end noise.
The tag cloud and the active-TODOs list used two different definitions of
"does this header have real active work"; they now share one
(`isActiveTodo`), so a pill only appears when there's something real
behind it.

## [0.34.1] - 2026-08-15

### Fixed — Ideas had no checkbox in the Projects sidebar

Found via screenshot review: synced Idea items rendered as plain text with
no interactive control at all, unlike TODOs and Bugs. The main TODOs
sidebar gives ideas a checkbox too (checking one there means "dismiss",
not literally "done"); the Projects sidebar's synced-item groups just
never turned it on for the Ideas group. Checking an idea there sets the
same `[x]` on its line as a TODO/Bug would.

## [0.34.0] - 2026-08-15

### Fixed — Projects detail view UI review

Found via screenshot review of the detail view:

- **"peep" was showing three times**: Obsidian's own file-title display, a
  duplicate `# peep` heading the plugin wrote into the note body, and the
  sidebar's own header. The sidebar header now always reads "Projects"
  (matching the list view) instead of repeating the project name, and new
  project notes no longer get a redundant `# name` heading (existing notes
  keep theirs — the note body is never rewritten by sync, so this only
  applies going forward; delete the extra heading by hand if you want it
  gone from a note created before this fix).
- **Detail view now opens with the same summary block as its list row**
  (name, branch, status, item-count breakdown) instead of a separately
  hand-styled branch/status line — the detail view now reads as "the row
  you clicked, expanded" rather than a different restatement of the same
  facts.
- **Remote link** now shows the actual browsable URL with the protocol
  dropped (`github.com/robotpony/peep`) instead of the generic label
  "Remote"; full URL still available on hover.
- **"Reveal in Finder"** now shows the project's local path, home-relativized
  (`~/projects/peep`) instead of the generic label "Reveal in Finder"; full
  path still available on hover.
- **Synced item group headings** (TODOs/Ideas/Bugs) were missing the
  filename hint and `→` open-file arrow that hand-typed section headings
  already had. Now shown whenever every item in a group came from the same
  source file (e.g. `BUGS.md →`); clicking opens that file in the OS default
  editor, since it's a plain filesystem path, not necessarily a vault file.

## [0.33.0] - 2026-08-15

### Fixed — Runaway project sync crashed Obsidian

Found via live testing: a project note's `lastSynced` frontmatter value was
updating roughly every 200ms, making the note unusable while open — and,
left running, crashing Obsidian outright. Each ~200ms pass was
re-appending the rendered item block into the note rather than cleanly
replacing it, so the note grew by a full copy of that block every pass;
at thousands of passes this bloated the note (and Obsidian's editor state
for it) enough to bring the app down.

Root cause: `main.ts` wired the sync manager's completion callback to a
sidebar refresh method that itself triggered a full resync, which fired
the same completion callback again — an unbounded loop, limited only by
how fast a full scan-and-sync pass could complete. Fixed by having the
completion callback pass its results directly to the sidebar (which just
re-renders) instead of asking the sidebar to reload, which would resync.

### Changed — Projects sidebar is now the only place synced items appear

The vault note per project no longer gets a written-in listing of its
`#todo`/`#idea`/`#bug` items. Two problems drove this: the write itself
made most syncs touch a note that might be open for editing, and — found
via live testing, screenshots showing tags appearing and disappearing
across scans — the rendered `#todo` tag on a completed item collided with
TodoScanner's own vault-wide checkbox-to-tag correction (checked box + `#todo`
auto-corrects to `#todone`), which the render then "corrected" back on the
next sync, an actual content-flicker loop.

Project notes now carry frontmatter only (git facts: branch, status,
remote, last synced) plus whatever body a user writes by hand. Every synced
item — from the sidebar's list-view counts to its detail view — is read
from `ProjectSyncManager`'s in-memory cache, populated straight from each
repo's `BUGS.md`/`TODO.md`/etc., never from the note. Completing, focusing,
or snoozing a synced item still writes back to the real repo file; it just
no longer round-trips through the vault note to get there.

## [0.32.0] - 2026-08-14

### Added — Projects: a second sidebar for git repos

Point the plugin at a folder of git repos and it finds every one, syncs a
vault note per project (git facts in frontmatter), and surfaces each repo's
`#todo`/`#idea`/`#bug` items — pulled from `BUGS.md`/`TODO.md`/etc. — in a
dedicated sidebar. Full design in `OUTLINE.md`, `DESIGN.md`, and `PLAN.md`.

- **New Projects sidebar**, alongside the existing TODOs sidebar. Lists
  detected repos (branch, git status, open-item counts by type); selecting
  one opens its note and switches to a detail view with pinned repo facts,
  a merged item list (synced items plus anything hand-typed elsewhere in
  the note), and the same complete/focus/snooze context menu as the TODOs
  sidebar (no "move" — see below). See 0.33.0 below: items are read from
  the sync cache, not written into the note.
- **Settings**: base folder, exclude directories, scan depth, added to the
  existing Projects section.
- **Commands**: "Toggle Projects Sidebar", "Sync Projects". New ribbon icon.
- Frontmatter is hidden in repo-matched project notes (the sidebar already
  surfaces branch/status/remote/last-synced); tag-only project notes are
  unaffected.
- Completing a repo-sourced item writes back to the actual repo file
  (`BUGS.md`/`TODO.md`/etc.), not just the vault note. This includes
  prose-style bug write-ups (`### Title` under a `## Open`/`## Fixed`
  section, this repo's own `BUGS.md` shape) — completing one moves its
  whole write-up to the first matching closed section (creating `## Fixed`
  if none exists), reversible the same way, refusing if the file has
  uncommitted changes so a bad move is always recoverable via
  `git checkout`.

### Removed

- The plugin-wide "Move to..." action is being phased out — dropped first
  from the new Projects sidebar's context menu (moving a repo-synced item
  elsewhere conflicts with it reappearing in its original note on the next
  sync). Full removal from the TODOs sidebar tracked separately.

### Changed

- **Desktop only.** Project syncing needs Node `fs`/`child_process`
  (reading repo files, running `git`), not available on mobile.
  `isDesktopOnly` is now `true`.

### Fixed — Notice flood while editing a project note

Editing a project note could produce a rapid stack of Obsidian's own
"modified externally, merging changes automatically" notices. The plugin
was writing to that note far more often than it should: every sync bumped
a `lastSynced` timestamp unconditionally, so even a no-op sync looked like
a real change and triggered a write — and the file watcher could plausibly
retrigger itself, since a plain `git status` can touch `.git/index`'s
mtime with no real change, right inside the folder being watched. Fixed:
a sync now only writes a note when something other than the timestamp
actually changed, the watcher ignores events under excluded directories
(it wasn't before), and watch events within 1.5s of a completed sync are
ignored as likely side effects of that sync rather than real changes.

## [0.31.0] - 2026-05-11

### Fixed — Sidebar pixel polish

- **Tag cloud top no longer clips.** The first row of pills was sitting flush against the section's upper edge (the 2px top padding was eaten by the pill border). Bumped to 4px so the row sits cleanly under the header.
- **Checkboxes now sit on the text midline.** Native checkbox heights vary across themes, so a hard-coded `margin-top` couldn't reliably centre them on the first-line midline. Wrapped each checkbox in a flex container sized to the text's line box and centre-aligned the input — same pattern Focus Mode already uses. Affects `.todo-checkbox` and `.idea-checkbox`.

## [0.30.0] - 2026-05-09

### Changed — Settings cleanup

- **"Focus list limit"** renamed to **"Project list limit"** — the previous name implied a connection to Focus Mode.
- **"Focus queue limit"** and **"Persist focus mode across sessions"** moved from the Projects section into a new **Focus Mode** section.
- **"Priority tags"** setting removed. It was never changed from the default (`#p0`–`#p4`) and added noise without practical value.
- **"Date format"** description now shows a concrete example instead of referencing moment.js internals.
- **"Default projects folder"** description clarified: it says "scanned" not "created".

## [0.29.0] - 2026-05-09

### Fixed — Focus eye icon now shows a visible yellow pill

The previous approach set `color: #ffcc00` on the button, but two `!important` transparent-background rules (one on `.sidebar-tab-btn`, one on `.sidebar-tab-nav .focus-mode-toggle-btn`) were overriding the background, and Obsidian's theme styles can further stomp `color` on SVG icons. The active state now uses a `.sidebar-tab-nav` context selector to beat both conflicts, applying `background-color: #ffcc00 !important` with a dark icon and full opacity — matching the pill appearance of other active tab buttons.

## [0.28.0] - 2026-05-09

### Fixed — Focus mode eye icon is now bright yellow

The eye icon colour was resolving to a muted amber via `var(--color-yellow)`, which some themes define as a desaturated gold. The colour is now hardcoded to `#ffcc00` so it stays vivid across all themes.

## [0.27.0] - 2026-05-09

### Changed — Focus mode eye button stays visible and toggles in place

The sidebar header now renders in full regardless of whether focus mode is on or off. When focus mode is active:

- The eye icon turns amber/yellow and remains clickable — clicking it exits focus mode without moving the mouse.
- The other tab buttons (TODOs, Ideas, Snoozed) fade to 20% opacity and become inert (`pointer-events: none`).
- The kebab menu remains accessible for refresh, stats, and about.
- The focus card exit link at the bottom is preserved as a secondary exit path.

Previously the header was replaced entirely by a slim logo-only header on focus mode entry, which required hunting for the exit link. The font scale (1.4×) that enlarges focus card text is now applied to the content area only, not the whole sidebar, so the header always reads at normal size.

## [0.26.0] - 2026-05-09

### Changed — Assignee filter moved into the tag cloud

The `@` dropdown button that appeared between the tag cloud and the TODO list has been replaced. Assignee options now render as pills directly in the tag cloud, alongside project and priority tags. `@me` appears first (with accent colouring), followed by other handles with active TODOs, and `@unassigned` if any items have no assignee. Clicking a pill toggles the assignee filter in place, same as before. The isolated `@` character is gone.

## [0.25.6] - 2026-05-08

### Fixed — Todone dates no longer written as UTC (+1 day in North American timezones)

When checking a checkbox directly in the editor, the scanner auto-stamps the `#todone @date`. It was using `new Date().toISOString().split("T")[0]`, which returns the UTC date. In any timezone behind UTC (UTC-7, UTC-5, etc.) this produces the next calendar day after a certain hour in the evening. Fixed to use `formatDate(new Date(), "YYYY-MM-DD")` (moment local time), matching the completion path in `TodoProcessor`. The same UTC issue in the `getItemDate` mtime fallback is fixed with an explicit local-date calculation.

## [0.25.5] - 2026-05-08

### Fixed — Tag cloud pills no longer oversized in sidebar

Tag cloud pills (`<button>` elements) were being overridden by Obsidian's workspace-scoped button styles, which have sufficient specificity to beat plain property values. Added `!important` to the size-critical properties (`font-size`, `padding`, `line-height`, `border-radius`, `min-height`, `box-shadow`) and switched from `display: inline-flex` to `display: inline-block !important`, matching how inline `.tag` elements are styled. Pills now render at the same compact size as inline document tags across all sidebar tabs.

## [0.25.4] - 2026-05-08

### Fixed — "Space Command" branding replaced with "Warped Todo"

Settings panel header, about modal, and about section in settings all still showed "Space Command". Updated to "Warped Todo" throughout. Also renamed the internal TypeScript identifiers (`SpaceCommandPlugin`, `SpaceCommandSettingTab`, `SpaceCommandSettings`) to `WarpedTodoPlugin`, `WarpedTodoSettingTab`, `WarpedTodoSettings` for consistency.

## [0.25.3] - 2026-05-08

### Fixed — Tag cloud pill size matches inline tags

Tag cloud pills were taller than inline document tags because `font-size` and `padding` deferred to theme variables (`--tag-size`, `--tag-padding-y/x`) that exceed the sidebar's intended values. Both are now hardcoded to match the existing inline `.tag` rule: `font-size: 12px`, `padding: 2px 5px`.

## [0.25.2] - 2026-05-08

### Fixed — Tag cloud pills restored to chiclet shape

Tag cloud filter pills were rendering as ovals because `border-radius` deferred to the theme's `--tag-radius` variable, which this theme sets to a large value. Overridden to `4px` to match the chiclet shape used by all other tags and pills in the sidebar.

## [0.25.1] - 2026-05-08

### Fixed — Header icon opacity now consistent

The focus-mode button (eye icon) was set to `opacity: 0.45` while the tab buttons (todos, ideas, snoozed) had no explicit opacity, leaving the eye visibly faded against the set. All header icons now share a common base opacity of 0.55, with a unified hover (0.8) and active (1.0) state. The active tab still carries its background highlight for orientation.

## [0.25.0] - 2026-05-08

### Added — Tag-cloud filter on Ideas and Snoozed tabs

The TODOs tab has had the click-a-pill-to-filter tag cloud since the early days. The Ideas and Snoozed tabs were stuck filtering only via the in-document tag clicks or the assignee dropdown. This brings the cloud to both.

- **Ideas tab**: tag cloud built from active (non-snoozed) `#idea` items. Click a pill to filter the list below.
- **Snoozed tab**: tag cloud built from all snoozed items (TODOs and Ideas combined). Filter applies to both lists at once.
- The `activeTagFilter` state is shared across tabs, so a filter set on one tab persists when you switch — useful for "what `#api` work is queued vs. snoozed?" jumps. Click the pill again or the filter pill in the section header to clear.
- Same `TAG_CLOUD_CAP = 15` and `+N more` indicator as the TODOs cloud.
- Tag-cloud renders nothing on Ideas/Snoozed when there are no project tags — those tabs may legitimately contain only untagged entries.

Implementation note: extracted `tallyProjectTags(items, priorityTags)` into `utils.ts` (covered by 8 new unit tests) and reused the existing `renderTagCloudPill` in a lightweight `renderSimpleTagCloud` helper.

## [0.24.0] - 2026-05-08

### Removed — Principles section in the Ideas tab

The italic-rendered Principles section at the top of the Ideas tab wasn't earning its keep — it read like "notable quotes," didn't behave like one, and crowded out the actual ideas.

- Removed the Principles list rendering, item rendering, render config, and right-click menu (`SidebarView.renderPrinciples`, `renderPrincipleItem`, `principleConfig`, `ContextMenuHandler.showPrincipleMenu`).
- Removed the related CSS: `.principles-section`, `.principle-list`, `.principle-item`, `.principle-text`, `.principle-link`, `.principle-count`, `.principle-header*`, `.principle-children`, `.principle-child`, `.principle-focus`, and the principle-list filter-fade transitions.
- README updated: Ideas tab description no longer mentions `#principle`; the Ideas/Principles section notes that principles still surface in the project-info popup and Stats modal.

`#principle` tagging itself is unchanged. Items are still detected and cached; the project-info popup (click the (i) on a project tag) still lists principles for that project, and Stats still counts them.

## [0.23.2] - 2026-05-08

### Changed — Polish: Ideas and Snoozed tabs match the slimmed TODO tab

Carrying the 0.23.1 cleanup across the rest of the sidebar. The Ideas tab had a redundant "Focus" header at the top (a leftover from when the eye icon lived there) and section labels that were duplicating the tab name. Snoozed had the same pattern. The tab name already says what's there; the rendered items differentiate themselves.

- Ideas tab: removed the dead "Focus" header at the top and the "Principles" / "Ideas" section titles. Principles still read as a separate section because they render without checkboxes.
- Snoozed tab: removed the "Snoozed TODOs" / "Snoozed Ideas" section titles. The two lists stay distinguishable by their existing item styling.
- All section headers now collapse via the `:empty` rule when no filter pill is active — same pattern the TODO tab uses.
- Added `margin-top: 1em` to the first content section in any tab so the rhythm matches the TODO tab's tag-cloud spacing.

## [0.23.1] - 2026-05-08

### Changed — Polish: tighter sidebar header, focus icon promoted to the top

The "Focus" and "TODO" section labels were doing redundant work. The tab bar already says which view you're on, and the tag cloud is self-evident. Cutting them lets the content lead.

- Eye icon (enter focus mode) moves up next to the TODOs check icon in the tab nav. Available from any tab — `handleFocusEnter` already preserves the active tab so exit lands you back where you started.
- Removed the "Focus" heading above the tag cloud.
- Removed the "TODO" heading above the active TODOs list. Filter pills (assignee, active tag) still render in their old slot when present; otherwise the row collapses (`:empty` selector).
- Tag-cloud section gets `1em` of vertical breathing room to replace what the heading used to provide.
- Focus-mode button restyled for its new home: matches tab-button padding, slightly quieter at rest (`opacity: 0.45`), brightens on hover.

## [0.23.0] - 2026-05-08

### Fixed — Unchecking a list item now removes `#todone @date`

Checking a `[ ]` box already auto-stamps `#todone @YYYY-MM-DD` on the line. The reverse never worked: unchecking a `[x]` would clear the box but leave the `#todone @date` behind, so the item stayed classified as completed and the markdown drifted out of sync with the checkbox.

The scanner now mirrors the forward behaviour. Unchecking a list-item checkbox on a `#todone` line strips the `#todone @date` and restores `#todo`, matching what the sidebar's "uncomplete" action does. Works for both standalone TODOs and child items under a header TODO.

## [0.22.0] - 2026-05-07

### Removed — Embed feature

The `{{focus-todos}}` / `{{focus-ideas}}` / `{{focus-list}}` inline syntax and the `` ```focus-todos `` / `` ```focus-ideas `` / `` ```focus-list `` code-block flavors are gone, along with the filter syntax (`path:`, `tags:`, `limit:`, `todone:`, `assignee:`) they used. The sidebar's tag cloud + assignee dropdown cover the same filtering needs without requiring users to remember a custom DSL inside markdown.

- Removed `EmbedRenderer.ts`, `CodeBlockProcessor.ts`, and `FilterParser.ts`.
- Removed the markdown post-processor that scanned for `{{focus-*}}` blocks and the code-block processors for `` ```focus-* ``.
- Removed the sidebar's "Embed Syntax" right-click submenu.
- Removed all embed-specific CSS (~130 lines).

If you have `{{focus-todos}}` or `` ```focus-todos `` blocks in existing notes, they'll render as plain text now instead of as live lists.

### Changed — Documentation rewrite

- README rewritten from scratch to match the current code state: removed stale embed sections, removed accidental internal-tooling command mentions and a stray PRD reference, updated the slash-command list (now includes `/todos`, `/idea`, `/ideas`), corrected the tab list (TODOs / Ideas / Snoozed — three tabs, not two), and added a commands + hotkeys table.
- CLAUDE.md rewritten: dropped references to deleted files (`LLMClient.ts`, `DefineTooltip.ts`, `FilterParser.ts`, `EmbedRenderer.ts`, `CodeBlockProcessor.ts`) and the embed data-flow step.
- DESIGN.md updated: removed the `EmbedRenderer` / `CodeBlockProcessor` boxes from the architecture diagram, dropped the "Filter Syntax" section, and corrected the `src/` file listing.

## [0.21.0] - 2026-05-07

### Removed — Triage feature

The Triage modal and its alert button never quite earned its keep. The siren button in the sidebar header was a constant low-grade alarm, and the modal's one-by-one Snooze / Clear / Convert / Focus / Skip flow was always slower than just opening the source file. Cutting it removes a lot of moving parts.

- Removed the `TriageModal` class and its keyboard flow entirely.
- Removed the siren-icon "Triage needed" alert button from the sidebar header.
- Removed the right-click "Triage" item from the sidebar context menu.
- Removed the `triageSnoozedThreshold` and `triageActiveThreshold` settings (and their settings-tab UI). Stored values are silently ignored.
- Removed all triage-specific CSS (alert pulse animation, modal layout, button variants).
- README's "Stats and triage" section is now just "Stats."

If you relied on the alert as a "you have too many snoozed items" nudge, the Stats modal still shows the same counts on demand.

## [0.20.1] - 2026-05-07

### Changed — Polish: tag cloud hides project tags with no active TODOs

Project tags appeared in the cloud as long as any `#todo` referenced them — including snoozed items. So tags like `#api` could sit in the cloud and click through to "No TODOs matching #api," which is just noise. Obsidian's built-in tag search already covers the all-up view; the sidebar cloud is a quick filter for *active* work.

- Project pills are now skipped when their only references are snoozed (`#future` / `#snooze` / `#snoozed`). Clicking any visible pill always yields at least one match.
- Pill tooltips show both numbers when they differ — `4 active / 6 total` — so the count reflects what you'll actually see when you click. When all references are active, the tooltip stays terse: `6 items`.
- Pinned tags (`#focus`, `#p0`) are intentionally exempt from the active-only rule. They're priority indicators rather than project filters, so they keep showing whenever any TODO carries them.

## [0.20.0] - 2026-05-07

### Fixed — Tag filters now find items nested under non-matching headers

Clicking a project tag like `#mta` in the cloud showed "No TODOs matching #mta" even when the document obviously had matching items — because those items were children of a header (e.g., "MTA / NB 3.0 (P1)") that didn't itself carry the `#mta` tag. The pipeline filtered out child rows first, then dropped headers whose own tags didn't match — so headers with matching children disappeared, taking their children with them.

- The tag filter now keeps a header if any of its children carry the filter tag, mirroring the parent-match logic the assignee filter already uses.
- Applied at all five tag-filter sites: active TODOs, active Ideas, Principles, snoozed TODOs, snoozed Ideas.
- Extracted into a single `filterByActiveTag` helper so the rule lives in one place.

## [0.19.1] - 2026-05-07

### Changed — Polish: crossfade on tag-filter changes

Clicking a tag pill (or clearing the filter chip) used to flash the list contents in and out as the sidebar re-rendered. The change was instant but felt jarring — items appeared and disappeared without warning.

- Added a brisk crossfade on filter changes: the `.todo-list`, `.idea-list`, and `.principle-list` containers fade to opacity 0 (80ms), the sidebar re-renders, and the new content fades back to opacity 1 (100ms). 180ms total — fast enough to not feel laggy, slow enough to register.
- Only the lists fade. The tag cloud, header, and summary stay put so the user's click target doesn't slide out from under their cursor.
- Rapid pill clicks short-circuit any in-flight fade and snap to the latest selection (no stacking timers, no jank).
- Respects `prefers-reduced-motion`: users with that setting see the same instant re-render as before.

## [0.19.0] - 2026-05-07

### Fixed — Tag cloud pills actually look like document tags now

The 0.16.0 attempt to match document tag styling didn't take effect: the cloud pills were still rendering as default Obsidian buttons (cream background, gray border, rounded-rectangle shape) because the `.tag-cloud-pill` class lost the specificity battle to Obsidian's built-in `<button>` styles inside workspace leaves. The tag CSS variables resolved fine; my rule just didn't win.

- Scoped all `.tag-cloud-pill*` rules under `.space-command-sidebar` to win specificity against Obsidian's default button styling.
- Explicitly reset button-default `appearance`, `background-image`, and `box-shadow` so the pill is a clean canvas before the tag styles apply.
- Added concrete accent-mix fallbacks for `--tag-color` and `--tag-background` so pills still render as tags if those variables aren't reachable from the sidebar scope (some themes scope them under `.markdown-rendered` only).

The focus tag treatment (`#focus` and project pills with focus items get the `.todo-focus` accent-mix background) is unchanged in intent — it just couldn't beat the button defaults before.

## [0.18.0] - 2026-05-07

### Changed — Polish: SUMMARY title sits flush left

Even with horizontal padding removed, the chevron `▸` indicator at the start of the SUMMARY row pushed the title ~1.4em right of the project rows above it. The chevron rotated to signal expand/collapse state, but the section's content already reveals/hides on click — the chevron was redundant.

- Removed the `.summary-chevron` element and its CSS. SUMMARY now sits flush against the left edge, aligned with project rows.
- Expand/collapse is signalled by the content rows appearing below when the user clicks the header.

## [0.17.0] - 2026-05-07

### Changed — Polish: Summary header alignment and separator

The Summary header sat slightly indented relative to the project rows above it because of a 6px horizontal padding on the row. It also butted up against the last project, with no visual break to signal "this is a different kind of section."

- Removed horizontal padding on `.summary-header` so the chevron's left edge aligns with the project rows directly above.
- Added a faint top border (`var(--background-modifier-border)`) and a small top margin/padding above the section so Summary reads as its own block.

## [0.16.0] - 2026-05-07

### Changed — Polish: tag cloud pills match document tag rendering

The tag cloud at the top of the sidebar used a custom monospace pill style with a faded `opacity: 0.85`. It read as "this is a filter button" instead of "this is the same kind of tag you see in your notes," which made the cloud feel disconnected from the document tags people are actually filtering on.

- Pills now inherit Obsidian's `--tag-*` variables (font, size, weight, color, background, radius, padding) so they render the same as in-document tags. Theme overrides flow through automatically.
- Removed the `0.85` opacity fade. Tags read at full contrast, like they do in the editor.
- Focus tags — the pinned `#focus` pill and any project pill containing a `#focus` item — get the same accent-mix background as `.todo-focus` rows. The "where focus lives" signal is now consistent everywhere in the sidebar.
- Hover and active-filter behaviour unchanged.

## [0.15.8] - 2026-05-07

### Changed — Polish: tag cloud replaces vertical focus list

The "Focus" section at the top of the sidebar used to be a vertical list of project rows. It worked, but it ate a lot of vertical space for what is essentially a row of filter buttons. It is now a compact tag cloud:

- `#focus` and `#p0` are pinned to the front when any active TODO uses them, so the highest-leverage filters are always one click away.
- Project tags follow, in the same sort order as before (focus tier → highest priority → count).
- Each tag renders as a `(#tag)`-style pill button. Click to toggle the filter (same behaviour as the old rows). Right-click on project tags still opens the project context menu; pinned tags skip it since the actions don't apply.
- Soft cap of ~15 pills (≈4-5 lines in a typical sidebar). Anything beyond the cap surfaces a `+N more` hint.
- Active filter state uses the accent colour for unmistakable contrast against pinned and focus-tier styling. Hover and focus-visible states use 120ms transitions for steady, low-key feedback.

### Changed — Polish: per-row tag indicator removed

Each TODO row used to render a small `#` pill that opened a per-item dropdown for filter / clear-tag / snooze actions. With the tag cloud above the list, the inline pill duplicated work the cloud now does better, and it added visual noise to every row.

- Removed the `#` trigger from TODO/idea/principle rows in the sidebar.
- All filter / snooze / clear actions remain available through the row's right-click context menu, which already had them.
- Dead CSS for the per-row submenu, separator, clear, and snooze styles is gone with it.

## [0.15.7] - 2026-05-07

### Fixed — Consistent font scale across natural and synthesised header blocks

Header-block child items inherit a `.85em` scale from `.todo-children`, while orphan items rendered directly inside `.todo-list` were at full `1em`. Same gap on the headings: in-block bold subheadings inherit `.85em`, but the synthesised `.todo-orphan-section-text` was set to `0.95em`. Result was that the recently-added "hybrid" orphan blocks rendered slightly larger than their natural-block neighbours.

Both ends now match:

- `.todo-orphan-section` is set to `font-size: 0.85em` so its bold label renders at the same effective size as in-block subheadings.
- Top-level orphan TODO items in the sidebar (`.space-command-sidebar .todo-list > .todo-item:not(.todo-header)`) drop to `0.85em` to match the `.todo-children` scale. Header rows keep their natural `1em` since they're the visual anchors.

## [0.15.6] - 2026-05-07

### Changed — Focus Mode Skip walks the full list

Skip used to rotate within a small queue (`focusQueueLimit`-sized), which meant the user could only ever cycle between the top 2 (or N) candidates of a tier. With four `#p0 #focus` items and `focusQueueLimit: 2`, items 3 and 4 were never reachable from Skip; same problem at the priority-fallback level when 100 TODOs collapsed to a 2-item queue.

Skip now advances by one position through the *full* sorted candidate list — same comparator, no size cap. Reaching the end wraps back to the start so Skip stays useful as a "let me see what else is on the list" affordance. The user's mental model is now linear: each Skip = the next item, in order.

- New `buildFullFocusCandidateList()` returns the unbounded sorted candidates using the existing `buildFocusQueue` comparator (curated `#focus` or priority-fallback, depending on mode).
- `handleFocusSkip` finds the current item's index and advances by 1 (mod length).
- `hasMoreFocusCandidates` checks against the full list rather than the limited queue, so the Skip button is enabled whenever any other candidate exists.
- `rotateQueue` import dropped from `SidebarView` (still exported from `utils.ts` for tests / external use).

`focusQueueLimit` no longer constrains Skip; it remains in settings since the plumbing still feeds it through `buildFocusQueue`, but it has no effective bearing on the per-card view (which always renders one item) or on the Skip walk (which is now unbounded).

## [0.15.5] - 2026-05-06

### Fixed — Orphan section heading behaviour

Two corrections to the 0.15.4 orphan section heading.

- **Click target**: the whole row was clickable. Now matches the existing header-row pattern — label is plain text on the left, only the right-side `→` opens the source. Click target is predictable across both shapes.
- **Bold-line detection**: `isBoldSubheading` was treating any line that *started* with `**…**` as a heading, including `**Note:** more text follows…`. It now requires the bold to be the entire line content; tags (`#xxx`) and mentions (`@xxx`) are still allowed in the tail since that's how subheadings carry scope, but free prose after the closing bold disqualifies the line. Both opening and closing markers must match (no `**foo__`).

## [0.15.4] - 2026-05-06

### Fixed — Orphan section labels render above, not on the right

The 0.15.2 polish put the synthesised section label inline on the right side of each orphan row. That made every row carry a small repeated label and broke the visual rhythm: header-block items show their heading *above* their children, but orphan items showed it *beside* themselves.

Now orphan items render with a heading row above each consecutive run that shares the same source heading — same shape as the bold-subheading divider used inside header blocks. Clicking the heading still opens the source at that section's line. Falls back to the file basename when no preceding heading exists.

The current sort order is preserved: when priority interleaves two runs from the same section, the heading repeats above each run — the user explicitly chose this trade-off over re-sorting by section.

The per-row inline section link (`.todo-section-link` / `.idea-section-link` / `.principle-section-link`) was removed.

## [0.15.3] - 2026-05-06

### Changed — Polish: Summary collapses by default

The Summary section had grown into a long block of stats that pushed everything else off-screen. It's now a single header line by default, with the most useful numbers inline:

```
▸ SUMMARY  45 open · Done: 3 today · 12 week · 45 month  →
```

- **Click the row** (or press `Enter` / `Space` when focused) to expand. Chevron rotates from `▸` to `▾`. Body slides in over 160ms (skipped under `prefers-reduced-motion`).
- **Default is always collapsed** at plugin load — the open state is session-only, not persisted. Keeps every session's resting state minimal.
- **`→` on the right** opens the done file. `aria-label` carries the file path; the inline filename text was removed.
- **Inline preview** shows total open count + Done velocity (today / week / month). The standalone Done velocity row inside the expanded body was removed; the header is now the single source for that number.

### Internals

- New `summaryExpanded` instance field on `SidebarView` (in-memory only, not persisted).
- `renderSummaryHeader` produces a `role="button"` row with chevron, title, preview, and `→` link.
- `renderCompletionVelocity` deleted — its work moved into `renderSummaryPreview`.
- Removed unused `.done-file-link`, `.summary-velocity`, `.summary-velocity-num` CSS rules.

## [0.15.2] - 2026-05-06

### Changed — Polish: sidebar cleanup pass

A round of "remove what we don't use, anchor what we do" on the TODOs sidebar.

- **Project rows (Focus section)** drop the ⓘ info icon and the → open-file arrow. The row is a pure filter toggle now; right-click still opens the project menu with both actions.
- **Child rows** lose their per-row → arrow. The parent header's arrow is the single source-of-truth affordance for getting to the file.
- **Header filenames** drop the folder prefix — `2026/May 4, 2026.md` becomes `May 4, 2026.md`. The folder was rarely informative and made the row wrap mid-word in narrow sidebars. The full path is in the row's tooltip. The filename also gets `text-overflow: ellipsis` so very long names truncate cleanly instead of wrapping.
- **Orphan rows** (TODOs not under a `#todo`-tagged header) now show a clickable section label in the same right-side slot as the header filename. The scanner walks back to the nearest preceding markdown heading or bold-subheading line and attaches it as `sectionLabel` on the item; the renderer uses it as the row's source link, opening the file at that section's line. Falls back to the filename when no preceding heading exists. This replaces the per-row → and gives every row context at a glance.

### Internals

- New `TodoItem.sectionLabel` and `TodoItem.sectionLineNumber` fields.
- `TodoScanner` tracks `currentSection` across the file walk; `extractSectionLabel` strips heading/bold markers, tags, and mentions for display.
- Removed `.project-link` / `.project-info-icon` CSS (no longer rendered). `showProjectInfoPopup` is currently unreferenced from the inline UI; left in place for the right-click menu path.

## [0.15.1] - 2026-05-06

### Fixed — Focus row text alignment

The 0.15.0 row-padding change (`.project-item { padding: 4px 6px }`) introduced a 6px misalignment between green-highlighted `#focus` rows and plain rows. The edge-to-edge focus highlight rule was compensating for its own `-16px` margin only, ignoring the new inline padding. Bumped its left/right padding to 22px so highlighted-row text lines up with plain-row text.

## [0.15.0] - 2026-05-06

### Changed — Project rows are filter buttons

The Focus section's project rows lose their checkboxes. The "complete all TODOs in this project at once" pattern was easy to trigger by accident and rarely the right move — a single missed item in the wrong project was a notably annoying recovery.

Clicking a project row now toggles a tag filter on the active TODO list below — same affordance as clicking a tag elsewhere in the sidebar. The active row is highlighted (background tint + accent-coloured, semi-bold text) so the current filter is obvious. Click again to clear.

- The info icon (ⓘ) and the open-file arrow (→) keep their existing behaviour and stop event propagation, so they don't trigger the filter.
- Keyboard: rows are `role="button"` with `tabindex="0"` and respond to `Enter` / `Space`.
- The dead `confirmCompleteProject` and `completeAllProjectTodos` helpers (and their modal) were removed.

This is a minor version bump because the user-facing behaviour of the project row changes meaningfully.

## [0.14.12] - 2026-05-06

### Changed — Polish: focus card transitions

The focus card now reinforces what just happened with motion.

- **Complete**: the title gets a green strikethrough and dims to muted (~180ms), the card washes a soft green at ~18% then ~12% opacity, and fades up-and-out (~480ms). The next card mounts with a calm fade-up (200ms). Total ~580ms — brisk, but enough to land the success.
- **Skip**: current card slides left and fades out (180ms); next card slides in from the right (220ms). Reads as "this one's done with for now, next up".
- **Reduced-motion**: `@media (prefers-reduced-motion: reduce)` strips the slide and the strikethrough but keeps a quick opacity fade on Complete so the success signal stays legible.
- **Internals**: `animatingFocusTransition` flag suppresses the auto-rerender from the scanner's `todos-updated` event so the leaving card can finish its exit before the entering card mounts. The file write runs in parallel with the leave animation so total click-to-next time stays close to the animation budget.

## [0.14.11] - 2026-05-06

### Changed — Focus card primary/secondary button balance

The Complete button now takes twice the width of Skip (`flex: 2` vs `flex: 1`), and Skip's text drops to `--text-faint` (with a hover bump back to `--text-muted`). The two actions read as a clear primary/secondary pair instead of an even pair, which matches their actual weight in the focus loop.

## [0.14.10] - 2026-05-06

### Fixed — Focus Mode Skip works with `focusQueueLimit: 1`

Skip used to be disabled whenever the focus queue had a single item, because the rotate-the-head implementation was a no-op on a one-item array. With the default `focusQueueLimit: 1`, that meant the button was effectively always disabled.

Skip now does what users expect:

- Multi-item queue: rotates the head to the back (existing behaviour).
- Single-item queue with more candidates available: rebuilds from the wider pool, drops the skipped item, and pins the next-best candidate to the front.
- Single-item queue with no other candidates: button stays disabled (no work to skip to).

The `Skip` button is enabled whenever there's at least one other candidate, regardless of queue limit.

## [0.14.9] - 2026-05-06

### Changed — Focus card "open source" arrow

The link to the source file moved from a chain icon hugging the source heading text to a `→` arrow on the far right of the `Focus:` row — same affordance the regular sidebar uses on every TODO row. One symbol now means the same thing in both views, so getting from the focus card back to document context doesn't require a recall.

## [0.14.8] - 2026-05-06

### Changed — Focus Mode header title

The focus-mode sidebar header now reads `TODOs` instead of `Focus`, matching the title of the regular sidebar so the chrome stays consistent across modes. The `FOCUS:` prefix on the source heading inside the card already conveys what mode the user is in.

## [0.14.7] - 2026-05-06

### Fixed — Focus Mode walks items in main-list order

The Focus Mode queue was sorting candidates with `comparePriorityOnly` (raw priority + tag count), which meant a deeply-nested `#p0` child could jump to the front of the queue while the main TODO list still showed an entirely different parent block first. Now both views agree on order.

- New `compareInMainListWalkOrder` comparator in `utils.ts`: groups items by their top-level ancestor, sorts those ancestors with the same `compareWithEffectivePriority` the main list uses, and walks children in document order beneath their parent.
- `buildFocusQueue` uses the new comparator for both the curated `#focus` queue and the priority-fallback queue.
- The "Continue with next priority task" path still ignores the focus tier (its parent ordering goes through `comparePriorityOnly`), so its semantics are unchanged.

### Tests

- New regression test covering the multi-header case: a `#p0` child under a header with otherwise-low priorities does not jump ahead of an earlier header whose children sort higher in aggregate. 109 tests, all passing.

## [0.14.6] - 2026-05-06

### Changed — Focus card checkbox centring (real fix)

Stopped trying to position the checkbox with `margin-top` on the `<input>` element. Themes that style `input[type="checkbox"]` were winning the cascade for sizing, and `em` units on form controls don't always resolve against the inherited font-size — so each margin bump moved less than expected.

The checkbox now lives inside a `.focus-card-checkbox-wrap` whose height is locked to `calc(1.15em * 1.35)` — exactly the title's first-line box. Flex `align-items: center` on the wrapper places the checkbox at the first-line midpoint, regardless of theme overrides.

## [0.14.5] - 2026-05-06

### Changed — More focus card polish

- **Checkbox** dropped further still so its centre lands on the title's first-line midpoint.
- **Buttons** lose their borders, get a smaller bold font, and the Complete button takes white text on a stronger green fill.
- **Spacing** above the buttons now matches the gap between the sidebar header and the card content (2:2 instead of 2:1).

## [0.14.4] - 2026-05-06

### Changed — Focus card visual nits

Three small adjustments after a side-by-side review.

- **Checkbox** dropped further so its centre sits near the midpoint of the title's first line.
- **Date** shrunk to 0.6em so it sits visibly smaller than the tag chiclets and reads as secondary metadata.
- **Buttons** get a noticeably larger gap above them. The Complete button picks up a muted green tint sourced from the theme's `--color-green` (with a sensible fallback when the theme doesn't define one).

## [0.14.3] - 2026-05-06

### Changed — Focus Mode header gets the kebab menu

The slim Focus Mode header now includes the kebab (vertical-dots) menu so all the standard sidebar actions — Refresh, Embed Syntax, Triage, Stats, About, Settings — are reachable without leaving focus mode. The menu is built from a single shared helper used by both the regular and focus headers.

## [0.14.2] - 2026-05-06

### Changed — Focus Mode keeps the sidebar header

The slim sidebar header (logo + `Focus` label) is now rendered above the focus card. It anchors the user in the plugin without bringing back the tab nav or menu. The focus card sits ~2em below it for breathing room.

- The logo retains its click-for-About affordance.
- No tabs, no menu button — exit is still via the link below the actions.

## [0.14.1] - 2026-05-06

### Changed — Focus Mode card polish

Follow-up tuning pass on the 0.14.0 card refresh based on side-by-side review.

- **Heading** now reads `FOCUS: <source>` — the prefix sits in small-caps faint text so the source name still leads visually.
- **Checkbox** vertical alignment nudged down so it centres on the first line of the title.
- **Date** reverts to `D/M/YYYY` and matches the tag font size. The `(modified)` suffix is gone — it added noise without helping the user act on the task.
- **Tags + date** share a single row: tags left-aligned, date pushed to the right when both fit, wrapping cleanly otherwise.
- **Buttons** dialled back to a quiet treatment — no shadow, lower contrast, and a hover-only emphasis. The Complete/Skip pair reads as a soft pair rather than a primary/secondary call-out.

## [0.14.0] - 2026-05-06

### Changed — Focus Mode card refresh

Quality-of-life pass on the immersive Focus Mode card to keep the eye on the task itself, not the chrome around it.

- **Removed** the priority-fallback hint, the `FOCUS (1 of N)` counter, the `From` label, and the explicit `Tags`, `Date`, and `Source` row labels.
- **Source heading** now sits above the title as plain italic text at 0.85 opacity. A small link-icon affordance opens the source file at the task's line.
- **Source row removed**: the file path is no longer shown as a separate row; the link icon next to the heading replaces it.
- **Tags** render as faded pill chiclets — visible, but de-emphasized so the task title leads.
- **Date** is shown without a label and reformatted as `Tuesday May the 5th`. Modified-date items still get a small `(modified)` suffix.
- **Checkbox** added to the left of the title, mirroring the in-doc affordance. Checking it completes the task.
- **Buttons** relabeled `Complete` / `Skip` and given a more polished primary/secondary treatment with a subtle press effect.
- **Exit link** now reads `Exit focus mode →` and the arrow nudges right on hover.

## [0.13.0] - 2026-05-04

### Changed — Header TODO completion semantics

Header TODOs that contain children no longer have a checkbox in the sidebar or in `{{focus-todos}}` embeds. Completing a header used to cascade-complete every child in the block, which was easy to trigger by accident from a single click.

- **Sidebar**: Header items with children are rendered without their checkbox. Children are completed individually.
- **Embeds**: Same — header items with children show no checkbox.
- **Processor**: `completeTodo()` refuses to act on a header-with-children and shows a notice. The dead `completeChildrenLines` helper was removed. The "Move to..." action still bundles header + children (unchanged).

### Changed — Focus Mode queue surfaces children directly

Header TODOs with children no longer appear in the immersive Focus Mode queue. Their children are eligible queue entries instead, with the parent header text shown as a `From <header>` context line above the focus card title.

- `buildFocusQueue` candidate filter updated: header-with-children entries dropped; bold subheading dividers dropped; children eligible.
- `renderFocusItem` adds a `.focus-card-from` row when the active item has a `parentLineNumber`.
- The dead "render children inside the focus card" block was removed (it's unreachable now that header-with-children entries don't reach the focus card).

### Tests

- Updated 2 tests to reflect the new "child stands in for header" semantics; added 2 new tests covering leaf-header inclusion and subheading-divider exclusion. 108 tests, all passing.

## [0.12.1] - 2026-05-04

### Documentation — Focus Mode redesign, Phase 4 + cleanup pass

Documentation pass closing out the Focus Mode redesign and tidying the project's docs tree. No behaviour change.

- **`DESIGN.md`** Focus Mode section expanded: queue computation pseudocode, full state machine, settings table, and class/file touchpoint listing.
- **Top-level cleanup**: pre-implementation design artifacts (`IDEAS.md`, `OUTLINE.md`, `plan.md`) removed from the project root.
- **`docs/` cleanup**: completed implementation plans removed now that their features are shipped and documented in `DESIGN.md` and the surviving feature reference docs:
  - Deleted: `focus-mode-IDEAS.md`, `focus-mode-OUTLINE.md`, `focus-mode-PLAN.md`, `mentions-PLAN.md`, `moved-tag-PLAN.md`.
  - Kept: `mentions-ARCHITECTURE.md`, `mentions-DESIGN.md`, `moved-tag-ARCHITECTURE.md` (feature reference, not plans).

## [0.12.0] - 2026-05-04

### Changed — Focus Mode redesign, Phase 3 (cutover)

The immersive Focus Mode is now the default. Eye-icon click in the Projects section header enters focus mode; the in-card "Exit focus mode" link returns to the normal sidebar.

- **Eye icon repurposed**: Single click in the TODOs tab's Projects section header now enters immersive Focus Mode. No toggle/active state — the icon is only visible in normal mode (Focus Mode hides the entire sidebar chrome).
- **Persistence**: Focus Mode on/off state now persists across Obsidian sessions by default. Disable via the new "Persist focus mode across sessions" setting (introduced in 0.10.0); when off, the mode resets to off on each plugin load.
- **Tab and scroll restore**: Exiting focus mode returns the sidebar to the tab and scroll position you were on when you entered.
- **Continue button** now advances through the priority queue: each Done after "Continue with next priority task" pulls in the next-highest-priority TODO; reaching the end shows a "All caught up." empty state.

### Removed

- **Legacy focus filter**: The old "filter to #focus items only" behaviour of the eye icon is gone. The Ideas tab no longer has a focus filter button.
- **`focusModeIncludeProjects` setting**: Removed. Existing setting values are silently ignored on load. The behaviour (showing all TODOs from focused projects) doesn't apply to the immersive mode, which surfaces one TODO at a time.

### Migration notes

If you relied on the old filter to scan a list of focused items, the closest equivalent is the `{{focus-list}}` embed (unchanged). The right-click "Focus" action on items still toggles the `#focus` tag.

## [0.11.0] - 2026-05-04

### Added — Focus Mode redesign, Phase 2 (view layer)

The immersive Focus Mode view is now reachable. Toggle is not yet wired to the eye icon (Phase 3); for now, enter via the sidebar's hamburger menu → "Enter focus mode". The legacy filter behaviour is unchanged.

- **Focus card**: replaces sidebar content with a single TODO at a time. Shows title (~1.4× scale), tag badges (project / priority / custom; capped at 6 with `+N more` overflow), date (`@YYYY-MM-DD` annotation when present, else file-modified time), and a click-to-open source link. Header TODOs render with their child list inside the card.
- **Done / Skip / Exit**: Done completes the current item via the existing `completeTodo` flow; Skip rotates the active item to the back of the queue (in-memory); the in-card "Exit focus mode" link returns to the normal sidebar.
- **Completion state**: when the curated `#focus` queue empties, the card shows a friendly message and two buttons — "Exit focus mode" or "Continue with next priority task". Continue switches to priority-fallback mode and surfaces the next-highest-priority item with a hint.
- **Priority-fallback hint**: when no `#focus` items exist on entry (or while in continue mode), the card shows "No focus items — showing top priority" above the title.
- **Empty state**: distinct UI when nothing is left to focus on.
- **`buildFocusQueue` options arg**: `forceFallback: true` skips the curated `#focus` filter and returns top-priority items instead — used by the Continue button.
- **`comparePriorityOnly`**: a focus-tier-agnostic comparator used by the priority-fallback path so `#focus`-tagged items don't dominate when continuing.
- **`rotateQueue<T>()`**: small helper that rotates the head of an array to the tail (used by Skip).
- **`FocusQueueState`**: new exported type tracking the active queue, its source, and continue-mode state.
- **Tests**: 7 new unit tests covering `forceFallback`, `rotateQueue`, and the priority-only comparator path. 106 tests total, all passing.

### Pending in Phase 3

- Wire the existing eye-icon toggle to flip `focusModeActive` (currently still toggles the legacy filter).
- Persist `focusModeActive` across sessions; honour `focusModePersist`.
- Remove the legacy filter logic and the `focusModeIncludeProjects` setting.
- Restore prior tab and scroll position on exit.

## [0.10.0] - 2026-05-04

### Added — Focus Mode redesign, Phase 1 (data layer)

Foundational data layer for the new immersive Focus Mode. No user-visible behaviour change yet — the existing focus filter still runs. Subsequent phases will replace the filter with a single-task focus card.

- **New settings**:
  - `focusQueueLimit` (1–5, default 1): max items shown in the upcoming Focus Mode queue.
  - `focusModePersist` (default true): whether Focus Mode state will persist across sessions.
  - `focusModeActive` (internal, default false): persisted on/off for the new mode.
- **`buildFocusQueue()`**: helper that builds the focus queue from active TODOs. Top-level items only; #focus-tagged items first, falling back to top-priority items when none exist; respects the queue limit. Snoozed items excluded.
- **`getItemDate()`**: helper that resolves an item's display date — `@YYYY-MM-DD` annotation if present, else file mtime, else none.
- **New types**: `FocusQueueResult`, `FocusQueueSource`, `ItemDate`, `ItemDateKind` exported from `types.ts`.
- **Tests**: 16 new unit tests covering queue computation, header handling, snoozed filtering, priority fallback, and date resolution.

## [0.9.131] - 2026-04-23

### Fixed

- **Header sort preserves subheading sections**: Sorting a header block with bold subheading dividers (e.g., `**Diagnostics (P0)**`) now sorts items within each section independently instead of treating everything as a flat list. Indented sub-items also stay attached to their parent.

## [0.9.130] - 2026-04-20

### Fixed

- **Header block filename**: Shows as `folder/filename.md` in a consistent style, matching the summary block pattern.
- **Focus background extends edge-to-edge**: Focus-highlighted items now fill the full sidebar width without rounded gaps.
- **Empty subheading sections skipped**: Subheading labels with no task items beneath them are no longer rendered in the sidebar or embeds.

## [0.9.129] - 2026-04-20

### Added

- **Default assignee for unattributed tasks**: New "Default assignee" setting under Team. When set, tasks without explicit @mentions are treated as belonging to the selected person for filtering purposes. Options: None, @me, or any team member.
- **Subheading labels in header block TODOs**: Bold-prefixed lines within a `#todo` header block (e.g., `**Diagnostics (P0)** @me`) now appear as section dividers in the sidebar and embeds, with clickable `@mention` badges.

## [0.9.127] - 2026-04-20

### Fixed

- **@me filter now works with child items**: The assignee filter was only checking top-level items and headers, missing `@me` on child TODOs nested under headers. Headers with matching children now pass the filter.
- **Assignee dropdown shows all mentioned handles**: Handles found in TODOs but not in `team.md` now appear in the dropdown, so filtering works even without a complete team file.

### Added

- **Clickable @mention badges**: Clicking an `@handle` badge in the sidebar filters the list to that person. Hover states provide visual affordance.

---

## [0.9.126] - 2026-04-20

### Improved

- **Sidebar links reuse open tabs**: Clicking a → link now switches to an already-open tab showing that file instead of replacing the current tab's content. Falls back to the current tab if the file isn't open anywhere.

---

## [0.9.125] - 2026-04-20

### Fixed

- **Assignee dropdown dismisses on click outside**: The `@` filter menu now closes when clicking anywhere else, matching the tag dropdown behaviour.
- **Assignee button styling matches eye icon**: The `@` button now uses the same opacity pattern as the focus mode toggle: subtle when inactive, accent-coloured when active.

---

## [0.9.124] - 2026-04-20

### Improved

- **Sidebar badge order**: @mention badges now render before tag indicators, so attributed people appear first in the item row.

---

## [0.9.123] - 2026-04-20

### Fixed

- **Header TODOs now hide when all children are done or moved**: Block-level `#todo` headers (e.g., `## Sprint 12 #todo`) no longer appear in the sidebar or embeds when every child item underneath has been completed, moved, or snoozed. The filtering now runs at scan time in the scanner itself, eliminating timing issues with render-time filters.

---

## [0.9.122] - 2026-04-20

### Added

- **@mention attribution tags**: Assign TODOs to people with `@handle` mentions (e.g., `- [ ] Review spec #todo @eric.m`). Mentions behave like topic tags but styled with a more subdued colour to distinguish them.
- **Team file**: Define your team in `team.md` at the vault root using `- @handle — Display Name` syntax. Mark yourself with `(me)`. Unknown handles encountered in TODOs are auto-added.
- **Autocomplete**: The `@` trigger now offers both dates and team members in a single suggestion popup. Date keywords take priority, then user handles.
- **Sidebar assignee filter**: Filter the active TODO list by assignee using a dropdown in the sidebar header. Includes Everyone, @me, each team member, and Unassigned.
- **Sidebar assignee stats**: Per-person mention counts shown in the Summary section when mentions exist in the vault.
- **Embed assignee filter**: Use `assignee:@handle` (or `assignee:@me`) in code block and inline embed filters to scope embedded lists by assignee.
- **@me sort boost**: Items mentioning `@me` get a soft sort boost within the same priority tier, surfacing your own tasks first.
- **Team settings**: New "Team" section in settings with file path configuration, open/create buttons, and a read-only team roster display.

---

## [0.9.121] - 2026-04-17

### Improved

- **Summary top backlogs always visible**: Removed collapsible toggle from the top backlogs list in the Summary section. The list is now always shown when qualifying projects exist, matching the always-visible pattern of the other summary blocks.

---

## [0.9.120] - 2026-04-17

### Added

- **Sidebar Summary section**: Replaces the minimal "Done" link with an inline summary at the bottom of the TODOs tab. Shows priority breakdown (two-column grid of #today, #p0-#p4, #focus, unmarked, snoozed counts), completion velocity (items done today/this week/this month), and a collapsible top backlogs list highlighting projects with the most TODOs. The done file link is preserved in the section header.

---

## [0.9.119] - 2026-04-17

### Fixed

- **#focus items now sort to top**: Items tagged `#focus` always appear above non-focused items in the sidebar and embeds. Previously `#focus` was treated as a low priority level (value 7 of 9), causing focused items to sort near the bottom. Now `#focus` acts as a sort tier — focused items sort first, then by priority within each tier. Header TODOs inherit focus from their children, and projects with focus items also sort above those without.

---

## [0.9.118] - 2026-04-17

### Improved

- **Block-aware scroll-to**: Clicking the → arrow in the sidebar or embeds now scrolls the full block (header + children) into view and positions the target line in the upper portion of the viewport. Previously only the target line was scrolled into view near the bottom of the window, making it hard to spot. For items without children, the scroll scans forward to the next header to include surrounding content.

---

## [0.9.117] - 2026-04-02

### Fixed

- **Header TODO block disappears after completing a child item**: `scanFile()` checked `fileHasRelevantTags()` against the metadataCache before reading the file. When called directly from `completeTodo()` (after `vault.modify()`), the metadataCache hadn't updated yet, returning `null` and causing the entire file to be evicted from cache. Moved the metadataCache guard to the watcher callback where the cache is guaranteed fresh; `scanFile()` now always reads and parses the file content.

---

## [0.9.116] - 2026-04-01

### Improved

- **Sidebar header filenames**: Project file headers (e.g., "gdrive mcp") now show descriptive filenames on a separate line below the header for better readability. Date-based filenames (daily notes) remain inline on the same row.

### Fixed

- **URL scheme injection**: Markdown links in the sidebar now only open `http://` and `https://` URLs, blocking `javascript:` and other dangerous schemes.
- **Regex escaping in tag operations**: Tag values are now escaped before regex interpolation in TodoProcessor for defence-in-depth against potential ReDoS.

## [0.9.115] - 2026-03-30

### Added

- **Copy as Notion Markdown** command (Cmd/Ctrl+Shift+N): Copies selected text as Notion-compatible markdown. Converts Obsidian wiki links to plain text, strips embeds, converts callouts to blockquotes, and removes plugin-specific tags (#todo, #todone, #p0–#p4, #focus, #future, #moved). Standard markdown (bold, italic, code, links, lists, headings, checkboxes) is preserved. Also available from the editor right-click menu.

## [0.9.114] - 2026-03-30

### Added

- **`#moved` lines visually dimmed in documents**: Lines containing `#moved` tags now render at reduced opacity (0.45) in both Reading mode and Live Preview, making them visually distinct from active TODOs and completed TODONEs. Hover restores readability (0.8). Uses Obsidian's native `a.tag[href]` and `.cm-tag-*` CSS selectors with `:has()` for line-level targeting.

## [0.9.113] - 2026-03-30

### Changed

- **Simplified sidebar DONE section**: Removed the TODONE item list from the sidebar. The DONE section now shows only the heading and a link to the done file. Open the file to see completed items.
- Removed the "Recent TODONEs limit" setting (no longer applicable).

## [0.9.112] - 2026-03-30

### Added

- **`#moved` tag for TODO provenance tracking**: When TODOs are relocated between files, the source line gets `#todo` replaced with `#moved @date`, keeping an audit trail while eliminating duplicates. The scanner excludes `#moved` lines from all caches, sidebar, and embeds.
- **"Move to..." context menu action**: Right-click any TODO in the sidebar or embed to move it to another file. Opens a file picker showing pinned/bookmarked files, open tabs, recent move targets, then all vault files.
- **"Move TODO to another file" command**: Available from the command palette, operates on the TODO at the cursor position.
- **Auto-stamp dates on `#moved` lines**: Manually typing `#moved` without a date triggers automatic date stamping. Uses the filename date (for log files like `2026-03-30.md`) or today's date as fallback.
- **Move history tracking**: Recent move destinations (last 10) are persisted in settings and shown first in the file picker.
- Unit tests for `replaceTodoWithMoved`, `extractDateFromFilename`, and `#moved` tag handling.

## [0.9.111] - 2026-03-26

### Fixed

- **`#focus` highlight no longer shifts item spacing**: Removed `padding` and `margin` from the focus highlight rules for todos, projects, ideas, and principles. The highlight now applies only `background-color` and `border-radius` to the `<li>` element, which already carries the standard `padding: 4px 0` from the base item style. For header items with children, the `<li>` covers the full block (header row plus child list) naturally via `display: block`, so the highlight is visually complete without layout side-effects.

## [0.9.110] - 2026-03-26

### Improved

- **Faster vault scan on startup**: `scanVault()` now checks `metadataCache.getFileCache()` before reading each file. Files with no plugin-relevant tags (`#todo`, `#todone`, `#idea`, `#principle`, and their variants) are skipped entirely, eliminating unnecessary I/O. For vaults where tagged files are a small fraction of the total, startup scan time drops proportionally.
- **Eliminated redundant scans on every edit**: `vault.on("modify")` has been removed as a scan trigger. It fired before Obsidian finished parsing the file, causing a wasted scan against stale cache state immediately followed by the correct scan from `metadataCache.on("changed")`. Incremental updates now use only the `metadataCache.on("changed")` event, which fires exactly once per change after parsing is complete.
- **Sidebar populates with data on first render**: The initial vault scan is now deferred to `workspace.onLayoutReady`, which fires after Obsidian's metadata cache has completed its initial indexing pass. Previously, the scan ran in `onload()` and could race the cache; the sidebar now activates after the scan finishes rather than before.
- **Removed redundant cache-delete patterns**: Extracted `evictFile(path)` helper in `TodoScanner`, replacing four repetitions of the four-cache delete pattern in the delete and rename watchers.

### Added

- Unit tests for `hasCachedRelevantTags()` (17 cases) covering undefined, empty, non-relevant tags, all nine plugin tag variants, case-insensitivity, mixed arrays, priority-tag exclusion, and no-substring-match behaviour.

## [0.9.109] - 2026-03-26

### Improved

- **Resilient write-back via content fingerprinting**: All item modification operations now recover gracefully when external edits (sync services, other editors, git operations) have shifted line numbers since the last scan. Each `TodoItem` carries a `fingerprint` — the human text of the line stripped of tags, dates, and markdown markers — which stays stable across tag changes and completion. At write time, the stored line number is checked first; if the fingerprint doesn't match, the plugin searches ±15 lines and then the full file before giving up. This eliminates the most common cause of "file may have been modified" errors.

### Added

- Unit test suite via Vitest covering `createFingerprint` (18 cases) and `resolveLineNumber` (11 cases), including fast-path, nearby, full-scan, empty fingerprint, and duplicate-line disambiguation scenarios.

## [0.9.108] - 2026-03-26

### Fixed

- **Concurrent write race condition**: `scanFile()` was firing three separate `vault.modify()` calls without `await`, causing concurrent writes that could overwrite each other and emitting `todos-updated` before any write completed. All scan-time line mutations (duplicate tag cleanup, checkbox sync, idea tag removal) are now batched into a single awaited write.
- **`addTag()` false deduplication**: Using `line.includes(tag)` meant adding `#todo` to a line containing `#todone` was incorrectly skipped. Now uses a word-boundary regex check.
- **`getTodos()` ignored excluded files**: The archive file exclusion applied to `getTodones()`, `getIdeas()`, and `getPrinciples()` but not `getTodos()`, causing archive items to appear in the active todo list.
- **`todone:show|hide` filter not applied**: The filter was parsed correctly but never used in `FilterParser.applyFilters()`. It now hides or shows only todone items as specified.
- **`setPriorityTagSilent()` silently failed for child items**: Batch focus/snooze operations skipped child items that inherit todo status from a parent header. Now mirrors the child item logic from the public `setPriorityTag()`.
- **`#today` tag not removed when changing priority**: Setting a new priority via the context menu now removes `#today` along with `#p0`–`#p4` and `#future`.
- **`hasContent()` missed `+` list marker**: Lines like `+ #todo` were incorrectly treated as having content. Added `+` to the list marker strip.

### Improved

- Extracted `modifyFileLine()` helper into `utils.ts`, replacing ~10 duplicated read-split-modify-join-write patterns across `TodoProcessor`. All file modifications now go through a single validated, bounds-checked path.

## [0.9.107] - 2026-03-23

### Removed

- **LLM features removed**: Define, Rewrite, and Review commands have been removed from the context menu. These will return as a dedicated plugin.
  - Removed "Define term...", "Review...", and "Rewrite..." context menu items
  - Removed all LLM provider settings (Ollama, OpenAI, Gemini, Anthropic)
  - Removed prompt configuration settings
  - The shared LLM library remains intact for future use

## [0.9.106] - 2026-02-07

### Improved

- **Focus mode now scopes Ideas and Principles to focused projects**: When focus mode is enabled with "Focus mode includes project TODOs" setting, Ideas and Principles from focused projects are now shown (matching how TODOs work)
  - Previously, Ideas and Principles only showed items with `#focus` tag directly
  - Now shows items from any project that has at least one `#focus` item
  - Empty state messages updated to reflect project-scoped filtering

## [0.9.105] - 2026-02-07

### Added

- **Multi-provider LLM support**: Define, Rewrite, and Review now support multiple LLM providers
  - **Ollama** (local, default)
  - **OpenAI** (GPT models via API key)
  - **Google Gemini** (via API key)
  - Provider selection and API key configuration in Settings → LLM Settings
  - Uses shared LLM client module for consistency with Hugo Command

### Improved

- **Documentation**: Added sections for Slash Commands, Date Suggestions, Stats/Triage, and Copy as Slack

## [0.9.104] - 2026-02-05

### Improved

- **Refactored to use shared utilities**: Extracted common patterns to a shared module for consistency across plugins
  - Notice display now uses shared `createNoticeFactory` pattern
  - Sidebar management (activate, toggle, refresh) now uses shared `SidebarManager` class
  - Reduces code duplication across the Obsidian plugins monorepo

## [0.9.103] - 2026-02-02

### Fixed

- **Header TODO priority now respects header tags**: Headers with priority tags (like `#focus`) now sort at least as high as their tags indicate, even if children have no priority
  - Previously, a header with `#focus` but unmarked children sorted at priority 8 (unmarked), appearing below other items
  - Now uses the better (lower) of header priority or child average
  - A `## Project #todo #focus` with unmarked children sorts at priority 7 (`#focus`), not 8
  - Headers with high-priority children still benefit from child priority (e.g., a `#p0` child pulls the header up)

## [0.9.102] - 2026-02-02

### Improved

- **Checkbox sync now works for all TODOs**: Checking a checkbox (`- [x]`) on any `#todo` item now automatically adds `#todone @date`, not just items in the sidebar
  - Previously, only sidebar interactions triggered the `#todo` → `#todone` conversion
  - Now, checking a checkbox anywhere in the editor (Live Preview, Reading Mode, or source) syncs the tag state
  - Works for both standalone TODOs and child items under header TODOs

- **Checkbox sync for ideas**: Checking a checkbox on a `#idea` item removes the tag, turning it into a regular completed list item
  - Consistent with sidebar behavior where completing an idea removes it from tracking

## [0.9.101] - 2026-02-02

### Fixed

- **Scanner no longer skips lines with mixed backticked/real tags**: Lines containing documentation examples in backticks (like `` `#idea` ``) alongside real tags (like `#p0 #focus`) are now processed correctly
  - Previously, if ANY plugin tag appeared inside backticks, the entire line was skipped
  - This caused child TODOs with real priority tags to be missing from parent header calculations
  - Resulted in incorrect sort order where high-priority items appeared below headers containing only snoozed items
  - `extractTags()` already correctly ignores backticked content; the redundant `isInInlineCode()` check was removed

## [0.9.100] - 2026-02-02

### Improved

- **Tag dropdown now toggles on click**: Clicking the `#` icon a second time now dismisses the tag menu instead of reopening it
  - More intuitive interaction matching standard dropdown behavior

## [0.9.99] - 2026-02-02

### Improved

- **Focus mode now starts off by default**: The sidebar now shows all TODOs on plugin load instead of only `#focus` items
  - Click the eye icon to enable focus mode when you want to narrow down to focused items
  - More intuitive: see everything first, then filter down as needed

## [0.9.98] - 2026-02-02

### Fixed

- **Header TODO priority now excludes snoozed children**: When calculating a header's effective priority (used for sorting), snoozed children (`#future`, `#snooze`, `#snoozed`) are now excluded from the average
  - Previously, a header with one `#p0` child and three `#future` children would average to ~7.25, sorting below a standalone `#focus` item
  - Now only active children are considered, so the header sorts at priority 2 (`#p0`)
  - Prevents headers with deferred work from pushing focused items down the list

- **Sorting now uses full child list for priority lookup**: Fixed issue where header TODO sorting couldn't find children because they were filtered out before sorting
  - Child items are filtered from display (they render under their parent), but now remain available for priority calculation
  - Affects both sidebar and embedded TODO lists

## [0.9.97] - 2026-02-02

### Changed

- **`#focus` is now a visibility filter, not a priority level**: The `#focus` tag marks items for focus mode filtering, not priority sorting
  - Previously `#focus` sorted highest (above `#p0`), which mixed "what to see" with "what's important"
  - Now `#focus` sorts after `#p4` but before unmarked items (priority value 7)
  - If an item has both `#focus` and a priority tag (e.g., `#focus #p1`), the priority tag determines sort order
  - Focus mode filtering unchanged: toggle still shows only `#focus` items

- **Header TODOs now sort by average child priority**: Headers with children (e.g., `## Project #todo` with child tasks) sort by the average priority of their active children
  - Prevents high-priority standalone items from being buried below low-priority header blocks
  - A header with one `#p0` child and three unmarked children sorts at ~5.5 (between `#p3` and `#p4`)
  - Headers without children sort by their own priority tags

### Technical

- New `getEffectivePriority()` and `compareWithEffectivePriority()` functions in `utils.ts` for header averaging
- Added `hasFocusItems` field to `ProjectInfo` for focus mode filtering (separate from `highestPriority`)
- Updated DESIGN.md with priority system documentation

## [0.9.96] - 2026-02-02

### Fixed

- **Priority tag sorting is now case-insensitive**: Tags like `#P0`, `#Focus`, or `#TODAY` now work the same as their lowercase equivalents
  - Previously `#P0` (uppercase) would not affect sort order; only `#p0` (lowercase) was recognized
  - The fix applies to all priority-related tags: `#focus`, `#today`, `#p0`-`#p4`, `#future`, `#snooze`, `#snoozed`
  - Tag counting for tertiary sort (more project tags = higher priority) is also now case-insensitive

## [0.9.95] - 2026-01-31

### Improved

- **Completing ideas now marks checkbox as checked**: When you check off an idea in the sidebar, the checkbox is now marked complete (`- [ ]` → `- [x]`) in addition to removing the `#idea` tag
  - Completed ideas become regular checked list items
  - They no longer appear in any sidebar tab

## [0.9.94] - 2026-01-31

### Fixed

- **Ideas tab no longer shows items from done.md**: The TODONE archive file is now excluded from Ideas and Principles lists, not just Recent TODONEs
  - Previously, any `#idea` or `#principle` tags in done.md would appear in the Ideas tab
  - The archive file exclusion setting now applies to all sidebar lists

## [0.9.93] - 2026-01-31

### Changed

- **Header TODO scope now ends at any sub-header**: Previously, a `## Header #todo` would capture list items under nested headers like `### Sub-section`. Now the scope ends at the first subsequent header of any level.
  - Only list items directly following the tagged header become children
  - More predictable behaviour when headers have internal structure
  - Example: `## Project #todo` with `- Task A` then `### Details` then `- Task B` — only "Task A" is now a child of the project

## [0.9.92] - 2026-01-30

### Improved

- **Focus mode in Ideas tab**: Ideas tab now has focus mode filtering like the TODOs tab
  - Eye icon toggle in Ideas tab header (shared state with TODOs tab)
  - When enabled, Principles section filters to show only `#focus` principles
  - When enabled, Ideas section filters to show only `#focus` ideas
  - Focus mode is now enabled by default for both tabs
  - Empty states show "No focused principles/ideas" when filtering

## [0.9.91] - 2026-01-30

### Fixed

- **Slack copy preserves markdown links**: Links (`[text](url)`) and images (`![alt](url)`) are now kept as-is when copying as Slack markdown
  - Slack renders markdown links correctly, so no conversion needed
  - Previously converted to `text (url)` format which broke clickable links

## [0.9.90] - 2026-01-30

### Improved

- **Standardized kebab menu order**: Sidebar menu now follows consistent order across all Command plugins
  - Refresh appears first as the most common action
  - Plugin-specific items (Embed Syntax, Triage, Stats) grouped together
  - About and Settings always appear last

## [0.9.89] - 2026-01-29

### Fixed

- **Header TODOs with only empty children now hidden**: Headers where all children have no content (like `- [ ]`) are now filtered out
  - The scanner skips empty children, leaving `childLineNumbers` empty
  - Previously, an empty children array was treated as "not a header with children" and kept visible
  - Now correctly interprets empty children array as "all children were empty" and filters out the header

## [0.9.88] - 2026-01-29

### Fixed

- **Header TODOs hide when children are empty**: Header blocks now correctly hide from sidebar and embeds when all child lines have no content
  - Previously, empty child lines (like `- [ ]`) counted as "active" and kept the header visible
  - Now treats non-existent or empty children the same as completed/snoozed children
  - Header only appears when it has at least one child with actual content

## [0.9.87] - 2026-01-29

### Improved

- **Header filename positioning**: Filename indicator for header blocks now appears before tags and link arrow for consistent layout
  - Vertically centred in the row
  - Order: text → filename → tags (#) → link (→)

## [0.9.86] - 2026-01-29

### Added

- **Filename shown for header blocks**: Header items with children (grouped TODOs, ideas, principles) now display the source filename in a monospace font
  - Only appears for headers that have nested child items
  - Shows just the filename (basename), not the full path
  - Helps identify which file a grouped block belongs to at a glance

## [0.9.85] - 2026-01-29

### Improved

- **Embed list indentation matches editor**: Nested items in embeds now indent like the editor view (1.5em) instead of being flush like the sidebar
  - Previously, embeds used sidebar styling (compact, no indentation)
  - Now embeds match Obsidian's native list indentation for consistency
  - Sidebar retains compact flush styling for space efficiency

## [0.9.84] - 2026-01-29

### Improved

- **Rewritten Slack markdown converter**: Replaced `slackify-markdown` library with custom implementation
  - Lists now preserve original format (dashes stay as dashes, not converted to bullet points)
  - Checkboxes (`- [ ]` and `- [x]`) are preserved instead of being stripped
  - Nested list indentation preserved as-is
  - Better bold/italic handling without zero-width space artifacts
  - Smaller bundle size (removed 68 packages)

### Technical

- Removed `slackify-markdown` dependency
- Custom `SlackConverter.ts` handles: bold, italic, bold+italic, strikethrough, code, links, images, headings, blockquotes

## [0.9.83] - 2026-01-29

### Added

- **Auto-checklist for tagged headers**: When you press Enter at the end of a header line tagged with `#todo(s)` or `#idea(s)`, a blank checklist item (`- [ ] `) is automatically inserted below
  - Works with all variants: `#todo`, `#todos`, `#idea`, `#ideas`
  - Only triggers when cursor is at end of line and next line is empty
  - Positions cursor ready to type the first item
- **New slash commands**: `/idea` and `/ideas` for quick idea capture
  - `/idea` inserts `- [ ] #idea ` with cursor positioned to type
  - `/ideas` inserts a header with checklist: `## Ideas #ideas` followed by `- [ ] `
- **Improved `/todos` command**: Now inserts `## TODOs #todos` with proper tag (was inserting `## TODOs` without tag)

## [0.9.82] - 2026-01-29

### Fixed

- **Triage escaped tags**: Escaped tags (`\#example`) now display correctly in task text as `#example` and are excluded from the tag list. Uses placeholder approach instead of negative lookbehind for better compatibility.

## [0.9.81] - 2026-01-29

### Fixed

- **Triage text wrapping**: Set fixed 550px width on content to enable text wrapping (previous fix had no width constraint for text to wrap against)

## [0.9.80] - 2026-01-29

### Fixed

- **Triage content display**:
  - Tags with dashes now stripped correctly (e.g., `#cdv-lift` no longer leaves `-lift` behind)
  - Escaped tags (`\#tag`) are preserved and displayed as `#tag`
  - Long content now wraps instead of expanding modal width
  - Added 1em spacing above the context header

## [0.9.79] - 2026-01-29

### Improved

- **Triage dynamic title**: Title now reflects item type - "Triage your *tasks*", "Triage your *ideas*", or "Triage your *snoozed items*" with the type in italics

## [0.9.78] - 2026-01-29

### Fixed

- **Triage modal scrolling**: Removed negative margin trick on header that caused horizontal overflow. Increased padding to 24px for better spacing.

## [0.9.77] - 2026-01-29

### Fixed

- **Triage modal padding**: Fixed asymmetric left/right padding by letting modal auto-size to button width with symmetric padding

## [0.9.76] - 2026-01-29

### Fixed

- **Triage modal width**: Fixed horizontal scrolling by setting width on the parent modal container instead of the content div

## [0.9.75] - 2026-01-29

### Improved

- **Triage modal layout**:
  - Wider modal (580-650px) so all buttons fit on one line
  - Doubled separator spacing (40px above/below) for better visual separation
  - Replaced "File this TODO..." text with parent header context (if item has one), otherwise blank

## [0.9.74] - 2026-01-29

### Added

- **Triage back button**: Icon-only back button (⏮) to the left of Skip allows stepping back to review previous items. Disabled when at first item.

## [0.9.73] - 2026-01-29

### Changed

- **Triage button order**: Reordered buttons to Snooze | Clear | → Idea/TODO | Focus | Skip for better workflow

## [0.9.72] - 2026-01-29

### Improved

- **Triage modal enhancements**:
  - Task text now renders markdown (bold, italic, code, links) instead of plain text
  - Increased separator line spacing to match modal padding (20px above/below)

## [0.9.71] - 2026-01-29

### Improved

- **Triage modal layout polish**:
  - Title changed to "Triage your tasks"
  - Header row aligned with modal close button for better visual balance
  - Equal padding above and below the separator line
  - Separator line colour now matches text for subtler appearance

## [0.9.70] - 2026-01-29

### Improved

- **Triage skips header items**: Header TODOs/Ideas (e.g., `## Project #todo`) are now excluded from triage. These represent groups of subtasks and triaging them individually causes confusion since their children aren't visible in the modal. Subtasks under headers are still included.

## [0.9.69] - 2026-01-29

### Fixed

- **Triage modal padding regression**: Restored interior padding that was accidentally removed

## [0.9.68] - 2026-01-29

### Improved

- **Triage modal polish**:
  - Type prompts now have ellipsis ("File this TODO...")
  - All action buttons now have tooltips explaining their function
  - Better Skip icon (skip-forward style ⏭)
  - Sun icon for Wake button (clearer "unsnooze" metaphor)
  - Convert button (→ Idea/TODO) now has blue background for visibility
  - Snooze button now has orange background
  - Fixed tag top padding

## [0.9.67] - 2026-01-29

### Fixed

- **Triage modal layout fixes**:
  - Fixed source file and tags not appearing on same line (added !important to override Obsidian styles)
  - Removed extra right padding on modal

## [0.9.66] - 2026-01-29

### Improved

- **Triage modal refinements**:
  - Added checkbox to item content - click to mark as done and advance
  - Source file and tags now on same line (filename left, tags right)
  - More compact metadata display

## [0.9.65] - 2026-01-29

### Improved

- **Triage modal layout polish**:
  - Header: Logo and title on same line (matching sidebar style), progress counter at top-right
  - Helpful type prompts: "File this TODO", "File this Idea", "Wake this TODO?"
  - Tags now use native Obsidian tag styling
  - Source file shown as "(from filename.md)"
  - Separator line between content and action buttons
  - Left-aligned content for better readability

## [0.9.64] - 2026-01-29

### Improved

- **Enhanced triage modal actions**: More options and clearer UI
  - Added "→ Idea" button to convert TODOs to Ideas (and vice versa)
  - Added "Clear" button to remove the item's type tag entirely
  - All buttons now have icons for faster recognition
  - Button order: Skip | → Idea/TODO | Clear | Focus | Snooze
  - "Wake" label for unsnoozed items (clearer than "Unsnooze")

## [0.9.63] - 2026-01-29

### Added

- **Triage feature**: New modal for quickly processing TODOs and Ideas
  - Accessible from the kebab menu ("Triage") or via the alert button
  - Shows items one at a time with Skip, Focus, and Snooze/Unsnooze actions
  - Items ordered by priority: active TODOs, active Ideas, snoozed TODOs, snoozed Ideas
  - Already focused items are excluded from triage queue
- **Triage alert button**: Appears in the sidebar tab nav when thresholds are exceeded
  - Configurable "Snoozed items threshold" (default: 10)
  - Configurable "Active items threshold" for TODOs + Ideas (default: 20)
  - Pulsing animation draws attention when action is needed
  - Settings available under new "Triage" section

## [0.9.62] - 2026-01-29

### Improved

- **Header TODOs hide when all children are snoozed**: Header blocks now auto-hide from TODOs tab and embeds when all children are either complete OR snoozed
  - Previously headers would show with no visible children if all were snoozed
  - Headers reappear when any child is uncompeted or unsnoozed

## [0.9.61] - 2026-01-29

### Added

- **Snoozed tab**: New third tab in sidebar (clock icon) shows all snoozed TODOs and Ideas
  - Separated into "Snoozed TODOs" and "Snoozed Ideas" sections
  - Snoozed items hidden from TODOs and Ideas tabs
- **Snooze tag aliases**: `#snooze` and `#snoozed` now work as aliases for `#future`
  - All three tags are treated equivalently for snoozing
- **Snooze in tag dropdown**: The `#` menu now includes "Snooze this" / "Unsnooze this" option
  - Quick access to snooze without right-click context menu
  - Shows "Unsnooze this" when item is already snoozed

## [0.9.60] - 2026-01-29

### Fixed

- **Duplicate TODOs in focus mode**: Fixed issue where a child TODO with `#focus` would appear twice in the sidebar when its parent header also had `#focus`
  - Child items now only appear standalone if their parent header does NOT have `#focus`
  - When parent has `#focus`, child is shown under the parent (not duplicated as standalone)

## [0.9.59] - 2026-01-29

### Improved

- **Header TODOs auto-hide when complete**: Header TODOs (block-tagged lists) now automatically disappear from sidebar and embeds once all their children are marked as #todone
  - Eliminates the need to manually mark headers as done
  - Headers reappear if any child is reverted to active

## [0.9.58] - 2026-01-29

### Fixed

- **#today excluded from project list**: The `#today` priority tag no longer appears as a project in the Focus section
  - `#today` is a priority tag (like `#focus`, `#p0`-`#p4`) and should not group items as a project
  - Still displays on individual items to show their priority level

## [0.9.57] - 2026-01-29

### Improved

- **Consistent tag styling across themes**: Tags in editor and reading mode now use monospace font, fixed 12px size, and vertical middle alignment
  - Improves readability when tags appear in headings or mixed with other text
  - Sidebar tags unchanged; embed tags follow the same rules
  - Works consistently across light and dark themes

## [0.9.56] - 2026-01-29

### Improved

- **Principle items now render markdown**: Principle text in the project info popup now renders bold, italic, links, and code formatting
- **Cleaner description extraction**: Trailing headings are now trimmed from project descriptions (headings without following content don't belong in summaries)

## [0.9.55] - 2026-01-29

### Added

- **Principle items in project info popup**: The focus list (ⓘ) popup now shows `#principle` tagged items that belong to the project
  - Displays principle text below the project description
  - Includes principles tagged with the project tag or in project files
  - Helps anchor users in what matters for the focused project

### Changed

- **Renamed popup sections**: "Principles" section now shows actual principle items; related tags moved to "Tags" section

## [0.9.54] - 2026-01-28

### Added

- **Made in 🇨🇦**: Added "Made in 🇨🇦" to the About popup

## [0.9.53] - 2026-01-28

### Improved

- **Skip empty items**: TODOs, ideas, and principles with no meaningful content (just tags, dates, or block references) are now ignored during scanning. This prevents clutter from placeholder items like `- [ ] #todo ^block-id`

## [0.9.52] - 2026-01-28

### Improved

- **Consistent checkbox icons**: The ribbon icon, sidebar view icon, and TODOs tab button now all use the same square checkbox icon instead of a mix of circle and square variants

## [0.9.51] - 2026-01-28

### Added

- **`#today` priority tag**: New priority tag for items that need attention today
  - Ranks between `#focus` and `#p0` in sort order
  - Priority order is now: `#focus` → `#today` → `#p0` → `#p1` → `#p2` → (no tag) → `#p3` → `#p4` → `#future`

## [0.9.50] - 2026-01-28

### Removed

- **Custom tag colouring for editor/reading mode**: Removed the MutationObserver-based tag colouring system
  - This was causing tags to flash on load and inconsistent styling between panes
  - Tags in the editor and reading mode now use Obsidian's native tag styling
  - Sidebar and embed tag styling remains unchanged

### Technical

- Removed `registerTagColourObserver()`, `applyTagColoursToElement()`, and `getProjectColourMap()` methods from main.ts
- Removed ~90 lines of CSS for `[data-sc-tag-type]` attribute selectors and `--sc-tag-*` colour variables
- Removed periodic 2-second re-application of tag colours
- Simplified tag CSS to only style sidebar and embed contexts

## [0.9.49] - 2026-01-28

### Fixed

- **Tag colouring consistency**: Fixed tags like `#focus`, `#p0` appearing grey instead of styled blue
  - Root cause: When Obsidian recreated DOM elements (e.g., during scrolling), the `cm-hashtag-begin` element (the `#`) could be recreated without the styling attribute, while its paired `cm-hashtag-end` element still had it
  - The logic previously skipped styling the begin element if the end element already had the attribute
  - Now always styles the begin element when a matching end element is found

### Technical

- Changed `cm-hashtag-begin` processing to always set `data-sc-tag-type` regardless of whether the paired end element already has it
- This handles Obsidian's virtual scrolling which can recreate individual DOM elements

## [0.9.48] - 2026-01-28

### Fixed

- **Tag colouring consistency**: Fixed tags appearing grey (unstyled) instead of blue (styled)
  - Some tags like `#focus`, `#p0` were not being coloured due to DOM iteration order issues
  - Added bidirectional matching: both begin→end and end→begin sibling lookups
  - Added fallback styling for end elements when begin element isn't found as previous sibling

### Technical

- Tag colouring now handles split `cm-hashtag-begin`/`cm-hashtag-end` elements from both directions
- When processing `cm-hashtag-begin`, also checks and styles the next sibling if it's `cm-hashtag-end`
- Ensures all tag pairs get styled regardless of iteration order in the querySelectorAll results

## [0.9.47] - 2026-01-28

### Fixed

- **Principles under TODO headers now appear in Principles section**: Items with `#principle` tag under a `#todo` header block were incorrectly processed as TODO children instead of principles
  - The `#principle` tag now takes precedence over parent header context
  - Similar to how `#idea` tags were already handled correctly

- **Plugin tag text readability**: Changed `#todo`, `#todone`, `#idea`, `#principle` tags to use white text
  - Previously used dark text on medium-blue background which was hard to read
  - Now consistent with priority tag text colours

- **Additional tag selectors for colour consistency**: Added `.cm-tag` and `span.tag` selectors
  - Some tags in Obsidian may use different class names depending on context
  - Expanded tag colouring to cover more Obsidian tag element types

### Technical

- TodoScanner: Principle-tagged items under TODO headers now skip TODO child processing
- CSS: Plugin tags `[data-sc-tag-type="plugin"]` now use `color: white` instead of `var(--text-normal)`
- CSS/main.ts: Added `.cm-tag` selector to tag styling and colouring logic

## [0.9.46] - 2026-01-28

### Fixed

- **Child items now inherit parent header tags**: Items under a block header (TODO, Idea, Principle) now display both their own tags and their parent header's tags
  - Previously, child items only showed tags from their own line, not the header's tags
  - Sidebar tag dropdown now shows merged parent + child tags
  - Embed renders now append parent header tags to child item display
  - Duplicate tags are automatically filtered out

### Technical

- Added `parentTags` parameter to `renderListItem()` in SidebarView
- Added `parentTags` parameter to `renderTodoItem()`, `renderIdeaItem()`, `renderPrincipleItem()` in EmbedRenderer
- Header tags are extracted and passed to child render calls
- Tags are merged with Set deduplication for clean display

## [0.9.45] - 2026-01-28

### Fixed

- **Grey uncolored tags in editing mode**: Tags in headings, paragraphs, and mid-line positions now receive proper coloring
  - Previously, tags that weren't at line ends (in headings, beginning/middle of lines) appeared grey/uncolored
  - Added periodic re-processing (every 2 seconds) to catch tags that load after initial render
  - Added active-leaf-change listener to re-color tags when switching files or panes
  - Ensures all tags get `[data-sc-tag-type]` attribute regardless of position or timing

### Technical

- Added `active-leaf-change` event listener with 100ms delay for CodeMirror rendering
- Added interval-based reprocessing (every 2 seconds) to catch missed tags
- Both properly use `registerEvent()` and `registerInterval()` for cleanup on plugin unload

## [0.9.44] - 2026-01-28

### Fixed

- **Unified tag chicklets in editing mode**: Hash symbol and tag name now display as a single cohesive chicklet
  - Previously in editing mode (Live Preview), tags like `#p0roadmap` displayed as two separate chicklets: `#` and `p0roadmap`
  - Fixed by restructuring padding rules for `.cm-hashtag-begin` and `.cm-hashtag-end` elements
  - Begin element gets left padding (2px 0 2px 5px), end element gets right padding (2px 5px 2px 0)
  - Border radius removed on touching edges to create seamless appearance

### Technical

- Removed padding/border-radius from base `.cm-hashtag` rule to prevent override conflicts
- Applied padding directly to `[data-sc-tag-type]` with proper begin/end adjustments
- Added explicit padding values to merge split elements visually

## [0.9.43] - 2026-01-28

### Fixed

- **Tag styling refinements**:
  - Removed `!important` from base tag opacity to allow colored tags to properly override with full opacity
  - Excluded dropdown and popup tags (`.project-info-principle-tag`, `.tag-dropdown-trigger`) from global tag style overrides
  - Fixed sidebar dropdown tags losing border-radius and padding
  - Colored tags now display with vibrant, full-opacity backgrounds in all contexts
  - Mid-line tags no longer appear washed out

### Technical

- Added exclusions to global tag selectors using `:not()` for dropdown/popup contexts
- Added `!important` to dropdown tag styles to prevent override by global rules
- Removed `!important` from base tag opacity (line 816) to allow proper cascade

## [0.9.42] - 2026-01-28

### Fixed

- **Reading Mode tag rendering**: Fixed broken/malformed tag display in Reading Mode
  - Tags no longer wrap or display incorrectly in Reading Mode
  - Separated styling rules for editor tags (split .cm-hashtag elements) vs Reading Mode tags (single .tag elements)
- **Tag color opacity**: Colored tags now display with full opacity (no more washed-out appearance)
  - Tags with custom backgrounds (`[data-sc-tag-type]`) now show vibrant colors
  - Base tag opacity (0.85) only applies to uncolored tags
- **Vertical padding restoration**: Restored 2px vertical padding for better tag appearance
  - Fixed padding regression that made tags appear squished
  - Line-height increased to 1.3 for improved readability

### Technical

- Split tag styling into separate rules for Reading Mode (single elements) and editor (CodeMirror split elements)
- Added `opacity: 1 !important` to `[data-sc-tag-type]` to override base opacity for colored tags
- Increased padding from `1px 5px` to `2px 5px` and line-height from 1.2 to 1.3

## [0.9.41] - 2026-01-28

### Fixed

- **Consistent tag dimensions across all contexts**: All tags now have identical size, padding, and line-height regardless of location
  - Reading Mode tags now match editing mode/embed tag appearance
  - Fixed height differences between header tags and body tags
  - Applied uniform styling to tags at beginning, middle, and end of lines
  - Tags use consistent 9pt font, 1px vertical padding, 1.2 line-height across all contexts
  - Embed tag styling (the most compact and clean appearance) is now the standard

### Technical

- Expanded unified tag styling to cover all tag selectors (`.tag`, `a.tag`, `.cm-hashtag`, etc.)
- Added explicit `line-height`, `padding`, `border-radius`, `vertical-align` to base tag rules
- Simplified `[data-sc-tag-type]` to only handle overflow, inheriting dimensions from unified rules

## [0.9.40] - 2026-01-28

### Fixed

- **Unified tag styling across all contexts**: Tags now display consistently in editor (Live Preview/Source mode), Reading Mode, embeds, and sidebar
  - Fixed hash symbol (#) being hidden in bold text - now fully visible
  - Fixed hash symbol background color mismatch - hash and tag name now share the same colored background
  - Fixed height inconsistencies between Reading Mode and editing mode tags
  - In CodeMirror editor, both the hash symbol and tag name elements now receive unified styling
  - Tags appear as a single cohesive chicklet regardless of context

### Technical

- Apply `data-sc-tag-type` and `data-sc-priority` to both `.cm-hashtag-begin` and `.cm-hashtag-end` elements
- Added CSS rules to merge begin/end elements visually (removed internal padding and border radius)

## [0.9.39] - 2026-01-28

### Fixed

- **Tag hash symbol visibility in bold text**: Hash symbols (#) now display correctly when tags appear inside bold text in Live Preview editor
  - Previously, the # symbol would be clipped or hidden entirely when tags were inside bold formatting
  - Added `overflow: visible` and `display: inline-block` to prevent element clipping

## [0.9.38] - 2026-01-28

### Fixed

- **Tag vertical alignment**: Tag chicklets now align vertically centered with surrounding text instead of sitting on the baseline
  - Applies to all contexts: editor (Live Preview and Source mode), Reading Mode, embeds, and sidebar
  - Tags no longer extend below the text baseline, creating better visual balance

## [0.9.37] - 2026-01-28

### Added

- **Clickable links in lists**: New "Make links clickable in lists" setting (enabled by default)
  - Wiki links (`[[page]]`, `[[page|alias]]`, `[[page#heading]]`) now render as clickable links in sidebar and embeds
  - Markdown links (`[text](url)`) also render as clickable links
  - Wiki links navigate to the page in Obsidian when clicked
  - External links open in a new browser window
  - When setting is disabled, links display as plain text without markdown syntax (previous behavior)

### Fixed

- **Wiki-style links now display correctly**: Wiki links no longer show raw markdown syntax in sidebar and embeds
  - `[[page]]` displays as "page"
  - `[[page|alias]]` displays as "alias"
  - `[[page#heading]]` displays as "page"
  - Previously, these showed as literal `[[...]]` text

### Settings

- **Make links clickable in lists**: Toggle whether links in sidebar and embeds are clickable (default: on)

## [0.9.36] - 2026-01-28

### Fixed

- **Focus mode now filters DONE section**: When focus mode (eye icon) is enabled, the Recent TODONEs section now filters to show only:
  - TODONEs completed today (filters by completion date)
  - TODONEs with `#focus` tag OR from focused projects (when "Focus mode includes project TODOs" is enabled)
  - Empty state shows "No focused TODOs completed today" when focus mode is active
  - Previously, the DONE section showed all recent completions regardless of focus mode

## [0.9.35] - 2026-01-28

### Fixed

- **Sort button only in editor**: Removed sort buttons from sidebar and embeds; sort icon now only appears inline in the markdown editor
- **Sort detection reliability**: Fixed detection logic to prioritize checkbox state over tags
  - Checkbox `[x]` vs `[ ]` is now the primary indicator for completion status
  - Tags inside backticks (code spans) are now ignored when detecting item type

### Technical

- `detectItemType()` now checks checkbox state first, then strips code spans before checking tags

## [0.9.34] - 2026-01-27

### Added

- **Editor sort button**: Sort icon appears inline in the markdown editor after header TODO lines with children
  - Click to reorder child items directly in the markdown file
  - Sort order: Open TODOs first, then TODONEs by completion date (newest first), then undated TODONEs

### Technical

- New `HeaderSortExtension.ts` CodeMirror ViewPlugin for inline editor widget
- New `compareByStatusAndDate()` function in `utils.ts` for status/date sorting
- New `extractCompletionDate()` helper in `utils.ts`
- New `sortHeaderChildren()` method in `TodoProcessor` for file modification

## [0.9.32] - 2026-01-27

### Fixed

- **Focus mode now shows block-level focused children**: When a child item under a header TODO has `#focus`, it now appears in focus mode as a standalone item
  - Previously, children were filtered out before focus mode evaluation
  - Example: `- Step B #focus` under `### Task #todo` now shows in focus mode

## [0.9.31] - 2026-01-27

### Improved

- **Better tag text contrast**: Plugin tags (#todo, #idea, etc.) now use dark text instead of white
  - At 62% background lightness, dark text provides better readability
  - Text colour flips at ~60% lightness: white for priorities 0-3, dark for plugin and 4-6

## [0.9.30] - 2026-01-27

### Fixed

- **Consistent tag pill styling**: All semantic-coloured tags now have consistent rounded corners and padding
  - Tags in dropdown menus display as proper pills
  - Project and priority tags have matching border-radius (4px) and padding

## [0.9.29] - 2026-01-27

### Added

- **Semantic tag colouring**: Tags now display with colour coding based on type and priority
  - Uses the logo colour `#689fd6` as base, with HSL gradient for priorities
  - Plugin tags (#todo, #todone, #idea, #principle): Logo colour
  - Priority tags (#focus, #p0-#p4, #future): 7-shade gradient from dark (high priority) to light (low priority)
  - Project tags: Colour based on weighted average priority of the project's tasks
  - Colours apply in sidebar, embeds, editor, and reading mode

### Technical

- Added CSS variables `--sc-tag-priority-0` through `--sc-tag-priority-6` for semantic tag colours
- Added `data-sc-tag-type` and `data-sc-priority` attributes to tag elements
- Added `getTagColourInfo()` helper in utils.ts for tag classification
- Added `colourIndex` to `ProjectInfo` type for project-level colour calculation
- MutationObserver applies colours to Obsidian-rendered tags in editor and preview

## [0.9.28] - 2026-01-27

### Improved

- **Reorganized settings sections**: Settings now organized into logical sections with h3 headers
  - Sidebar section first (Show sidebar by default, Tab lock buttons)
  - TODOs section (TODONE file, Date format)
  - Projects section (unchanged)
  - Priority section (renamed from "Priority Settings")
  - LLM section (unchanged)

## [0.9.27] - 2026-01-27

### Improved

- **Consistent plugin naming**: Removed logo symbols from plugin name and sidebar tab titles
  - Plugin name in Community plugins list: "Space Command" (was "␣⌘ Space Command")
  - Sidebar tab titles: "TODOs" / "IDEAs" (was "␣⌘ TODOs" / "␣⌘ IDEAs")
  - Settings page title: "Space Command Settings" (was "␣⌘ Space Command Settings")
  - Logo still appears in the styled about section header within settings

## [0.9.26] - 2026-01-27

### Added

- **Focus mode filters TODO list**: When focus mode is enabled, the TODO section now also filters to show only focused items
  - Default: shows only `#focus` tagged TODOs
  - Optional: show all TODOs from focused projects (configure in Settings → "Focus mode includes project TODOs")
  - Empty state shows "No focused TODOs" when focus mode is active

### Settings

- **Focus mode includes project TODOs**: New toggle to expand focus mode filtering
  - OFF (default): Focus mode shows only `#focus` items
  - ON: Focus mode shows `#focus` items plus all TODOs from projects that have focused items

## [0.9.25] - 2026-01-27

### Fixed

- **Focus mode icon layout**: Eye icon now displays inline beside the "Focus" heading instead of on a separate line
  - Added flexbox layout to section headers

## [0.9.24] - 2026-01-27

### Added

- **Focus mode toggle**: Eye icon button in Focus section header filters to show only `#focus` projects
  - Click eye icon to toggle focus mode on/off
  - When enabled, only projects with `#focus` tagged items are shown
  - Shows "Focus mode enabled" / "Focus mode disabled" notification (matching TODO completion style)
  - Eye-off icon indicates focus mode is active (filtering)
  - Eye icon indicates normal mode (showing all projects)

## [0.9.23] - 2026-01-27

### Fixed

- **Sidebar scrollbar no longer overlaps content**: Added right padding to content area so scrollbar sits beside content, not over it
- **Scrollbar hugs right edge**: Scrollbar now positioned flush against the right edge of the sidebar

## [0.9.22] - 2026-01-27

### Fixed

- **Sidebar scrollbar positioning**: Vertical scrollbar now hugs the right edge (0-1px gap instead of 4-6px)
- **Horizontal scrollbar prevention**: Sidebar content no longer shows horizontal scrollbars when content overflows

## [0.9.21] - 2026-01-27

### Changed

- **Focus list asks before creating project files**: Clicking the → arrow now shows a confirmation dialog before creating a new project file
  - Displays the project tag and destination folder
  - Prevents accidental file creation

## [0.9.20] - 2026-01-27

### Added

- **Unified sorting**: TODOs, projects, and ideas now sort by: 1) `#focus` first, 2) priority (`#p0`-`#p4`), 3) total tag count (more tags = higher ranking)
  - Consistent sorting across sidebar, embeds, and project lists
  - Items with more context (more tags) surface higher within the same priority level
- **Active TODOs limit**: New setting to limit TODOs shown in sidebar
  - Default: 0 (unlimited) - shows all TODOs
  - Set a value to cap the list with "+N more" indicator
  - Embeds remain unlimited unless `limit:N` filter specified
- **Focus list limit in sidebar**: Projects section now respects `focusListLimit` setting
  - Default: 5 projects
  - "+N more" indicator when projects exceed limit

### Changed

- Sidebar sorting now uses unified algorithm instead of priority + date
- Projects sort by focus status, then priority, then item count
- Embeds sort by focus, priority, tag count (no longer by project tag alphabetically)

### Technical

- New `compareTodoItems()` function in `utils.ts` for unified sorting
- New `getTagCount()` function counts meaningful tags (excludes system tags)
- `SidebarView` constructor now accepts `activeTodosLimit` and `focusListLimit` parameters
- Removed unused `getFirstProjectTag()` method from `EmbedRenderer`

## [0.9.19] - 2026-01-27

### Fixed

- **Tab lock disappears after unlock**: Lock button now properly re-appears after clicking the pushpin to unlock a tab
  - Root cause: Obsidian's native click handler ran before ours, unpinning the tab before we could act
  - Fix: Use capture phase event listener to intercept clicks before Obsidian's handler
- **Tab lock missing on startup**: Lock buttons now appear more reliably on startup
  - Added delayed re-check (200ms) after layout ready to catch late-initialized tabs

### Technical

- Pin container click handler now uses `{ capture: true }` to run before Obsidian's native handler
- Added `forceRefresh` parameter to `addButtonToLeaf()` to force button re-creation
- Pin/unpin handlers force-refresh button after 50ms delay to handle DOM changes
- Added `scheduleUpdate()` for debounced tab updates

## [0.9.18] - 2026-01-27

### Improved

- **Tab lock UX cleanup**: Cleaner visual state when tabs are locked
  - Locking a tab now hides the X (close button) and the lock button
  - Obsidian's native pushpin shows the locked state
  - Click the pushpin to unlock the tab
  - Reduces visual clutter (was showing both pushpin and lock icon over X)

### Technical

- Added `space-command-tab-locked` class to tab headers for CSS control
- New `addPinClickHandler()` method wires pushpin for unlocking
- CSS hides `.space-command-tab-lock-btn` and close button when locked

## [0.9.17] - 2026-01-27

### Added

- **Tab lock buttons**: Lock buttons on document tabs to prevent link clicks from replacing the view
  - Click the lock icon on any tab header to toggle pinned state
  - Locked (pinned) tabs force link clicks to open in new tabs
  - Uses Obsidian's native pinning API for reliable behaviour
  - Disabled by default—enable in Settings → "Show tab lock buttons"
  - Lock icon shows open padlock (unlocked) or closed padlock (locked)

### Technical

- New `TabLockManager` class for managing tab lock button injection
- New `showTabLockButton` setting (default: false)
- Uses MutationObserver to add buttons to new tabs dynamically
- Filters by `data-type="markdown"` to target only document tabs (not sidebar tabs)
- CSS: `.space-command-tab-lock-btn`, `.is-locked` states

## [0.9.16] - 2026-01-26

### Changed

- **Sidebar scrollbar**: Semi-transparent (65% opacity) scrollbar thumb with transparent track

## [0.9.15] - 2026-01-26

### Fixed

- **Sidebar layout padding**: Reduced header padding to 2px top/bottom, 4px left/right; scrollbar now flush with right edge

## [0.9.14] - 2026-01-26

### Fixed

- **Sidebar button styling**: Removed visible borders and backgrounds from close/menu buttons; added subtle hover effect

## [0.9.13] - 2026-01-26

### Fixed

- **Sidebar header now stays pinned** while scrolling content below

## [0.9.12] - 2026-01-25

### Fixed

- **#idea items appearing in TODO lists**: Items with `#idea`, `#ideas`, or `#ideation` tags now correctly appear only in Ideas tab/embeds, not in TODOs
  - Previously, items under a `#todos` header with `#idea` tag would appear in both TODO and Idea lists
  - Scanner now excludes `#idea` tagged items from todos cache
  - Added safety filters in SidebarView and EmbedRenderer to ensure clean separation

### Technical

- `TodoScanner.scanFile()` now checks for idea tags before adding items to todos list
- `SidebarView.renderActiveTodos()` filters out items with idea tags
- `EmbedRenderer.renderTodos()` and `refreshEmbed()` filter out idea-tagged items

## [0.9.11] - 2026-01-25

### Fixed

- **Project info popup not closing when opening other menus**: Opening a tag dropdown or other sidebar menu now properly closes any open project info popup, and vice versa

## [0.9.10] - 2026-01-25

### Fixed

- **Project info popup too narrow**: Increased popup width from 250-350px to 350-450px for better readability (approximately 12-15 words per line instead of 8). Uses inline styles to ensure CSS precedence.

## [0.9.9] - 2026-01-25

### Fixed

- **Embed missing children of header TODOs when filtering by tag**: Header TODOs now appear in embeds when their children match the tag filter, even if the header itself doesn't have that tag
  - Example: `## Ideas and TODOs #todos` with children tagged `#workflow-automation` now shows when embed filters by `tags:#workflow-automation`
  - Previously, the header was filtered out (it lacked the tag), so all its children were hidden too
  - Affects `{{focus-todos}}` inline embeds and `` ```focus-todos``` `` code blocks with tag filters

### Technical

- New `includeParentHeaders()` method in `EmbedRenderer.ts` adds parent headers when their children match filters
- Applied to `renderTodos()`, `render()`, and `refreshEmbed()` methods

## [0.9.8] - 2026-01-25

### Fixed

- **Embed missing items with plural tags**: TODOs using `#todos` (plural) now appear correctly in embed views
  - Previously, embeds checked `tags.includes("#todo")` which missed items tagged with `#todos`
  - Now uses `itemType` field set during scanning, which handles both singular and plural forms
  - Affects `{{focus-todos}}` inline embeds and `` ```focus-todos``` `` code blocks
  - Same fix applied to TODONE visibility filtering (`#todone`/`#todones`)

### Technical

- Replaced 5 `tags.includes("#todo")` / `tags.includes("#todone")` checks in `EmbedRenderer.ts` with `itemType === 'todo'` / `itemType === 'todone'`

## [0.9.7] - 2026-01-21

### Added

- **Version display**: Plugin version now shown in both About modal and Settings page
  - About modal shows version below the title
  - Settings page shows version in the about section
  - Version pulled from plugin manifest (always accurate)

## [0.9.6] - 2026-01-21

### Improved

- **Tag dropdown alphabetization**: Tags in the `#` dropdown menu are now sorted A→Z
- **Tag submenu ordering**: Clear tag → Filter by (alphabetical order)

## [0.9.5] - 2026-01-21

### Improved

- **Alphabetically sorted context menus**: All right-click menus now list items in A→Z order
  - Editor context menu: Copy as Slack → Define term... → Review... → Rewrite...
  - Sidebar hamburger menu: Embed Syntax → Refresh | About → Settings → Stats
  - Embed Syntax submenu: IDEA code block → IDEA inline → TODO code block → TODO inline
  - TODO context menu: Copy → Focus → Later → Snooze
  - Idea context menu: Add to TODOs → Copy → Focus

## [0.9.4] - 2026-01-21

### Added

- **Markdown rendering in LLM tooltips**: Define, Rewrite, and Review results now render as formatted markdown
  - Supports bold, italic, code, lists, and other markdown formatting
  - Term highlighting still works (uses Obsidian's highlight syntax internally)

### Improved

- **Tooltip header with command type**: Header now shows "␣⌘ Define", "␣⌘ Rewrite", or "␣⌘ Review"
  - Logo and command type on left, close button on right
  - Content starts below the header on its own line
  - Cleaner visual separation between header and content

### Technical

- `DefineTooltip` now requires `App` instance for markdown rendering
- New `CommandType` type for define/rewrite/review
- Uses Obsidian's `MarkdownRenderer.render()` for content display
- New `Component` lifecycle management for proper cleanup
- New CSS classes: `.define-tooltip-header`, `.define-tooltip-command-type`, `.define-tooltip-settings-link`

## [0.9.3] - 2026-01-21

### Improved

- **User-friendly LLM error messages**: Define, Rewrite, and Review commands now show helpful error messages
  - Displays: "Could not connect to {model-name}. Fix in Settings" with clickable link
  - Settings link opens the Space Command settings tab directly
  - Full error details logged to browser console for debugging

### Technical

- New `showError()` method in `DefineTooltip` for error display with Settings link
- New `getModel()` method in `LLMClient` for retrieving current model name
- New `openLLMSettings()` method in plugin for programmatic settings access
- Console logging includes operation type, model, URL, and error details

## [0.9.2] - 2026-01-21

### Fixed

- **Logo stretching in LLM tooltips**: The ␣⌘ logo no longer stretches to full container width
  - Changed from float to absolute positioning
  - Added left padding to tooltip for logo space

## [0.9.1] - 2026-01-21

### Fixed

- **LLM tooltips now scrollable**: Define, Rewrite, and Review tooltips now scroll when content exceeds viewport
  - Added `max-height: 60vh` to tooltip container
  - Content area uses flexbox with `overflow-y: auto`
  - Actions bar stays fixed at bottom while content scrolls

## [0.9.0] - 2026-01-21

### Added

- **Rewrite command**: Select text, right-click, choose "Rewrite..." to get an LLM-powered rewrite
  - Suggests changes for clarity, accuracy, and brevity
  - Shows result in tooltip with Copy and Apply buttons
  - Apply button replaces the selected text with the rewritten version
  - Customizable prompt in settings

- **Review command**: Select text, right-click, choose "Review..." for editorial feedback
  - Provides specific suggestions for improvement
  - Shows result in tooltip with Copy button
  - Customizable prompt in settings

### Improved

- **Define tooltip**: Now shows "Defining..." during loading (was generic "Loading...")
- **Settings organization**: LLM settings section renamed to "LLM Settings (Define, Rewrite, Review)"
- **Tooltip actions**: New actions bar with Copy/Apply buttons for rewrite results

### Technical

- Extended `LLMClient` with `rewrite()` and `review()` methods
- Extended `DefineTooltip` with optional `onApply` callback and actions bar
- New settings: `llmRewritePrompt`, `llmReviewPrompt`
- New CSS classes: `.define-tooltip-actions`, `.define-tooltip-btn`, `.define-tooltip-copy-btn`, `.define-tooltip-apply-btn`

## [0.8.6] - 2026-01-21

### Fixed

- **Sidebar not updating for external file changes**: TODOs and IDEAs now refresh when files are modified outside Obsidian
  - Added `metadataCache.on("changed")` listener to detect external file modifications
  - Fixes issue where editing files via another editor, git operations, or sync services wouldn't update the sidebar
  - Documents already updated (Obsidian reloads them), now the sidebar cache refreshes too

## [0.8.5] - 2026-01-21

### Fixed

- **Project info popup callouts**: Callouts in project files are now rendered with proper Obsidian styling (icons, colors) instead of appearing as plain text

## [0.8.4] - 2026-01-21

### Changed

- **Definition tooltip layout**: Logo now floats at top-left instead of top-right

## [0.8.3] - 2026-01-21

### Fixed

- **Definition tooltip positioning**: Tooltip now stays fully within the viewport, adjusting position and adding scroll if needed for long definitions
- **Definition tooltip layout**: Logo now floats at top-right with text flowing around it on the same line

## [0.8.2] - 2026-01-21

### Fixed

- **Definition prompt textarea size**: The prompt configuration field in settings is now full-width and 4 lines tall for easier editing

## [0.8.1] - 2026-01-21

### Improved

- **Define tooltip branding**: Space Command logo (␣⌘) now appears in the top-left of the definition tooltip
- **Term highlighting**: The selected term is highlighted with Obsidian's highlight color wherever it appears in the definition
- **Context menu text**: Changed from "Define" to "Define term..." for clarity

### Technical

- New `.define-tooltip-header` class for logo positioning
- New `.define-tooltip-highlight` class using `--text-highlight-bg` CSS variable
- `DefineTooltip.show()` now accepts a `term` parameter for highlighting

## [0.8.0] - 2026-01-21

### Added

- **Define context menu**: Select text, right-click, choose "Define" to get an LLM-powered definition
  - Sends selected text to a local LLM (Ollama by default) for contextual explanation
  - Definition appears in an inline tooltip near the selection
  - Loading spinner shows while waiting for response
  - Tooltip closes on click outside or Escape key
  - Handles viewport overflow (repositions if near screen edges)

### Settings

- **Enable Define feature**: Toggle the Define menu item on/off (default: on)
- **LLM URL**: Ollama server URL (default: `http://localhost:11434`)
- **LLM Model**: Model name to use (default: `llama3.2`)
- **Definition prompt**: Customizable prompt prepended to selected text
- **Timeout**: Maximum wait time for LLM response (default: 30 seconds)

### Technical

- New `LLMClient` class for Ollama API integration using Obsidian's `requestUrl`
- New `DefineTooltip` class for positioned tooltip display with CodeMirror coordinate lookup
- New CSS classes: `.define-tooltip`, `.define-tooltip-loading`, `.define-tooltip-spinner`, `.define-tooltip-close`

## [0.7.33] - 2026-01-21

### Fixed

- **Tag dropdown menu clipping in right sidebar**: The `#` tag menu now opens within the Obsidian view instead of being clipped off-screen
  - Detects sidebar position (left or right) and adjusts menu direction accordingly
  - Submenus also open in the correct direction based on sidebar position

## [0.7.32] - 2026-01-21

### Fixed

- **Tag dropdown position in TODO section**: The `#` tag menu now appears on the right side (before the → link), matching the DONE section layout
  - Previously rendered inline within the text span
  - Now rendered as a separate flex item on the row container

## [0.7.31] - 2026-01-21

### Fixed

- **Project info popup excludes embeds**: Description no longer includes code blocks or `{{...}}` inline embeds
  - Fenced code blocks (` ``` `) are skipped entirely
  - Lines containing only `{{...}}` are skipped
  - Inline `{{...}}` syntax within paragraphs is stripped

## [0.7.30] - 2026-01-21

### Added

- **Project info popup**: Click the `ⓘ` icon next to any project tag in the Focus section to see project details
  - Shows the first 1-2 paragraphs from the project file as a description
  - Lists any `#principle` tags found in the project file
  - Includes a link to open the project file in a new tab
  - Popup appears to the left of sidebar (when docked right) or right (when docked left)
  - Click outside to dismiss

### Technical

- New `getProjectFileInfo()` method in `ProjectManager` for reading project file content
- New `getProjectFilePath()` helper method in `ProjectManager`
- New `showProjectInfoPopup()` method in `SidebarView`
- Detects sidebar position via `this.leaf.getRoot()` comparison with `workspace.rightSplit`
- New CSS classes: `.project-info-icon`, `.project-info-popup`, `.project-info-title`, `.project-info-description`, `.project-info-principles`, `.project-info-principle-tag`, `.project-info-link`

## [0.7.29] - 2026-01-19

### Added

- **Exclude folders from projects setting**: New setting to exclude specific folders from inferred project tags
  - Default: `log` folder excluded
  - Prevents journal/log files from generating spurious project tags
  - Comma-separated list in Settings → Projects Settings → "Exclude folders from projects"

### Fixed

- **Invalid characters in inferred project tags**: `filenameToTag()` now sanitizes filenames properly
  - Removes commas, parentheses, and other invalid tag characters
  - Example: "Week of January 12th, 2026.md" → `#week-of-january-12th-2026` (was `#week-of-january-12th,-2026`)
  - Collapses multiple hyphens and trims leading/trailing hyphens

### Changed

- **Inferred project tags only apply to projects folder**: Files outside the configured projects folder no longer generate inferred project tags
  - TODOs without explicit tags in non-project files are simply untagged (not grouped under filename)
  - Explicit project tags (e.g., `#myproject`) still work anywhere in the vault

## [0.7.28] - 2026-01-19

### Improved

- **Sidebar date styling**: Completion dates on done items (DONE section) now display with muted-pill styling
  - Matches the visual style used for priority tags (`#focus`, `#p0`-`#p4`, `#future`)
  - Date is extracted from text and rendered as a separate styled element
  - Consistent with how dates are displayed in embed blocks

## [0.7.27] - 2026-01-19

### Added

- **Copy to clipboard**: Right-click any sidebar item (TODO, idea, or principle) and select "Copy" to copy the full line text to clipboard
  - Available on TODOs, ideas, and principles
  - Principles now have a context menu (previously had none)

## [0.7.26] - 2026-01-19

### Added

- **Vault Statistics**: New "Stats" option in the sidebar kebab menu (vertical dots)
  - Opens a modal showing summary statistics for your vault
  - **TODOs**: Active count, focused count, snoozed count, completed count
  - **Ideas**: Total count, focused count
  - **Principles**: Total count
  - Shows grand total of all tracked items

## [0.7.25] - 2026-01-19

### Fixed

- **Priority context menu on child TODOs**: Right-clicking a TODO item in a block-tagged list (list items under a header with `#todo`) no longer throws "no longer contains #todo tag" error
  - Child items inherit TODO status from parent header and don't need explicit `#todo` tag
  - Priority operations (set priority, add focus) now work correctly on these items

## [0.7.24] - 2026-01-19

### Added

- **Focus list context menu**: Right-click projects in the Focus section for batch operations
  - **Filter by**: Sets the sidebar tag filter to show only items with that project tag
  - **Focus/Unfocus**: Add or remove `#focus` from all TODOs with that project tag
  - **Later/Unlater**: Decrease or restore priority for all matching TODOs
  - **Snooze/Unsnooze**: Add or remove `#future` from all matching TODOs
  - Works in both sidebar and embedded `{{focus-list}}` blocks

### Technical

- New batch operation methods in `TodoProcessor`: `focusAllWithTag()`, `unfocusAllWithTag()`, `laterAllWithTag()`, `unlaterAllWithTag()`, `snoozeAllWithTag()`, `unsnoozeAllWithTag()`
- New `showProjectMenu()` method in `ContextMenuHandler`
- Silent versions of tag operations for batch use (no individual notices)

## [0.7.23] - 2026-01-19

### Fixed

- **Embed list alignment**: Removed extra left margin from task list items in embeds so all items align flush left with the embed container

## [0.7.22] - 2026-01-19

### Added

- **`#ideation` tag alias**: `#ideation` now works as an alias for `#idea` and `#ideas`
  - Appears in the Ideas tab alongside other ideas
  - Supports all idea operations: complete, convert to TODO, focus
  - Works with header ideas and children
  - Excluded from project tags in Focus section

## [0.7.21] - 2026-01-19

### Fixed

- **Inline code content preserved in sidebar**: Tags inside backticks (e.g., `` `#ideation` ``) are now displayed as plain text in the sidebar, rather than being stripped as tags. Tags are stripped before markdown processing to preserve code block content

## [0.7.20] - 2026-01-19

### Changed

- **Tag dropdown now has submenus**: Each tag in the `#` dropdown menu shows a submenu with:
  - **Filter by**: Filters the sidebar to show only items with that tag (previous behavior)
  - **Clear tag**: Removes the tag from that TODO/idea/principle item

## [0.7.19] - 2026-01-19

### Changed

- **DONE section no longer filtered**: The DONE section always shows recent completions regardless of active tag filter
  - Filter indicator button removed from DONE header
  - Completed items represent history and should always be visible

### Fixed

- **Tags in inline code excluded from sidebar**: Tags inside backticks (e.g., `` `#ideation` ``) are now correctly excluded from the sidebar tag dropdown
  - Inline code tags are for documentation purposes, not actual tags
  - Reverts unintended behavior from 0.7.17

## [0.7.18] - 2026-01-19

### Added

- **Filter indicator button in section headers**: When a tag filter is active, a clickable badge showing the filter (e.g., `#project ×`) appears after each section title
  - Click the badge to clear the filter instantly
  - Appears in sections: Focus, TODO, Principles, Ideas (not DONE)
  - Empty state messages now indicate the active filter (e.g., "No TODOs matching #project")

## [0.7.16] - 2026-01-19

### Fixed

- **Embed list children now flush with header**: Child items in embedded TODO/idea/principle lists are no longer indented—they align with the parent header

## [0.7.15] - 2026-01-19

### Added

- **Inline `{{focus-ideas}}` embed syntax**: Ideas can now be embedded inline (Reading Mode only)
  - Same filter support as code blocks: `{{focus-ideas | tags:#project path:notes/}}`

### Changed

- **Renamed "Copy embed syntax" menu to "Embed Syntax"**: Clearer menu title
- **Reorganized embed menu items**: Now shows all four embed options
  - TODO code block (`` ```focus-todos`` ``)
  - TODO inline (`{{focus-todos}}`)
  - IDEA code block (`` ```focus-ideas`` ``)
  - IDEA inline (`{{focus-ideas}}`)

## [0.7.14] - 2026-01-19

### Added

- **Automatic file-level project tags**: TODOs and ideas without explicit project tags now automatically inherit a project tag from their filename
  - Example: TODOs in `api-tasks.md` are grouped under `#api-tasks` in the Focus section
  - Filenames with spaces are converted to dashes (e.g., `My Project.md` → `#my-project`)
  - **Manual tags win**: If a TODO has an explicit project tag (e.g., `#backend`), the file-level tag is not applied
  - Works at display time (no file modifications)—existing markdown is unchanged

### Technical

- New `filenameToTag()` utility function in `utils.ts`
- New `inferredFileTag` field on `TodoItem` interface
- `TodoScanner.createTodoItem()` now populates `inferredFileTag` from filename
- `ProjectManager.getProjects()` uses `inferredFileTag` as fallback when no explicit project tags exist
- `FilterParser.applyFilters()` now uses `inferredFileTag` for tag filtering

## [0.7.13] - 2026-01-19

### Added

- **About section**: New About information accessible from multiple locations
  - Click the ␣⌘ logo in the sidebar header to open About modal
  - Menu item "About" added to sidebar hamburger menu
  - About section at top of Settings page with logo, blurb, author, and repo link
- **Clickable sidebar logo**: The ␣⌘ logo now has hover effects and opens About modal on click

### Technical

- New `AboutModal` class extending Obsidian's Modal
- New `showAboutModal()` method on plugin class
- SidebarView now accepts `onShowAbout` callback
- New CSS classes: `.clickable-logo`, `.space-command-about-modal`, `.space-command-about-section`

## [0.7.12] - 2026-01-19

### Added

- **`focus-ideas` code block support**: Embed ideas with filtering
  - Syntax: `` ```focus-ideas `` with optional `tags:`, `path:`, `limit:` filters
  - Supports header ideas with children (same as todos)
  - Auto-refreshes when ideas change
- **`focus-principles` code block support**: Embed principles with filtering
  - Same filter syntax as `focus-ideas`
  - Supports header principles with children

### Technical

- New `renderIdeas()` and `renderPrinciples()` public methods in `EmbedRenderer`
- New `processFocusIdeas()` and `processFocusPrinciples()` methods in `CodeBlockProcessor`
- Registered `focus-ideas` and `focus-principles` as markdown code block processors

## [0.7.11] - 2026-01-19

### Fixed

- **Plural tag completion bug**: Header TODOs using `#todos` (plural) now properly marked as complete
  - Previously, completing a header with `#todos` would add it to the TODONE file but not update the source file
  - Root cause: regex `/#todo\b/` didn't match `#todos` (the 's' prevented word boundary match)
  - Fix: `replaceTodoWithTodone()` now converts `#todos` → `#todones` and `#todo` → `#todone`
- **TODONE file re-inclusion bug**: Completed items in TODONE file no longer re-appear in sidebar
  - Previously, items with `#todos` tag would match as TODOs even after completion
  - Fix: `cleanupDuplicateTags()` now removes both `#todo` and `#todos` when `#todone`/`#todones` present
- **Reverse operation consistency**: `replaceTodoneWithTodo()` now handles plural forms
  - `#todones` → `#todos`, `#todone` → `#todo`

## [0.7.10] - 2026-01-19

### Fixed

- **Header TODO completion creates duplicate entries**: Completing a header TODO (e.g., `## Task #todo`) no longer creates malformed entries in the TODONE log
  - Previously, heading markers (`##`) were included when writing to the done file, creating entries like `- [x] ## Task #todone`
  - The scanner would then pick this up as a separate item, causing duplicates in the sidebar
  - Fix: Strip heading markers from header TODOs before appending to the TODONE file

## [0.7.9] - 2026-01-19

### Fixed

- **Sidebar activation error on startup**: Fixed `TypeError: Cannot read properties of null (reading 'children')` when "Show sidebar by default" is enabled
  - Root cause: `workspace.getRightLeaf()` called before Obsidian workspace layout was ready
  - Fix: Defer sidebar activation using `workspace.onLayoutReady()` callback

## [0.7.8] - 2026-01-19

### Fixed

- **Styled logo in notifications**: Notice popups now display the ␣⌘ logo with the blue badge background
  - Previously, notifications showed plain text without the styled logo appearance
  - Now uses the same `.space-command-logo` CSS styling as the sidebar header
  - Applies to all plugin notifications (completions, errors, copy confirmations, etc.)

### Technical

- New `showNotice()` helper function in `utils.ts` creates styled notices using `DocumentFragment`
- Replaced 19 `new Notice()` calls across `main.ts`, `SidebarView.ts`, and `TodoProcessor.ts`

## [0.7.7] - 2026-01-19

### Changed

- **Dynamic sidebar title**: Sidebar header now shows "␣⌘ TODOs" or "␣⌘ IDEAs" based on active tab
  - Previously always showed "␣⌘ Space Command"
  - Tab title in Obsidian also updates to match

### Fixed

- **Plural tags in Focus list**: `#todos`, `#todones`, `#ideas`, and `#principles` no longer appear as projects in the Focus section
  - These are type tags that should be excluded like their singular forms

## [0.7.6] - 2026-01-19

### Changed

- **Logo updated**: Changed logo from `⌥⌘` to `␣⌘` (space-command) across all UI and documentation

### Added

- **Plural tag variants**: `#todos`, `#ideas`, `#principles`, and `#todones` now work as synonyms for their singular forms
  - Useful for header-block lists where plural reads more naturally (e.g., `## Project #todos`)
  - Both forms are stripped from display in sidebar and embedded focus lists

## [0.7.5] - 2026-01-19

### Added

- **Implicit file tags for filtering**: TODOs in a file now implicitly match a tag derived from the filename
  - Example: TODOs in `workflow-automation.md` match the filter `tags:#workflow-automation`
  - Filenames with spaces are converted to dashes (e.g., `my project.md` → `#my-project`)
  - Only affects embed filtering; explicit tags in sidebar remain unchanged

### Changed

- **Tag dropdown trigger styled as tag**: The `#` trigger now uses Obsidian's native tag CSS variables for consistent appearance
- **Tag dropdown flows inline**: Tag dropdown trigger now appears inline after item text instead of floating right
- **Removed count badge from sidebar headers**: The child count chicklet (e.g., "16") no longer displays on header items

### Fixed

- **Header markdown in embeds**: Heading markers (`###`) now stripped from header TODO text in embedded lists

## [0.7.4] - 2026-01-18

### Added

- **Collapsed tags in sidebar**: Tags now collapse into a `#` indicator
  - Click `#` to open dropdown showing all tags on the item
  - Click a tag to filter the sidebar to items with that tag
  - "Clear filter" option at bottom (greyed out until filter is active)
  - Filter applies to TODOs, TODONEs, Ideas, and Principles
  - Dropdown closes on selection or click outside

### Technical

- New `renderTagDropdown()` method in SidebarView for tag dropdown UI
- Added `activeTagFilter` state to track current filter
- Filter logic added to `renderActiveTodos`, `renderRecentTodones`, `renderActiveIdeas`, `renderPrinciples`
- New CSS classes: `.tag-dropdown-trigger`, `.tag-dropdown-menu`, `.tag-dropdown-item`, `.tag-dropdown-separator`, `.tag-dropdown-clear`

## [0.7.3] - 2026-01-18

### Changed

- **Unified tag styling**: All plugin tags now render consistently at 9pt monospace with 0.85 opacity
  - Applies to tags in headings, list items, paragraphs, sidebar, and embeds
  - Covers all plugin tags: `#todo`, `#todone`, `#idea`, `#principle`, `#focus`, `#future`, `#p0`-`#p4`

### Fixed

- **Sidebar empty on startup**: Fixed race condition when Obsidian restores sidebar from previous session
  - Sidebar now triggers vault scan if opened before plugin initialization completes
  - Previously showed empty lists until manual refresh
- **Copy as Slack links**: Links no longer wrapped in angle brackets
  - `[text](url)` now copies as `text (url)` instead of `<url|text>`
  - Bare URLs remain as plain text (Slack auto-links them)

### Improved

- **Documentation**: Updated README with complete settings reference and commands
  - Added missing settings: Default projects folder, Focus list limit
  - Added descriptions to all settings
  - Documented `{{focus-list}}` embed syntax
  - Added Refresh TODOs command to commands table

### Technical

- **Reduced code duplication**: Extracted shared utilities from EmbedRenderer and SidebarView
  - `openFileAtLine()` - opens file and navigates to specific line
  - `highlightLine()` - temporarily highlights a line in editor
  - `renderTextWithTags()` - safely renders text with tag styling (XSS-safe)
  - Removed ~90 lines of duplicated code

## [0.7.2] - 2026-01-15

### Changed

- **Removed item counts from sidebar and embeds**: Section headers (Focus, TODO, Principles, Ideas) and project items no longer display counts

### Improved

- **Unified rendering for ideas and principles**: Ideas and principles now support the same header-with-children pattern as TODOs
  - Header ideas (`## My Idea #idea`) now display child items indented below
  - Header principles work the same way
  - All three types (todos, ideas, principles) share a single rendering method
- **Scanner support for idea/principle headers**: `TodoScanner` now tracks header context for `#idea` and `#principle` tags
  - List items below a header idea/principle are captured as children
  - Children filtered from top-level lists (rendered under their parent)

### Technical

- New `ItemRenderConfig` interface in `types.ts` for unified list item rendering
- Refactored `SidebarView.ts`: consolidated `renderTodoItem`, `renderIdeaItem`, `renderPrincipleItem` into single `renderListItem` method
- Added config constants (`todoConfig`, `ideaConfig`, `principleConfig`) for type-specific behavior
- `TodoScanner.scanFile()` now tracks `currentHeaderIdea` and `currentHeaderPrinciple` for parent-child relationships
- New CSS for idea/principle headers: `.idea-header`, `.idea-header-row`, `.idea-children`, `.principle-header`, `.principle-header-row`, `.principle-children`

## [0.7.1] - 2026-01-15

### Fixed

- **Sidebar empty on load**: Sidebar now populates correctly when Obsidian starts
  - Previously required manual refresh after reboot
  - Root cause: race condition between vault scan and sidebar activation
  - Fix: emit `todos-updated` event after full vault scan completes

- **Completing child TODOs from embeds**: Child items under header TODOs can now be completed from embeds
  - Previously threw error: "Line X no longer contains `#todo` tag"
  - Root cause: child items inherit TODO status from parent header (no explicit `#todo` tag)
  - Fix: detect child items via `parentLineNumber` and append `#todone @date` directly

- **Completed items not disappearing from embeds/sidebar**: Completed TODOs now immediately disappear from lists
  - Previously, completed items remained visible until manual refresh
  - Root cause: UI refreshed before scanner cache was updated (debounced file watcher)
  - Fix: `TodoProcessor` now triggers immediate file rescan after modifications

## [0.7.0] - 2026-01-12

### Added

- **Ideas Tab**: New sidebar tab for capturing ideas separate from actionable TODOs
  - Toggle between TODOs (checkmark icon) and Ideas (lightbulb icon) tabs
  - Sidebar header now shows "␣⌘ Space Command" with tab navigation
- **Idea tracking**: New `#idea` tag for capturing ideas
  - Ideas shown in Ideas tab with checkbox and link to source
  - Clicking checkbox dismisses the idea (removes `#idea` tag)
  - Right-click menu: "Add to TODOs" (converts `#idea` → `#todo`) and "Focus" toggle
- **Principles section**: New `#principle` tag for guiding principles
  - Displayed in italics at top of Ideas tab
  - Principles are reference items (no checkbox action)
- **Focus support for ideas**: `#focus` tag works on ideas for prioritization

### Technical

- Extended `TodoItem` interface with `itemType` discriminator field
- Added `ideasCache` and `principlesCache` to `TodoScanner`
- New `getIdeas()` and `getPrinciples()` methods in `TodoScanner`
- New `completeIdea()`, `convertIdeaToTodo()`, `addFocusToIdea()` methods in `TodoProcessor`
- New `showIdeaMenu()` method in `ContextMenuHandler`
- New `renderIdeasContent()`, `renderPrinciples()`, `renderActiveIdeas()`, `renderIdeaItem()` in `SidebarView`
- New utility functions: `removeIdeaTag()`, `replaceIdeaWithTodo()`
- New CSS: `.sidebar-tab-nav`, `.sidebar-tab-btn`, `.idea-*`, `.principle-*` classes

## [0.6.6] - 2026-01-12

### Fixed

- **Checkbox sync for child TODOs**: Native Obsidian checkbox clicks now sync with sidebar
  - Checking `- [x]` in a header TODO's child items now automatically adds `#todone @date`
  - Previously, checking items in the document didn't update the sidebar (only embeds/sidebar checkboxes worked)
  - Syncs on file scan, so changes appear immediately in sidebar

### Technical

- New `isCheckboxChecked()` helper in `utils.ts`
- New `syncCheckedCheckboxes()` method in `TodoScanner` adds `#todone @date` to checked items
- Scanner detects `- [x]` without `#todone` tag and queues for sync

## [0.6.5] - 2026-01-12

### Added

- **Branded logo styling**: New `␣⌘` logo element with styled appearance
  - Blue background (`#689fd6`), white text, rounded corners
  - Used in sidebar header
  - All Notice messages now prefixed with `␣⌘` for brand consistency

### Technical

- New `.space-command-logo` CSS class for logo styling
- Added `LOGO_PREFIX` constant in `utils.ts` for consistent Notice prefixes
- Updated 13 Notice messages across `main.ts`, `SidebarView.ts`, and `TodoProcessor.ts`

## [0.6.4] - 2026-01-12

### Security

- **Fixed XSS vulnerability**: Replaced unsafe `innerHTML` with safe DOM methods in sidebar tag rendering
  - `wrapTagsInSpans()` rewritten as `renderTextWithTags()` using `createEl()` and `appendText()`
  - Project item rendering now uses safe DOM methods

### Fixed

- **Line content validation**: TODO/TODONE modifications now verify line content before changes
  - Prevents modifying wrong lines if file was edited externally
  - Validates `#todo`/`#todone` tag presence before completion, revert, or priority changes
- **Memory leak prevention**: `CodeBlockProcessor` now reuses plugin's `EmbedRenderer` instance
  - Previously created new renderer for each code block, leaking event listeners

### Improved

- **Type safety**: Replaced `any` types with proper interfaces throughout codebase
  - `FilterParser.applyFilters()` uses `TodoItem[]`
  - `SidebarView` methods use `ProjectInfo` and `TFile`
  - `EmbedRenderer.openFileAtLine()` uses `TFile`
- **Debounced file scanning**: File change handlers now debounced to 100ms
  - Prevents rapid consecutive scans during fast edits
  - Uses Obsidian's built-in `debounce()` function
- **Proper imports**: Replaced `require("obsidian")` with standard imports
  - `Modal`, `MarkdownView`, `Notice` now imported at module level

### Technical

- Extracted `getPriorityValue()` to shared `utils.ts` (was duplicated in 3 files)
- Removed unused `hugo` dependency from package.json
- Build passes with no TypeScript errors

## [0.6.3] - 2026-01-12

### Added

- **Copy as Slack Markdown**: Convert and copy selected text to Slack's mrkdwn format
  - Hotkey: `Cmd/Ctrl + Shift + C`
  - Right-click context menu: "Copy as Slack" (appears when text is selected)
  - Converts `**bold**` → `*bold*`, `*italic*` → `_italic_`
  - Converts `# Heading` → `*Heading*` (bold line)
  - Converts `[text](url)` → `<url|text>` (Slack link format)
  - Handles lists, blockquotes, and code blocks

### Technical

- New `SlackConverter.ts` module wrapping `slackify-markdown` library
- Strips zero-width spaces (U+200B) that the library inserts around formatting markers
- Uses Obsidian's `editor-menu` event for context menu integration

## [0.6.2] - 2026-01-10

### Improved

- **Toggle-able context menu actions**: Right-click menu items now toggle on/off
  - Focus/Unfocus: Removes `#focus` if present, adds it otherwise
  - Later/Unlater: Removes `#p3`/`#p4` if present, lowers priority otherwise
  - Snooze/Unsnooze: Removes `#future` if present, adds it otherwise
- **Normalized tag sizes in headings**: Plugin tags (`#todo`, `#todone`, `#focus`, `#future`, `#p0-#p4`) now render at body text size in headings
  - Applies to both Live Preview (CodeMirror) and Reading Mode
  - Tags no longer scale up with heading size
- **Embed icons positioning**: Moved embed header icons up to avoid overlap with Obsidian's view-source button

### Fixed

- **#focus in code blocks**: `#focus` tags inside code blocks and inline code are now ignored
  - Consistent with existing `#todo`/`#todone` behavior

### Technical

- New `removeTag()` method in TodoProcessor
- Updated `isInInlineCode()` in TodoScanner to detect `#focus`
- CSS selectors for `.cm-header .cm-tag-*` and `.markdown-preview-view h1-h6 .tag[href="#*"]`

## [0.6.1] - 2026-01-10

### Improved

- **Header TODO layout**: Headers with children now display vertically instead of side-by-side
  - Header row shows: checkbox, title (without markdown), count badge, and link
  - Children render indented below the header for better readability
  - Markdown heading markers (`####`) stripped from display text

## [0.6.0] - 2026-01-10

### Added

- **Header TODOs with children**: Headers with `#todo` tag now treat all list items below as child TODOs
  - Example: `## Project X #todo` followed by `- Task 1`, `- Task 2` creates a parent-child hierarchy
  - Children displayed indented under their parent header in sidebar and embeds
  - Completing a header TODO automatically completes all its children
  - Children inherit TODO status from parent (no explicit `#todo` tag needed)
  - Hierarchy ends at next same-level or higher-level header
- **Focus tag highlighting**: Items with `#focus` tag now have accent-colored background in sidebar
  - Applies to both TODO items in the Active TODOs section
  - Also highlights projects in the Focus section that contain `#focus` items
  - Uses Obsidian's `--interactive-accent` color at 15% opacity
  - Hover state increases to 25% opacity
- **TODONE show/hide toggle**: New filter and UI button for controlling completed item visibility in embeds
  - New filter syntax: `todone:show` or `todone:hide`
  - Eye icon toggle button in embed header (next to refresh button)
  - Default: show (displays both TODOs and TODONEs)
  - Toggle state persists across auto-refreshes
  - Example: `` ```focus-todos\ntodone:hide\n``` `` hides completed items

### Improved

- Header TODOs display with bold text styling
- Child TODOs have subtle left border and indentation for visual hierarchy
- Embed rendering refactored to support parent-child relationships

### Technical

- Extended `TodoItem` interface with `isHeader`, `headerLevel`, `parentLineNumber`, `childLineNumbers` fields
- Extended `TodoFilters` interface with `todone` field
- Added `detectHeader()` and `isListItem()` methods to TodoScanner
- Added `completeChildrenLines()` method to TodoProcessor
- Added `todoneVisibility` Map to EmbedRenderer for toggle state
- Updated FilterParser to handle `todone:show|hide` syntax
- New CSS classes: `.todo-header`, `.todo-children`, `.todo-child`, `.todo-focus`, `.project-focus`, `.embed-toggle-todone-btn`

## [0.5.2] - 2026-01-10

### Added

- **`/todos` slash command**: Insert a TODO list with heading and blank item
  - Creates `## TODOs` heading with blank `- [ ] #todo ` item
  - Cursor positioned ready to type task description

### Improved

- **Muted DONE section**: DONE list now displays at 70% opacity
  - Increases to full opacity on hover
  - Visual hierarchy emphasizes active TODOs over completed items
- **Tag-style counts**: TODO and project counts now styled like tags
  - Removed parentheses around numbers (e.g., `5` instead of `(5)`)
  - Consistent pill styling with tags

## [0.5.1] - 2026-01-10

### Added

- **Un-complete TODONEs**: Click checked items in sidebar DONE section to revert
  - Converts `#todone @date` back to `#todo`
  - Unchecks `[x]` to `[ ]` if checkbox exists
  - TODONE log file preserved as history
- **Native checkbox support**: Clicking checkboxes in normal markdown lists now works
  - `- [ ] Task #todo` → click checkbox → converts to `#todone @date`
  - Works in Live Preview and Reading Mode
- **Embed auto-refresh**: Embedded TODO lists now update automatically
  - Subscribes to `todos-updated` events from scanner
  - New TODOs appear immediately without switching tabs
- **Embed refresh button**: Manual refresh icon in top-right of each embed
  - Click to force refresh if needed
  - Subtle 40% opacity, increases on hover

### Fixed

- **Embeds missing TODONEs**: Embedded lists now show both active TODOs and completed TODONEs
  - TODONEs appear at end of list with strikethrough styling
  - Filters apply to both TODOs and TODONEs
- **Duplicate TODOs from lines with both tags**: Lines containing both `#todo` and `#todone` now:
  - Treated as completed (`#todone` wins)
  - `#todo` tag automatically removed from the line
- **Muted tag visibility in sidebar**: Tags and dates now have visible background
  - Changed from `--background-secondary` to `--background-primary` in sidebar
  - Proper contrast against grey sidebar background
- **Muted element font size**: Reduced from 0.9em to 0.8em for better visual hierarchy
  - Applied to `.muted-pill`, `.tag`, `.todo-count`, `.project-count`

### Technical

- New `uncompleteTodo()` method in TodoProcessor
- New `replaceTodoneWithTodo()` and `markCheckboxIncomplete()` utils
- EmbedRenderer tracks active renders with `activeRenders` Map for cleanup
- Added `setupAutoRefresh()`, `setupFocusListAutoRefresh()`, `refreshEmbed()` methods
- DOM event listener in main.ts for native checkbox changes
- New `.embed-header` and `.embed-refresh-btn` CSS classes
- Scanner now detects and auto-cleans lines with both `#todo` and `#todone`

## [0.5.0] - 2026-01-10

### Added

- **Copy embed syntax button**: New copy button in sidebar header
  - Click to open menu with two options: inline or code block syntax
  - Copies embed syntax to clipboard with confirmation notice
- **Auto-sorting in embedded lists**: TODOs now sort by priority then project
  - Active TODOs sorted: #focus → #p0 → #p1 → #p2 → none → #p3 → #p4 → #future
  - Secondary sort by project tag alphabetically within each priority
  - Completed TODONEs always appear at the end
- **Right-click context menu in embedded lists**: Same menu as sidebar
  - Focus, Later, and Snooze actions available on embedded TODOs
  - Shared `ContextMenuHandler` for consistent behavior
- **Completion date display**: TODONEs show completion date with muted pill style
  - Parses @YYYY-MM-DD from completed items
  - Date displayed separately with themed background styling
- **Muted pill styling**: Unified visual style for metadata
  - Tags, counts, and dates use consistent pill appearance
  - 65% opacity with theme-aware background (`--background-secondary`)
  - Rounded corners for tag-like appearance
  - Applied to: priority tags, project tags, todo counts, completio1n dates

### Improved

- Embedded lists and sidebar now share consistent styling
- Priority tags (#focus, #p0-#p4, #future) get muted-pill style in embeds
- Regular project tags styled as tags without pill background

### Technical

- `EmbedRenderer` now accepts `priorityTags` parameter
- Added `sortTodos()`, `getPriorityValue()`, `getFirstProjectTag()` methods
- Added `extractCompletionDate()` for parsing completion dates
- Added `renderTextWithTags()` for inline tag styling with pill classes
- `CodeBlockProcessor` passes `priorityTags` to `EmbedRenderer`
- New `.muted-pill` CSS class for shared styling

## [0.4.0] - 2026-01-08

### Added
- **Slash commands**: Type `/` at start of line for quick insertions
  - `/todo` - Insert a new TODO item (`- [ ] #todo `)
  - `/today` - Insert today's date
  - `/tomorrow` - Insert tomorrow's date
  - `/callout` - Shows callout type sub-menu, inserts `> [!type]` block
  - Callout types: info, tip, note, warning, danger, bug, example, quote, abstract, success, question, failure
- **@date quick insert**: Type `@` anywhere for date suggestions
  - `@date` / `@d` - Today's date
  - `@today` / `@t` - Today's date
  - `@tomorrow` - Tomorrow's date
  - `@yesterday` - Yesterday's date
  - Uses configured date format (default: YYYY-MM-DD)

### Technical
- New `SlashCommandSuggest` class using Obsidian's `EditorSuggest` API
- New `DateSuggest` class for @-triggered date insertion
- Slash commands only trigger at column 0 to avoid conflict with Obsidian's built-in slash commands
- Callouts use native Obsidian callout syntax (`> [!type]`)

## [0.3.1] - 2026-01-08

### Added
- **Priority-based sorting**: TODOs and Projects now sorted by priority
  - Order: #focus, #p0, #p1, #p2, no priority, #p3, #p4
  - Unprioritized TODOs placed between #p2 and #p3 (medium priority)
  - Projects sorted by highest priority of their TODOs, then by TODO count
- **#focus tag support**: Focus action now adds #focus tag in addition to setting #p0
  - #focus tag automatically excluded from Projects list
  - TODOs with #focus appear at the very top of the list
- **Configurable TODONEs limit**: Control number of recent TODONEs displayed in sidebar
  - Default: 5 recent TODONEs
  - New setting: "Recent TODONEs limit"
  - "View all in [filename]" link appears when limit reached
- **#future filtering**: Snoozed TODOs (#future) now hidden from Active TODOs list
  - Keeps Active TODOs list focused on current work
  - #future TODOs still counted but not displayed

### Improved
- Projects list now reflects priority of associated TODOs
- Sidebar UI is more focused with limited TODONEs display
- Priority system is more intuitive with visible #focus tag
- Better distinction between active work and snoozed tasks

### Technical
- Added `highestPriority` field to `ProjectInfo` interface
- Added `recentTodonesLimit` setting to plugin settings
- ProjectManager now tracks highest priority for each project
- New `getPriorityValue()` helper method for consistent priority sorting
- SidebarView filters #future before rendering Active TODOs

## [0.3.0] - 2026-01-08

### Added
- **Context menu for TODO items**: Right-click TODOs in sidebar for quick actions
  - **Focus** (⚡): Increase priority (set to #p0 or decrease priority number)
  - **Later** (🕐): Decrease priority (set to #p4 or increase priority number)
  - **Snooze** (🌙): Set to #future for deferred tasks
- **Priority tag system**: Configurable priority tags (#p0-#p4 by default)
  - #p0 = highest priority (Focus)
  - #p4 = lowest priority (Later)
  - #future = snoozed/deferred tasks
  - Priority tags excluded from Projects list automatically
- **Settings button in sidebar**: Quick access to plugin settings (⚙️ icon next to refresh)

### Fixed
- Priority tags (#p0-#p4, #future) no longer appear in Projects list
- Projects list now correctly excludes all priority-related tags

### Improved
- Smart priority actions are idempotent (safe to repeat)
- Context menu provides keyboard-free workflow for priority management
- Sidebar refreshes automatically after priority changes
- User feedback via Notice for all priority operations

### Technical
- New `ContextMenuHandler` class for managing context menus
- New `setPriorityTag()` method in TodoProcessor for priority manipulation
- ProjectManager now filters configurable priority tags + #future
- Settings UI for customizing priority tags (comma-separated list)
- Uses Obsidian's native Menu API for context menus

## [0.2.1] - 2026-01-08

### Fixed
- **Filter parsing bug**: Fixed regex to support flexible filter syntax
  - Now works: `{{focus-todos | tags:#urgent}}` (filters only with pipe)
  - Now works: `{{focus-todos: tags:#urgent}}` (filters only with colon)
  - Already worked: `{{focus-todos: done.md | tags:#urgent}}` (file + filters)
  - Supports both colon and pipe separators for maximum flexibility
- **Markdown rendering**: TODO text now renders inline markdown
  - **Bold**, *italic*, `code`, and [links](url) now display correctly
  - Strips block-level markers (list bullets, quotes)
  - No extra spacing or newlines (fixed in v0.2.1)
  - Custom inline renderer avoids block-level <p> tags
- **XSS security vulnerability**: Replaced `innerHTML` with safe DOM methods
  - Protects against potential XSS attacks in TODO text
  - Uses tokenizer and DOM manipulation instead of HTML injection

### Improved
- Plugin name consistency: All docs now use "␣⌘ Space Command"
- Documentation reorganization: Internal docs moved to `docs/development/`
- Comprehensive README with table of contents and v0.2.1 features
- Installation paths corrected to `.obsidian/plugins/space-command/`

### Technical
- Updated inline syntax regex from `[^|}\s]*` to `[^|}]*` to allow spaces
- Added smart detection to distinguish file paths from filter keywords
- Implemented custom `renderInlineMarkdown()` with token parser
- Safe markdown rendering using `appendText()` and `createEl()` instead of `innerHTML`
- Supports **bold**, *italic*, `code`, and [links](url) inline syntax

## [0.2.0] - 2026-01-08

### Added
- **Code block syntax support** for `focus-todos` and `focus-list`
  - Works in **both Reading Mode and Live Preview mode**
  - Use ````focus-todos```` for better editing experience
  - Supports multi-line filter syntax for improved readability
  - Example:
    ````markdown
    ```focus-todos
    todos/done.md
    path:projects/
    tags:#urgent
    limit:10
    ```
    ````
- **Comprehensive SYNTAX_GUIDE.md** documentation
  - Complete syntax reference for both inline and code block styles
  - Mode compatibility matrix
  - Migration guide from inline to code blocks
  - Examples and best practices

### Improved
- README.md now explains mode compatibility and both syntax options
- QUICK_REFERENCE.md includes code block examples and comparison table
- Better documentation of inline vs code block syntax differences

### Technical
- New CodeBlockProcessor class for handling code block syntax
- Public helper methods in EmbedRenderer for code reuse
- Both syntaxes share the same rendering engine for consistency

## [0.1.0] - 2026-01-07

### Added
- Initial release of Space Command plugin
- TODO/TODONE tracking across entire vault
- Interactive embed syntax: `{{focus-todos: file.md}}`
- Filter support: `path:`, `tags:`, `limit:`
- Sidebar view with Active TODOs and Recent TODONEs
- **Auto-refresh**: Sidebar automatically updates when TODOs change
  - Event-driven architecture with real-time updates
  - Manual refresh button (🔄) in sidebar header
  - Spinning animation during refresh
- **Line highlighting**: Click `→` to jump to source with visual highlight
  - Entire line is selected for 1.5 seconds
  - Easy to spot the TODO in the source file
  - Works from both sidebar and embeds
- **TODONE deduplication**: Excludes TODONE log file from Recent TODONEs
  - Prevents duplicates (same item appearing from source file and log file)
  - Configurable via `excludeTodoneFilesFromRecent` setting
  - Enabled by default for cleaner UI
- Keyboard shortcuts:
  - `Cmd/Ctrl+Shift+T` - Toggle sidebar
  - `Cmd/Ctrl+Shift+A` - Quick add TODO
- Settings panel for customization
- Smart filtering: automatically excludes TODOs in code blocks
  - Filters out triple backtick code blocks (```)
  - Filters out inline code (single backticks)
  - Prevents documentation examples from being tracked as actual TODOs

### Features
- Real-time file watching for instant updates
- Automatic TODONE logging with completion dates
- Click checkboxes to complete TODOs
- Jump to source file:line with → links
- Sort by date created
- Creates TODONE files and folders automatically

### Technical
- TypeScript implementation
- Built with esbuild
- Obsidian API integration
- Efficient caching for performance
- Event-driven architecture

### Documentation
- README.md - User guide and feature documentation
- CHANGELOG.md - Version history
- CLAUDE.md - Development guidance for this repository
