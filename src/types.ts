export interface QiaomuPublishSettings {
  schemaVersion: 1;
  wechat: WechatPublishSettings;
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
  author: string;
  openComment: boolean;
  /** Write wechat_media_id / wechat_draft_at back to the note after a draft is created. */
  recordInNote: boolean;
  /** User-owned accounts. The original server-owned bridge remains in bridgeUrl/secretId. */
  connections: WechatConnection[];
}

export interface WechatArticleStyle {
  fontSize?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  pagePadding?: number;
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
