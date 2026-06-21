// src/plugins/axios-cache-interceptor/index.ts
import { buildStorage } from "axios-cache-interceptor";
import kv from "polystore";
var MAX_STALE_AGE = 36e5;
var ttlFromValue = (value) => {
  if (value.ttl === void 0 || value.createdAt === void 0) return void 0;
  const staleTtl = value.state === "cached" ? value.staleTtl ?? 0 : 0;
  const removableAt = value.createdAt + value.ttl + Math.max(staleTtl, MAX_STALE_AGE);
  const secs = Math.ceil((removableAt - Date.now()) / 1e3);
  return secs > 0 ? { expires: secs } : void 0;
};
var PolystoreAxiosCacheStorage = class _PolystoreAxiosCacheStorage {
  // Marks this object as a valid storage so `setupCache()` accepts it (it calls
  // the internal `isStorage()`, which checks for this exact property).
  "is-storage" = 1;
  store;
  _storage;
  constructor(store) {
    this.store = store;
    this._storage = buildStorage({
      find: (key) => this.store.get(key).then((v) => v ?? void 0),
      set: (key, value) => this.store.set(key, value, ttlFromValue(value)),
      remove: (key) => this.store.del(key),
      clear: () => this.store.clear()
    });
  }
  prefix(prefix = "") {
    return new _PolystoreAxiosCacheStorage(this.store.prefix(prefix));
  }
  get(key, currentRequest) {
    return this._storage.get(key, currentRequest);
  }
  set(key, value, currentRequest) {
    return this._storage.set(key, value, currentRequest);
  }
  remove(key, currentRequest) {
    return this._storage.remove(key, currentRequest);
  }
  clear() {
    return Promise.resolve(this._storage.clear?.());
  }
};
function axiosCacheStorage(store = /* @__PURE__ */ new Map()) {
  return new PolystoreAxiosCacheStorage(kv(store));
}
export {
  PolystoreAxiosCacheStorage,
  axiosCacheStorage as default
};
