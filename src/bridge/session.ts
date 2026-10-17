import { BridgeHandler } from "./handler";
import { BridgeServer } from "./server";
import { landingUrl, type BridgeJob, type BridgeStatus } from "./protocol";

/** How long to wait for the extension to pick the job up before concluding it is not there. */
export const PICKUP_TIMEOUT_MS = 45_000;
/** Longest silence tolerated once the extension has started (uploads and the editor can be slow). */
export const IDLE_TIMEOUT_MS = 180_000;

export interface BridgeRun {
  /** Resolves with the final status; never rejects. */
  done: Promise<BridgeStatus>;
  /** URL that was opened, so it can be copied when the wrong browser took it. */
  url: string;
  cancel(): void;
}

export interface BridgeRunOptions {
  job: BridgeJob;
  readAsset(id: string): Promise<{ data: ArrayBuffer; mime: string } | null>;
  open(url: string): void;
  onStatus(status: BridgeStatus): void;
  pickupTimeoutMs?: number;
  idleTimeoutMs?: number;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function startBridgeRun(options: BridgeRunOptions): Promise<BridgeRun> {
  const server = new BridgeServer();
  const token = randomToken();
  const session = randomToken();
  let settle!: (status: BridgeStatus) => void;
  const done = new Promise<BridgeStatus>((resolve) => { settle = resolve; });
  let finished = false;
  let timer = 0;

  const finish = (status: BridgeStatus) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    server.stop();
    settle(status);
  };
  const arm = (ms: number, error: BridgeStatus["error"]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => finish({ state: "error", error }), ms);
  };

  const handler = new BridgeHandler({
    job: options.job,
    token,
    session,
    port: () => server.port,
    readAsset: options.readAsset,
    hooks: {
      onFetched: () => arm(options.idleTimeoutMs ?? IDLE_TIMEOUT_MS, { code: "idle", message: "浏览器长时间没有响应" }),
      onStatus: (status) => {
        options.onStatus(status);
        if (status.state !== "running") finish(status);
      },
    },
  });

  const port = await server.start(handler, () => { if (!finished && handler.isFetched) arm(options.idleTimeoutMs ?? IDLE_TIMEOUT_MS, { code: "idle", message: "浏览器长时间没有响应" }); });
  const url = landingUrl(options.job.target, port, token);
  arm(options.pickupTimeoutMs ?? PICKUP_TIMEOUT_MS, { code: "no-extension", message: "没有检测到乔木 Clipper 扩展来取这篇文章" });
  options.open(url);

  return {
    done,
    url,
    cancel: () => { handler.requestCancel(); window.setTimeout(() => finish({ state: "cancelled", text: "已停止" }), 4000); },
  };
}
