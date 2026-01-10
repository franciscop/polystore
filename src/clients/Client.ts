import { Serializable } from "../types";

export default class Client {
  EXPIRES?: boolean = false;

  client: any;
  encode = (val: Serializable): string => JSON.stringify(val, null, 2);
  decode = <T = any>(val: string | null): T | null =>
    val ? (JSON.parse(val) as T) : null;

  constructor(client: any) {
    this.client = client;
  }
}
