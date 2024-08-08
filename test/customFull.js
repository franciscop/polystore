const dataSource = {};

export default class MyClient {
  get(key) {
    return dataSource[key];
  }

  set(key, value) {
    dataSource[key] = value;
  }

  add(prefix, value) {
    const id = Math.random().toString(16).slice(2).padStart(24, "0");
    this.set(prefix + id, value);
    return id;
  }

  del(key) {
    delete dataSource[key];
  }

  *iterate(prefix) {
    const entries = this.entries(prefix);
    for (const entry of entries) {
      yield entry;
    }
  }

  // Filter them by the prefix, note that `prefix` will always be a string
  entries(prefix) {
    const entries = Object.entries(dataSource);
    if (!prefix) return entries;
    return entries.filter(([key]) => key.startsWith(prefix));
  }

  values(prefix) {
    const list = this.entries(prefix);
    return list.map((e) => e[1]);
  }

  // Cannot have a keys() if it's an unamanaged store
  // keys(prefix) {
  //   // This should throw
  // }
}
