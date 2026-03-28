// Postgres client - uses a sqlite instance with a table
// called `kv` containing 'id', 'value', and 'expires_at' columns
import Client from "./Client";

export default class Postgres extends Client {
  TYPE = "POSTGRES";

  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  // expirations much easier, so it's really "somewhere in between"
  HAS_EXPIRATION = true as const;

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
      `CREATE INDEX IF NOT EXISTS idx_${this.table}_expires_at ON ${this.table} (expires_at)`,
    );
  })();

  static test = (client: any): boolean => {
    // .filename is for sqlite
    return client && client.query && !client.filename;
  };

  get = async <T>(id: string): Promise<T | null> => {
    const result = await this.client.query(
      `SELECT value
       FROM ${this.table}
       WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [id],
    );
    if (!result.rows.length) return null;
    return this.decode<T>(result.rows[0].value);
  };

  set = async (
    id: string,
    data: any,
    expires: number | null,
  ): Promise<void> => {
    const value = this.encode(data);
    const expires_at = expires ? new Date(Date.now() + expires * 1000) : null;

    await this.client.query(
      `INSERT INTO ${this.table} (id, value, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [id, value, expires_at],
    );
  };

  del = async (id: string): Promise<void> => {
    await this.client.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  };

  async *iterate(prefix = ""): AsyncGenerator<[string, any]> {
    const result = await this.client.query(
      `SELECT id, value FROM ${this.table}
        WHERE (expires_at IS NULL OR expires_at > NOW()) ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : [],
    );

    for (const row of result.rows) {
      yield [row.id, this.decode(row.value)];
    }
  }

  async keys(prefix = ""): Promise<string[]> {
    const result = await this.client.query(
      `SELECT id FROM ${this.table}
       WHERE (expires_at IS NULL OR expires_at > NOW())
       ${prefix ? `AND id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : [],
    );

    return result.rows.map((r: any) => r.id);
  }

  prune = async (): Promise<void> => {
    await this.client.query(
      `DELETE FROM ${this.table}
       WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
    );
  };

  clear = async (prefix = ""): Promise<void> => {
    await this.client.query(
      `DELETE FROM ${this.table} ${prefix ? `WHERE id LIKE $1` : ""}`,
      prefix ? [`${prefix}%`] : [],
    );
  };

  close = async (): Promise<void> => {
    if (this.client.end) {
      await this.client.end();
    }
  };
}
