export type Options = {
  expires?: number | null | string;
};

export type ClientOptions = {
  expires?: number | null;
};

export type StoreData<T extends Serializable = Serializable> = {
  value: T;
  expires: number | null;
};

export type Serializable =
  | string
  | number
  | boolean
  | null
  | (Serializable | null)[]
  | { [key: string]: Serializable | null };

export interface ClientExpires {
  TYPE: string;
  EXPIRES: true;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  // testKeys?: string[];
  get<T extends Serializable>(key: string): Promise<T | null> | T | null;
  set<T extends Serializable>(
    key: string,
    value: T,
    options?: Options,
  ): Promise<any> | any;
  iterate<T extends Serializable>(
    prefix: string,
  ):
    | AsyncGenerator<[string, T], void, unknown>
    | Generator<[string, T], void, unknown>;
  add?<T extends Serializable>(
    prefix: string,
    value: T,
    options?: Options,
  ): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T extends Serializable>(prefix: string): Promise<T[]> | T[];
  entries?<T extends Serializable>(
    prefix: string,
  ): Promise<[string, T][]> | [string, T][];
  all?<T extends Serializable>(
    prefix: string,
  ): Promise<Record<string, T>> | Record<string, T>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

export interface ClientNonExpires {
  TYPE: string;
  EXPIRES: false;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  // testKeys?: string[];
  get<T extends Serializable>(
    key: string,
  ): Promise<StoreData<T> | null> | StoreData<T> | null;
  set<T extends Serializable>(
    key: string,
    value: StoreData<T> | null,
    options?: Options,
  ): Promise<any> | any;
  iterate<T extends Serializable>(
    prefix: string,
  ):
    | AsyncGenerator<[string, StoreData<T>], void, unknown>
    | Generator<[string, StoreData<T>], void, unknown>;
  add?<T extends Serializable>(
    prefix: string,
    value: StoreData<T>,
    options?: Options,
  ): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T extends Serializable>(
    prefix: string,
  ): Promise<StoreData<T>[]> | StoreData<T>[];
  entries?<T extends Serializable>(
    prefix: string,
  ): Promise<[string, StoreData<T>][]> | [string, StoreData<T>][];
  all?<T extends Serializable>(
    prefix: string,
  ): Promise<Record<string, StoreData<T>>> | Record<string, StoreData<T>>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

export type Client = ClientExpires | ClientNonExpires;
