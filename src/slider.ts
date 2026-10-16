import { setName } from "./accessible-name";

/** A slider drawn by the plugin: the thumb always sits on the track and nothing in the host theme can move it. */
export class Slider {
  readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly track: HTMLElement;
  private current: number;
  private enabled = true;
  private readonly decimals: number;

  constructor(parent: HTMLElement, private readonly config: { label: string; min: number; max: number; step: number; onInput: (value: number) => void }) {
    this.current = config.min;
    this.decimals = (String(config.step).split(".")[1] ?? "").length;
    this.el = parent.createDiv({ cls: "qiaomu-wechat-slider", attr: { role: "slider", tabindex: "0", "aria-valuemin": String(config.min), "aria-valuemax": String(config.max) } });
    setName(this.el, config.label);
    this.track = this.el.createDiv({ cls: "qiaomu-wechat-slider-track" });
    this.fill = this.track.createDiv({ cls: "qiaomu-wechat-slider-fill" });
    this.thumb = this.track.createDiv({ cls: "qiaomu-wechat-slider-thumb" });
    this.el.addEventListener("pointerdown", (event) => {
      if (!this.enabled || event.button !== 0) return;
      this.el.setPointerCapture(event.pointerId);
      this.el.focus();
      this.fromPointer(event);
    });
    this.el.addEventListener("pointermove", (event) => { if (this.el.hasPointerCapture(event.pointerId)) this.fromPointer(event); });
    this.el.addEventListener("keydown", (event) => this.onKey(event));
    this.setValue(this.current);
  }

  get value(): number { return this.current; }

  setValue(value: number): void {
    const { min, max, step } = this.config;
    const snapped = Math.round((Math.min(max, Math.max(min, value)) - min) / step) * step + min;
    this.current = Number(Math.min(max, snapped).toFixed(this.decimals));
    const percent = ((this.current - min) / (max - min)) * 100;
    this.fill.setCssProps({ width: `${percent}%` });
    this.thumb.setCssProps({ left: `${percent}%` });
    this.el.setAttribute("aria-valuenow", String(this.current));
  }

  setValueText(text: string): void { this.el.setAttribute("aria-valuetext", text); }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.el.setAttribute("aria-disabled", String(!enabled));
    this.el.tabIndex = enabled ? 0 : -1;
  }

  private change(value: number): void {
    const before = this.current;
    this.setValue(value);
    if (this.current !== before) this.config.onInput(this.current);
  }

  private fromPointer(event: PointerEvent): void {
    const rect = this.track.getBoundingClientRect();
    const ratio = rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
    this.change(this.config.min + ratio * (this.config.max - this.config.min));
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.enabled) return;
    const { min, max, step } = this.config;
    const keys: Record<string, number> = { ArrowRight: this.current + step, ArrowUp: this.current + step, ArrowLeft: this.current - step, ArrowDown: this.current - step, PageUp: this.current + step * 10, PageDown: this.current - step * 10, Home: min, End: max };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.change(next);
  }
}
