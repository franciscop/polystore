# Polystore [![npm install polystore](https://img.shields.io/badge/npm%20install-polystore-blue.svg)](https://www.npmjs.com/package/polystore) [![test badge](https://github.com/franciscop/fetch/workflows/tests/badge.svg "test badge")](https://github.com/franciscop/fetch/blob/master/.github/workflows/tests.yml) [![gzip size](https://img.badgesize.io/franciscop/fetch/master/index.min.js.svg?compression=gzip)](https://github.com/franciscop/fetch/blob/master/index.min.js)

Add a unified API for any KV store like localStorage, Redis, FileSystem, etc:

```js
import kv from "polystore";
const store = kv(new Map()); // in-memory
const store1 = kv(localStorage); // Persist in the browser
const store2 = kv(redisClient); // Use a Redis client for backend persistence
// etc.
```

This is the [API](#api) with all of the methods (they are all `async`):

- `.get(key): any`: retrieve a single value, or `null` if it doesn't exist or is expired.
- `.set(key, value, options?)`: save a single value, which can be anything that is serializable.
- `.has(key): boolean`: check whether the key is in the store or not.
- `.del(key): void`: delete a single value from the store.
- `.keys(prefix?): string[]`: get a list of all the available strings in the store.
- `.clear()`: delete ALL of the data in the store, effectively resetting it.

Available stores:

- **Memory** `new Map()` (fe+be): an in-memory API to keep your KV store
- **Local Storage** `localStorage` (fe): persist the data in the browser's localStorage
- **Session Storage** `sessionStorage` (fe): persist the data in the browser's sessionStorage
- **Cookies** `"cookie"` (fe): persist the data using cookies
- (WIP) **LocalForage** `localForage` (fe): persist the data on IndexedDB
- **Redis Client** `redisClient` (be): persist the data in the Redis instance that you connect to.
- (WIP) **FS File** `fs.open(pathToFile)` (be): store the data in a single file
- (WIP) **FS Folder** `fs.opendir(pathToFolder)` (be): store the data in files inside the folder
- (WIP) **Cloudflare KV** `env.KV_NAMESPACE` (be): use Cloudflare's KV store

It main usage is for _libraries using this library_, so that _your_ library can easily accept many cache stores! For example, let's say you create an API library, then you can accept the stores from your client:

```js
import MyApi from "my-api";

MyApi({ cache: new Map() });
// OR
MyApi({ cache: localStorage });
// OR
MyApi({ cache: fs.opendir("./data/") });
// OR
MyApi({ cache: redisClient });
// OR
MyApi({ cache: env.KV_NAMESPACE });
```

## API

See how to initialize each store [in the Stores list documentation](#stores). But basically for every store, it's like this:

```js
import kv from "polystore";

// Initialize it
const store = kv(MyClientOrStoreInstance);

// use the store
```

While you can keep a reference and access it directly, we strongly recommend if you are going to use a store, to only access it through `polystore`, since we do add custom serialization, etc:

```js
const map = new Map();
const store = kv(map);

// Works as expected
await store.set("a", "b");
console.log(await store.get("a"));

// DON'T DO THIS; this will break the app since we apply more
// advanced serialization to the values stored in memory
map.set("a", "b");
console.log(await store.get("a")); // THROWS ERROR
```

### .get()

Retrieve a single value from the store. Will return `null` if the value is not set in the store, or if it was set but has already expired:

```js
const value = await store.get(key: string);

console.log(await store.get("key1"));  // "Hello World"
console.log(await store.get("key2"));  // ["my", "grocery", "list"]
console.log(await store.get("key3"));  // { name: "Francisco" }
```

If the value is returned, it can be a simple type like `boolean`, `string` or `number`, or it can be a plain Object or Array, or a combination of those.

> The value cannot be more complex or non-serializable values like a `Date()`, `Infinity`, `undefined` (casted to `null`), a Symbol, etc.

### .set()

Create or update a value in the store. Will return a promise that resolves when the value has been saved. The value needs to be serializable:

```js
await store.set(key: string, value: any, options?: { expire: number|string });

await store.set("key1", "Hello World");
await store.set("key2", ["my", "grocery", "list"], { expire: "1h" });
await store.set("key3", { name: "Francisco" }, { expire: 60 * 60 * 1000  });
```

The value can be a simple type like `boolean`, `string` or `number`, or it can be a plain Object or Array, or a combination of those. It **cannot** be a more complex or non-serializable values like a `Date()`, `Infinity`, `undefined` (casted to `null`), a `Symbol`, etc.

- By default the keys _don't expire_.
- Setting the `value` to `null`, or the `expire` to `0` is the equivalent of deleting the key+value.
- Conversely, setting `expire` to `null` or `undefined` will make the value never to expire.

#### Expire

When the expire is set, it can be a number (ms) or a string representing some time:

```js
// Valid "expire" values:
0 - expire immediately
100 - expire after 100ms
3_600_000 - expire after 1h
60 * 60 * 1000 - expire after 1h
"10s" - expire after 10 seconds
"2minutes" - expire after 2 minutes
"5d" - expire after 5 days
```

These are all the units available:

> "ms", "millisecond", "s", "sec", "second", "m", "min", "minute", "h", "hr", "hour", "d", "day", "w", "wk", "week", "b" (month), "month", "y", "yr", "year"

### .has()

Check whether the key is available in the store and not expired:

```js
await store.has(key: string);
```

### .del()

Remove a single key from the store:

```js
await store.del(key: string);
```

### .keys()

Get all of the keys in the store, optionally filtered by a prefix:

```js
await store.keys(filter?: string);
```

### .clear()

Remove all of the data from the store:

```js
await store.clear();
```

## Stores

Accepts directly the store, or a promise that resolves into a store:

### Memory

```js
import kv from "polystore";

// This already works, by default if there's nothing it'll use
// a new Map()
const store = kv();
await store.set("key1", "Hello world");
console.log(await store.get("key1"));

// Or you can be explicit:
const store = kv(new Map());
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

### Local Storage

```js
import kv from "polystore";

const store = kv(localStorage);
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

### Session Storage

```js
import kv from "polystore";

const store = kv(sessionStorage);
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

### Cookies

```js
import kv from "polystore";

const store = kv("cookie"); // yes, just a plain string
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

> Note: the cookie expire resolution is unfortunately in the seconds. While it still expects you to pass the number of ms as with the other methods (or a string like `1h`), times shorter than 1 second like `expire: 200` (ms) don't make sense for this storage method and won't properly save them.

### Local Forage

```js
import kv from "polystore";
// TODO
```

### Redis Client

```js
import kv from "polystore";
import { createClient } from "redis";

const store = kv(createClient().connect());
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

> Note: the Redis client expire resolution is unfortunately in the seconds. While it still expects you to pass the number of ms as with the other methods (or a string like `1h`), times shorter than 1 second like `expire: 200` (ms) don't make sense for this storage method and won't properly save them.

### FS File

```js
import kv from "polystore";
// TODO
```

### FS Folder

```js
import kv from "polystore";
// TODO
```

### Cloudflare KV

```js
import kv from "polystore";
// TODO
```
