import { type App, Modal } from "obsidian";
import { setName } from "../accessible-name";
import { autoCrop, centeredView, clampCrop, clampView, cropFromView, type CropRect, type CropView, MAX_ZOOM, minScale, viewFromCrop } from "./crop";
import { decodeSource, type CoverSource } from "./source";
import type { CoverSpec } from "./spec";
import { clampSharePosition, wechatSquareCrop } from "./share-crop";

/** `crop: null` keeps the automatic wide crop; resolving null cancels both selections. */
export interface CropChoice { crop: CropRect | null; sharePosition?: number }

export function askCrop(app: App, source: CoverSource, spec: CoverSpec, current: CropRect | null, sharePosition = 0.5): Promise<CropChoice | null> {
  return new Promise(resolve => new CoverCropModal(app, source, spec, current, resolve, sharePosition).open());
}
class CoverCropModal extends Modal {
  constructor(app: App, private readonly source: CoverSource, private readonly spec: CoverSpec, private readonly current: CropRect | null, private readonly resolve: (choice: CropChoice | null) => void, sharePosition = 0.5) {
    super(app);
    this.sharePosition = clampSharePosition(sharePosition);
  }
  private sharePosition: number;
  private frame!: HTMLElement;
  private image!: HTMLImageElement;
  private zoom!: HTMLInputElement;
  private info!: HTMLElement;
  private safe?: HTMLElement;
  private shareSlider?: HTMLInputElement;
  private shareCanvas?: HTMLCanvasElement;
  private confirmButton!: HTMLButtonElement;
  private bitmap: ImageBitmap | null = null;
  private url = "";
  private view: CropView = { scale: 1, offsetX: 0, offsetY: 0 };
  private frameWidth = 0;
  private frameHeight = 0;
  private done = false;
  private closed = false;
  private observer: ResizeObserver | null = null;
  private get movableShare(): boolean { return this.spec.id === "wechat" && this.spec.safe?.ratio === 1; }
  override onOpen(): void {
    this.modalEl.addClass("qiaomu-crop-modal");
    this.setTitle(`裁切${this.spec.label}`);
    const el = this.contentEl;
    el.createEl("p", { cls: "qiaomu-crop-hint", text: this.movableShare
      ? "拖动虚线框选择分享方图；拖动框外图片调整横版封面，滚轮或缩放滑块可放大。"
      : "拖动图片调整位置，滚轮或滑块缩放。" });
    this.frame = el.createDiv({ cls: "qiaomu-crop-frame", attr: { tabindex: "0" } });
    this.frame.setCssProps({ "--qiaomu-crop-ratio": String(this.spec.ratio) });
    setName(this.frame, `${this.spec.label}裁切区域，方向键移动图片，加减号缩放`);
    this.image = this.frame.createEl("img", { cls: "qiaomu-crop-image", attr: { alt: "", draggable: "false" } });
    if (this.spec.safe) {
      this.safe = this.frame.createDiv({ cls: "qiaomu-crop-safe", attr: this.movableShare
        ? { tabindex: "0", role: "slider", "aria-label": "分享方图位置", "aria-valuemin": "0", "aria-valuemax": "100", "aria-orientation": "horizontal" }
        : { "aria-hidden": "true" } });
      const horizontal = this.spec.safe.ratio >= this.spec.ratio;
      this.safe.setCssProps(horizontal
        ? { "--qiaomu-safe-w": "100%", "--qiaomu-safe-h": `${this.spec.ratio / this.spec.safe.ratio * 100}%` }
        : { "--qiaomu-safe-w": `${this.spec.safe.ratio / this.spec.ratio * 100}%`, "--qiaomu-safe-h": "100%" });
      if (this.movableShare) this.safe.addClass("is-movable");
      el.createDiv({ cls: "qiaomu-crop-legend", text: this.movableShare
        ? "虚线框：分享方图选区，可左右拖动；横版封面的构图不受影响。"
        : this.spec.safe.label });
    }
    const controls = el.createDiv({ cls: "qiaomu-crop-controls" });
    controls.createSpan({ cls: "qiaomu-crop-label", text: "缩放" });
    this.zoom = controls.createEl("input", { cls: "qiaomu-crop-zoom", attr: { type: "range", min: "1", max: String(MAX_ZOOM), step: "0.01", value: "1" } });
    setName(this.zoom, "缩放");
    this.zoom.addEventListener("input", () => this.zoomAround(Number(this.zoom.value) * this.floor(), this.frameWidth / 2, this.frameHeight / 2));
    if (this.movableShare) this.createShareControls(el);
    this.info = el.createDiv({ cls: "qiaomu-crop-info" });
    const actions = el.createDiv({ cls: "qiaomu-wechat-actions qiaomu-crop-actions" });
    actions.createEl("button", { text: "重置" }).addEventListener("click", () => {
      this.setSharePosition(0.5);
      if (this.bitmap) this.apply(centeredView(this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight));
    });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    this.confirmButton = actions.createEl("button", { text: "使用这个裁切", cls: "mod-cta" });
    this.confirmButton.disabled = true;
    this.confirmButton.addEventListener("click", () => this.confirm());
    this.bindGestures();
    void this.load();
  }
  private createShareControls(el: HTMLElement): void {
    const row = el.createDiv({ cls: "qiaomu-crop-share-row" });
    const side = row.createDiv({ cls: "qiaomu-crop-share-side" });
    const controls = side.createDiv({ cls: "qiaomu-crop-controls" });
    controls.createSpan({ cls: "qiaomu-crop-label", text: "方图位置" });
    this.shareSlider = controls.createEl("input", { cls: "qiaomu-crop-share-position", attr: { type: "range", min: "0", max: "100", step: "0.1", value: String(this.sharePosition * 100) } });
    setName(this.shareSlider, "分享方图位置：左侧到右侧");
    const slider = this.shareSlider;
    slider.addEventListener("input", () => this.setSharePosition(Number(slider.value) / 100));
    controls.createEl("button", { text: "居中", attr: { type: "button" } }).addEventListener("click", () => this.setSharePosition(0.5));
    side.createDiv({ cls: "qiaomu-crop-share-help", text: "也可聚焦虚线框，用左右方向键微调；Home / End 移至两端。" });
    const preview = row.createDiv({ cls: "qiaomu-crop-share-preview" });
    this.shareCanvas = preview.createEl("canvas", { attr: { width: "96", height: "96", role: "img", "aria-label": "分享方图实时预览" } });
    preview.createDiv({ text: "分享方图预览" });
    this.setSharePosition(this.sharePosition);
  }
  private floor(): number { return this.bitmap ? minScale(this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight) : 1; }
  private async load(): Promise<void> {
    try {
      const bitmap = await decodeSource(this.source);
      if (this.closed) { bitmap.close(); return; }
      this.bitmap = bitmap;
      this.url = URL.createObjectURL(new Blob([this.source.data], { type: this.source.mime }));
      this.image.src = this.url;
      await this.image.decode().catch(() => {});
      if (this.closed) return;
      this.frameWidth = this.frame.clientWidth;
      this.frameHeight = this.frame.clientHeight;
      const { width, height } = bitmap;
      this.image.setCssProps({ "--qiaomu-img-w": `${width}px`, "--qiaomu-img-h": `${height}px` });
      this.apply(this.current ? viewFromCrop(clampCrop(this.current, width, height), this.frameWidth) : centeredView(width, height, this.frameWidth, this.frameHeight));
      this.confirmButton.disabled = false;
      const Resize = this.frame.ownerDocument.defaultView?.ResizeObserver;
      if (Resize) {
        this.observer = new Resize(() => {
          const width = this.frame.clientWidth, height = this.frame.clientHeight;
          if (!width || !height || width === this.frameWidth && height === this.frameHeight) return;
          const factor = width / this.frameWidth;
          this.frameWidth = width;
          this.frameHeight = height;
          this.apply({ scale: this.view.scale * factor, offsetX: this.view.offsetX * factor, offsetY: this.view.offsetY * factor });
        });
        this.observer.observe(this.frame);
      }
    } catch (error) {
      if (!this.closed) this.info.setText(`无法读取这张图片：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private apply(view: CropView): void {
    if (!this.bitmap || !this.frameWidth || !this.frameHeight) return;
    this.view = clampView(view, this.bitmap.width, this.bitmap.height, this.frameWidth, this.frameHeight);
    this.image.setCssProps({ "--qiaomu-x": `${this.view.offsetX}px`, "--qiaomu-y": `${this.view.offsetY}px`, "--qiaomu-s": String(this.view.scale) });
    this.zoom.value = String(this.view.scale / this.floor());
    const crop = cropFromView(this.view, this.frameWidth, this.frameHeight), warning = crop.width < this.spec.width * 0.95;
    this.info.setText(`原图 ${this.bitmap.width}×${this.bitmap.height}，输出 ${this.spec.width}×${this.spec.height}。${warning ? `选区只有 ${Math.round(crop.width)} 像素宽，放大后会有点糊，可以缩小一点。` : ""}`);
    this.info.toggleClass("is-warning", warning);
    this.renderSharePreview();
  }
  private setSharePosition(value: number): void {
    this.sharePosition = clampSharePosition(value);
    if (!this.movableShare || !this.safe) return;
    const width = Math.min(1, this.spec.safe!.ratio / this.spec.ratio);
    this.safe.style.left = `${(1 - width) * this.sharePosition * 100}%`;
    this.safe.setAttribute("aria-valuenow", String(Math.round(this.sharePosition * 1000) / 10));
    this.safe.setAttribute("aria-valuetext", this.sharePosition === 0.5 ? "居中" : `${Math.round(this.sharePosition * 100)}%，从左到右`);
    if (this.shareSlider) this.shareSlider.value = String(this.sharePosition * 100);
    this.renderSharePreview();
  }
  private renderSharePreview(): void {
    if (!this.shareCanvas || !this.bitmap || !this.frameWidth || !this.frameHeight) return;
    const ctx = this.shareCanvas.getContext("2d");
    if (!ctx) return;
    const crop = cropFromView(this.view, this.frameWidth, this.frameHeight);
    const [x1, y1, x2, y2] = wechatSquareCrop(this.sharePosition, this.spec.width, this.spec.height).split("_").map(Number) as [number, number, number, number];
    ctx.clearRect(0, 0, 96, 96);
    ctx.drawImage(this.bitmap, crop.x + crop.width * x1, crop.y + crop.height * y1, crop.width * (x2 - x1), crop.height * (y2 - y1), 0, 0, 96, 96);
  }
  private zoomAround(scale: number, x: number, y: number): void {
    if (!this.bitmap) return;
    const factor = scale / this.view.scale;
    this.apply({ scale, offsetX: x - (x - this.view.offsetX) * factor, offsetY: y - (y - this.view.offsetY) * factor });
  }
  private bindGestures(): void {
    let drag: { id: number; share: boolean; x: number; y: number; ox: number; oy: number; position: number } | null = null;
    this.frame.addEventListener("pointerdown", event => {
      if (drag || event.button !== 0 || !this.bitmap) return;
      const share = this.movableShare && !!this.safe?.contains(event.target as Node);
      drag = { id: event.pointerId, share, x: event.clientX, y: event.clientY, ox: this.view.offsetX, oy: this.view.offsetY, position: this.sharePosition };
      this.frame.setPointerCapture(event.pointerId);
      this.frame.addClass(share ? "is-share-dragging" : "is-dragging");
      if (share) this.safe?.focus({ preventScroll: true });
      else this.frame.focus({ preventScroll: true });
      event.preventDefault();
    });
    this.frame.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.share) {
        const travel = this.frameWidth * (1 - Math.min(1, this.spec.safe!.ratio / this.spec.ratio));
        if (travel > 0) this.setSharePosition(drag.position + (event.clientX - drag.x) / travel);
      } else this.apply({ ...this.view, offsetX: drag.ox + event.clientX - drag.x, offsetY: drag.oy + event.clientY - drag.y });
    });
    const end = (event: PointerEvent) => {
      if (drag && event.pointerId !== drag.id) return;
      drag = null;
      this.frame.removeClass("is-dragging", "is-share-dragging");
    };
    this.frame.addEventListener("pointerup", end);
    this.frame.addEventListener("pointercancel", end);
    this.frame.addEventListener("lostpointercapture", end);
    this.frame.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = this.frame.getBoundingClientRect();
      this.zoomAround(this.view.scale * Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    this.frame.addEventListener("keydown", event => {
      if (this.movableShare && event.target === this.safe) {
        const step = event.shiftKey ? 0.1 : 0.01;
        const moves: Record<string, number> = { ArrowLeft: this.sharePosition - step, ArrowRight: this.sharePosition + step, Home: 0, End: 1 };
        const next = moves[event.key];
        if (next !== undefined) { event.preventDefault(); event.stopPropagation(); this.setSharePosition(next); return; }
        if (event.key.startsWith("Arrow")) { event.preventDefault(); return; }
      }
      const step = event.shiftKey ? 40 : 12;
      const shifts: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const shift = shifts[event.key];
      if (shift) { event.preventDefault(); this.apply({ ...this.view, offsetX: this.view.offsetX + shift[0], offsetY: this.view.offsetY + shift[1] }); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); this.zoomAround(this.view.scale * 1.1, this.frameWidth / 2, this.frameHeight / 2); }
      else if (event.key === "-") { event.preventDefault(); this.zoomAround(this.view.scale / 1.1, this.frameWidth / 2, this.frameHeight / 2); }
    });
  }
  private confirm(): void {
    if (!this.bitmap || this.confirmButton.disabled) return;
    this.done = true;
    const crop = cropFromView(this.view, this.frameWidth, this.frameHeight), center = autoCrop(this.bitmap.width, this.bitmap.height, this.spec);
    const automatic = Math.abs(crop.x - center.x) < 1 && Math.abs(crop.y - center.y) < 1 && Math.abs(crop.width - center.width) < 1;
    this.resolve({ crop: automatic ? null : clampCrop(crop, this.bitmap.width, this.bitmap.height), ...(this.movableShare ? { sharePosition: this.sharePosition } : {}) });
    this.close();
  }
  override onClose(): void {
    this.closed = true;
    if (!this.done) this.resolve(null);
    this.observer?.disconnect();
    this.bitmap?.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.contentEl.empty();
  }
}
