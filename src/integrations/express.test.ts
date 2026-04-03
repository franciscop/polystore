import { EventEmitter } from "events";
import expressStore, { PolystoreSessionStore } from "./express.js";

const makeSession = (maxAge: number | null = null) => ({
  cookie: { originalMaxAge: maxAge },
  user: "alice",
});

const promisify = (fn: (cb: (err: any, result?: any) => void) => void) =>
  new Promise<any>((resolve, reject) =>
    fn((err, result) => (err ? reject(err) : resolve(result))),
  );

describe("expressStore factory", () => {
  it("returns a PolystoreSessionStore", () => {
    expect(expressStore()).toBeInstanceOf(PolystoreSessionStore);
  });

  it("is an EventEmitter", () => {
    expect(expressStore()).toBeInstanceOf(EventEmitter);
  });

  it("accepts a custom client", () => {
    expect(expressStore(new Map())).toBeInstanceOf(PolystoreSessionStore);
  });
});

describe("PolystoreSessionStore", () => {
  let store: PolystoreSessionStore;

  beforeEach(() => {
    store = expressStore();
  });

  describe("get", () => {
    it("returns null for a missing session", async () => {
      const result = await promisify((cb) => store.get("nonexistent", cb));
      expect(result).toBeNull();
    });

    it("treats ENOENT errors as null", async () => {
      const enoent = Object.assign(new Error("not found"), { code: "ENOENT" });
      const badStore = expressStore({
        get: () => Promise.reject(enoent),
        set: () => Promise.resolve(""),
        iterate: async function* () {},
      } as any);

      const result = await new Promise<any>((resolve, reject) =>
        badStore.get("sid", (err, data) => (err ? reject(err) : resolve(data))),
      );
      expect(result).toBeNull();
    });
  });

  describe("set / get", () => {
    it("stores and retrieves a session", async () => {
      await promisify((cb) => store.set("sid1", makeSession() as any, cb));
      const result = await promisify((cb) => store.get("sid1", cb));
      expect(result).toMatchObject({ user: "alice" });
    });
  });

  describe("destroy", () => {
    it("removes a session", async () => {
      await promisify((cb) => store.set("sid2", makeSession() as any, cb));
      await promisify((cb) => store.destroy("sid2", cb));
      expect(await promisify((cb) => store.get("sid2", cb))).toBeNull();
    });

    it("does not error when destroying a non-existent session", async () => {
      await promisify((cb) => store.destroy("ghost", cb));
    });
  });

  describe("touch", () => {
    it("updates session data", async () => {
      await promisify((cb) => store.set("sid3", makeSession() as any, cb));
      await promisify((cb) =>
        store.touch("sid3", { ...makeSession(), user: "bob" } as any, cb),
      );
      expect(await promisify((cb) => store.get("sid3", cb))).toMatchObject({
        user: "bob",
      });
    });

    it("resets TTL from cookie.originalMaxAge", async () => {
      const session = makeSession(60_000) as any;
      await promisify((cb) => store.set("sid4", session, cb));
      await promisify((cb) =>
        store.touch("sid4", { ...session, cookie: { originalMaxAge: 120_000 } }, cb),
      );
      expect(await promisify((cb) => store.get("sid4", cb))).toMatchObject({
        user: "alice",
      });
    });
  });

  describe("all", () => {
    it("returns all stored sessions", async () => {
      await promisify((cb) => store.set("a", makeSession() as any, cb));
      await promisify((cb) =>
        store.set("b", { ...makeSession(), user: "bob" } as any, cb),
      );
      const sessions = await promisify((cb) => store.all(cb));
      expect(sessions).toHaveLength(2);
    });

    it("returns an empty array when the store is empty", async () => {
      const sessions = await promisify((cb) => store.all(cb));
      expect(sessions).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes all sessions", async () => {
      await promisify((cb) => store.set("a", makeSession() as any, cb));
      await promisify((cb) => store.set("b", makeSession() as any, cb));
      await promisify((cb) => store.clear(cb));
      const sessions = await promisify((cb) => store.all(cb));
      expect(sessions).toEqual([]);
    });
  });

  describe("TTL from cookie.originalMaxAge", () => {
    it("stores session without expiry when originalMaxAge is null", async () => {
      await promisify((cb) => store.set("sid5", makeSession(null) as any, cb));
    });

    it("stores session with TTL when originalMaxAge is set", async () => {
      await promisify((cb) =>
        store.set("sid6", makeSession(60_000) as any, cb),
      );
      expect(await promisify((cb) => store.get("sid6", cb))).toMatchObject({
        user: "alice",
      });
    });
  });

  describe("prefix", () => {
    it("scopes sessions under a prefix", async () => {
      const scoped = store.prefix("tenant:");
      expect(scoped).toBeInstanceOf(PolystoreSessionStore);
      await promisify((cb) => scoped.set("sid7", makeSession() as any, cb));
      expect(await promisify((cb) => scoped.get("sid7", cb))).toMatchObject({
        user: "alice",
      });
    });

    it("prefixed and un-prefixed stores do not share keys", async () => {
      const scoped = store.prefix("ns:");
      await promisify((cb) => scoped.set("sid8", makeSession() as any, cb));
      expect(await promisify((cb) => store.get("sid8", cb))).toBeNull();
    });
  });
});
