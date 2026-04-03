import honoStore, { PolystoreHonoStore } from "./hono-sessions.js";
import type { SessionData } from "hono-sessions";

const makeSession = (expireInSecs?: number): SessionData => ({
  _data: { user: { value: "alice", flash: false } },
  _expire: expireInSecs
    ? new Date(Date.now() + expireInSecs * 1000).toISOString()
    : null,
  _delete: false,
  _accessed: null,
});

describe("honoStore factory", () => {
  it("returns a PolystoreHonoStore", () => {
    expect(honoStore()).toBeInstanceOf(PolystoreHonoStore);
  });

  it("accepts a custom client", () => {
    expect(honoStore(new Map())).toBeInstanceOf(PolystoreHonoStore);
  });
});

describe("PolystoreHonoStore", () => {
  let store: PolystoreHonoStore;

  beforeEach(() => {
    store = honoStore();
  });

  describe("getSessionById", () => {
    it("returns null for a missing session", async () => {
      expect(await store.getSessionById("nonexistent")).toBeNull();
    });

    it("returns null when no sessionId is given", async () => {
      expect(await store.getSessionById(undefined)).toBeNull();
    });
  });

  describe("createSession / getSessionById", () => {
    it("stores and retrieves a session", async () => {
      const data = makeSession();
      await store.createSession("sid1", data);
      const result = await store.getSessionById("sid1");
      expect(result?._data).toEqual(data._data);
    });
  });

  describe("persistSessionData", () => {
    it("updates session data", async () => {
      await store.createSession("sid2", makeSession());
      const updated = makeSession();
      updated._data = { user: { value: "bob", flash: false } };
      await store.persistSessionData("sid2", updated);
      const result = await store.getSessionById("sid2");
      expect(result?._data.user.value).toBe("bob");
    });
  });

  describe("deleteSession", () => {
    it("removes a session", async () => {
      await store.createSession("sid3", makeSession());
      await store.deleteSession("sid3");
      expect(await store.getSessionById("sid3")).toBeNull();
    });

    it("does not error when deleting a non-existent session", async () => {
      await store.deleteSession("ghost");
    });
  });

  describe("TTL from _expire", () => {
    it("stores session without expiry when _expire is null", async () => {
      await store.createSession("sid4", makeSession());
      expect(await store.getSessionById("sid4")).not.toBeNull();
    });

    it("stores session with TTL when _expire is set", async () => {
      await store.createSession("sid5", makeSession(60));
      expect(await store.getSessionById("sid5")).not.toBeNull();
    });
  });

  describe("prefix", () => {
    it("returns a PolystoreHonoStore", () => {
      expect(store.prefix("tenant:")).toBeInstanceOf(PolystoreHonoStore);
    });

    it("scopes sessions under a prefix", async () => {
      const scoped = store.prefix("tenant:");
      await scoped.createSession("sid6", makeSession());
      expect(await scoped.getSessionById("sid6")).not.toBeNull();
    });

    it("prefixed and un-prefixed stores do not share keys", async () => {
      const scoped = store.prefix("ns:");
      await scoped.createSession("sid7", makeSession());
      expect(await store.getSessionById("sid7")).toBeNull();
    });
  });
});
