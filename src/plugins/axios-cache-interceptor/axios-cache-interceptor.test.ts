import axiosCacheStorage, { PolystoreAxiosCacheStorage } from "./index.js";

const cachedValue = (ttlMs = 60_000): any => ({
  state: "cached",
  data: { status: 200, statusText: "OK", data: { ok: true }, headers: {} },
  ttl: ttlMs,
  staleTtl: 0,
  createdAt: Date.now(),
});

const staleValue = (): any => ({
  state: "stale",
  data: { status: 200, statusText: "OK", data: { ok: true }, headers: {} },
  createdAt: Date.now(),
});

describe("axiosCacheStorage", () => {
  it("returns a PolystoreAxiosCacheStorage instance", () => {
    expect(axiosCacheStorage()).toBeInstanceOf(PolystoreAxiosCacheStorage);
  });

  it("accepts a custom store", () => {
    expect(axiosCacheStorage(new Map())).toBeInstanceOf(PolystoreAxiosCacheStorage);
  });

  it("get returns empty state for missing key", async () => {
    const s = axiosCacheStorage();
    expect((await s.get("missing")).state).toBe("empty");
  });

  it("set and get a cached value", async () => {
    const s = axiosCacheStorage();
    await s.set("key", cachedValue());
    expect((await s.get("key")).state).toBe("cached");
  });

  it("set and get a stale value", async () => {
    const s = axiosCacheStorage();
    await s.set("key", staleValue());
    expect((await s.get("key")).state).toBe("stale");
  });

  it("remove deletes a key", async () => {
    const s = axiosCacheStorage();
    await s.set("key", cachedValue());
    await s.remove("key");
    expect((await s.get("key")).state).toBe("empty");
  });

  it("remove is safe for missing keys", async () => {
    const s = axiosCacheStorage();
    await expect(s.remove("missing")).resolves.toBeDefined();
  });

  it("clear removes all entries", async () => {
    const s = axiosCacheStorage();
    await s.set("a", cachedValue());
    await s.set("b", cachedValue());
    await s.clear();
    expect((await s.get("a")).state).toBe("empty");
    expect((await s.get("b")).state).toBe("empty");
  });

  it("prefix scopes keys", async () => {
    const s = axiosCacheStorage();
    const scoped = s.prefix("api:");
    await scoped.set("url", cachedValue());
    expect((await scoped.get("url")).state).toBe("cached");
    expect((await s.get("url")).state).toBe("empty");
    expect((await s.get("api:url")).state).toBe("cached");
  });

  it("independent prefix stores do not collide", async () => {
    const s = axiosCacheStorage();
    const users = s.prefix("users:");
    const posts = s.prefix("posts:");
    await users.set("1", cachedValue());
    expect((await users.get("1")).state).toBe("cached");
    expect((await posts.get("1")).state).toBe("empty");
  });
});
