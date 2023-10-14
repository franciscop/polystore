import "dotenv/config";

import { createClient } from "redis";

import kv from "./";

global.setImmediate = global.setImmediate || ((cb) => setTimeout(cb, 0));

const stores = [];
stores.push(["kv()", kv()]);
stores.push(["kv(new Map())", kv(new Map())]);
stores.push(["kv(localStorage)", kv(localStorage)]);
stores.push(["kv(sessionStorage)", kv(sessionStorage)]);
if (process.env.REDIS) {
  stores.push(["kv(redis)", kv(createClient().connect())]);
}
stores.push(["kv('cookie')", kv("cookie")]);

const delay = (t) => new Promise((done) => setTimeout(done, t));

for (let [name, store] of stores) {
  describe(name, () => {
    beforeEach(async () => {
      await store.clear();
    });

    afterAll(async () => {
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
      it("expire = 0 means immediately", async () => {
        await store.set("a", "b", { expire: 0 });
        expect(await store.get("a")).toBe(null);
      });

      it("expire = potato means undefined = forever", async () => {
        await store.set("a", "b", { expire: "potato" });
        expect(await store.get("a")).toBe("b");
        await delay(100);
        expect(await store.get("a")).toBe("b");
      });

      it("expire = 5potato means undefined = forever", async () => {
        await store.set("a", "b", { expire: "5potato" });
        expect(await store.get("a")).toBe("b");
        await delay(100);
        expect(await store.get("a")).toBe("b");
      });

      it("expire = null means never to expire it", async () => {
        await store.set("a", "b", { expire: null });
        expect(await store.get("a")).toBe("b");
        await delay(100);
        expect(await store.get("a")).toBe("b");
      });

      it("expire = undefined means never to expire it", async () => {
        await store.set("a", "b");
        expect(await store.get("a")).toBe("b");
        await delay(100);
        expect(await store.get("a")).toBe("b");
      });

      if (name !== "kv('cookie')" && name !== "kv(redis)") {
        it("can use 10 expire", async () => {
          await store.set("a", "b", { expire: 10 });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01s expire", async () => {
          await store.set("a", "b", { expire: "0.01s" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 0.01seconds expire", async () => {
          await store.set("a", "b", { expire: "0.01seconds" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });

        it("can use 10ms expire", async () => {
          await store.set("a", "b", { expire: "10ms" });
          expect(await store.get("a")).toBe("b");
          await delay(100);
          expect(await store.get("a")).toBe(null);
        });
      } else {
        it("can use 1000 expire", async () => {
          await store.set("a", "b", { expire: 1000 });
          expect(await store.get("a")).toBe("b");
          await delay(2000);
          expect(await store.get("a")).toBe(null);
        });
        it("can use 1s expire", async () => {
          await store.set("a", "b", { expire: "1s" });
          expect(await store.get("a")).toBe("b");
          await delay(2000);
          expect(await store.get("a")).toBe(null);
        });
      }
    });
  });
}
