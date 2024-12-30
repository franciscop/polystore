// This is an example server implementation of the HTTP library!
import http from "node:http";
import kv from "./index.js";

// Add/remove the key whether you want the API to be behind a key
const key = null;
// const key = 'MY-SECRET-KEY';

// Modify this to use any sub-store as desired. It's nice
// to use polystore itself for the polystore server library!'
const store = kv(new Map());

// Some reply helpers
const notFound = () => new Response(null, { status: 404 });
const sendJson = (data, status = 200) => {
  const body = JSON.stringify(data);
  const headers = { "content-type": "application/json" };
  return new Response(body, { status, headers });
};

async function fetch({ method, url, body }) {
  method = method.toLowerCase();
  url = new URL(url);
  let [, id] = url.pathname.split("/");
  id = decodeURIComponent(id);
  const expires = Number(url.searchParams.get("expires")) || null;
  const prefix = url.searchParams.get("prefix") || null;

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
    if (!data) return notFound();
    await local.set(id, data, { expires });
    return sendJson(id);
  }

  if (method === "delete" && id) {
    await local.del(id);
    return sendJson(id);
  }

  return notFound();
}

// http or express server-like handler:
async function server(req, res) {
  // Secure it behind a key (optional)
  if (key && req.headers.get("x-api-key") !== key) return res.send(401);

  const url = new URL(req.url, "http://localhost:3000/").href;
  const reply = await fetch({ ...req, url });
  res.writeHead(reply.status, null, reply.headers || {});
  if (reply.body) res.write(reply.body);
  res.end();
}

function start(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(server);
    server.on("clientError", (error, socket) => {
      reject(error);
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });
    server.listen(port, resolve);
    return () => server.close();
  });
}

export { fetch, server, start };
export default { fetch, server, start };
