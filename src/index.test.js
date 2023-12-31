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

    it("can store values", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      expect(await store.has("a")).toBe(true);
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
      await store.set("a", ["b"]);
      expect(await store.get("a")).toEqual(["b"]);
      expect(await store.has("a")).toBe(true);
    });

    it("can store objects", async () => {
      await store.set("a", { b: "c" });
      expect(await store.get("a")).toEqual({ b: "c" });
      expect(await store.has("a")).toBe(true);
    });

    it("can retrieve the prefixed keys with colon", async () => {
      await store.set("a:0", "a0");
      await store.set("a:1", "a1");
      await store.set("b:0", "b0");
      await store.set("a:2", "b2");
      expect((await store.keys("a:")).sort()).toEqual(["a:0", "a:1", "a:2"]);
    });

    it("can retrieve the prefixed keys with dash", async () => {
      await store.set("a-0", "a0");
      await store.set("a-1", "a1");
      await store.set("b-0", "b0");
      await store.set("a-2", "b2");
      expect((await store.keys("a-")).sort()).toEqual(["a-0", "a-1", "a-2"]);
    });

    it("can delete the data", async () => {
      await store.set("a", "b");
      expect(await store.get("a")).toBe("b");
      await store.del("a");
      expect(await store.get("a")).toBe(null);
    });

    it("can get the keys", async () => {
      await store.set("a", "b");
      await store.set("c", "d");
      expect(await store.keys()).toEqual(["a", "c"]);
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
        it("can use 10 expire", async () => {
          await store.set("a", "b", { expires: 10 });
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
        it("can use 1000 expire", async () => {
          await store.set("a", "b", { expires: 1000 });
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
  });
}
