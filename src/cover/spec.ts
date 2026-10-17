/** Cover shapes per platform. Output sizes are what the picture is cut to before it is uploaded, so no platform has to crop it again. */
export type CoverPlatform = "wechat" | "x" | "zhihu";

export interface CoverSpec {
  id: CoverPlatform;
  label: string;
  /** Width / height. */
  ratio: number;
  width: number;
  height: number;
  maxBytes: number;
  /** One line shown under the cover: what size it is and why. */
  note: string;
  /** Area that stays visible when the platform crops again (list thumbnails, share cards); drawn as a dashed guide in the crop window. */
  safe?: { ratio: number; label: string };
}

export const COVER_SPECS: Record<CoverPlatform, CoverSpec> = {
  wechat: {
    id: "wechat", label: "公众号封面", ratio: 900 / 383, width: 900, height: 383, maxBytes: 2 * 1024 * 1024,
    note: "公众号头条封面 900×383（2.35:1）。朋友圈和列表会再取中间一块正方形，主体放在中间。",
    safe: { ratio: 1, label: "虚线框：分享和列表只显示这一块" },
  },
  x: {
    id: "x", label: "X 文章封面", ratio: 5 / 2, width: 1500, height: 600, maxBytes: 5 * 1024 * 1024,
    note: "X 没有公布官方尺寸。这里裁成 5:2（1500×600）；社区实测文章页会居中再收窄成更扁的一条，主体放在中间。",
    safe: { ratio: 5.2, label: "虚线框：文章页可能只显示这一条" },
  },
  zhihu: {
    id: "zhihu", label: "知乎题图", ratio: 690 / 280, width: 1380, height: 560, maxBytes: 5 * 1024 * 1024,
    note: "知乎题图建议 690×280，这里按 2 倍清晰度裁成 1380×560。列表页会再裁小，主体放在中间。",
    safe: { ratio: 1, label: "虚线框：列表缩略图只显示这一块" },
  },
};

export const RATIO_TOLERANCE = 0.02;

/** True when a picture is already (within 2%) the shape the platform wants, so it needs no cropping window. */
export function matchesRatio(width: number, height: number, spec: CoverSpec): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - spec.ratio) / spec.ratio <= RATIO_TOLERANCE;
}
