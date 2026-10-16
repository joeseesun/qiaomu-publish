import { setName } from "./accessible-name";

/**
 * "Custom" colour control. It looks nothing like the preset dots: a labelled pill with a rainbow swatch,
 * which shows the chosen hex once a custom colour is active. The native colour input sits invisibly on top.
 */
export class CustomColor {
  readonly el: HTMLLabelElement;
  private readonly swatch: HTMLElement;
  private readonly text: HTMLElement;
  private readonly input: HTMLInputElement;

  constructor(parent: HTMLElement, private readonly options: { name: string; onPreview?: (hex: string) => void; onCommit: (hex: string) => void }) {
    this.el = parent.createEl("label", { cls: "qiaomu-wechat-custom-color" });
    this.swatch = this.el.createSpan({ cls: "qiaomu-wechat-custom-swatch", attr: { "aria-hidden": "true" } });
    this.text = this.el.createSpan({ cls: "qiaomu-wechat-custom-text", text: "自定义" });
    this.input = this.el.createEl("input", { cls: "qiaomu-wechat-custom-input", attr: { type: "color" } });
    setName(this.input, options.name);
    // `input` fires continuously while dragging inside the picker; `change` once when it closes.
    this.input.addEventListener("input", () => { this.show(this.input.value, true); options.onPreview?.(this.input.value); });
    this.input.addEventListener("change", () => options.onCommit(this.input.value));
  }

  /** `hex` is the active custom colour, or null when a preset (or automatic) is in use. */
  set(hex: string | null, start: string): void {
    this.input.value = /^#[0-9a-f]{6}$/i.test(hex ?? start) ? (hex ?? start) : "#888888";
    this.show(hex, hex !== null);
  }

  private show(hex: string | null, active: boolean): void {
    this.el.toggleClass("is-active", active);
    if (active && hex) {
      this.swatch.setCssProps({ "--qiaomu-chip-background": hex });
      this.text.setText(hex.toUpperCase());
    } else {
      this.swatch.setCssProps({ "--qiaomu-chip-background": "" });
      this.text.setText("自定义");
    }
  }
}
