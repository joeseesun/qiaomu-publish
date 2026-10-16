import type { App } from "obsidian";

export function isSecretId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
}

/** Account IDs remain unchanged; only new/previously invalid storage keys use this name. */
export function connectionSecretId(connectionId: string): string {
  const candidate = `qiaomu-wechat-secret-${connectionId.replaceAll(":", "-")}`;
  if (isSecretId(candidate)) return candidate;
  // Stable naming for malformed/oversized imported IDs, not a credential hash.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(connectionId)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return `qiaomu-wechat-secret-${hash.toString(16).padStart(16, "0")}`;
}

export function optionalSecret(app: App, id: string | undefined): string {
  return isSecretId(id) ? app.secretStorage.getSecret(id) ?? "" : "";
}
