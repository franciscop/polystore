# Polystore [![npm install polystore](https://img.shields.io/badge/npm%20install-polystore-blue.svg)](https://www.npmjs.com/package/polystore) [![test badge](https://github.com/franciscop/polystore/workflows/tests/badge.svg "test badge")](https://github.com/franciscop/polystore/blob/master/.github/workflows/tests.yml) [![gzip size](https://badgen.net/bundlephobia/minzip/polystore?label=gzip&color=green)](https://bundlephobia.com/package/polystore)

A key-value library to unify the API of [many clients](#clients), like localStorage, Redis, FileSystem, etc:

```js
import kv from "polystore";
const store1 = kv(new Map()); // in-memory
const store2 = kv(localStorage); // Persist in the browser
const store3 = kv(redisClient); // Use a Redis client for backend persistence
const store4 = kv(yourOwnStore); // Create a store based on your code
// Many more here
```

These are all the methods of the [API](#api) (they are all `async`):

- [`.get(key)`](#get): read a single value, or `null` if it doesn't exist or is expired.
- [`.set(key, value, options?)`](#set): save a single value that is serializable.
- [`.add(value, options?)`](#add): same as `.set()`, but auto-generates the key.
- [`.has(key)`](#has): check whether a key exists or not.
- [`.del(key)`](#del): delete a single value from the store.
- [`.keys()`](#keys): get a list of all the available strings in the store.
- [`.values()`](#values): get a list of all the values in the store.
- [`.entries()`](#entries): get a list of all the key-value pairs.
- [`.all()`](#all): get an object with the key:values mapped.
- [`.clear()`](#clear): delete ALL of the data in the store, effectively resetting it.
- [`.close()`](#close): (only _some_ stores) ends the connection to the store.
- [`.prefix(prefix)`](#prefix): create a sub-store that manages the keys with that prefix.

> This library has very high performance with the item methods (GET/SET/ADD/HAS/DEL). For other methods or to learn more, see [the performance considerations](#performance) and read the docs on your specific client.

Available clients for the KV store:

- [**Memory** `new Map()`](#memory) (fe+be): an in-memory API to keep your KV store.
- [**Local Storage** `localStorage`](#local-storage) (fe): persist the data in the browser's localStorage.
- [**Session Storage** `sessionStorage`](#session-storage) (fe): persist the data in the browser's sessionStorage.
- [**Cookies** `"cookie"`](#cookies) (fe): persist the data using cookies
- [**LocalForage** `localForage`](#local-forage) (fe): persist the data on IndexedDB
- [**Fetch API** `"https://..."`](#fetch-api) (fe+be): call an API to save/retrieve the data
- [**File** `"file:///[...].json"`](#file) (be): store the data in a single JSON file in your FS
- [**Folder** `"file:///[...]/"`](#folder) (be): store each key in a folder as json files
- [**Redis Client** `redisClient`](#redis-client) (be): use the Redis instance that you connect to
- [**Cloudflare KV** `env.KV_NAMESPACE`](#cloudflare-kv) (be): use Cloudflare's KV store
- [**Level** `new Level('example', { valueEncoding: 'json' })`](#level) (fe+be): support the whole Level ecosystem
- [**Etcd** `new Etcd3()`](#etcd) (be): the Microsoft's high performance KV store.
- [**Postgres** `pool`](#postgres) (be): use PostgreSQL with the pg library
- [**Prisma** `prisma.store`](#prisma) (be): use Prisma ORM as a key-value store
- [**_Custom_** `{}`](#creating-a-store) (fe+be): create your own store with just 3 methods!

I made this library to be used as a "building block" of other libraries, so that _your library_ can accept many cache stores effortlessly! It's universal (Node.js, Bun and the Browser) and tiny (~3KB). For example, let's say you create an API library, then you can accept the stores from your client:

```js
import MyApi from "my-api";

MyApi({ cache: new Map() }); // OR
MyApi({ cache: localStorage }); // OR
MyApi({ cache: redisClient }); // OR
MyApi({ cache: env.KV_NAMESPACE }); // OR
// ...
```

## Getting started

First, install `polystore` and whatever [supported client](#clients) that you prefer. Let's see Redis as an example here:

```
npm i polystore redis
```

Then import both, initialize the Redis client and pass it to Polystore:

```js
import kv from "polystore";
import { createClient } from "redis";

// Import the Redis configuration
const REDIS = process.env.REDIS_URL;

// Wrap the redis creation with Polystore (kv())
const store = kv(createClient({ url: REDIS }).connect());
```

Now your store is ready to use! Add, set, get, del different keys. [See full API](#api).

```js
const key = await store.add("Hello");

console.log(await store.get(key));
// Hello

await store.del(key);
```

## API

See how to initialize each store [in the Clients list documentation](#clients). But basically for every store, it's like this:

```js
import kv from "polystore";

// Initialize it; NO "new"; NO "await", just a plain function wrap:
const store = kv(MyClientOrStoreInstance);

// use the store
```

The above represents the recommended naming; the default export, `kv` in this case, is a wrapper that will generate a "store" that then you use all around your codebase.

You can enforce the **types** for the store values directly at the store creation, or at the method level:

```ts
const store = kv<number>(new Map());
store.get("abc"); // number | null
store.set("abc", 10);

store.set("abc", "hello"); // FAILS

// At the method level
const store = kv(new Map());
store.get<number>("abc"); // number | null
store.set<number>("abc", 10);

store.set<number>("abc", "hello"); // FAILS
````

> If you try to enforce data structure at _both_ the store level AND method level, then the method data type _should_ be a subclass of the store data structure, e.g. `kv<string | number>().get<string>("a")` will work, but `kv<string>().get<number>("a")` will _not_ work.

The type should always be `Serializable`, which is `number | string | boolean | Object | Array` (values can be `null` inside Object+Array). These types, along with the Store and Client, are exported as well:

```ts
import kv from "polystore";
import type { Client, Serializable, Store } from "polystore";

const client: Client = ...;  // See #creating-a-store
const store: Store = kv(client);
const value: Serializable = store.get('hello');
````

### .get()

Retrieve a single value from the store. Will return `null` if the value is not set in the store, or if it was set but has already expired:

```js
const value = await store.get(key: string);

console.log(await store.get("key1"));  // "Hello World"
console.log(await store.get("key2"));  // ["my", "grocery", "list"]
console.log(await store.get("key3"));  // { name: "Francisco" }
```

If the value is returned, it can be a simple type like `boolean`, `string` or `number`, or it can be a plain `Object` or `Array`, or any combination of those.

When there's no value (either never set, or expired), `null` will be returned from the operation.

### .set()

Create or update a value in the store. Will return a promise that resolves with the key when the value has been saved. The value needs to be serializable:

```js
await store.set(key: string, value: any, options?: { expires: number|string });

await store.set("key1", "Hello World");
await store.set("key2", ["my", "grocery", "list"], { expires: "1h" });
await store.set("key3", { name: "Francisco" }, { expires: 60 * 60 });
```

The value can be a simple type like `boolean`, `string` or `number`, or it can be a plain `Object` or `Array`, or a combination of those. It **cannot** be a more complex or non-serializable values like a `Date()`, `Infinity`, `undefined` (casted to `null`), a `Symbol`, etc.

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

\* not all stores support sub-second expirations, notably Redis and Cookies don't, so it's safer to always use an integer or an amount larger than 1s. There will be a note in each store for this.

These are all the units available:

> "ms", "millisecond", "s", "sec", "second", "m", "min", "minute", "h", "hr", "hour", "d", "day", "w", "wk", "week", "b" (month), "month", "y", "yr", "year"

### .add()

Create a value in the store with an auto-generated key. Will return a promise that resolves with the key when the value has been saved. The value needs to be serializable:

```js
const key:string = await store.add(value: any, options?: { expires: number|string });

const key1 = await store.add("Hello World");
const key2 = await store.add(["my", "grocery", "list"], { expires: "1h" });
const key3 = await store.add({ name: "Francisco" }, { expires: 60 * 60  });
```

The options and details are similar to [`.set()`](#set), except for the lack of the first argument, since `.add()` will generate the key automatically.

The default key is 24 AlphaNumeric characters (upper+lower case), however this can change if you are using a `.prefix()` or some clients might generate it differently (only custom clients can do that right now).

Some clients will generate their own key, e.g. you can connect to a SQL client that does auto-incremental integers (always casted to `string` since a `key` is always a string in Polystore).

<details>
  <summary>Key Generation details</summary>
  The default key will be 24 AlphaNumeric characters (including upper and lower case) generated with random cryptography to make sure it's unguessable, high entropy and safe to use in most contexts like URLs, queries, etc. We use [`nanoid`](https://github.com/ai/nanoid/) with a custom dictionary, so you can check the entropy [in this dictionary](https://zelark.github.io/nano-id-cc/) by removing the "\_" and "-", and setting it to 24 characters.

  Here is the safety: "If you generate 1 million keys/second, it will take ~14 million years in order to have a 1% probability of at least one collision."
</details>

The main reason why `.add()` exists is to allow it to work with the prefix seamlessly:

```js
const session = store.prefix("session:");

// Creates a key with the prefix (returns only the key)
const key1 = await session.add("value1");
// "c4ONlvweshXPUEy76q3eFHPL"

console.log(await session.keys()); // on the "session" store
// ["c4ONlvweshXPUEy76q3eFHPL"]
// 
console.log(await store.keys()); // on the ROOT store
// ["session:c4ONlvweshXPUEy76q3eFHPL"]
```

Remember that [substores with `.prefix()`](#prefix) behave as if they were an independent store, so when adding, manipulating, etc. a value you should treat the key as if it had no prefix. This is explained in detail in the [.prefix()](#prefix) documentation.

### .has()

Check whether the key:value is available in the store and not expired:

```js
await store.has(key: string);

if (await store.has("cookie-consent")) {
  loadCookies();
}
```

In many cases, internally the check for `.has()` is the same as `.get()`, so if you are going to use the value straight away it's usually better to just read it:

```js
const val = await store.get("key1");
if (val) { ... }
```

An example of an exception of the above is when you use it as a cache, then you can write code like this:

```js
// First time for a given user does a network roundtrip, while
// the second time for the same user gets it from cache
async function fetchUser(id) {
  if (!(await store.has(id))) {
    const { data } = await axios.get(`/users/${id}`);
    await store.set(id, data, { expires: "1h" });
  }
  return store.get(id);
}
```

An example with a prefix:

```js
const session = store.prefix("session:");

// These three perform the same operation internally
const has1 = await session.has("key1");
const has2 = await store.prefix("session:").has("key1");
const has3 = await store.has("session:key1");
```

### .del()

Remove a single key from the store and return the key itself:

```js
await store.del(key: string);
```

It will ignore the operation if the key or value don't exist already (but won't throw). The API makes it easy to delete multiple keys at once:

```js
const keys = ["key1", "key2"];
await Promise.all(keys.map(store.del));
console.log(done);
```

An example with a prefix:

```js
const session = store.prefix("session:");

// These three perform the same operation internally
await session.del("key1");
await store.prefix("session:").del("key1");
await store.del("session:key1");
```

### _Iterator_

You can iterate over the whole store with an async iterator:

```js
for await (const [key, value] of store) {
  console.log(key, value);
}
```

This is very useful for performance resons since it will retrieve the data sequentially, avoiding blocking the client while retrieving it all at once. The main disadvantage is if you keep writing data asynchronously while the async iterator is running.

You can also iterate on a subset of the entries with `.prefix()` (the prefix is stripped from the key here, see [.`prefix()`](#prefix)):

```js
const session = store.prefix("session:");
for await (const [key, value] of session) {
  console.log(key, value);
}

// Same as this (both have the prefix stripped):

for await (const [key, value] of store.prefix("session:")) {
  console.log(key, value);
}
```

There are also methods to retrieve all of the keys, values, or entries at once below, but those [have worse performance](#performance).

### .keys()

Get all of the keys in the store as a simple array of strings:

```js
await store.keys();
// ["keyA", "keyB", "keyC", ...]
```

If you want to filter for a particular prefix, use `.prefix()`, which will return the values with the keys with that prefix (the keys have the prefix stripped!):

```js
const sessions = await store.prefix("session:").keys();
// ["keyA", "keyB"]
```

> We ensure that all of the keys returned by this method are _not_ expired, while discarding any potentially expired key. See [**expirations**](#expirations) for more details.

### .values()

Get all of the values in the store as a simple array with all the values:

```js
await store.values();
// ["valueA", "valueB", { hello: "world" }, ...]
```

If you want to filter for a particular prefix, use `.prefix()`, which will return the values with the keys with that prefix:

```js
const sessions = await store.prefix("session:").values();
// A list of all the sessions

const companies = await store.prefix("company:").values();
// A list of all the companies
```

> We ensure that all of the values returned by this method are _not_ expired, while discarding any potentially expired key. See [**expirations**](#expirations) for more details.

### .entries()

Get all of the entries (key:value tuples) in the store:

```js
const entries = await store.entries();
// [["keyA", "valueA"], ["keyB", "valueB"], ["keyC", { hello: "world" }], ...]
```

It's in the same format as `Object.entries(obj)`, so it's an array of [key, value] tuples.

If you want to filter for a particular prefix, use `.prefix()`, which will return the entries that have that given prefix (the keys have the prefix stripped!):

```js
const sessionEntries = await store.prefix('session:').entries();
// [["keyA", "valueA"], ["keyB", "valueB"]]
```

> We ensure that all of the entries returned by this method are _not_ expired, while discarding any potentially expired key. See [**expirations**](#expirations) for more details.

### .all()

Get all of the entries (key:value) in the store as an object:

```js
const obj = await store.all(filter?: string);
// { keyA: "valueA", keyB: "valueB", keyC: { hello: "world" }, ... }
```

It's in the format of a normal key:value object, where the object key is the store's key and the object value is the store's value.

If you want to filter for a particular prefix, use `.prefix()`, which will return the object with only the keys that have that given prefix (stripping the keys of the prefix!):

```js
const sessionObj = await store.prefix('session:').all();
// { keyA: "valueA", keyB: "valueB" }
```

> We ensure that all of the entries returned by this method are _not_ expired, while discarding any potentially expired key. See [**expirations**](#expirations) for more details.


### .clear()

Remove all of the data from the client and resets it to the original state:

```js
await store.clear();
```

### .close()

Close the connetion (if any) from the client:

```js
await store.close();
````

### .prefix()

> There's [an in-depth explanation about Substores](#substores) that is very informative for production usage.

Creates **a new instance** of the Store, _with the same client_ as you provided, but now any key you read, write, etc. will be passed with the given prefix to the client. You only write `.prefix()` once and then don't need to worry about any prefix for any method anymore, it's all automatic. It's **the only method** that you don't need to await:

```js
const store = kv(new Map());
const session = store.prefix("session:");
```

Then all of the operations will be converted internally to add the prefix when reading, writing, etc:

```js
const session = store.prefix("session:");
const val = await session.get("key1"); // store.get('session:key1');
await session.set("key2", "some data"); // store.set('session:key2', ...);
const val = await session.has("key3"); // store.has('session:key3');
await session.del("key4"); // store.del('session:key4');
await session.keys(); // store.keys(); + filter
// ['key1', 'key2', ...]   Note no prefix here
await session.clear(); // delete only keys with the prefix
for await (const [key, value] of session) {
  console.log(key, value);
}
```

Different clients have better/worse support for substores, and in some cases some operations might be slower. This should be documented on each client's documentation (see below). As an alternative, you can always create two different stores instead of a substore:

```js
// Two in-memory stores
const store = kv(new Map());
const session = kv(new Map());

// Two file-stores
const users = kv(`file://${import.meta.dirname}/users.json`);
const books = kv(`file://${import.meta.dirname}/books.json`);
```

The main reason this is not stable is because [_some_ store engines don't allow for atomic deletion of keys given a prefix](https://stackoverflow.com/q/4006324/938236). While we do still clear them internally in those cases, that is a non-atomic operation and it could have some trouble if some other thread is reading/writing the data _at the same time_.

## Clients

A client is the library that manages the low-level store operations. For example, the Redis Client, or the browser's `localStorage` API. In some exceptions it's just a string and we do a bit more work on Polystore, like with `"cookie"` or `"file:///users/me/data.json"`.

Polystore provides a unified API you can use `Promises`, `expires` and `.prefix()` even with those stores that do not support these operations natively.

While you can keep a reference to the client and access it directly, we strongly recommend to only access it through `polystore`, since we might add custom serialization and extra properties for e.g. expiration time:

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


### Memory

An in-memory KV store, with promises and expiration time:

```js
import kv from "polystore";

const store = kv(new Map());

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

<details>
  <summary>Why use polystore with <code>new Map()</code>?</summary>
  <p>These benefits are for wrapping Map() with polystore:</p>
  <ul>
    <li><strong>Expiration</strong>: you can now set lifetime to your values so that they are automatically evicted when the time passes. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("key1", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With sessionStorage
const data = new Map();
data.set("key1", { name: "Francisco" });
// Expiration not supported
```

### Local Storage

The traditional localStorage that we all know and love, this time with a unified API, and promises:

```js
import kv from "polystore";

const store = kv(localStorage);

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

Same limitations as always apply to localStorage, if you think you are going to use too much storage try instead our integration with [Local Forage](#local-forage)!

<details>
  <summary>Why use polystore with <code>localStorage</code>?</summary>
  <p>These benefits are for wrapping localStorage with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Expiration</strong>: you can now set lifetime to your values so that they are automatically evicted when the time passes. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("key1", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With localStorage
const serialValue = JSON.stringify({ name: "Francisco" });
localStorage.set("key1", serialValue);
// Expiration not supported
```

### Session Storage

Same as localStorage, but now for the session only:

```js
import kv from "polystore";

const store = kv(sessionStorage);

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

<details>
  <summary>Why use polystore with <code>sessionStorage</code>?</summary>
  <p>These benefits are for wrapping sessionStorage with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Expiration</strong>: you can now set lifetime to your values so that they are automatically evicted when the time passes. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("key1", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With sessionStorage
const serialValue = JSON.stringify({ name: "Francisco" });
sessionStorage.set("key1", serialValue);
// Expiration not supported
```

### Cookies

Supports native browser cookies, including setting the expire time:

```js
import kv from "polystore";

const store = kv("cookie"); // just a plain string

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

It is fairly limited for how powerful cookies are, but in exchange it has the same API as any other method or KV store. It works with browser-side Cookies (no http-only).

> Note: the cookie expire resolution is in the seconds, so times shorter than 1 second like `expires: 0.02` (20 ms) don't make sense for this storage method and won't properly save them.

<details>
  <summary>Why use polystore with <code>cookies</code>?</summary>
  <p>These benefits are for wrapping cookies with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

### Local Forage

Supports localForage (with any driver it uses) so that you have a unified API. It also _adds_ the `expires` option to the setters!

```js
import kv from "polystore";
import localForage from "localforage";

const store = kv(localForage);

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

<details>
  <summary>Why use polystore with <code>localForage</code>?</summary>
  <p>These benefits are for wrapping localStorage with polystore:</p>
  <ul>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

### Redis Client

Supports the official Node Redis Client. You can pass either the client or the promise:

```js
import kv from "polystore";
import { createClient } from "redis";

const store = kv(createClient().connect());

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

You don't need to `await` for the connect or similar, this will process it properly.

> Note: the Redis client expire resolution is in the seconds, so times shorter than 1 second like `expires: 0.02` (20 ms) don't make sense for this storage method and won't properly save them.

<details>
  <summary>Why use polystore with <code>Redis</code>?</summary>
  <p>These benefits are for wrapping Redis with polystore:</p>
  <ul>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

### Fetch API

Calls an API to get/put the data:

```js
import kv from "polystore";

const store = kv("https://kv.example.com/");

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

> Note: the API client expire resolution is in the seconds, so times shorter than 1 second like `expires: 0.02` (20 ms) don't make sense for this storage method and won't properly save them.

> Note: see the [reference implementation in src/server.js](https://github.com/franciscop/polystore/blob/master/src/server.js)


### File

Treat a JSON file in your filesystem as the source for the KV store. Pass it an absolute `file://` url or a `new URL('file://...')` instance:

```js
import kv from "polystore";

// Path is "/Users/me/project/cache.json"
const store = kv("file:///Users/me/project/cache.json");

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

> Note: an extension is needed, to disambiguate with ["folder"](#folder)

You can also create multiple stores:

```js
// Paths need to be absolute, but you can use process.cwd() to make
// it relative to the current process:
const store1 = kv(`file://${process.cwd()}/cache.json`);
const store2 = kv(`file://${import.meta.dirname}/data.json`);
```

You can also pass a `URL` instance:

```js
const store1 = kv(new URL(`file://${process.cwd()}/cache.json`));
```

<details>
  <summary>Why use polystore with a file?</summary>
  <p>These benefits are for wrapping a file with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Expiration</strong>: you can now set lifetime to your values so that they are automatically evicted when the time passes. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("key1", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With native file managing
const file = './data/users.json';
const str = await fsp.readFile(file, "utf-8");
const data = JSON.parse(str);
data["key1"] = { name: "Francisco" };
const serialValue = JSON.stringify(data);
await fsp.writeFile(file, serialValue);
// Expiration not supported (and error handling not shown)
```

### Folder

Treat a single folder in your filesystem as the store, where each key is a file:

```js
import kv from "polystore";

const store = kv("file:///Users/me/project/data/");

await store.set("key1", "Hello world", { expires: "1h" });
// Writes "./data/key1.json"
console.log(await store.get("key1"));
// "Hello world"
```

> Note: the ending slash `/` is needed, to disambiguate with ["file"](#file)

You can also create multiple stores:

```js
// Paths need to be absolute, but you can use `process.cwd()` to make
// it relative to the current process, or `import.meta.dirname`:
const store1 = kv(`file://${process.cwd()}/cache/`);
const store2 = kv(`file://${import.meta.dirname}/data/`);
```

The folder is created if it doesn't exist. When a key is deleted, the corresponding file is also deleted. The data is serialized as JSON, with a meta wrapper to store the expiration date.


You can also pass a `URL` instance:

```js
const store1 = kv(new URL(`file://${process.cwd()}/cache/`));
```

<details>
  <summary>Why use polystore with a folder?</summary>
  <p>These benefits are for wrapping a folder with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Expiration</strong>: you can now set lifetime to your values so that they are automatically evicted when the time passes. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("key1", { name: "Francisco" }, { expires: "2days" });

// COMPLEX - With native folder
const file = './data/user/key1.json';
const serialValue = JSON.stringify({ name: "Francisco" });
await fsp.writeFile(file, serialValue);
// Expiration not supported (and error handling not shown)
```

### Cloudflare KV

Supports the official Cloudflare's KV stores. Follow [the official guide](https://developers.cloudflare.com/kv/get-started/), then load it like this:

```js
import kv from "polystore";

export default {
  async fetch(request, env, ctx) {
    const store = kv(env.YOUR_KV_NAMESPACE);

    await store.set("key1", "Hello world", { expires: "1h" });
    console.log(await store.get("key1"));
    // "Hello world"

    return new Response("My response");
  },
};
```

It expects that you pass the namespace from Cloudflare straight as a `kv()` argument. This is unfortunately not available outside of the `fetch()` method.

<details>
  <summary>Why use polystore with Cloudflare's KV?</summary>
  <p>These benefits are for wrapping Cloudflare's KV with polystore:</p>
  <ul>
    <li><strong>Data structures</strong>: with Polystore you can pass more complex data structures and we'll handle the serialization/deserialization.</li>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

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

### Level

Support [the Level ecosystem](https://github.com/Level/level), which is itself composed of modular methods:

```js
import kv from "polystore";
import { Level } from "level";

const store = kv(new Level("example", { valueEncoding: "json" }));

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

You will need to set the `valueEncoding` to `"json"` for the store to work as expected.

<details>
  <summary>Why use polystore with Level?</summary>
  <p>These benefits are for wrapping Level with polystore:</p>
  <ul>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
  </ul>
</details>

```js
// GOOD - with polystore
await store.set("user", { hello: 'world' }, { expires: "2days" });

// With Level:
?? // Just not possible
```

### Etcd

Connect to Microsoft's Etcd Key-Value store:

```js
import kv from "polystore";
import { Etcd3 } from "etcd3";

const store = kv(new Etcd3());

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

You'll need to be running the etcd store for this to work as expected.

<details>
  <summary>Why use polystore with Etcd?</summary>
  <p>These benefits are for wrapping Etcd with polystore:</p>
  <ul>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

### Postgres

Use PostgreSQL with the `pg` library as a key-value store:

```js
import kv from "polystore";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const store = kv(client);

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

You can also use `pg.Pool` instead of `pg.Client` for connection pooling.

Your database needs a table with three columns: `id` (text), `value` (text), and `expiresAt` (timestamp, nullable):

```sql
CREATE TABLE kv (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMP
);
```

The default table name is `kv`, but you can use different tables via `.prefix()`:

```js
const sessions = store.prefix("session:"); // Uses 'session' table
const cache = store.prefix("cache:");      // Uses 'cache' table

await sessions.set("user123", { name: "Alice" });
```

This maps prefixes to table names for better performance on group operations.

<details>
  <summary>Why use polystore with Postgres?</summary>
  <p>These benefits are for wrapping Postgres with polystore:</p>
  <ul>
    <li><strong>Unified API</strong>: use the same API across all your storage backends.</li>
    <li><strong>Database-backed persistence</strong>: leverage your existing database for key-value storage.</li>
    <li><strong>Table-based substores</strong>: <code>.prefix()</code> maps to different tables for optimal query performance.</li>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expirations">Expirations</a>.</li>
  </ul>
</details>

### Prisma

Use Prisma as a key-value store by passing a table model directly:

```js
import kv from "polystore";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const store = kv(prisma.session);

await store.set("key1", "Hello world", { expires: "1h" });
console.log(await store.get("key1"));
// "Hello world"
```

Your Prisma schema needs a model with three columns: `id` (String), `value` (String/Text), and `expiresAt` (DateTime, nullable):

```prisma
model session {
  id        String    @id
  value     String    @db.Text
  expiresAt DateTime?
}
```

All three columns are required. The `expiresAt` column should be nullable (`DateTime?`) to support records without expiration.

<details>
  <summary>Why use polystore with Prisma?</summary>
  <p>These benefits are for wrapping Prisma with polystore:</p>
  <ul>
    <li><strong>Unified API</strong>: use the same API across all your storage backends.</li>
    <li><strong>Database-backed persistence</strong>: leverage your existing database for key-value storage.</li>
    <li><strong>Intuitive expirations</strong>: use plain English to specify the expiration time like <code>10min</code>. <a href="#expiration">Expirations</a>.</li>
    <li><strong>Substores</strong>: you can also create substores and manage partial data with ease. <a href="#prefix">Details about substores</a>.</li>
  </ul>
</details>

### Custom store

Please see the [creating a store](#creating-a-store) section for all the details!

## Performance

> TL;DR: if you only use the item operations (add, set, get, has, del) and your client supports expiration natively, you have nothing to worry about! Otherwise, please read on.

While all of our stores support `expires`, `.prefix()` and group operations, the nature of those makes them to have different performance characteristics.

**Expires** we polyfill expiration when the underlying client library does not support it. The impact on read/write operations and on data size of each key should be minimal. However, it can have a big impact in storage size, since the expired keys are not evicted automatically. Note that when attempting to read *an expired key*, polystore **will delete that key**. However, if an expired key is never read, it would remain in the datastore and could create some old-data issues. This is **especially important where sensitive data is involved**! To fix this, the easiest way is calling `await store.entries();` on a cron job and that should evict all of the old keys (this operation is O(n) though, so not suitable for calling it on EVERY API call, see the next point).

**Group operations** these are there mostly for small datasets only, for one-off scripts or for dev purposes, since by their own nature they can _never_ be high performance in the general case. But this is normal if you think about traditional DBs, reading a single record by its ID is O(1), while reading all of the IDs in the DB into an array is going to be O(n). Same applies with polystore.

**Substores** when dealing with a `.prefix()` substore, the same applies. Item operations should see no performance degradation from `.prefix()`, but group operations follow the above performance considerations. Some engines might have native prefix support, so performance in those is better for group operations in a substore than the whole store. But in general you should consider `.prefix()` as a convenient way of classifying your keys and not as a performance fix for group operations.

## Expirations

> Warning: if a client doesn't support expiration natively, we will hide expired keys on the API calls for a nice DX, but _old data might not be evicted automatically_. See [the notes in Performance](#performance) for details on how to work around this.

We unify all of the clients diverse expiration methods into a single, easy one with `expires` (**seconds** | string):

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

// The group methods also ignore expired keys
console.log(await store.keys()); // []
console.log(await store.has("a")); // false
console.log(await store.get("a")); // null
```

These can be set with natural language, or a single number for the seconds:

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

These are all the units available:

> "ms", "millisecond", "s", "sec", "second", "m", "min", "minute", "h", "hr", "hour", "d", "day", "w", "wk", "week", "b" (month), "month", "y", "yr", "year"

This is great because with polystore we do ensure that if a key has expired, it doesn't show up in `.keys()`, `.entries()`, `.values()`, `.has()` or `.get()`.

### Eviction

However, in some stores this does come with some potential performance disadvantages. For example, both the in-memory example above and localStorage _don't_ have a native expiration/eviction process, so we have to store that information as metadata, meaning that even to check if a key exists we need to read and decode its value. For one or few keys it's not a problem, but for large sets this can become an issue.

For other stores like Redis this is not a problem, because the low-level operations already do them natively, so we don't need to worry about this for performance at the user-level. Instead, Redis and cookies have the problem that they only have expiration resolution at the second level. Meaning that 800ms is not a valid Redis expiration time, it has to be 1s, 2s, etc.

These details are explained in the respective client information.

## Substores

> There's some [basic `.prefix()` API info](#prefix) for everyday usage, this section is the in-depth explanation.

What `.prefix()` does is it creates **a new instance** of the Store, _with the same client_ as you provided, but now any key you read, write, etc. will be passed with the given prefix to the client. The issue is that support from the underlying clients is inconsistent.

When dealing with large or complex amounts of data in a KV store, some times it's useful to divide them by categories. Some examples might be:

- You use KV as a cache, and have different categories of data.
- You use KV as a session store, and want to differentiate different kinds of sessions.
- You use KV as a primary data store, and have different types of datasets.

For these and more situations, you can use `.prefix()` to simplify your life further.

## Creating a store

To create a store, you define a class with these properties and methods:

```js
class MyClient {
  // If this is set to `true`, the CLIENT (you) handle the expiration, so
  // the `.set()` and `.add()` receive a `expires` that is a `null` or `number`:
  EXPIRES = false;

  // Mandatory methods
  get (key): Promise<any>;
  set (key, value, { expires: null|number }): Promise<null>;
  iterate(prefix): AyncIterator<[string, any]>

  // Optional item methods (for optimization or customization)
  add (prefix, data, { expires: null|number }): Promise<string>;
  has (key): Promise<boolean>;
  del (key): Promise<null>;

  // Optional group methods
  entries (prefix): Promise<[string, any][]>;
  keys (prefix): Promise<string[]>;
  values (prefix): Promise<any[]>;
  clear (prefix): Promise<null>;

  // Optional misc method
  close (): Promise<null>;
}
```

Note that this is NOT the public API, it's the internal **client** API. It's simpler than the public API since we do some of the heavy lifting as an intermediate layer (e.g. for the client, the `expires` will always be a `null` or `number`, never `undefined` or a `string`), but also it differs from polystore's public API, like `.add()` has a different signature, and the group methods all take a explicit prefix.

**Expires**: if you set the `EXPIRES = true`, then you are indicating that the client WILL manage the lifecycle of the data. This includes all methods, for example if an item is expired, then its key should not be returned in `.keys()`, it's value should not be returned in `.values()`, and the method `.has()` will return `false`. The good news is that you will always receive the option `expires`, which is either `null` (no expiration) or a `number` indicating the **seconds** for the key/value to will expire.

**Prefix**: we manage the `prefix` as an invisible layer on top, you only need to be aware of it in the `.add()` method, as well as in the group methods:

```js
// What the user of polystore does:
const store = await kv(client).prefix("hello:").prefix("world:");

// User calls this, then the client is called with that:
const value = await store.get("a");
// client.get("hello:world:a");

// User calls this, then the client is called with that:
for await (const [key, value] of store) {}
// client.iterate("hello:world:");
```

> Note: all of the _group methods_ that return keys, should return them **with the prefix**:

```js
client.keys = (prefix) => {
  // Filter the keys, and return them INCLUDING the prefix!
  return Object.keys(subStore).filter((key) => key.startsWith(prefix));
};
```

While the signatures are different, you can check each entries on the output of Polystore API to see what is expected for the methods of the client to do, e.g. `.clear()` will remove all of the items that match the prefix (or everything if there's no prefix).

### Example: Plain Object client

This is a good example of how simple a store can be, however do not use it literally since it behaves the same as the already-supported `new Map()`, only use it as the base for your own clients:

```js
const dataSource = {};

class MyClient {
  get(key) {
    return dataSource[key];
  }

  // No need to stringify it or anything for a plain object storage
  set(key, value) {
    dataSource[key] = value;
  }

  // Filter them by the prefix, note that `prefix` will always be a string
  *iterate(prefix) {
    for (const [key, value] of Object.entries(dataSource)) {
      if (key.startsWith(prefix)) {
        yield [key, value];
      }
    }
  }
}
```

We don't set `EXPIRES` to true since plain objects do NOT support expiration natively. So by not adding the `EXPIRES` property, it's the same as setting it to `false`, and polystore will manage all the expirations as a layer on top of the data. We could be more explicit and set it to `EXPIRES = false`, but it's not needed in this case.

### Example: custom ID generation

You might want to provide your custom key generation algorithm, which I'm going to call `customId()` for example purposes. The only place where `polystore` generates IDs is in `add`, so you can provide your client with a custom generator:

```js
class MyClient {

  // Add the opt method .add() to have more control over the ID generation
  async add (prefix, data, { expires }) {
    const id = customId();
    const key = prefix + id;
    return this.set(key, data, { expires });
  }

  //
  async set (...) {
    // ...
  }
}
```

That way, when using the store, you can simply use `.add()` to generate it:

```js
import kv from "polystore";

const store = kv(MyClient);
const id = await store.add({ hello: "world" });
// this is your own custom id
const id2 = await store.prefix("hello:").add({ hello: "world" });
// this is `hello:{your own custom id}`
```

### Example: serializing the data

If you need to serialize the data before storing it, you can do it within your custom client. Here's an example of how you can handle data serialization when setting values:

```js
class MyClient {
  get(key) {
    const data = dataSource[key];
    return data ? JSON.parse(data) : null;
  }

  set(key, value) {
    dataSource[key] = JSON.stringify(value);
  }

  *iterate(prefix) {
    for (const [key, value] of Object.entries(dataSource)) {
      if (key.startsWith(prefix) && value) {
        yield [key, JSON.parse(value)];
      }
    }
  }
}
```

### Example: Cloudflare API calls

In this example on one of my projects, I needed to use Cloudflare's REST API since I didn't have access to any KV store I was happy with on Netlify's Edge Functions. So I created it like this:

> Warning: this code snippet is an experimental example and hasn't gone through rigurous testing as the rest of the library, so please treat with caution.

```js
const {
  CLOUDFLARE_ACCOUNT,
  CLOUDFLARE_NAMESPACE,
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
} = process.env;

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT}/storage/kv/namespaces/${CLOUDFLARE_NAMESPACE}`;
const headers = {
  "X-Auth-Email": CLOUDFLARE_EMAIL,
  "X-Auth-Key": CLOUDFLARE_API_KEY,
};

class CloudflareCustom {
  EXPIRES = true;

  async get(key) {
    const res = await fetch(`${baseUrl}/values/${key}`, { headers });
    if (res.status === 404) return null; // It does not exist
    const data = await (res.headers.get("content-type").includes("json")
      ? res.json()
      : res.text());
    if (!data) return null;
    return JSON.parse(data);
  }

  async set(key, body, { expires }) {
    const expiration = expires ? `expiration_ttl=${expires}&` : "";
    await fetch(`${baseUrl}/values/${key}?${expiration}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    return key;
  }

  async keys(prefix) {
    const res = await fetch(`${baseUrl}/keys`, { headers });
    const data = await res.json();
    return data.result
      .map((it) => it.name)
      .filter((key) => key.startsWith(prefix));
  }

  async *iterate(prefix) {
    const keys = await this.keys(prefix);

    // A list of promises. Requests them all in parallel, but will start
    // yielding them as soon as they are available (in order)
    const pairs = keys.map(async (key) => [key, await this.get(key)]);
    for (let prom of pairs) {
      const pair = await prom;
      // Some values could have been nullified from reading of the keys to
      // reading of the value
      if (!pair[1]) continue;
      yield await pair;
    }
  }
}

const store = kv(CloudflareCustom);
````

It's lacking few things, so make sure to adapt to your needs, but it worked for my very simple cache needs.
