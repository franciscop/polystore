type Key = string;
type Options = { expires?: number | string | null };

type Store = {
  get: (key: Key) => Promise<any>;
  add: (value: any, options?: Options) => Promise<Key>;
  set: (key: Key, value: any, options?: Options) => Promise<Key>;
  has: (key: Key) => Promise<boolean>;
  del: (key: Key) => Promise<null>;

  keys: (prefix?: string) => Promise<string[]>;
  values: (prefix?: string) => Promise<any[]>;
  entries: (prefix?: string) => Promise<[key: string, value: any][]>;

  clear: () => Promise<null>;
  close?: () => Promise<null>;
};

export default function (store?: any): Store;
