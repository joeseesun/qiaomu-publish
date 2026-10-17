import { type App, Modal } from "obsidian";
import { setName } from "../accessible-name";
import { autoCrop, centeredView, clampCrop, clampView, cropFromView, type CropRect, type CropView, MAX_ZOOM, minScale, viewFromCrop } from "./crop";
import { decodeSource, type CoverSource } from "./source";
import type { CoverSpec } from "./spec";

/** What the crop window returns: `crop` is null when the centred automatic crop was kept. The window itself resolving null means it was cancelled. */
export interface CropChoice { crop: CropRect | null }

/** The window where a picture is positioned and zoomed inside the platform's cover shape. */
export function askCrop(app: App, source: CoverSource, spec: CoverSpec, current: CropRect | null): Promise<CropChoice | null> {
  return new Promise((resolve) => new CoverCropModal(app, source, spec, current, resolve).open());
}

class CoverCropModal extends Modal {
  private bitmap: ImageBitmap | null = null;
  private url = "";
  private view: CropView = { scale: 1, offsetX: 0, offsetY: 0 };
  private frame!: HTMLElement;
  private image!: HTMLImageElement;
  private zoom!: HTMLInputElement;
  private info!: HTMLElement;
  private done = false;
  private frameWidth = 0;
  private frameHeight = 0;

  constructor(app: App, private readonly source: CoverSource, private readonly spec: CoverSpec, private readonly current: CropRect | null, private readonly resolve: (choice: CropChoice | null) => void) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("qiaomu-crop-modal");
    this.setTitle(`裁切${this.spec.label}`);
    const { contentEl } = this;
    contentEl.createEl("p", { cls: "qiaomu-crop-hint", text: "拖动图片调整位置，滚轮或滑块缩放。" });
    this.frame = contentEl.createDiv({ cls: "qiaomu-crop-frame", attr: { tabindex: "0" } });
    this.frame.setCssProps({ "--qiaomu-crop-ratio": String(this.spec.ratio) });
    setName(this.frame, `${this.spec.label}裁切区域，方向键移动，加减号缩放`);
    this.image = this.frame.createEl("img", { cls: "qiaomu-crop-image", attr: { alt: "", draggable: "false" } });
    if (this.spec.safe) {
      const safe = this.frame.createDiv({ cls: "qiaomu-crop-safe", attr: { "aria-hidden": "true" } });
      const wide = this.spec.safe.ratio >= this.spec.ratio;
      safe.setCssProps(wide ? { "--qiaomu-safe-w": "100%", "--qiaomu-safe-h": `${(this.spec.ratio / this.spec.safe.ratio) * 100}%` } : { "--qiaomu-safe-w": `${(this.spec.safe.ratio / this.spec.ratio) * 100}%`, "--qiaomu-safe-h": "100%" });
    }
    if (this.spec.safe) contentEl.createDiv({ cls: "qiaomu-crop-legend", text: this.spec.safe.label });

    const controls = contentEl.createDiv({ cls: "qiaomu-crop-controls" });
    controls.createSpan({ cls: "qiaomu-crop-label", text: "缩放" });
    this.zoom = controls.createEl("input", { cls: "qiaomu-crop-zoom", attr: { type: "range", min: "1", max: String(MAX_ZOOM), step: "0.01", value: "1" } });
    setName(this.zoom, "缩放");
    this.zoom.addEventListener("input", () => this.zoomAround(Number(this.zoom.value) * this.floor(), this.frameWidth / 2, this.frameHeight / 2));
    this.info = contentEl.createDiv({ cls: "qiaomu-crop-info" });

    const actions = contentEl.createDiv({ cls: "qiaomu-wechat-actions qiaomu-crop-actions" });
    const reset = actions.createEl("button", { text: "重置" });
    reset.addEventListener("click", () => { if (this.bitmap) this.apply(centeredView(this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight)); });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const ok = actions.createEl("button", { text: "使用这个裁切", cls: "mod-cta" });
    ok.addEventListener("click", () => this.confirm());

    this.bindGestures();
    void this.load();
  }

  private floor(): number { return this.bitmap ? minScale(this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight) : 1; }

  private async load(): Promise<void> {
    try {
      this.bitmap = await decodeSource(this.source);
      this.url = URL.createObjectURL(new Blob([this.source.data], { type: this.source.mime }));
      this.image.src = this.url;
      await this.image.decode().catch(() => undefined);
      this.frameWidth = this.frame.clientWidth;
      this.frameHeight = this.frame.clientHeight;
      const { width, height } = this.bitmap;
      const start = this.current ? viewFromCrop(clampCrop(this.current, width, height), this.frameWidth) : centeredView(width, height, this.frameWidth, this.frameHeight);
      this.image.setCssProps({ "--qiaomu-img-w": `${width}px`, "--qiaomu-img-h": `${height}px` });
      this.apply(start);
    } catch (error) {
      this.info.setText(`无法读取这张图片：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private apply(next: CropView): void {
    if (!this.bitmap) return;
    this.view = clampView(next, this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight);
    this.image.setCssProps({ "--qiaomu-x": `${this.view.offsetX}px`, "--qiaomu-y": `${this.view.offsetY}px`, "--qiaomu-s": String(this.view.scale) });
    this.zoom.value = String(this.view.scale / this.floor());
    const crop = cropFromView(this.view, this.frameWidth, this.frameHeight);
    const small = crop.width < this.spec.width * 0.95;
    this.info.setText(`原图 ${this.bitmap.width}×${this.bitmap.height}，输出 ${this.spec.width}×${this.spec.height}。${small ? `选区只有 ${Math.round(crop.width)} 像素宽，放大后会有点糊，可以缩小一点。` : ""}`);
    this.info.toggleClass("is-warning", small);
  }

  private zoomAround(scale: number, px: number, py: number): void {
    if (!this.bitmap) return;
    const ratio = scale / this.view.scale;
    this.apply({ scale, offsetX: px - (px - this.view.offsetX) * ratio, offsetY: py - (py - this.view.offsetY) * ratio });
  }

  private bindGestures(): void {
    let drag: { x: number; y: number; ox: number; oy: number } | null = null;
    this.frame.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY, ox: this.view.offsetX, oy: this.view.offsetY };
      this.frame.setPointerCapture(event.pointerId);
      this.frame.addClass("is-dragging");
    });
    this.frame.addEventListener("pointermove", (event) => {
      if (!drag) return;
      this.apply({ ...this.view, offsetX: drag.ox + event.clientX - drag.x, offsetY: drag.oy + event.clientY - drag.y });
    });
    const end = () => { drag = null; this.frame.removeClass("is-dragging"); };
    this.frame.addEventListener("pointerup", end);
    this.frame.addEventListener("pointercancel", end);
    this.frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = this.frame.getBoundingClientRect();
      this.zoomAround(this.view.scale * Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    this.frame.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 40 : 12;
      const move: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const delta = move[event.key];
      if (delta) { event.preventDefault(); this.apply({ ...this.view, offsetX: this.view.offsetX + delta[0], offsetY: this.view.offsetY + delta[1] }); return; }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); this.zoomAround(this.view.scale * 1.1, this.frameWidth / 2, this.frameHeight / 2); }
      if (event.key === "-") { event.preventDefault(); this.zoomAround(this.view.scale / 1.1, this.frameWidth / 2, this.frameHeight / 2); }
    });
  }

  private confirm(): void {
    if (!this.bitmap) { this.close(); return; }
    this.done = true;
    const crop = cropFromView(this.view, this.frameWidth, this.frameHeight);
    // A crop that never moved from the automatic one is stored as such, so a later change of platform shape re-centres it.
    const auto = autoCrop(this.bitmap.width, this.bitmap.height, this.spec);
    const same = Math.abs(crop.x - auto.x) < 1 && Math.abs(crop.y - auto.y) < 1 && Math.abs(crop.width - auto.width) < 1;
    this.resolve({ crop: same ? null : clampCrop(crop, this.bitmap.width, this.bitmap.height) });
    this.close();
  }

  override onClose(): void {
    if (!this.done) this.resolve(null);
    this.bitmap?.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.contentEl.empty();
  }
}
