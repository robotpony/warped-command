import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readHugoSite, scanPosts, createPost } from "../HugoScanner";

describe("readHugoSite / scanPosts / createPost", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "warped-todo-hugo-"));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("readHugoSite returns null when no config file exists", async () => {
    expect(await readHugoSite(repo)).toBeNull();
  });

  it("readHugoSite resolves contentDir from hugo.toml, defaulting to 'content'", async () => {
    await writeFile(join(repo, "hugo.toml"), "baseURL = \"https://example.com\"\n");
    const site = await readHugoSite(repo);
    expect(site?.contentDir).toBe(join(repo, "content"));
  });

  it("readHugoSite honours a custom contentDir", async () => {
    await writeFile(join(repo, "hugo.toml"), "contentDir = \"site-content\"\n");
    const site = await readHugoSite(repo);
    expect(site?.contentDir).toBe(join(repo, "site-content"));
  });

  it("readHugoSite falls back to config/_default/ when there's no root-level config", async () => {
    await mkdir(join(repo, "config", "_default"), { recursive: true });
    await writeFile(join(repo, "config", "_default", "hugo.toml"), "contentDir = \"site-content\"\n");
    const site = await readHugoSite(repo);
    expect(site?.contentDir).toBe(join(repo, "site-content"));
  });

  it("readHugoSite prefers a root-level config over config/_default/ when both exist", async () => {
    await writeFile(join(repo, "hugo.toml"), "contentDir = \"root-content\"\n");
    await mkdir(join(repo, "config", "_default"), { recursive: true });
    await writeFile(join(repo, "config", "_default", "hugo.toml"), "contentDir = \"nested-content\"\n");
    const site = await readHugoSite(repo);
    expect(site?.contentDir).toBe(join(repo, "root-content"));
  });

  it("scanPosts groups by top-level section, excludes _index.md, includes leaf bundles", async () => {
    await writeFile(join(repo, "hugo.toml"), "");
    const content = join(repo, "content");
    await mkdir(join(content, "posts"), { recursive: true });
    await mkdir(join(content, "posts", "bundled-post"), { recursive: true });

    await writeFile(
      join(content, "posts", "draft-post.md"),
      "---\ntitle: \"Draft Post\"\ndraft: true\ndescription: \"A one-line summary.\"\n---\n"
    );
    await writeFile(
      join(content, "posts", "_index.md"),
      "---\ntitle: \"Posts\"\n---\n"
    );
    await writeFile(
      join(content, "posts", "bundled-post", "index.md"),
      "---\ntitle: \"Bundled Post\"\n---\n"
    );
    await writeFile(join(content, "about.md"), "---\ntitle: \"About\"\n---\n");

    const site = await readHugoSite(repo);
    const posts = await scanPosts(site!);

    expect(posts.map((p) => p.title).sort()).toEqual(["About", "Bundled Post", "Draft Post"]);
    const draft = posts.find((p) => p.title === "Draft Post")!;
    expect(draft.section).toBe("posts");
    expect(draft.draft).toBe(true);
    expect(draft.summary).toBe("A one-line summary.");
    const bundled = posts.find((p) => p.title === "Bundled Post")!;
    expect(bundled.section).toBe("posts");
    const about = posts.find((p) => p.title === "About")!;
    expect(about.section).toBe("(root)");
  });

  it("createPost writes a slugified file using the repo's own archetype", async () => {
    await writeFile(join(repo, "hugo.toml"), "");
    await mkdir(join(repo, "archetypes"), { recursive: true });
    await writeFile(
      join(repo, "archetypes", "default.md"),
      "---\ntitle: \"{{ replace .Name \"-\" \" \" | title }}\"\ndate: {{ .Date }}\ndraft: true\n---\n"
    );

    const site = await readHugoSite(repo);
    const post = await createPost(site!, "posts", "My Brand New Post");

    expect(post.path).toBe(join(repo, "content", "posts", "my-brand-new-post.md"));
    expect(post.title).toBe("My Brand New Post");
    expect(post.draft).toBe(true);
    expect(post.section).toBe("posts");
  });

  it("createPost falls back to the built-in archetype when the repo has none", async () => {
    await writeFile(join(repo, "hugo.toml"), "");
    const site = await readHugoSite(repo);
    const post = await createPost(site!, "posts", "No Archetype Here");
    expect(post.title).toBe("No Archetype Here");
    expect(post.draft).toBe(true);
  });
});
