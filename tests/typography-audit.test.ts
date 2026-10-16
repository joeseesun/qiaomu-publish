// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { contrastRatio, WECHAT_EXPORT_BUILTIN_THEMES } from "../src/themes";

/** Every declaration value for `property` inside rules whose selector matches `selector`. */
function declared(css: string, selector: RegExp, property: string): string[] {
  const values: string[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1]!.split(",").some((part) => selector.test(part.trim()))) continue;
    for (const declaration of rule[2]!.matchAll(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`, "gi"))) values.push(declaration[1]!.trim());
  }
  return values;
}
const last = (values: string[]) => values[values.length - 1];
const hex = (value?: string) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : null;

describe("built-in themes follow WeChat reading conventions", () => {
  for (const theme of WECHAT_EXPORT_BUILTIN_THEMES.filter((item) => item.css)) {
    describe(theme.name, () => {
      const background = hex(last(declared(theme.css, /^\.wechat-export-article$/, "background")))!;
      it("has a flat page colour to measure against", () => expect(background).toBeTruthy());

      it("keeps body text, links and emphasis legible", () => {
        const body = hex(last(declared(theme.css, /^\.wechat-export-content$/, "color")))!;
        expect(contrastRatio(body, background)).toBeGreaterThanOrEqual(7);
        for (const selector of [/^\.wechat-export-content a$/, /^\.wechat-export-content strong$/]) {
          const color = hex(last(declared(theme.css, selector, "color")));
          if (color) expect(contrastRatio(color, background), `${selector}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("keeps heading colours legible on their own backgrounds", () => {
        for (const [level, minimum] of [["h2", 3], ["h3", 4.5]] as const) {
          for (const rule of theme.css.matchAll(new RegExp(`\\.wechat-export-content ${level}\\s*\\{([^}]*)\\}`, "g"))) {
            const color = hex(/(?:^|[;\s])color:\s*(#[0-9a-f]{6})/i.exec(rule[1]!)?.[1]);
            const own = hex(/background:\s*(#[0-9a-f]{6})/i.exec(rule[1]!)?.[1]) ?? background;
            if (color) expect(contrastRatio(color, own), `${level} ${color} on ${own}`).toBeGreaterThanOrEqual(minimum);
          }
        }
      });

      it("uses mobile-sized type and system fonts only", () => {
        for (const size of declared(theme.css, /^\.wechat-export-content$|^\.wechat-export-content > p$/, "font-size")) expect(Number.parseFloat(size)).toBeGreaterThanOrEqual(15), expect(Number.parseFloat(size)).toBeLessThanOrEqual(17);
        for (const size of declared(theme.css, /^\.wechat-export-title$/, "font-size")) expect(Number.parseFloat(size)).toBeLessThanOrEqual(22);
        for (const spacing of declared(theme.css, /^\.wechat-export-content$|^\.wechat-export-content > p$/, "line-height")) expect(Number(spacing)).toBeGreaterThanOrEqual(1.75), expect(Number(spacing)).toBeLessThanOrEqual(2);
        const families = declared(theme.css, /^\.wechat-export-content$|^\.wechat-export-title$/, "font-family").join(",");
        expect(families).not.toMatch(/Circular|Geist|Inter|Linear|Notion|sohne|Cereal|Metro|Formular|Futura|FerrariSans|LamboType|SST|ShopifySans|SoDoSans|Manuka|PolySans/);
        expect(families).toMatch(/PingFang SC|Songti SC/);
      });

      it("does not stack large side padding on top of WeChat's own margin", () => {
        const padding = last(declared(theme.css, /^\.wechat-export-article$/, "padding"))!.split(/\s+/);
        const side = Number.parseFloat(padding.length === 1 ? padding[0]! : padding[1]!);
        expect(side).toBeLessThanOrEqual(14);
      });
    });
  }
});
