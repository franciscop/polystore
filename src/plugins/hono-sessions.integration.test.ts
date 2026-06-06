import { Hono } from "hono";
import { sessionMiddleware } from "hono-sessions";
import honoStore, { PolystoreHonoStore } from "./hono-sessions.js";

const ENCRYPTION_KEY = "polystore-test-key-32-chars-long!";

const makeApp = (store: PolystoreHonoStore) => {
  const app = new Hono<{ Variables: { session: any } }>();

  app.use(
    "*",
    sessionMiddleware({
      store,
      encryptionKey: ENCRYPTION_KEY,
      expireAfterSeconds: 3600,
      cookieOptions: { sameSite: "Lax", httpOnly: true, secure: false },
    }),
  );

  app.get("/set", (c) => {
    c.get("session").set("user", "alice");
    return c.json({ ok: true });
  });

  app.get("/get", (c) => {
    const user = c.get("session").get("user");
    return c.json({ user: user ?? null });
  });

  app.get("/destroy", (c) => {
    c.get("session").deleteSession();
    return c.json({ ok: true });
  });

  return app;
};

const cookieFrom = (res: Response) =>
  res.headers.get("set-cookie")?.split(";")[0];

describe("Hono integration", () => {
  let store: PolystoreHonoStore;
  let app: Hono<{ Variables: { session: any } }>;

  beforeEach(() => {
    store = honoStore();
    app = makeApp(store);
  });

  describe("set / get", () => {
    it("persists session data across requests", async () => {
      const res1 = await app.request("/set");
      expect(res1.status).toBe(200);
      const cookie = cookieFrom(res1);

      const res2 = await app.request("/get", {
        headers: { cookie: cookie! },
      });
      expect(await res2.json()).toEqual({ user: "alice" });
    });

    it("returns null for an unknown session", async () => {
      const res = await app.request("/get", {
        headers: { cookie: "session=unknown" },
      });
      expect(await res.json()).toEqual({ user: null });
    });
  });

  describe("destroy", () => {
    it("clears session data", async () => {
      const res1 = await app.request("/set");
      const cookie = cookieFrom(res1);

      await app.request("/destroy", { headers: { cookie: cookie! } });

      const res3 = await app.request("/get", { headers: { cookie: cookie! } });
      expect(await res3.json()).toEqual({ user: null });
    });
  });

  describe("TTL from expireAfterSeconds", () => {
    it("session is accessible within TTL", async () => {
      const res1 = await app.request("/set");
      const cookie = cookieFrom(res1);

      const res2 = await app.request("/get", { headers: { cookie: cookie! } });
      expect(await res2.json()).toEqual({ user: "alice" });
    });
  });

  describe("prefix", () => {
    it("isolates sessions between tenants", async () => {
      const storeA = honoStore();
      const storeB = storeA.prefix("tenant-b:");
      const appA = makeApp(storeA);
      const appB = makeApp(storeB as any);

      const res1 = await appA.request("/set");
      const cookieA = cookieFrom(res1);

      const res2 = await appB.request("/get", {
        headers: { cookie: cookieA! },
      });
      expect(await res2.json()).toEqual({ user: null });
    });
  });
});
