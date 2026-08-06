import kv from "../src/index";

// Tests for specific issues, bugs and edge cases. The broad API coverage
// across every adapter lives in ./index.test.ts

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

// Resolves to the value after a tick, to model a client that is still connecting
const later = <T>(value: T, ms = 10): Promise<T> =>
  new Promise((done) => setTimeout(() => done(value), ms));

// Drains microtasks without letting the event loop run the pending I/O
const drain = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("adapter initialization", () => {
  it("calls adapter.connect() once, before any operation", async () => {
    let calls = 0;
    let connected = false;
    const store = kv({
      TYPE: "CONNECTS",
      connect: async () => {
        calls++;
        await new Promise((done) => setTimeout(done, 5));
        connected = true;
      },
      get: () => {
        expect(connected).toBe(true);
        return null;
      },
      set: () => {
        expect(connected).toBe(true);
      },
    });
    expect(calls).toBe(1);
    await store.get("a");
    await store.set("a", "b");
    expect(calls).toBe(1);
  });

  it("does not modify the adapter it is given", () => {
    const adapter = {
      TYPE: "UNTOUCHED",
      connect: async () => {},
      get: () => null,
      set: () => {},
    };
    kv(adapter);
    expect(Object.keys(adapter)).toEqual(["TYPE", "connect", "get", "set"]);
  });

  it("accepts a frozen adapter", async () => {
    const data: Record<string, any> = {};
    const frozen = Object.freeze({
      TYPE: "FROZEN",
      connect: async () => {},
      get: (key: string) => data[key] ?? null,
      set: (key: string, value: any) => {
        data[key] = value;
      },
    });
    const store = kv(frozen);
    expect(store.type).toBe("FROZEN");
    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
  });

  it("shares a single connect() across substores", async () => {
    let calls = 0;
    const adapter = {
      TYPE: "SHARED",
      connect: async () => {
        calls++;
      },
      get: () => null,
      set: () => {},
    };
    const store = kv(adapter);
    await store.prefix("a:").get("k");
    await store.expires("1h").get("k");
    await kv(store).get("k");
    expect(calls).toBe(1);
  });

  it("still supports an adapter that exposes a promise directly", async () => {
    let ready = false;
    const store = kv({
      TYPE: "RAWPROMISE",
      promise: new Promise<void>((done) =>
        setTimeout(() => {
          ready = true;
          done();
        }, 5),
      ),
      get: () => {
        expect(ready).toBe(true);
        return null;
      },
      set: () => {},
    });
    expect(await store.get("a")).toBe(null);
  });

  it("does not throw globally when the init fails but the store is unused", async () => {
    const failing = {
      TYPE: "FAILINIT",
      promise: Promise.reject(new Error("cannot connect")),
      get: () => null,
      set: () => {},
    };
    const store = kv(failing);
    expect(store.type).toBe("FAILINIT");
    // The rejection surfaces on use, not as an unhandled rejection
    await expect(store.get("a")).rejects.toThrow("cannot connect");
  });

  it("does not use the folder adapter before it is ready", async () => {
    const store = kv(`file://${process.cwd()}/data/init-folder/`);
    await drain();
    // Reading is the guard: it waits for the fs import and the mkdir
    expect(await store.get("missing")).toBe(null);
    expect(store.type).toBe("FOLDER");
    await store.set("hello", "world");
    expect(await store.get("hello")).toBe("world");
    await store.clear();
  });

  it("does not use the file adapter before it is ready", async () => {
    const store = kv(`file://${process.cwd()}/data/init-file.json`);
    await drain();
    expect(await store.get("missing")).toBe(null);
    expect(store.type).toBe("FILE");
    await store.set("hello", "world");
    expect(await store.get("hello")).toBe("world");
    await store.clear();
  });
});

// Passing an already-built store back into kv() should behave as the same
// store: keeping its prefix and expires, and working even while the inner
// store's adapter is still initialising (e.g. a folder store importing fs).
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

  it("works while the inner store is still initialising", async () => {
    const inner = kv(`file://${process.cwd()}/data/rewrap-init/`);
    const outer = kv(inner); // re-wrapped before the fs import settles
    expect(outer.type).toBe("FOLDER");
    expect(await outer.get("missing")).toBe(null);
    await outer.set("a", "b");
    expect(await outer.get("a")).toBe("b");
    await outer.clear();
  });

  it("works on a substore of a store that is still initialising", async () => {
    const inner = kv(`file://${process.cwd()}/data/rewrap-init/`);
    const outer = kv(inner.prefix("app:"), { prefix: "sub:" });
    await outer.set("k", 1);
    expect(await outer.get("k")).toBe(1);
    expect(await inner.get("app:sub:k")).toBe(1);
    await inner.clear();
  });
});

// The simplest possible adapter: just a getter and a setter, like backends
// that cannot list their keys (e.g. memcached). All of the single-key methods
// work; the group methods throw a clear error.
const createMinimal = () => {
  const data: Record<string, any> = {};
  return {
    TYPE: "MINIMAL",
    get: (key: string) => data[key] ?? null,
    set: (key: string, value: any) => {
      if (value === null) {
        delete data[key];
      } else {
        data[key] = value;
      }
    },
  };
};

describe("get/set-only adapters", () => {
  it("is a valid store", async () => {
    const store = kv(createMinimal());
    expect(await store.get("any")).toBe(null);
    expect(store.type).toBe("MINIMAL");
  });

  it("supports the single-key methods", async () => {
    const store = kv(createMinimal());
    expect(await store.get("a")).toBe(null);
    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
    expect(await store.has("a")).toBe(true);
    await store.del("a");
    expect(await store.get("a")).toBe(null);
    const id = await store.add({ hello: "world" });
    expect(await store.get(id)).toEqual({ hello: "world" });
  });

  it("supports expiration", async () => {
    const store = kv(createMinimal());
    await store.set("a", "b", { expires: "10ms" });
    expect(await store.get("a")).toBe("b");
    await delay(20);
    expect(await store.get("a")).toBe(null);
  });

  it("supports prefixes for the single-key methods", async () => {
    const minimal = createMinimal();
    const store = kv(minimal);
    await store.prefix("app:").set("a", "b");
    expect(await store.prefix("app:").get("a")).toBe("b");
    expect(await store.get("app:a")).toBe("b");
  });

  it("throws a clear error on the group methods", async () => {
    const store = kv(createMinimal());
    const error = /does not support \.iterate\(\)/;
    await expect(store.keys()).rejects.toThrow(error);
    await expect(store.values()).rejects.toThrow(error);
    await expect(store.entries()).rejects.toThrow(error);
    await expect(store.all()).rejects.toThrow(error);
    await expect(store.clear()).rejects.toThrow(error);
    await expect(
      (async () => {
        for await (const entry of store) entry;
      })(),
    ).rejects.toThrow(error);
  });

  it("still uses the native group methods when iterate is missing", async () => {
    const data: Record<string, any> = {};
    const store = kv({
      TYPE: "MINIMALCLEAR",
      get: (key: string) => data[key] ?? null,
      set: (key: string, value: any) => {
        if (value === null) {
          delete data[key];
        } else {
          data[key] = value;
        }
      },
      clear: (prefix: string) => {
        for (const key of Object.keys(data)) {
          if (key.startsWith(prefix)) delete data[key];
        }
      },
    });
    await store.set("a", "b");
    await store.clear();
    expect(await store.get("a")).toBe(null);
  });
});

describe("promise inputs", () => {
  const warn = console.warn;
  let warnings: string[] = [];
  beforeEach(() => {
    warnings = [];
    console.warn = (msg: string) => warnings.push(msg);
  });
  afterAll(() => {
    console.warn = warn;
  });

  it("works with a promise of a client", async () => {
    const map = new Map();
    const store = kv(later(map));
    expect(await store.get("a")).toBe(null);
    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
    expect([...map.keys()]).toEqual(["a"]);
  });

  it("is PROMISE until it resolves, then the real type", async () => {
    const store = kv(later(new Map()));
    expect(store.type).toBe("PROMISE");
    await store.get("a");
    expect(store.type).toBe("MEMORY");
  });

  it("warns once, pointing at the client", () => {
    kv(later(new Map()));
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/pass the client/);
  });

  it("does not warn for stores, substores or plain clients", async () => {
    const store = kv(new Map());
    kv(store);
    store.prefix("a:");
    store.expires("1h");
    expect(warnings).toEqual([]);
  });

  it("supports options and expiration", async () => {
    const map = new Map();
    const store = kv(later(map), { prefix: "app:", expires: "10ms" });
    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
    expect([...map.keys()]).toEqual(["app:a"]);
    await new Promise((done) => setTimeout(done, 20));
    expect(await store.get("a")).toBe(null);
  });

  it("keeps substores of a pending store on the same adapter", async () => {
    const map = new Map();
    const store = kv(later(map));
    const sub = store.prefix("app:"); // created while still pending
    await sub.set("k", 1);
    expect(sub.type).toBe("MEMORY");
    expect([...map.keys()]).toEqual(["app:k"]);
    expect(await store.get("app:k")).toBe(1);
  });

  it("re-wraps a pending store without losing the adapter", async () => {
    const map = new Map();
    const inner = kv(later(map));
    const outer = kv(inner);
    await outer.set("a", "b");
    expect([...map.keys()]).toEqual(["a"]);
    expect(await inner.get("a")).toBe("b");
  });

  it("resolves a promise of a store that is itself pending", async () => {
    const map = new Map();
    const inner = kv(later(map));
    const outer = kv(Promise.resolve(inner));
    await outer.set("a", "b");
    expect(await outer.get("a")).toBe("b");
    expect([...map.keys()]).toEqual(["a"]);
  });

  it("keeps the config of a store behind a promise", async () => {
    const map = new Map();
    const inner = kv(map, { prefix: "app:", expires: "1h" });
    const outer = kv(Promise.resolve(inner));
    await outer.set("k", 1);
    expect(outer.EXPIRES).toBe(3600);
    expect([...map.keys()]).toEqual(["app:k"]);
  });

  it("rejects on use when the promise fails", async () => {
    const store = kv(Promise.reject(new Error("cannot connect")));
    await expect(store.get("a")).rejects.toThrow("cannot connect");
  });

  it("rejects on use when the promise resolves to a bad adapter", async () => {
    const store = kv(later({}));
    await expect(store.get("a")).rejects.toThrow(
      "Adapter should have .get() and .set()",
    );
  });
});
