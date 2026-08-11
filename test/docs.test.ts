import kv from "../src/index";

// Every test here mirrors a code example from the readme, so that the docs
// cannot drift from the implementation. Examples that need an external
// service (Redis, Postgres, ...), a browser global, or that are only a
// signature line are not repeated here; they are covered by ./index.test.ts
//
// Where the docs use human-scale expirations ("1s" plus a 2s wait) the tests
// use milliseconds instead, so the behaviour is identical but the suite stays
// fast. The literal strings from the docs are checked separately, in
// "the documented expires formats are accepted".

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

describe("readme: Getting started", () => {
  it("adds, reads and deletes", async () => {
    const store = kv(new Map());

    const key = await store.add("Hello");
    expect(await store.get(key)).toBe("Hello");
    await store.del(key);
    expect(await store.get(key)).toBe(null);
  });
});

describe("readme: API", () => {
  it("takes the client and the options", async () => {
    const store = kv(new Map(), { expires: null, prefix: "" });
    expect(await store.get("a")).toBe(null);
  });

  it("knows the type straight away", () => {
    expect(kv(new Map()).type).toBe("MEMORY");
  });

  it("is idempotent, so a value can be normalized through kv()", async () => {
    const map = new Map();
    const store = kv(map);
    await kv(store).set("a", "b");
    expect(await store.get("a")).toBe("b");
  });
});

describe("readme: .get()", () => {
  it("reads the stored values back", async () => {
    const store = kv(new Map());
    await store.set("key1", "Hello World");
    await store.set("key2", ["my", "grocery", "list"]);
    await store.set("key3", { name: "Francisco" });

    expect(await store.get("key1")).toBe("Hello World");
    expect(await store.get("key2")).toEqual(["my", "grocery", "list"]);
    expect(await store.get("key3")).toEqual({ name: "Francisco" });
  });

  it("returns null when never set, deleted or expired", async () => {
    const store = kv(new Map());

    // Never set
    expect(await store.get("key1")).toBe(null);

    // Deleted
    await store.set("key2", "Hello");
    expect(await store.get("key2")).toBe("Hello");
    await store.del("key2");
    expect(await store.get("key2")).toBe(null);

    // Expired (the docs use "1s" and wait 2s)
    await store.set("key3", "Hello", { expires: "10ms" });
    expect(await store.get("key3")).toBe("Hello");
    await delay(20);
    expect(await store.get("key3")).toBe(null);
  });

  it("reads through a prefix", async () => {
    const store = kv(new Map());
    const session = store.prefix("session:");
    await store.set("session:key1", "value1");
    expect(await session.get("key1")).toBe(await store.get("session:key1"));
  });
});

describe("readme: .set()", () => {
  it("stores values, with and without expiration", async () => {
    const store = kv(new Map());
    await store.set("key1", "Hello World");
    await store.set("key2", ["my", "grocery", "list"], { expires: "1h" });
    await store.set("key3", { name: "Francisco" }, { expires: 60 * 60 });

    expect(await store.get("key1")).toBe("Hello World");
    expect(await store.get("key2")).toEqual(["my", "grocery", "list"]);
    expect(await store.get("key3")).toEqual({ name: "Francisco" });
  });

  it("returns the key", async () => {
    const store = kv(new Map());
    expect(await store.set("key1", "Hello World")).toBe("key1");
  });

  it("the documented expires formats are accepted", () => {
    const store = kv(new Map());
    expect(store.expires(0).EXPIRES).toBe(0);
    expect(store.expires(0.1).EXPIRES).toBe(0.1);
    expect(store.expires(60 * 60).EXPIRES).toBe(3600);
    expect(store.expires(3_600).EXPIRES).toBe(3600);
    expect(store.expires("10s").EXPIRES).toBe(10);
    expect(store.expires("2minutes").EXPIRES).toBe(120);
    expect(store.expires("5d").EXPIRES).toBe(432000);
    expect(store.expires("1h").EXPIRES).toBe(3600);
    expect(store.expires("2days").EXPIRES).toBe(172800);
    expect(store.expires("10min").EXPIRES).toBe(600);
  });

  it("setting null deletes the key", async () => {
    const store = kv(new Map());
    await store.set("a", "b");
    await store.set("a", null);
    expect(await store.get("a")).toBe(null);
  });
});

describe("readme: .add()", () => {
  it("generates a 24 character alphanumeric key", async () => {
    const store = kv(new Map());
    const key = await store.add("Hello World");
    expect(key.length).toBe(24);
    expect(key).toMatch(/^[a-zA-Z0-9]{24}$/);
    expect(await store.get(key)).toBe("Hello World");
  });

  it("keeps the prefix out of the returned key but in the store", async () => {
    const store = kv(new Map());
    const session = store.prefix("session:");

    const key1 = await session.add("value1");
    expect(await session.keys()).toEqual([key1]);
    expect(await store.keys()).toEqual(["session:" + key1]);
  });
});

describe("readme: .has()", () => {
  it("checks existence", async () => {
    const store = kv(new Map());
    expect(await store.has("a")).toBe(false);
    await store.set("a", "b");
    expect(await store.has("a")).toBe(true);
  });

  it("the three prefixed forms are the same operation", async () => {
    const store = kv(new Map());
    const session = store.prefix("session:");
    await store.set("session:key1", "value");

    expect(await session.has("key1")).toBe(true);
    expect(await store.prefix("session:").has("key1")).toBe(true);
    expect(await store.has("session:key1")).toBe(true);
  });
});

describe("readme: .del()", () => {
  it("returns the key and ignores missing ones", async () => {
    const store = kv(new Map());
    await store.set("a", "b");
    expect(await store.del("a")).toBe("a");
    expect(await store.del("missing")).toBe("missing");
  });

  it("deletes many keys at once", async () => {
    const store = kv(new Map());
    await store.set("key1", "a");
    await store.set("key2", "b");

    const keys = ["key1", "key2"];
    await Promise.all(keys.map((key) => store.del(key)));
    expect(await store.keys()).toEqual([]);
  });

  it("the three prefixed forms are the same operation", async () => {
    const store = kv(new Map());
    const session = store.prefix("session:");

    await store.set("session:key1", "value");
    await session.del("key1");
    expect(await store.get("session:key1")).toBe(null);

    await store.set("session:key1", "value");
    await store.prefix("session:").del("key1");
    expect(await store.get("session:key1")).toBe(null);

    await store.set("session:key1", "value");
    await store.del("session:key1");
    expect(await store.get("session:key1")).toBe(null);
  });
});

describe("readme: Iterator", () => {
  it("goes through the whole store", async () => {
    const store = kv(new Map());
    await store.set("a", 1);
    await store.set("b", 2);

    const seen: [string, unknown][] = [];
    for await (const [key, value] of store) {
      seen.push([key, value]);
    }
    expect(seen.sort()).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("strips the prefix, and both forms are equivalent", async () => {
    const store = kv(new Map());
    await store.set("session:key1", "value1");
    await store.set("other", "value2");

    const viaSubstore: [string, unknown][] = [];
    for await (const entry of store.prefix("session:")) viaSubstore.push(entry);

    const session = store.prefix("session:");
    const viaVariable: [string, unknown][] = [];
    for await (const entry of session) viaVariable.push(entry);

    expect(viaSubstore).toEqual([["key1", "value1"]]);
    expect(viaVariable).toEqual(viaSubstore);
  });
});

describe("readme: group methods", () => {
  const seed = async () => {
    const store = kv(new Map());
    await store.set("keyA", "valueA");
    await store.set("session:keyB", "valueB");
    return store;
  };

  it(".keys() returns them all, .prefix() strips", async () => {
    const store = await seed();
    expect((await store.keys()).sort()).toEqual(["keyA", "session:keyB"]);
    expect(await store.prefix("session:").keys()).toEqual(["keyB"]);
  });

  it(".values() returns them all", async () => {
    const store = await seed();
    expect((await store.values()).sort()).toEqual(["valueA", "valueB"]);
    expect(await store.prefix("session:").values()).toEqual(["valueB"]);
  });

  it(".entries() returns [key, value] pairs", async () => {
    const store = await seed();
    expect((await store.entries()).sort()).toEqual([
      ["keyA", "valueA"],
      ["session:keyB", "valueB"],
    ]);
    expect(await store.prefix("session:").entries()).toEqual([
      ["keyB", "valueB"],
    ]);
  });

  it(".all() returns an object, and takes no arguments", async () => {
    const store = await seed();
    expect(await store.all()).toEqual({
      keyA: "valueA",
      "session:keyB": "valueB",
    });
    expect(await store.prefix("session:").all()).toEqual({ keyB: "valueB" });
  });

  it(".clear() empties the store, .prefix() only its own keys", async () => {
    const store = await seed();
    await store.prefix("session:").clear();
    expect(await store.keys()).toEqual(["keyA"]);

    await store.clear();
    expect(await store.keys()).toEqual([]);
  });

  it(".prune() removes only the expired data", async () => {
    const store = kv(new Map());
    await store.set("fresh", "a");
    await store.set("stale", "b", { expires: "10ms" });
    await delay(20);

    await store.prune();
    expect(await store.keys()).toEqual(["fresh"]);
  });
});

describe("readme: .prefix()", () => {
  it("maps every method onto the prefixed key", async () => {
    const store = kv(new Map());
    const session = store.prefix("session:");

    await session.set("key2", "some data");
    expect(await store.get("session:key2")).toBe("some data");
    expect(await session.keys()).toEqual(["key2"]); // no prefix here
  });

  it("stacks when chained", async () => {
    const map = new Map();
    const store = kv(map);
    await store.prefix("a:").prefix("b:").set("k", 1);
    expect([...map.keys()]).toEqual(["a:b:k"]);
  });

  it("does not leak between overlapping prefixes", async () => {
    const store = kv(new Map());
    await store.prefix("session:").set("k", "session");
    await store.prefix("company:").set("k", "company");

    expect(await store.prefix("session:").get("k")).toBe("session");
    expect(await store.prefix("company:").get("k")).toBe("company");
  });
});

describe("readme: .expires()", () => {
  it("sets a default expiration that options can override", async () => {
    const store = kv(new Map()); // No expiration
    const cache = store.expires("10min"); // 10 min expiration

    expect(store.EXPIRES).toBe(null);
    expect(cache.EXPIRES).toBe(600);

    await cache.set("a", "b");
    expect(await cache.get("a")).toBe("b");

    // The option overwrites the substore default (docs use "5s")
    await cache.set("c", "e", { expires: "10ms" });
    await delay(20);
    expect(await cache.get("c")).toBe(null);
    expect(await cache.get("a")).toBe("b");
  });

  it("combines with .prefix()", async () => {
    const store = kv(new Map());
    const sessions = store.prefix("session:").expires("1day");
    expect(sessions.PREFIX).toBe("session:");
    expect(sessions.EXPIRES).toBe(86400);
  });
});

describe("readme: Memory adapter", () => {
  it("works with expiration on top of a plain Map", async () => {
    const store = kv(new Map());
    await store.set("key1", "Hello world", { expires: "1h" });
    expect(await store.get("key1")).toBe("Hello world");
  });

  it("writing to the underlying Map directly makes the value unreadable", async () => {
    const map = new Map();
    const store = kv(map);

    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");

    // DON'T DO THIS; polystore wraps values with its own metadata
    map.set("a", "b");
    expect(await store.get("a")).toBe(null);
  });
});

describe("readme: Expirations guide", () => {
  it("the group methods ignore expired keys", async () => {
    const store = kv(new Map());
    await store.set("a", "b", { expires: "10ms" }); // docs use "1s"

    expect(await store.keys()).toEqual(["a"]);
    expect(await store.has("a")).toBe(true);
    expect(await store.get("a")).toBe("b");

    await delay(20); // docs wait 2s

    expect(await store.keys()).toEqual([]);
    expect(await store.has("a")).toBe(false);
    expect(await store.get("a")).toBe(null);
  });
});

describe("readme: Creating a store", () => {
  // The "Plain Object adapter" example, verbatim
  const dataSource: Record<string, any> = {};
  class MyClient {
    get(key: string) {
      return dataSource[key];
    }

    // No need to stringify it or anything for a plain object storage
    set(key: string, value: any) {
      dataSource[key] = value;
    }
  }

  // The "Adding iteration" example, same class plus .iterate()
  class MyIterableClient extends MyClient {
    // Filter them by the prefix, note that `prefix` will always be a string
    *iterate(prefix: string) {
      for (const [key, value] of Object.entries(dataSource)) {
        if (key.startsWith(prefix)) {
          yield [key, value] as [string, any];
        }
      }
    }
  }

  beforeEach(() => {
    for (const key of Object.keys(dataSource)) delete dataSource[key];
  });

  it("a getter and a setter are enough for the single-key methods", async () => {
    const store = kv(new MyClient());

    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
    expect(await store.has("a")).toBe(true);
    await store.del("a");
    expect(await store.get("a")).toBe(null);

    const key = await store.add("value");
    expect(await store.get(key)).toBe("value");
  });

  it("expiration works even though the client has none", async () => {
    const store = kv(new MyClient());
    await store.set("a", "b", { expires: "10ms" });
    expect(await store.get("a")).toBe("b");
    await delay(20);
    expect(await store.get("a")).toBe(null);
  });

  it("without .iterate() the group methods throw", async () => {
    const store = kv(new MyClient());
    await expect(store.keys()).rejects.toThrow(/does not support .iterate/);
    await expect(store.values()).rejects.toThrow(/does not support .iterate/);
    await expect(store.entries()).rejects.toThrow(/does not support .iterate/);
    await expect(store.all()).rejects.toThrow(/does not support .iterate/);
    await expect(store.clear()).rejects.toThrow(/does not support .iterate/);
  });

  it("with .iterate() the group methods work", async () => {
    const store = kv(new MyIterableClient());
    await store.set("a", 1);
    await store.set("session:b", 2);

    expect((await store.keys()).sort()).toEqual(["a", "session:b"]);
    expect(await store.prefix("session:").keys()).toEqual(["b"]);
    expect(await store.all()).toEqual({ a: 1, "session:b": 2 });
  });
});

describe("readme: Extending a store", () => {
  it("Object.assign adds methods, going to SQL for a fast count()", async () => {
    // The docs use pg; sqlite has the same table layout and runs in-process
    const { Database } =
      typeof globalThis.Bun !== "undefined"
        ? await import("bun:sqlite")
        : ((await import("better-sqlite3")) as any).default;
    const client = new Database(":memory:");
    const store = kv(client, { prefix: "user:" });

    const users = Object.assign(store, {
      list: async () => await store.values(),
      count: async () => {
        const row = client
          .prepare(
            `SELECT COUNT(*) AS count FROM kv
             WHERE id LIKE 'user:%' AND (expires_at IS NULL OR expires_at > ?)`,
          )
          .get(Date.now());
        return Number(row.count);
      },
    });

    await users.set("a", { name: "A" });
    await users.set("b", { name: "B" });
    await users.set("expired", { name: "X" }, { expires: "10ms" });
    await kv(client).set("other:c", { name: "C" }); // outside "user:"
    await delay(20);

    expect(await users.count()).toBe(2); // one COUNT(*), skips expired
    expect((await users.list()).length).toBe(2);
    expect(await users.get("a")).toEqual({ name: "A" }); // full API works
    expect(users.type).toBe("SQLITE");
    expect(users).toBe(store as typeof users); // same instance, extended
  });

  it("derived stores do NOT inherit the extension", async () => {
    const store = kv(new Map());
    const users = Object.assign(store, {
      count: async () => (await store.keys()).length,
    });

    expect((users.prefix("a:") as any).count).toBe(undefined);
    expect((users.expires("1h") as any).count).toBe(undefined);
  });
});

describe("readme: Simple cache", () => {
  it("only fetches once, then serves from the store", async () => {
    const store = kv(new Map());
    let calls = 0;
    const fetch = async (url: string) => {
      calls++;
      return { json: async () => ({ url, name: "Product" }) };
    };

    async function getProductInfo(id: string) {
      const cached = await store.get(id);
      if (cached) return cached;

      const res = await fetch(`https://some-url.com/products/${id}`);
      const data = await res.json();

      await store.set(id, data, { expires: "10days" });
      return data;
    }

    const first = await getProductInfo("p1");
    expect(first).toEqual({
      url: "https://some-url.com/products/p1",
      name: "Product",
    });
    expect(calls).toBe(1);

    const second = await getProductInfo("p1");
    expect(second).toEqual(first);
    expect(calls).toBe(1); // served from the store, no second fetch
  });
});

describe("readme: caching with .has()", () => {
  it("does one roundtrip per key", async () => {
    const store = kv(new Map());
    let calls = 0;
    const axios = {
      get: async (url: string) => {
        calls++;
        return { data: { url } };
      },
    };

    async function fetchUser(id: string) {
      if (!(await store.has(id))) {
        const { data } = await axios.get(`/users/${id}`);
        await store.set(id, data, { expires: "1h" });
      }
      return store.get(id);
    }

    expect(await fetchUser("1")).toEqual({ url: "/users/1" });
    expect(await fetchUser("1")).toEqual({ url: "/users/1" });
    expect(calls).toBe(1);
  });
});

describe("readme: Custom ID generation", () => {
  it("an adapter can generate its own keys", async () => {
    let n = 0;
    const customId = () => `custom-${++n}`;
    const dataSource: Record<string, any> = {};

    class MyAdapter {
      // Add the opt method .add() to have more control over the ID generation
      async add(prefix: string, data: any) {
        const id = customId();
        const key = prefix + id;
        await this.set(key, data);
        return key;
      }
      async get(key: string) {
        return dataSource[key] ?? null;
      }
      async set(key: string, value: any) {
        dataSource[key] = value;
      }
      *iterate(prefix: string) {
        for (const [key, value] of Object.entries(dataSource)) {
          if (key.startsWith(prefix)) yield [key, value] as [string, any];
        }
      }
    }

    const store = kv(new MyAdapter());
    const id = await store.add({ hello: "world" });
    expect(id).toBe("custom-1");

    const id2 = await store.prefix("hello:").add({ hello: "world" });
    expect(id2).toBe("hello:custom-2");
    expect(Object.keys(dataSource).sort()).toEqual([
      "custom-1",
      "hello:custom-2",
    ]);
  });
});
