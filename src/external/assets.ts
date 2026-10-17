import { requestUrl, type App } from "obsidian";
import { imageMime } from "../publisher";
import type { ArticleImage } from "../render-note";
import type { BridgeAsset } from "../bridge/protocol";

export interface AssetData extends BridgeAsset { data: ArrayBuffer }

export interface ImageLimits {
  maxBytes: number;
  maxEdge: number;
}

const KEEP = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

function withExtension(name: string, mime: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || "image";
  return `${base}.${EXTENSION[mime] ?? "png"}`;
}

async function redraw(data: ArrayBuffer, mime: string, type: "image/png" | "image/jpeg", maxEdge: number): Promise<ArrayBuffer> {
  const blob = new Blob([data], { type: mime });
  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    image.src = url;
    await image.decode();
    const natural = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const ratio = Math.min(1, maxEdge / natural);
    const canvas = activeDocument.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 800) * ratio));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 600) * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建画布");
    if (type === "image/jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片编码失败")), type, 0.9));
    return await out.arrayBuffer();
  } finally { URL.revokeObjectURL(url); }
}

/** Formats a platform cannot take (SVG, BMP, AVIF) are redrawn as PNG; oversized pictures become smaller JPEGs. Animated GIFs pass untouched. */
export async function normalizeImage(data: ArrayBuffer, name: string, mime: string, limits: ImageLimits): Promise<{ data: ArrayBuffer; mime: string; name: string }> {
  let out = data;
  let type = mime.toLowerCase();
  if (!KEEP.has(type)) { out = await redraw(out, type, "image/png", limits.maxEdge); type = "image/png"; }
  if (out.byteLength > limits.maxBytes) { out = await redraw(out, type, "image/jpeg", Math.min(limits.maxEdge, 2800)); type = "image/jpeg"; }
  if (out.byteLength > limits.maxBytes) throw new Error(`图片「${name}」超过 ${Math.round(limits.maxBytes / 1048576)}MB，压缩后仍然太大`);
  return { data: out, mime: type, name: withExtension(name, type) };
}

const MAX_REMOTE_BYTES = 30 * 1024 * 1024;

export type ImageCache = Map<string, { data: ArrayBuffer; mime: string; name: string }>;

/** Stable key for pictures that can be read again (vault files, remote URLs); generated pictures (diagrams, formulas) have none. */
export function imageCacheKey(image: ArticleImage): string | null {
  if (image.kind === "vault") return `v:${image.file.path}:${image.file.stat.mtime}`;
  if (image.kind === "remote") return `r:${image.url}`;
  return null;
}

export async function loadArticleImage(app: App, image: ArticleImage, cache?: ImageCache): Promise<{ data: ArrayBuffer; mime: string; name: string }> {
  const key = cache ? imageCacheKey(image) : null;
  const hit = key ? cache!.get(key) : undefined;
  if (hit) return hit;
  const loaded = await readArticleImage(app, image);
  if (key) cache!.set(key, loaded);
  return loaded;
}

async function readArticleImage(app: App, image: ArticleImage): Promise<{ data: ArrayBuffer; mime: string; name: string }> {
  if (image.kind === "generated") return { data: await image.blob.arrayBuffer(), mime: image.blob.type || "image/png", name: image.name };
  if (image.kind === "vault") {
    const mime = imageMime(image.file.name);
    if (!mime) throw new Error(`不支持的图片格式：${image.file.name}`);
    return { data: await app.vault.readBinary(image.file), mime, name: image.file.name };
  }
  const response = await requestUrl({ url: image.url, throw: false });
  const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (response.status !== 200 || !type.startsWith("image/") || !response.arrayBuffer.byteLength || response.arrayBuffer.byteLength > MAX_REMOTE_BYTES) throw new Error(`远程图片无法读取：${image.url}`);
  return { data: response.arrayBuffer, mime: type, name: image.name };
}

/** Pictures by id, ready to be served to the extension. */
export class AssetBag {
  private readonly items = new Map<string, AssetData>();

  add(id: string, data: ArrayBuffer, mime: string, name: string): AssetData {
    const asset: AssetData = { id, name, mime, bytes: data.byteLength, data };
    this.items.set(id, asset);
    return asset;
  }

  get(id: string): AssetData | undefined { return this.items.get(id); }
  remove(id: string): void { this.items.delete(id); }
  list(): BridgeAsset[] { return Array.from(this.items.values(), ({ id, name, mime, bytes }) => ({ id, name, mime, bytes })); }
  get size(): number { return this.items.size; }
}
