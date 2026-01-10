import { EdgeKVNamespace as KVNamespace } from "edge-mock";
import { Etcd3 } from "etcd3";
import { Level } from "level";
import localForage from "localforage";
import { createClient } from "redis";

import kv, { Store } from "../src/index.ts";
import bunsqlite from "./bunsqlite.ts";
// import customCloudflare from "./customCloudflare.js";
import customFull from "./customFull.ts";
import customSimple from "./customSimple.ts";

type FileURL = `file://${string}`;

type StoreType =
  | "kv()"
  | "kv(kv())"
  | "new Map()"
  | "localStorage"
  | "sessionStorage"
  | "localForage"
  | "http://localhost:3000/"
  | 'new URL("file://<cwd>/data/kv.json")'
  | '"file://<cwd>/data/kv.json"'
  | 'new URL("file://<cwd>/data/folder/")'
  | '"file://<cwd>/data/folder/"'
  | '"cookie"'
  | "new KVNamespace()"
  | 'new Level("data")'
  | "redis"
  | "sqlite"
  | "bunsqlite"
  | "new Etcd3()"
  | "customSimple"
  | "customFull"
  | "customCloudflare"
  // dynamic patterns:
  | `${FileURL}`
  | `new URL("${FileURL}")`
  | `"${FileURL}"`;

const stores: Partial<Record<StoreType, Store>> = {};

// In-memory stores
stores["kv()"] = kv();
stores["kv(kv())"] = kv(kv()); //  Recursion testing
stores["new Map()"] = kv(new Map());

// Browser stores
if (typeof localStorage !== "undefined") {
  stores["localStorage"] = kv(localStorage);
}
if (typeof sessionStorage !== "undefined") {
  stores["sessionStorage"] = kv(sessionStorage);
}
if (typeof localStorage !== "undefined") {
  stores["localForage"] = kv(localForage);
}
if (typeof document !== "undefined" && document.cookie) {
  stores[`"cookie"`] = kv("cookie");
}

// File stores
const path = `file://${process.cwd()}/data/kv.json` as FileURL;
stores[`new URL("${path}")` as StoreType] = kv(new URL(path));
const path2 = `file://${process.cwd()}/data/kv.json` as FileURL;
stores[`"${path2}"` as StoreType] = kv(path2);
const path3 = `file://${process.cwd()}/data/folder/` as FileURL;
stores[`new URL("${path3}")` as StoreType] = kv(new URL(path3));
const path4 = `file://${process.cwd()}/data/folder/` as FileURL;
stores[`"${path4}"` as StoreType] = kv(path4);

// KV Wrappers
stores["new KVNamespace()"] = kv(new KVNamespace());
stores[`new Level("data")`] = kv(new Level("data"));
const url = "http://localhost:3000/";
const apiAvailable = !process.env.CI;
if (apiAvailable) {
  stores[`${url}` as StoreType] = kv(url);
}
if (process.env.REDIS) {
  stores["redis"] = kv(createClient().connect());
}
if (process.env.ETCD) {
  stores["new Etcd3()"] = kv(new Etcd3());
}

// SQL stores
stores["bunsqlite"] = kv(bunsqlite);
// stores['postgres'] = kv(postgres);

// Custom stores
stores["customSimple"] = kv(customSimple);
stores["customFull"] = kv(customFull);
// stores["customCloudflare"] = kv(customCloudflare);

// Only run some specific stores (empty = all)
const only: string[] = [];

export const doNotSupportMs: StoreType[] = [
  `"cookie"`,
  `redis`,
  `new Etcd3()`,
  `customCloudflare`,
];

export const doNotSupportExpiration: StoreType[] = [
  "new KVNamespace()", // The mock implementation does NOT support expiration 😪
  `customCloudflare`, // Some stores expect 60s+ expiration times, too long to test automatically 😪
];

for (const key of Object.keys(stores).filter(
  (p) => only.length && only.includes(p[0]),
)) {
  if (!only.includes(key)) {
    delete stores[key as keyof typeof stores];
  }
}

export default stores;
