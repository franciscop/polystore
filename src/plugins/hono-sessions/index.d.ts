import { Store, SessionData } from 'hono-sessions';
import { Store as Store$1 } from 'polystore';

declare class PolystoreHonoStore implements Store {
    private store;
    constructor(store: Store$1);
    prefix(prefix?: string): PolystoreHonoStore;
    getSessionById(sessionId?: string): Promise<SessionData | null | undefined>;
    createSession(sessionId: string, initialData: SessionData): Promise<void>;
    persistSessionData(sessionId: string, sessionData: SessionData): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
}
declare function honoStore(store?: Map<any, any>): PolystoreHonoStore;

export { PolystoreHonoStore, honoStore as default };
