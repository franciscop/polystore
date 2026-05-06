// src/clients/Client.ts
var Client = class {
  TYPE;
  HAS_EXPIRATION = false;
  client;
  encode = (val) => JSON.stringify(val, null, 2);
  decode = (val) => val ? JSON.parse(val) : null;
  constructor(client) {
    this.client = client;
  }
};

// src/clients/api.ts
var Api = class extends Client {
  TYPE = "API";
  // Indicate that the file handler DOES handle expirations
  HAS_EXPIRATION = true;
  static test = (client) => typeof client === "string" && /^https?:\/\//.test(client);
  #api = async (key, opts = "", method = "GET", body) => {
    const url = `${this.client.replace(/\/$/, "")}/${encodeURIComponent(key)}${opts}`;
    const headers = {
      accept: "application/json",
      "content-type": "application/json"
    };
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) return null;
    return this.decode(await res.text());
  };
  get = (key) => this.#api(key);
  set = async (key, value, expires) => {
    const exp = typeof expires === "number" ? `?expires=${expires}` : "";
    await this.#api(key, exp, "PUT", this.encode(value));
  };
  del = (key) => this.#api(key, "", "DELETE");
  async *iterate(prefix = "") {
    const data = await this.#api(
      "",
      `?prefix=${encodeURIComponent(prefix)}`
    );
    for (let [key, value] of Object.entries(data || {})) {
      if (value !== null) {
        yield [prefix + key, value];
      }
    }
  }
};

// src/clients/cloudflare.ts
var Cloudflare = class extends Client {
  TYPE = "CLOUDFLARE";
  // It handles expirations natively
  HAS_EXPIRATION = true;
  static testKeys = ["getWithMetadata", "get", "list", "delete"];
  get = async (key) => {
    const value = await this.client.get(key);
    return this.decode(value);
  };
  set = async (key, data, expires) => {
    const expirationTtl = expires ? Math.round(expires) : void 0;
    if (expirationTtl && expirationTtl < 60) {
      throw new Error("Cloudflare's min expiration is '60s'");
    }
    await this.client.put(key, this.encode(data), { expirationTtl });
  };
  del = (key) => this.client.delete(key);
  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate(prefix = "") {
    let cursor;
    do {
      const raw = await this.client.list({ prefix, cursor });
      const keys = raw.keys.map((k) => k.name);
      for (let key of keys) {
        const value = await this.get(key);
        if (value !== null && value !== void 0) yield [key, value];
      }
      cursor = raw.list_complete ? void 0 : raw.cursor;
    } while (cursor);
  }
  keys = async (prefix = "") => {
    const keys = [];
    let cursor;
    do {
      const raw = await this.client.list({ prefix, cursor });
      keys.push(...raw.keys.map((k) => k.name));
      cursor = raw.list_complete ? void 0 : raw.cursor;
    } while (cursor);
    return keys;
  };
  entries = async (prefix = "") => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]).filter((p) => p[1] !== null);
  };
};

// src/clients/cookie.ts
var Cookie = class extends Client {
  TYPE = "COOKIE";
  // It handles expirations natively
  HAS_EXPIRATION = true;
  // Check if this is the right class for the given client
  static test = (client) => {
    return client === "cookie" || client === "cookies";
  };
  // Group methods
  #read = () => {
    const all = {};
    for (let entry of document.cookie.split(";")) {
      try {
        const [rawKey, rawValue] = entry.split("=");
        const key = decodeURIComponent(rawKey.trim());
        const value = this.decode(decodeURIComponent(rawValue.trim()));
        all[key] = value;
      } catch (error) {
      }
    }
    return all;
  };
  // For cookies, an empty value is the same as null, even `""`
  get = (key) => {
    const all = this.#read();
    return key in all ? all[key] : null;
  };
  set = (key, data, expires) => {
    const k = encodeURIComponent(key);
    const value = encodeURIComponent(this.encode(data ?? ""));
    let exp = "";
    if (typeof expires === "number") {
      const when = expires <= 0 ? 0 : Date.now() + expires * 1e3;
      exp = `; expires=${new Date(when).toUTCString()}`;
    }
    document.cookie = `${k}=${value}${exp}`;
  };
  del = (key) => this.set(key, "", -100);
  async *iterate(prefix = "") {
    for (let [key, value] of Object.entries(this.#read())) {
      if (!key.startsWith(prefix)) continue;
      yield [key, value];
    }
  }
};

// src/clients/etcd.ts
var Etcd = class extends Client {
  TYPE = "ETCD3";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static testKeys = ["leaseClient", "watchClient", "watchManager"];
  get = async (key) => {
    const data = await this.client.get(key).json();
    return data;
  };
  set = async (key, value) => {
    await this.client.put(key).value(this.encode(value));
  };
  del = (key) => this.client.delete().key(key).exec();
  async *iterate(prefix = "") {
    const keys = await this.client.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get(key)];
    }
  }
  clear = async (prefix = "") => {
    if (!prefix) return this.client.delete().all();
    return this.client.delete().prefix(prefix);
  };
};

// src/clients/file.ts
var File = class extends Client {
  TYPE = "FILE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  fsp;
  file = "";
  #lock = Promise.resolve();
  // Check if this is the right class for the given client
  static test = (client) => {
    if (client instanceof URL) client = client.href;
    return typeof client === "string" && client.startsWith("file://") && client.endsWith(".json");
  };
  // We want to make sure the file already exists, so attempt to
  // create the folders and the file (but not OVERWRITE it, that's why the x flag)
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    this.fsp = await import("fs/promises");
    this.file = (this.client?.href || this.client).replace(/^file:\/\//, "");
    const folder = this.file.split("/").slice(0, -1).join("/");
    await this.fsp.mkdir(folder, { recursive: true }).catch(() => {
    });
    await this.fsp.writeFile(this.file, "{}", { flag: "wx" }).catch(() => {
    });
  })();
  // Internal - acquire lock before operations
  #withLock = async (fn) => {
    const previousLock = this.#lock;
    let releaseLock;
    this.#lock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    try {
      await previousLock;
      return await fn();
    } finally {
      releaseLock();
    }
  };
  #read = async () => {
    try {
      const text = await this.fsp.readFile(this.file, "utf8");
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  };
  #write = async (data) => {
    return this.fsp.writeFile(this.file, this.encode(data));
  };
  get = async (key) => {
    return this.#withLock(async () => {
      const data = await this.#read();
      return data[key] ?? null;
    });
  };
  set = async (key, value) => {
    return this.#withLock(async () => {
      const data = await this.#read();
      if (value === null) {
        delete data[key];
      } else {
        data[key] = value;
      }
      await this.#write(data);
    });
  };
  async *iterate(prefix = "") {
    const data = await this.#read();
    const entries = Object.entries(data).filter((p) => p[0].startsWith(prefix));
    for (const entry of entries) {
      yield entry;
    }
  }
  // Bulk updates are worth creating a custom method here
  clear = async (prefix = "") => {
    if (!prefix) {
      await this.#withLock(() => this.#write({}));
    }
    return this.#withLock(async () => {
      const data = await this.#read();
      for (let key in data) {
        if (key.startsWith(prefix)) {
          delete data[key];
        }
      }
      await this.#write(data);
    });
  };
};

// src/clients/folder.ts
var noFileOk = (error) => {
  if (error.code === "ENOENT") return null;
  throw error;
};
var Folder = class extends Client {
  TYPE = "FOLDER";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  fsp;
  folder;
  // Check if this is the right class for the given client
  static test = (client) => {
    if (client instanceof URL) client = client.href;
    return typeof client === "string" && client.startsWith("file://") && client.endsWith("/");
  };
  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    this.fsp = await import("fs/promises");
    this.folder = (this.client?.href || this.client).replace(/^file:\/\//, "");
    await this.fsp.mkdir(this.folder, { recursive: true }).catch(() => {
    });
  })();
  file = (key) => this.folder + key + ".json";
  get = async (key) => {
    const file = await this.fsp.readFile(this.file(key), "utf8").catch(noFileOk);
    return this.decode(file);
  };
  set = async (key, value) => {
    await this.fsp.writeFile(this.file(key), this.encode(value), "utf8");
  };
  del = async (key) => {
    await this.fsp.unlink(this.file(key)).catch(noFileOk);
  };
  async *iterate(prefix = "") {
    const all = await this.fsp.readdir(this.folder);
    const keys = all.filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    for (const name of keys) {
      const key = name.slice(0, -".json".length);
      try {
        const data = await this.get(key);
        if (data !== null && data !== void 0) yield [key, data];
      } catch {
        continue;
      }
    }
  }
};

// src/clients/forage.ts
var Forage = class extends Client {
  TYPE = "FORAGE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test = (client) => client?.defineDriver && client?.dropInstance && client?.INDEXEDDB;
  get = (key) => this.client.getItem(key);
  set = (key, value) => this.client.setItem(key, value);
  del = (key) => this.client.removeItem(key);
  async *iterate(prefix = "") {
    const keys = await this.client.keys();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      const value = await this.get(key);
      if (value !== null && value !== void 0) {
        yield [key, value];
      }
    }
  }
  entries = async (prefix = "") => {
    const all = await this.client.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => this.get(key)));
    return keys.map((key, i) => [key, values[i]]);
  };
  clearAll = () => this.client.clear();
};

// src/clients/level.ts
var valueEncoding = "json";
var notFound = (error) => {
  if (error?.code === "LEVEL_NOT_FOUND") return null;
  throw error;
};
var Level = class extends Client {
  TYPE = "LEVEL";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static testKeys = ["attachResource", "detachResource", "prependOnceListener"];
  get = (key) => this.client.get(key, { valueEncoding }).catch(notFound);
  set = (key, value) => this.client.put(key, value, { valueEncoding });
  del = (key) => this.client.del(key);
  async *iterate(prefix = "") {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }
  entries = async (prefix = "") => {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return Promise.all(
      list.map(async (k) => [k, await this.get(k)])
    );
  };
  clear = async (prefix = "") => {
    if (!prefix) {
      return await this.client.clear();
    }
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return this.client.batch(
      list.map((key) => ({ type: "del", key }))
    );
  };
  close = () => this.client.close();
};

// src/clients/memory.ts
var Memory = class extends Client {
  TYPE = "MEMORY";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test = (client) => client instanceof Map;
  get = (key) => this.client.get(key) ?? null;
  set = (key, data) => this.client.set(key, data);
  del = (key) => this.client.delete(key);
  *iterate(prefix = "") {
    for (const entry of this.client.entries()) {
      if (entry[0].startsWith(prefix)) yield entry;
    }
  }
  clearAll = () => this.client.clear();
};

// src/clients/postgres.ts
var Postgres = class extends Client {
  TYPE = "POSTGRES";
  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  // expirations much easier, so it's really "somewhere in between"
  HAS_EXPIRATION = true;
  // The table name to use
  table = "kv";
  // Ensure schema exists before any operation
  promise = (async () => {
    if (!/^[a-zA-Z_]+$/.test(this.table)) {
      throw new Error(`Invalid table name ${this.table}`);
    }
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMPTZ
      )
    `);
    await this.client.query(
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`
    );
  })();
  static test = (client) => {
    return client && client.query && !client.filename;
  };
  get = async (id) => {
    const result = await this.client.query(
      `SELECT value
       FROM ${this.table}
       WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [id]
    );
    if (!result.rows.length) return null;
    return this.decode(result.rows[0].value);
  };
  set = async (id, data, expires) => {
    const value = this.encode(data);
    const expires_at = expires ? new Date(Date.now() + expires * 1e3) : null;
    await this.client.query(
      `INSERT INTO ${this.table} (id, value, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [id, value, expires_at]
    );
  };
  del = async (id) => {
    await this.client.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  };
  async *iterate(prefix = "") {
    const result = await this.client.query(
      `SELECT id, value FROM ${this.table}
        WHERE (expires_at IS NULL OR expires_at > NOW()) ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
    for (const row of result.rows) {
      yield [row.id, this.decode(row.value)];
    }
  }
  async keys(prefix = "") {
    const result = await this.client.query(
      `SELECT id FROM ${this.table}
       WHERE (expires_at IS NULL OR expires_at > NOW())
       ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
    return result.rows.map((r) => r.id);
  }
  prune = async () => {
    await this.client.query(
      `DELETE FROM ${this.table}
       WHERE expires_at IS NOT NULL AND expires_at <= NOW()`
    );
  };
  clear = async (prefix = "") => {
    await this.client.query(
      `DELETE FROM ${this.table} ${prefix ? `WHERE id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
  };
  close = async () => {
    if (this.client.end) {
      await this.client.end();
    }
  };
};

// src/clients/redis.ts
var Redis = class extends Client {
  TYPE = "REDIS";
  // Indicate if this client handles expirations (true = it does)
  HAS_EXPIRATION = true;
  // Check if this is the right class for the given client
  static test = (client) => client && client.pSubscribe && client.sSubscribe;
  get = async (key) => this.decode(await this.client.get(key));
  set = async (key, value, expires) => {
    const EX = expires ? Math.round(expires) : void 0;
    return this.client.set(key, this.encode(value), { EX });
  };
  del = (key) => this.client.del(key);
  has = async (key) => Boolean(await this.client.exists(key));
  // Go through each of the [key, value] in the set
  async *iterate(prefix = "") {
    const MATCH = prefix + "*";
    for await (const key of this.client.scanIterator({ MATCH })) {
      const keys = typeof key === "string" ? [key] : key;
      for (const key2 of keys) {
        const value = await this.get(key2);
        if (value !== null && value !== void 0) {
          yield [key2, value];
        }
      }
    }
  }
  // Optimizing the retrieval of them by not getting their values
  keys = async (prefix = "") => {
    const MATCH = prefix + "*";
    const keys = [];
    for await (const key of this.client.scanIterator({ MATCH })) {
      keys.push(...typeof key === "string" ? [key] : key);
    }
    return keys;
  };
  // Optimizing the retrieval of them all in bulk by loading the values
  // in parallel
  entries = async (prefix = "") => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };
  clearAll = () => this.client.flushAll();
  close = () => this.client.quit();
};

// src/clients/sqlite.ts
var SQLite = class extends Client {
  TYPE = "SQLITE";
  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  // expirations much easier, so it's really "somewhere in between"
  HAS_EXPIRATION = true;
  // The table name to use
  table = "kv";
  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    if (!/^[a-zA-Z_]+$/.test(this.table)) {
      throw new Error(`Invalid table name ${this.table}`);
    }
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);
    this.client.exec(
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`
    );
  })();
  static test = (client) => {
    return typeof client?.prepare === "function" && typeof client?.exec === "function";
  };
  get = (id) => {
    const value = this.client.prepare(
      `SELECT value, expires_at FROM kv WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`
    ).get(id, Date.now())?.value;
    if (!value) return null;
    return this.decode(value);
  };
  set = (id, data, expires) => {
    const value = this.encode(data);
    const expires_at = expires ? Date.now() + expires * 1e3 : null;
    this.client.prepare(
      `INSERT INTO kv (id, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
    ).run(id, value, expires_at);
  };
  del = (id) => {
    this.client.prepare(`DELETE FROM kv WHERE id = ?`).run(id);
  };
  has = (id) => {
    const row = this.client.prepare(`SELECT expires_at FROM kv WHERE id = ?`).get(id);
    if (!row) return false;
    if (row.expires_at && row.expires_at < Date.now()) {
      this.del(id);
      return false;
    }
    return true;
  };
  *iterate(prefix = "") {
    const sql = `SELECT id, value FROM kv WHERE (expires_at IS NULL OR expires_at > ?) ${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    for (const row of this.client.prepare(sql).all(...params)) {
      yield [row.id, this.decode(row.value)];
    }
  }
  keys = (prefix = "") => {
    const sql = `SELECT id FROM kv WHERE (expires_at IS NULL OR expires_at > ?)
${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    const rows = this.client.prepare(sql).all(...params);
    return rows.map((r) => r.id);
  };
  prune = () => {
    this.client.prepare(`DELETE FROM kv WHERE expires_at <= ?`).run(Date.now());
  };
  clear = (prefix = "") => {
    if (!prefix) {
      this.client.prepare(`DELETE FROM ${this.table}`).run();
      return;
    }
    this.client.prepare(`DELETE FROM ${this.table} WHERE id LIKE ?`).run(`${prefix}%`);
  };
  close = () => {
    this.client.close?.();
  };
};

// src/clients/storage.ts
var WebStorage = class extends Client {
  TYPE = "STORAGE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test(client) {
    if (typeof Storage === "undefined") return false;
    return client instanceof Storage;
  }
  // Item methods
  get = (key) => this.decode(this.client.getItem(key));
  set = (key, data) => this.client.setItem(key, this.encode(data));
  del = (key) => this.client.removeItem(key);
  *iterate(prefix = "") {
    for (let i = 0; i < this.client.length; i++) {
      const key = this.client.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (value !== null && value !== void 0) {
        yield [key, value];
      }
    }
  }
  clearAll = () => this.client.clear();
};

// src/clients/index.ts
var clients_default = {
  api: Api,
  cloudflare: Cloudflare,
  cookie: Cookie,
  etcd: Etcd,
  file: File,
  folder: Folder,
  forage: Forage,
  level: Level,
  memory: Memory,
  postgres: Postgres,
  redis: Redis,
  storage: WebStorage,
  sqlite: SQLite
};

// src/utils.ts
var times = /(-?(?:\d+\.?\d*|\d*\.?\d+)(?:e[-+]?\d+)?)\s*([\p{L}]*)/iu;
var parse = function(str) {
  if (str === null || str === void 0) return null;
  if (typeof str === "number") return str;
  const cleaned = str.toLowerCase().replace(/[,_]/g, "");
  let [_, value, units] = times.exec(cleaned) || [];
  if (!units) return null;
  const unitValue = parse[units] || parse[units.replace(/s$/, "")];
  if (!unitValue) return null;
  const result = unitValue * parseFloat(value);
  return Math.abs(Math.round(result * 1e3) / 1e3);
};
parse.millisecond = parse.ms = 1e-3;
parse.second = parse.sec = parse.s = parse[""] = 1;
parse.minute = parse.min = parse.m = parse.s * 60;
parse.hour = parse.hr = parse.h = parse.m * 60;
parse.day = parse.d = parse.h * 24;
parse.week = parse.wk = parse.w = parse.d * 7;
parse.year = parse.yr = parse.y = parse.d * 365.25;
parse.month = parse.b = parse.y / 12;
var urlAlphabet = "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";
function createId() {
  let size = 24;
  let id = "";
  let bytes = crypto.getRandomValues(new Uint8Array(size));
  while (size--) {
    id += urlAlphabet[bytes[size] & 61];
  }
  return id;
}
function unix(expires) {
  const now = (/* @__PURE__ */ new Date()).getTime();
  return expires === null ? null : now + expires * 1e3;
}

// src/index.ts
var Store = class _Store {
  PREFIX = "";
  EXPIRES = null;
  promise;
  client;
  type = "UNKNOWN";
  constructor(clientPromise = /* @__PURE__ */ new Map(), options = {
    prefix: "",
    expires: null
  }) {
    this.PREFIX = options.prefix || "";
    this.EXPIRES = parse(options.expires || null);
    this.promise = Promise.resolve(clientPromise).then(async (client) => {
      this.client = this.#find(client);
      this.#validate(this.client);
      this.promise = null;
      await this.client.promise;
      this.type = this.client?.TYPE || this.type;
      return client;
    });
  }
  #find(store) {
    if (store instanceof _Store) return store.client;
    for (let client of Object.values(clients_default)) {
      if ("test" in client && client.test(store)) {
        return new client(store);
      }
      if ("testKeys" in client && typeof store === "object") {
        if (client.testKeys.every((key) => store[key])) {
          return new client(store);
        }
      }
    }
    if (typeof store === "function" && /^class\s/.test(Function.prototype.toString.call(store))) {
      return new store();
    }
    return store;
  }
  #validate(client) {
    if (!client) throw new Error("No client received");
    if (!client.set || !client.get || !client.iterate) {
      throw new Error("Client should have .get(), .set() and .iterate()");
    }
    if (client.HAS_EXPIRATION) return;
    for (let method of ["has", "keys", "values"]) {
      if (client[method]) {
        const msg = `You can only define client.${method}() when the client manages the expiration.`;
        throw new Error(msg);
      }
    }
  }
  // Check if the given data is fresh or not
  #isFresh(data, key) {
    if (!data || typeof data !== "object" || !("value" in data)) {
      return false;
    }
    return data.expires === null || data.expires > Date.now();
  }
  // Normalize returns the instance's `prefix` and `expires`
  #expiration(expires) {
    return parse(expires !== void 0 ? expires : this.EXPIRES);
  }
  async add(value, options) {
    await this.promise;
    const expires = this.#expiration(options?.expires);
    const prefix = options?.prefix || this.PREFIX;
    if (this.client.add) {
      if (this.client.HAS_EXPIRATION) {
        return this.client.add(prefix, value, expires);
      }
      return this.client.add(prefix, { expires: unix(expires), value });
    }
    return this.set(createId(), value, { prefix, expires });
  }
  async set(key, value, options) {
    await this.promise;
    const expires = this.#expiration(options?.expires);
    const prefix = options?.prefix || this.PREFIX;
    const id = prefix + key;
    if (value === null || typeof expires === "number" && expires <= 0) {
      return this.del(key);
    }
    if (this.client.HAS_EXPIRATION) {
      await this.client.set(id, value, expires);
      return key;
    }
    await this.client.set(id, { expires: unix(expires), value });
    return key;
  }
  async get(key) {
    await this.promise;
    const id = this.PREFIX + key;
    if (this.client.HAS_EXPIRATION) {
      const data = await this.client.get(id) ?? null;
      if (data === null) return null;
      return data;
    } else {
      const data = await this.client.get(id) ?? null;
      if (data === null) return null;
      if (!this.#isFresh(data, key)) return null;
      return data.value;
    }
  }
  /**
   * Check whether a key exists or not:
   *
   * ```js
   * if (await store.has("key1")) { ... }
   * ```
   *
   * If you are going to use the value, it's better to just read it:
   *
   * ```js
   * const val = await store.get("key1");
   * if (val) { ... }
   * ```
   *
   * **[→ Full .has() Docs](https://polystore.dev/documentation#has)**
   */
  async has(key) {
    await this.promise;
    const id = this.PREFIX + key;
    if (this.client.has) {
      return this.client.has(id);
    }
    return await this.get(key) !== null;
  }
  /**
   * Remove a single key and its value from the store:
   *
   * ```js
   * const key = await store.del("key1");
   * ```
   *
   * **[→ Full .del() Docs](https://polystore.dev/documentation#del)**
   */
  async del(key) {
    await this.promise;
    const id = this.PREFIX + key;
    if (this.client.del) {
      await this.client.del(id);
      return key;
    }
    if (this.client.HAS_EXPIRATION) {
      await this.client.set(id, null, 0);
    } else {
      await this.client.set(id, null);
    }
    return key;
  }
  /**
   * @alias of .del(key: string)
   * Remove a single key and its value from the store:
   *
   * ```js
   * const key = await store.delete("key1");
   * ```
   *
   * **[→ Full .del() Docs](https://polystore.dev/documentation#del)**
   */
  async delete(key) {
    return this.del(key);
  }
  async *[Symbol.asyncIterator]() {
    await this.promise;
    if (this.client.HAS_EXPIRATION) {
      for await (const [name, data] of this.client.iterate(this.PREFIX)) {
        const key = name.slice(this.PREFIX.length);
        yield [key, data];
      }
      return;
    }
    for await (const [name, data] of this.client.iterate(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.#isFresh(data, key)) {
        yield [key, data.value];
      }
    }
  }
  async entries() {
    await this.promise;
    const trim = (key) => key.slice(this.PREFIX.length);
    if (this.client.entries) {
      if (this.client.HAS_EXPIRATION) {
        const entries = await this.client.entries(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]);
      } else {
        const entries = await this.client.entries(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]).filter(([key, data]) => this.#isFresh(data, key)).map(([key, data]) => [key, data.value]);
      }
    }
    if (this.client.HAS_EXPIRATION) {
      const list = [];
      for await (const [k, v] of this.client.iterate(this.PREFIX)) {
        list.push([trim(k), v]);
      }
      return list;
    } else {
      const list = [];
      for await (const [k, data] of this.client.iterate(this.PREFIX)) {
        if (this.#isFresh(data, trim(k))) {
          list.push([trim(k), data.value]);
        }
      }
      return list;
    }
  }
  /**
   * Return an array of the keys in the store:
   *
   * ```js
   * const keys = await store.keys();
   * // ["key1", "key2", ...]
   *
   * // To limit it to a given prefix, use `.prefix()`:
   * const sessions = await store.prefix("session:").keys();
   * ```
   *
   * **[→ Full .keys() Docs](https://polystore.dev/documentation#keys)**
   */
  async keys() {
    await this.promise;
    if (this.client.keys) {
      const list = await this.client.keys(this.PREFIX);
      if (!this.PREFIX) return list;
      return list.map((k) => k.slice(this.PREFIX.length));
    }
    const entries = await this.entries();
    return entries.map((e) => e[0]);
  }
  async values() {
    await this.promise;
    if (this.client.values) {
      if (this.client.HAS_EXPIRATION) return this.client.values(this.PREFIX);
      const list = await this.client.values(this.PREFIX);
      return list.filter((data) => this.#isFresh(data)).map((data) => data.value);
    }
    const entries = await this.entries();
    return entries.map((e) => e[1]);
  }
  async all() {
    const entries = await this.entries();
    return Object.fromEntries(entries);
  }
  /**
   * Create a substore where all the keys are stored with
   * the given prefix:
   *
   * ```js
   * const session = store.prefix("session:");
   * await session.set("key1", "value1");
   * console.log(await session.entries());  // session.
   * // [["key1", "value1"]]
   * console.log(await store.entries());  // store.
   * // [["session:key1", "value1"]]
   * ```
   *
   * **[→ Full .prefix() Docs](https://polystore.dev/documentation#prefix)**
   */
  prefix(prefix = "") {
    const store = new _Store(
      Promise.resolve(this.promise).then(() => this.client)
    );
    store.PREFIX = this.PREFIX + prefix;
    store.EXPIRES = this.EXPIRES;
    return store;
  }
  /**
   * Create a substore where all the keys are stored with
   * the given prefix:
   *
   * ```js
   * const session = store.prefix("session:");
   * await session.set("key1", "value1");
   * console.log(await session.entries());  // session.
   * // [["key1", "value1"]]
   * console.log(await store.entries());  // store.
   * // [["session:key1", "value1"]]
   * ```
   *
   * **[→ Full .prefix() Docs](https://polystore.dev/documentation#prefix)**
   */
  expires(expires = null) {
    const store = new _Store(
      Promise.resolve(this.promise).then(() => this.client)
    );
    store.EXPIRES = parse(expires);
    store.PREFIX = this.PREFIX;
    return store;
  }
  /**
   * Delete all of the records of the store:
   *
   * ```js
   * await store.clear();
   * ```
   *
   * It's useful for cache invalidation, clearing the data, and testing.
   *
   * **[→ Full .clear() Docs](https://polystore.dev/documentation#clear)**
   */
  async clear() {
    await this.promise;
    if (!this.PREFIX && this.client.clearAll) {
      return this.client.clearAll();
    }
    if (this.client.clear) {
      return this.client.clear(this.PREFIX);
    }
    const keys = await this.keys();
    await Promise.all(keys.map((key) => this.del(key)));
  }
  /**
   * Remove all expired records from the store.
   *
   * ```js
   * await store.prune();
   * ```
   *
   * Only affects stores where expiration is managed by this wrapper.
   */
  async prune() {
    await this.promise;
    if (this.client.HAS_EXPIRATION) return;
    if (this.client.prune) {
      await this.client.prune();
    }
  }
  /**
   * Stop the connection to the store, if any:
   *
   * ```js
   * await session.set("key1", "value1");
   * await store.close();
   * await session.set("key2", "value2");  // error
   * ```
   *
   * **[→ Full .close() Docs](https://polystore.dev/documentation#close)**
   */
  async close() {
    await this.promise;
    if (this.client.close) {
      return this.client.close();
    }
  }
};
function createStore(client, options) {
  return new Store(client, options);
}
export {
  createStore as default
};
