// src/plugins/better-auth/index.ts
import kv from "polystore";
var PolystoreBetterAuthStorage = class _PolystoreBetterAuthStorage {
  store;
  constructor(store) {
    this.store = store;
  }
  prefix(prefix = "") {
    return new _PolystoreBetterAuthStorage(this.store.prefix(prefix));
  }
  get(key) {
    return this.store.get(key);
  }
  async set(key, value, ttl) {
    await this.store.set(key, value, ttl ? { expires: ttl } : void 0);
  }
  async delete(key) {
    await this.store.del(key);
  }
};
function betterAuthStorage(store = /* @__PURE__ */ new Map()) {
  return new PolystoreBetterAuthStorage(kv(store));
}
export {
  PolystoreBetterAuthStorage,
  betterAuthStorage as default
};
