import "dotenv/config";

import { jest } from "@jest/globals";
import { EdgeKVNamespace as KVNamespace } from "edge-mock";
import localForage from "localforage";
import { createClient } from "redis";

import kv from "./";
import customFull from "./test/customFull.js";
import customSimple from "./test/customSimple.js";

global.setImmediate = global.setImmediate || ((cb) => setTimeout(cb, 0));

const stores = [];
stores.push(["kv()", kv()]);
stores.push(["kv(new Map())", kv(new Map())]);
stores.push(["kv(localStorage)", kv(localStorage)]);
stores.push(["kv(sessionStorage)", kv(sessionStorage)]);
stores.push(["kv(localForage)", kv(localForage)]);
const path = `file://${process.cwd()}/src/test/data.json`;
stores.push([`kv(new URL("${path}"))`, kv(new URL(path))]);
const path2 = `file://${process.cwd()}/src/test/data.json`;
stores.push([`kv("${path2}")`, kv(path2)]);
if (process.env.REDIS) {
  stores.push(["kv(redis)", kv(createClient().connect())]);
}
stores.push(["kv('cookie')", kv("cookie")]);
stores.push(["kv(new KVNamespace())", kv(new KVNamespace())]);

stores.push(["kv(customSimple)", kv(customSimple)]);
stores.push(["kv(customFull)", kv(customFull)]);

const delay = (t) => new Promise((done) => setTimeout(done, t));

class Base {
  get() {}
  set() {}
  entries() {}
}

global.console = {
  ...console,
  warn: jest.fn(),
};

describe("potato", () => {
  it("a potato is not a valid store", async () => {
    await expect(() => kv("potato").get("any")).rejects.toThrow();
  });

  it("an empty object is not a valid store", async () => {
    await expect(() => kv({}).get("any")).rejects.toThrow({
      message: "A client should have at least a .get(), .set() and .entries()",
    });
  });

  it("cannot handle no EXPIRES + keys", async () => {
    await expect(() =>
      kv(
        class extends Base {
          has() {}
        }
      ).get("any")
    ).rejects.toThrow({
      message:
        "You can only define client.has() when the client manages the expiration; otherwise please do NOT define .has() and let us manage it",
    });
  });

  it("cannot handle no EXPIRES + keys", async () => {
    await expect(() =>
      kv(
        class extends Base {
          keys() {}
        }
      ).get("any")
    ).rejects.toThrow({
      message:
        "You can only define client.keys() when the client manages the expiration; otherwise please do NOT define .keys() and let us manage them",
    });
  });

  it("warns the user with no EXPIRES + .values()", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementationOnce(() => "Hello");
    await kv(
      class extends Base {
        values() {}
      }
    ).get("any");
    expect(warn).toHaveBeenCalled(); // But at least we warn them
    warn.mockClear();
  });
});

for (let [name, store] of stores) {
  describe(name, () => {
    beforeEach(async () => {
      await store.clear();
    });

    afterAll(async () => {
      await store.clear();
      await store.close();
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
      expect(await store.keys()).toEqual(["a", "c"]);
    });

    it("can get the values", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      expect(await store.values()).toEqual(["b", "d"]);
    });

    it("can get the entries", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      expect(await store.entries()).toEqual([
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

    describe("expires", () => {
      // The mock implementation does NOT support expiration 😪
      if (name === "kv(new KVNamespace())") return;

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
        await store.set("a", "b", { expires: "potato" });
        expect(await store.get("a")).toBe("b");
        await delay(100);
        expect(await store.get("a")).toBe("b");
      });

      it("expires = 5potato means undefined = forever", async () => {
        await store.set("a", "b", { expires: "5potato" });
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

      if (name !== "kv('cookie')" && name !== "kv(redis)") {
        it("can use 0.01 expire", async () => {
          // 10ms
          await store.set("a", "b", { expires: 0.01 });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01s expire", async () => {
          await store.set("a", "b", { expires: "0.01s" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01seconds expire", async () => {
          await store.set("a", "b", { expires: "0.01seconds" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.keys()).toEqual([]);
          expect(await store.values()).toEqual([]);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 10ms expire", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.keys()).toEqual(["a"]);
          expect(await store.values()).toEqual(["b"]);
          expect(await store.get("a")).toBe("b");
          await delay(100);
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
          if (!store.client.EXPIRES && store.client.values) {
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
      let session;
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
      let auth;
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
}
