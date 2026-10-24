import type { Store, SessionData } from "hono-sessions";
import type { Store as KVStore } from "polystore";
export declare class PolystoreHonoStore implements Store {
  private store;
  constructor(store: KVStore);
  prefix(prefix?: string): PolystoreHonoStore;
  getSessionById(sessionId?: string): Promise<SessionData | null | undefined>;
  createSession(sessionId: string, initialData: SessionData): Promise<void>;
  persistSessionData(
    sessionId: string,
    sessionData: SessionData,
  ): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}
export default function honoStore(store?: Map<any, any>): PolystoreHonoStore;
