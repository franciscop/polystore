// A client that uses a single file (JSON) as a store
export default class Cookie {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test(client) {
    return client === "cookie" || client === "cookies";
  }

  // For cookies, an empty value is the same as null, even `""`
  get(key) {
    return this.all()[key] || null;
  }

  set(key, data = null, { expires } = {}) {
    // Setting it to null deletes it
    if (data === null) {
      data = "";
      expires = -100;
    }

    let expireStr = "";
    // NOTE: 0 is already considered here!
    if (expires !== null) {
      const now = new Date().getTime();
      const time = new Date(now + expires * 1000).toUTCString();
      expireStr = `; expires=${time}`;
    }

    const value = encodeURIComponent(JSON.stringify(data));
    document.cookie = encodeURIComponent(key) + "=" + value + expireStr;
    return key;
  }

  // Group methods
  all(prefix = "") {
    const all = {};
    for (let entry of document.cookie.split(";")) {
      const [key, data] = entry.split("=");
      const name = decodeURIComponent(key.trim());
      if (!name.startsWith(prefix)) continue;
      try {
        all[name] = JSON.parse(decodeURIComponent(data.trim()));
      } catch (error) {
        // no-op (some 3rd party can set cookies independently)
      }
    }
    return all;
  }

  entries(prefix = "") {
    return Object.entries(this.all(prefix));
  }
}
