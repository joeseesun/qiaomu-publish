import { describe, expect, it } from "vitest";
import { clampSharePosition, wechatSquareCrop } from "../src/cover/share-crop";

describe("WeChat share square coordinates", () => {
  it.each([
    [0, "0_0_0.425556_1"],
    [0.5, "0.287222_0_0.712778_1"],
    [1, "0.574444_0_1_1"],
  ])("maps position %s against the final 900×383 cover", (position, expected) => {
    expect(wechatSquareCrop(position, 900, 383)).toBe(expected);
  });

  it.each([undefined, NaN, Infinity, -Infinity])("defaults invalid position %s to the center", (value) => {
    expect(clampSharePosition(value)).toBe(0.5);
    expect(wechatSquareCrop(value)).toBe(wechatSquareCrop(0.5));
  });

  it("clamps movement to the two cover edges", () => {
    expect(clampSharePosition(-1)).toBe(0);
    expect(clampSharePosition(2)).toBe(1);
    expect(wechatSquareCrop(-1)).toBe(wechatSquareCrop(0));
    expect(wechatSquareCrop(2)).toBe(wechatSquareCrop(1));
  });

  it.each([0, 0.1, 0.333333333, 0.5, 0.9, 1])("keeps position %s square, bounded and within six decimal places", (position) => {
    const encoded = wechatSquareCrop(position, 900, 383);
    expect(encoded).toMatch(/^\d(?:\.\d{1,6})?_\d(?:\.\d{1,6})?_\d(?:\.\d{1,6})?_\d(?:\.\d{1,6})?$/);
    const [x1, y1, x2, y2] = encoded.split("_").map(Number) as [number, number, number, number];
    for (const coordinate of [x1, y1, x2, y2]) { expect(coordinate).toBeGreaterThanOrEqual(0); expect(coordinate).toBeLessThanOrEqual(1); }
    expect(Math.abs((x2 - x1) * 900 - (y2 - y1) * 383)).toBeLessThan(0.002);
  });

  it("uses output dimensions rather than the source image dimensions", () => {
    expect(wechatSquareCrop(0.25, 1800, 766)).toBe(wechatSquareCrop(0.25, 900, 383));
    expect(wechatSquareCrop(1, 400, 400)).toBe("0_0_1_1");
  });

  it.each([[0, 383], [900, 0], [-1, 383], [Infinity, 383], [900, NaN]])("rejects unusable output dimensions %s × %s", (width, height) => {
    expect(() => wechatSquareCrop(0.5, width, height)).toThrow(RangeError);
  });
});
