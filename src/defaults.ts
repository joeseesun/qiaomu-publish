import type { ExternalPublishSettings, QiaomuPublishSettings, WechatPublishSettings } from "./types";
import { normalizeArticleStyle, normalizeNoteStyles } from "./article-style";
import { DEFAULT_COVER_STYLE, normalizeCoverStyle } from "./title-cover";
import { connectionSecretId, isSecretId } from "./secret-storage";
import { cardPalette, cardTemplate } from "./external/card-styles";

export const QIAOMU_RELAY_URL = "https://wx.qiaomu.ai";
export const QIAOMU_RELAY_EGRESS_IP = "207.148.115.69";
export const QIAOMU_RELAY_CODE = "qiaomu";

export const DEFAULT_SETTINGS: QiaomuPublishSettings = {
  schemaVersion: 1,
  wechat: {
    bridgeUrl: "",
    secretId: "qiaomu-publish-wechat-bridge-token",
    defaultAccountId: "",
    themeId: "qiaomu-podcast",
    articleStyle: {},
    noteStyles: {},
    cover: DEFAULT_COVER_STYLE,
    author: "",
    openComment: true,
    recordInNote: true,
    connections: [],
  },
  external: { cardTemplate: "clean", cardPalette: "white", cardFont: "", cardPagination: "flow", dismissedTips: [] },
};

export function normalizeSettings(raw: unknown): QiaomuPublishSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<QiaomuPublishSettings>) : {};
  return { schemaVersion: 1, wechat: normalizeWechatSettings(data.wechat), external: normalizeExternalSettings(data.external) };
}

export function normalizeExternalSettings(raw: unknown): ExternalPublishSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<ExternalPublishSettings> & { cardTheme?: string }) : {};
  // Builds before the template gallery stored only light / dark / paper.
  const legacy = { light: ["clean", "white"], dark: ["dark", "green"], paper: ["magazine", "paper"] }[data.cardTheme ?? ""] ?? ["clean", "white"];
  const template = cardTemplate(typeof data.cardTemplate === "string" ? data.cardTemplate : legacy[0]);
  const palette = cardPalette(template, typeof data.cardPalette === "string" ? data.cardPalette : legacy[1]);
  return {
    cardTemplate: template.id,
    cardPalette: palette.id,
    cardFont: typeof data.cardFont === "string" && data.cardFont.length <= 80 ? data.cardFont.trim() : "",
    cardPagination: data.cardPagination === "h2" ? "h2" : "flow",
    dismissedTips: Array.isArray(data.dismissedTips) ? data.dismissedTips.filter((id): id is string => id === "x" || id === "zhihu" || id === "xhs") : [],
  };
}

export function normalizeWechatSettings(raw: unknown): WechatPublishSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<WechatPublishSettings>) : {};
  const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const defaults = DEFAULT_SETTINGS.wechat;
  return {
    bridgeUrl: text(data.bridgeUrl, defaults.bridgeUrl).trim(),
    secretId: text(data.secretId, defaults.secretId) || defaults.secretId,
    defaultAccountId: text(data.defaultAccountId, defaults.defaultAccountId),
    themeId: text(data.themeId, defaults.themeId) || defaults.themeId,
    articleStyle: normalizeArticleStyle(data.articleStyle),
    noteStyles: normalizeNoteStyles(data.noteStyles),
    cover: normalizeCoverStyle(data.cover),
    author: text(data.author, defaults.author),
    openComment: flag(data.openComment, defaults.openComment),
    recordInNote: flag(data.recordInNote, defaults.recordInNote),
    connections: Array.isArray(data.connections) ? data.connections.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && (item.mode === "direct" || item.mode === "relay") && typeof item.appId === "string" && typeof item.appSecretId === "string").map((item) => ({
      id: item.id,
      name: item.name,
      mode: item.mode,
      appId: item.appId,
      appSecretId: isSecretId(item.appSecretId) ? item.appSecretId : connectionSecretId(item.id),
      relayUrl: typeof item.relayUrl === "string" ? item.relayUrl : "",
      inviteSecretId: isSecretId(item.inviteSecretId) ? item.inviteSecretId : "",
    })) : [],
  };
}

/**
 * Publishing used to live inside Qiaomu Agent. Its `wechat` block is taken over once, as is:
 * the SecretStorage ids stay the same, so saved AppSecrets and tokens keep working.
 */
export function legacyAgentSettings(raw: unknown): QiaomuPublishSettings | null {
  const wechat = raw && typeof raw === "object" ? (raw as { wechat?: unknown }).wechat : undefined;
  if (!wechat || typeof wechat !== "object") return null;
  const settings = normalizeSettings({ wechat });
  const touched = settings.wechat.connections.length > 0 || settings.wechat.bridgeUrl || settings.wechat.defaultAccountId || settings.wechat.author || settings.wechat.themeId !== DEFAULT_SETTINGS.wechat.themeId;
  return touched ? settings : null;
}
