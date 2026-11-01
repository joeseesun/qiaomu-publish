/** Source-file budget, separate from the final WeChat upload limits. */
export const MAX_IMAGE_SOURCE_BYTES = 50 * 1024 * 1024;
// Existing relay/Bridge deployments accept at most 20 MiB of binary input.
const MAX_RELAY_IMAGE_BYTES = 20 * 1024 * 1024;

export async function jpegFromImage(data: ArrayBuffer, type: string, maxBytes: number): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([data], { type }));
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("设备无法转换图片");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58, 0.44]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) return blob.arrayBuffer();
    }
    throw new Error("图片转换后仍超过微信大小限制，请压缩后重试");
  } finally { bitmap.close(); }
}

/** Keep existing server-side conversion for smaller files; normalize larger static sources locally. */
export async function prepareRelayImage(name: string, type: string, data: ArrayBuffer): Promise<{ name: string; type: string; data: ArrayBuffer }> {
  if (!data.byteLength || data.byteLength > MAX_IMAGE_SOURCE_BYTES) throw new Error("图片为空或超过 50 MB");
  if (data.byteLength <= MAX_RELAY_IMAGE_BYTES) return { name, type, data };
  if (type === "image/gif") throw new Error("GIF 超过中转的 20 MB 上限，请压缩动图后重试");
  return { name: name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data: await jpegFromImage(data, type, 1024 * 1024) };
}
