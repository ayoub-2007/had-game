// قاعدة البيانات: PostgreSQL إذا وُجد DATABASE_URL، وإلا SQLite محلياً (ملف alhad.db)
const path = require('path');
const PG = !!process.env.DATABASE_URL;
let q;
if (PG) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
  const cv = s => { let i = 0; return s.replace(/\?/g, () => '$' + (++i)); };
  q = {
    run: (s, p = []) => pool.query(cv(s), p),
    all: async (s, p = []) => (await pool.query(cv(s), p)).rows,
    get: async (s, p = []) => (await pool.query(cv(s), p)).rows[0]
  };
} else {
  const D = require('better-sqlite3');
  const d = new D(process.env.SQLITE_FILE || path.join(__dirname, 'alhad.db'));
  d.pragma('journal_mode = WAL');
  q = {
    run: async (s, p = []) => d.prepare(s).run(...p),
    all: async (s, p = []) => d.prepare(s).all(...p),
    get: async (s, p = []) => d.prepare(s).get(...p)
  };
}
const ID = PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const TS = PG ? 'TIMESTAMPTZ DEFAULT NOW()' : 'TEXT DEFAULT CURRENT_TIMESTAMP';

exports.init = async () => {
  await q.run(`CREATE TABLE IF NOT EXISTS users (
    id ${ID}, google_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT, avatar TEXT,
    elo INTEGER NOT NULL DEFAULT 1000, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
    created_at ${TS})`);
  await q.run(`CREATE TABLE IF NOT EXISTS matches (
    id ${ID}, player1_id INTEGER NOT NULL REFERENCES users(id), player2_id INTEGER NOT NULL REFERENCES users(id),
    winner_id INTEGER NOT NULL REFERENCES users(id), reason TEXT, moves INTEGER,
    p1_elo_before INTEGER, p1_elo_after INTEGER, p2_elo_before INTEGER, p2_elo_after INTEGER,
    created_at ${TS})`);
  await q.run('CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC)');
};

exports.upsertGoogleUser = async u => {
  const e = await q.get('SELECT id FROM users WHERE google_id = ?', [u.google_id]);
  if (e) await q.run('UPDATE users SET name = ?, email = ?, avatar = ? WHERE id = ?', [u.name, u.email, u.avatar, e.id]);
  else await q.run('INSERT INTO users (google_id, name, email, avatar) VALUES (?, ?, ?, ?)', [u.google_id, u.name, u.email, u.avatar]);
  return q.get('SELECT * FROM users WHERE google_id = ?', [u.google_id]);
};
exports.getUser = id => q.get('SELECT * FROM users WHERE id = ?', [id]);
exports.top = n => q.all('SELECT id, name, avatar, elo, wins, losses FROM users ORDER BY elo DESC, wins DESC, id ASC LIMIT ?', [n]);

// يسجّل المباراة المصنفة ويحدّث اللاعبين (e1/e2 = [قبل، بعد])
exports.recordMatch = async m => {
  await q.run(`INSERT INTO matches (player1_id, player2_id, winner_id, reason, moves, p1_elo_before, p1_elo_after, p2_elo_before, p2_elo_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [m.p1, m.p2, m.winner, m.reason, m.moves, m.e1[0], m.e1[1], m.e2[0], m.e2[1]]);
  const w1 = m.winner === m.p1, loser = w1 ? m.p2 : m.p1;
  await q.run('UPDATE users SET elo = ?, wins = wins + 1 WHERE id = ?', [w1 ? m.e1[1] : m.e2[1], m.winner]);
  await q.run('UPDATE users SET elo = ?, losses = losses + 1 WHERE id = ?', [w1 ? m.e2[1] : m.e1[1], loser]);
};
