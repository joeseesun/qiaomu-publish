import { sanitizeHTMLToDom, type App } from "obsidian";
import { embedWechatImages } from "./copy-html";
import type { ArticleImage } from "./render-note";

const LONG_IMAGE_WIDTH = 677;
const MAX_CANVAS_EDGE = 16000;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = activeDocument.createElement("a");
  link.href = url;
  link.download = name;
  activeDocument.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "公众号文章";

/** A standalone page that keeps the inlined WeChat styles, so it opens the same anywhere. */
export async function exportHtmlFile(app: App, title: string, html: string, images: ArticleImage[], imageErrors: string[] = []): Promise<string> {
  const body = await embedWechatImages(app, html, images, true, imageErrors);
  const escaped = title.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
  const page = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title></head><body style="margin:0">\n${body}\n</body></html>\n`;
  const name = `${safeName(title)}.html`;
  download(new Blob([page], { type: "text/html" }), name);
  return name;
}

/** Lays the article out offscreen at WeChat width, then rasterizes it through an SVG foreignObject. */
export async function exportLongImage(app: App, title: string, html: string, images: ArticleImage[], imageErrors: string[] = []): Promise<{ name: string; reduced: boolean }> {
  const embedded = await embedWechatImages(app, html, images, true, imageErrors);
  const host = activeDocument.body.createDiv({ cls: "qiaomu-wechat-export-stage" });
  host.setCssProps({ "--qiaomu-export-width": `${LONG_IMAGE_WIDTH}px` });
  const stage = host.createDiv();
  stage.append(sanitizeHTMLToDom(embedded));
  const root = stage.querySelector<HTMLElement>(".wechat-export-root");
  const background = root ? getComputedStyle(root).backgroundColor : "#ffffff";
  let height: number;
  let serialized: string;
  try {
    await Promise.all(Array.from(stage.querySelectorAll("img")).map((image) => image.decode()));
    await host.ownerDocument.fonts.ready;
    height = Math.max(1, Math.ceil(stage.scrollHeight));
    serialized = new XMLSerializer().serializeToString(stage);
  } finally { host.remove(); }

  const scale = Math.min(2, MAX_CANVAS_EDGE / height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LONG_IMAGE_WIDTH}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = activeDocument.createElement("canvas");
  canvas.width = Math.ceil(LONG_IMAGE_WIDTH * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画布");
  context.fillStyle = background && background !== "rgba(0, 0, 0, 0)" ? background : "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片编码失败")), "image/png"));
  const name = `${safeName(title)}.png`;
  download(blob, name);
  return { name, reduced: scale < 1.5 };
}

/** Characters (CJK) plus words (Latin), and a reading time at ~400 characters a minute. */
export function articleStats(html: string): { words: number; minutes: number } {
  const text = (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s+/g, " ");
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length;
  const latin = (text.replace(/[㐀-鿿豈-﫿]/g, " ").match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const words = cjk + latin;
  return { words, minutes: Math.max(1, Math.round(words / 400)) };
}
