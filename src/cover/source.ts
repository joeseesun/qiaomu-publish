/** A picture before it is cut: the original bytes, so cropping can be redone without losing quality. */
export interface CoverSource {
  data: ArrayBuffer;
  mime: string;
  name: string;
  /** Where it came from, shown to the person ("电脑文件", "笔记图片", "笔记属性 cover"). */
  origin: string;
}

export interface CoverCandidate {
  id: string;
  label: string;
  load(): Promise<CoverSource>;
}

export const MAX_COVER_SOURCE_BYTES = 40 * 1024 * 1024;

export async function decodeSource(source: CoverSource): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([source.data], { type: source.mime }));
}

const EXTENSION_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp" };

export function mimeOfFile(file: File): string {
  if (file.type.startsWith("image/")) return file.type;
  return EXTENSION_MIME[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

/** Opens the system file dialog (works on desktop and mobile) and resolves with the chosen picture, or null when cancelled. */
export function chooseImageFile(doc: Document = activeDocument): Promise<CoverSource | null> {
  return new Promise((resolve, reject) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const mime = mimeOfFile(file);
      if (!mime) { reject(new Error("这不是图片文件")); return; }
      if (file.size > MAX_COVER_SOURCE_BYTES) { reject(new Error("图片超过 40MB，请先压缩")); return; }
      void file.arrayBuffer().then((data) => resolve({ data, mime, name: file.name, origin: "电脑文件" }), reject);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
