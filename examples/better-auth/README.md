# Polystore + Better Auth

Uses Polystore as the [`secondaryStorage`](https://www.better-auth.com/docs/concepts/database#secondary-storage) for [Better Auth](https://better-auth.com) — no database required.

```sh
npm install
npm start
```

The auth API is available at [http://localhost:3000/api/auth](http://localhost:3000/api/auth).

## How it works

```js
import betterAuthStorage from "polystore/better-auth";

const auth = betterAuth({
  secondaryStorage: betterAuthStorage(new Map()),  // swap for Redis, SQLite, Postgres, etc.
  emailAndPassword: { enabled: true },
});
```

`secondaryStorage` handles session caching and token storage. A database is optional — Better Auth can run fully stateless with just a secondary store.

## Swap the store

Any Polystore adapter works:

```js
import { createClient } from "redis";

secondaryStorage: betterAuthStorage(createClient().connect())
```
