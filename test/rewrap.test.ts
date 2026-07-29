import kv from "../src/index";

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

// Passing an already-built store back into kv() should behave as the same
// store: keeping its prefix and expires, and working even while the inner
// store is still resolving its own adapter (e.g. a connecting Redis client).
describe("re-wrapping a store with kv()", () => {
  it("keeps the prefix", async () => {
    const map = new Map();
    const store = kv(map).prefix("app:");
    await store.set("a", 1);
    await kv(store).set("b", 2);
    expect([...map.keys()].sort()).toEqual(["app:a", "app:b"]);
  });

  it("keeps the expires", async () => {
    const store = kv(new Map(), { expires: "10ms" });
    const rewrapped = kv(store);
    await rewrapped.promise;
    expect(rewrapped.EXPIRES).toBe(0.01);
    await rewrapped.set("a", "b");
    expect(await rewrapped.get("a")).toBe("b");
    await delay(20);
    expect(await rewrapped.get("a")).toBe(null);
  });

  it("composes the prefixes like .prefix() does", async () => {
    const map = new Map();
    const store = kv(kv(map).prefix("a:"), { prefix: "b:" });
    await store.set("k", 1);
    expect([...map.keys()]).toEqual(["a:b:k"]);
  });

  it("works while the inner store is still connecting", async () => {
    const inner = kv(new Promise((r) => setTimeout(() => r(new Map()), 20)));
    const outer = kv(inner);
    expect(await outer.get("missing")).toBe(null);
    await outer.set("a", "b");
    expect(await outer.get("a")).toBe("b");
  });

  it("works on a substore of a store that is still connecting", async () => {
    const inner = kv(new Promise((r) => setTimeout(() => r(new Map()), 20)));
    const outer = kv(inner.prefix("app:"), { prefix: "sub:" });
    await outer.set("k", 1);
    expect(await outer.get("k")).toBe(1);
    expect(await inner.get("app:sub:k")).toBe(1);
  });
});
