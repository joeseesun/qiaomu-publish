import { requestUrl, type App } from "obsidian";
import { imageMime } from "./publisher";
import type { ArticleImage } from "./render-note";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

/** The exact article HTML used by preview and draft, with local images embedded as data URLs. */
export async function embedWechatImages(app: App, html: string, images: ArticleImage[], includeRemote = false): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const remote = new Map<string, string>();
  if (includeRemote) {
    for (const image of Array.from(doc.querySelectorAll("img[src]"))) {
      const src = image.getAttribute("src") ?? "";
      if (!/^https?:\/\//i.test(src)) continue;
      if (!remote.has(src)) {
        const response = await requestUrl({ url: src, throw: false });
        const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (response.status !== 200 || !/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type) || !response.arrayBuffer.byteLength || response.arrayBuffer.byteLength > 20 * 1024 * 1024) throw new Error("远程图片无法导出，请将图片保存为笔记附件后重试");
        remote.set(src, await blobToDataUrl(new Blob([response.arrayBuffer], { type })));
      }
      image.setAttribute("src", remote.get(src)!);
    }
  }
  for (const image of Array.from(doc.querySelectorAll("img[data-qm-image]"))) {
    const source = images.find((item) => item.id === image.getAttribute("data-qm-image"));
    if (source?.kind === "generated") image.setAttribute("src", await blobToDataUrl(source.blob));
    if (source?.kind === "vault") image.setAttribute("src", await blobToDataUrl(new Blob([await app.vault.readBinary(source.file)], { type: imageMime(source.file.name) ?? "image/png" })));
    image.removeAttribute("data-qm-image");
  }
  return doc.body.innerHTML;
}

/** Copy the exact article HTML used by both preview and draft, with local images embedded. */
export async function copyWechatHtml(app: App, html: string, images: ArticleImage[]): Promise<void> {
  const embedded = await embedWechatImages(app, html, images);
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([embedded], { type: "text/html" }),
    "text/plain": new Blob([new DOMParser().parseFromString(embedded, "text/html").body.textContent ?? ""], { type: "text/plain" }),
  })]);
}
