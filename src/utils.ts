import { App, MarkdownView, TFile, Vault, WorkspaceLeaf, moment } from "obsidian";
import { readFile, writeFile } from "fs/promises";
import { createNoticeFactory } from "./shared";
import type { FocusQueueResult, ItemDate, SortableEntry, TodoItem } from "./types";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "␣⌘";

/**
 * Show a notice with the styled Warped Todo logo badge.
 * Uses the shared notice factory pattern.
 */
export const showNotice = createNoticeFactory(LOGO_PREFIX, "warped-todo-logo");

/**
 * Plugin tags - system tags that get base logo colour styling.
 * These are the core tags that Warped Todo uses.
 */
export const PLUGIN_TAGS = new Set([
  '#todo', '#todos', '#todone', '#todones',
  '#moved',
  '#idea', '#ideas', '#ideation',
  '#principle', '#principles'
]);

/**
 * Priority tag to colour index mapping.
 * Lower index = darker colour (higher priority).
 * Maps to CSS --sc-tag-priority-N variables.
 */
export const PRIORITY_TAG_MAP: Record<string, number> = {
  '#focus': 0,
  '#today': 1,
  '#p0': 2,
  '#p1': 3,
  '#p2': 4,
  '#p3': 5,
  '#p4': 6,
  '#future': 7
};

/**
 * Check if a tags array includes a specific tag (case-insensitive).
 * This normalizes the check to handle #Focus, #FOCUS, #focus etc.
 */
export function hasTag(tags: string[], tag: string): boolean {
  const lowerTag = tag.toLowerCase();
  return tags.some(t => t.toLowerCase() === lowerTag);
}

/**
 * Whether an item belongs to a tag-based scope (a project filter, most
 * commonly) — either it carries the tag explicitly, or it lives in a file
 * whose name maps to that tag (`ProjectManager`'s `inferredFileTag`
 * fallback, e.g. `projects/peep.md` → `#peep`). Shared by list filtering
 * (`filterByActiveTag` in SidebarView.ts) and the focus queue
 * (`buildFocusQueue` below) so scoping to a project behaves identically
 * whichever surface you're looking at it from.
 *
 * Unlike `ProjectManager.getProjects()`'s own use of `inferredFileTag`
 * (which only counts it inside the configured projects folder, excluding
 * excluded folders), this checks it unconditionally — `TodoScanner` sets
 * `inferredFileTag` on every item regardless of location, and threading
 * folder config through every call site here (including the pure
 * `buildFocusQueue`) isn't worth it for what should be a narrow edge case:
 * an unrelated note outside the projects folder happening to share a
 * project's exact tag name as its filename. Accepted trade-off, not an
 * oversight — revisit only if it turns out to bite in practice.
 */
export function itemMatchesTagFilter(item: { tags: string[]; inferredFileTag?: string }, tag: string): boolean {
  if (hasTag(item.tags, tag)) return true;
  return item.inferredFileTag?.toLowerCase() === tag.toLowerCase();
}

/**
 * Tag colour info for semantic colouring.
 */
export interface TagColourInfo {
  type: 'plugin' | 'priority' | 'project';
  priority: number;
}

/**
 * Get colour classification for a tag.
 * Returns type and priority index for CSS styling.
 */
export function getTagColourInfo(
  tag: string,
  projectColourMap?: Map<string, number>
): TagColourInfo {
  const normalizedTag = tag.toLowerCase();

  // Check if it's a plugin system tag
  if (PLUGIN_TAGS.has(normalizedTag)) {
    return { type: 'plugin', priority: 3 }; // mid-range colour for plugin tags
  }

  // Check if it's a priority tag
  if (PRIORITY_TAG_MAP[normalizedTag] !== undefined) {
    return { type: 'priority', priority: PRIORITY_TAG_MAP[normalizedTag] };
  }

  // It's a project tag - look up its colour index or use default
  const colourIndex = projectColourMap?.get(normalizedTag) ?? 4; // default mid-priority
  return { type: 'project', priority: colourIndex };
}

/**
 * Return true if the given metadataCache tag list contains at least one tag
 * that Warped Todo tracks (`PLUGIN_TAGS`). Used by TodoScanner to skip files
 * before reading them, avoiding unnecessary vault I/O.
 *
 * Accepts the `tags` field from `CachedMetadata` directly (or undefined when
 * the file has no tags or hasn't been indexed yet).
 */
export function hasCachedRelevantTags(tags: { tag: string }[] | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  return tags.some(t => PLUGIN_TAGS.has(t.tag.toLowerCase()));
}

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

/**
 * Compact relative-age label for the Posts tab's row meta line (e.g. "~2d")
 * — `moment().fromNow()` only produces the verbose "2 days ago" form, and
 * there's no shorter built-in. Thresholds: hours under a day, days under a
 * week, weeks under a month, months under a year, years beyond that.
 */
export function formatRelativeShort(date: Date | number): string {
  const ms = Date.now() - (typeof date === "number" ? date : date.getTime());
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `~${Math.max(1, Math.round(hours))}h`;
  const days = hours / 24;
  if (days < 7) return `~${Math.round(days)}d`;
  const weeks = days / 7;
  if (days < 31) return `~${Math.round(weeks)}w`;
  const months = days / 30;
  if (days < 365) return `~${Math.round(months)}mo`;
  return `~${Math.round(days / 365)}y`;
}

/**
 * Preset moment.js formats offered for both `insertDateFormat` (the text
 * @today, @tomorrow, @yesterday, and /today, /tomorrow insert into a note)
 * and `dateFormat` (the `#todone @date` completion stamp).
 *
 * Picking a non-numeric preset for `dateFormat` is safe for reopening a
 * completed item (`replaceTodoneWithTodo` matches the stamp generically,
 * not just `YYYY-MM-DD`), but completed items stop sorting newest-first by
 * completion date and fall back to their original order:
 * `extractCompletionDate`/`compareByStatusAndDate` only recognize a
 * `\d{4}-\d{2}-\d{2}` shape.
 *
 * Labels are illustrative, not tied to the current date.
 */
export const DATE_FORMAT_PRESETS: { format: string; label: string }[] = [
  { format: "dddd, MMMM Do", label: "Tuesday, July 10th" },
  { format: "ddd, MMM D", label: "Tue, Jul 10" },
  { format: "MMMM D, YYYY", label: "July 10, 2026" },
  { format: "YYYY-MM-DD", label: "2026-07-10" },
  { format: "D/M/YYYY", label: "10/7/2026" },
];

/** "1 todo", "3 todos" — every word this is used with (todo, idea, bug) pluralizes with a plain "s". */
export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Get the priority value for sorting TODOs.
 * Lower values = higher priority.
 *
 * | Tag              | Value | Meaning                              |
 * |------------------|-------|--------------------------------------|
 * | #today           | 1     | Time-sensitive, due today            |
 * | #p0              | 2     | Highest priority                     |
 * | #p1              | 3     | High priority                        |
 * | #p2              | 4     | Medium-high priority                 |
 * | #p3              | 5     | Medium-low priority                  |
 * | #p4              | 6     | Low priority                         |
 * | No priority      | 7     | Unmarked items                       |
 * | #future/#snooze  | 8     | Snoozed/deferred items               |
 *
 * #focus is handled separately as a sort tier (see compareWithEffectivePriority).
 * Focused items always sort above non-focused items regardless of priority.
 */
export function getPriorityValue(tags: string[]): number {
  if (hasTag(tags, "#today")) return 1;
  if (hasTag(tags, "#p0")) return 2;
  if (hasTag(tags, "#p1")) return 3;
  if (hasTag(tags, "#p2")) return 4;
  if (hasTag(tags, "#p3")) return 5;
  if (hasTag(tags, "#p4")) return 6;
  if (hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed")) return 8;
  return 7;
}

/**
 * Count meaningful tags (excludes system tags like #todo, #todone, #idea, etc.).
 * Used as a tertiary sort criterion after focus and priority.
 */
export function getTagCount(tags: string[]): number {
  const systemTags = new Set([
    "#todo", "#todos", "#todone", "#todones",
    "#moved",
    "#idea", "#ideas", "#ideation",
    "#principle", "#principles",
    "#focus", "#today", "#future", "#snooze", "#snoozed",
    "#p0", "#p1", "#p2", "#p3", "#p4"
  ]);
  // Case-insensitive check against system tags
  return tags.filter(tag => !systemTags.has(tag.toLowerCase())).length;
}

/**
 * Compare two items for sorting.
 * Sort order: 1) #focus tier (focused first), 2) priority, 3) tag count.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTodoItems(
  a: { tags: string[] },
  b: { tags: string[] }
): number {
  // 1. Focus tier: focused items always sort above non-focused
  const aFocused = hasTag(a.tags, "#focus");
  const bFocused = hasTag(b.tags, "#focus");
  if (aFocused && !bFocused) return -1;
  if (!aFocused && bFocused) return 1;

  // 2. Priority (lower value = higher priority)
  const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Tag count (more tags = higher ranking, so sort descending)
  return getTagCount(b.tags) - getTagCount(a.tags);
}

/**
 * Item interface for effective priority calculation.
 * Matches the subset of TodoItem fields needed for sorting.
 */
interface PrioritySortableItem {
  tags: string[];
  filePath: string;
  lineNumber: number;
  isHeader?: boolean;
  childLineNumbers?: number[];
  parentLineNumber?: number;
}

/**
 * Check if an item is snoozed (has #future, #snooze, or #snoozed tag).
 */
function isSnoozed(tags: string[]): boolean {
  return hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed");
}

/**
 * Check if an item is effectively focused, considering children for headers.
 * A header is focused if it has #focus or any active child has #focus.
 */
export function isEffectivelyFocused(
  item: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): boolean {
  if (hasTag(item.tags, "#focus")) return true;
  if (!item.isHeader || !item.childLineNumbers || item.childLineNumbers.length === 0) {
    return false;
  }
  for (const childLine of item.childLineNumbers) {
    const child = allItems.find(
      t => t.filePath === item.filePath && t.lineNumber === childLine
    );
    if (child && !isSnoozed(child.tags) && hasTag(child.tags, "#focus")) {
      return true;
    }
  }
  return false;
}

/**
 * Get effective priority for an item, considering children for header items.
 *
 * - Standalone items: returns their own priority value
 * - Header items with children: returns the better of header priority or child average
 * - Header items without active children: returns their own priority value
 *
 * Snoozed children are excluded from the average so they don't drag down
 * the priority of headers with active work.
 */
export function getEffectivePriority(
  item: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  const headerPriority = getPriorityValue(item.tags);

  // Non-header items use their own priority
  if (!item.isHeader || !item.childLineNumbers || item.childLineNumbers.length === 0) {
    return headerPriority;
  }

  // Header items: compute average priority of active (non-snoozed) children
  const childPriorities: number[] = [];
  for (const childLine of item.childLineNumbers) {
    const child = allItems.find(
      t => t.filePath === item.filePath && t.lineNumber === childLine
    );
    if (child && !isSnoozed(child.tags)) {
      childPriorities.push(getPriorityValue(child.tags));
    }
  }

  if (childPriorities.length === 0) {
    return headerPriority;
  }

  // Return the better (lower) of header priority or child average
  const sum = childPriorities.reduce((a, b) => a + b, 0);
  const childAverage = sum / childPriorities.length;
  return Math.min(headerPriority, childAverage);
}

/**
 * Compare two items for sorting, considering effective priority for headers.
 * Sort order: 1) #focus tier (focused first), 2) effective priority, 3) tag count.
 * Use this instead of compareTodoItems when you have access to all items.
 */
export function compareWithEffectivePriority(
  a: PrioritySortableItem,
  b: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  // 1. Focus tier: focused items always sort above non-focused
  const aFocused = isEffectivelyFocused(a, allItems);
  const bFocused = isEffectivelyFocused(b, allItems);
  if (aFocused && !bFocused) return -1;
  if (!aFocused && bFocused) return 1;

  // 2. Effective priority (considers children for headers)
  const priorityDiff = getEffectivePriority(a, allItems) - getEffectivePriority(b, allItems);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Tag count (more tags = higher ranking, so sort descending)
  return getTagCount(b.tags) - getTagCount(a.tags);
}

/**
 * Compare two items by effective priority and tag count only — without the #focus
 * tier preference used by `compareWithEffectivePriority`. This is used by the
 * "Continue with next priority task" path in immersive Focus Mode, where we
 * deliberately want to surface the next-highest-priority item regardless of
 * whether it carries `#focus`.
 */
export function comparePriorityOnly(
  a: PrioritySortableItem,
  b: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  const priorityDiff = getEffectivePriority(a, allItems) - getEffectivePriority(b, allItems);
  if (priorityDiff !== 0) return priorityDiff;
  return getTagCount(b.tags) - getTagCount(a.tags);
}

/**
 * Compare a `TodoItem` and a project block for the same tier-then-priority
 * ordering `compareWithEffectivePriority` gives two `TodoItem`s — used to
 * interleave synced project blocks into the TODOs/Ideas tabs' active list
 * (`SidebarView.renderActiveTodos`/`renderActiveIdeas`) rather than showing
 * them in a separate section. A project block's tier/priority come from its
 * `ProjectInfo.hasFocusItems`/`highestPriority`, which already folds in
 * synced items (see `ProjectManager.foldSyncedItemsIntoProjects`) — no new
 * priority logic here, just combining two already-computed values.
 *
 * Ties (equal tier and priority) keep todo entries before project entries;
 * an exact tie between two entries of the same kind is left in place
 * (stable sort), matching `compareWithEffectivePriority`'s tag-count
 * tiebreak not applying across kinds.
 */
export function compareSortableEntries(
  a: SortableEntry,
  b: SortableEntry,
  allTodos: TodoItem[]
): number {
  const tierOf = (entry: SortableEntry): { focused: boolean; priority: number } =>
    entry.kind === 'todo'
      ? { focused: isEffectivelyFocused(entry.item, allTodos), priority: getEffectivePriority(entry.item, allTodos) }
      : { focused: entry.project.hasFocusItems, priority: entry.project.highestPriority };

  const tierA = tierOf(a);
  const tierB = tierOf(b);

  if (tierA.focused && !tierB.focused) return -1;
  if (!tierA.focused && tierB.focused) return 1;

  const priorityDiff = tierA.priority - tierB.priority;
  if (priorityDiff !== 0) return priorityDiff;

  if (a.kind === 'todo' && b.kind === 'project') return -1;
  if (a.kind === 'project' && b.kind === 'todo') return 1;
  return 0;
}

/**
 * Resolve the top-level ancestor for an item — the parent header when the
 * item is a child of a header block, otherwise the item itself.
 */
function resolveTopLevelAncestor(
  item: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): PrioritySortableItem {
  if (item.parentLineNumber === undefined) return item;
  const parent = allItems.find(
    t => t.filePath === item.filePath && t.lineNumber === item.parentLineNumber
  );
  return parent ?? item;
}

/**
 * Compare two items in the same order they would be encountered while walking
 * the main TODO list: top-level parents sorted by `compareWithEffectivePriority`,
 * with children appearing in document order beneath their parent.
 *
 * Used by `buildFocusQueue` so the immersive Focus Mode advances through items
 * in the same order the user sees them in the sidebar.
 *
 * - `respectFocusTier`: when true, parent ordering uses `compareWithEffectivePriority`
 *   (focus tier first). When false, falls back to `comparePriorityOnly` for the
 *   "Continue with next priority task" path that explicitly ignores #focus.
 */
export function compareInMainListWalkOrder(
  a: PrioritySortableItem,
  b: PrioritySortableItem,
  allItems: PrioritySortableItem[],
  respectFocusTier: boolean = true
): number {
  const aParent = resolveTopLevelAncestor(a, allItems);
  const bParent = resolveTopLevelAncestor(b, allItems);

  // Different top-level ancestors: order by how the main list would order
  // those ancestors.
  if (aParent.filePath !== bParent.filePath || aParent.lineNumber !== bParent.lineNumber) {
    const parentDiff = respectFocusTier
      ? compareWithEffectivePriority(aParent, bParent, allItems)
      : comparePriorityOnly(aParent, bParent, allItems);
    if (parentDiff !== 0) return parentDiff;
    // Tie-break across files/headers by file path so the order is stable.
    if (aParent.filePath !== bParent.filePath) {
      return aParent.filePath.localeCompare(bParent.filePath);
    }
    return aParent.lineNumber - bParent.lineNumber;
  }

  // Same top-level ancestor: walk in document order so the queue mirrors the
  // way the user reads the source file.
  return a.lineNumber - b.lineNumber;
}

/**
 * Options for `buildFocusQueue`.
 *
 * - `forceFallback`: skip the curated #focus filter and build the queue directly
 *   from top-priority active items. Used for the "Continue with next priority task"
 *   path when the curated #focus queue has been exhausted; the resulting source
 *   will be `priority-fallback` so the card shows the priority hint.
 * - `tagFilter`: scope the queue to items matching this tag (or its file's
 *   inferred tag — see `itemMatchesTagFilter`), same as the TODOs/Ideas
 *   lists' `activeTagFilter`. A header-with-children is never a candidate
 *   itself regardless, so this only needs to check standalone items and
 *   leaf headers directly — their children are checked individually, not
 *   via a parent-match rule like the list view needs.
 */
export interface BuildFocusQueueOptions {
  forceFallback?: boolean;
  tagFilter?: string | null;
}

/**
 * Build the queue of items to show in immersive Focus Mode.
 *
 * Behaviour:
 * 1. Curated queue: items tagged `#focus` directly. Children of headers are
 *    eligible as standalone queue entries (the focus card shows their parent
 *    header text as context). Header items that have children are never
 *    queue entries — the children represent them.
 * 2. Priority fallback: when no #focus items exist (or when the caller passes
 *    `forceFallback: true`), pick the highest-priority candidates instead.
 *    The card surfaces a hint when this happens.
 * 3. Empty: no active items at all.
 *
 * Items are sorted using `compareWithEffectivePriority` and truncated to `limit`.
 *
 * The caller is responsible for filtering out completed items (#todone) before
 * passing them in. Snoozed items (#future / #snooze / #snoozed), header items
 * with children, bold subheading dividers, and (when `options.tagFilter` is
 * set) items outside the active project/tag scope are filtered here.
 */
export function buildFocusQueue(
  activeTodos: TodoItem[],
  limit: number,
  options: BuildFocusQueueOptions = {}
): FocusQueueResult {
  const safeLimit = Math.max(1, Math.floor(limit));

  // Eligible candidates: standalone items, leaf headers, and children. Drop
  // header-with-children entries (their children stand in for them) and
  // bold-subheading dividers. Drop snoozed items.
  const candidates = activeTodos.filter((t) => {
    if (isSnoozed(t.tags)) return false;
    if (t.isSubheading) return false;
    if (t.isHeader && t.childLineNumbers && t.childLineNumbers.length > 0) {
      return false;
    }
    if (options.tagFilter && !itemMatchesTagFilter(t, options.tagFilter)) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return { items: [], source: "empty" };
  }

  if (!options.forceFallback) {
    const focused = candidates.filter((t) => hasTag(t.tags, "#focus"));
    if (focused.length > 0) {
      const sorted = [...focused].sort((a, b) =>
        compareInMainListWalkOrder(a, b, activeTodos, true)
      );
      return { items: sorted.slice(0, safeLimit), source: "focus-tagged" };
    }
  }

  const sorted = [...candidates].sort((a, b) =>
    compareInMainListWalkOrder(a, b, activeTodos, !options.forceFallback)
  );
  return { items: sorted.slice(0, safeLimit), source: "priority-fallback" };
}

/**
 * Rotate the head of an array to the tail and return a new array.
 *
 * Used by Focus Mode's Skip action: the current item moves to the back of the
 * queue without modifying the underlying TODO. Returns the input unchanged when
 * the array has fewer than two elements.
 */
export function rotateQueue<T>(items: T[]): T[] {
  if (items.length < 2) return items;
  const [head, ...rest] = items;
  return [...rest, head];
}

/**
 * Resolve the date to display on the focus card for an item.
 *
 * Prefer an explicit `@YYYY-MM-DD` annotation on the TODO line. Fall back to the
 * source file's last modified time. If neither is available (file missing),
 * return `kind: 'none'`.
 *
 * The TFile parameter is the same `file` field on `TodoItem`. It's accepted as
 * a separate argument to keep the helper testable without instantiating a full
 * TodoItem.
 */
export function getItemDate(todo: TodoItem): ItemDate {
  const match = todo.text.match(/@(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return { kind: "tag", iso: match[1] };
  }

  const file = todo.file as { stat?: { mtime?: number } } | undefined;
  const mtime = file?.stat?.mtime;
  if (typeof mtime === "number" && Number.isFinite(mtime)) {
    const d = new Date(mtime);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { kind: "modified", iso };
  }

  return { kind: "none", iso: null };
}

export function extractTags(text: string): string[] {
  // Remove inline code spans before extracting tags
  // This prevents matching tags inside backticks like `#ideation` (documentation examples)
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const tagRegex = /#[\w-]+/g;
  return textWithoutCode.match(tagRegex) || [];
}

const DATE_KEYWORDS = new Set(["date", "today", "tomorrow", "yesterday"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveMentions(item: TodoItem, meHandle: string | null): string[] {
  return item.mentions.map(m => m === "me" && meHandle ? meHandle : m);
}

/**
 * Resolve mentions with a fallback default for unattributed items.
 * Returns the item's explicit mentions (resolved), or the default assignee if none.
 */
export function resolveEffectiveMentions(
  item: TodoItem,
  meHandle: string | null,
  defaultAssignee: string
): string[] {
  if (item.mentions.length > 0) {
    return resolveMentions(item, meHandle);
  }
  if (!defaultAssignee) return [];
  const resolved = defaultAssignee === "me" && meHandle ? meHandle : defaultAssignee;
  return [resolved];
}

export function extractMentions(text: string): string[] {
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const mentionRegex = /@([\w][\w.-]*)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(textWithoutCode)) !== null) {
    const token = match[1];
    if (DATE_KEYWORDS.has(token.toLowerCase()) || DATE_PATTERN.test(token)) continue;
    mentions.push(token);
  }
  return mentions;
}

/**
 * Convert a filename (without extension) to a tag format.
 * "API Tasks" → "#api-tasks"
 * "my-project" → "#my-project"
 * "Week of January 12th, 2026" → "#week-of-january-12th-2026"
 *
 * Only keeps characters valid in Obsidian tags: letters, numbers, hyphens, underscores.
 */
export function filenameToTag(basename: string): string {
  return "#" + basename
    .toLowerCase()
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/[^\w-]/g, "")         // remove invalid characters
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "");         // trim leading/trailing hyphens
}

export function hasCheckboxFormat(text: string): boolean {
  return /^-\s*\[[ x]\]/i.test(text.trim());
}

export function isCheckboxChecked(text: string): boolean {
  return /^-\s*\[x\]/i.test(text.trim());
}

export function markCheckboxComplete(text: string): string {
  return text.replace(/^(\s*-\s*\[)[ ](\])/, "$1x$2");
}

export function replaceTodoWithTodone(text: string, date: string): string {
  // Handle both singular #todo and plural #todos
  // #todos -> #todones, #todo -> #todone
  if (text.includes('#todos')) {
    return text.replace(/#todos\b/, `#todones @${date}`);
  }
  return text.replace(/#todo\b/, `#todone @${date}`);
}

export function replaceTodoWithMoved(text: string, date: string): string {
  // Handle both singular #todo and plural #todos
  if (text.includes('#todos')) {
    return text.replace(/#todos\b/, `#moved @${date}`);
  }
  return text.replace(/#todo\b/, `#moved @${date}`);
}

/**
 * Extract a YYYY-MM-DD date from a filename.
 * Matches filenames like "2026-03-30.md" or "2026-03-30 daily notes.md".
 * Returns null if no date pattern is found.
 */
export function extractDateFromFilename(basename: string): string | null {
  const match = basename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function replaceTodoneWithTodo(text: string): string {
  // Handle both singular #todone and plural #todones
  // #todones -> #todos, #todone -> #todo
  //
  // The stamp's date can be in any format (see the `dateFormat` setting and
  // DATE_FORMAT_PRESETS), so match everything after `@` up to the next tag
  // or end of line rather than assuming a fixed YYYY-MM-DD shape.
  if (text.includes('#todones')) {
    let result = text.replace(/#todones\s+@[^#]*?(?=\s+#|\s*$)/, "#todos");
    result = result.replace(/#todones\b/, "#todos");
    return result;
  }
  // Replace #todone @<date> with #todo
  let result = text.replace(/#todone\s+@[^#]*?(?=\s+#|\s*$)/, "#todo");
  // Also handle #todone without date
  result = result.replace(/#todone\b/, "#todo");
  return result;
}

export function markCheckboxIncomplete(text: string): string {
  return text.replace(/^(\s*-\s*\[)x(\])/i, "$1 $2");
}

export function removeIdeaTag(text: string): string {
  // Remove #idea, #ideas, or #ideation tag and any trailing whitespace it leaves
  return text.replace(/#idea(?:s|tion)?\b\s*/, "").trim();
}

/**
 * Tags that the tag-cloud excludes — they're lifecycle, type, or structural
 * markers, not project labels. ProjectManager.getProjects uses the same set
 * for the TODOs cloud; this helper lets the Ideas/Snoozed clouds match.
 *
 * Returns a `tag → count` map sorted-insertion-order doesn't matter here;
 * callers sort by count descending.
 */
export function tallyProjectTags(
  items: Array<{ tags: string[] }>,
  priorityTags: string[]
): Map<string, number> {
  const excluded = new Set<string>([
    "#todo", "#todos", "#todone", "#todones",
    "#idea", "#ideas", "#ideation",
    "#principle", "#principles",
    "#future", "#snooze", "#snoozed",
    "#focus", "#today",
    "#moved",
    ...priorityTags,
  ]);
  const counts = new Map<string, number>();
  for (const item of items) {
    // De-dupe within a single item so a line with the same tag twice doesn't
    // double-count — extractTags can return duplicates for `#tag #tag`.
    const seen = new Set<string>();
    for (const tag of item.tags) {
      if (excluded.has(tag) || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

export function replaceIdeaWithTodo(text: string): string {
  return text.replace(/#idea(?:s|tion)?\b/, "#todo");
}

/**
 * Render text with tags safely using DOM methods (avoids XSS).
 * Tags matching mutedTags get muted-pill styling; others get standard tag styling.
 * Adds data attributes for semantic tag colouring.
 *
 * @param text - The text containing tags to render
 * @param container - The DOM element to append to
 * @param mutedTags - Tags that should get muted-pill styling
 * @param projectColourMap - Optional map of project tag to colour index (0-6)
 */
export function renderTextWithTags(
  text: string,
  container: HTMLElement,
  mutedTags: string[] = [],
  projectColourMap?: Map<string, number>
): void {
  const tagRegex = /(#[\w-]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      container.appendText(text.substring(lastIndex, match.index));
    }

    const tag = match[1];
    const colourInfo = getTagColourInfo(tag, projectColourMap);

    let tagEl: HTMLElement;
    if (mutedTags.length > 0 && mutedTags.includes(tag)) {
      // Priority tag: use muted-pill styling
      tagEl = container.createEl("span", {
        cls: "tag muted-pill",
        text: tag,
      });
    } else {
      // Regular tag: standard tag styling
      tagEl = container.createEl("span", {
        cls: "tag",
        text: tag,
      });
    }

    // Add semantic colour data attributes
    tagEl.dataset.scTagType = colourInfo.type;
    tagEl.dataset.scPriority = colourInfo.priority.toString();

    lastIndex = tagRegex.lastIndex;
  }

  // Add remaining text after last tag
  if (lastIndex < text.length) {
    container.appendText(text.substring(lastIndex));
  }
}

/**
 * Highlight a line in the editor by selecting it temporarily.
 */
export function highlightLine(
  editor: MarkdownView["editor"],
  line: number
): void {
  const lineText = editor.getLine(line);
  const lineLength = lineText.length;

  // Select the entire line
  editor.setSelection({ line, ch: 0 }, { line, ch: lineLength });

  // Clear the selection after a delay to create a highlight effect
  setTimeout(() => {
    editor.setCursor({ line, ch: 0 });
  }, 1500);
}

/**
 * Extract completion date from TODONE text.
 * Returns date string (YYYY-MM-DD) or null if not found.
 */
export function extractCompletionDate(text: string): string | null {
  const match = text.match(/@(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Compare items for sorting by status (open first) then completion date (newest first).
 * Sort order: Open TODOs first, then TODONEs by date (newest first), then dateless TODONEs.
 */
export function compareByStatusAndDate(
  a: { text: string; itemType?: string },
  b: { text: string; itemType?: string }
): number {
  const aIsComplete = a.itemType === 'todone';
  const bIsComplete = b.itemType === 'todone';

  // Open items first
  if (!aIsComplete && bIsComplete) return -1;
  if (aIsComplete && !bIsComplete) return 1;

  // Both open - maintain original order
  if (!aIsComplete && !bIsComplete) return 0;

  // Both complete - sort by date (newest first)
  const aDate = extractCompletionDate(a.text);
  const bDate = extractCompletionDate(b.text);

  // Dated items before undated
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;

  // Both dated - newest first
  if (aDate && bDate) {
    return bDate.localeCompare(aDate);
  }

  // Both undated - maintain original order
  return 0;
}

/**
 * Produce a stable fingerprint for a markdown line by stripping all variable content:
 * tags, dates, block references, and markdown structure markers. What remains is the
 * human-readable text of the item, which should be stable across tag changes and completion.
 *
 * An empty string is returned when the line has no human content (e.g., "- [ ] #todo").
 */
export function createFingerprint(text: string): string {
  let content = text.trim();
  content = content.replace(/`[^`]*`/g, "");            // strip inline code spans
  content = content.replace(/^#{1,6}\s+/,"");             // strip header markers (require space — avoids matching #tags)
  content = content.replace(/^[-*+]\s*/,"");             // strip list markers (-, *, +)
  content = content.replace(/^\d+\.\s*/,"");             // strip numbered list markers
  content = content.replace(/^\[[ xX]?\]\s*/,"");        // strip checkboxes
  content = content.replace(/#[\w-]+/g, "");             // strip all tags
  content = content.replace(/@\d{4}-\d{2}-\d{2}/g, ""); // strip @date annotations
  content = content.replace(/\^[\w-]+/g, "");            // strip block reference IDs
  return content.trim();
}

/**
 * Resolve the actual line number to modify, using the stored line number as a fast-path
 * hint and falling back to nearby-line and full-file search when the file has shifted.
 *
 * Returns -1 if no matching line is found.
 * An empty fingerprint skips content matching and always returns the hint unchanged.
 */
export function resolveLineNumber(lines: string[], hint: number, fingerprint: string): number {
  // Empty fingerprint means the item had no human text — use hint as-is
  if (!fingerprint) return hint;

  // Fast path: hint line still matches
  if (hint >= 0 && hint < lines.length && createFingerprint(lines[hint]) === fingerprint) {
    return hint;
  }

  // Nearby search: check up to 15 lines in each direction
  const NEARBY = 15;
  for (let delta = 1; delta <= NEARBY; delta++) {
    const before = hint - delta;
    const after  = hint + delta;
    if (before >= 0 && before < lines.length && createFingerprint(lines[before]) === fingerprint) return before;
    if (after < lines.length && createFingerprint(lines[after]) === fingerprint) return after;
  }

  // Full-file scan as last resort
  return lines.findIndex(l => createFingerprint(l) === fingerprint);
}

/**
 * Read a file, apply a transform to a single line, and write back in one vault.modify() call.
 *
 * When `fingerprint` is supplied and non-empty, the actual line to modify is resolved via
 * `resolveLineNumber()` first, recovering gracefully when external edits have shifted lines.
 * `lineNumber` is used as a fast-path hint; the search expands to ±15 lines then the full file.
 *
 * Throws if the resolved line is out of bounds or if `validate` returns a non-null error string.
 * `validate` receives the current line text before the transform.
 */
export async function modifyFileLine(
  vault: Vault,
  file: TFile,
  lineNumber: number,
  transform: (line: string) => string,
  validate?: (line: string) => string | null,
  fingerprint?: string
): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split("\n");

  const resolved = (fingerprint)
    ? resolveLineNumber(lines, lineNumber, fingerprint)
    : lineNumber;

  if (resolved < 0 || resolved >= lines.length) {
    throw new Error(
      `Cannot locate line ${lineNumber} in ${file.path}` +
      (fingerprint ? ` (fingerprint: "${fingerprint}")` : "")
    );
  }

  const currentLine = lines[resolved];

  if (validate) {
    const error = validate(currentLine);
    if (error) throw new Error(error);
  }

  lines[resolved] = transform(currentLine);
  await vault.modify(file, lines.join("\n"));
}

/**
 * Same algorithm as `modifyFileLine`, for a file outside the vault (e.g. a repo's
 * BUGS.md, referenced via `TodoItem.sourceFile`). Uses Node `fs` instead of the
 * Obsidian Vault API — desktop only, matching `manifest.json`'s `isDesktopOnly: true`.
 *
 * Read-resolve-write happens in one call with no lock between read and write, same
 * as `modifyFileLine`'s relationship to `vault.modify()`. A concurrent external edit
 * (e.g. a commit landing) between the read and the write can still be lost; the
 * fingerprint only protects against the line having *moved*, not against a second
 * writer in the same instant. Acceptable for a single-user desktop plugin — see
 * DESIGN.md's Projects Extension for the tracked limitation.
 */
export async function modifyExternalFileLine(
  filePath: string,
  lineNumber: number,
  transform: (line: string) => string,
  validate?: (line: string) => string | null,
  fingerprint?: string
): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");

  const resolved = (fingerprint)
    ? resolveLineNumber(lines, lineNumber, fingerprint)
    : lineNumber;

  if (resolved < 0 || resolved >= lines.length) {
    throw new Error(
      `Cannot locate line ${lineNumber} in ${filePath}` +
      (fingerprint ? ` (fingerprint: "${fingerprint}")` : "")
    );
  }

  const currentLine = lines[resolved];

  if (validate) {
    const error = validate(currentLine);
    if (error) throw new Error(error);
  }

  lines[resolved] = transform(currentLine);
  await writeFile(filePath, lines.join("\n"), "utf-8");
}

/**
 * Returns the navigation promise (rather than firing-and-forgetting it) so a
 * caller that needs to act once the file is actually showing — e.g.
 * SidebarView's openNoteAndSyncProjects, which can't trust Obsidian's own
 * active-leaf-change/file-open events to fire reliably when the target file
 * was already open (see that method's comment) — can chain onto it. Existing
 * call sites that don't care are unaffected; they already ignored the return
 * value.
 */
export function openFileAtLine(
  app: App,
  file: TFile,
  line: number,
  blockEndLine?: number
): Promise<void> {
  // Reuse an existing leaf that already has the file open
  let leaf: WorkspaceLeaf | null = null;
  app.workspace.iterateAllLeaves((l) => {
    if (!leaf && l.view instanceof MarkdownView && l.view.file?.path === file.path) {
      leaf = l;
    }
  });
  if (!leaf) leaf = app.workspace.getLeaf(false);

  app.workspace.setActiveLeaf(leaf, { focus: true });
  return leaf.openFile(file, { active: true }).then(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) {
      const editor = view.editor;
      const totalLines = editor.lineCount();

      // Determine the end of the block to scroll into view.
      // If blockEndLine provided, use it; otherwise scan forward to find
      // the next header or use a small buffer.
      let endLine = line;
      if (blockEndLine !== undefined && blockEndLine > line) {
        endLine = Math.min(blockEndLine, totalLines - 1);
      } else {
        // Scan forward from the target line to find the block extent
        const maxScan = Math.min(line + 20, totalLines - 1);
        for (let i = line + 1; i <= maxScan; i++) {
          const text = editor.getLine(i);
          // Stop at the next header (any level)
          if (/^#{1,6}\s/.test(text)) break;
          endLine = i;
        }
      }

      // Set cursor to the target line
      editor.setCursor({ line, ch: 0 });

      // Scroll the block range into view, then nudge so the target line
      // sits in the top third of the viewport rather than centered or at bottom
      editor.scrollIntoView(
        { from: { line, ch: 0 }, to: { line: endLine, ch: 0 } },
        true
      );

      // Nudge: scroll up so the target line is near the top third
      const scrollInfo = (editor as any).cm?.scrollDOM;
      if (scrollInfo) {
        const coords = (editor as any).cm.coordsAtPos(
          editor.posToOffset({ line, ch: 0 })
        );
        if (coords) {
          const viewportHeight = scrollInfo.clientHeight;
          const targetOffset = viewportHeight / 4;
          const currentTop = coords.top - scrollInfo.getBoundingClientRect().top;
          const adjustment = currentTop - targetOffset;
          if (Math.abs(adjustment) > 10) {
            scrollInfo.scrollTop += adjustment;
          }
        }
      }

      // Highlight the target line (not the full block)
      highlightLine(editor, line);
    }
  });
}

/**
 * Shared gate for "Send selection to project": the command palette entry
 * and the editor right-click menu item both need the same answer to "is
 * this file a project note with a repo behind it" before offering the
 * action, so the resolution lives here once rather than drifting out of
 * sync between the two call sites.
 *
 * The repo's local path used to be read from the note's own `repo`
 * frontmatter key. That key (along with `branch`/`gitStatus`/`lastSynced`)
 * no longer lives in the note — it was volatile, machine-local, derived
 * state that churned the vault's git history on every sync. `resolveRepoPath`
 * now answers from the live scan / plugin data instead (see
 * `ProjectSyncManager.getRepoPathForProjectName`).
 */
export function getProjectRepoForFile(
  file: TFile | null,
  projectsFolder: string,
  resolveRepoPath: (projectName: string) => string | undefined
): string | undefined {
  if (!file) return undefined;
  if (projectsFolder && !file.path.startsWith(projectsFolder)) return undefined;
  return resolveRepoPath(file.basename);
}
