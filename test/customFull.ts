const dataSource: Record<string, any> = {};

export default class MyClient {
  TYPE = "FULLCUSTOM";

  get(key: string): any {
    return dataSource[key];
  }

  set(key: string, value: any): void {
    dataSource[key] = value;
  }

  add(prefix: string, value: any): string {
    const id = Math.random().toString(16).slice(2).padStart(24, "0");
    this.set(prefix + id, value);
    return id;
  }

  del(key: string): void {
    delete dataSource[key];
  }

  *iterate(prefix: string): Generator<[string, any], void, unknown> {
    const entries = this.entries(prefix);
    for (const entry of entries) {
      yield entry;
    }
  }

  // Filter them by the prefix, note that `prefix` will always be a string
  entries(prefix: string): [string, any][] {
    const entries = Object.entries(dataSource);
    if (!prefix) return entries;
    return entries.filter(([key]) => key.startsWith(prefix));
  }
}
