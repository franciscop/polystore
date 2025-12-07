import { EdgeKVNamespace as KVNamespace } from "edge-mock";
import { Etcd3 } from "etcd3";
import { Level } from "level";
import localForage from "localforage";
import { createClient } from "redis";

import kv, { Store } from "../src/index";
// import customCloudflare from "./customCloudflare.js";
import customFull from "./customFull";
import customSimple from "./customSimple";

const stores: Record<string, Store> = {};
stores["kv(new Map())"] = kv(new Map());
stores["kv(localStorage)"] = kv(localStorage);
stores["kv(sessionStorage)"] = kv(sessionStorage);
stores["kv(localForage)"] = kv(localForage);
const url = "http://localhost:3000/";
if (
  await fetch(url)
    .then((res) => res.status === 200)
    .catch(() => false)
) {
  stores[`kv(${url})`] = kv(url);
}
const path = `file://${process.cwd()}/data/kv.json`;
stores[`kv(new URL("${path}"))`] = kv(new URL(path));
const path2 = `file://${process.cwd()}/data/kv.json`;
stores[`kv("${path2}")`] = kv(path2);
const path3 = `file://${process.cwd()}/data/folder/`;
stores[`kv(new URL("${path3}"))`] = kv(new URL(path3));
const path4 = `file://${process.cwd()}/data/folder/`;
stores[`kv("${path4}")`] = kv(path4);
stores[`kv("cookie")`] = kv("cookie");
stores["kv(new KVNamespace())"] = kv(new KVNamespace());
stores[`kv(new Level("data"))`] = kv(new Level("data"));
if (process.env.REDIS) {
  stores["kv(redis)"] = kv(createClient().connect());
}
if (process.env.ETCD) {
  // Note: need to add to .env "ETCD=true" and run `npm run db` in the terminal
  stores["kv(new Etcd3())"] = kv(new Etcd3());
}
stores["kv(customSimple)"] = kv(customSimple);
stores["kv(customFull)"] = kv(customFull);
// stores["kv(customCloudflare)"] = kv(customCloudflare);

export default stores;
