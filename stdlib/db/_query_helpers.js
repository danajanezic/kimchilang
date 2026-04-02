// Query runtime — builds SQL from operations and calls db.query()

let _db = null;

export function setDb(db) {
  _db = db;
}

function getDb() {
  if (!_db) throw new Error('Query: database not connected. Pass {db: connection} to the query module.');
  return _db;
}

export async function find(table, id) {
  const result = await getDb().query(`SELECT * FROM ${esc(table)} WHERE id = $1`, [id]);
  return result.length > 0 ? result[0] : null;
}

export async function all(table) {
  return getDb().query(`SELECT * FROM ${esc(table)}`);
}

export async function first(table) {
  const result = await getDb().query(`SELECT * FROM ${esc(table)} ORDER BY id ASC LIMIT 1`);
  return result.length > 0 ? result[0] : null;
}

export async function last(table) {
  const result = await getDb().query(`SELECT * FROM ${esc(table)} ORDER BY id DESC LIMIT 1`);
  return result.length > 0 ? result[0] : null;
}

export async function count(table) {
  const result = await getDb().query(`SELECT COUNT(*) as count FROM ${esc(table)}`);
  return parseInt(result[0].count, 10);
}

export async function where(table, opts) {
  const conditions = opts.conditions || {};
  const keys = Object.keys(conditions);
  const values = Object.values(conditions);

  let sql = `SELECT * FROM ${esc(table)}`;

  if (keys.length > 0) {
    const clauses = keys.map((k, i) => `${esc(k)} = $${i + 1}`);
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }

  if (opts.sortBy) {
    const order = (opts.order || 'asc').toUpperCase();
    sql += ` ORDER BY ${esc(opts.sortBy)} ${order === 'DESC' ? 'DESC' : 'ASC'}`;
  }

  if (opts.limit) {
    sql += ` LIMIT ${parseInt(opts.limit, 10)}`;
  }

  if (opts.offset) {
    sql += ` OFFSET ${parseInt(opts.offset, 10)}`;
  }

  return getDb().query(sql, values);
}

export async function create(table, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  const sql = `INSERT INTO ${esc(table)} (${keys.map(esc).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  const result = await getDb().query(sql, values);
  return result.length > 0 ? result[0] : null;
}

export async function update(table, id, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClauses = keys.map((k, i) => `${esc(k)} = $${i + 1}`);
  values.push(id);

  const sql = `UPDATE ${esc(table)} SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`;
  const result = await getDb().query(sql, values);
  return result.length > 0 ? result[0] : null;
}

export async function remove(table, id) {
  await getDb().query(`DELETE FROM ${esc(table)} WHERE id = $1`, [id]);
}

export async function _include(table, foreignKey, parentId, opts) {
  if (opts) {
    return where(table, {
      conditions: { ...opts.conditions, [foreignKey]: parentId },
      sortBy: opts.sortBy,
      order: opts.order,
      limit: opts.limit,
      offset: opts.offset,
    });
  }
  return getDb().query(`SELECT * FROM ${esc(table)} WHERE ${esc(foreignKey)} = $1`, [parentId]);
}

// Simple identifier escaping — prevents SQL injection in table/column names
function esc(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}
