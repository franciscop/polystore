// src/adapters/Adapter.ts
var Adapter = class {
  TYPE;
  HAS_EXPIRATION = false;
  lib;
  encode = (val) => JSON.stringify(val, null, 2);
  decode = (val) => val ? JSON.parse(val) : null;
  constructor(lib) {
    this.lib = lib;
  }
};

// src/adapters/api.ts
var Api = class extends Adapter {
  TYPE = "API";
  // Indicate that the file handler DOES handle expirations
  HAS_EXPIRATION = true;
  static test = (raw) => typeof raw === "string" && /^https?:\/\//.test(raw);
  #api = async (key, opts = "", method = "GET", body) => {
    const url = `${this.lib.replace(/\/$/, "")}/${encodeURIComponent(key)}${opts}`;
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

// src/adapters/cloudflare.ts
var Cloudflare = class extends Adapter {
  TYPE = "CLOUDFLARE";
  // It handles expirations natively
  HAS_EXPIRATION = true;
  static testKeys = ["getWithMetadata", "get", "list", "delete"];
  get = async (key) => {
    const value = await this.lib.get(key);
    return this.decode(value);
  };
  set = async (key, data, expires) => {
    const expirationTtl = expires ? Math.round(expires) : void 0;
    if (expirationTtl && expirationTtl < 60) {
      throw new Error("Cloudflare's min expiration is '60s'");
    }
    await this.lib.put(key, this.encode(data), { expirationTtl });
  };
  del = (key) => this.lib.delete(key);
  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate(prefix = "") {
    let cursor;
    do {
      const raw = await this.lib.list({ prefix, cursor });
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
      const raw = await this.lib.list({ prefix, cursor });
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

// src/adapters/cookie.ts
var Cookie = class extends Adapter {
  TYPE = "COOKIE";
  // It handles expirations natively
  HAS_EXPIRATION = true;
  // Check if this is the right class for the given client
  static test = (raw) => {
    return raw === "cookie" || raw === "cookies";
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

// src/adapters/etcd.ts
var Etcd = class extends Adapter {
  TYPE = "ETCD3";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static testKeys = ["leaseClient", "watchClient", "watchManager"];
  get = async (key) => {
    const data = await this.lib.get(key).json();
    return data;
  };
  set = async (key, value) => {
    await this.lib.put(key).value(this.encode(value));
  };
  del = (key) => this.lib.delete().key(key).exec();
  async *iterate(prefix = "") {
    const keys = await this.lib.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get(key)];
    }
  }
  clear = async (prefix = "") => {
    if (!prefix) return this.lib.delete().all();
    return this.lib.delete().prefix(prefix);
  };
};

// src/adapters/file.ts
var File = class extends Adapter {
  TYPE = "FILE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  fsp;
  file = "";
  #lock = Promise.resolve();
  // Check if this is the right class for the given client
  static test = (raw) => {
    if (raw instanceof URL) raw = raw.href;
    return typeof raw === "string" && raw.startsWith("file://") && raw.endsWith(".json");
  };
  // We want to make sure the file already exists, so attempt to
  // create the folders and the file (but not OVERWRITE it, that's why the x flag)
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    this.fsp = await import("fs/promises");
    this.file = (this.lib?.href || this.lib).replace(/^file:\/\//, "");
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

// src/adapters/folder.ts
var noFileOk = (error) => {
  if (error.code === "ENOENT") return null;
  throw error;
};
var Folder = class extends Adapter {
  TYPE = "FOLDER";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  fsp;
  folder;
  // Check if this is the right class for the given client
  static test = (raw) => {
    if (raw instanceof URL) raw = raw.href;
    return typeof raw === "string" && raw.startsWith("file://") && raw.endsWith("/");
  };
  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    this.fsp = await import("fs/promises");
    this.folder = (this.lib?.href || this.lib).replace(/^file:\/\//, "");
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

// src/adapters/forage.ts
var Forage = class extends Adapter {
  TYPE = "FORAGE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test = (raw) => raw?.defineDriver && raw?.dropInstance && raw?.INDEXEDDB;
  get = (key) => this.lib.getItem(key);
  set = (key, value) => this.lib.setItem(key, value);
  del = (key) => this.lib.removeItem(key);
  async *iterate(prefix = "") {
    const keys = await this.lib.keys();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      const value = await this.get(key);
      if (value !== null && value !== void 0) {
        yield [key, value];
      }
    }
  }
  entries = async (prefix = "") => {
    const all = await this.lib.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => this.get(key)));
    return keys.map((key, i) => [key, values[i]]);
  };
  clearAll = () => this.lib.clear();
};

// src/adapters/level.ts
var valueEncoding = "json";
var notFound = (error) => {
  if (error?.code === "LEVEL_NOT_FOUND") return null;
  throw error;
};
var Level = class extends Adapter {
  TYPE = "LEVEL";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static testKeys = ["attachResource", "detachResource", "prependOnceListener"];
  get = (key) => this.lib.get(key, { valueEncoding }).catch(notFound);
  set = (key, value) => this.lib.put(key, value, { valueEncoding });
  del = (key) => this.lib.del(key);
  async *iterate(prefix = "") {
    const keys = await this.lib.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }
  entries = async (prefix = "") => {
    const keys = await this.lib.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return Promise.all(
      list.map(async (k) => [k, await this.get(k)])
    );
  };
  clear = async (prefix = "") => {
    if (!prefix) {
      return await this.lib.clear();
    }
    const keys = await this.lib.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return this.lib.batch(
      list.map((key) => ({ type: "del", key }))
    );
  };
  close = () => this.lib.close();
};

// src/adapters/memory.ts
var Memory = class extends Adapter {
  TYPE = "MEMORY";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test = (raw) => raw instanceof Map;
  get = (key) => this.lib.get(key) ?? null;
  set = (key, data) => this.lib.set(key, data);
  del = (key) => this.lib.delete(key);
  *iterate(prefix = "") {
    for (const entry of this.lib.entries()) {
      if (entry[0].startsWith(prefix)) yield entry;
    }
  }
  clearAll = () => this.lib.clear();
};

// src/adapters/postgres.ts
var Postgres = class extends Adapter {
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
    await this.lib.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMPTZ
      )
    `);
    await this.lib.query(
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`
    );
  })();
  static test = (raw) => {
    return raw && raw.query && !raw.filename;
  };
  get = async (id) => {
    const result = await this.lib.query(
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
    await this.lib.query(
      `INSERT INTO ${this.table} (id, value, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [id, value, expires_at]
    );
  };
  del = async (id) => {
    await this.lib.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  };
  async *iterate(prefix = "") {
    const result = await this.lib.query(
      `SELECT id, value FROM ${this.table}
        WHERE (expires_at IS NULL OR expires_at > NOW()) ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
    for (const row of result.rows) {
      yield [row.id, this.decode(row.value)];
    }
  }
  async keys(prefix = "") {
    const result = await this.lib.query(
      `SELECT id FROM ${this.table}
       WHERE (expires_at IS NULL OR expires_at > NOW())
       ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
    return result.rows.map((r) => r.id);
  }
  prune = async () => {
    await this.lib.query(
      `DELETE FROM ${this.table}
       WHERE expires_at IS NOT NULL AND expires_at <= NOW()`
    );
  };
  clear = async (prefix = "") => {
    await this.lib.query(
      `DELETE FROM ${this.table} ${prefix ? `WHERE id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : []
    );
  };
  close = async () => {
    if (this.lib.end) {
      await this.lib.end();
    }
  };
};

// src/adapters/redis.ts
var Redis = class extends Adapter {
  TYPE = "REDIS";
  // Indicate if this client handles expirations (true = it does)
  HAS_EXPIRATION = true;
  // Check if this is the right class for the given client
  static test = (raw) => raw && raw.pSubscribe && raw.sSubscribe;
  get = async (key) => this.decode(await this.lib.get(key));
  set = async (key, value, expires) => {
    const EX = expires ? Math.round(expires) : void 0;
    return this.lib.set(key, this.encode(value), { EX });
  };
  del = (key) => this.lib.del(key);
  has = async (key) => Boolean(await this.lib.exists(key));
  // Go through each of the [key, value] in the set
  async *iterate(prefix = "") {
    const MATCH = prefix + "*";
    for await (const key of this.lib.scanIterator({ MATCH })) {
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
    for await (const key of this.lib.scanIterator({ MATCH })) {
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
  clearAll = () => this.lib.flushAll();
  close = () => this.lib.quit();
};

// src/adapters/sqlite.ts
var SQLite = class extends Adapter {
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
    this.lib.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);
    this.lib.exec(
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`
    );
  })();
  static test = (raw) => {
    return typeof raw?.prepare === "function" && typeof raw?.exec === "function";
  };
  get = (id) => {
    const value = this.lib.prepare(
      `SELECT value, expires_at FROM kv WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`
    ).get(id, Date.now())?.value;
    if (!value) return null;
    return this.decode(value);
  };
  set = (id, data, expires) => {
    const value = this.encode(data);
    const expires_at = expires ? Date.now() + expires * 1e3 : null;
    this.lib.prepare(
      `INSERT INTO kv (id, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
    ).run(id, value, expires_at);
  };
  del = (id) => {
    this.lib.prepare(`DELETE FROM kv WHERE id = ?`).run(id);
  };
  has = (id) => {
    const row = this.lib.prepare(`SELECT expires_at FROM kv WHERE id = ?`).get(id);
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
    for (const row of this.lib.prepare(sql).all(...params)) {
      yield [row.id, this.decode(row.value)];
    }
  }
  keys = (prefix = "") => {
    const sql = `SELECT id FROM kv WHERE (expires_at IS NULL OR expires_at > ?)
${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    const rows = this.lib.prepare(sql).all(...params);
    return rows.map((r) => r.id);
  };
  prune = () => {
    this.lib.prepare(`DELETE FROM kv WHERE expires_at <= ?`).run(Date.now());
  };
  clear = (prefix = "") => {
    if (!prefix) {
      this.lib.prepare(`DELETE FROM ${this.table}`).run();
      return;
    }
    this.lib.prepare(`DELETE FROM ${this.table} WHERE id LIKE ?`).run(`${prefix}%`);
  };
  close = () => {
    this.lib.close?.();
  };
};

// src/adapters/storage.ts
var WebStorage = class extends Adapter {
  TYPE = "STORAGE";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false;
  // Check if this is the right class for the given client
  static test(raw) {
    if (typeof Storage === "undefined") return false;
    return raw instanceof Storage;
  }
  // Item methods
  get = (key) => this.decode(this.lib.getItem(key));
  set = (key, data) => this.lib.setItem(key, this.encode(data));
  del = (key) => this.lib.removeItem(key);
  *iterate(prefix = "") {
    for (let i = 0; i < this.lib.length; i++) {
      const key = this.lib.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (value !== null && value !== void 0) {
        yield [key, value];
      }
    }
  }
  clearAll = () => this.lib.clear();
};

// src/adapters/index.ts
var adapters_default = {
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
  adapter;
  type = "UNKNOWN";
  constructor(adapterInput = /* @__PURE__ */ new Map(), options = {
    prefix: "",
    expires: null
  }) {
    this.PREFIX = options.prefix || "";
    this.EXPIRES = parse(options.expires || null);
    this.promise = Promise.resolve(adapterInput).then(async (raw) => {
      this.adapter = this.#find(raw);
      this.#validate(this.adapter);
      this.promise = null;
      await this.adapter.promise;
      this.type = this.adapter?.TYPE || this.type;
      return raw;
    });
  }
  #find(store) {
    if (store instanceof _Store) return store.adapter;
    for (let A of Object.values(adapters_default)) {
      if ("test" in A && A.test(store)) {
        return new A(store);
      }
      if ("testKeys" in A && typeof store === "object") {
        if (A.testKeys.every((key) => store[key])) {
          return new A(store);
        }
      }
    }
    if (typeof store === "function" && /^class\s/.test(Function.prototype.toString.call(store))) {
      return new store();
    }
    return store;
  }
  #validate(adapter) {
    if (!adapter) throw new Error("No adapter received");
    if (!adapter.set || !adapter.get || !adapter.iterate) {
      throw new Error("Adapter should have .get(), .set() and .iterate()");
    }
    if (adapter.HAS_EXPIRATION) return;
    for (let method of ["has", "keys", "values"]) {
      if (adapter[method]) {
        const msg = `You can only define adapter.${method}() when the adapter manages the expiration.`;
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
    if (this.adapter.add) {
      if (this.adapter.HAS_EXPIRATION) {
        return this.adapter.add(prefix, value, expires);
      }
      return this.adapter.add(prefix, { expires: unix(expires), value });
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
    if (this.adapter.HAS_EXPIRATION) {
      await this.adapter.set(id, value, expires);
      return key;
    }
    await this.adapter.set(id, { expires: unix(expires), value });
    return key;
  }
  async get(key) {
    await this.promise;
    const id = this.PREFIX + key;
    if (this.adapter.HAS_EXPIRATION) {
      const data = await this.adapter.get(id) ?? null;
      if (data === null) return null;
      return data;
    } else {
      const data = await this.adapter.get(id) ?? null;
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
    if (this.adapter.has) {
      return this.adapter.has(id);
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
    if (this.adapter.del) {
      await this.adapter.del(id);
      return key;
    }
    if (this.adapter.HAS_EXPIRATION) {
      await this.adapter.set(id, null, 0);
    } else {
      await this.adapter.set(id, null);
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
    if (this.adapter.HAS_EXPIRATION) {
      for await (const [name, data] of this.adapter.iterate(this.PREFIX)) {
        const key = name.slice(this.PREFIX.length);
        yield [key, data];
      }
      return;
    }
    for await (const [name, data] of this.adapter.iterate(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.#isFresh(data, key)) {
        yield [key, data.value];
      }
    }
  }
  async entries() {
    await this.promise;
    const trim = (key) => key.slice(this.PREFIX.length);
    if (this.adapter.entries) {
      if (this.adapter.HAS_EXPIRATION) {
        const entries = await this.adapter.entries(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]);
      } else {
        const entries = await this.adapter.entries(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]).filter(([key, data]) => this.#isFresh(data, key)).map(([key, data]) => [key, data.value]);
      }
    }
    if (this.adapter.HAS_EXPIRATION) {
      const list = [];
      for await (const [k, v] of this.adapter.iterate(this.PREFIX)) {
        list.push([trim(k), v]);
      }
      return list;
    } else {
      const list = [];
      for await (const [k, data] of this.adapter.iterate(this.PREFIX)) {
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
    if (this.adapter.keys) {
      const list = await this.adapter.keys(this.PREFIX);
      if (!this.PREFIX) return list;
      return list.map((k) => k.slice(this.PREFIX.length));
    }
    const entries = await this.entries();
    return entries.map((e) => e[0]);
  }
  async values() {
    await this.promise;
    if (this.adapter.values) {
      if (this.adapter.HAS_EXPIRATION) return this.adapter.values(this.PREFIX);
      const list = await this.adapter.values(this.PREFIX);
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
      Promise.resolve(this.promise).then(() => this.adapter)
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
      Promise.resolve(this.promise).then(() => this.adapter)
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
    if (!this.PREFIX && this.adapter.clearAll) {
      return this.adapter.clearAll();
    }
    if (this.adapter.clear) {
      return this.adapter.clear(this.PREFIX);
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
    if (this.adapter.HAS_EXPIRATION) return;
    if (this.adapter.prune) {
      await this.adapter.prune();
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
    if (this.adapter.close) {
      return this.adapter.close();
    }
  }
};
function createStore(adapter, options) {
  return new Store(adapter, options);
}
export {
  createStore as default
};
