import { sanitizeHTMLToDom, setIcon } from "obsidian";
import { setName } from "./accessible-name";
import { CARD_WIDTH } from "./external/card-styles";
import { PREVIEW_IMAGE_SCHEME } from "./external/schemes";
import type { PublishTargetId } from "./bridge/protocol";

export interface ArticlePreview {
  title: string;
  author: string;
  /** Article HTML with pictures as `qp-asset://id`. */
  html: string;
  /** Object URLs for those pictures, by asset id. */
  urls: ReadonlyMap<string, string>;
  coverId?: string | null;
}

export interface XhsPreview {
  title: string;
  author: string;
  text: string;
  topics: readonly string[];
  /** The kept cards, as laid out (live DOM, 1080 x 1440 each). */
  cards: readonly HTMLElement[];
}

const ARTICLE_CSS = `
:host { display: block; }
.page { box-sizing: border-box; padding: 0 0 28px; background: #fff; color: var(--ink); font: 15px/1.7 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
.page.x { --ink: #0f1419; --muted: #536471; --line: #eff3f4; }
.page.zhihu { --ink: #121212; --muted: #8590a6; --line: #ebebeb; }
.cover { display: block; width: 100%; aspect-ratio: 2 / 1; object-fit: cover; background: var(--line); }
.head { padding: 18px 18px 0; }
h1.title { margin: 0 0 12px; font-size: 24px; line-height: 1.3; font-weight: 800; letter-spacing: 0; }
.zhihu h1.title { font-size: 22px; font-weight: 700; }
.by { display: flex; align-items: center; gap: 8px; margin: 0 0 18px; color: var(--muted); font-size: 13px; }
.avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--line); flex: none; }
.body { padding: 0 18px; overflow-wrap: anywhere; }
.body p { margin: 0 0 1em; }
.body h1, .body h2, .body h3, .body h4 { margin: 1.4em 0 .6em; line-height: 1.4; font-weight: 700; }
.body h1, .body h2 { font-size: 19px; } .body h3, .body h4 { font-size: 16px; }
.body img { display: block; max-width: 100%; height: auto; margin: 12px auto; border-radius: 8px; }
.body ul, .body ol { margin: 0 0 1em; padding-left: 1.4em; }
.body blockquote { margin: 0 0 1em; padding: 2px 0 2px 14px; border-left: 3px solid var(--line); color: var(--muted); }
.body pre { margin: 0 0 1em; padding: 12px; overflow-x: auto; border-radius: 8px; background: #f6f6f6; font: 12px/1.6 ui-monospace, Menlo, monospace; }
.body code { font-family: ui-monospace, Menlo, monospace; font-size: .9em; background: #f6f6f6; padding: 1px 4px; border-radius: 4px; }
.body pre code { background: none; padding: 0; }
.body table { width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: 13px; }
.body th, .body td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; }
.body a { color: inherit; text-decoration: underline; }
`;

/** The phone on the right of every publish window: how the note will read on the platform it is going to. */
export class ExternalPreview {
  readonly el: HTMLElement;
  private readonly scroll: HTMLElement;
  private shadow: ShadowRoot | null = null;
  private observer: ResizeObserver | null = null;
  private index = 0;
  private last: XhsPreview | null = null;

  constructor(parent: HTMLElement, private readonly target: PublishTargetId) {
    this.el = parent.createDiv({ cls: "qiaomu-wechat-phone" });
    const screen = this.el.createDiv({ cls: "qiaomu-wechat-phone-screen" });
    const bar = screen.createDiv({ cls: "qiaomu-wechat-phone-bar", attr: { "aria-hidden": "true" } });
    bar.createSpan({ cls: "qiaomu-wechat-phone-time", text: "9:41" });
    bar.createSpan({ cls: "qiaomu-wechat-phone-island" });
    const status = bar.createSpan({ cls: "qiaomu-wechat-phone-icons" });
    for (const icon of ["signal", "wifi", "battery-full"]) setIcon(status.createSpan(), icon);
    this.scroll = screen.createDiv({ cls: "qiaomu-wechat-phone-scroll", attr: { role: "region" } });
    setName(this.scroll, "预览");
    screen.createDiv({ cls: "qiaomu-wechat-phone-home", attr: { "aria-hidden": "true" } });
  }

  private reset(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.scroll.empty();
    this.shadow = null;
  }

  showMessage(text: string): void {
    this.reset();
    this.scroll.createDiv({ cls: "qiaomu-wechat-preview-loading", text });
  }

  /** X and Zhihu: title, byline and body as an article page. Keeps the scroll position while the person edits. */
  showArticle(preview: ArticlePreview): void {
    const top = this.scroll.scrollTop;
    if (!this.shadow) {
      this.reset();
      this.shadow = this.scroll.createDiv({ cls: "qiaomu-external-paper" }).attachShadow({ mode: "open" });
    }
    const urls = preview.urls;
    const html = preview.html.replace(new RegExp(`${PREVIEW_IMAGE_SCHEME}([\\w-]+)`, "g"), (match, id: string) => urls.get(id) ?? match);
    const page = createDiv({ cls: `page ${this.target}` });
    const cover = preview.coverId ? urls.get(preview.coverId) : undefined;
    if (cover) page.createEl("img", { cls: "cover", attr: { src: cover, alt: "" } });
    const head = page.createDiv({ cls: "head" });
    head.createEl("h1", { cls: "title", text: preview.title || "（还没有标题）" });
    const by = head.createDiv({ cls: "by" });
    by.createDiv({ cls: "avatar" });
    by.createSpan({ text: preview.author || "作者" });
    page.createDiv({ cls: "body" }).append(sanitizeHTMLToDom(html));
    const style = createEl("style", { text: ARTICLE_CSS });
    this.shadow.replaceChildren(style, page);
    this.scroll.scrollTop = top;
  }

  /** Xiaohongshu: the note page — card carousel, then title, copy and topics. */
  showXhs(preview: XhsPreview): void {
    this.last = preview;
    this.index = Math.min(this.index, Math.max(0, preview.cards.length - 1));
    const top = this.scroll.scrollTop;
    this.reset();
    const root = this.scroll.createDiv({ cls: "qiaomu-ext-xhs" });
    const header = root.createDiv({ cls: "qiaomu-ext-xhs-top" });
    setIcon(header.createSpan({ cls: "qiaomu-ext-xhs-back", attr: { "aria-hidden": "true" } }), "chevron-left");
    header.createDiv({ cls: "qiaomu-ext-xhs-avatar" });
    header.createSpan({ cls: "qiaomu-ext-xhs-author", text: preview.author || "作者" });
    header.createSpan({ cls: "qiaomu-ext-xhs-follow", text: "关注" });

    const stage = root.createDiv({ cls: "qiaomu-ext-xhs-stage" });
    const count = preview.cards.length;
    if (count) {
      const holder = stage.createDiv({ cls: "qiaomu-ext-xhs-card" });
      holder.append(preview.cards[this.index]!.cloneNode(true));
      const fit = () => { if (stage.clientWidth) stage.setCssProps({ "--qp-scale": String(stage.clientWidth / CARD_WIDTH) }); };
      fit();
      this.observer = new ResizeObserver(fit);
      this.observer.observe(stage);
      if (count > 1) {
        for (const [side, icon, step] of [["prev", "chevron-left", -1], ["next", "chevron-right", 1]] as const) {
          const button = stage.createEl("button", { cls: `qiaomu-ext-xhs-nav is-${side}`, attr: { type: "button" } });
          setIcon(button.createSpan({ attr: { "aria-hidden": "true" } }), icon);
          button.createSpan({ cls: "qiaomu-wechat-sr-only", text: side === "prev" ? "上一张" : "下一张" });
          button.addEventListener("click", () => { this.index = (this.index + step + count) % count; if (this.last) this.showXhs(this.last); });
        }
        stage.createDiv({ cls: "qiaomu-ext-xhs-count", text: `${this.index + 1}/${count}` });
      }
    } else stage.createDiv({ cls: "qiaomu-ext-xhs-none", text: "没有可发的图片" });
    if (count > 1) {
      const dots = root.createDiv({ cls: "qiaomu-ext-xhs-dots", attr: { "aria-hidden": "true" } });
      for (let i = 0; i < count; i++) dots.createSpan({ cls: i === this.index ? "is-on" : "" });
    }

    const note = root.createDiv({ cls: "qiaomu-ext-xhs-note" });
    note.createDiv({ cls: "qiaomu-ext-xhs-title", text: preview.title || "（还没有标题）" });
    if (preview.text.trim()) note.createDiv({ cls: "qiaomu-ext-xhs-text", text: preview.text });
    if (preview.topics.length) {
      const topics = note.createDiv({ cls: "qiaomu-ext-xhs-topics" });
      for (const topic of preview.topics) topics.createSpan({ text: `#${topic}` });
    }
    this.scroll.scrollTop = top;
  }

  /** Back to the first card, e.g. after the layout changed. */
  resetCard(): void { this.index = 0; }

  destroy(): void { this.observer?.disconnect(); this.observer = null; }
}
