import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, legacyAgentSettings, normalizeSettings } from "../src/defaults";

describe("settings", () => {
  it("falls back to defaults for empty or malformed data", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ wechat: { connections: [{ id: 1 }], openComment: "yes" } }).wechat).toEqual(DEFAULT_SETTINGS.wechat);
  });

  it("takes over configured publishing settings from Qiaomu Agent with the same secret ids", () => {
    const imported = legacyAgentSettings({
      providers: [],
      wechat: {
        bridgeUrl: "https://bridge.example.com",
        secretId: "qiaomu-agent-wechat-bridge-token",
        defaultAccountId: "direct:1",
        connections: [{ id: "direct:1", name: "测试号", mode: "direct", appId: "wx1", appSecretId: "qiaomu-wechat-secret-direct:1" }],
      },
    });
    expect(imported?.wechat.secretId).toBe("qiaomu-agent-wechat-bridge-token");
    expect(imported?.wechat.connections[0]?.appSecretId).toBe("qiaomu-wechat-secret-direct:1");
    expect(imported?.wechat.themeId).toBe(DEFAULT_SETTINGS.wechat.themeId);
  });

  it("ignores an Agent install that never configured publishing", () => {
    expect(legacyAgentSettings({ providers: [] })).toBeNull();
    expect(legacyAgentSettings({ wechat: { ...DEFAULT_SETTINGS.wechat, secretId: "qiaomu-agent-wechat-bridge-token" } })).toBeNull();
  });
});
