// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
const rendered = vi.hoisted(() => ({ note: {} as Record<string, unknown> }));
vi.mock("obsidian", () => ({ requestUrl: vi.fn(), TFile: class {}, getLinkpath: (s: string) => s, htmlToMarkdown: (s: string) => s }));
vi.mock("../src/render-note", () => ({ renderNoteForWechat: vi.fn(async () => rendered.note) }));
vi.mock("../src/external/xhs-cards", () => ({ layoutXhsCards: vi.fn(), renderCardBlobs: vi.fn() }));
vi.mock("../src/rasterize", () => ({ svgToPng: vi.fn(async () => ({ blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }) })) }));
import { prepareBase, buildJob } from "../src/external/prepare";
import { loadArticleImage, normalizeImage } from "../src/external/assets";

beforeEach(() => {
  rendered.note = { title: "test", html: "<p>text</p>", frontmatter: {}, images: [], warnings: [], dispose: vi.fn() };
});

describe("complete images across browser platforms", () => {
  it.each(["x", "zhihu", "xhs"] as const)("blocks %s before reading/uploading if an embed is missing", async target => {
    rendered.note.imageErrors = ["找不到图片：缺失.png"];
    const readBinary = vi.fn();
    await expect(prepareBase({ vault: { readBinary } } as never, {} as never, {} as never, target)).rejects.toThrow("缺失.png");
    expect(readBinary).not.toHaveBeenCalled();
    expect(rendered.note.dispose).toHaveBeenCalledOnce();
  });

  it("does not silently remove an untracked remote image", async () => {
    rendered.note.html = '<p>text</p><img alt="untracked" src="https://example.com/a.png">';
    await expect(prepareBase({} as never, {} as never, {} as never, "zhihu")).rejects.toThrow("untracked");
  });

  it.each(["x", "zhihu"] as const)("sends a repeated attachment only once to %s", async target => {
    const file = { name: "same.png", path: "a/same.png", stat: { mtime: 1 } };
    rendered.note.images = ["one", "two"].map(id => ({ id, kind: "vault", name: file.name, file }));
    rendered.note.html = '<img src="app://same" data-qm-image="one"><img src="app://same" data-qm-image="two">';
    const readBinary = vi.fn(async () => new Uint8Array([137, 80, 78, 71]).buffer);
    const base = await prepareBase({ vault: { readBinary } } as never, {} as never, {} as never, target);
    expect(base.assets.size).toBe(1);
    expect(readBinary).toHaveBeenCalledOnce();
    expect(base.previewHtml.match(/qp-asset:\/\/one/g)).toHaveLength(2);
    if (target === "x") {
      base.note.html = '<img src="app://same" data-qm-image="one">'.repeat(26);
      expect(buildJob(base, "Title").checks.some(check => check.level === "error")).toBe(true);
    }
    base.dispose();
  });

  it("uses the shared static SVG conversion for local platform assets", async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>';
    const asset = await loadArticleImage({ vault: { readBinary: async () => new TextEncoder().encode(source).buffer } } as never, { kind: "vault", id: "svg", name: "本地.svg", file: { name: "本地.svg" } } as never);
    expect(asset.mime).toBe("image/png");
    expect(asset.name).toBe("本地.png");
    expect([...new Uint8Array(asset.data)]).toEqual([137, 80, 78, 71]);
  });
});

describe("animation preservation", () => {
  const limits = { maxBytes: 100, maxEdge: 2000 };
  it("passes a GIF through without re-encoding", async () => {
    const bytes = new TextEncoder().encode("GIF89a-test-bytes").buffer;
    const result = await normalizeImage(bytes, "动画.gif", "image/gif", limits);
    expect(result.data).toBe(bytes);
    expect(result.mime).toBe("image/gif");
  });
  it("rejects an oversized GIF instead of flattening it into JPEG", async () => {
    await expect(normalizeImage(new ArrayBuffer(101), "动画.gif", "image/gif", limits)).rejects.toThrow("为保留动画");
  });
  it.each([
    '<rect><animate attributeName="x" values="0;20" dur="1s"/></rect>',
    '<rect style="animation: move 1s infinite"/>',
    '<style>@keyframes move {to{opacity:0}}</style>',
  ])("rejects animated SVG without losing motion: %s", async content => {
    const bytes = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`).buffer;
    await expect(normalizeImage(bytes, "animated.svg", "image/svg+xml", limits)).rejects.toThrow("动画 SVG");
  });
});
