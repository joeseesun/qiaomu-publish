import type { QiaomuPublishSettings, WechatPublishSettings } from "./types";

export const QIAOMU_RELAY_URL = "https://wx.qiaomu.ai";

export const DEFAULT_SETTINGS: QiaomuPublishSettings = {
  schemaVersion: 1,
  wechat: {
    bridgeUrl: "",
    secretId: "qiaomu-publish-wechat-bridge-token",
    defaultAccountId: "",
    themeId: "qiaomu-podcast",
    author: "",
    openComment: true,
    recordInNote: true,
    connections: [],
  },
};

export function normalizeSettings(raw: unknown): QiaomuPublishSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<QiaomuPublishSettings>) : {};
  return { schemaVersion: 1, wechat: normalizeWechatSettings(data.wechat) };
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
    author: text(data.author, defaults.author),
    openComment: flag(data.openComment, defaults.openComment),
    recordInNote: flag(data.recordInNote, defaults.recordInNote),
    connections: Array.isArray(data.connections) ? data.connections.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && (item.mode === "direct" || item.mode === "relay") && typeof item.appId === "string" && typeof item.appSecretId === "string").map((item) => ({
      id: item.id,
      name: item.name,
      mode: item.mode,
      appId: item.appId,
      appSecretId: item.appSecretId,
      relayUrl: typeof item.relayUrl === "string" ? item.relayUrl : "",
      inviteSecretId: typeof item.inviteSecretId === "string" ? item.inviteSecretId : "",
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
