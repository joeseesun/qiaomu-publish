/** Horizontal position inside the space left over after taking a share square. */
export function clampSharePosition(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/**
 * WeChat's 1:1 crop coordinates, relative to the final uploaded cover, not the
 * original bitmap or the crop window. Each coordinate has at most six decimals.
 */
export function wechatSquareCrop(position: number | undefined, width: number = 900, height: number = 383): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError("Cover dimensions must be positive and finite");
  const side = Math.min(width, height);
  const left = (width - side) * clampSharePosition(position) / width;
  const top = (height - side) / 2 / height;
  return [left, top, left + side / width, top + side / height]
    .map((value) => String(Number(value.toFixed(6))))
    .join("_");
}
