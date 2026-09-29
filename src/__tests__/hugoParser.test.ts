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
  it("returns draft: false with no other fields when there's no frontmatter block", () => {
    expect(parsePostFrontmatter("Just a paragraph, no frontmatter.")).toEqual({ draft: false });
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
