import { describe, expect, it } from "vitest";
import { connectionSecretId, optionalSecret } from "../src/secret-storage";

describe("host secret naming", () => {
  it.each(["direct", "relay"])("accepts new %s connection secrets under the host's limits", (mode) => {
    const id = connectionSecretId(`${mode}:12345678-1234-1234-1234-123456789012`);
    expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it("gives long or non-ASCII imported account IDs distinct, stable valid names", () => {
    const ids = ["x".repeat(150), "x".repeat(149) + "y", "导入的公众号"];
    const keys = ids.map(connectionSecretId);
    expect(new Set(keys).size).toBe(ids.length);
    for (let i = 0; i < ids.length; i++) {
      expect(keys[i]).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(connectionSecretId(ids[i]!)).toBe(keys[i]);
    }
  });

  it("reads existing invite secrets and skips absent or invalid optional keys", () => {
    const reads: string[] = [];
    const app = { secretStorage: { getSecret: (id: string) => { reads.push(id); return "private-code"; } } } as never;
    expect(optionalSecret(app, "existing-invite")).toBe("private-code");
    for (const id of [undefined, "", "bad:key"]) expect(optionalSecret(app, id)).toBe("");
    expect(reads).toEqual(["existing-invite"]);
  });
});
