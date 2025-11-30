export default class Client {
  client: any;
  encode = (val: any): string => JSON.stringify(val, null, 2);
  decode = (val: string | null): any => (val ? JSON.parse(val) : null);

  constructor(client: any) {
    this.client = client;
  }
}
