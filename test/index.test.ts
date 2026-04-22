import "dotenv/config";

import kv from "../src/index";
import File from "../src/clients/file";
import Folder from "../src/clients/folder";
import stores, { cannotTestExpiration, doNotSupportMs } from "./stores.ts";

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

console.log(
  `\x1b[1m${typeof Bun === "undefined" ? "Jest" : "Bun"}\x1b[0m Testing\n`,
);

describe("File client detection", () => {
  it("matches a file:// URL with an extension", () => {
    expect(File.test("file:///path/to/store.json")).toBe(true);
  });
  it("does not match a file:// URL ending with /", () => {
    expect(File.test("file:///path/to/folder/")).toBe(false);
  });
  it("does not match a file:// URL with a dotfile directory (e.g. .cache/)", () => {
    expect(File.test("file:///path/to/.cache/")).toBe(false);
  });
});

describe("Folder client detection", () => {
  it("matches a file:// URL ending with /", () => {
    expect(Folder.test("file:///path/to/folder/")).toBe(true);
  });
  it("matches a file:// URL with a dotfile directory", () => {
    expect(Folder.test("file:///path/to/.cache/")).toBe(true);
  });
  it("does not match a file:// URL with an extension", () => {
    expect(Folder.test("file:///path/to/store.json")).toBe(false);
  });
});

describe("base API", () => {
  it("a potato is not a valid store", async () => {
    expect(kv("potato").get("any")).rejects.toThrow();
  });

  it("an empty object is not a valid store", async () => {
    expect(kv({}).get("any")).rejects.toThrow(
      "Client should have .get(), .set() and .iterate()",
    );
  });

  class Base {
    get(): void {}
    set(): void {}
    *iterate(): Generator<void, void, unknown> {}
  }

  it("cannot handle no EXPIRES + has", async () => {
    expect(
      kv(
        class extends Base {
          has(): void {}
        },
      ).get("any"),
    ).rejects.toThrow(
      "You can only define client.has() when the client manages the expiration.",
    );
  });

  it("cannot handle no EXPIRES + keys", async () => {
    expect(
      kv(
        class extends Base {
          keys(): void {}
        },
      ).get("any"),
    ).rejects.toThrow(
      "You can only define client.keys() when the client manages the expiration.",
    );
  });

  it("cannot handle no EXPIRES + values", async () => {
    expect(
      kv(
        class extends Base {
          values(): void {}
        },
      ).get("any"),
    ).rejects.toThrow(
      "You can only define client.values() when the client manages the expiration.",
    );
  });

  it("ClientNonExpires: expired entries are treated as non-existent", async () => {
    const s = kv({
      HAS_EXPIRATION: false as const,
      get: (key: string) =>
        key === "a" ? { value: "x", expires: -100 } : null,
      set: () => {},
      iterate: function* () {
        yield ["a", { value: "x", expires: -100 }];
      },
    });

    expect(await s.get("a")).toBe(null);
    expect(await s.has("a")).toBe(false);
    expect(await s.keys()).toEqual([]);

    const items = [];
    for await (const entry of s) items.push(entry);
    expect(items).toEqual([]);
  });
});

type StoreEntries = [
  keyof typeof stores,
  (typeof stores)[keyof typeof stores],
][];

for (const [name, store] of Object.entries(stores) as StoreEntries) {
  describe(name, () => {
    if (!store) throw new Error("No store available");

    beforeEach(async () => {
      await store.clear();
    });

    afterAll(async () => {
      await store.clear();
      await store.close();
    });

    it("has a type", () => {
      expect(store.type).not.toBe("UNKNOWN");
      expect(store.type).not.toBe(null);
    });

    it("can perform a CRUD", async () => {
      expect(await store.get("a")).toBe(null);
      expect(await store.has("a")).toBe(false);
      expect(await store.set("a", "b")).toBe("a");
      expect(await store.has("a")).toBe(true);
      expect(await store.get("a")).toBe("b");
      expect(await store.del("a")).toBe("a");
      expect(await store.get("a")).toBe(null);
    });

    it("is empty on the start", async () => {
      expect(await store.get("a")).toBe(null);
      expect(await store.has("a")).toBe(false);
    });

    it("can add() arbitrary values", async () => {
      const key = await store.add("b");
      expect(typeof key).toBe("string");
      expect(await store.get(key)).toBe("b");
      expect(await store.has(key)).toBe(true);
      expect(key.length).toBe(24);
      expect(key).toMatch(/^[a-zA-Z0-9]{24}$/);
    });

    it("can store values", async () => {
      const key = await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      expect(await store.has("a")).toBe(true);
      expect(key).toBe("a");
    });

    it("can store values with a semicolon", async () => {
      const key = await store.set("a", "b;c");
      expect(await store.get("a")).toBe("b;c");
      expect(await store.has("a")).toBe(true);
      expect(key).toBe("a");
    });

    it("can store values with an equal", async () => {
      const key = await store.set("a", "b=c");
      expect(await store.get("a")).toBe("b=c");
      expect(await store.has("a")).toBe(true);
      expect(key).toBe("a");
    });

    it("can store values with a semicolon in the key", async () => {
      const key = await store.set("a;b", "c");
      expect(await store.get("a;b")).toBe("c");
      expect(await store.has("a;b")).toBe(true);
      expect(key).toBe("a;b");
    });

    it("can store values with an equal in the key", async () => {
      const key = await store.set("a=b", "c");
      expect(await store.get("a=b")).toBe("c");
      expect(await store.has("a=b")).toBe(true);
      expect(key).toBe("a=b");
    });

    it("can store basic types", async () => {
      await store.set("a", 10);
      expect(await store.get("a")).toEqual(10);
      await store.set("a", "b");
      expect(await store.get("a")).toEqual("b");
      await store.set("a", true);
      expect(await store.get("a")).toEqual(true);
    });

    it("can overwrite a key with a different type", async () => {
      await store.set("key", "string");
      expect(await store.get("key")).toBe("string");
      await store.set("key", 42);
      expect(await store.get("key")).toBe(42);
      await store.set("key", { nested: true });
      expect(await store.get("key")).toEqual({ nested: true });
    });

    it("overwriting a key removes the previous expiration", async () => {
      if (doNotSupportMs.includes(name)) return;

      await store.set("a", "b", { expires: "10ms" });
      await delay(20);
      expect(await store.get("a")).toBe(null);
      await store.set("a", "c");
      await delay(20);
      expect(await store.get("a")).toBe("c");
    });

    it("can store arrays of JSON values", async () => {
      await store.set("a", ["b", "c"]);
      expect(await store.get("a")).toEqual(["b", "c"]);
      expect(await store.has("a")).toBe(true);
    });

    it("can store objects", async () => {
      await store.set("a", { b: "c" });
      expect(await store.get("a")).toEqual({ b: "c" });
      expect(await store.has("a")).toBe(true);
    });

    it("can get the keys", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      const keys = await store.keys();
      expect(keys.sort()).toEqual(["a", "c"]);
    });

    it("can get the values", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      const values = await store.values();
      expect(values.sort()).toEqual(["b", "d"]);
    });

    it("can get the entries", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      const entries = await store.entries<string>();
      expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });

    it("can get all as an object", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      expect(await store.all()).toEqual({
        a: "b",
        c: "d",
      });
    });

    describe("kv() options", () => {
      it("sets the proper instances", () => {
        const s = kv(store, { prefix: "hello:", expires: "10s" });
        expect(s.EXPIRES).toBe(10);
        expect(s.PREFIX).toBe("hello:");

        const s2 = s.prefix("world:").expires("1s");
        expect(s2.EXPIRES).toBe(1);
        expect(s2.PREFIX).toBe("hello:world:");

        const s3 = s2.expires(null);
        expect(s3.EXPIRES).toBe(null);
      });

      it("constructor prefix", async () => {
        const s = kv(store, { prefix: "hello:" });
        await s.set("a", "b");
        expect(await store.prefix("hello:").get("a")).toBe("b");
        expect(await store.get("hello:a")).toBe("b");
      });

      it("constructor prefix stacks", async () => {
        const s = kv(store, { prefix: "hello:" }).prefix("world:");
        await s.set("a", "b");
        expect(await store.prefix("hello:").prefix("world:").get("a")).toBe(
          "b",
        );
        expect(await store.get("hello:world:a")).toBe("b");
      });

      if (!doNotSupportMs.includes(name) && !name.includes("http")) {
        it("supports expires (number)", async () => {
          const s = kv(store, { expires: 0.01 });
          await s.set("a", "b");
          expect(await s.get("a")).toBe("b");
          await delay(20);
          expect(await s.get("a")).toBe(null);
        });

        it("supports expires (string)", async () => {
          if (cannotTestExpiration.includes(name)) return;
          const s = kv(store, { expires: "10ms" });
          await s.set("a", "b");
          expect(await s.get("a")).toBe("b");
          await delay(20);
          expect(await s.get("a")).toBe(null);
        });

        it("supports prefix + expires", async () => {
          if (cannotTestExpiration.includes(name)) return;
          const s = kv(store, { prefix: "hello:", expires: "10ms" });
          await s.set("a", "b");
          expect(await s.get("a")).toBe("b");
          await delay(20);
          expect(await s.get("a")).toBe(null);
        });
      } else {
        if (cannotTestExpiration.includes(name)) return;

        it("constructor expires (number)", async () => {
          const s = kv(store, { expires: 1 });
          await s.set("a", "b");
          expect(await s.get("a")).toBe("b");
          await delay(1100);
          expect(await s.get("a")).toBe(null);
        });

        it("constructor expires (string)", async () => {
          const s = kv(store, { expires: "1s" });
          await s.set("a", "b");
          await delay(1100);
          expect(await s.get("a")).toBe(null);
        });

        it("constructor prefix + expires", async () => {
          const s = kv(store, { prefix: "hello:", expires: "1s" });
          await s.set("a", "b");
          expect(await store.get("hello:a")).toBe("b");
          await delay(1100);
          expect(await s.get("a")).toBe(null);
        });
      }
    });

    it("can delete the data", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      await store.del("a");
      expect(await store.get("a")).toBe(null);
      expect(await store.keys()).toEqual([]);
    });

    it("can delete the data by setting it to null", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      await store.set("a", null);
      expect(await store.get("a")).toBe(null);
      expect(await store.keys()).toEqual([]);
    });

    it("can clear all the values", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      expect(await store.get("a")).toBe("b");
      await store.clear();
      expect(await store.get("a")).toBe(null);
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
    });

    describe("iteration", () => {
      beforeEach(async () => {
        await store.clear();
      });

      it("supports raw iteration", async () => {
        await store.set("a", "b");
        await store.set("c", "d");

        const entries: [string, any][] = [];
        for await (const entry of store) {
          entries.push(entry);
        }
        expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
          ["a", "b"],
          ["c", "d"],
        ]);
      });

      it("BUG — set(key, null) calls del() with a double-prefixed key", async () => {
        const pref = store.prefix("x:"); // introduce a prefix

        await pref.set("foo", "bar"); // creates key "x:foo"
        await pref.set("foo", null);
        const v = await pref.get("foo");

        const items = [];
        for await (const [k, val] of pref) items.push([k, val]);

        expect(v).toBe(null);
        expect(items).toEqual([]);
      });

      it("preserves falsy values (0, false, '')", async () => {
        await store.set("n", 0);
        await store.set("b", false);
        await store.set("e", "");
        expect(await store.get("n")).toBe(0);
        expect(await store.get("b")).toBe(false);
        expect(await store.get("e")).toBe("");
      });

      it("BUG — iterate() must include falsy values", async () => {
        await store.set("a", 0);
        await store.set("b", false);
        await store.set("c", "");

        const items = [];
        for await (const entry of store) items.push(entry);

        // They MUST appear exactly as stored
        expect(items.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
          ["a", 0],
          ["b", false],
          ["c", ""],
        ]);
      });

      it("supports raw prefix iteration", async () => {
        await store.set("a:a", "b");
        await store.set("b:a", "d");
        await store.set("a:c", "d");
        await store.set("b:c", "d");

        const entries: [string, any][] = [];
        for await (const entry of store.prefix("a:")) {
          entries.push(entry);
        }
        expect(entries.sort()).toEqual([
          ["a", "b"],
          ["c", "d"],
        ]);
      });

      it("can get the keys with a colon prefix", async () => {
        await store.set("a:0", "a0");
        await store.set("a:1", "a1");
        await store.set("b:0", "b0");
        await store.set("a:2", "a2");
        expect((await store.keys()).sort()).toEqual([
          "a:0",
          "a:1",
          "a:2",
          "b:0",
        ]);
        expect((await store.prefix("a:").keys()).sort()).toEqual([
          "0",
          "1",
          "2",
        ]);
      });

      it("can get the values with a colon prefix", async () => {
        await store.set("a:0", "a0");
        await store.set("a:1", "a1");
        await store.set("b:0", "b0");
        await store.set("a:2", "a2");
        expect((await store.prefix("a:").values()).sort()).toEqual([
          "a0",
          "a1",
          "a2",
        ]);
      });

      it("can get the entries with a colon prefix", async () => {
        await store.set("a:0", "a0");
        await store.set("a:1", "a1");
        await store.set("b:0", "b0");
        await store.set("a:2", "a2");
        expect((await store.entries()).sort()).toEqual([
          ["a:0", "a0"],
          ["a:1", "a1"],
          ["a:2", "a2"],
          ["b:0", "b0"],
        ]);
        expect((await store.prefix("a:").entries()).sort()).toEqual([
          ["0", "a0"],
          ["1", "a1"],
          ["2", "a2"],
        ]);
      });

      it("can get the all object with a colon prefix", async () => {
        await store.set("a:0", "a0");
        await store.set("a:1", "a1");
        await store.set("b:0", "b0");
        await store.set("a:2", "a2");
        expect(await store.prefix("a:").all()).toEqual({
          0: "a0",
          1: "a1",
          2: "a2",
        });
      });

      it("can get the keys with a dash prefix", async () => {
        await store.set("a-0", "a0");
        await store.set("a-1", "a1");
        await store.set("b-0", "b0");
        await store.set("a-2", "a2");
        expect((await store.keys()).sort()).toEqual([
          "a-0",
          "a-1",
          "a-2",
          "b-0",
        ]);
        expect((await store.prefix("a-").keys()).sort()).toEqual([
          "0",
          "1",
          "2",
        ]);
      });

      it("can get the values with a dash prefix", async () => {
        await store.set("a-0", "a0");
        await store.set("a-1", "a1");
        await store.set("b-0", "b0");
        await store.set("a-2", "a2");
        expect((await store.prefix("a-").values()).sort()).toEqual([
          "a0",
          "a1",
          "a2",
        ]);
      });

      it("can get the entries with a dash prefix", async () => {
        await store.set("a-0", "a0");
        await store.set("a-1", "a1");
        await store.set("b-0", "b0");
        await store.set("a-2", "a2");
        expect((await store.prefix("a-").entries()).sort()).toEqual([
          ["0", "a0"],
          ["1", "a1"],
          ["2", "a2"],
        ]);
      });

      it("can get the all object with a dash prefix", async () => {
        await store.set("a-0", "a0");
        await store.set("a-1", "a1");
        await store.set("b-0", "b0");
        await store.set("a-2", "a2");
        expect(await store.prefix("a-").all()).toEqual({
          0: "a0",
          1: "a1",
          2: "a2",
        });
      });
    });

    describe("{ expires }", () => {
      if (cannotTestExpiration.includes(name)) return;

      it("expires = 0 means immediately", async () => {
        await store.set("a", "b", { expires: 0 });
        expect(await store.get("a")).toBe(null);
        expect(await store.has("a")).toBe(false);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.entries()).toEqual([]);
      });

      it("expires = potato means undefined = forever", async () => {
        await store.set("a", "b", { expires: "potato" });
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = 5potato means undefined = forever", async () => {
        await store.set("a", "b", { expires: "5potato" });
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = null means never to expire it", async () => {
        await store.set("a", "b", { expires: null });
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = undefined means never to expire it", async () => {
        await store.set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("BUG — del() fails to delete an expired entry", async () => {
        await store.set("foo", "bar", { expires: -1 });
        const before = await store.get("foo");
        await store.del("foo");
        const after = await store.get("foo");
        const items = [];
        for await (const [k, v] of store) items.push([k, v]);

        expect(before).toBe(null);
        expect(after).toBe(null);
        expect(items).toEqual([]);
      });

      if (!doNotSupportMs.includes(name) && !name.includes("http")) {
        it("can use 0.01 expire", async () => {
          await store.set("a", "b", { expires: 0.01 });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.entries()).toEqual([["a", "b"]]);
          expect(await store.all()).toEqual({ a: "b" });
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.entries()).toEqual([]);
          expect(await store.all()).toEqual({});
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01s expire", async () => {
          await store.set("a", "b", { expires: "0.01s" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01seconds expire", async () => {
          await store.set("a", "b", { expires: "0.01seconds" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 10ms expire", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("removes the expired key with .get()", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.get("a")).toBe(null);
        });

        it("removes the expired key with .keys()", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.keys()).toEqual(["a"]);
          await delay(20);
          expect(await store.keys()).toEqual([]);
        });

        it("CANNOT remove the expired key with .values()", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.values()).toEqual(["b"]);
          await delay(20);
          expect(await store.values()).toEqual([]);
        });

        it("ignores expired entries and only clears the prefix", async () => {
          const pref = store.prefix("p:");

          await store.set("x", "1");
          await pref.set("a", "2", { expires: "100ms" });
          await pref.set("b", "3");

          await delay(20);
          await pref.clear();

          expect(await store.get("x")).toBe("1");
          expect(await pref.get("a")).toBe(null);
          expect(await pref.get("b")).toBe(null);

          expect(await store.keys()).toEqual(["x"]);
        });
      } else {
        it("can use 1 (second) expire", async () => {
          await store.set("a", "b", { expires: 1 });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(1100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });
        it("can use 1s expire", async () => {
          await store.set("a", "b", { expires: "1s" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(1100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });
      }
    });

    describe(".expires()", () => {
      if (cannotTestExpiration.includes(name)) return;

      it("expires = 0 means immediately", async () => {
        await store.expires(0).set("a", "b");
        expect(await store.get("a")).toBe(null);
        expect(await store.has("a")).toBe(false);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.entries()).toEqual([]);
      });

      it("expires = potato means undefined = forever", async () => {
        await store.expires("potato").set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = 5potato means undefined = forever", async () => {
        await store.expires("5potato").set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = null means never to expire it", async () => {
        await store.expires(null).set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = undefined means never to expire it", async () => {
        await store.set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(20);
        expect(await store.get("a")).toBe("b");
      });

      it("BUG — del() fails to delete an expired entry", async () => {
        await store.expires(-1).set("foo", "bar");
        const before = await store.get("foo");
        await store.del("foo");
        const after = await store.get("foo");
        const items = [];
        for await (const [k, v] of store) items.push([k, v]);

        expect(before).toBe(null);
        expect(after).toBe(null);
        expect(items).toEqual([]);
      });

      if (!doNotSupportMs.includes(name) && !name.includes("http")) {
        it("can use 0.02 expire", async () => {
          await store.expires(0.02).set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(50);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01s expire", async () => {
          await store.expires("0.01s").set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01seconds expire", async () => {
          await store.expires("0.01seconds").set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 10ms expire", async () => {
          await store.expires("10ms").set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("removes the expired key with .get()", async () => {
          await store.expires("10ms").set("a", "b");
          expect(await store.get("a")).toBe("b");
          await delay(20);
          expect(await store.get("a")).toBe(null);
        });

        it("removes the expired key with .keys()", async () => {
          await store.expires("10ms").set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          await delay(20);
          expect(await store.keys()).toEqual([]);
        });

        it("CANNOT remove the expired key with .values()", async () => {
          await store.expires("10ms").set("a", "b");
          expect(await store.values()).toEqual(["b"]);
          await delay(20);
          expect(await store.values()).toEqual([]);
        });
      } else {
        it("can use 1 (second) expire", async () => {
          await store.expires(1).set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(1100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });
        it("can use 1s expire", async () => {
          await store.expires("1s").set("a", "b");
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(1100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });
      }
    });

    describe("{ prefix }", () => {
      const session = store.prefix("session:");

      it("can write/read one", async () => {
        const id = await store.set("a", "b", { prefix: "session:" });
        expect(id).toBe("a");
        expect(await session.get("a")).toBe("b");
        expect(await store.get("session:a")).toBe("b");
      });

      it("checks the has properly", async () => {
        expect(await session.has("a")).toBe(false);
        await store.set("a", "b", { prefix: "session:" });
        expect(await session.has("a")).toBe(true);
      });

      it("can add with the prefix", async () => {
        const id = await store.add("b", { prefix: "session:" });
        expect(id.length).toBe(24);
        expect(id).not.toMatch(/^session\:/);

        const keys = await store.keys();
        expect(keys[0]).toMatch(/^session\:/);
      });

      it("the group operations return the proper values", async () => {
        await store.set("a", "b", { prefix: "session:" });

        expect(await session.keys()).toEqual(["a"]);
        expect(await session.values()).toEqual(["b"]);
        expect(await session.entries()).toEqual([["a", "b"]]);

        expect(await store.keys()).toEqual(["session:a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.entries()).toEqual([["session:a", "b"]]);
      });

      it("clears only the substore", async () => {
        await store.set("a", "b");
        await session.set("c", "d", { prefix: "session:" });

        expect((await store.keys()).sort()).toEqual(["a", "session:c"]);
        await session.clear();
        expect(await store.keys()).toEqual(["a"]);
      });

      it("does not leak between overlapping prefixes", async () => {
        const a = store.prefix("a:");
        const ab = store.prefix("a:b:");

        await store.set("1", "x", { prefix: "a:" });
        await store.set("2", "y", { prefix: "a:b:" });

        expect((await a.keys()).sort()).toEqual(["1", "b:2"]);
        expect(await ab.keys()).toEqual(["2"]);

        await ab.clear();

        expect(await a.keys()).toEqual(["1"]);
        expect(await ab.keys()).toEqual([]);
        expect(await store.keys()).toEqual(["a:1"]);
      });

      it("can store nested objects with a prefix", async () => {
        const pref = store.prefix("nested:");
        const data = { a: { b: 1 }, c: [1, 2, 3] };
        await store.set("obj", data, { prefix: "nested:" });
        expect(await pref.get("obj")).toEqual(data);
        expect(await store.get("nested:obj")).toEqual(data);
      });
    });

    describe(".prefix()", () => {
      const session = store.prefix("session:");

      it("has the same methods", () => {
        expect(Object.keys(store)).toEqual(Object.keys(session));
      });

      it("can write/read one", async () => {
        const id = await session.set("a", "b");
        expect(id).toBe("a");
        expect(await session.get("a")).toBe("b");
        expect(await store.get("session:a")).toBe("b");
      });

      it("checks the has properly", async () => {
        expect(await session.has("a")).toBe(false);
        await session.set("a", "b");
        expect(await session.has("a")).toBe(true);
      });

      it("can add with the prefix", async () => {
        const id = await session.add("b");
        expect(id.length).toBe(24);
        expect(id).not.toMatch(/^session\:/);

        const keys = await store.keys();
        expect(keys[0]).toMatch(/^session\:/);
      });

      it("the group operations return the proper values", async () => {
        await session.set("a", "b");

        expect(await session.keys()).toEqual(["a"]);
        expect(await session.values()).toEqual(["b"]);
        expect(await session.entries()).toEqual([["a", "b"]]);

        expect(await store.keys()).toEqual(["session:a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.entries()).toEqual([["session:a", "b"]]);
      });

      it("clears only the substore", async () => {
        await store.set("a", "b");
        await session.set("c", "d");

        expect((await store.keys()).sort()).toEqual(["a", "session:c"]);
        await session.clear();
        expect(await store.keys()).toEqual(["a"]);
      });

      it("does not leak between overlapping prefixes", async () => {
        const a = store.prefix("a:");
        const ab = store.prefix("a:b:");

        await a.set("1", "x");
        await ab.set("2", "y");

        expect((await a.keys()).sort()).toEqual(["1", "b:2"]);
        expect(await ab.keys()).toEqual(["2"]);

        await ab.clear();

        expect(await a.keys()).toEqual(["1"]);
        expect(await ab.keys()).toEqual([]);
        expect(await store.keys()).toEqual(["a:1"]);
      });

      it("can store nested objects with a prefix", async () => {
        const pref = store.prefix("nested:");
        const data = { a: { b: 1 }, c: [1, 2, 3] };
        await pref.set("obj", data);
        expect(await pref.get("obj")).toEqual(data);
        expect(await store.get("nested:obj")).toEqual(data);
      });
    });

    describe(".prefix().prefix()", () => {
      const auth = store.prefix("session:").prefix("auth:");

      it("can write/read one", async () => {
        const id = await auth.set("a", "b");
        expect(id).toBe("a");
        expect(await auth.get("a")).toBe("b");
        expect(await store.get("session:auth:a")).toBe("b");
      });

      it("can add with the prefix", async () => {
        const id = await auth.add("b");
        expect(id.length).toBe(24);
        expect(id).not.toMatch(/^session\:/);

        const keys = await store.keys();
        expect(keys[0]).toMatch(/^session\:auth\:/);
      });

      it("the group operations return the proper values", async () => {
        await auth.set("a", "b");

        expect(await auth.keys()).toEqual(["a"]);
        expect(await auth.values()).toEqual(["b"]);
        expect(await auth.entries()).toEqual([["a", "b"]]);

        expect(await store.keys()).toEqual(["session:auth:a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.entries()).toEqual([["session:auth:a", "b"]]);
      });

      it("iterates correctly with stacked prefixes", async () => {
        const auth = store.prefix("session:").prefix("auth:");

        await auth.set("a", "1");
        await auth.set("b", "2");

        const items = [];
        for await (const entry of auth) items.push(entry);

        expect(items.sort()).toEqual([
          ["a", "1"],
          ["b", "2"],
        ]);
      });

      it("clears only the substore", async () => {
        await store.set("a", "b");
        await auth.set("c", "d");

        expect((await store.keys()).sort()).toEqual(["a", "session:auth:c"]);
        await auth.clear();
        expect(await store.keys()).toEqual(["a"]);
      });
    });

    describe(".prune()", () => {
      if (cannotTestExpiration.includes(name)) return;

      it("removes expired records", async () => {
        if (!doNotSupportMs.includes(name) && !name.includes("http")) {
          await store.set("a", "b", { expires: "10ms" });
          await delay(20);
        } else {
          await store.set("a", "b", { expires: 1 });
          await delay(1100);
        }

        await store.prune();

        expect(await store.get("a")).toBe(null);
        expect(await store.keys()).toEqual([]);
      });

      it("does not remove fresh records", async () => {
        await store.set("a", "b");

        await store.prune();

        expect(await store.get("a")).toBe("b");
        expect(await store.keys()).toEqual(["a"]);
      });

      it("removes only expired records", async () => {
        if (!doNotSupportMs.includes(name) && !name.includes("http")) {
          await store.set("a", "b", { expires: "10ms" });
          await store.set("c", "d");
          await delay(20);
        } else {
          await store.set("a", "b", { expires: 1 });
          await store.set("c", "d");
          await delay(1100);
        }

        await store.prune();

        expect(await store.get("a")).toBe(null);
        expect(await store.get("c")).toBe("d");
        expect(await store.keys()).toEqual(["c"]);
      });

      it("respects prefix scoping", async () => {
        const pref = store.prefix("p:");

        if (!doNotSupportMs.includes(name) && !name.includes("http")) {
          await pref.set("a", "b", { expires: "10ms" });
          await store.set("x", "y");
          await delay(20);
        } else {
          await pref.set("a", "b", { expires: 1 });
          await store.set("x", "y");
          await delay(1100);
        }

        await pref.prune();

        expect(await pref.get("a")).toBe(null);
        expect(await store.get("x")).toBe("y");
        expect((await store.keys()).sort()).toEqual(["x"]);
      });
    });

    describe(".clear()", () => {
      it("removes all records", async () => {
        await store.set("a", "b");
        await store.set("c", "d");

        await store.clear();

        expect(await store.keys()).toEqual([]);
        expect(await store.get("a")).toBe(null);
        expect(await store.get("c")).toBe(null);
      });

      it("only clears the current prefix", async () => {
        const pref = store.prefix("p:");

        await pref.set("a", "b");
        await store.set("x", "y");

        await pref.clear();

        expect(await pref.keys()).toEqual([]);
        expect(await store.get("x")).toBe("y");
        expect(await store.keys()).toEqual(["x"]);
      });

      it("works when the store is already empty", async () => {
        await store.clear();

        expect(await store.keys()).toEqual([]);
      });

      it("clears prefixed data but keeps other prefixes", async () => {
        const a = store.prefix("a:");
        const b = store.prefix("b:");

        await a.set("k1", "v1");
        await b.set("k2", "v2");

        await a.clear();

        expect(await a.keys()).toEqual([]);
        expect(await b.get("k2")).toBe("v2");
      });
    });
  });
}
