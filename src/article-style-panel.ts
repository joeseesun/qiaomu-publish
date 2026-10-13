import { setIcon, setTooltip } from "obsidian";
import { ARTICLE_STYLE_LIMITS } from "./article-style";
import { listWechatThemes } from "./export-html";
import { STYLE_TEXT as text } from "./style-text";
import type { WechatArticleAppearance, WechatArticleStyle } from "./types";

interface PanelOptions {
  change: (appearance: WechatArticleAppearance) => Promise<void>;
  reset: () => Promise<void>;
  makeDefault: () => Promise<void>;
  retry: () => Promise<void>;
  close: () => void;
}

/** Keep controls mounted during slider input, external settings changes and autosave. */
export class ArticleStylePanel {
  readonly el: HTMLElement;
  private theme: HTMLSelectElement;
  private status: HTMLElement;
  private retry: HTMLButtonElement;
  private appearance: WechatArticleAppearance = { themeId: "qiaomu-podcast", style: {} };
  private controls = new Map<keyof WechatArticleStyle, { input: HTMLInputElement; output: HTMLOutputElement }>();
  private saveGeneration = 0;

  constructor(parent: HTMLElement, private readonly options: PanelOptions) {
    this.el = parent.createDiv({ cls: "qiaomu-wechat-style-panel", attr: { role: "region", "aria-label": text.action } });
    this.el.hidden = true;
    const header = this.el.createDiv({ cls: "qiaomu-wechat-style-header" });
    header.createEl("strong", { text: text.title });
    const close = header.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": text.close } });
    setIcon(close, "x");
    setTooltip(close, text.close);
    close.addEventListener("click", options.close);
    this.el.createEl("p", { cls: "qiaomu-wechat-style-scope", text: text.scope });
    const themeLabel = this.el.createEl("label", { cls: "qiaomu-wechat-style-theme" });
    themeLabel.createSpan({ text: text.theme });
    this.theme = themeLabel.createEl("select");
    for (const theme of listWechatThemes()) this.theme.createEl("option", { text: theme.name, value: theme.id });
    this.theme.addEventListener("change", () => {
      this.appearance.themeId = this.theme.value;
      void this.save(() => options.change(this.value()));
    });
    const grid = this.el.createDiv({ cls: "qiaomu-wechat-style-grid" });
    for (const key of Object.keys(ARTICLE_STYLE_LIMITS) as (keyof WechatArticleStyle)[]) {
      const limits = ARTICLE_STYLE_LIMITS[key];
      const label = grid.createEl("label", { cls: "qiaomu-wechat-style-control" });
      const heading = label.createSpan({ cls: "qiaomu-wechat-style-label" });
      heading.createSpan({ text: text[key] });
      const output = heading.createEl("output");
      const input = label.createEl("input", { attr: { type: "range", min: String(limits.min), max: String(limits.max), step: String(limits.step), "data-style": key, "aria-label": text[key] } });
      this.controls.set(key, { input, output });
      input.addEventListener("input", () => {
        this.appearance.style[key] = Number(input.value);
        this.updateOutput(key);
        void this.save(() => options.change(this.value()));
      });
    }
    const footer = this.el.createDiv({ cls: "qiaomu-wechat-style-footer" });
    footer.createEl("button", { text: text.reset, attr: { type: "button" } }).addEventListener("click", () => void this.save(options.reset));
    footer.createEl("button", { text: text.makeDefault, attr: { type: "button" } }).addEventListener("click", () => void this.save(options.makeDefault, text.defaultSaved));
    this.status = this.el.createDiv({ cls: "qiaomu-wechat-style-status", attr: { role: "status", "aria-live": "polite" } });
    this.retry = this.el.createEl("button", { text: text.retry, attr: { type: "button" } });
    this.retry.hidden = true;
    this.retry.addEventListener("click", () => void this.save(options.retry));
    this.el.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); options.close(); }
    });
  }

  private value(): WechatArticleAppearance {
    return { themeId: this.appearance.themeId, style: { ...this.appearance.style } };
  }

  sync(appearance: WechatArticleAppearance, article?: ShadowRoot): void {
    this.appearance = { themeId: appearance.themeId, style: { ...appearance.style } };
    this.theme.value = appearance.themeId;
    const view = article?.ownerDocument.defaultView;
    const paragraph = article?.querySelector<HTMLElement>(".wechat-export-content > p + p")
      ?? article?.querySelector<HTMLElement>(".wechat-export-content p");
    const body = article?.querySelector<HTMLElement>(".wechat-export-content");
    const node = paragraph ?? body;
    const computed = node && view ? view.getComputedStyle(node) : null;
    const wrapper = article?.querySelector<HTMLElement>(".wechat-export-article");
    const measured = {
      fontSize: computed ? parseFloat(computed.fontSize) : NaN,
      lineHeight: computed ? parseFloat(computed.lineHeight) / parseFloat(computed.fontSize) : NaN,
      paragraphSpacing: computed ? Math.max(parseFloat(computed.marginTop), parseFloat(computed.marginBottom)) : NaN,
      pagePadding: wrapper && view ? parseFloat(view.getComputedStyle(wrapper).paddingLeft) : NaN,
    };
    for (const [key, control] of this.controls) {
      const limits = ARTICLE_STYLE_LIMITS[key];
      const value = appearance.style[key] ?? (Number.isFinite(measured[key]) ? measured[key] : limits.fallback);
      control.input.value = String(Math.min(limits.max, Math.max(limits.min, value)));
      this.updateOutput(key);
    }
  }

  private updateOutput(key: keyof WechatArticleStyle): void {
    const control = this.controls.get(key)!;
    const value = this.appearance.style[key];
    const label = value === undefined ? text.themeDefault : key === "lineHeight" ? String(value) : `${value} px`;
    control.output.textContent = label;
    control.input.setAttribute("aria-valuetext", label);
  }

  show(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.theme.focus();
    else { this.saveGeneration++; this.status.textContent = ""; this.retry.hidden = true; }
  }

  setEnabled(enabled: boolean): void {
    this.theme.disabled = !enabled;
    for (const { input } of this.controls.values()) input.disabled = !enabled;
    for (const button of this.el.querySelectorAll<HTMLButtonElement>(".qiaomu-wechat-style-footer button")) button.disabled = !enabled;
  }

  clearStatus(): void { this.saveGeneration++; this.status.textContent = ""; this.retry.hidden = true; }

  private async save(action: () => Promise<void>, success: string = text.saved): Promise<void> {
    const generation = ++this.saveGeneration;
    this.status.textContent = text.saving;
    this.retry.hidden = true;
    try {
      await action();
      if (generation === this.saveGeneration) this.status.textContent = success;
    } catch (error) {
      if (generation !== this.saveGeneration) return;
      this.status.textContent = `${text.saveFailed}：${error instanceof Error ? error.message : String(error)}`;
      this.retry.hidden = false;
    }
  }
}
