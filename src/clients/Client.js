export default class Client {
  constructor(client) {
    this.client = client;
  }
  encode = (val) => JSON.stringify(val, null, 2);
  decode = (val) => (val ? JSON.parse(val) : null);
}
