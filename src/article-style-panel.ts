import { setIcon } from "obsidian";
import { ARTICLE_STYLE_LIMITS, BOOLEAN_STYLE_DEFAULTS, BOOLEAN_STYLE_KEYS, FONT_FAMILIES, MAX_CUSTOM_CSS, type BooleanStyleKey, type NumericStyleKey } from "./article-style";
import { CODE_THEMES } from "./code-highlight";
import { setName } from "./accessible-name";
import { CustomColor } from "./custom-color";
import { Slider } from "./slider";
import { STYLE_TEXT as text } from "./style-text";
import type { WechatArticleAppearance, WechatArticleStyle, WechatFontFamily } from "./types";

interface PanelOptions {
  change: (appearance: WechatArticleAppearance) => Promise<void>;
  reset: () => Promise<void>;
  makeDefault: () => Promise<void>;
  retry: () => Promise<void>;
  close: () => void;
}

const PRESET_COLORS = ["#07c160", "#576b95", "#c96442", "#0f62fe", "#e60023", "#7c3aed", "#111111"];

/** Keep controls mounted during slider input, external settings changes and autosave. */
export class ArticleStylePanel {
  readonly el: HTMLElement;
  private status: HTMLElement;
  private retry: HTMLButtonElement;
  private appearance: WechatArticleAppearance = { themeId: "qiaomu-podcast", style: {} };
  private controls = new Map<NumericStyleKey, { slider: Slider; output: HTMLOutputElement }>();
  private toggles = new Map<BooleanStyleKey, HTMLInputElement>();
  private fonts = new Map<WechatFontFamily | "", HTMLButtonElement>();
  private presets = new Map<string, HTMLButtonElement>();
  private color!: CustomColor;
  private colorReset!: HTMLButtonElement;
  private codeTheme!: HTMLSelectElement;
  private css!: HTMLTextAreaElement;
  private saveGeneration = 0;

  constructor(parent: HTMLElement, private readonly options: PanelOptions) {
    this.el = parent.createDiv({ cls: "qiaomu-wechat-style-panel", attr: { role: "region" } });
    setName(this.el, text.action);
    this.el.hidden = true;
    const header = this.el.createDiv({ cls: "qiaomu-wechat-style-header" });
    header.createEl("strong", { text: text.title });
    const close = header.createEl("button", { cls: "qiaomu-wechat-icon-button", attr: { type: "button", "data-qm-tip": text.close } });
    setIcon(close, "x");
    setName(close, text.close);
    close.addEventListener("click", options.close);
    this.el.createEl("p", { cls: "qiaomu-wechat-style-scope", text: text.scope });

    this.buildColorAndFont(this.section(text.sectionColorFont, false));
    this.buildBody(this.section(text.sectionBody, true));
    this.buildCode(this.section(text.sectionCode, false));
    const content = this.section(text.sectionContent, false);
    this.toggle(content, "linkFootnotes", text.linkFootnotes, text.linkFootnotesHint);
    this.toggle(content, "imageCaptions", text.imageCaptions);
    this.buildAdvanced(this.section(text.sectionAdvanced, false));

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

  private section(title: string, open: boolean): HTMLElement {
    const details = this.el.createEl("details", { cls: "qiaomu-wechat-style-section" });
    details.open = open;
    details.createEl("summary", { text: title });
    return details.createDiv({ cls: "qiaomu-wechat-style-section-body" });
  }

  private commit(mutate: (style: WechatArticleStyle) => void): void {
    mutate(this.appearance.style);
    void this.save(() => this.options.change(this.value()));
  }

  private buildColorAndFont(body: HTMLElement): void {
    const row = body.createDiv({ cls: "qiaomu-wechat-style-row" });
    row.createSpan({ text: text.primaryColor });
    const tools = row.createDiv({ cls: "qiaomu-wechat-style-colors" });
    for (const hex of PRESET_COLORS) {
      const dot = tools.createEl("button", { cls: "qiaomu-wechat-color-dot", attr: { type: "button", "aria-pressed": "false", "data-qm-tip": hex } });
      setName(dot, `${text.primaryColor} ${hex}`);
      dot.setCssProps({ "background-color": hex });
      dot.addEventListener("click", () => this.commit((style) => { style.primaryColor = hex; }));
      this.presets.set(hex, dot);
    }
    tools.createSpan({ cls: "qiaomu-wechat-divider", attr: { "aria-hidden": "true" } });
    this.color = new CustomColor(tools, { name: text.primaryColor, onCommit: (hex) => this.commit((style) => { style.primaryColor = hex; }) });
    this.colorReset = tools.createEl("button", { cls: "qiaomu-wechat-icon-button", attr: { type: "button", "data-qm-tip": text.primaryReset } });
    setIcon(this.colorReset, "rotate-ccw");
    setName(this.colorReset, text.primaryReset);
    this.colorReset.addEventListener("click", () => this.commit((style) => { delete style.primaryColor; }));
    body.createEl("p", { cls: "qiaomu-wechat-style-hint", text: text.primaryHint });

    const fontRow = body.createDiv({ cls: "qiaomu-wechat-style-row" });
    fontRow.createSpan({ text: text.fontFamily });
    const group = fontRow.createDiv({ cls: "qiaomu-wechat-segmented", attr: { role: "group" } });
    setName(group, text.fontFamily);
    const entries: [WechatFontFamily | "", string][] = [["", text.themeDefault], ...(Object.entries(FONT_FAMILIES) as [WechatFontFamily, { name: string }][]).map(([id, item]): [WechatFontFamily, string] => [id, item.name])];
    for (const [id, label] of entries) {
      const button = group.createEl("button", { text: label, attr: { type: "button", "aria-pressed": "false" } });
      button.addEventListener("click", () => this.commit((style) => { if (id) style.fontFamily = id; else delete style.fontFamily; }));
      this.fonts.set(id, button);
    }
  }

  private buildBody(body: HTMLElement): void {
    const grid = body.createDiv({ cls: "qiaomu-wechat-style-grid" });
    for (const key of Object.keys(ARTICLE_STYLE_LIMITS) as NumericStyleKey[]) {
      const limits = ARTICLE_STYLE_LIMITS[key];
      const wrap = grid.createDiv({ cls: "qiaomu-wechat-style-control" });
      const heading = wrap.createDiv({ cls: "qiaomu-wechat-style-label" });
      heading.createSpan({ text: text[key] });
      const output = heading.createEl("output");
      const slider = new Slider(wrap, {
        label: text[key], ...limits,
        onInput: (value) => {
          this.appearance.style[key] = value;
          this.updateOutput(key);
          void this.save(() => this.options.change(this.value()));
        },
      });
      this.controls.set(key, { slider, output });
    }
    const toggles = body.createDiv({ cls: "qiaomu-wechat-style-toggles" });
    this.toggle(toggles, "justify", text.justify);
    this.toggle(toggles, "indent", text.indent);
  }

  private buildCode(body: HTMLElement): void {
    const row = body.createEl("label", { cls: "qiaomu-wechat-style-row" });
    row.createSpan({ text: text.codeTheme });
    this.codeTheme = row.createEl("select");
    setName(this.codeTheme, text.codeTheme);
    this.codeTheme.createEl("option", { text: text.codeFollow, value: "" });
    for (const theme of CODE_THEMES) this.codeTheme.createEl("option", { text: theme.name, value: theme.id });
    this.codeTheme.addEventListener("change", () => this.commit((style) => { if (this.codeTheme.value) style.codeTheme = this.codeTheme.value; else delete style.codeTheme; }));
    this.toggle(body, "macCode", text.macCode);
    this.toggle(body, "codeLineNumbers", text.codeLineNumbers);
  }

  private buildAdvanced(body: HTMLElement): void {
    body.createEl("p", { cls: "qiaomu-wechat-style-hint", text: text.customCssHint });
    this.css = body.createEl("textarea", { cls: "qiaomu-wechat-style-css", attr: { rows: "6", spellcheck: "false", maxlength: String(MAX_CUSTOM_CSS) } });
    setName(this.css, text.customCss);
    this.css.addEventListener("change", () => this.commit((style) => { if (this.css.value.trim()) style.customCss = this.css.value; else delete style.customCss; }));
  }

  private toggle(parent: HTMLElement, key: BooleanStyleKey, label: string, hint?: string): void {
    const row = parent.createEl("label", { cls: "qiaomu-wechat-style-toggle" });
    const input = row.createEl("input", { attr: { type: "checkbox" } });
    const copy = row.createSpan({ cls: "qiaomu-wechat-style-toggle-text" });
    copy.createSpan({ text: label });
    if (hint) copy.createSpan({ cls: "qiaomu-wechat-style-hint", text: hint });
    input.addEventListener("change", () => this.commit((style) => { style[key] = input.checked; }));
    this.toggles.set(key, input);
  }

  private value(): WechatArticleAppearance {
    return { themeId: this.appearance.themeId, style: { ...this.appearance.style } };
  }

  sync(appearance: WechatArticleAppearance, article?: ShadowRoot): void {
    this.appearance = { themeId: appearance.themeId, style: { ...appearance.style } };
    const style = this.appearance.style;
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
      const value = style[key] ?? (Number.isFinite(measured[key]) ? measured[key] : limits.fallback);
      control.slider.setValue(value);
      this.updateOutput(key);
    }
    for (const key of BOOLEAN_STYLE_KEYS) this.toggles.get(key)!.checked = style[key] ?? BOOLEAN_STYLE_DEFAULTS[key];
    for (const [id, button] of this.fonts) button.setAttribute("aria-pressed", String((style.fontFamily ?? "") === id));
    for (const [hex, button] of this.presets) button.setAttribute("aria-pressed", String(style.primaryColor === hex));
    this.color.set(style.primaryColor && !PRESET_COLORS.includes(style.primaryColor) ? style.primaryColor : null, style.primaryColor ?? "#576b95");
    this.colorReset.hidden = !style.primaryColor;
    this.codeTheme.value = style.codeTheme ?? "";
    if (this.css.ownerDocument.activeElement !== this.css) this.css.value = style.customCss ?? "";
  }

  private updateOutput(key: NumericStyleKey): void {
    const control = this.controls.get(key)!;
    const value = this.appearance.style[key];
    const label = value === undefined ? text.themeDefault : key === "lineHeight" ? String(value) : `${value} px`;
    control.output.textContent = label;
    control.slider.setValueText(label);
  }

  show(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.el.querySelector<HTMLElement>(".qiaomu-wechat-icon-button")?.focus();
    else { this.saveGeneration++; this.status.textContent = ""; this.retry.hidden = true; }
  }

  setEnabled(enabled: boolean): void {
    for (const { slider } of this.controls.values()) slider.setEnabled(enabled);
    for (const element of this.el.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea, .qiaomu-wechat-style-section button, .qiaomu-wechat-style-footer button")) element.disabled = !enabled;
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
