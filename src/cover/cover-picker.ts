import { type App, Menu, Notice, setIcon } from "obsidian";
import { askCrop } from "./crop-modal";
import { autoCrop, clampCrop, type CropRect, renderCover } from "./crop";
import { chooseImageFile, type CoverCandidate, type CoverSource, decodeSource } from "./source";
import { type CoverSpec, matchesRatio } from "./spec";

export type CoverMode = "image" | "title" | "none";

export interface CoverResult { data: ArrayBuffer; mime: string; name: string }

export interface CoverPickerOptions {
  app: App;
  spec: CoverSpec;
  /** Pictures of the note, offered in the menu. */
  candidates: () => CoverCandidate[];
  /** The cover the note already names (属性 cover) or its first picture; used until the person chooses another. */
  initial: () => Promise<CoverSource | null>;
  /** Offers "不要封面" (X, where the cover is optional). */
  allowNone?: boolean;
  /** Opens the cover designer (text cover now; generated pictures later). */
  onDesign: () => void;
  /** Starting mode when `initial` finds nothing. */
  fallbackMode?: CoverMode;
  onChange: () => void;
}

/**
 * The cover row of a publish window: the cover as it will be uploaded (already cut to the platform's shape), where it came from,
 * and the ways to change it — a file from this computer, a picture of the note, the crop window, or no cover.
 */
export class CoverPicker {
  mode: CoverMode = "image";
  private source: CoverSource | null = null;
  private crop: CropRect | null = null;
  private dimensions: { width: number; height: number } | null = null;
  private final: CoverResult | null = null;
  private url = "";
  private rendering: Promise<void> = Promise.resolve();
  private thumb!: HTMLElement;
  private details!: HTMLElement;
  private actions!: HTMLElement;
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly options: CoverPickerOptions) {
    this.root = parent.createDiv({ cls: "qiaomu-cover" });
    this.thumb = this.root.createDiv({ cls: "qiaomu-cover-thumb", attr: { role: "button", tabindex: "0" } });
    this.thumb.setCssProps({ "--qiaomu-cover-ratio": String(options.spec.ratio) });
    const press = () => this.pressThumb();
    this.thumb.addEventListener("click", press);
    this.thumb.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); press(); } });
    const side = this.root.createDiv({ cls: "qiaomu-cover-side" });
    this.details = side.createDiv({ cls: "qiaomu-cover-details" });
    this.actions = side.createDiv({ cls: "qiaomu-cover-actions" });
    this.render();
  }

  destroy(): void { this.releaseUrl(); }

  /** The finished cover (cut to the platform's size), or null when the mode is not "image" or nothing is chosen. */
  async result(): Promise<CoverResult | null> {
    await this.rendering;
    return this.mode === "image" ? this.final : null;
  }

  get hasImage(): boolean { return this.mode === "image" && !!this.source; }

  /** Switches to the generated title cover (WeChat). */
  setMode(mode: CoverMode): void {
    this.mode = mode;
    this.render();
    this.options.onChange();
  }

  /** Loads the cover the note already has. Called once the note has been rendered. */
  async start(): Promise<void> {
    try {
      const initial = await this.options.initial();
      if (initial) await this.setSource(initial, false);
      else this.mode = this.options.fallbackMode ?? (this.options.allowNone ? "none" : "image");
    } catch (error) {
      new Notice(`读取封面失败：${error instanceof Error ? error.message : String(error)}`);
      this.mode = this.options.fallbackMode ?? "none";
    }
    this.render();
    this.options.onChange();
  }

  /** Adopts a new picture. When it is not the platform's shape, the crop window opens; cancelling there keeps the previous cover. */
  private async setSource(source: CoverSource, askIfNeeded: boolean): Promise<boolean> {
    const bitmap = await decodeSource(source);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    let crop: CropRect | null = null;
    if (askIfNeeded && !matchesRatio(size.width, size.height, this.options.spec)) {
      const choice = await askCrop(this.options.app, source, this.options.spec, null);
      if (!choice) return false;
      crop = choice.crop;
    }
    this.source = source;
    this.crop = crop;
    this.dimensions = size;
    this.mode = "image";
    await this.refresh();
    return true;
  }

  private refresh(): Promise<void> {
    this.rendering = (async () => {
      if (!this.source || !this.dimensions) { this.final = null; return; }
      const bitmap = await decodeSource(this.source);
      try {
        const crop = this.crop ? clampCrop(this.crop, bitmap.width, bitmap.height) : autoCrop(bitmap.width, bitmap.height, this.options.spec);
        const rendered = await renderCover(bitmap, crop, this.options.spec);
        this.final = { data: rendered.data, mime: rendered.mime, name: `cover-${this.options.spec.id}.jpg` };
        this.releaseUrl();
        this.url = URL.createObjectURL(new Blob([rendered.data], { type: rendered.mime }));
      } finally { bitmap.close(); }
    })();
    return this.rendering.then(() => this.render());
  }

  /** What clicking the picture does: choose one when there is none, otherwise change what is there. */
  private pressThumb(): void {
    if (this.mode === "title") this.options.onDesign();
    else if (this.mode === "image" && this.source) void this.adjust();
    else void this.chooseFile();
  }

  /** Shows the generated (text) cover in the picture area while the mode is "title". */
  showGenerated(result: CoverResult | null): void {
    this.releaseUrl();
    if (result) this.url = URL.createObjectURL(new Blob([result.data], { type: result.mime }));
    this.render();
  }

  private releaseUrl(): void { if (this.url) URL.revokeObjectURL(this.url); this.url = ""; }

  private async chooseFile(): Promise<void> {
    try {
      const source = await chooseImageFile();
      if (source && (await this.setSource(source, true))) this.options.onChange();
    } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
  }

  private async chooseCandidate(candidate: CoverCandidate): Promise<void> {
    try {
      const source = await candidate.load();
      if (await this.setSource(source, true)) this.options.onChange();
    } catch (error) { new Notice(`读取图片失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  private async adjust(): Promise<void> {
    if (!this.source) return;
    const choice = await askCrop(this.options.app, this.source, this.options.spec, this.crop);
    if (!choice) return;
    this.crop = choice.crop;
    await this.refresh();
    this.options.onChange();
  }

  private openMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("从电脑选择图片…").setIcon("folder-open").onClick(() => void this.chooseFile()));
    const candidates = this.options.candidates();
    if (candidates.length) {
      menu.addSeparator();
      for (const candidate of candidates.slice(0, 12)) menu.addItem((item) => item.setTitle(`笔记图片：${candidate.label}`).setIcon("image").onClick(() => void this.chooseCandidate(candidate)));
    }
    if (this.options.allowNone && this.mode !== "none") menu.addSeparator();
    if (this.options.allowNone && this.mode !== "none") menu.addItem((item) => item.setTitle("不要封面").setIcon("image-off").setChecked(this.mode === "none").onClick(() => this.setMode("none")));
    menu.showAtMouseEvent(event);
  }

  private render(): void {
    const { spec } = this.options;
    this.thumb.empty();
    this.details.empty();
    this.actions.empty();
    const hasPicture = (this.mode === "image" || this.mode === "title") && !!this.url;
    if (hasPicture) this.thumb.createEl("img", { attr: { src: this.url, alt: "" } });
    else this.thumb.createSpan({ cls: "qiaomu-cover-empty", text: this.mode === "image" ? "读取中…" : "" });
    const action = this.mode === "title" ? "修改设计" : this.mode === "image" && this.source ? "调整裁切" : "选择图片";
    this.thumb.createSpan({ cls: "qiaomu-cover-thumb-hint", text: action });
    if (!hasPicture && this.mode !== "image") this.thumb.addClass("is-blank"); else this.thumb.removeClass("is-blank");

    this.details.createDiv({ cls: "qiaomu-cover-name", text: `${spec.label} · ${spec.width}×${spec.height}` });
    if (this.mode === "image" && this.source && this.dimensions) {
      const exact = matchesRatio(this.dimensions.width, this.dimensions.height, spec);
      this.details.createDiv({ cls: "qiaomu-cover-line", text: `${this.source.origin}：${this.source.name} · 原图 ${this.dimensions.width}×${this.dimensions.height}${this.crop ? " · 已手动裁切" : exact ? "" : " · 已自动居中裁切"}` });
      if (this.dimensions.width < spec.width * 0.7) this.details.createDiv({ cls: "qiaomu-cover-warning", text: "原图偏小，放大到封面尺寸后会有点糊。" });
    } else if (this.mode === "title") this.details.createDiv({ cls: "qiaomu-cover-line", text: "文字封面：用标题生成，可以改文字和样式。" });
    this.details.createDiv({ cls: "qiaomu-cover-note", text: spec.note });

    const choose = this.actions.createEl("button", { cls: "qiaomu-cover-button", attr: { type: "button" } });
    setIcon(choose.createSpan({ attr: { "aria-hidden": "true" } }), "image-plus");
    choose.createSpan({ text: this.mode === "image" && this.source ? "更换图片" : "选择图片" });
    choose.addEventListener("click", (event) => this.openMenu(event));
    const design = this.actions.createEl("button", { cls: "qiaomu-cover-button", attr: { type: "button" } });
    setIcon(design.createSpan({ attr: { "aria-hidden": "true" } }), "palette");
    design.createSpan({ text: "设计封面" });
    design.addEventListener("click", () => this.options.onDesign());
    if (this.mode === "image" && this.source) {
      const adjust = this.actions.createEl("button", { cls: "qiaomu-cover-button", attr: { type: "button" } });
      setIcon(adjust.createSpan({ attr: { "aria-hidden": "true" } }), "crop");
      adjust.createSpan({ text: "调整裁切" });
      adjust.addEventListener("click", () => void this.adjust());
    }
  }
}
