import { createServer, type Server } from "node:http";
import axiosStatic from "axios";
import { setupCache } from "axios-cache-interceptor";
import axiosCacheStorage, { PolystoreAxiosCacheStorage } from "./index.js";

// A tiny server that counts hits and supports ETag revalidation.
const makeServer = () => {
  let hits = 0;
  let revalidations = 0;
  const etag = '"v1"';
  const server = createServer((req, res) => {
    if (req.headers["if-none-match"] === etag) {
      revalidations++;
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    hits++;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=1",
      ETag: etag,
    });
    res.end(JSON.stringify({ value: "hello", hits }));
  });
  return {
    server,
    listen: () =>
      new Promise<string>((resolve) =>
        server.listen(0, () => {
          const addr = server.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          resolve(`http://127.0.0.1:${port}`);
        }),
      ),
    close: () => new Promise<void>((r) => server.close(() => r())),
    get hits() {
      return hits;
    },
    get revalidations() {
      return revalidations;
    },
  };
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("axios-cache-interceptor integration", () => {
  let svc: ReturnType<typeof makeServer>;
  let base: string;

  beforeEach(async () => {
    svc = makeServer();
    base = await svc.listen();
  });

  afterEach(async () => {
    await svc.close();
  });

  const makeClient = (storage: PolystoreAxiosCacheStorage) =>
    setupCache(axiosStatic.create(), { storage });

  it("serves the second request from cache (no network hit)", async () => {
    const http = makeClient(axiosCacheStorage(new Map()));

    const r1 = await http.get(`${base}/data`);
    const r2 = await http.get(`${base}/data`);

    expect(r1.cached).toBe(false);
    expect(r2.cached).toBe(true);
    expect(r2.data).toEqual(r1.data);
    expect(svc.hits).toBe(1); // only one real network hit
  });

  it("revalidates with ETag (304) instead of refetching after expiry", async () => {
    const http = makeClient(axiosCacheStorage(new Map()));

    await http.get(`${base}/data`); // hit #1, cached with max-age=1
    await delay(1100); // let it go stale
    const r2 = await http.get(`${base}/data`); // should revalidate, not refetch

    expect(svc.hits).toBe(1); // no second full fetch
    expect(svc.revalidations).toBe(1); // a conditional 304 happened
    expect(r2.data).toEqual({ value: "hello", hits: 1 });
  });

  it("persists the cache across separate axios instances on a shared store", async () => {
    const store = new Map();
    const httpA = makeClient(axiosCacheStorage(store));
    const httpB = makeClient(axiosCacheStorage(store));

    const r1 = await httpA.get(`${base}/data`);
    const r2 = await httpB.get(`${base}/data`);

    expect(r1.cached).toBe(false);
    expect(r2.cached).toBe(true);
    expect(svc.hits).toBe(1);
  });

  it("isolates caches by prefix", async () => {
    const store = new Map();
    const httpA = makeClient(axiosCacheStorage(store).prefix("a:"));
    const httpB = makeClient(axiosCacheStorage(store).prefix("b:"));

    await httpA.get(`${base}/data`); // hit #1
    const r2 = await httpB.get(`${base}/data`); // different prefix → miss → hit #2

    expect(r2.cached).toBe(false);
    expect(svc.hits).toBe(2);
  });

  it("removes a cached entry on demand", async () => {
    const storage = axiosCacheStorage(new Map());
    const http = makeClient(storage);

    const r1 = await http.get(`${base}/data`);
    await storage.remove(r1.id);
    const r2 = await http.get(`${base}/data`);

    expect(r2.cached).toBe(false);
    expect(svc.hits).toBe(2);
  });
});
