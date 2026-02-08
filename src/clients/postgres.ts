// Postgres client - uses a sqlite instance with a table
// called `kv` containing 'id', 'value', and 'expires_at' columns
import { ClientOptions } from "../types";
import Client from "./Client";

export default class Postgres extends Client {
  TYPE = "POSTGRES";

  // This one is doing manual time management internally even though
  // sqlite does not natively support expirations. This is because it does
  // support creating a `expires_at:Date` column that makes managing
  // expirations much easier, so it's really "somewhere in between"
  EXPIRES = true as const;

  // The table name to use
  table = "kv";

  static test = (client: any): boolean => {
    // .filename is for sqlite
    return client && client.query && !client.filename;
  };

  get = async <T>(id: string): Promise<T | null> => {
    const result = await this.client.query(
      `SELECT value, "expiresAt" FROM ${this.table} WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;

    const record = result.rows[0];
    // Check if expired and delete if so
    if (record.expiresAt && record.expiresAt < new Date()) {
      await this.del(id);
      return null;
    }
    return this.decode<T>(record.value);
  };

  set = async (
    id: string,
    data: any,
    expires: ClientOptions,
  ): Promise<void> => {
    const value = this.encode(data);
    const expiresAt = expires ? new Date(Date.now() + expires * 1000) : null;
    await this.client.query(
      `INSERT INTO ${this.table} (id, value, "expiresAt")
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET value = $2, "expiresAt" = $3`,
      [id, value, expiresAt],
    );
  };

  del = async (id: string): Promise<void> => {
    await this.client.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  };

  has = async (id: string): Promise<boolean> => {
    const result = await this.client.query(
      `SELECT "expiresAt" FROM ${this.table} WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return false;

    const record = result.rows[0];
    // Check if expired and delete if so
    if (record.expiresAt && record.expiresAt < new Date()) {
      await this.del(id);
      return false;
    }
    return true;
  };

  async *iterate(): AsyncGenerator<[string, any], void, unknown> {
    const result = await this.client.query(
      `SELECT id, value FROM ${this.table}
       WHERE "expiresAt" IS NULL OR "expiresAt" > NOW()`,
    );
    this.#clearExpired(); // Fire and forget
    for (const record of result.rows) {
      yield [record.id, this.decode(record.value)];
    }
  }

  keys = async (): Promise<string[]> => {
    const result = await this.client.query(
      `SELECT id FROM ${this.table}
       WHERE "expiresAt" IS NULL OR "expiresAt" > NOW()`,
    );
    this.#clearExpired(); // Fire and forget
    return result.rows.map((r: any) => r.id);
  };

  entries = async (): Promise<[string, any][]> => {
    const result = await this.client.query(
      `SELECT id, value FROM ${this.table}
       WHERE "expiresAt" IS NULL OR "expiresAt" > NOW()`,
    );
    this.#clearExpired(); // Fire and forget
    return result.rows.map((r: any) => [r.id, this.decode(r.value)]);
  };

  #clearExpired = async (): Promise<void> => {
    await this.client.query(
      `DELETE FROM ${this.table} WHERE "expiresAt" < NOW()`,
    );
  };

  clearAll = async (): Promise<void> => {
    await this.client.query(`DELETE FROM ${this.table}`);
  };

  close = async (): Promise<void> => {
    if (this.client.end) {
      await this.client.end();
    }
  };
}
