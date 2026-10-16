import { setName } from "./accessible-name";
import { CustomColor } from "./custom-color";
import { FontPicker } from "./font-picker";
import { Slider } from "./slider";
import { COVER_BACKGROUNDS, COVER_HEIGHT, COVER_SIZE, COVER_WIDTH, coverBackground, coverInk, drawTitleCover } from "./title-cover";
import type { WechatCoverStyle } from "./types";

const INK_PRESETS: [string, string][] = [["#ffffff", "白色"], ["#1a1a1a", "近黑"], ["#c2410c", "橙红"], ["#b45309", "琥珀"]];

/** Live editor for the cover generated when a note has no image. Used in the publish window and in settings. */
export class CoverEditor {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly chips = new Map<string, HTMLButtonElement>();
  private readonly inks = new Map<string, HTMLButtonElement>();
  private readonly size: Slider;
  private readonly sizeOutput: HTMLElement;
  private readonly background: CustomColor;
  private readonly color: CustomColor;
  private readonly font: FontPicker;
  private autoSize!: HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly options: { title: () => string; style: () => WechatCoverStyle; update: (style: WechatCoverStyle) => void }) {
    this.el = parent.createDiv({ cls: "qiaomu-wechat-cover-editor" });
    this.canvas = this.el.createEl("canvas", { cls: "qiaomu-wechat-cover-canvas", attr: { width: String(COVER_WIDTH), height: String(COVER_HEIGHT), role: "img" } });
    setName(this.canvas, "标题封面预览");

    const row = (label: string) => {
      const line = this.el.createDiv({ cls: "qiaomu-wechat-cover-row" });
      line.createSpan({ cls: "qiaomu-wechat-cover-label", text: label });
      return line.createDiv({ cls: "qiaomu-wechat-cover-control" });
    };

    const swatches = row("背景");
    for (const background of COVER_BACKGROUNDS) {
      const chip = swatches.createEl("button", { cls: "qiaomu-wechat-cover-chip", attr: { type: "button", "data-qm-tip": background.name } });
      chip.setCssProps({ background: background.colors.length === 1 ? background.colors[0]! : `linear-gradient(135deg, ${background.colors.join(", ")})` });
      setName(chip, background.name);
      chip.addEventListener("click", () => this.change({ background: background.id }));
      this.chips.set(background.id, chip);
    }
    swatches.createSpan({ cls: "qiaomu-wechat-divider", attr: { "aria-hidden": "true" } });
    this.background = new CustomColor(swatches, { name: "自定义背景色", onPreview: (hex) => this.draw({ background: `custom:${hex}` }), onCommit: (hex) => this.change({ background: `custom:${hex}` }) });

    this.font = new FontPicker(row("字体"), (font) => this.change({ font }));

    const sizeRow = row("字号");
    this.size = new Slider(sizeRow, { label: "标题字号", ...COVER_SIZE, onInput: (value) => this.change({ size: value }) });
    this.sizeOutput = sizeRow.createEl("output", { cls: "qiaomu-wechat-cover-output" });
    this.autoSize = sizeRow.createEl("button", { cls: "qiaomu-wechat-cover-link", text: "自动", attr: { type: "button" } });
    this.autoSize.addEventListener("click", () => { const { size: _drop, ...rest } = this.options.style(); this.options.update(rest); this.sync(); });

    const ink = row("颜色");
    const auto = ink.createEl("button", { cls: "qiaomu-wechat-cover-link", text: "自动", attr: { type: "button" } });
    auto.addEventListener("click", () => { const { color: _drop, ...rest } = this.options.style(); this.options.update(rest); this.sync(); });
    this.inks.set("", auto);
    for (const [hex, name] of INK_PRESETS) {
      const chip = ink.createEl("button", { cls: "qiaomu-wechat-cover-chip", attr: { type: "button", "data-qm-tip": name } });
      chip.setCssProps({ background: hex });
      setName(chip, name);
      chip.addEventListener("click", () => this.change({ color: hex }));
      this.inks.set(hex, chip);
    }
    ink.createSpan({ cls: "qiaomu-wechat-divider", attr: { "aria-hidden": "true" } });
    this.color = new CustomColor(ink, { name: "自定义文字颜色", onPreview: (hex) => this.draw({ color: hex }), onCommit: (hex) => this.change({ color: hex }) });
    this.sync();
  }

  destroy(): void { this.font.destroy(); }

  private change(patch: Partial<WechatCoverStyle>): void {
    this.options.update({ ...this.options.style(), ...patch });
    this.sync();
  }

  /** Draws with a temporary change (a colour still being dragged) without saving it. */
  private draw(patch: Partial<WechatCoverStyle> = {}): void {
    const context = this.canvas.getContext("2d");
    if (context) drawTitleCover(context, this.options.title().trim() || "标题", { ...this.options.style(), ...patch });
  }

  /** Redraws after the title or any control changes. */
  sync(): void {
    const style = this.options.style();
    this.draw();
    const presetBackground = style.background.startsWith("custom:") ? null : style.background;
    for (const [id, chip] of this.chips) chip.setAttribute("aria-pressed", String(id === presetBackground));
    this.background.set(style.background.startsWith("custom:") ? style.background.slice(7) : null, coverBackground(style.background).colors[0]!);
    this.font.setValue(style.font);
    this.size.setValue(style.size ?? 52);
    this.sizeOutput.setText(style.size ? `${style.size}px` : "自动");
    this.autoSize.hidden = style.size === undefined;
    const presetInk = style.color === undefined || INK_PRESETS.some(([hex]) => hex === style.color);
    for (const [hex, chip] of this.inks) chip.setAttribute("aria-pressed", String((style.color ?? "") === hex));
    this.color.set(presetInk ? null : style.color!, style.color ?? coverInk(coverBackground(style.background).colors));
  }
}
