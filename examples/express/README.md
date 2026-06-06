# Polystore + Express

Uses Polystore as the session store for [express-session](https://github.com/expressjs/session).

```sh
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) — each refresh increments the session view counter.

## How it works

```js
import expressStore from "polystore/express";

app.use(session({
  secret: "your-secret",
  store: expressStore(new Map()),  // swap for Redis, SQLite, Postgres, etc.
}));
```

Session TTL is read automatically from `cookie.originalMaxAge` — no extra configuration needed.

## Swap the store

Any Polystore adapter works:

```js
import { createClient } from "redis";

store: expressStore(createClient().connect())
```
