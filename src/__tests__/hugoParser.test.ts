import { describe, it, expect } from "vitest";
import { parseHugoConfig, parsePostFrontmatter, slugify, renderArchetype, DEFAULT_ARCHETYPE } from "../HugoParser";

describe("parseHugoConfig", () => {
  it("defaults to 'content' when contentDir isn't set", () => {
    expect(parseHugoConfig("baseURL = \"https://example.com\"\n").contentDir).toBe("content");
    expect(parseHugoConfig("baseURL: https://example.com\n").contentDir).toBe("content");
  });

  it("extracts contentDir from TOML", () => {
    const toml = [
      "baseURL = \"https://example.com\"",
      "contentDir = \"site-content\"",
      "title = \"My Site\"",
    ].join("\n");
    expect(parseHugoConfig(toml).contentDir).toBe("site-content");
  });

  it("extracts contentDir from YAML, quoted or bare", () => {
    expect(parseHugoConfig("contentDir: site-content\n").contentDir).toBe("site-content");
    expect(parseHugoConfig("contentDir: \"site-content\"\n").contentDir).toBe("site-content");
  });
});

describe("parsePostFrontmatter", () => {
  it("returns draft: false and a body-excerpt summary when there's no frontmatter block", () => {
    expect(parsePostFrontmatter("Just a paragraph, no frontmatter.")).toEqual({
      draft: false,
      summary: "Just a paragraph, no frontmatter.",
    });
  });

  it("parses YAML frontmatter", () => {
    const content = [
      "---",
      "title: \"Why I stopped using a task manager\"",
      "date: 2026-09-20",
      "draft: true",
      "---",
      "",
      "Body text.",
    ].join("\n");
    expect(parsePostFrontmatter(content)).toEqual({
      title: "Why I stopped using a task manager",
      draft: true,
      date: "2026-09-20",
      summary: "Body text.",
    });
  });

  it("parses TOML frontmatter", () => {
    const content = [
      "+++",
      "title = \"Slow mornings\"",
      "draft = false",
      "+++",
      "",
      "Body text.",
    ].join("\n");
    const parsed = parsePostFrontmatter(content);
    expect(parsed.title).toBe("Slow mornings");
    expect(parsed.draft).toBe(false);
  });

  it("defaults draft to false when the key is absent (Hugo's own default)", () => {
    const content = ["---", "title: \"Published already\"", "---"].join("\n");
    expect(parsePostFrontmatter(content).draft).toBe(false);
  });

  it("falls back to lastmod when date is absent", () => {
    const content = ["---", "lastmod: 2026-01-01", "---"].join("\n");
    expect(parsePostFrontmatter(content).date).toBe("2026-01-01");
  });

  it("prefers a frontmatter description over the body excerpt", () => {
    const content = [
      "---",
      "title: \"Slow mornings\"",
      "description: \"An SEO-friendly one-liner.\"",
      "---",
      "",
      "The actual opening paragraph of the post.",
    ].join("\n");
    expect(parsePostFrontmatter(content).summary).toBe("An SEO-friendly one-liner.");
  });

  it("falls back to summary when description is absent", () => {
    const content = ["---", "summary: \"A frontmatter summary field.\"", "---"].join("\n");
    expect(parsePostFrontmatter(content).summary).toBe("A frontmatter summary field.");
  });

  it("falls back to the body's opening paragraph when neither frontmatter field is set", () => {
    const content = [
      "---",
      "title: \"Slow mornings\"",
      "---",
      "",
      "First line of the opening paragraph.",
      "Second line, same paragraph.",
      "",
      "A later paragraph that should not be included.",
    ].join("\n");
    expect(parsePostFrontmatter(content).summary).toBe(
      "First line of the opening paragraph. Second line, same paragraph."
    );
  });

  it("stops the body excerpt at a heading, and is undefined for an empty body", () => {
    const withHeading = ["---", "title: \"X\"", "---", "", "## A heading right away", "", "Prose."].join("\n");
    expect(parsePostFrontmatter(withHeading).summary).toBeUndefined();

    const emptyBody = ["---", "title: \"X\"", "---", ""].join("\n");
    expect(parsePostFrontmatter(emptyBody).summary).toBeUndefined();
  });

  it("truncates a long body excerpt to a sidebar-sized budget", () => {
    const content = ["---", "title: \"X\"", "---", "", "word ".repeat(80).trim()].join("\n");
    const summary = parsePostFrontmatter(content).summary!;
    expect(summary.length).toBeLessThanOrEqual(221); // 220 + the trailing "…"
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(slugify("Why I Stopped Using a Task Manager")).toBe("why-i-stopped-using-a-task-manager");
    expect(slugify("Slow mornings, fast code!")).toBe("slow-mornings-fast-code");
  });

  it("falls back to 'untitled' for a title with no alphanumeric characters", () => {
    expect(slugify("   ---   ")).toBe("untitled");
  });
});

describe("renderArchetype", () => {
  const vars = { name: "my-new-post", date: "2026-09-29T00:00:00Z", title: "My New Post" };

  it("substitutes the default archetype's tokens", () => {
    const rendered = renderArchetype(DEFAULT_ARCHETYPE, vars);
    expect(rendered).toContain('title: "My New Post"');
    expect(rendered).toContain("date: 2026-09-29T00:00:00Z");
    expect(rendered).toContain("draft: true");
    expect(rendered).not.toContain("{{");
  });

  it("substitutes bare .Name and .TranslationBaseName", () => {
    const rendered = renderArchetype("slug: {{ .Name }} / {{ .TranslationBaseName }}", vars);
    expect(rendered).toBe("slug: my-new-post / my-new-post");
  });

  it("leaves unrecognized tokens untouched", () => {
    const rendered = renderArchetype("{{ .Params.author }}", vars);
    expect(rendered).toBe("{{ .Params.author }}");
  });
});
