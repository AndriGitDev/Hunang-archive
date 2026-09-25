import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Bridge between node:http and the Web `Request`/`Response` types the
 * handlers are written against. The local ingest service (docker-compose,
 * `npm run dev`) runs a plain Node server; production runs the same handlers
 * as Vercel functions, which already speak Web types. Keeping the bridge in
 * one place is what lets both share a single implementation.
 */

type WebHandler = (request: Request, clientIp: string) => Promise<Response>;

export function clientIpFrom(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Client IP as seen through a trusted reverse proxy. Only ever call this
 * where the platform guarantees the header (Vercel overwrites
 * x-forwarded-for at the edge); trusting it on an arbitrary listener would
 * let a caller spoof its own rate-limit bucket.
 */
export function clientIpFromHeaders(headers: Headers, fallback = "unknown"): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return fallback;
  const first = forwarded.split(",")[0]?.trim();
  return first || fallback;
}

export async function serveWithNodeHttp(
  handler: WebHandler,
  req: IncomingMessage,
  res: ServerResponse,
  clientIp: string,
): Promise<void> {
  try {
    const request = await toWebRequest(req);
    const response = await handler(request, clientIp);
    await writeWebResponse(response, res, req.method === "HEAD");
  } catch {
    if (!res.headersSent) {
      const body = JSON.stringify({ error: "internal" });
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      res.end(body);
    } else {
      res.destroy();
    }
  }
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const hasBody = method !== "GET" && method !== "HEAD";
  if (!hasBody) return new Request(url, { method, headers });

  // Body is buffered rather than streamed: the handler caps it at 1 MB and
  // rejects anything larger, so there is no unbounded read here. The copy
  // into a plain Uint8Array is what makes a Node Buffer acceptable as a
  // Web BodyInit.
  const buffered = await readBody(req);
  return new Request(url, { method, headers, body: new Uint8Array(buffered) });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Hard ceiling well above the handler's own 1 MB limit; this only
      // exists so a hostile sender cannot exhaust memory before validation.
      if (size > 4_000_000) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function writeWebResponse(response: Response, res: ServerResponse, headOnly: boolean): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  headers["content-length"] = String(body.byteLength);
  res.writeHead(response.status, headers);
  if (headOnly) res.end();
  else res.end(body);
}
