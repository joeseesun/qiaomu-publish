export interface QiaomuPublishSettings {
  schemaVersion: 1;
  wechat: WechatPublishSettings;
  /** X, Zhihu and Xiaohongshu drafts, written through the Qiaomu Clipper browser extension. */
  external: ExternalPublishSettings;
}

export interface ExternalPublishSettings {
  /** Xiaohongshu card look: template id, colour id inside it (falls back to the template's first), font (empty = the template's own) and pagination. */
  cardTemplate: string;
  cardPalette: string;
  cardFont: string;
  cardPagination: "flow" | "h2";
  /** Platforms whose one-line tip at the top of the publish window the person has closed. */
  dismissedTips: string[];
}

export interface WechatPublishSettings {
  /** qmblog WeChat bridge base URL; the bearer token lives in SecretStorage under `secretId`. */
  bridgeUrl: string;
  secretId: string;
  defaultAccountId: string;
  themeId: string;
  /** Default appearance and per-note choices live in this plugin, not in note content. */
  articleStyle: WechatArticleStyle;
  noteStyles: Record<string, WechatArticleAppearance>;
  /** Look of the cover generated for notes without an image. */
  cover: WechatCoverStyle;
  author: string;
  openComment: boolean;
  /** Write wechat_media_id / wechat_draft_at back to the note after a draft is created. */
  recordInNote: boolean;
  /** User-owned accounts. The original server-owned bridge remains in bridgeUrl/secretId. */
  connections: WechatConnection[];
}

export type WechatFontFamily = "sans" | "serif" | "mono";
/** Preset id ("sans" | "serif" | "kai") or the name of any font installed on this computer. */
export type WechatCoverFont = string;

export interface WechatCoverStyle {
  /** Background id from title-cover.ts, or `custom:#rrggbb`. */
  background: string;
  font: WechatCoverFont;
  /** Title size in px; absent fits the title automatically. */
  size?: number;
  /** Title colour (#rrggbb); absent picks black or white for contrast. */
  color?: string;
}

export interface WechatArticleStyle {
  fontSize?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  pagePadding?: number;
  /** Replaces the theme's accent colour (#rrggbb). */
  primaryColor?: string;
  fontFamily?: WechatFontFamily;
  justify?: boolean;
  indent?: boolean;
  /** Code block palette id from code-highlight.ts; absent keeps the theme's plain code block. */
  codeTheme?: string;
  macCode?: boolean;
  codeLineNumbers?: boolean;
  linkFootnotes?: boolean;
  imageCaptions?: boolean;
  /** Extra CSS appended after the theme; selectors start with `.wechat-export-content`. */
  customCss?: string;
}

export interface WechatArticleAppearance {
  themeId: string;
  style: WechatArticleStyle;
}

export interface WechatConnection {
  id: string;
  name: string;
  mode: "direct" | "relay";
  appId: string;
  /** Obsidian SecretStorage key. Never put the AppSecret into plugin data. */
  appSecretId: string;
  relayUrl?: string;
  inviteSecretId?: string;
}
