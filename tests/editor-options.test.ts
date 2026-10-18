// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { normalizeArticleStyle } from "../src/article-style";
import { highlightCodeLines, getCodeTheme } from "../src/code-highlight";
import { buildWechatHtml, listWechatThemes, resolveWechatTheme } from "../src/export-html";
import { articleStats } from "../src/export-file";
import type { WechatArticleStyle } from "../src/types";

const article = '<h2>标题</h2><p>正文 <a href="https://example.com/a">链接</a></p><p><img src="data:,x" data-qm-image="i0" title="图说"></p><pre><code class="language-ts">const a = 1\n// done</code></pre>';
const build = (style: WechatArticleStyle, theme = "qiaomu-podcast") => buildWechatHtml(article, resolveWechatTheme(theme), undefined, style);
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("editor options", () => {
  it("keeps only valid option values", () => {
    expect(normalizeArticleStyle({ primaryColor: "red", fontFamily: "comic", codeTheme: "nope", justify: "yes", customCss: "   " })).toEqual({});
    expect(normalizeArticleStyle({ primaryColor: "#07C160", fontFamily: "serif", codeTheme: "nord", justify: true, macCode: false, customCss: ".wechat-export-content h2{color:red}" }))
      .toEqual({ primaryColor: "#07c160", fontFamily: "serif", codeTheme: "nord", justify: true, macCode: false, customCss: ".wechat-export-content h2{color:red}" });
  });

  it.each(listWechatThemes())("replaces the accent of $id with the primary colour and nothing else", (theme) => {
    const plain = build({}, theme.id);
    const tinted = build({ primaryColor: "#12ab34" }, theme.id);
    expect(tinted.toLowerCase()).toContain("#12ab34");
    expect(plain.toLowerCase()).not.toContain("#12ab34");
  });

  it("turns link footnotes and image captions off", () => {
    expect(build({}).includes("参考链接")).toBe(false);
    expect(build({ linkFootnotes: true }).includes("参考链接")).toBe(true);
    expect(parse(build({})).querySelector("figcaption, .wechat-figure-caption")).not.toBeNull();
    expect(parse(build({ imageCaptions: false })).querySelector("figcaption, .wechat-figure-caption")).toBeNull();
  });

  it("controls window buttons, line numbers and syntax colours", () => {
    const defaults = parse(build({}));
    expect(defaults.querySelector(".mac-sign")).not.toBeNull();
    expect(defaults.querySelector(".wechat-code-line-number")).not.toBeNull();
    const plain = parse(build({ macCode: false, codeLineNumbers: false }));
    expect(plain.querySelector(".mac-sign")).toBeNull();
    expect(plain.querySelector(".wechat-code-line-number")).toBeNull();
    const colored = parse(build({ codeTheme: "one-dark" }));
    const palette = getCodeTheme("one-dark")!;
    expect(Array.from(colored.querySelectorAll<HTMLElement>(".wechat-code-line span")).some((span) => span.style.color && span.style.color !== "")).toBe(true);
    expect(colored.querySelector("pre")!.getAttribute("style")).toContain(palette.bg.slice(1));
    expect(colored.querySelector(".wechat-code-line")!.textContent).toBe("const a = 1");
  });

  it("splits multi-line tokens without losing text", () => {
    const lines = highlightCodeLines("/* a\nb */\nlet x = 'y'", "js", getCodeTheme("nord")!)!;
    expect(lines.map((line) => line.map((piece) => piece.text).join(""))).toEqual(["/* a", "b */", "let x = 'y'"]);
    expect(lines[1]![0]!.color).toBe(getCodeTheme("nord")!.roles.comment);
    expect(highlightCodeLines("x", "klingon", getCodeTheme("nord")!)).toBeNull();
  });

  it("applies font, alignment, indent and custom CSS", () => {
    const html = build({ fontFamily: "serif", justify: true, indent: true, customCss: ".wechat-export-content h2 { letter-spacing: 3px; }" });
    expect(html).toContain("Songti SC");
    expect(html).toContain("text-align: justify");
    expect(html).toContain("text-indent: 2em");
    expect(html).toContain("letter-spacing: 3px");
  });

  it("counts Chinese characters and Latin words", () => {
    expect(articleStats("<p>你好，世界 hello world</p>")).toEqual({ words: 6, minutes: 1 });
  });
});
