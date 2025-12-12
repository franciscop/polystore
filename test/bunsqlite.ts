import { Database } from "bun:sqlite";

const bunsqlite = new Database(":memory:");

bunsqlite.run(`
  CREATE TABLE IF NOT EXISTS kv (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER
  )
`);
bunsqlite.run(
  `CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON kv (expires_at)`,
);

export default bunsqlite;
