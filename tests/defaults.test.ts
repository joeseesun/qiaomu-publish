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
        connections: [{ id: "direct:1", name: "测试号", mode: "direct", appId: "wx1", appSecretId: "qiaomu-wechat-secret-direct-1" }],
      },
    });
    expect(imported?.wechat.secretId).toBe("qiaomu-agent-wechat-bridge-token");
    expect(imported?.wechat.connections[0]?.appSecretId).toBe("qiaomu-wechat-secret-direct-1");
    expect(imported?.wechat.themeId).toBe(DEFAULT_SETTINGS.wechat.themeId);
  });

  it("ignores an Agent install that never configured publishing", () => {
    expect(legacyAgentSettings({ providers: [] })).toBeNull();
    expect(legacyAgentSettings({ wechat: { ...DEFAULT_SETTINGS.wechat, secretId: "qiaomu-agent-wechat-bridge-token" } })).toBeNull();
  });

  it("repairs unsavable colon IDs while retaining account identity and valid existing secrets", () => {
    const connections = [
      { id: "relay:12345678-1234-1234-1234-123456789012", name: "失败的连接", mode: "relay", appId: "wx1", appSecretId: "qiaomu-wechat-secret-relay:12345678-1234-1234-1234-123456789012", inviteSecretId: "" },
      { id: "direct:legacy", name: "已有连接", mode: "direct", appId: "wx2", appSecretId: "my-existing-secret", inviteSecretId: "my-existing-invite" },
    ];
    const settings = normalizeSettings({ wechat: { connections } });
    expect(settings.wechat.connections[0]?.id).toBe(connections[0]?.id);
    expect(settings.wechat.connections[0]?.appSecretId).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(settings.wechat.connections[1]?.appSecretId).toBe("my-existing-secret");
    expect(settings.wechat.connections[1]?.inviteSecretId).toBe("my-existing-invite");
    expect(normalizeSettings(settings)).toEqual(settings);
  });
});
