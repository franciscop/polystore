type Store = {
  get: (key: string) => Promise<any>;
  set: (
    key: string,
    value: any,
    opts?: { expires?: number | string | null }
  ) => Promise<null>;
  has: (key: string) => Promise<boolean>;
  del: (key: string) => Promise<null>;

  keys: (prefix?: string) => Promise<string[]>;
  clear: () => Promise<null>;
};

export default function (store?: any): Store;
