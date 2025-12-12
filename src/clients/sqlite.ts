import Client from "./Client";

type Args = (string | number | boolean | Date)[];

export default class SQLite extends Client {
  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  //  expirations much easier, so it's really "somewhere in between"
  EXPIRES = true as const;

  static test = (client: any): boolean => typeof client?.prepare === "function";

  constructor(c: any) {
    // Allow for a bit of flexibility
    if (typeof c?.prepare("SELECT 1").get === "function") {
      super({
        run: (sql: string, ...args: Args) => c.prepare(sql).run(...args),
        get: (sql: string, ...args: Args) => c.prepare(sql).get(...args),
        all: (sql: string, ...args: Args) => c.prepare(sql).all(...args),
      });
      return;
    }
    super(c);
  }

  get = <T>(id: string): T | null => {
    const row = this.client.get(
      `SELECT value, expires_at FROM kv WHERE id = ?`,
      id,
    );
    if (!row) return null;
    if (row.expires_at && row.expires_at < Date.now()) {
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
    const expires_at = expires ? Date.now() + expires * 1000 : null;

    this.client.run(
      `INSERT INTO kv (id, value, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      id,
      value,
      expires_at,
    );
  };

  del = (id: string): void => {
    this.client.run(`DELETE FROM kv WHERE id = ?`, id);
  };

  has = (id: string): boolean => {
    const row = this.client.get(`SELECT expires_at FROM kv WHERE id = ?`, id);
    if (!row) return false;

    if (row.expires_at && row.expires_at < Date.now()) {
      this.del(id);
      return false;
    }

    return true;
  };

  *iterate(prefix = ""): Generator<[string, any]> {
    this.#clearExpired();
    const sql = `
      SELECT id, value FROM kv
      WHERE (expires_at IS NULL OR expires_at > ?)
        ${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    for (const row of this.client.all(sql, ...params)) {
      yield [row.id, this.decode(row.value)];
    }
  }

  keys = (prefix = ""): string[] => {
    this.#clearExpired();
    const sql = `
      SELECT id FROM kv
      WHERE (expires_at IS NULL OR expires_at > ?)
        ${prefix ? "AND id LIKE ?" : ""}
    `;
    const params = prefix ? [Date.now(), `${prefix}%`] : [Date.now()];
    const rows = this.client.all(sql, ...params);
    return rows.map((r: { id: string }) => r.id);
  };

  #clearExpired = (): void => {
    this.client.run(`DELETE FROM kv WHERE expires_at < ?`, Date.now());
  };

  clearAll = (): void => {
    this.client.run(`DELETE FROM kv`);
  };

  close = (): void => {
    this.client.close?.();
  };
}
