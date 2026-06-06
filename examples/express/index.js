import express from "express";
import session from "express-session";
import expressStore from "polystore/express";

const app = express();

app.use(session({
  secret: "your-secret-here",
  resave: false,
  saveUninitialized: false,
  store: expressStore(new Map()),  // swap new Map() for Redis, SQLite, etc.
}));

app.get("/", (req, res) => {
  const views = req.session.views = (req.session.views || 0) + 1;
  res.json({ views });
});

app.listen(3000, () => console.log("http://localhost:3000"));
