import type { Store, SessionData } from "hono-sessions";
import kv from "polystore";
import type { Store as KVStore } from "polystore";

const ttlFromSession = (data: SessionData): { expires: number } | undefined => {
  if (!data._expire) return undefined;
  const secs = Math.ceil((new Date(data._expire).getTime() - Date.now()) / 1000);
  return secs > 0 ? { expires: secs } : undefined;
};

export class PolystoreHonoStore implements Store {
  private store: KVStore;

  constructor(store: KVStore) {
    this.store = store;
  }

  prefix(prefix = ""): PolystoreHonoStore {
    return new PolystoreHonoStore(this.store.prefix(prefix));
  }

  async getSessionById(sessionId?: string): Promise<SessionData | null | undefined> {
    if (!sessionId) return null;
    return this.store.get(sessionId) as Promise<SessionData | null>;
  }

  async createSession(sessionId: string, initialData: SessionData): Promise<void> {
    await this.store.set(sessionId, initialData as any, ttlFromSession(initialData));
  }

  async persistSessionData(sessionId: string, sessionData: SessionData): Promise<void> {
    await this.store.set(sessionId, sessionData as any, ttlFromSession(sessionData));
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.store.del(sessionId);
  }
}

export default function honoStore(client = new Map()): PolystoreHonoStore {
  return new PolystoreHonoStore(kv(client));
}
