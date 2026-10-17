import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../src/defaults";
import { COVER_BACKGROUNDS, coverInk, normalizeCoverStyle, wrapTitle } from "../src/title-cover";
import { contrastRatio } from "../src/themes";

const measure = (text: string) => Array.from(text).length * 50;

describe("generated title cover", () => {
  it("keeps only known backgrounds and fonts", () => {
    expect(normalizeCoverStyle({ background: "neon", font: "" })).toEqual({ background: "navy", font: "kai" });
    expect(normalizeCoverStyle(undefined)).toEqual({ background: "navy", font: "kai" });
    expect(normalizeCoverStyle({ background: "ocean", font: "kai" })).toEqual({ background: "ocean", font: "kai" });
    expect(normalizeCoverStyle({ background: "custom:#AABBCC", font: "Songti SC", size: 500, color: "red" })).toEqual({ background: "custom:#aabbcc", font: "Songti SC", size: 80 });
    expect(normalizeCoverStyle({ color: "#FFFFFF", size: 10 })).toEqual({ background: "navy", font: "kai", size: 28, color: "#ffffff" });
    expect(normalizeSettings({ wechat: { cover: { background: "ink" } } }).wechat.cover).toEqual({ background: "ink", font: "kai" });
  });

  it("picks readable ink for every background", () => {
    for (const background of COVER_BACKGROUNDS) {
      const ink = coverInk(background.colors);
      for (const color of background.colors) expect(contrastRatio(ink, color), background.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("wraps long titles into even lines instead of leaving an orphan", () => {
    const title = "从知识灌输到能力编排AI时代教育要重新回答什么";
    const lines = wrapTitle(title, measure, 640);
    expect(lines.join("")).toBe(title);
    expect(lines.length).toBe(2);
    expect(Math.abs(Array.from(lines[0]!).length - Array.from(lines[1]!).length)).toBeLessThanOrEqual(2);
    expect(wrapTitle("短标题", measure, 640)).toEqual(["短标题"]);
  });
});

describe("title cover at other platform sizes", () => {
  it("centres the title on the platform's own canvas", async () => {
    const { drawTitleCover } = await import("../src/title-cover");
    const calls: { x: number; y: number }[] = [];
    const context = { font: "", fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }), measureText: (text: string) => ({ width: text.length * 20 }), fillText: (_text: string, x: number, y: number) => calls.push({ x, y }) };
    drawTitleCover(context as never, "海报标题", { background: "navy", font: "sans" }, { width: 1500, height: 600 });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.x === 750 && call.y > 0 && call.y < 600)).toBe(true);
  });
});
