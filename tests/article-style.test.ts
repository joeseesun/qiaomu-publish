// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../src/defaults";
import { normalizeArticleStyle, resolveArticleAppearance } from "../src/article-style";
import { buildWechatHtml, resolveWechatTheme } from "../src/export-html";

describe("article appearance persistence", () => {
  it("keeps old publishing settings and theme unchanged when appearance is absent", () => {
    const settings = normalizeSettings({ wechat: { themeId: "vercel-mono", secretId: "original-key", author: "作者" } });
    expect(settings.wechat).toMatchObject({ themeId: "vercel-mono", secretId: "original-key", author: "作者", articleStyle: {}, noteStyles: {} });
  });

  it("uses note appearance, frontmatter theme, then defaults without leaking choices across notes", () => {
    const settings = normalizeSettings({ wechat: {
      themeId: "qiaomu-podcast", articleStyle: { fontSize: 18 },
      noteStyles: { "第一篇.md": { themeId: "vercel-mono", style: { fontSize: 20, pagePadding: 24 } } },
    } }).wechat;
    expect(resolveArticleAppearance(settings, "第一篇.md", { wechat_theme: "apple-gallery" })).toEqual({ themeId: "vercel-mono", style: { fontSize: 20, pagePadding: 24 } });
    expect(resolveArticleAppearance(settings, "第二篇.md", { 公众号主题: "apple-gallery" })).toEqual({ themeId: "apple-gallery", style: { fontSize: 18 } });
    expect(resolveArticleAppearance(settings, "第三篇.md", { wechat_theme: "unknown" })).toEqual({ themeId: "qiaomu-podcast", style: { fontSize: 18 } });
    const choice = resolveArticleAppearance(settings, "第一篇.md");
    choice.style.fontSize = 12;
    expect(settings.noteStyles["第一篇.md"]?.style.fontSize).toBe(20);
    const reloaded = normalizeSettings(JSON.parse(JSON.stringify({ wechat: settings }))).wechat;
    expect(resolveArticleAppearance(reloaded, "第一篇.md")).toEqual({ themeId: "vercel-mono", style: { fontSize: 20, pagePadding: 24 } });
  });

  it("ignores malformed appearance and rejects nonnumeric CSS payloads", () => {
    expect(normalizeArticleStyle({ fontSize: "20; color:red", lineHeight: Infinity, paragraphSpacing: -4, pagePadding: 999 })).toEqual({ paragraphSpacing: 0, pagePadding: 32 });
    const settings = normalizeSettings({ wechat: { noteStyles: { "bad.md": { themeId: "missing" }, "folder": { themeId: "vercel-mono" }, "good.md": { themeId: "vercel-mono", style: { fontSize: 100 } } } } });
    expect(Object.keys(settings.wechat.noteStyles)).toEqual(["good.md"]);
    expect(settings.wechat.noteStyles["good.md"]?.style.fontSize).toBe(24);
  });
});

describe("shared preview/copy/draft HTML", () => {
  const input = '<h2>标题</h2><p>正文 <strong>重点</strong> <code>inline</code></p><p>第二段</p><ul><li>列表</li></ul><pre><code>code</code></pre><p><img src="data:,x" data-qm-image="img0"></p>';

  it("leaves the original theme output byte-identical when no overrides are set", () => {
    const theme = resolveWechatTheme("qiaomu-podcast");
    expect(buildWechatHtml(input, theme, undefined, {})).toBe(buildWechatHtml(input, theme));
  });

  it("keeps HTML-looking code as text when building code rows without innerHTML", () => {
    const html = buildWechatHtml('<pre><code>&lt;img src=x onerror=alert(1)&gt;\n\nsecond line</code></pre>', resolveWechatTheme("qiaomu-podcast"));
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("pre img")).toBeNull();
    expect(doc.querySelector(".wechat-code-line")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(doc.querySelectorAll(".wechat-code-row")).toHaveLength(3);
    expect(doc.querySelectorAll(".mac-sign svg ellipse")).toHaveLength(3);
  });

  it.each(["qiaomu-podcast", "vercel-mono", "qiaomu-clean-reading", "nvidia-compute"])("inlines overrides after %s while preserving heading, code and image semantics", (id) => {
    const theme = resolveWechatTheme(id);
    const original = new DOMParser().parseFromString(buildWechatHtml(input, theme), "text/html");
    const html = buildWechatHtml(input, theme, undefined, { fontSize: 20, lineHeight: 2, paragraphSpacing: 24, pagePadding: 22 });
    const doc = new DOMParser().parseFromString(html, "text/html");
    const paragraph = doc.querySelector("p")!;
    expect(paragraph.style.fontSize).toBe("20px");
    expect(paragraph.style.lineHeight).toBe("2");
    expect(paragraph.style.marginBottom).toBe("24px");
    expect(doc.querySelector<HTMLElement>(".wechat-list-item")?.style.fontSize).toBe("20px");
    expect(doc.querySelector<HTMLElement>(".wechat-list-item")?.style.lineHeight).toBe("2");
    expect(doc.querySelector<HTMLElement>(".wechat-export-article")?.style.paddingLeft).toBe("22px");
    expect(doc.querySelector("h2")?.getAttribute("style")).toBe(original.querySelector("h2")?.getAttribute("style"));
    expect(doc.querySelector("pre")?.getAttribute("style")).toBe(original.querySelector("pre")?.getAttribute("style"));
    expect(doc.querySelector("img")?.getAttribute("data-qm-image")).toBe("img0");
    expect(html).not.toContain("<style");
  });
});
