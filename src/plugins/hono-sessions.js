// src/integrations/hono-sessions.ts
import kv from "polystore";
var ttlFromSession = (data) => {
  if (!data._expire) return void 0;
  const secs = Math.ceil((new Date(data._expire).getTime() - Date.now()) / 1e3);
  return secs > 0 ? { expires: secs } : void 0;
};
var PolystoreHonoStore = class _PolystoreHonoStore {
  store;
  constructor(store) {
    this.store = store;
  }
  prefix(prefix = "") {
    return new _PolystoreHonoStore(this.store.prefix(prefix));
  }
  async getSessionById(sessionId) {
    if (!sessionId) return null;
    return this.store.get(sessionId);
  }
  async createSession(sessionId, initialData) {
    await this.store.set(sessionId, initialData, ttlFromSession(initialData));
  }
  async persistSessionData(sessionId, sessionData) {
    await this.store.set(sessionId, sessionData, ttlFromSession(sessionData));
  }
  async deleteSession(sessionId) {
    await this.store.del(sessionId);
  }
};
function honoStore(client = /* @__PURE__ */ new Map()) {
  return new PolystoreHonoStore(kv(client));
}
export {
  PolystoreHonoStore,
  honoStore as default
};
