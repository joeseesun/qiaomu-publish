import { BRIDGE_VERSION, type BridgeJob, type BridgeJobResponse, type BridgeStatus, type BridgeStatusResponse } from "./protocol";

/** What the HTTP layer hands over: no Node types, so the whole policy can be tested without a socket. */
export interface BridgeRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
}

export interface BridgeReply {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

export interface BridgeHooks {
  onFetched(): void;
  onStatus(status: BridgeStatus): void;
}

export interface BridgeSessionOptions {
  job: BridgeJob;
  /** Raw bytes by asset id, read lazily so a large article does not sit in memory twice. */
  readAsset(id: string): Promise<{ data: ArrayBuffer; mime: string } | null>;
  port: () => number;
  token: string;
  session: string;
  hooks: BridgeHooks;
}

const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//i;

const json = (status: number, value: unknown): BridgeReply => ({ status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(value) });
const fail = (status: number, code: string): BridgeReply => json(status, { error: code });

/** Constant-time comparison; the tokens are short-lived but the habit is free. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(headers: BridgeRequest["headers"]): string {
  const value = headers.authorization ?? "";
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

/**
 * One job, one handler. Rules, in the order they are checked:
 * 1. the Host header must be the loopback address with our port (blocks DNS rebinding);
 * 2. the Origin must be a browser extension, or absent. Ordinary web pages always send their own origin and are refused,
 *    and no CORS header is ever returned, so a page cannot read a response either;
 * 3. the job is handed out once, in exchange for the one-time token, together with a session token for everything else.
 */
export class BridgeHandler {
  private fetched = false;
  private cancelRequested = false;
  private finished = false;

  constructor(private readonly options: BridgeSessionOptions) {}

  requestCancel(): void { this.cancelRequested = true; }
  get isFinished(): boolean { return this.finished; }
  get isFetched(): boolean { return this.fetched; }

  async handle(request: BridgeRequest): Promise<BridgeReply> {
    const host = (request.headers.host ?? "").toLowerCase();
    const port = this.options.port();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return fail(403, "bad-host");
    const origin = request.headers.origin;
    if (origin !== undefined && !EXTENSION_ORIGIN.test(origin)) return fail(403, "bad-origin");
    if (request.method === "OPTIONS") return { status: 204, headers: {}, body: "" };

    const token = bearer(request.headers);
    const path = request.path.split("?")[0] ?? "";

    if (request.method === "GET" && path === "/v1/job") {
      if (!sameToken(token, this.options.token)) return fail(401, "bad-token");
      if (this.fetched) return fail(410, "already-fetched");
      this.fetched = true;
      this.options.hooks.onFetched();
      const body: BridgeJobResponse = { v: BRIDGE_VERSION, session: this.options.session, job: this.options.job };
      return json(200, body);
    }

    if (!this.fetched || !sameToken(token, this.options.session)) return fail(401, "bad-session");

    const asset = /^\/v1\/asset\/([\w-]+)$/.exec(path);
    if (request.method === "GET" && asset) {
      const found = await this.options.readAsset(asset[1]!);
      if (!found) return fail(404, "no-such-asset");
      return { status: 200, headers: { "content-type": found.mime, "cache-control": "no-store" }, body: new Uint8Array(found.data) };
    }

    if (request.method === "POST" && path === "/v1/status") {
      let status: BridgeStatus;
      try { status = JSON.parse(request.body) as BridgeStatus; } catch { return fail(400, "bad-json"); }
      if (!["running", "done", "error", "cancelled"].includes(status.state)) return fail(400, "bad-state");
      if (status.state !== "running") this.finished = true;
      this.options.hooks.onStatus(status);
      const reply: BridgeStatusResponse = { ok: true, cancel: this.cancelRequested };
      return json(200, reply);
    }

    return fail(404, "not-found");
  }
}
