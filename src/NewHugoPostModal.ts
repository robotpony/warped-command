import { App, Modal, Setting } from "obsidian";

/**
 * Single-field prompt plus a section dropdown for "New post" on the Posts
 * tab — mirrors `SendToProjectModal.ts` (title input, Enter-to-submit, CTA
 * button). Sections come from the current scan's already-discovered content
 * folders rather than letting the user type an arbitrary one, so a typo
 * can't create a stray new section.
 */
export class NewHugoPostModal extends Modal {
  private title: string = "";
  private section: string;
  private readonly sections: string[];
  private onSubmit: (title: string, section: string) => void;

  constructor(app: App, sections: string[], defaultSection: string, onSubmit: (title: string, section: string) => void) {
    super(app);
    this.sections = sections;
    this.section = defaultSection;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("warped-todo-new-hugo-post-modal");
    contentEl.createEl("h2", { text: "New post" });

    new Setting(contentEl)
      .setName("Title")
      .addText((text) => {
        text.setValue(this.title).onChange((value) => {
          this.title = value;
        });
        text.inputEl.focus();
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            this.submit();
          }
        });
      });

    if (this.sections.length > 0) {
      new Setting(contentEl)
        .setName("Section")
        .setDesc("Which content folder this post is created under.")
        .addDropdown((dropdown) => {
          for (const section of this.sections) dropdown.addOption(section, section);
          dropdown.setValue(this.section);
          dropdown.onChange((value) => {
            this.section = value;
          });
        });
    }

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create")
        .setCta()
        .onClick(() => this.submit())
    );
  }

  private submit(): void {
    const trimmed = this.title.trim();
    if (!trimmed) return;
    this.close();
    this.onSubmit(trimmed, this.section);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
