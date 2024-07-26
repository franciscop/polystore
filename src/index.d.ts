type Options = { expires?: number | string | null };
type Value = null | string | { [key: string]: Value } | Value[];

type Store = {
  get: (key: string) => Promise<Value>;
  add: (value: any, options?: Options) => Promise<string>;
  set: (key: string, value: any, options?: Options) => Promise<string>;
  has: (key: string) => Promise<boolean>;
  del: (key: string) => Promise<null>;

  keys: () => Promise<string[]>;
  values: () => Promise<any[]>;
  entries: () => Promise<[key: string, value: any][]>;

  prefix: (prefix: string) => Store;

  clear: () => Promise<null>;
  close?: () => Promise<null>;
};

export default function (store?: any): Store;
