import Client from "./Client";

export default class SQLite extends Client {
  EXPIRES = true;
  table = "kv";

  static test = (client: any): boolean =>
    typeof client?.prepare === "function" &&
    typeof client?.prepare("SELECT 1").get === "function";

  prefix(prefix: string): SQLite {
    if (!prefix) return this;

    const table = prefix.endsWith(":") ? prefix.slice(0, -1) : prefix;

    if (typeof table !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error("Invalid table name");
    }

    const instance = new SQLite(this.client);
    instance.table = table;
    return instance;
  }

  get = (id: string): any => {
    const stmt = this.client.prepare(
      `SELECT value, expiresAt FROM ${this.table} WHERE id = ?`,
    );
    const row = stmt.get(id);
    if (!row) return null;

    if (row.expiresAt && row.expiresAt < Date.now()) {
      this.del(id);
      return null;
    }

    return this.decode(row.value);
  };

  set = (
    id: string,
    data: any,
    { expires }: { expires?: number | null } = {},
  ): void => {
    const value = this.encode(data);
    const expiresAt = expires ? Date.now() + expires * 1000 : null;

    const stmt = this.client.prepare(
      `INSERT INTO ${this.table} (id, value, expiresAt)
       VALUES (?, ?, ?)
       ON CONFLICT(id)
       DO UPDATE SET value = excluded.value, expiresAt = excluded.expiresAt`,
    );

    stmt.run(id, value, expiresAt);
  };

  del = (id: string): void => {
    this.client.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  };

  has = (id: string): boolean => {
    const stmt = this.client.prepare(
      `SELECT expiresAt FROM ${this.table} WHERE id = ?`,
    );
    const row = stmt.get(id);
    if (!row) return false;

    if (row.expiresAt && row.expiresAt < Date.now()) {
      this.del(id);
      return false;
    }

    return true;
  };

  *iterate(): Generator<[string, any]> {
    this.#clearExpired();

    const stmt = this.client.prepare(
      `SELECT id, value FROM ${this.table}
       WHERE expiresAt IS NULL OR expiresAt > ?`,
    );

    const rows = stmt.all(Date.now());

    for (const row of rows) {
      yield [row.id, this.decode(row.value)];
    }
  }

  keys = (): string[] => {
    this.#clearExpired();

    const stmt = this.client.prepare(
      `SELECT id FROM ${this.table}
       WHERE expiresAt IS NULL OR expiresAt > ?`,
    );

    const rows = stmt.all(Date.now());
    return rows.map((r: any) => r.id);
  };

  entries = (): [string, any][] => {
    this.#clearExpired();

    const stmt = this.client.prepare(
      `SELECT id, value FROM ${this.table}
       WHERE expiresAt IS NULL OR expiresAt > ?`,
    );

    const rows = stmt.all(Date.now());
    return rows.map((r: any) => [r.id, this.decode(r.value)]);
  };

  #clearExpired = (): void => {
    this.client
      .prepare(`DELETE FROM ${this.table} WHERE expiresAt < ?`)
      .run(Date.now());
  };

  clearAll = (): void => {
    this.client.prepare(`DELETE FROM ${this.table}`).run();
  };

  close = (): void => {
    if (this.client.close) this.client.close();
  };
}
