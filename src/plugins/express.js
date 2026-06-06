// src/integrations/express.ts
import session from "express-session";
import kv from "polystore";
var ttlFromSession = (data) => {
  const maxAge = data?.cookie?.originalMaxAge;
  return typeof maxAge === "number" ? { expires: Math.ceil(maxAge / 1e3) } : void 0;
};
var PolystoreSessionStore = class _PolystoreSessionStore extends session.Store {
  store;
  constructor(store) {
    super();
    this.store = store;
  }
  prefix(prefix = "") {
    return new _PolystoreSessionStore(this.store.prefix(prefix));
  }
  get(sid, cb) {
    this.store.get(sid).then((data) => cb(null, data)).catch((err) => err?.code === "ENOENT" ? cb(null, null) : cb(err));
  }
  set(sid, data, cb) {
    this.store.set(sid, data, ttlFromSession(data)).then(() => cb?.()).catch((err) => cb?.(err));
  }
  destroy(sid, cb) {
    this.store.del(sid).then(() => cb?.()).catch((err) => cb?.(err));
  }
  touch(sid, data, cb) {
    this.store.set(sid, data, ttlFromSession(data)).then(() => cb?.()).catch((err) => cb?.(err));
  }
  all(cb) {
    this.store.values().then((vals) => cb(null, vals)).catch(cb);
  }
  clear(cb) {
    this.store.clear().then(() => cb?.()).catch((err) => cb?.(err));
  }
};
function expressStore(client = /* @__PURE__ */ new Map()) {
  return new PolystoreSessionStore(kv(client));
}
export {
  PolystoreSessionStore,
  expressStore as default
};
