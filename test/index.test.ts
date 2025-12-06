import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";

import "cross-fetch/polyfill";
import "dotenv/config";

import type { Store } from "../src/index";
import kv from "../src/index";
import stores from "./stores";

const doNotSupportMs = [
  `kv("cookie")`,
  `kv(redis)`,
  `kv(new Etcd3())`,
  `kv(customCloudflare)`,
];

const longerThan60s = [`kv(customCloudflare)`];

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

class Base {
  get(): void {}
  set(): void {}
  *iterate(): Generator<void, void, unknown> {}
}

global.console = {
  ...console,
  warn: jest.fn() as any,
};

describe("potato", () => {
  it("a potato is not a valid store", async () => {
    expect(kv("potato").get("any")).rejects.toThrow();
  });

  it("no client is not a valid store", async () => {
    expect(kv().get("any")).rejects.toThrow("No client received");
  });

  it("an empty object is not a valid store", async () => {
    expect(kv({}).get("any")).rejects.toThrow(
      "Client should have .get(), .set() and .iterate()",
    );
  });

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
});

describe.each(Object.entries(stores))("%s", (name, store) => {
  beforeEach(async () => {
    await store.clear();
  });

  afterAll(async () => {
    await store.clear();
    await store.close();
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

  it("can get the all object", async () => {
    await store.set("a", "b");
    await store.set("c", "d");
    expect(await store.all()).toEqual({
      a: "b",
      c: "d",
    });
  });

  it("can get the keys with a colon prefix", async () => {
    await store.set("a:0", "a0");
    await store.set("a:1", "a1");
    await store.set("b:0", "b0");
    await store.set("a:2", "a2");
    expect((await store.keys()).sort()).toEqual(["a:0", "a:1", "a:2", "b:0"]);
    expect((await store.prefix("a:").keys()).sort()).toEqual(["0", "1", "2"]);
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
    expect((await store.keys()).sort()).toEqual(["a-0", "a-1", "a-2", "b-0"]);
    expect((await store.prefix("a-").keys()).sort()).toEqual(["0", "1", "2"]);
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
  });

  describe("expires", () => {
    // The mock implementation does NOT support expiration 😪
    if (name === "kv(new KVNamespace())") return;

    // Some stores expect 60s+ expiration times, too long to test 😪
    if (longerThan60s.includes(name)) return;

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("expires = 0 means immediately", async () => {
      await store.set("a", "b", { expires: 0 });
      expect(await store.get("a")).toBe(null);
      expect(await store.has("a")).toBe(false);
      expect(await store.keys()).toEqual([]);
      expect(await store.values()).toEqual([]);
      expect(await store.entries()).toEqual([]);
    });

    it("expires = potato means undefined = forever", async () => {
      await store.set("a", "b", { expires: "potato" as any });
      expect(await store.get("a")).toBe("b");
      await delay(100);
      expect(await store.get("a")).toBe("b");
    });

    it("expires = 5potato means undefined = forever", async () => {
      await store.set("a", "b", { expires: "5potato" as any });
      expect(await store.get("a")).toBe("b");
      await delay(100);
      expect(await store.get("a")).toBe("b");
    });

    it("expires = null means never to expire it", async () => {
      await store.set("a", "b", { expires: null });
      expect(await store.get("a")).toBe("b");
      await delay(100);
      expect(await store.get("a")).toBe("b");
    });

    it("expires = undefined means never to expire it", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      await delay(100);
      expect(await store.get("a")).toBe("b");
    });

    if (!doNotSupportMs.includes(name) && !name.includes("http")) {
      it("can use 0.1 expire", async () => {
        // 10ms
        await store.set("a", "b", { expires: 0.1 });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(200);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });

      it("can use 0.1s expire", async () => {
        await store.set("a", "b", { expires: "0.1s" });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(200);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });

      it("can use 0.1seconds expire", async () => {
        await store.set("a", "b", { expires: "0.1seconds" });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(200);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });

      it("can use 100ms expire", async () => {
        await store.set("a", "b", { expires: "100ms" });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(300);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });

      it("removes the expired key with .get()", async () => {
        await store.set("a", "b", { expires: "10ms" });
        const spy = jest.spyOn(store, "del");
        expect(spy).not.toHaveBeenCalled();
        await delay(100);
        expect(spy).not.toHaveBeenCalled(); // Nothing we can do 😪
        expect(await store.get("a")).toBe(null);
        expect(spy).toHaveBeenCalled();
      });

      it("removes the expired key with .keys()", async () => {
        await store.set("a", "b", { expires: "10ms" });
        const spy = jest.spyOn(store, "del");
        expect(spy).not.toHaveBeenCalled();
        await delay(100);
        expect(spy).not.toHaveBeenCalled(); // Nothing we can do 😪
        expect(await store.keys()).toEqual([]);
        expect(spy).toHaveBeenCalled();
      });

      it("CANNOT remove the expired key with .values()", async () => {
        await store.set("a", "b", { expires: "10ms" });
        const spy = jest.spyOn(store, "del");
        expect(spy).not.toHaveBeenCalled();
        await delay(100);
        expect(spy).not.toHaveBeenCalled(); // Nothing we can do 😪
        expect(await store.values()).toEqual([]);
        if (!(store as any).client.EXPIRES && (store as any).client.values) {
          expect(spy).not.toHaveBeenCalled(); // Nothing we can do 😪😪
        } else {
          expect(spy).toHaveBeenCalled();
        }
      });
    } else {
      it("can use 1 (second) expire", async () => {
        await store.set("a", "b", { expires: 1 });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(2000);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });
      it("can use 1s expire", async () => {
        await store.set("a", "b", { expires: "1s" });
        expect(await store.keys()).toEqual(["a"]);
        expect(await store.values()).toEqual(["b"]);
        expect(await store.get("a")).toBe("b");
        await delay(2000);
        expect(await store.keys()).toEqual([]);
        expect(await store.values()).toEqual([]);
        expect(await store.get("a")).toBe(null);
      });
    }
  });

  describe(".prefix()", () => {
    let session: Store;
    beforeAll(() => {
      session = store.prefix("session:");
    });

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
  });

  describe(".prefix().prefix()", () => {
    let auth: Store;
    beforeAll(() => {
      auth = store.prefix("session:").prefix("auth:");
    });

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

    it("clears only the substore", async () => {
      await store.set("a", "b");
      await auth.set("c", "d");

      expect((await store.keys()).sort()).toEqual(["a", "session:auth:c"]);
      await auth.clear();
      expect(await store.keys()).toEqual(["a"]);
    });
  });
});
