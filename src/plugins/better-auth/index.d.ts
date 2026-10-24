import type { Store } from "polystore";
type SecondaryStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
};
export declare class PolystoreBetterAuthStorage implements SecondaryStorage {
  private store;
  constructor(store: Store);
  prefix(prefix?: string): PolystoreBetterAuthStorage;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
export default function betterAuthStorage(
  store?: any,
): PolystoreBetterAuthStorage;
export {};
