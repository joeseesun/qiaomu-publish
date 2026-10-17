import type { PublishTargetId } from "../bridge/protocol";

export const XHS_TITLE_MAX = 20;
export const XHS_TEXT_MAX = 1000;
export const XHS_IMAGES_MAX = 18;
export const ZHIHU_TITLE_MAX = 100;
/** X Articles get unreliable past this many pictures, tables and charts; the Clipper engine enforces the same ceiling. */
export const X_MEDIA_SOFT_LIMIT = 25;

export const IMAGE_LIMITS: Record<PublishTargetId, { maxBytes: number; maxEdge: number }> = {
  x: { maxBytes: 15 * 1024 * 1024, maxEdge: 4096 },
  zhihu: { maxBytes: 20 * 1024 * 1024, maxEdge: 4096 },
  xhs: { maxBytes: 8 * 1024 * 1024, maxEdge: 4096 },
};

export interface ExternalCheck { level: "error" | "warning" | "info"; message: string; fix: string }

/** Counts Chinese characters the way the platforms do: one per character, topics included as `#话题`. */
export function textLength(text: string): number { return Array.from(text).length; }

export function normalizeTopics(values: readonly string[], max = 5): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const value of values) {
    const topic = value.replace(/^#+/, "").split("/").pop()?.trim().replace(/\s+/g, "") ?? "";
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
    if (topics.length >= max) break;
  }
  return topics;
}

export function xhsBodyLength(text: string, topics: readonly string[]): number {
  return textLength(text) + topics.reduce((sum, topic) => sum + textLength(topic) + 2, 0);
}

/** Characters left for the body once the topics are counted. */
export function xhsTextBudget(topics: readonly string[]): number {
  return Math.max(0, XHS_TEXT_MAX - topics.reduce((sum, topic) => sum + textLength(topic) + 2, 0));
}

/** Cuts text to `limit` characters, preferring the end of a sentence or line in the last part of the allowance; adds … only when it had to cut mid-sentence. */
export function truncateText(text: string, limit: number): { text: string; truncated: boolean } {
  const chars = Array.from(text);
  if (chars.length <= limit) return { text, truncated: false };
  const head = chars.slice(0, Math.max(0, limit));
  let cut = -1;
  for (let i = head.length - 1; i >= Math.floor(head.length * 0.6); i--) if ("。！？!?；\n".includes(head[i]!)) { cut = i + 1; break; }
  if (cut > 0) return { text: head.slice(0, cut).join("").trimEnd(), truncated: true };
  return { text: `${head.slice(0, Math.max(0, limit - 1)).join("").trimEnd()}…`, truncated: true };
}

export function checkXhs(input: { title: string; text: string; topics: string[]; cards: number }): ExternalCheck[] {
  const checks: ExternalCheck[] = [];
  const title = textLength(input.title.trim());
  if (!title) checks.push({ level: "error", message: "还没有标题", fix: "在上面填写标题" });
  else if (title > XHS_TITLE_MAX) checks.push({ level: "error", message: `标题 ${title} 字，小红书最多 ${XHS_TITLE_MAX} 字`, fix: "缩短标题" });
  const body = xhsBodyLength(input.text, input.topics);
  if (!input.text.trim()) checks.push({ level: "warning", message: "正文是空的，只会发布图片", fix: "在上面的正文框里写几句" });
  else if (body > XHS_TEXT_MAX) checks.push({ level: "error", message: `正文含话题 ${body} 字，小红书最多 ${XHS_TEXT_MAX} 字`, fix: "在上面的正文框里删减" });
  if (input.cards < 1) checks.push({ level: "error", message: "至少要留 1 张图", fix: "恢复被删掉的图片" });
  if (input.cards > XHS_IMAGES_MAX) checks.push({ level: "error", message: `共 ${input.cards} 张图，小红书最多 ${XHS_IMAGES_MAX} 张`, fix: "用 --- 合并分页，或删减内容" });
  return checks;
}

export function checkZhihu(input: { title: string }): ExternalCheck[] {
  const title = textLength(input.title.trim());
  if (!title) return [{ level: "error", message: "还没有标题", fix: "在上面填写标题" }];
  if (title > ZHIHU_TITLE_MAX) return [{ level: "error", message: `标题 ${title} 字，知乎最多 ${ZHIHU_TITLE_MAX} 字`, fix: "缩短标题" }];
  return [];
}

export function checkX(input: { title: string; media: number }): ExternalCheck[] {
  const checks: ExternalCheck[] = [];
  if (!input.title.trim()) checks.push({ level: "warning", message: "还没有标题，X 里需要补上才能发布", fix: "在上面填写标题" });
  if (input.media > X_MEDIA_SOFT_LIMIT) checks.push({ level: "error", message: `图片、表格和图表共 ${input.media} 项，超过 X 文章稳妥的 ${X_MEDIA_SOFT_LIMIT} 项`, fix: "删减后再发" });
  return checks;
}
