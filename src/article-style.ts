import { DEFAULT_WECHAT_EXPORT_THEME_CONFIG, getWechatExportTheme, WECHAT_EXPORT_BUILTIN_THEMES } from "./themes";
import type { WechatArticleAppearance, WechatArticleStyle, WechatPublishSettings } from "./types";

export const ARTICLE_STYLE_LIMITS = {
  fontSize: { min: 12, max: 24, step: 0.5, fallback: 17 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.05, fallback: 1.78 },
  paragraphSpacing: { min: 0, max: 40, step: 1, fallback: 16 },
  pagePadding: { min: 0, max: 32, step: 1, fallback: 3 },
} as const;

export function normalizeArticleStyle(raw: unknown): WechatArticleStyle {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const style: WechatArticleStyle = {};
  for (const key of Object.keys(ARTICLE_STYLE_LIMITS) as (keyof WechatArticleStyle)[]) {
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
  return rules.join("\n");
}
