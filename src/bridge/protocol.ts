/**
 * Hand-off contract between this plugin and the Qiaomu Clipper browser extension (protocol v1).
 *
 * The plugin listens on 127.0.0.1 only while one job is running. It opens the platform's editor page with
 * `#qp=<port>.<token>` in the URL fragment (fragments are never sent to a server); the extension reads the fragment,
 * removes it from the address bar, exchanges the one-time token for the job and a session token, downloads the pictures
 * and writes the draft into the logged-in browser session. The extension is the only code that knows how a platform works.
 */
export const BRIDGE_VERSION = 1;

export type PublishTargetId = "x" | "zhihu" | "xhs" | "weibo" | "weibo-article";

export const TARGET_LANDING_URL: Record<PublishTargetId, string> = {
  x: "https://x.com/compose/articles",
  zhihu: "https://zhuanlan.zhihu.com/write",
  xhs: "https://creator.xiaohongshu.com/publish/publish?source=official&target=image",
  weibo: "https://weibo.com/",
  "weibo-article": "https://card.weibo.com/article/v5/editor",
};

export const TARGET_LABEL: Record<PublishTargetId, string> = { x: "X 文章", zhihu: "知乎", xhs: "小红书", weibo: "微博", "weibo-article": "微博长文" };

export interface BridgeAsset {
  id: string;
  name: string;
  mime: string;
  bytes: number;
}

export interface BridgeJobContent {
  /** X: Markdown whose images use `https://qm-image.local/<assetId>` addresses. */
  markdown?: string;
  /** Zhihu / Weibo article: article HTML whose images use `qp-asset://<assetId>`. */
  html?: string;
  /** Xiaohongshu / Weibo post: plain body text, without the topics. */
  text?: string;
  topics?: string[];
  /** Asset id of the cover (X / Zhihu / Weibo article). */
  cover?: string;
  /** Xiaohongshu: asset ids of the 3:4 cards, in order. */
  cards?: string[];
  /** Weibo post: asset ids of the attached images, in order (≤9). */
  images?: string[];
  summary?: string;
}

export interface BridgeJob {
  v: typeof BRIDGE_VERSION;
  id: string;
  target: PublishTargetId;
  title: string;
  noteName: string;
  content: BridgeJobContent;
  assets: BridgeAsset[];
}

export type BridgeState = "running" | "done" | "error" | "cancelled";

export interface BridgeStatus {
  state: BridgeState;
  text?: string;
  /** Where the draft lives, once the platform has accepted it. */
  url?: string;
  remoteId?: string;
  error?: { code?: string; message: string };
}

export interface BridgeJobResponse {
  v: typeof BRIDGE_VERSION;
  session: string;
  job: BridgeJob;
}

export interface BridgeStatusResponse {
  ok: true;
  /** True once the person pressed stop in the plugin. */
  cancel: boolean;
}

/** `#qp=` fragment that carries the port and the one-time token. */
export function landingUrl(target: PublishTargetId, port: number, token: string): string {
  return `${TARGET_LANDING_URL[target]}#qp=${port}.${token}`;
}
