import express from "express";
import session from "express-session";
import request from "supertest";
import expressStore, { PolystoreSessionStore } from "./express.js";

const makeApp = (store: PolystoreSessionStore, maxAge?: number) => {
  const app = express();
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { maxAge, secure: false },
    }),
  );

  app.get("/set", (req: any, res) => {
    req.session.user = "alice";
    res.sendStatus(200);
  });

  app.get("/get", (req: any, res) => {
    res.json({ user: req.session.user ?? null });
  });

  app.get("/destroy", (req: any, res) => {
    req.session.destroy(() => res.sendStatus(200));
  });

  return app;
};

const cookieFrom = (res: request.Response) =>
  res.headers["set-cookie"]?.[0]?.split(";")[0];

describe("Express integration", () => {
  let store: PolystoreSessionStore;
  let app: express.Express;

  beforeEach(() => {
    store = expressStore();
    app = makeApp(store);
  });

  describe("set / get", () => {
    it("persists session data across requests", async () => {
      const res1 = await request(app).get("/set");
      expect(res1.status).toBe(200);
      const cookie = cookieFrom(res1);

      const res2 = await request(app).get("/get").set("Cookie", cookie!);
      expect(res2.body).toEqual({ user: "alice" });
    });

    it("returns null for an unknown session", async () => {
      const res = await request(app)
        .get("/get")
        .set("Cookie", "connect.sid=s%3Afake.fake");
      expect(res.body).toEqual({ user: null });
    });
  });

  describe("destroy", () => {
    it("clears session data", async () => {
      const res1 = await request(app).get("/set");
      const cookie = cookieFrom(res1);

      await request(app).get("/destroy").set("Cookie", cookie!);

      const res3 = await request(app).get("/get").set("Cookie", cookie!);
      expect(res3.body).toEqual({ user: null });
    });
  });

  describe("TTL from cookie.maxAge", () => {
    it("session is accessible when TTL is set", async () => {
      const appWithTTL = makeApp(expressStore(), 60_000);
      const res1 = await request(appWithTTL).get("/set");
      const cookie = cookieFrom(res1);

      const res2 = await request(appWithTTL).get("/get").set("Cookie", cookie!);
      expect(res2.body).toEqual({ user: "alice" });
    });

    it("session is accessible with no TTL (browser session)", async () => {
      const res1 = await request(app).get("/set");
      const cookie = cookieFrom(res1);

      const res2 = await request(app).get("/get").set("Cookie", cookie!);
      expect(res2.body).toEqual({ user: "alice" });
    });
  });

  describe("all", () => {
    it("returns all active sessions", async () => {
      await request(app).get("/set");
      await request(app).get("/set");

      const sessions = await new Promise<any[]>((resolve, reject) =>
        store.all((err, s) => (err ? reject(err) : resolve(s as any[]))),
      );
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array when no sessions exist", async () => {
      const sessions = await new Promise<any[]>((resolve, reject) =>
        store.all((err, s) => (err ? reject(err) : resolve(s as any[]))),
      );
      expect(sessions).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes all sessions", async () => {
      const res1 = await request(app).get("/set");
      const cookie = cookieFrom(res1);

      await new Promise<void>((resolve, reject) =>
        store.clear((err) => (err ? reject(err) : resolve())),
      );

      const res2 = await request(app).get("/get").set("Cookie", cookie!);
      expect(res2.body).toEqual({ user: null });
    });
  });

  describe("prefix", () => {
    it("isolates sessions between tenants", async () => {
      const storeA = expressStore();
      const storeB = storeA.prefix("tenant-b:");
      const appA = makeApp(storeA);
      const appB = makeApp(storeB as any);

      const res1 = await request(appA).get("/set");
      const cookieA = cookieFrom(res1);

      const res2 = await request(appB).get("/get").set("Cookie", cookieA!);
      expect(res2.body).toEqual({ user: null });
    });
  });
});
