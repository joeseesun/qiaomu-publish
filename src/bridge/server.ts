import { Platform } from "obsidian";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { BridgeHandler } from "./handler";

const MAX_BODY_BYTES = 64 * 1024;

type NodeRequire = (id: string) => unknown;

function nodeRequire(): NodeRequire | null {
  const candidate = (window as unknown as { require?: NodeRequire }).require;
  return typeof candidate === "function" ? candidate : null;
}

/** The loopback hand-off needs Node's http module, which only the desktop app has; mobile never loads it. */
export function bridgeAvailable(): boolean {
  return Platform.isDesktopApp && nodeRequire() !== null;
}

/**
 * A tiny HTTP listener bound to 127.0.0.1 on a random port. It exists for one job and is closed as soon as
 * the job ends, so nothing keeps listening while the person is simply writing notes.
 */
export class BridgeServer {
  private server: Server | null = null;
  private currentPort = 0;

  get port(): number { return this.currentPort; }

  async start(handler: BridgeHandler, onActivity: () => void): Promise<number> {
    const require = nodeRequire();
    if (!require || !Platform.isDesktopApp) throw new Error("发布到浏览器需要桌面版 Obsidian");
    const http = require("http") as typeof import("node:http");
    const server = http.createServer((request, response) => { onActivity(); void this.serve(handler, request, response); });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("无法启动本机交接服务");
    this.currentPort = address.port;
    return this.currentPort;
  }

  stop(): void {
    const server = this.server;
    this.server = null;
    if (!server) return;
    // Stop accepting at once, but let the reply that triggered the shutdown reach the extension before dropping connections.
    server.close();
    window.setTimeout(() => server.closeAllConnections?.(), 400);
  }

  private async serve(handler: BridgeHandler, request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { response.writeHead(413).end(); request.destroy(); return; }
        chunks.push(chunk);
      }
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(request.headers)) headers[name] = Array.isArray(value) ? value.join(", ") : value;
      const reply = await handler.handle({ method: request.method ?? "GET", path: request.url ?? "/", headers, body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(reply.status, reply.headers);
      response.end(typeof reply.body === "string" ? reply.body : Buffer.from(reply.body));
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  }
}
