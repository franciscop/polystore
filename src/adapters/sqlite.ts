// SQLite client - uses a sqlite instance with a table
// called `kv` containing 'id', 'value', and 'expires_at' columns
import Adapter from "./Adapter";

export default class SQLite extends Adapter {
  TYPE = "SQLITE";

  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  // expirations much easier, so it's really "somewhere in between"
  HAS_EXPIRATION = true as const;

  // The table name to use
  table = "kv";

  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  promise = (async () => {
    // Light validation, including the table name
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
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`,
    );
  })();

  static test = (raw: any): boolean => {
    // Both Bun:sqlite and better-sqlite3 have both `.prepare()` and `.exec()`
    return (
      typeof raw?.prepare === "function" &&
      typeof raw?.exec === "function"
    );
  };

  get = <T>(id: string): T | null => {
    const value = this.lib
      .prepare(
        `SELECT value, expires_at FROM kv WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(id, Date.now())?.value;
    if (!value) return null;
    return this.decode<T>(value);
  };

  set = (id: string, data: any, expires: number | null): void => {
    const value = this.encode(data);
    const expires_at = expires ? Date.now() + expires * 1000 : null;

    this.lib
      .prepare(
        `INSERT INTO kv (id, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      )
      .run(id, value, expires_at);
  };

  del = (id: string): void => {
    this.lib.prepare(`DELETE FROM kv WHERE id = ?`).run(id);
  };

  has = (id: string): boolean => {
    const row = this.lib
      .prepare(`SELECT expires_at FROM kv WHERE id = ?`)
      .get(id);
    if (!row) return false;

    if (row.expires_at && row.expires_at < Date.now()) {
      this.del(id);
      return false;
    }

    return true;
  };

  *iterate(prefix = ""): Generator<[string, any]> {
    const sql = `SELECT id, value FROM kv WHERE (expires_at IS NULL OR expires_at > ?) ${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    for (const row of this.lib.prepare(sql).all(...params)) {
      yield [row.id, this.decode(row.value)];
    }
  }

  keys = (prefix = ""): string[] => {
    const sql = `SELECT id FROM kv WHERE (expires_at IS NULL OR expires_at > ?)
${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    const rows = this.lib.prepare(sql).all(...params);
    return rows.map((r: { id: string }) => r.id);
  };

  prune = (): void => {
    this.lib.prepare(`DELETE FROM kv WHERE expires_at <= ?`).run(Date.now());
  };

  clear = (prefix = ""): void => {
    if (!prefix) {
      this.lib.prepare(`DELETE FROM ${this.table}`).run();
      return;
    }

    this.lib
      .prepare(`DELETE FROM ${this.table} WHERE id LIKE ?`)
      .run(`${prefix}%`);
  };

  close = (): void => {
    this.lib.close?.();
  };
}
