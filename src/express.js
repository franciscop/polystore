import session from "express-session";
import kv from "../index.js";

const ttlFromSession = (data) => {
  const maxAge = data?.cookie?.originalMaxAge;
  return typeof maxAge === "number" ? Math.ceil(maxAge / 1000) : null;
};

export class PolystoreSessionStore extends session.Store {
  constructor(store) {
    super();
    this.store = store;
  }

  prefix(prefix = "") {
    return new PolystoreSessionStore(this.store.prefix(prefix));
  }

  get(sid, cb) {
    this.store.get(sid).then((data) => cb(null, data)).catch(cb);
  }

  set(sid, data, cb) {
    this.store
      .set(sid, data, ttlFromSession(data))
      .then(() => cb && cb())
      .catch((error) => cb && cb(error));
  }

  destroy(sid, cb) {
    this.store
      .del(sid)
      .then(() => cb && cb())
      .catch((error) => cb && cb(error));
  }

  touch(sid, data, cb) {
    this.store
      .set(sid, data, ttlFromSession(data))
      .then(() => cb && cb())
      .catch((error) => cb && cb(error));
  }
}

export default function expressStore(client = new Map()) {
  return new PolystoreSessionStore(kv(client));
}
