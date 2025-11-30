const dataSource: Record<string, any> = {};

export default class MyClient {
  get(key: string): any {
    return dataSource[key];
  }

  // No need to stringify it or anything for a plain object storage
  set(key: string, value: any): void {
    if (value === null) {
      delete dataSource[key];
    } else {
      dataSource[key] = value;
    }
  }

  // Filter them by the prefix, note that `prefix` will always be a string
  *iterate(prefix: string): Generator<[string, any], void, unknown> {
    const raw = Object.entries(dataSource);
    const entries = prefix
      ? raw.filter(([key, value]) => key.startsWith(prefix))
      : raw;
    for (const entry of entries) {
      yield entry as [string, any];
    }
  }
}
