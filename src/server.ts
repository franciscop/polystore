// This is an example server implementation of the HTTP library!
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import kv from "./index";

// Add/remove the key whether you want the API to be behind a key
const key: string | null = null;
// const key = 'MY-SECRET-KEY';

// Modify this to use any sub-store as desired. It's nice
// to use polystore itself for the polystore server library!'
const store = kv(new Map());

// Some reply helpers
const notFound = (): Response => new Response(null, { status: 404 });
const sendJson = (data: any, status = 200): Response => {
  const body = JSON.stringify(data);
  const headers = { "content-type": "application/json" };
  return new Response(body, { status, headers });
};

interface FetchRequest {
  method: string;
  url: string;
  body?: ReadableStream | null;
}

async function fetch({ method, url, body }: FetchRequest): Promise<Response> {
  method = method.toLowerCase();
  const urlObj = new URL(url);
  let [, id] = urlObj.pathname.split("/");
  id = decodeURIComponent(id);
  const expires = Number(urlObj.searchParams.get("expires")) || null;
  const prefix = urlObj.searchParams.get("prefix") || null;

  let local = store;
  if (prefix) local = store.prefix(prefix);

  if (method === "get") {
    if (id === "ping") return new Response(null, { status: 200 });
    if (!id) return sendJson(await local.all());
    const data = await local.get(id);
    if (data === null) return notFound();
    return sendJson(data);
  }

  if (method === "put") {
    if (!id) return notFound();
    const data = await new Response(body).json();
    if (data === undefined) return notFound();
    await local.set(id, data, expires);
    return sendJson(id);
  }

  if (method === "delete" && id) {
    await local.del(id);
    return sendJson(id);
  }

  return notFound();
}

// http or express server-like handler:
async function server(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Secure it behind a key (optional)
  if (key && (req as any).headers.get("x-api-key") !== key) {
    res.writeHead(401);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:3000/").href;
  const reply = await fetch({ method: req.method || "GET", url });
  res.writeHead(reply.status, (reply.headers as any) || {});
  if (reply.body) {
    const reader = reply.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

function start(port = 3000): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(server);
    httpServer.on("clientError", (error, socket) => {
      reject(error);
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });
    httpServer.listen(port, () => resolve(() => httpServer.close()));
  });
}

export { fetch, server, start };
export default { fetch, server, start };
