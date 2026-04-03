import session from "express-session";
import type { SessionData } from "express-session";
import kv from "polystore";
import type { Store } from "polystore";

type Callback = (err?: any) => void;

const ttlFromSession = (data: SessionData): { expires: number } | undefined => {
  const maxAge = data?.cookie?.originalMaxAge;
  return typeof maxAge === "number"
    ? { expires: Math.ceil(maxAge / 1000) }
    : undefined;
};

export class PolystoreSessionStore extends session.Store {
  private store: Store;

  constructor(store: Store) {
    super();
    this.store = store;
  }

  prefix(prefix = ""): PolystoreSessionStore {
    return new PolystoreSessionStore(this.store.prefix(prefix));
  }

  get(sid: string, cb: (err: any, session?: SessionData | null) => void): void {
    this.store
      .get(sid)
      .then((data) => cb(null, data as SessionData | null))
      .catch((err) => (err?.code === "ENOENT" ? cb(null, null) : cb(err)));
  }

  set(sid: string, data: SessionData, cb?: Callback): void {
    this.store
      .set(sid, data as any, ttlFromSession(data))
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  destroy(sid: string, cb?: Callback): void {
    this.store
      .del(sid)
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  touch(sid: string, data: SessionData, cb?: Callback): void {
    this.store
      .set(sid, data as any, ttlFromSession(data))
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  all(cb: (err: any, sessions?: SessionData[] | { [sid: string]: SessionData } | null) => void): void {
    this.store
      .values()
      .then((vals) => cb(null, vals as unknown as SessionData[]))
      .catch(cb);
  }

  clear(cb?: Callback): void {
    this.store
      .clear()
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }
}

export default function expressStore(client = new Map()): PolystoreSessionStore {
  return new PolystoreSessionStore(kv(client));
}
