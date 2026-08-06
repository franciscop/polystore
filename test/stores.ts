import { EdgeKVNamespace as KVNamespace } from "edge-mock";
import { Etcd3 } from "etcd3";
import { Level } from "level";
import localForage from "localforage";
import { Client } from "pg";
import { createClient } from "redis";

import kv, { type Store, type StoreType } from "../src/index.ts";
// import customCloudflare from "./customCloudflare.ts";
import customFull from "./customFull.ts";
import customSimple from "./customSimple.ts";

// Only run some specific stores, by their label below (empty = all)
const only: string[] = [];

// The key is how the store is written, so that a failure names the way it
// was created; what it *is* comes from `store.type`
const stores: Record<string, Store> = {};

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
const file = `file://${process.cwd()}/data/kv.json`;
stores[`new URL("${file}")`] = kv(new URL(file));
stores[`"${file}"`] = kv(file);
const folder = `file://${process.cwd()}/data/folder/`;
stores[`new URL("${folder}")`] = kv(new URL(folder));
stores[`"${folder}"`] = kv(folder);

// KV Wrappers
stores["new KVNamespace()"] = kv(new KVNamespace());
stores[`new Level("data")`] = kv(new Level("data"));
const url = "http://localhost:3000/";
const apiAvailable = !process.env.CI;
if (apiAvailable) {
  stores[url] = kv(url);
}
if (process.env.REDIS) {
  stores["redis"] = kv(createClient());
}
if (process.env.ETCD) {
  stores["new Etcd3()"] = kv(new Etcd3());
}

// SQL stores
const Database =
  typeof globalThis.Bun !== "undefined"
    ? (await import("bun:sqlite")).Database
    : ((await import("better-sqlite3")) as any).default;
stores["sqlite"] = kv(new Database(":memory:"));
if (process.env.POSTGRES_URL) {
  stores["postgres"] = kv(
    new Client({ connectionString: process.env.POSTGRES_URL }),
  );
}

// Custom stores
stores["customSimple"] = kv(customSimple);
stores["customFull"] = kv(customFull);
// stores["customCloudflare"] = kv(customCloudflare);

// These adapters expire in whole seconds, so sub-second tests are meaningless
export const doNotSupportMs: StoreType[] = [
  "CLOUDFLARE",
  "COOKIE",
  "ETCD3",
  "POSTGRES",
  "REDIS",
  "CLOUDFLAREAPI",
];

export const cannotTestExpiration: StoreType[] = [
  "CLOUDFLARE", // The mock implementation does NOT support expiration 😪
  "CLOUDFLAREAPI", // Some stores expect 60s+ expirations, too long to test 😪
];

for (const key of Object.keys(stores).filter(
  (p) => only.length && !only.includes(p),
)) {
  delete stores[key];
}

export default stores;
