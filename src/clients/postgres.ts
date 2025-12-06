import Client from "./Client";

// Use a pg Pool or Client with a table containing 'id', 'value', and 'expiresAt' columns
// Pass the pool directly: kv(pool)
export default class Postgres extends Client {
  // Indicate that this client handles expirations
  EXPIRES = true;

  // The table name to use
  table = "kv";

  // Check if this is the right class for the given client (pg Pool or Client)
  static test = (client: any): boolean => {
    // .filename is for sqlite
    return client && client.query && !client.filename;
  };

  // Override prefix to use different tables instead of string prefixes
  prefix(prefix: string): Postgres {
    if (!prefix) return this;
    const table = prefix.endsWith(":") ? prefix.slice(0, -1) : prefix;

    if (
      typeof prefix !== "string" ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(prefix)
    ) {
      throw new Error("Invalid table name");
    }

    // Create a new instance with the same pool but different table
    const instance = new Postgres(this.client);
    instance.table = table;
    return instance;
  }

  get = async (id: string): Promise<any> => {
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
    return this.decode(record.value);
  };

  set = async (
    id: string,
    data: any,
    { expires }: { expires?: number | null } = {},
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
