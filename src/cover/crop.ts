import type { CoverSpec } from "./spec";

/** The part of the source picture that becomes the cover, in source pixels. */
export interface CropRect { x: number; y: number; width: number; height: number }

/** How the picture sits in the crop window: scale (window pixels per source pixel) and where its top-left corner is. */
export interface CropView { scale: number; offsetX: number; offsetY: number }

export const MAX_ZOOM = 4;

/** Smallest scale at which the picture still covers the whole window. */
export function minScale(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number): number {
  return Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
}

/** Keeps the picture covering the window: no empty edge can show. */
export function clampView(view: CropView, imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number): CropView {
  const floor = minScale(imageWidth, imageHeight, frameWidth, frameHeight);
  const scale = Math.min(Math.max(view.scale, floor), floor * MAX_ZOOM);
  const offsetX = Math.min(0, Math.max(frameWidth - imageWidth * scale, view.offsetX));
  const offsetY = Math.min(0, Math.max(frameHeight - imageHeight * scale, view.offsetY));
  return { scale, offsetX, offsetY };
}

/** The centred, largest crop of the given shape. */
export function centeredView(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number): CropView {
  const scale = minScale(imageWidth, imageHeight, frameWidth, frameHeight);
  return { scale, offsetX: (frameWidth - imageWidth * scale) / 2, offsetY: (frameHeight - imageHeight * scale) / 2 };
}

export function cropFromView(view: CropView, frameWidth: number, frameHeight: number): CropRect {
  return { x: -view.offsetX / view.scale, y: -view.offsetY / view.scale, width: frameWidth / view.scale, height: frameHeight / view.scale };
}

export function viewFromCrop(crop: CropRect, frameWidth: number): CropView {
  const scale = frameWidth / crop.width;
  return { scale, offsetX: -crop.x * scale, offsetY: -crop.y * scale };
}

/** Largest centred crop with the platform's ratio. */
export function autoCrop(imageWidth: number, imageHeight: number, spec: CoverSpec): CropRect {
  const width = Math.min(imageWidth, imageHeight * spec.ratio);
  const height = width / spec.ratio;
  return { x: (imageWidth - width) / 2, y: (imageHeight - height) / 2, width, height };
}

/** Pulls a crop back inside the picture (after the picture changed, or from a stale value). */
export function clampCrop(crop: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const width = Math.min(crop.width, imageWidth);
  const height = Math.min(crop.height, imageHeight);
  return { x: Math.min(Math.max(0, crop.x), imageWidth - width), y: Math.min(Math.max(0, crop.y), imageHeight - height), width, height };
}

export interface RenderedCover { data: ArrayBuffer; mime: "image/jpeg"; width: number; height: number; quality: number }

/** Cuts `crop` out of `source`, scales it to the platform size and encodes JPEG, lowering quality until it fits the platform's file limit. */
export async function renderCover(source: CanvasImageSource, crop: CropRect, spec: CoverSpec, doc: Document = activeDocument): Promise<RenderedCover> {
  const canvas = doc.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画布");
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  let quality = 0.92;
  for (;;) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("封面编码失败");
    if (blob.size <= spec.maxBytes || quality <= 0.5) return { data: await blob.arrayBuffer(), mime: "image/jpeg", width: spec.width, height: spec.height, quality };
    quality = Math.round((quality - 0.08) * 100) / 100;
  }
}
