const dataSource = {};

export default class MyClient {
  get(key) {
    return dataSource[key];
  }

  // No need to stringify it or anything for a plain object storage
  set(key, value) {
    if (value === null) {
      delete dataSource[key];
    } else {
      dataSource[key] = value;
    }
  }

  // Filter them by the prefix, note that `prefix` will always be a string
  entries(prefix) {
    const entries = Object.entries(dataSource);
    if (!prefix) return entries;
    return entries.filter(([key, value]) => key.startsWith(prefix));
  }
}
