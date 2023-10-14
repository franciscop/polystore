type Expire = number | string | null;

type Store = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any, opts?: { expire?: Expire }) => Promise<null>;
  has: (key: string) => Promise<boolean>;
  del: (key: string) => Promise<null>;

  keys: (prefix?: string) => Promise<string[]>;
  clear: () => Promise<null>;
};

export default function (store?: any): Store;
