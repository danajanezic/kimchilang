import pg from 'pg';

let pool = null;

export async function connect(connectionUrl) {
  pool = new pg.Pool({ connectionString: connectionUrl });
  // Test connection
  const client = await pool.connect();
  client.release();
  return true;
}

export async function query(sql, params) {
  if (!pool) throw new Error('Database not connected. Call connect() first.');
  const result = await pool.query(sql, params || []);
  return result.rows;
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
