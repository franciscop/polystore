import "dotenv/config";

import localForage from "localforage";
import { createClient } from "redis";

import kv from "./";

global.setImmediate = global.setImmediate || ((cb) => setTimeout(cb, 0));

const stores = [];
stores.push(["kv()", kv()]);
stores.push(["kv(new Map())", kv(new Map())]);
stores.push(["kv(localStorage)", kv(localStorage)]);
stores.push(["kv(sessionStorage)", kv(sessionStorage)]);
stores.push(["kv(localForage)", kv(localForage)]);
const path = `file://${process.cwd()}/src/test/data.json`;
stores.push([`kv(new URL("${path}"))`, kv(new URL(path))]);
if (process.env.REDIS) {
  stores.push(["kv(redis)", kv(createClient().connect())]);
}
stores.push(["kv('cookie')", kv("cookie")]);

const delay = (t) => new Promise((done) => setTimeout(done, t));

describe("potato", () => {
  it("a potato is not a valid store", async () => {
    await expect(() => kv("potato").get("any")).rejects.toThrow();
  });
});

for (let [name, store] of stores) {
  describe(name, () => {
    beforeEach(async () => {
      await store.clear();
    });

    afterAll(async () => {
      await store.clear();
      if (store.close) {
        await store.close();
      }
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
      expect((await store.keys("a:")).sort()).toEqual(["a:0", "a:1", "a:2"]);
    });

    it("can get the values with a colon prefix", async () => {
      await store.set("a:0", "a0");
      await store.set("a:1", "a1");
      await store.set("b:0", "b0");
      await store.set("a:2", "a2");
      expect((await store.values("a:")).sort()).toEqual(["a0", "a1", "a2"]);
    });

    it("can get the entries with a colon prefix", async () => {
      await store.set("a:0", "a0");
      await store.set("a:1", "a1");
      await store.set("b:0", "b0");
      await store.set("a:2", "a2");
      expect((await store.entries("a:")).sort()).toEqual([
        ["a:0", "a0"],
        ["a:1", "a1"],
        ["a:2", "a2"],
      ]);
    });

    it("can get the all object with a colon prefix", async () => {
      await store.set("a:0", "a0");
      await store.set("a:1", "a1");
      await store.set("b:0", "b0");
      await store.set("a:2", "a2");
      expect(await store.all("a:")).toEqual({
        "a:0": "a0",
        "a:1": "a1",
        "a:2": "a2",
      });
    });

    it("can get the keys with a dash prefix", async () => {
      await store.set("a-0", "a0");
      await store.set("a-1", "a1");
      await store.set("b-0", "b0");
      await store.set("a-2", "a2");
      expect((await store.keys("a-")).sort()).toEqual(["a-0", "a-1", "a-2"]);
    });

    it("can get the values with a dash prefix", async () => {
      await store.set("a-0", "a0");
      await store.set("a-1", "a1");
      await store.set("b-0", "b0");
      await store.set("a-2", "a2");
      expect((await store.values("a-")).sort()).toEqual(["a0", "a1", "a2"]);
    });

    it("can get the entries with a dash prefix", async () => {
      await store.set("a-0", "a0");
      await store.set("a-1", "a1");
      await store.set("b-0", "b0");
      await store.set("a-2", "a2");
      expect((await store.entries("a-")).sort()).toEqual([
        ["a-0", "a0"],
        ["a-1", "a1"],
        ["a-2", "a2"],
      ]);
    });

    it("can get the all object with a dash prefix", async () => {
      await store.set("a-0", "a0");
      await store.set("a-1", "a1");
      await store.set("b-0", "b0");
      await store.set("a-2", "a2");
      expect(await store.all("a-")).toEqual({
        "a-0": "a0",
        "a-1": "a1",
        "a-2": "a2",
      });
    });

    it("can delete the data", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      await store.del("a");
      expect(await store.get("a")).toBe(null);
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
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01s expire", async () => {
          await store.set("a", "b", { expires: "0.01s" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01seconds expire", async () => {
          await store.set("a", "b", { expires: "0.01seconds" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 10ms expire", async () => {
          await store.set("a", "b", { expires: "10ms" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });
      } else {
        it("can use 1 (second) expire", async () => {
          await store.set("a", "b", { expires: 1 });
          expect(await store.get("a")).toBe("b");
          await delay(2000);
          expect(await store.get("a")).toBe(null);
        });
        it("can use 1s expire", async () => {
          await store.set("a", "b", { expires: "1s" });
          expect(await store.get("a")).toBe("b");
          await delay(2000);
          expect(await store.get("a")).toBe(null);
        });
      }
    });

    describe(".prefix()", () => {
      const session = store.prefix("session:");

      it("has all the methods", () => {
        expect(Object.keys(session)).toEqual([
          "get",
          "set",
          "add",
          "has",
          "del",
          "keys",
          "values",
          "entries",
          "clear",
          "close",
        ]);
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
  });
}
