import {
  App,
  Editor,
  FileSystemAdapter,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TextComponent,
  Vault,
} from "obsidian";
import { join, sep } from "path";
import { TodoScanner } from "./src/TodoScanner";
import { TodoProcessor } from "./src/TodoProcessor";
import { ProjectManager } from "./src/ProjectManager";
import { ProjectScanner } from "./src/ProjectScanner";
import { ProjectSyncManager } from "./src/ProjectSyncManager";
import { SlashCommandSuggest } from "./src/SlashCommandSuggest";
import { AtSuggest } from "./src/AtSuggest";
import { TeamManager } from "./src/TeamManager";
import { HelpNoteManager, majorMinor } from "./src/HelpNoteManager";
import {
  TodoSidebarView,
  VIEW_TYPE_TODO_SIDEBAR,
} from "./src/SidebarView";
import {
  WarpedTodoSettings,
  DEFAULT_SETTINGS,
  TodoItem,
  PostsSidebarOptions,
} from "./src/types";
import { convertToSlackMarkdown } from "./src/SlackConverter";
import { convertToNotionMarkdown } from "./src/NotionConverter";
import { extractTags, showNotice, getProjectRepoForFile, formatDate, DATE_FORMAT_PRESETS } from "./src/utils";
import { MoveTargetModal } from "./src/MoveTargetModal";
import { SendToProjectModal } from "./src/SendToProjectModal";
import { appendQueuedTodo } from "./src/ProjectQueue";
import { TabLockManager } from "./src/TabLockManager";
import { createHeaderSortPlugin } from "./src/HeaderSortExtension";
import { createHeaderChecklistExtension } from "./src/HeaderChecklistExtension";
import { SidebarManager } from "./src/shared";
import { guessProjectsFolder, homeRelativePath, PROJECT_SORT_OPTIONS } from "./src/ProjectsSidebarView";

export default class WarpedTodoPlugin extends Plugin {
  settings: WarpedTodoSettings;
  scanner: TodoScanner;
  processor: TodoProcessor;
  projectManager: ProjectManager;
  projectScanner: ProjectScanner;
  projectSyncManager: ProjectSyncManager;
  tabLockManager: TabLockManager;
  teamManager: TeamManager;
  helpNoteManager: HelpNoteManager;
  private sidebarManager: SidebarManager;

  async onload() {
    await this.loadSettings();

    // If the user has opted out of persisting Focus Mode across sessions, reset
    // the persisted active flag at startup so the sidebar opens in normal mode.
    if (!this.settings.focusModePersist && this.settings.focusModeActive) {
      this.settings.focusModeActive = false;
      await this.saveSettings();
    }

    // Initialize sidebar manager. Projects is a tab within this same
    // sidebar now (TodoSidebarView's 'projects' mode), not a second view —
    // see ProjectsSidebarView.ts's file-level comment — so there's only
    // one manager, matching there being only one leaf.
    this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_TODO_SIDEBAR);

    // Initialize team manager
    this.teamManager = new TeamManager(this.app, this.settings.teamFilePath);
    this.teamManager.watchFile();

    // Initialize help note manager
    this.helpNoteManager = new HelpNoteManager(this.app);

    // Initialize core components
    this.scanner = new TodoScanner(this.app);
    this.processor = new TodoProcessor(this.app, this.settings.dateFormat);
    this.processor.setScanner(this.scanner);
    this.projectManager = new ProjectManager(
      this.app,
      this.scanner,
      this.settings.defaultProjectsFolder,
      this.settings.priorityTags,
      this.settings.excludeFoldersFromProjects
    );
    this.projectScanner = new ProjectScanner();
    // onSynced must apply results directly (applyProjectSyncResult), not go
    // through SidebarManager.refresh()/view.reload() — reload() itself calls
    // syncAll(), which would fire onSynced again: an unbounded loop. See
    // TodoSidebarView.applyProjectSyncResult's doc comment for how this was found.
    this.projectSyncManager = new ProjectSyncManager(
      this.app,
      this.projectScanner,
      (scanned) =>
        this.sidebarManager.forEach<TodoSidebarView>((view) => view.applyProjectSyncResult(scanned)),
      // Per-project sync bookkeeping (repo path + last-synced time) lives in
      // data.json, not the project note's frontmatter — see ProjectSyncManager
      // and WarpedTodoSettings.projectSyncState. Saved on a debounce so a scan
      // touching many projects is one write, not one per project.
      {
        get: (name) => this.settings.projectSyncState[name],
        set: (name, entry) => {
          this.settings.projectSyncState[name] = entry;
          this.scheduleProjectSyncStateSave();
        },
        prune: (currentNames) => {
          const keep = new Set(currentNames);
          let changed = false;
          for (const name of Object.keys(this.settings.projectSyncState)) {
            if (!keep.has(name)) {
              delete this.settings.projectSyncState[name];
              changed = true;
            }
          }
          if (changed) this.scheduleProjectSyncStateSave();
        },
      }
    );
    // Desktop-only feature (Node fs/child_process — see manifest.json's isDesktopOnly).
    // Only starts watching if a base folder is actually configured.
    if (this.settings.projectsBaseFolder) {
      this.projectSyncManager.startWatching(this.projectsSyncOptions());
    }
    // Initialize tab lock manager
    this.tabLockManager = new TabLockManager(this.app);

    // Enable tab lock buttons if setting is enabled
    if (this.settings.showTabLockButton) {
      this.app.workspace.onLayoutReady(() => {
        this.tabLockManager.enable();
      });
    }

    // Set up processor callback to trigger re-scan after completion
    this.processor.setOnCompleteCallback(() => {
      // File will be modified, which will trigger scanner's file watcher
      this.app.workspace.trigger("markdown-changed");
    });

    // Track move-to targets for the file picker
    this.processor.setOnMoveHistoryUpdate(async (path: string) => {
      const history = this.settings.moveHistory.filter(p => p !== path);
      history.unshift(path);
      this.settings.moveHistory = history.slice(0, 10);
      await this.saveData(this.settings);
    });

    // Set up file watchers immediately so changes during startup are not missed.
    // The metadataCache.on("changed") watcher (the primary trigger) is safe to
    // register before the cache is resolved — it simply won't fire until files
    // are indexed.
    this.scanner.watchFiles();

    // Defer the initial vault scan until the workspace layout is ready.
    // onLayoutReady fires after Obsidian's metadata cache has finished its
    // initial indexing pass, ensuring getFileCache() returns accurate results
    // for the pre-filter check introduced in phase 3.
    this.app.workspace.onLayoutReady(async () => {
      await this.teamManager.load();
      await this.scanner.scanVault();

      // Activate the sidebar after the scan so it has data to show on first render.
      if (this.settings.showSidebarByDefault) {
        this.sidebarManager.activate();
      }

      // First-use help note: reveal on install, and again on any minor
      // version bump (see HelpNoteManager — creates once, never overwrites).
      const currentVersionKey = majorMinor(this.manifest.version);
      if (this.settings.helpNoteLastSeenVersion !== currentVersionKey) {
        this.settings.helpNoteLastSeenVersion = currentVersionKey;
        await this.saveSettings();
        void this.helpNoteManager.open();
      }
    });

    // Register editor extension for header sort buttons
    this.registerEditorExtension(
      createHeaderSortPlugin(this.app, this.processor, this.scanner)
    );

    // Register editor extension for auto-inserting checklists after tagged headers
    this.registerEditorExtension(createHeaderChecklistExtension());

    // Watch for native checkbox clicks on #todo lines
    this.registerDomEvent(document, "change", async (evt) => {
      const target = evt.target as HTMLInputElement;

      // Only handle checkbox changes in the editor
      if (!target.matches('input[type="checkbox"].task-list-item-checkbox')) {
        return;
      }

      // Only process if checkbox was just checked (not unchecked)
      if (!target.checked) {
        return;
      }

      // Give Obsidian time to update the file
      await new Promise((resolve) => setTimeout(resolve, 100));

      const file = this.app.workspace.getActiveFile();
      if (!file) return;

      // Read the updated file content to find any #todo with [x]
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Find lines with #todo (not #todone) that have completed checkbox
        if (
          line.includes("#todo") &&
          !line.includes("#todone") &&
          /^-\s*\[x\]/i.test(line.trim())
        ) {
          // This is a #todo line with a checked checkbox - process it
          const todos = this.scanner.getTodos();
          const todo = todos.find(
            (t) => t.file.path === file.path && t.lineNumber === i
          );

          if (todo) {
            await this.processor.completeTodo(todo);
            break; // Process one at a time
          }
        }
      }
    });

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_TODO_SIDEBAR,
      (leaf) =>
        new TodoSidebarView(
          leaf,
          this.scanner,
          this.processor,
          this.projectManager,
          this.projectScanner,
          this.projectSyncManager,
          () => this.projectsSyncOptions(),
          () => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById(this.manifest.id);
          },
          this.settings.priorityTags,
          this.settings.activeTodosLimit,
          this.settings.makeLinksClickable,
          () => this.showAboutModal(),
          () => this.showStatsModal(),
          () => this.settings.moveHistory,
          this.teamManager,
          this.settings.defaultAssignee,
          this.settings.focusQueueLimit,
          this.settings.focusModeActive,
          async (active: boolean) => {
            this.settings.focusModeActive = active;
            await this.saveSettings();
          },
          this.settings.defaultProjectsSortKey,
          () => this.postsOptions()
        )
    );

    // Sidebar is activated inside onLayoutReady above (after scanVault completes).

    // Register editor suggesters for slash commands and @date/@user
    this.registerEditorSuggest(new SlashCommandSuggest(this.app, this.settings));
    this.registerEditorSuggest(new AtSuggest(this.app, this.settings, this.teamManager));

    // Commands
    this.addCommand({
      id: "toggle-todo-sidebar",
      name: "Toggle TODO Sidebar",
      callback: () => {
        this.sidebarManager.toggle();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "t",
        },
      ],
    });

    this.addCommand({
      id: "quick-add-todo",
      name: "Quick Add TODO",
      editorCallback: (editor, view) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // If line is empty or whitespace, insert a new todo
        if (line.trim() === "") {
          editor.replaceRange("- [ ] #todo ", cursor);
          editor.setCursor({ line: cursor.line, ch: 6 });
        } else {
          // Append #todo to the end of the line
          const endOfLine = { line: cursor.line, ch: line.length };
          editor.replaceRange(" #todo", endOfLine);
        }
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "a",
        },
      ],
    });

    this.addCommand({
      id: "refresh-todos",
      name: "Refresh TODOs",
      callback: async () => {
        await this.scanner.scanVault();
        this.sidebarManager.refresh();
      },
    });

    this.addCommand({
      id: "move-todo",
      name: "Move TODO to another file",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const tags = extractTags(line);

        if (!tags.includes("#todo") && !tags.includes("#todos")) {
          showNotice("Cursor isn't on a TODO line.");
          return;
        }

        // Find the matching TodoItem from scanner
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file) return;

        const todos = this.scanner.getTodos();
        const todo = todos.find(
          (t) => t.file.path === file.path && t.lineNumber === cursor.line
        );

        if (!todo) {
          showNotice("Couldn't find a TODO at the cursor.");
          return;
        }

        new MoveTargetModal(
          this.app,
          this.settings.moveHistory,
          file.path,
          async (targetFile) => {
            await this.processor.moveTodo(todo, targetFile.path);
          }
        ).open();
      },
    });

    // Only available from a repo-matched project note with an active
    // selection — checkCallback so it just doesn't appear where it can't do
    // anything, rather than erroring. The repo path comes from the live
    // scan / projectSyncState now, not a frontmatter key.
    this.addCommand({
      id: "send-selection-to-project",
      name: "Send selection to project",
      editorCheckCallback: (checking, editor, ctx) => {
        const file = ctx.file;
        const repo = getProjectRepoForFile(
          file,
          this.settings.defaultProjectsFolder,
          (name) => this.projectSyncManager.getRepoPathForProjectName(name)
        );
        const selection = editor.getSelection();
        if (!repo || !selection.trim()) return false;
        if (checking) return true;

        this.openSendSelectionToProjectModal(file!, repo, editor);
        return true;
      },
    });

    this.addCommand({
      id: "copy-as-slack",
      name: "Copy as Slack Markdown",
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          showNotice("No text selected.");
          return;
        }
        const slackMd = convertToSlackMarkdown(selection);
        await navigator.clipboard.writeText(slackMd);
        showNotice("Copied as Slack Markdown.");
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "c",
        },
      ],
    });

    this.addCommand({
      id: "copy-as-notion",
      name: "Copy as Notion Markdown",
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          showNotice("No text selected.");
          return;
        }
        const notionMd = convertToNotionMarkdown(selection);
        await navigator.clipboard.writeText(notionMd);
        showNotice("Copied as Notion Markdown.");
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "n",
        },
      ],
    });

    // Editor context menu: Copy as Slack, Copy as Notion, Send to project, and Define
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const selection = editor.getSelection();
        if (selection) {
          menu.addItem((item) => {
            item
              .setTitle("Copy as Slack")
              .setIcon("clipboard-copy")
              .onClick(async () => {
                const slackMd = convertToSlackMarkdown(selection);
                await navigator.clipboard.writeText(slackMd);
                showNotice("Copied as Slack Markdown.");
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Copy as Notion")
              .setIcon("clipboard-copy")
              .onClick(async () => {
                const notionMd = convertToNotionMarkdown(selection);
                await navigator.clipboard.writeText(notionMd);
                showNotice("Copied as Notion Markdown.");
              });
          });

          // Same repo gate as the "Send selection to project" command —
          // only offer this in a repo-matched project note.
          const file = info.file;
          const repo = getProjectRepoForFile(
            file,
            this.settings.defaultProjectsFolder,
            (name) => this.projectSyncManager.getRepoPathForProjectName(name)
          );
          if (repo) {
            menu.addItem((item) => {
              item
                .setTitle("Send selection to project")
                .setIcon("send")
                .onClick(() => {
                  this.openSendSelectionToProjectModal(file!, repo, editor);
                });
            });
          }
        }
      })
    );

    this.addCommand({
      // id unchanged — renaming it would silently drop anyone's existing hotkey binding.
      id: "toggle-projects-sidebar",
      name: "Toggle Projects Tab",
      callback: () => {
        this.openProjectsTab();
      },
    });

    this.addCommand({
      id: "sync-projects",
      name: "Sync Projects",
      callback: async () => {
        // Runs independent of whether the sidebar is open — onSynced (wired in
        // the ProjectSyncManager constructor above) refreshes it automatically
        // if it happens to be.
        if (!this.settings.projectsBaseFolder) {
          showNotice("No Projects base folder configured yet. Set one in settings.");
          return;
        }
        await this.projectSyncManager.syncAll(this.projectsSyncOptions());
        showNotice("Projects synced.");
      },
    });

    // Add ribbon icon. Projects doesn't get its own — it's a tab within
    // this same sidebar (see ProjectsSidebarView.ts's file-level comment),
    // reached via the Projects tab button or the "toggle-projects-sidebar"
    // command, both of which work whether or not the sidebar is open.
    this.addRibbonIcon("square-check-big", "Toggle TODO Sidebar", () => {
      this.sidebarManager.toggle();
    });

    // Add settings tab
    this.addSettingTab(new WarpedTodoSettingTab(this.app, this));
  }

  /** Builds ProjectSyncManager's SyncOptions/ProjectsSidebarOptions from current settings. */
  projectsSyncOptions() {
    return {
      baseFolder: this.settings.projectsBaseFolder,
      projectsFolder: this.settings.defaultProjectsFolder,
      excludeDirs: this.settings.projectsExcludeDirs,
      scanDepth: this.settings.projectsScanDepth,
      maxDepth: this.settings.projectsScanDepth,
      autoOpenOnLinkedNote: this.settings.autoOpenProjectsOnLinkedNote,
      terminalApp: this.settings.projectsTerminalApp,
      editorApp: this.settings.projectsEditorApp,
    };
  }

  /** Builds PostsSidebarOptions from current settings — deliberately its own method, not folded into projectsSyncOptions(). See HugoScanner.ts's module comment. */
  postsOptions(): PostsSidebarOptions {
    return {
      editorApp: this.settings.postsEditorApp,
    };
  }

  /**
   * Opens the "Send selection to project" title prompt and, on submit,
   * appends the editor's current selection to the project's TODO.md.
   * Shared by the command palette entry and the editor right-click menu
   * item so the two triggers can't drift apart in behaviour.
   */
  private openSendSelectionToProjectModal(file: TFile, repo: string, editor: Editor): void {
    const selection = editor.getSelection();
    new SendToProjectModal(this.app, file.basename, async (title) => {
      try {
        const filePath = await appendQueuedTodo(repo, title, selection);
        showNotice(`Sent to ${homeRelativePath(filePath)}.`);
      } catch (error) {
        console.error("[Warped Todo]", "Failed to send selection to project:", error);
        showNotice("Couldn't send selection to the project. See console for details.");
      }
    }).open();
  }

  onunload() {
    // Detach the sidebar view
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);
    // Migration cleanup: pre-0.35.3 installs could have a leaf of the old,
    // now-unregistered standalone Projects view still saved in the user's
    // workspace layout (Projects folded into TodoSidebarView as a tab —
    // see ProjectsSidebarView.ts's file-level comment). Detaching by the
    // hardcoded former VIEW_TYPE_PROJECTS_SIDEBAR string clears it instead
    // of leaving an unrecognized-view leaf behind.
    this.app.workspace.detachLeavesOfType("warped-todo-projects-sidebar");
    // Clean up tab lock manager
    this.tabLockManager.destroy();
    // Stop the Projects file watcher (fs.watch doesn't clean itself up)
    this.projectSyncManager?.stopWatching();
    // Flush any pending projectSyncState write so a sync that landed just
    // before unload isn't lost.
    if (this.projectSyncStateSaveTimer) {
      clearTimeout(this.projectSyncStateSaveTimer);
      this.projectSyncStateSaveTimer = null;
      void this.saveSettings();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private projectSyncStateSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Debounced persist for `settings.projectSyncState`. A full project scan
   * calls the store's `set` once per project; without the debounce that's a
   * `data.json` write per repo. 2s comfortably covers a scan pass.
   */
  private scheduleProjectSyncStateSave(): void {
    if (this.projectSyncStateSaveTimer) clearTimeout(this.projectSyncStateSaveTimer);
    this.projectSyncStateSaveTimer = setTimeout(() => {
      this.projectSyncStateSaveTimer = null;
      void this.saveSettings();
    }, 2000);
  }

  /** Refresh all sidebar views (delegates to SidebarManager). */
  refreshSidebar() {
    this.sidebarManager.refresh();
  }

  /**
   * Opens (if closed) the TODO sidebar and switches it to the Projects
   * tab — Settings' "Open Projects tab" button and the
   * "toggle-projects-sidebar" command both go through this. With a tag,
   * jumps straight to that project's detail view.
   */
  async openProjectsTab(tag?: string) {
    await this.sidebarManager.activate();
    this.sidebarManager.getView<TodoSidebarView>()?.openProjectsTab(tag);
  }

  showAboutModal() {
    new AboutModal(this.app, this.manifest.version).open();
  }

  showStatsModal() {
    new StatsModal(this.app, this.scanner).open();
  }

}

// About modal for displaying plugin information
class AboutModal extends Modal {
  private version: string;

  constructor(app: App, version: string) {
    super(app);
    this.version = version;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("warped-todo-about-modal");

    // Logo and title
    const header = contentEl.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: "warped-todo-logo about-logo", text: "␣⌘" });
    header.createEl("h2", { text: "Warped Command" });

    // Version
    contentEl.createEl("p", { cls: "about-version", text: `Version ${this.version}` });

    // Blurb
    contentEl.createEl("p", {
      cls: "about-blurb",
      text: "Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.",
    });

    // Details
    const details = contentEl.createEl("div", { cls: "about-details" });
    details.createEl("p", { text: "Author: Bruce Alderson" });

    const repoLink = details.createEl("p");
    repoLink.appendText("Repository: ");
    repoLink.createEl("a", {
      text: "github.com/robotpony/warped-command",
      href: "https://github.com/robotpony/warped-command/blob/main/README.md",
    });

    details.createEl("p", { text: "Made in 🇨🇦", cls: "about-made-in" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Stats modal for displaying vault statistics
class StatsModal extends Modal {
  private scanner: TodoScanner;

  constructor(app: App, scanner: TodoScanner) {
    super(app);
    this.scanner = scanner;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("warped-todo-stats-modal");

    // Header
    const header = contentEl.createEl("div", { cls: "stats-header" });
    header.createEl("span", { cls: "warped-todo-logo stats-logo", text: "␣⌘" });
    header.createEl("h2", { text: "Vault Statistics" });

    // Gather stats
    const todos = this.scanner.getTodos();
    const todones = this.scanner.getTodones();
    const ideas = this.scanner.getIdeas();
    const principles = this.scanner.getPrinciples();

    // Count focused items
    const focusedTodos = todos.filter(t => t.tags.includes("#focus")).length;
    const focusedIdeas = ideas.filter(i => i.tags.includes("#focus")).length;

    // Count snoozed items
    const snoozedTodos = todos.filter(t => t.tags.includes("#future")).length;

    // Stats grid
    const statsGrid = contentEl.createEl("div", { cls: "stats-grid" });

    // TODOs section
    const todosSection = statsGrid.createEl("div", { cls: "stats-section" });
    todosSection.createEl("h3", { text: "TODOs" });
    this.createStatRow(todosSection, "Active", todos.length);
    this.createStatRow(todosSection, "Focused", focusedTodos);
    this.createStatRow(todosSection, "Snoozed", snoozedTodos);
    this.createStatRow(todosSection, "Completed", todones.length);

    // Ideas section
    const ideasSection = statsGrid.createEl("div", { cls: "stats-section" });
    ideasSection.createEl("h3", { text: "Ideas" });
    this.createStatRow(ideasSection, "Total", ideas.length);
    this.createStatRow(ideasSection, "Focused", focusedIdeas);

    // Principles section
    const principlesSection = statsGrid.createEl("div", { cls: "stats-section" });
    principlesSection.createEl("h3", { text: "Principles" });
    this.createStatRow(principlesSection, "Total", principles.length);

    // Summary
    const summarySection = contentEl.createEl("div", { cls: "stats-summary" });
    const total = todos.length + todones.length + ideas.length + principles.length;
    summarySection.createEl("p", {
      text: `Total tracked items: ${total}`,
      cls: "stats-total"
    });
  }

  private createStatRow(container: HTMLElement, label: string, value: number): void {
    const row = container.createEl("div", { cls: "stats-row" });
    row.createEl("span", { cls: "stats-label", text: label });
    row.createEl("span", { cls: "stats-value", text: String(value) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Native folder picker for the Projects base folder setting — Electron's
 * synchronous dialog, same electron.remote fallback SidebarView.ts's
 * revealProjectInFinder uses for shell.showItemInFolder (this plugin is
 * desktop-only anyway; see manifest.json's isDesktopOnly). Returns null on
 * cancel or failure; a failure shows a notice rather than throwing, so a
 * picker error doesn't crash the settings tab.
 */
function chooseFolder(defaultPath: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const dialog = electron.remote?.dialog ?? electron.dialog;
    const result = dialog.showOpenDialogSync({
      title: "Choose Projects folder",
      defaultPath,
      properties: ["openDirectory", "createDirectory"],
    });
    return result && result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Warped Todo]", "Failed to open folder picker:", error);
    showNotice("Couldn't open the folder picker. See console for details.");
    return null;
  }
}

/**
 * Native OS file/folder picker for settings that store a vault-relative
 * path — as opposed to chooseFolder() above, whose Projects base folder
 * setting stores an absolute filesystem path to a folder of git repos
 * outside the vault entirely. Opens starting at the vault's own root plus
 * the current value, and relativizes the result back against the vault's
 * base path: Electron's dialog has no way to restrict navigation to a
 * subtree, so a pick outside the vault is rejected with a notice rather
 * than silently writing a broken value into a vault-relative setting.
 * Folder results get a trailing slash, matching this plugin's own
 * folder-path convention (e.g. defaultProjectsFolder's "projects/").
 * Returns null on cancel, a pick outside the vault, or failure (mobile
 * has no FileSystemAdapter, but this plugin is desktop-only anyway).
 */
function chooseVaultPath(vault: Vault, kind: "file" | "folder", title: string, currentValue: string): string | null {
  const adapter = vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return null;
  const basePath = adapter.getBasePath();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const dialog = electron.remote?.dialog ?? electron.dialog;
    const result = dialog.showOpenDialogSync({
      title,
      defaultPath: currentValue ? join(basePath, currentValue) : basePath,
      properties: kind === "folder" ? ["openDirectory", "createDirectory"] : ["openFile"],
    });
    if (!result || result.length === 0) return null;
    const chosen = result[0];
    if (chosen !== basePath && !chosen.startsWith(basePath + sep)) {
      showNotice("Choose a location inside your vault.");
      return null;
    }
    const relative = chosen === basePath ? "" : chosen.slice(basePath.length + 1).split(sep).join("/");
    return kind === "folder" && relative ? `${relative}/` : relative;
  } catch (error) {
    console.error("[Warped Todo]", "Failed to open picker:", error);
    showNotice("Couldn't open the picker. See console for details.");
    return null;
  }
}

class WarpedTodoSettingTab extends PluginSettingTab {
  plugin: WarpedTodoPlugin;
  // Set inside display() by the Projects base folder field; applies the
  // pending value (restart the file watcher, full resync) once, deduped
  // against what was last applied. Covers the "modal closed with the field
  // still focused" case, where a blur event may not fire — see that field's
  // own comment for why the actual apply is deferred to blur in the first
  // place.
  private pendingProjectsBaseFolderApply: (() => Promise<void>) | null = null;
  // Sticky across display() re-renders: true once the user explicitly picks
  // "Custom…" in the insert date format dropdown, so the text field stays
  // visible even if what they type happens to match a preset's format string.
  private showCustomInsertDateFormat = false;
  // Same, for the completion date format dropdown.
  private showCustomCompletionDateFormat = false;

  constructor(app: App, plugin: WarpedTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide(): void {
    void this.pendingProjectsBaseFolderApply?.();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Warped Command Settings" });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "warped-todo-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "warped-todo-logo about-logo", text: "␣⌘" });
    aboutHeader.createEl("span", { cls: "about-title", text: "Warped Command" });

    aboutSection.createEl("p", {
      cls: "about-blurb",
      text: "Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.",
    });

    aboutSection.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });

    const aboutDetails = aboutSection.createEl("div", { cls: "about-details" });
    aboutDetails.createEl("span", { text: "By Bruce Alderson" });
    aboutDetails.appendText(" · ");
    aboutDetails.createEl("a", {
      text: "GitHub",
      href: "https://github.com/robotpony/warped-command/blob/main/README.md",
    });

    // Sidebar section (first)
    containerEl.createEl("h3", { text: "Sidebar" });

    new Setting(containerEl)
      .setName("Show sidebar by default")
      .setDesc("Show the TODO sidebar when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSidebarByDefault)
          .onChange(async (value) => {
            this.plugin.settings.showSidebarByDefault = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show tab lock buttons")
      .setDesc("Add lock buttons to tab headers. Locked tabs force links to open in new tabs.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTabLockButton)
          .onChange(async (value) => {
            this.plugin.settings.showTabLockButton = value;
            if (value) {
              this.plugin.tabLockManager.enable();
            } else {
              this.plugin.tabLockManager.disable();
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Make links clickable in lists")
      .setDesc("Render wiki links and markdown links as clickable in the sidebar. When disabled, links display as plain text without markdown syntax.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.makeLinksClickable)
          .onChange(async (value) => {
            this.plugin.settings.makeLinksClickable = value;
            await this.plugin.saveSettings();
            this.plugin.refreshSidebar();
          })
      );

    // TODOs section
    containerEl.createEl("h3", { text: "TODOs" });

    const completionFormatIsPreset = DATE_FORMAT_PRESETS.some(
      (p) => p.format === this.plugin.settings.dateFormat
    );
    const showCustomCompletionField = this.showCustomCompletionDateFormat || !completionFormatIsPreset;

    new Setting(containerEl)
      .setName("Completion date format")
      .setDesc(
        "Format for #todone completion stamps. Stick to a format that sorts the same as it reads (like the default) " +
        "so completed items keep sorting newest-first; anything else still reopens cleanly but falls back to original order."
      )
      .addDropdown((dropdown) => {
        for (const preset of DATE_FORMAT_PRESETS) {
          dropdown.addOption(preset.format, preset.label);
        }
        dropdown.addOption("custom", "Custom…");
        dropdown.setValue(showCustomCompletionField ? "custom" : this.plugin.settings.dateFormat);
        dropdown.onChange(async (value) => {
          if (value === "custom") {
            this.showCustomCompletionDateFormat = true;
            this.display();
            return;
          }
          this.showCustomCompletionDateFormat = false;
          this.plugin.settings.dateFormat = value;
          this.plugin.processor = new TodoProcessor(this.app, value);
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (showCustomCompletionField) {
      new Setting(containerEl)
        .setName("Custom completion date format")
        .setDesc("moment.js format string, e.g. YYYY-MM-DD → 2026-05-09, D/M/YYYY → 9/5/2026")
        .addText((text) =>
          text
            .setPlaceholder("YYYY-MM-DD")
            .setValue(this.plugin.settings.dateFormat)
            .onChange(async (value) => {
              this.plugin.settings.dateFormat = value;
              this.plugin.processor = new TodoProcessor(this.app, value);
              await this.plugin.saveSettings();
            })
        );
    }

    const insertFormatIsPreset = DATE_FORMAT_PRESETS.some(
      (p) => p.format === this.plugin.settings.insertDateFormat
    );
    const showCustomInsertField = this.showCustomInsertDateFormat || !insertFormatIsPreset;

    new Setting(containerEl)
      .setName("Insert date format")
      .setDesc(
        `Format @today, @tomorrow, @yesterday, @date, /today, and /tomorrow insert into note text. Today: "${formatDate(new Date(), this.plugin.settings.insertDateFormat)}"`
      )
      .addDropdown((dropdown) => {
        for (const preset of DATE_FORMAT_PRESETS) {
          dropdown.addOption(preset.format, preset.label);
        }
        dropdown.addOption("custom", "Custom…");
        dropdown.setValue(showCustomInsertField ? "custom" : this.plugin.settings.insertDateFormat);
        dropdown.onChange(async (value) => {
          if (value === "custom") {
            this.showCustomInsertDateFormat = true;
            this.display();
            return;
          }
          this.showCustomInsertDateFormat = false;
          this.plugin.settings.insertDateFormat = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (showCustomInsertField) {
      new Setting(containerEl)
        .setName("Custom insert date format")
        .setDesc("moment.js format string, e.g. dddd, MMMM Do → Tuesday, July 10th")
        .addText((text) =>
          text
            .setPlaceholder("dddd, MMMM Do")
            .setValue(this.plugin.settings.insertDateFormat)
            .onChange(async (value) => {
              this.plugin.settings.insertDateFormat = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Active TODOs limit")
      .setDesc("Maximum number of TODOs to show in sidebar (0 for unlimited)")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.activeTodosLimit))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.activeTodosLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Projects section
    containerEl.createEl("h3", { text: "Projects" });

    new Setting(containerEl)
      .setName("Open Projects tab")
      .setDesc("Jump to the Projects tab directly from settings.")
      .addButton((btn) =>
        btn.setButtonText("Open Projects tab").onClick(() => {
          this.plugin.openProjectsTab();
        })
      );

    {
      let projectsFolderVaultText: TextComponent;
      new Setting(containerEl)
        .setName("Default projects folder")
        .setDesc("Folder scanned for project files. TODOs here get automatic project tags if no explicit tag is set (e.g., projects/)")
        .addText((text) => {
          projectsFolderVaultText = text;
          text
            .setPlaceholder("projects/")
            .setValue(this.plugin.settings.defaultProjectsFolder)
            .onChange(async (value) => {
              this.plugin.settings.defaultProjectsFolder = value;
              await this.plugin.saveSettings();
            });
        })
        .addExtraButton((btn) =>
          btn
            .setIcon("folder-open")
            .setTooltip("Choose a folder")
            .onClick(async () => {
              const chosen = chooseVaultPath(this.app.vault, "folder", "Choose projects folder", this.plugin.settings.defaultProjectsFolder);
              if (!chosen) return;
              projectsFolderVaultText.setValue(chosen);
              this.plugin.settings.defaultProjectsFolder = chosen;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Exclude folders from auto-tagging")
      .setDesc("Comma-separated folders to exclude from inferred project tags (e.g., log, archive)")
      .addText((text) =>
        text
          .setPlaceholder("log")
          .setValue(this.plugin.settings.excludeFoldersFromProjects.join(", "))
          .onChange(async (value) => {
            const folders = value
              .split(",")
              .map(f => f.trim())
              .filter(f => f.length > 0);

            this.plugin.settings.excludeFoldersFromProjects = folders;

            this.plugin.projectManager = new ProjectManager(
              this.app,
              this.plugin.scanner,
              this.plugin.settings.defaultProjectsFolder,
              this.plugin.settings.priorityTags,
              folders
            );

            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Priority tags")
      .setDesc("Comma-separated tags excluded from automatic project-tag inference (e.g., #focus, #today, #p0). This only controls what's excluded here — it doesn't change what any of these tags actually do elsewhere in the plugin.")
      .addText((text) =>
        text
          .setPlaceholder("#p0, #p1, #p2, #p3, #p4")
          .setValue(this.plugin.settings.priorityTags.join(", "))
          .onChange(async (value) => {
            const tags = value
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0);

            this.plugin.settings.priorityTags = tags;

            this.plugin.projectManager = new ProjectManager(
              this.app,
              this.plugin.scanner,
              this.plugin.settings.defaultProjectsFolder,
              tags,
              this.plugin.settings.excludeFoldersFromProjects
            );

            await this.plugin.saveSettings();
          })
      );

    {
      // Typing into this field used to restart the file watcher (stop +
      // recreate a recursive fs.watch) on every keystroke — pointless work
      // for every character typed, and it never actually resynced the
      // project list, just started watching for *future* changes. A
      // half-typed path also isn't a real folder yet, so there was nothing
      // useful to do with it until the user was done. Now onChange only
      // persists the raw text; the actual apply (restart watching, full
      // resync so "Projects" tab/sidebar reflect the new folder without a
      // manual "Sync") happens once, on blur — or on the settings tab's own
      // hide() as a fallback, in case the modal closes without a blur event.
      // lastApplied dedupes so blur-then-hide (or refocusing without
      // editing) doesn't trigger a second, redundant resync.
      let lastApplied = this.plugin.settings.projectsBaseFolder;
      const applyBaseFolderChange = async () => {
        const value = this.plugin.settings.projectsBaseFolder;
        if (value === lastApplied) return;
        lastApplied = value;
        if (value) {
          this.plugin.projectSyncManager.startWatching(this.plugin.projectsSyncOptions());
          try {
            await this.plugin.projectSyncManager.syncAll(this.plugin.projectsSyncOptions());
          } catch (error) {
            console.error("[Warped Todo]", "Project sync failed:", error);
            showNotice("Couldn't sync Projects. See console for details.");
          }
        } else {
          this.plugin.projectSyncManager.stopWatching();
        }
      };
      this.pendingProjectsBaseFolderApply = applyBaseFolderChange;

      let projectsFolderText: TextComponent;
      new Setting(containerEl)
        .setName("Projects base folder")
        .setDesc("Folder of git repos scanned for project notes (e.g., /Users/you/projects). Leave blank to disable repo syncing.")
        .addText((text) => {
          projectsFolderText = text;
          text
            .setPlaceholder("/Users/you/projects")
            .setValue(this.plugin.settings.projectsBaseFolder)
            .onChange(async (value) => {
              this.plugin.settings.projectsBaseFolder = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.addEventListener("blur", () => void applyBaseFolderChange());
        })
        .addExtraButton((btn) =>
          btn
            .setIcon("folder-open")
            .setTooltip("Choose a folder")
            .onClick(async () => {
              const chosen = chooseFolder(
                this.plugin.settings.projectsBaseFolder || guessProjectsFolder()
              );
              if (!chosen) return;
              projectsFolderText.setValue(chosen);
              this.plugin.settings.projectsBaseFolder = chosen;
              await this.plugin.saveSettings();
              await applyBaseFolderChange();
            })
        );
    }

    new Setting(containerEl)
      .setName("Exclude repo directories from scan")
      .setDesc("Comma-separated directory names to skip while scanning for repos (e.g., node_modules, dist, build, archive)")
      .addText((text) =>
        text
          .setPlaceholder("node_modules, dist, build, archive")
          .setValue(this.plugin.settings.projectsExcludeDirs.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.projectsExcludeDirs = value
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Projects scan depth")
      .setDesc("How many folder levels deep to look for repos under the base folder (0 = base folder only)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 6, 1)
          .setValue(this.plugin.settings.projectsScanDepth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.projectsScanDepth = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-open Projects tab")
      .setDesc("Opening a linked project note jumps the sidebar to its Projects summary, even from the TODOs/Ideas tab. Back returns to whatever tab you were on.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOpenProjectsOnLinkedNote)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenProjectsOnLinkedNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Terminal app")
      .setDesc("App name used by the Projects detail view's \"Open in Terminal\" action (macOS only).")
      .addText((text) =>
        text
          .setPlaceholder("Terminal")
          .setValue(this.plugin.settings.projectsTerminalApp)
          .onChange(async (value) => {
            this.plugin.settings.projectsTerminalApp = value.trim() || "Terminal";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Editor app")
      .setDesc("App name used by the Projects detail view's \"Open in Editor\" action (macOS only).")
      .addText((text) =>
        text
          .setPlaceholder("Visual Studio Code")
          .setValue(this.plugin.settings.projectsEditorApp)
          .onChange(async (value) => {
            this.plugin.settings.projectsEditorApp = value.trim() || "Visual Studio Code";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default projects sort")
      .setDesc("Sort the Projects list opens with each session. Changing the sort from the list's own sort button doesn't update this — it's session-only, same as the filter box.")
      .addDropdown((dropdown) => {
        for (const option of PROJECT_SORT_OPTIONS) {
          dropdown.addOption(option.key, option.label);
        }
        dropdown.setValue(this.plugin.settings.defaultProjectsSortKey);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProjectsSortKey = value as WarpedTodoSettings["defaultProjectsSortKey"];
          await this.plugin.saveSettings();
        });
      });

    // Posts section — deliberately separate from Projects above: Posts
    // assumes the Hugo site (if there is one) is the vault itself, and
    // never reads projectsBaseFolder or anything else from the Projects
    // extension. See HugoScanner.ts's module comment for why the two must
    // stay independent (an earlier version borrowed Projects' broad,
    // multi-repo scan for this, and a repo elsewhere under that scan could
    // silently shadow the real site).
    containerEl.createEl("h3", { text: "Posts" });

    new Setting(containerEl)
      .setName("Editor app")
      .setDesc("App name used by the Posts tab's \"Open in Editor\" action (macOS only). Independent of the Projects section's \"Editor app\" above — Posts doesn't read that setting.")
      .addText((text) =>
        text
          .setPlaceholder("Visual Studio Code")
          .setValue(this.plugin.settings.postsEditorApp)
          .onChange(async (value) => {
            this.plugin.settings.postsEditorApp = value.trim() || "Visual Studio Code";
            await this.plugin.saveSettings();
          })
      );

    // Focus Mode section
    containerEl.createEl("h3", { text: "Focus Mode" });

    new Setting(containerEl)
      .setName("Focus queue limit")
      .setDesc("How many items to show at once in Focus Mode (1–5). 1 means strict single-task focus.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.focusQueueLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.focusQueueLimit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Persist focus mode across sessions")
      .setDesc("When on, Focus Mode stays active after closing and reopening Obsidian.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.focusModePersist)
          .onChange(async (value) => {
            this.plugin.settings.focusModePersist = value;
            await this.plugin.saveSettings();
          })
      );

    // Team section
    containerEl.createEl("h3", { text: "Team" });

    new Setting(containerEl)
      .setName("Team file path")
      .setDesc("Path to the team definition file in your vault")
      .addText((text) =>
        text
          .setPlaceholder("team.md")
          .setValue(this.plugin.settings.teamFilePath)
          .onChange(async (value) => {
            this.plugin.settings.teamFilePath = value;
            this.plugin.teamManager.setFilePath(value);
            await this.plugin.saveSettings();
            this.display();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("file")
          .setTooltip("Choose a file")
          .onClick(async () => {
            const chosen = chooseVaultPath(this.app.vault, "file", "Choose team file", this.plugin.settings.teamFilePath);
            if (!chosen) return;
            this.plugin.settings.teamFilePath = chosen;
            this.plugin.teamManager.setFilePath(chosen);
            await this.plugin.saveSettings();
            this.display(); // rebuilds this field with the new value, same as the text input's own onChange
          })
      );

    const teamFile = this.app.vault.getAbstractFileByPath(this.plugin.settings.teamFilePath);
    const teamButtonSetting = new Setting(containerEl);

    if (teamFile instanceof TFile) {
      teamButtonSetting
        .setName("Manage team file")
        .addButton((btn) =>
          btn.setButtonText("Open team file").onClick(async () => {
            await this.app.workspace.getLeaf(false).openFile(teamFile);
          })
        );
    } else {
      teamButtonSetting
        .setName("No team file found")
        .setDesc("Create a starter team file with your username")
        .addButton((btn) =>
          btn.setButtonText("Create team file").setCta().onClick(async () => {
            const file = await this.plugin.teamManager.createTeamFile();
            await this.app.workspace.getLeaf(false).openFile(file);
            this.display();
          })
        );
    }

    const team = this.plugin.teamManager.getTeam();
    if (team.length > 0) {
      const teamList = containerEl.createEl("div", { cls: "warped-todo-team-list" });
      for (const member of team) {
        const entry = teamList.createEl("div", { cls: "warped-todo-team-entry" });
        entry.createEl("span", { cls: "warped-todo-team-handle", text: `@${member.handle}` });
        entry.createEl("span", { cls: "warped-todo-team-name", text: member.name });
        if (member.isMe) {
          entry.createEl("span", { cls: "warped-todo-team-me-badge", text: "(me)" });
        }
      }

      new Setting(containerEl)
        .setName("Default assignee")
        .setDesc("Unattributed tasks are treated as belonging to this person when filtering")
        .addDropdown((dropdown) => {
          dropdown.addOption("", "None");
          dropdown.addOption("me", "@me");
          for (const member of team) {
            if (!member.isMe) {
              dropdown.addOption(member.handle, `@${member.handle}`);
            }
          }
          dropdown.setValue(this.plugin.settings.defaultAssignee);
          dropdown.onChange(async (value) => {
            this.plugin.settings.defaultAssignee = value;
            await this.plugin.saveSettings();
          });
        });
    }

    // Help section (last)
    containerEl.createEl("h3", { text: "Help" });

    new Setting(containerEl)
      .setName("Onboarding")
      .setDesc("Reopen the first-use help note, with live #todo/#idea examples you can try.")
      .addButton((btn) =>
        btn.setButtonText("Show onboarding doc again").onClick(async () => {
          await this.plugin.helpNoteManager.open();
        })
      );

    this.widenTextInputs(containerEl);
  }

  /**
   * Widens every text-input field in this settings tab to 125% of its own
   * rendered width, clamped to whatever room is actually left in its row
   * (label + description on the left leave less space than a bare short
   * label does) so it never overflows or forces the row to wrap. File/
   * folder-path fields in particular read cramped at Obsidian's default
   * input width. Measures the real rendered width rather than hardcoding
   * a pixel value, since Obsidian's own default isn't a value this plugin
   * controls or should assume stays constant across versions/themes.
   * Toggles, sliders, and dropdowns are untouched — this only targets
   * `<input type="text">`.
   */
  private widenTextInputs(containerEl: HTMLElement): void {
    const inputs = containerEl.querySelectorAll<HTMLInputElement>(".setting-item-control input[type='text']");
    inputs.forEach((input) => {
      const natural = input.getBoundingClientRect().width;
      if (natural <= 0) return; // not laid out (e.g. hidden) — nothing to measure
      const row = input.closest(".setting-item") as HTMLElement | null;
      const info = row?.querySelector(".setting-item-info") as HTMLElement | null;
      const rowWidth = row?.getBoundingClientRect().width ?? natural;
      const infoWidth = info?.getBoundingClientRect().width ?? 0;
      const available = Math.max(natural, rowWidth - infoWidth - 24); // 24px ~= the row's own label/control gap
      const target = Math.min(natural * 1.25, available);
      if (target > natural) input.style.width = `${target}px`;
    });
  }
}
