import { describe, expect, it } from "vitest";
import { CARD_TEMPLATES, cardPalette, cardTemplate, paletteSwatch, titleSizeFor } from "../src/external/card-styles";
import { COVER_FONTS } from "../src/title-cover";
import { normalizeExternalSettings, normalizeSettings } from "../src/defaults";

describe("card gallery", () => {
  it("gives every template unique ids, a known default font and colours", () => {
    expect(new Set(CARD_TEMPLATES.map((template) => template.id)).size).toBe(CARD_TEMPLATES.length);
    for (const template of CARD_TEMPLATES) {
      expect(Object.hasOwn(COVER_FONTS, template.font)).toBe(true);
      expect(template.palettes.length).toBeGreaterThan(2);
      expect(new Set(template.palettes.map((palette) => palette.id)).size).toBe(template.palettes.length);
      expect(template.css()).toContain(`.t-${template.id}`);
    }
  });

  it("shows palettes that share a background by their accent", () => {
    const dark = cardTemplate("dark");
    const swatches = dark.palettes.map(paletteSwatch);
    expect(new Set(swatches).size).toBe(dark.palettes.length);
    expect(new Set(dark.palettes.map((palette) => palette.bg)).size).toBeGreaterThan(5);
    expect(paletteSwatch(cardTemplate("gradient").palettes[0]!)).toContain("linear-gradient(135deg,#ffb199");
  });

  it("offers 朱雀仿宋 as a font preset", () => {
    expect(COVER_FONTS.zhuque?.name).toBe("朱雀仿宋");
    expect(COVER_FONTS.zhuque?.stack).toContain("Zhuque Fangsong");
  });

  it("falls back to the first template and colour for unknown ids", () => {
    expect(cardTemplate("nope").id).toBe(CARD_TEMPLATES[0]!.id);
    expect(cardPalette(cardTemplate("dark"), "nope").id).toBe(cardTemplate("dark").palettes[0]!.id);
  });

  it("steps the title size down as it gets longer", () => {
    const sizes = ["短", "六个字的标题", "十个字的标题就是这个", "十六个字的标题就是这样这么长了", "这是一个超过二十四个字的非常非常长的标题，需要缩得更小才能放下去"].map((title) => titleSizeFor(title, 150));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(sizes[0]).toBe(150);
    expect(sizes.at(-1)!).toBeGreaterThanOrEqual(72);
  });
});

describe("card settings", () => {
  it("defaults to the clean template", () => {
    expect(normalizeSettings(null).external).toEqual({ cardTemplate: "clean", cardPalette: "white", cardFont: "", cardPagination: "flow", dismissedTips: [] });
  });

  it("carries the earlier light / dark / paper choice over", () => {
    expect(normalizeExternalSettings({ cardTheme: "dark" })).toMatchObject({ cardTemplate: "dark", cardPalette: "green" });
    expect(normalizeExternalSettings({ cardTheme: "paper" })).toMatchObject({ cardTemplate: "magazine", cardPalette: "paper" });
  });

  it("keeps a valid choice and repairs an invalid one", () => {
    expect(normalizeExternalSettings({ cardTemplate: "poem", cardPalette: "moon", cardFont: "kai", cardPagination: "h2" })).toEqual({ cardTemplate: "poem", cardPalette: "moon", cardFont: "kai", cardPagination: "h2", dismissedTips: [] });
    expect(normalizeExternalSettings({ cardTemplate: "poem", cardPalette: "missing" }).cardPalette).toBe("xuan");
    expect(normalizeExternalSettings({ cardTemplate: 5, cardFont: 7 })).toMatchObject({ cardTemplate: "clean", cardFont: "" });
  });
});
