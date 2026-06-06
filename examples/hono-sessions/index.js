import { Hono } from "hono";
import { sessionMiddleware } from "hono-sessions";
import honoStore from "polystore/hono-sessions";

const app = new Hono();

app.use(sessionMiddleware({
  store: honoStore(new Map()),  // swap new Map() for Redis, SQLite, etc.
  encryptionKey: "your-32-character-encryption-key!",
  expireAfterSeconds: 3600,
  cookieOptions: { sameSite: "Lax", httpOnly: true },
}));

app.get("/", (c) => {
  const session = c.get("session");
  const views = (session.get("views") || 0) + 1;
  session.set("views", views);
  return c.json({ views });
});

export default app;
