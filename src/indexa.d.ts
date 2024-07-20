type Key = string;
type Options = { expires?: number | string | null };

type Store = {
  get: (key: Key) => Promise<any>;
  add: (value: any, options?: Options) => Promise<Key>;
  set: (key: Key, value: any, options?: Options) => Promise<Key>;
  has: (key: Key) => Promise<boolean>;
  del: (key: Key) => Promise<null>;

  keys: () => Promise<string[]>;
  values: () => Promise<any[]>;
  entries: () => Promise<[key: string, value: any][]>;

  prefix: (prefix: string) => Store;

  clear: () => Promise<null>;
  close?: () => Promise<null>;
};

export default function (store?: any): Store;
