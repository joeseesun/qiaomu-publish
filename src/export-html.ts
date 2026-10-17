import { buildWechatExportCss, type WechatExportStyleTokens } from "./export-style";
import { inlineCss } from "./inline-css";
import { buildWechatExportFragment, normalizeInlinedWechatHtml, normalizeWechatArticleDom, parseWechatArticleHtml } from "./normalize";
import { DEFAULT_WECHAT_EXPORT_THEME_CONFIG, getWechatExportTheme, WECHAT_EXPORT_BUILTIN_THEMES, type WechatExportTheme } from "./themes";
import { applyPrimaryColor, buildArticleStyleCss, normalizeArticleStyle } from "./article-style";
import type { WechatArticleStyle } from "./types";

/** The blog's light article palette (fallbacks of qmblog readWechatExportStyleTokens). */
export const WECHAT_STYLE_TOKENS: WechatExportStyleTokens = {
  background: "#f5f4ed",
  panelBackground: "#faf9f5",
  softBackground: "#e8e6dc",
  lineColor: "#f0eee6",
  inkColor: "#141413",
  mutedColor: "#5e5d59",
  accentColor: "#c96442",
  linkColor: "#c96442",
  codeBackground: "#faf9f5",
  codeBorderColor: "#e8e6dc",
  quoteBackground: "#faf9f5",
  articleHeadingColor: "#17120d",
  articleBodyColor: "#2b241c",
  articleQuoteColor: "#51473a",
  articleQuoteBorderColor: "#cdb796",
  articleQuoteNestedBorderColor: "#b8a68a",
  articleQuoteNestedBackground: "rgba(0, 0, 0, 0.02)",
  bodyFontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  monoFontFamily: '"SFMono-Regular", Consolas, monospace',
  titleFontFamily: '"Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
};

export function listWechatThemes(): WechatExportTheme[] {
  return WECHAT_EXPORT_BUILTIN_THEMES;
}

export function resolveWechatTheme(themeId?: string | null): WechatExportTheme {
  return getWechatExportTheme(DEFAULT_WECHAT_EXPORT_THEME_CONFIG, themeId) ?? WECHAT_EXPORT_BUILTIN_THEMES[0]!;
}

/** Article HTML → WeChat-ready HTML with every style inlined. `data-qm-image` markers are preserved. */
export function buildWechatHtml(articleHtml: string, theme: WechatExportTheme, baseUrl?: string, style?: WechatArticleStyle): string {
  const options = normalizeArticleStyle(style);
  const doc = parseWechatArticleHtml(articleHtml);
  normalizeWechatArticleDom(doc, { baseUrl, codeTheme: options.codeTheme, macCode: options.macCode, codeLineNumbers: options.codeLineNumbers, linkFootnotes: options.linkFootnotes, imageCaptions: options.imageCaptions });
  const fragmentDoc = new DOMParser().parseFromString(buildWechatExportFragment(doc.body.innerHTML), "text/html");
  const root = fragmentDoc.body.firstElementChild;
  if (!root) return "";
  const tokens = options.primaryColor ? { ...WECHAT_STYLE_TOKENS, accentColor: options.primaryColor, linkColor: options.primaryColor } : WECHAT_STYLE_TOKENS;
  inlineCss(root, `${applyPrimaryColor(buildWechatExportCss(tokens, theme), theme, options.primaryColor)}\n${buildArticleStyleCss(options)}`);
  return normalizeInlinedWechatHtml(root.outerHTML);
}

/** Replaces every local marker; an unresolved image must never reach a draft. */
export function finalizeWechatImages(html: string, sources: ReadonlyMap<string, string>): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const image of Array.from(doc.querySelectorAll("img"))) {
    const next = sources.get(image.getAttribute("data-qm-image") ?? "");
    if (next) image.setAttribute("src", next);
    if (!/^https?:\/\//i.test(image.getAttribute("src") ?? "")) throw new Error(`图片「${image.getAttribute("alt") || "未命名"}」尚未完成上传，请重试。`);
    image.removeAttribute("srcset");
    image.removeAttribute("data-qm-image");
  }
  return doc.body.innerHTML;
}
