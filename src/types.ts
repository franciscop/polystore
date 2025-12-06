export type Options = {
  expires?: number | null | string;
};

export type ClientOptions = {
  expires?: number | null;
};

export type Serializable =
  | string
  | number
  | boolean
  | null
  | Serializable[]
  | { [key: string]: Serializable };
