# Polystore [![npm install polystore](https://img.shields.io/badge/npm%20install-polystore-blue.svg)](https://www.npmjs.com/package/polystore) [![test badge](https://github.com/franciscop/polystore/workflows/tests/badge.svg "test badge")](https://github.com/franciscop/polystore/blob/master/.github/workflows/tests.yml) [![gzip size](https://img.badgesize.io/franciscop/polystore/master/index.min.js.svg?compression=gzip)](https://github.com/franciscop/polystore/blob/master/src/index.js)

A small compatibility layer for many KV stores like localStorage, Redis, FileSystem, etc:

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
- `.add(value, options?)`: same as with `.set()`, but auto-generate the key.
- `.has(key): boolean`: check whether the key is in the store or not.
- `.del(key)`: delete a single value from the store.
- `.keys(prefix?): string[]`: get a list of all the available strings in the store.
- `.values(prefix?): any[]`: get a list of all the values in the store.
- `.entries(prefix?): [string, any][]`: get a list of all the key-value pairs in the store.
- `.clear()`: delete ALL of the data in the store, effectively resetting it.
- `.close()`: (only _some_ stores) ends the connection to the store.

Available stores:

- **Memory** `new Map()` (fe+be): an in-memory API to keep your KV store
- **Local Storage** `localStorage` (fe): persist the data in the browser's localStorage
- **Session Storage** `sessionStorage` (fe): persist the data in the browser's sessionStorage
- **Cookies** `"cookie"` (fe): persist the data using cookies
- **LocalForage** `localForage` (fe): persist the data on IndexedDB
- **FS File** `new URL('file:///...')` (be): store the data in a single JSON file
- **Redis Client** `redisClient` (be): use the Redis instance that you connect to
- **Cloudflare KV** `env.KV_NAMESPACE` (be): use Cloudflare's KV store
- (WIP) **Consul KV** `new Consul()` (fe+be): use Hashicorp's Consul KV store (https://www.npmjs.com/package/consul#kv)

I made this library to be used as a "building block" of other libraries, so that _your library_ can accept many cache stores effortlessly! It's isomorphic (Node.js and the Browser) and tiny (~2KB). For example, let's say you create an API library, then you can accept the stores from your client:

```js
import MyApi from "my-api";

MyApi({ cache: new Map() }); // OR
MyApi({ cache: localStorage }); // OR
MyApi({ cache: redisClient }); // OR
MyApi({ cache: env.KV_NAMESPACE }); // OR
// ...
```

## API

See how to initialize each store [in the Stores list documentation](#stores). But basically for every store, it's like this:

```js
import kv from "polystore";

// Initialize it; NO "new"; NO "await", just a plain function wrap:
const store = kv(MyClientOrStoreInstance);

// use the store
```

While you can keep a reference to the store and access it directly, we strongly recommend if you are going to use a store, to only access it through `polystore`, since we do add custom serialization and extra properties for e.g. expiration time:

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

Create or update a value in the store. Will return a promise that resolves with the key when the value has been saved. The value needs to be serializable:

```js
await store.set(key: string, value: any, options?: { expires: number|string });

await store.set("key1", "Hello World");
await store.set("key2", ["my", "grocery", "list"], { expires: "1h" });
await store.set("key3", { name: "Francisco" }, { expires: 60 * 60 * 1000  });
```

The value can be a simple type like `boolean`, `string` or `number`, or it can be a plain Object or Array, or a combination of those. It **cannot** be a more complex or non-serializable values like a `Date()`, `Infinity`, `undefined` (casted to `null`), a `Symbol`, etc.

- By default the keys _don't expire_.
- Setting the `value` to `null`, or the `expires` to `0` is the equivalent of deleting the key+value.
- Conversely, setting `expires` to `null` or `undefined` will make the value never to expire.

#### Expires

When the `expires` option is set, it can be a number (**seconds**) or a string representing some time:

```js
// Valid "expire" values:
0 - expire immediately (AKA delete it)
0.1 - expire after 100ms*
60 * 60 - expire after 1h
3_600 - expire after 1h
"10s" - expire after 10 seconds
"2minutes" - expire after 2 minutes
"5d" - expire after 5 days
```

\* not all stores support sub-second expirations, notably Redis and Cookies don't, so it's safer to always use an integer or an amount larger than 1s

These are all the units available:

> "ms", "millisecond", "s", "sec", "second", "m", "min", "minute", "h", "hr", "hour", "d", "day", "w", "wk", "week", "b" (month), "month", "y", "yr", "year"

### .add()

Create a value in the store with a random key string. Will return a promise that resolves with the key when the value has been saved. The value needs to be serializable:

```js
const key:string = await store.add(value: any, options?: { expires: number|string });

const key1 = await store.add("Hello World");
const key2 = await store.add(["my", "grocery", "list"], { expires: "1h" });
const key3 = await store.add({ name: "Francisco" }, { expires: 60 * 60 * 1000  });
```

The generated key is 24 AlphaNumeric characters (including upper and lower case) generated with random cryptography to make sure it's unguessable, high entropy and safe to use in most contexts like URLs, queries, etc. We use [`nanoid`](https://github.com/ai/nanoid/) with a custom dictionary, so you can check the entropy [in this dictionary](https://zelark.github.io/nano-id-cc/) by removing the "\_" and "-", and setting it to 24 characters.

Here is the safety: "If you generate 1 million keys/second, it will take ~14 million years in order to have a 1% probability of at least one collision."

> Note: please make sure to read the [`.set()`](#set) section for all the details, since `.set()` and `.add()` behave the same way except for the first argument.

### .has()

Check whether the key is available in the store and not expired:

```js
await store.has(key: string);

if (await store.has('cookie-consent')) {
  loadCookies();
}
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

> We ensure that all of the keys returned by this method are _not_ expired, while discarding any potentially expired key. See [**expiration explained**](#expiration-explained) for more details.

### .values()

Get all of the values in the store, optionally filtered by a **key** prefix:

```js
await store.values(filter?: string);
```

This is useful specially when you already have the id/key within the value as an object, then you can just get a list of all of them:

```js
const sessions = await store.values("session:");
// A list of all the sessions

const companies = await store.values("company:");
// A list of all the companies
```

> We ensure that all of the values returned by this method are _not_ expired, while discarding any potentially expired key. See [**expiration explained**](#expiration-explained) for more details.

### .entries()

Get all of the entries (key:value tuples) in the store, optionally filtered by a **key** prefix:

```js
await store.entries(filter?: string);
```

It is in a format that you can easily build an object out of it:

```js
const sessionEntries = await store.entries("session:");
const sessions = Object.fromEntries(sessionEntries);
```

> We ensure that all of the entries returned by this method are _not_ expired, while discarding any potentially expired key. See [**expiration explained**](#expiration-explained) for more details.

### .clear()

Remove all of the data from the store:

```js
await store.clear();
```

### .prefix() (TODO) (unstable)

Create a sub-store where all the operations use the given prefix:

```js
const store = kv(new Map());
const session = store.prefix("session:");
```

Then all of the operations will be converted internally to add the prefix when reading, writing, etc:

```js
const val = await session.get("key1"); // .get('session:key1');
await session.set("key2", "some data"); // .set('session:key2', ...);
const val = await session.has("key3"); // .has('session:key3');
await session.del("key4"); // .del('session:key4');
await session.keys(); // .keys('session:');
// ['key1', 'key2', ...]   Note no prefix here
await session.clear(); // delete only keys with the prefix
```

This will probably never be stable given the nature of some engines, so as an alternative please consider using two stores instead of prefixes:

```js
const store = kv(new Map());
const session = kv(new Map());
```

The main reason this is not stable is because [_some_ store engines don't allow for atomic deletion of keys given a prefix](https://stackoverflow.com/q/4006324/938236). While we do still clear them internally in those cases, that is a non-atomic operation and it could have some trouble if some other thread is reading/writing the data _at the same time_.

## Stores

Accepts directly the store, or a promise that resolves into a store. All of the stores, including those that natively _don't_ support it, are enhanced with `Promises` and `expires` times, so they all work the same way.

### Memory

An in-memory KV store, with promises and expiration time:

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

The traditional localStorage that we all know and love, this time with a unified API, and promises:

```js
import kv from "polystore";

const store = kv(localStorage);
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

Same limitations as always apply to localStorage, if you think you are going to use too much storage try instead our integration with [Local Forage](#local-forage)!

### Session Storage

Same as localStorage, but now for the session only:

```js
import kv from "polystore";

const store = kv(sessionStorage);
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

### Cookies

Supports native browser cookies, including setting the expire time:

```js
import kv from "polystore";

const store = kv("cookie"); // yes, just a plain string
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

It is fairly limited for how powerful cookies are, but in exchange it has the same API as any other method or KV store. It works with browser-side Cookies (no http-only).

> Note: the cookie expire resolution is in the seconds, so times shorter than 1 second like `expires: 0.02` (20 ms) don't make sense for this storage method and won't properly save them.

### Local Forage

Supports localForage (with any driver it uses) so that you have a unified API. It also _adds_ the `expires` option to the setters!

```js
import kv from "polystore";
import localForage from "localforage";

const store = kv(localForage);
await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
```

### Redis Client

Supports the official Node Redis Client. You can pass either the client or the promise:

```js
import kv from "polystore";
import { createClient } from "redis";

// Note: no need for await or similar
const store = kv(createClient().connect());
await store.set("key1", "Hello world");
console.log(await store.get("key1"));
```

> Note: the Redis client expire resolution is in the seconds, so times shorter than 1 second like `expires: 0.02` (20 ms) don't make sense for this storage method and won't properly save them.

### FS File

```js
import kv from "polystore";

// Create a url with the file protocol:
const store = kv(new URL("file:///Users/me/project/cache.json"));

// Paths need to be absolute, but you can use process.cwd() to make
// it relative to the current process:
const store = kv(new URL(`file://${process.cwd()}/cache.json`));
```

### Cloudflare KV

Supports the official Cloudflare's KV stores. Follow [the official guide](https://developers.cloudflare.com/kv/get-started/), then load it like this:

```js
import kv from "polystore";

export default {
  async fetch(request, env, ctx) {
    const store = kv(env.YOUR_KV_NAMESPACE);

    await store.set("KEY", "VALUE");
    const value = await store.get("KEY");

    if (!value) {
      return new Response("Value not found", { status: 404 });
    }
    return new Response(value);
  },
};
```

Why? The Cloudflare native KV store only accepts strings and has you manually calculating timeouts, but as usual with `polystore` you can set/get any serializable value and set the timeout in a familiar format:

```js
// GOOD - with polystore
await store.set("user", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With native Cloudflare KV
const serialValue = JSON.stringify({ name: "Francisco" });
const twoDaysInSeconds = 2 * 24 * 3600;
await env.YOUR_KV_NAMESPACE.put("user", serialValue, {
  expirationTtl: twoDaysInSeconds,
});
```

## Expiration explained

While different engines do expiration slightly differently internally, in creating polystore we want to ensure certain constrains, which _can_ affect performance. For example, if you do this operation:

```js
// in-memory store
const store = polystore(new Map());
await store.set("a", "b", { expires: "1s" });

// These checks of course work:
console.log(await store.keys()); // ['a']
console.log(await store.has("a")); // true
console.log(await store.get("a")); // 'b'

// Make sure the key is expired
await delay(2000); // 2s

// Not only the .get() is null, but `.has()` returns false, and .keys() ignores it
console.log(await store.keys()); // []
console.log(await store.has("a")); // false
console.log(await store.get("a")); // null
```

This is great because with polystore we do ensure that if a key has expired, it doesn't show up in `.keys()`, `.entries()`, `.values()`, `.has()` or `.get()`.

However, in some stores this does come with some potential performance disadvantages. For example, both the in-memory example above and localStorage _don't_ have a native expiration/eviction process, so we have to store that information as metadata, meaning that even to check if a key exists we need to read and decode its value. For one or few keys it's not a problem, but for large sets this can become an issue.

For other stores like Redis this is not a problem, because the low-level operations already do them natively, so we don't need to worry about this for performance at the user-level. Instead, Redis and cookies have the problem that they only have expiration resolution at the second level. Meaning that 800ms is not a valid Redis expiration time, it has to be 1s, 2s, etc.

## Creating a store

A store needs at least 4 methods with these signatures:

```js
const store = {};
store.get = (key: string) => Promise<any>;
store.set = (key: string, value: any, { expires: number }) => Promise<string>;
store.entries = (prefix: string = "") => Promise<[key:string, value:any][]>;
store.clear = () => Promise<null>;
```

All of the other methods will be implemented on top of these if not available, but you can provide those as well for optimizations, incompatible APIs, etc. For example, `.set('a', null)` _should_ delete the key `a`, and for this you may provide a native implementation:

```js
const native = myNativeStore();

const store = {};
store.get = (key) => native.getItem(key);
// ...
store.del = (key) => native.deleteItem(key);
```
