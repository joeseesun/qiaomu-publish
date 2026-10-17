import type { App } from "obsidian";
import { ensureBundledFont, usesBundledFont } from "../external/bundled-font";
import { coverFont, renderTitleCover } from "../title-cover";
import type { WechatCoverStyle } from "../types";
import { askDesign } from "./design-modal";
import { CoverPicker, type CoverMode, type CoverResult } from "./cover-picker";
import type { CoverCandidate, CoverSource } from "./source";
import type { CoverSpec } from "./spec";

export interface CoverSectionOptions {
  app: App;
  spec: CoverSpec;
  /** The window's title; the generated cover uses it unless the person writes other cover text. */
  title: () => string;
  candidates: () => CoverCandidate[];
  initial: () => Promise<CoverSource | null>;
  allowNone: boolean;
  fallbackMode: CoverMode;
  /** The generated cover's look is one shared setting (the same one the WeChat cover has always used). */
  style: () => WechatCoverStyle;
  updateStyle: (style: WechatCoverStyle) => void;
  coverText?: string;
  onCoverText?: (text: string) => void;
  onChange: () => void;
}

/**
 * The cover area of a publish window: the picker row (file from this computer, note picture, crop) and the cover designer,
 * which opens as its own window. Whichever way the cover is made, `result()` returns it cut to the platform's size.
 */
export class CoverSection {
  private readonly picker: CoverPicker;
  private coverText: string;
  private timer: number | null = null;

  constructor(parent: HTMLElement, private readonly options: CoverSectionOptions) {
    this.coverText = options.coverText ?? "";
    this.picker = new CoverPicker(parent.createDiv({ cls: "qiaomu-cover-section" }), {
      app: options.app, spec: options.spec, candidates: options.candidates, initial: options.initial,
      allowNone: options.allowNone, fallbackMode: options.fallbackMode,
      onDesign: () => void this.design(),
      onChange: () => { if (this.picker.mode === "title") void this.refreshGenerated(); options.onChange(); },
    });
  }

  get mode(): CoverMode { return this.picker.mode; }
  get hasImage(): boolean { return this.picker.hasImage; }

  async start(): Promise<void> {
    await this.picker.start();
    if (this.picker.mode === "title") await this.refreshGenerated();
  }

  /** Redraws the generated cover after the window's title changed. */
  syncTitle(): void {
    if (this.picker.mode !== "title") return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.refreshGenerated().then(() => this.options.onChange()); }, 300);
  }

  private async design(): Promise<void> {
    const choice = await askDesign(this.options.app, {
      spec: this.options.spec, title: this.options.title(), coverText: this.coverText,
      style: this.options.style, updateStyle: this.options.updateStyle,
    });
    if (!choice) { if (this.picker.mode === "title") await this.refreshGenerated(); return; }
    this.coverText = choice.coverText;
    this.options.onCoverText?.(this.coverText);
    this.picker.setMode("title");
  }

  private async titleCover(): Promise<CoverResult> {
    const { spec } = this.options;
    const style = this.options.style();
    const data = await renderTitleCover(this.coverText.trim() || this.options.title(), style, () => usesBundledFont(coverFont(style.font).stack) ? ensureBundledFont() : Promise.resolve(), { width: spec.width, height: spec.height });
    return { data, mime: "image/jpeg", name: `cover-${spec.id}.jpg` };
  }

  private async refreshGenerated(): Promise<void> {
    try { this.picker.showGenerated(await this.titleCover()); } catch { this.picker.showGenerated(null); }
  }

  /** The finished cover cut to the platform's size, whichever way it was made; null for "no cover". */
  async result(): Promise<CoverResult | null> {
    if (this.picker.mode === "image") return this.picker.result();
    return this.picker.mode === "title" ? this.titleCover() : null;
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.picker.destroy();
  }
}
