import { describe, expect, it } from "vitest";
import { autoCrop, centeredView, clampCrop, clampView, cropFromView, minScale, viewFromCrop } from "../src/cover/crop";
import { COVER_SPECS, matchesRatio } from "../src/cover/spec";

describe("cover specs", () => {
  it("lists the platform shapes", () => {
    expect(COVER_SPECS.wechat).toMatchObject({ width: 900, height: 383 });
    expect(COVER_SPECS.x).toMatchObject({ width: 1500, height: 600 });
    expect(COVER_SPECS.zhihu).toMatchObject({ width: 1380, height: 560 });
    for (const spec of Object.values(COVER_SPECS)) expect(Math.abs(spec.width / spec.height - spec.ratio) / spec.ratio).toBeLessThan(0.01);
  });

  it("accepts a picture that is already the right shape", () => {
    expect(matchesRatio(900, 383, COVER_SPECS.wechat)).toBe(true);
    expect(matchesRatio(1800, 766, COVER_SPECS.wechat)).toBe(true);
    expect(matchesRatio(1600, 900, COVER_SPECS.wechat)).toBe(false);
    expect(matchesRatio(0, 0, COVER_SPECS.wechat)).toBe(false);
  });
});

describe("crop geometry", () => {
  const spec = COVER_SPECS.wechat;

  it("auto-crops the largest centred rectangle of the right shape", () => {
    const wide = autoCrop(3000, 500, spec);
    expect(wide.height).toBeCloseTo(500 / 1, 0);
    expect(wide.width / wide.height).toBeCloseTo(spec.ratio, 3);
    expect(wide.x).toBeGreaterThanOrEqual(0);
    const tall = autoCrop(1000, 2000, spec);
    expect(tall.width).toBe(1000);
    expect(tall.y).toBeCloseTo((2000 - 1000 / spec.ratio) / 2, 3);
  });

  it("keeps the picture covering the window", () => {
    const frame = { w: 560, h: 238 };
    const view = clampView({ scale: 0.01, offsetX: 500, offsetY: 500 }, 2000, 1500, frame.w, frame.h);
    expect(view.scale).toBeCloseTo(minScale(2000, 1500, frame.w, frame.h), 6);
    expect(view.offsetX).toBeLessThanOrEqual(0);
    expect(view.offsetY).toBeLessThanOrEqual(0);
    expect(view.offsetX + 2000 * view.scale).toBeGreaterThanOrEqual(frame.w - 1e-6);
    expect(view.offsetY + 1500 * view.scale).toBeGreaterThanOrEqual(frame.h - 1e-6);
    expect(clampView({ scale: 100, offsetX: 0, offsetY: 0 }, 2000, 1500, frame.w, frame.h).scale).toBeCloseTo(view.scale * 4, 6);
  });

  it("round-trips between the window view and the source crop", () => {
    const view = centeredView(2000, 1500, 560, 238);
    const crop = cropFromView(view, 560, 238);
    expect(crop.width / crop.height).toBeCloseTo(560 / 238, 4);
    const again = viewFromCrop(crop, 560);
    expect(again.scale).toBeCloseTo(view.scale, 6);
    expect(again.offsetX).toBeCloseTo(view.offsetX, 4);
    expect(again.offsetY).toBeCloseTo(view.offsetY, 4);
  });

  it("pulls a stale crop back inside a new picture", () => {
    const crop = clampCrop({ x: 900, y: 900, width: 400, height: 170 }, 1000, 1000);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1000);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1000);
  });
});
