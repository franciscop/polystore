# Polystore + Hono Sessions

Uses Polystore as the session store for [hono-sessions](https://github.com/jcs224/hono_sessions).

```sh
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) — each request increments the session view counter.

## How it works

```js
import honoStore from "polystore/hono-sessions";

app.use(sessionMiddleware({
  store: honoStore(new Map()),  // swap for Redis, SQLite, Postgres, etc.
  encryptionKey: "your-32-character-encryption-key!",
  expireAfterSeconds: 3600,
}));
```

Session TTL is derived automatically from `expireAfterSeconds`.

## Swap the store

Any Polystore adapter works:

```js
import { createClient } from "redis";

store: honoStore(createClient().connect())
```
