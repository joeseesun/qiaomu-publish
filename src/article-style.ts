import { codeThemeCss, getCodeTheme } from "./code-highlight";
import { DEFAULT_WECHAT_EXPORT_THEME_CONFIG, getWechatExportTheme, themeAccents, WECHAT_EXPORT_BUILTIN_THEMES, type WechatExportTheme } from "./themes";
import { CODE_THEMES } from "./code-highlight";
import type { WechatArticleAppearance, WechatArticleStyle, WechatFontFamily, WechatPublishSettings } from "./types";

export const ARTICLE_STYLE_LIMITS = {
  fontSize: { min: 13, max: 20, step: 0.5, fallback: 16 },
  lineHeight: { min: 1.4, max: 2.2, step: 0.05, fallback: 1.8 },
  paragraphSpacing: { min: 0, max: 40, step: 1, fallback: 16 },
  pagePadding: { min: 0, max: 24, step: 1, fallback: 8 },
} as const;

export type NumericStyleKey = keyof typeof ARTICLE_STYLE_LIMITS;
export const BOOLEAN_STYLE_KEYS = ["justify", "indent", "macCode", "codeLineNumbers", "linkFootnotes", "imageCaptions"] as const;
export type BooleanStyleKey = typeof BOOLEAN_STYLE_KEYS[number];
/** What an unset option means, so the UI can show it without storing it. */
export const BOOLEAN_STYLE_DEFAULTS: Record<BooleanStyleKey, boolean> = { justify: true, indent: false, macCode: true, codeLineNumbers: true, linkFootnotes: false, imageCaptions: true };
export const FONT_FAMILIES: Record<WechatFontFamily, { name: string; stack: string }> = {
  sans: { name: "无衬线", stack: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif' },
  serif: { name: "衬线", stack: '"Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif' },
  mono: { name: "等宽", stack: '"SFMono-Regular", Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace' },
};
export const MAX_CUSTOM_CSS = 8000;

export function normalizeArticleStyle(raw: unknown): WechatArticleStyle {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const style: WechatArticleStyle = {};
  if (typeof data.primaryColor === "string" && /^#[0-9a-f]{6}$/i.test(data.primaryColor)) style.primaryColor = data.primaryColor.toLowerCase();
  if (typeof data.fontFamily === "string" && Object.hasOwn(FONT_FAMILIES, data.fontFamily)) style.fontFamily = data.fontFamily as WechatFontFamily;
  if (typeof data.codeTheme === "string" && CODE_THEMES.some((item) => item.id === data.codeTheme)) style.codeTheme = data.codeTheme;
  for (const key of BOOLEAN_STYLE_KEYS) if (typeof data[key] === "boolean") style[key] = data[key];
  if (typeof data.customCss === "string" && data.customCss.trim()) style.customCss = data.customCss.slice(0, MAX_CUSTOM_CSS);
  for (const key of Object.keys(ARTICLE_STYLE_LIMITS) as NumericStyleKey[]) {
    const value = data[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const { min, max } = ARTICLE_STYLE_LIMITS[key];
    style[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
  }
  return style;
}

export function normalizeNoteStyles(raw: unknown): Record<string, WechatArticleAppearance> {
  const result: Record<string, WechatArticleAppearance> = Object.create(null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [path, value] of Object.entries(raw)) {
    if (!path.endsWith(".md") || !value || typeof value !== "object") continue;
    const appearance = value as Partial<WechatArticleAppearance>;
    if (!WECHAT_EXPORT_BUILTIN_THEMES.some((theme) => theme.id === appearance.themeId)) continue;
    result[path] = { themeId: appearance.themeId!, style: normalizeArticleStyle(appearance.style) };
  }
  return result;
}

export function resolveArticleAppearance(settings: WechatPublishSettings, path: string, frontmatter: Record<string, unknown> = {}): WechatArticleAppearance {
  const saved = settings.noteStyles[path];
  if (saved) return { themeId: saved.themeId, style: { ...saved.style } };
  const field = [frontmatter.wechat_theme, frontmatter["公众号主题"]].find((value) => typeof value === "string");
  const themeId = WECHAT_EXPORT_BUILTIN_THEMES.some((theme) => theme.id === field) ? field as string : settings.themeId;
  return { themeId: getWechatExportTheme(DEFAULT_WECHAT_EXPORT_THEME_CONFIG, themeId)!.id, style: { ...settings.articleStyle } };
}

/** Applied after the theme/compatibility layer, then inlined for preview, copy and drafts alike. */
export function buildArticleStyleCss(raw?: WechatArticleStyle): string {
  const style = normalizeArticleStyle(raw);
  const rules: string[] = [];
  if (style.fontSize !== undefined) rules.push(`
    .wechat-export-content, .wechat-export-content p, .wechat-export-content li,
    .wechat-export-content .wechat-list-item { font-size: ${style.fontSize}px !important; }
  `);
  if (style.lineHeight !== undefined) rules.push(`
    .wechat-export-content, .wechat-export-content p, .wechat-export-content li,
    .wechat-export-content .wechat-list-item { line-height: ${style.lineHeight} !important; }
  `);
  if (style.paragraphSpacing !== undefined) rules.push(`
    .wechat-export-content p { margin-top: 0 !important; margin-bottom: ${style.paragraphSpacing}px !important; }
    .wechat-export-content > p:last-child { margin-bottom: 0 !important; }
  `);
  if (style.pagePadding !== undefined) rules.push(`
    .wechat-export-article { padding-left: ${style.pagePadding}px !important; padding-right: ${style.pagePadding}px !important; }
  `);
  if (style.fontFamily) {
    const stack = FONT_FAMILIES[style.fontFamily].stack;
    rules.push(`
    .wechat-export-content, .wechat-export-content p, .wechat-export-content li, .wechat-export-content .wechat-list-item,
    .wechat-export-content h1, .wechat-export-content h2, .wechat-export-content h3, .wechat-export-content h4,
    .wechat-export-content blockquote, .wechat-export-content td, .wechat-export-content th { font-family: ${stack} !important; }
  `);
  }
  if (style.justify !== false) rules.push(`.wechat-export-content > p, .wechat-export-content li, .wechat-export-content .wechat-list-item { text-align: justify !important; text-align-last: left !important; }`);
  if (style.indent) rules.push(`.wechat-export-content > p { text-indent: 2em !important; }`);
  rules.push(codeThemeCss(getCodeTheme(style.codeTheme)));
  if (style.customCss) rules.push(style.customCss.replace(/<\/?style[^>]*>/gi, ""));
  return rules.join("\n");
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.length === 4 ? hex.replace(/[^#]/g, (char) => char + char) : hex;
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${a.map((channel, index) => Math.round(channel * (1 - amount) + b[index]! * amount).toString(16).padStart(2, "0")).join("")}`;
}

/** Swaps the theme's accent (and a tinted version of its soft background) for the user's colour. */
export function applyPrimaryColor(css: string, theme: WechatExportTheme, primary: string | undefined): string {
  if (!primary) return css;
  const { accents, soft } = themeAccents(theme);
  let result = css;
  for (const accent of accents) result = result.replace(new RegExp(accent, "gi"), primary);
  if (soft) result = result.replace(new RegExp(soft, "gi"), mixHex(soft, primary, 0.14));
  return result;
}
