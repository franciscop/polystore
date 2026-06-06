import session, { SessionData } from 'express-session';
import { Store } from 'polystore';

type Callback = (err?: any) => void;
declare class PolystoreSessionStore extends session.Store {
    private store;
    constructor(store: Store);
    prefix(prefix?: string): PolystoreSessionStore;
    get(sid: string, cb: (err: any, session?: SessionData | null) => void): void;
    set(sid: string, data: SessionData, cb?: Callback): void;
    destroy(sid: string, cb?: Callback): void;
    touch(sid: string, data: SessionData, cb?: Callback): void;
    all(cb: (err: any, sessions?: SessionData[] | {
        [sid: string]: SessionData;
    } | null) => void): void;
    clear(cb?: Callback): void;
}
declare function expressStore(store?: Map<any, any>): PolystoreSessionStore;

export { PolystoreSessionStore, expressStore as default };
