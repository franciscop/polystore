import { Serializable } from "../types";

export default class Adapter {
  TYPE?: string;
  HAS_EXPIRATION?: boolean = false;

  lib: any;
  encode = (val: Serializable): string => JSON.stringify(val, null, 2);
  decode = <T = any>(val: string | null): T | null =>
    val ? (JSON.parse(val) as T) : null;

  constructor(lib: any) {
    this.lib = lib;
  }
}
