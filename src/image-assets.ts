import type { App } from "obsidian";
import type { ArticleImage } from "./render-note";
import { sizeSvg } from "./host-mermaid";
import { svgToPng } from "./rasterize";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml",
};

export function imageMime(name: string): string | null {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** File identity is scoped to one operation; no cross-account or persistent upload cache. */
export function imageKey(image: ArticleImage): string | Blob {
  return image.kind === "vault" ? image.file.path : image.kind === "generated" ? image.blob : image.url;
}

/** Local SVGs are rasterized as inert images, never inserted into the live document. */
export function prepareLocalSvg(text: string): ReturnType<typeof sizeSvg> {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("SVG 含有外部文档声明，请先导出为 PNG");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg" || doc.documentElement.namespaceURI !== "http://www.w3.org/2000/svg") throw new Error("SVG 文件无效，请先导出为 PNG");
  const localCss = (value: string) => !/[\\@]/.test(value) && !/url\s*\(/i.test(value.replace(/url\(\s*(['"]?)#[^\s)'"\\]+\1\s*\)/gi, ""));
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    if (/^(script|foreignObject|iframe|object|embed|animate.*|set)$/i.test(element.localName)) throw new Error("SVG 含有动态内容，请先导出为 PNG");
    if (element.localName === "style" && !localCss(element.textContent ?? "")) throw new Error("SVG 引用了外部样式，请先导出为 PNG");
    for (const attr of Array.from(element.attributes)) {
      if (/^on/i.test(attr.name)) throw new Error("SVG 含有动态内容，请先导出为 PNG");
      if (attr.localName === "href" && !/^(#|data:image\/(png|jpeg|gif|webp);base64,)/i.test(attr.value.trim())) throw new Error("SVG 引用了外部图片，请先导出为 PNG");
      if ((attr.name === "style" || /url\s*\(/i.test(attr.value)) && !localCss(attr.value)) throw new Error("SVG 引用了外部资源，请先导出为 PNG");
    }
  }
  const sized = sizeSvg(new XMLSerializer().serializeToString(doc.documentElement));
  const rootStyle = doc.documentElement.getAttribute("style");
  if (rootStyle) {
    const rasterDoc = new DOMParser().parseFromString(sized.svg, "image/svg+xml");
    rasterDoc.documentElement.setAttribute("style", rootStyle);
    sized.svg = new XMLSerializer().serializeToString(rasterDoc.documentElement);
  }
  if (![sized.width, sized.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("SVG 尺寸无效，请先导出为 PNG");
  return sized;
}

export async function readArticleImage(app: App, image: ArticleImage): Promise<{ data: ArrayBuffer; type: string; name: string }> {
  if (image.kind === "remote") throw new Error("远程图片需要通过公众号连接上传");
  const type = image.kind === "vault" ? imageMime(image.file.name) : image.blob.type || "image/png";
  if (!type) throw new Error(`公众号不支持的图片格式：${image.name}`);
  const data = image.kind === "vault" ? await app.vault.readBinary(image.file) : await image.blob.arrayBuffer();
  if (!data.byteLength || data.byteLength > 20 * 1024 * 1024) throw new Error(`图片为空或超过 20 MB：${image.name}`);
  if (type !== "image/svg+xml") return { data, type, name: image.name };
  try {
    const svg = prepareLocalSvg(new TextDecoder().decode(data));
    const raster = await svgToPng(svg.svg, svg.width, svg.height, "");
    return { data: await raster.blob.arrayBuffer(), type: "image/png", name: image.name.replace(/\.svg$/i, "") + ".png" };
  } catch (error) {
    throw new Error(`无法转换图片「${image.name}」：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function assertImageSources(html: string, images: ArticleImage[], errors: readonly string[] = []): void {
  if (errors.length) throw new Error(errors.join("\n"));
  const ids = new Set(images.map(image => image.id));
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const image of Array.from(doc.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    if (!ids.has(image.getAttribute("data-qm-image") ?? "") && !/^https?:\/\//i.test(src)) {
      throw new Error(`图片「${image.getAttribute("alt") || "未命名"}」尚未找到本地文件，请修正图片引用后重试。`);
    }
  }
}
