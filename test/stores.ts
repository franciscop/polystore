import { EdgeKVNamespace as KVNamespace } from "edge-mock";
import { Etcd3 } from "etcd3";
import { Level } from "level";
import localForage from "localforage";
import { createClient } from "redis";

import kv, { Store } from "../src/index";
import bunsqlite from "./bunsqlite";
// import customCloudflare from "./customCloudflare.js";
import customFull from "./customFull";
import customSimple from "./customSimple";

type FileURL = `file://${string}`;

type StoreType =
  | "kv()"
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
stores["new Map()"] = kv(new Map());

// Browser stores
stores["localStorage"] = kv(localStorage);
stores["sessionStorage"] = kv(sessionStorage);
stores["localForage"] = kv(localForage);
stores[`"cookie"`] = kv("cookie");

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
const apiAvailable = await fetch(url)
  .then((res) => res.status === 200)
  .catch(() => false);
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

// Custom stores
stores["customSimple"] = kv(customSimple);
stores["customFull"] = kv(customFull);
// stores["customCloudflare"] = kv(customCloudflare);

export default stores;
