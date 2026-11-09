const express = require('express'), http = require('http'), path = require('path'), crypto = require('crypto');
const { Server } = require('socket.io'), jwt = require('jsonwebtoken'), { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const ORIGIN = process.env.CLIENT_ORIGIN || '*';
const GID = process.env.GOOGLE_CLIENT_ID || '';
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET غير مضبوط: سيُستخدم مفتاح عشوائي (تنتهي الجلسات عند إعادة التشغيل)');
const KEY = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const gclient = GID ? new OAuth2Client(GID) : null;

const app = express(), srv = http.createServer(app);
const io = new Server(srv, { cors: { origin: ORIGIN } });
app.use((q, r, n) => {
  r.setHeader('Access-Control-Allow-Origin', ORIGIN);
  r.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  r.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (q.method === 'OPTIONS') return r.sendStatus(204);
  n();
});
app.use(express.json({ limit: '10kb' }));

// ---------- Auth ----------
const pub = u => ({ id: u.id, name: u.name, avatar: u.avatar, elo: u.elo, wins: u.wins, losses: u.losses });
const userFromToken = async tok => { try { return await db.getUser(jwt.verify(tok, KEY).uid); } catch (e) { return null; } };
app.get('/api/config', (q, r) => r.json({ googleClientId: GID || null }));
app.post('/api/auth/google', async (q, r) => {
  try {
    if (!gclient) return r.status(503).json({ error: 'auth disabled' });
    const t = await gclient.verifyIdToken({ idToken: String((q.body && q.body.credential) || ''), audience: GID });
    const p = t.getPayload();
    if (!p || !p.sub || p.email_verified === false) throw new Error('bad token');
    const u = await db.upsertGoogleUser({ google_id: p.sub, name: String(p.name || p.email || 'Player').slice(0, 40), email: p.email || '', avatar: p.picture || '' });
    r.json({ token: jwt.sign({ uid: u.id }, KEY, { expiresIn: '30d' }), user: pub(u) });
  } catch (e) { r.status(401).json({ error: 'invalid token' }); }
});
app.get('/api/me', async (q, r) => {
  const m = /^Bearer (.+)$/.exec(q.headers.authorization || '');
  const u = m && await userFromToken(m[1]);
  u ? r.json(pub(u)) : r.status(401).json({ error: 'unauthorized' });
});
app.get('/api/leaderboard', async (q, r) => { try { r.json(await db.top(50)); } catch (e) { r.status(500).json([]); } });
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Rules ----------
const ADJ = [[1,3,4],[0,2,4],[1,5,4],[0,4,6],[0,1,2,3,5,6,7,8],[2,4,8],[3,4,7],[6,4,8],[5,4,7]];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const HOME = { 1: [6,7,8], 2: [0,1,2] };
const startBoard = () => { const b = Array(9).fill(0); [6,7,8].forEach(i => b[i] = 1); [0,1,2].forEach(i => b[i] = 2); return b; };
const hasMoves = (b, p) => b.some((v, i) => v === p && ADJ[i].some(j => !b[j]));
const isWin = (b, p) => LINES.some(l => l.every(i => b[i] === p) && l.join() !== HOME[p].join());

// ---------- ELO (للمباريات المصنفة فقط) ----------
const K = 32;
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const newRatings = (ra, rb, sa) => [Math.round(ra + K * (sa - expected(ra, rb))), Math.round(rb + K * ((1 - sa) - expected(rb, ra)))];

// ---------- Rooms ----------
const GRACE = 90000, MIN_MOVES = 2;
const rooms = new Map(), pending = new Map();
let queue = [];
const snap = r => ({ board: r.board, turn: r.turn, times: r.times, away: [!r.pl[1].sock, !r.pl[2].sock] });
const emit = (r, extra) => io.to(r.id).emit('state', Object.assign(snap(r), extra || {}));
const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const desc = s => ({ pid: s.data.pid, name: s.data.name, sock: s, uid: s.data.user ? s.data.user.id : null, elo: s.data.user ? s.data.user.elo : null });

async function finish(r, w, reason) {
  if (r.over) return;
  r.over = true; clearTimeout(r.dc[1]); clearTimeout(r.dc[2]);
  let elo = null;
  if (r.moves < MIN_MOVES || r.pl[1].pid === r.pl[2].pid) { w = 0; reason = 'abort'; }
  else if (r.ranked && r.pl[1].uid && r.pl[2].uid) {          // لا ELO في الغرف الخاصة إطلاقاً
    try {
      const a = await db.getUser(r.pl[1].uid), b = await db.getUser(r.pl[2].uid);
      const [na, nb] = newRatings(a.elo, b.elo, w === 1 ? 1 : 0);
      elo = [{ rating: na, delta: na - a.elo }, { rating: nb, delta: nb - b.elo }];
      await db.recordMatch({ p1: a.id, p2: b.id, winner: w === 1 ? a.id : b.id, reason, moves: r.moves, e1: [a.elo, na], e2: [b.elo, nb] });
    } catch (e) { console.error('ranked save failed', e); elo = null; }
  }
  emit(r, { over: true, winner: w, reason, elo });
  setTimeout(() => rooms.delete(r.id), 5000);
}

function bindSock(r, n) {
  const s = r.pl[n].sock; if (!s) return;
  s.join(r.id); s.data.room = r; s.data.n = n;
  s.emit('start', { gid: r.id, you: n, ranked: r.ranked, names: [r.pl[1].name, r.pl[2].name], elo: r.ranked ? [r.pl[1].elo, r.pl[2].elo] : null, state: snap(r) });
}
function pair(a, b, ranked) {
  if (a.pid === b.pid || a.sock === b.sock) return false;
  const id = Math.random().toString(36).slice(2, 10);
  const pl = Math.random() < 0.5 ? { 1: b, 2: a } : { 1: a, 2: b };
  const r = { id, pl, board: startBoard(), turn: 1, times: [60, 60], last: Date.now(), over: false, ranked, moves: 0, dc: {} };
  rooms.set(id, r); bindSock(r, 1); bindSock(r, 2);
  return true;
}

let cnt = 0;
setInterval(() => {
  const now = Date.now(); cnt++;
  for (const r of rooms.values()) {
    if (r.over) { r.last = now; continue; }
    r.times[r.turn - 1] -= (now - r.last) / 1000; r.last = now;
    if (r.times[r.turn - 1] <= 0) { r.times[r.turn - 1] = 0; finish(r, 3 - r.turn, 'time'); }
    else if (cnt % 4 === 0) emit(r);
  }
}, 250);

const leaveQueue = s => { queue = queue.filter(x => x !== s); };
const cancelPending = pid => { for (const [c, e] of pending) if (e.pid === pid) { clearTimeout(e.timer); pending.delete(c); } };

io.use(async (s, next) => {                     // التحقق من الهوية عند الاتصال (الضيف يمر بلا توكن)
  const tok = s.handshake.auth && s.handshake.auth.token;
  if (tok) { const u = await userFromToken(tok); if (u) s.data.user = u; }
  next();
});

io.on('connection', s => {
  const ident = d => {
    d = d || {}; const u = s.data.user;
    if (!s.data.pid) s.data.pid = u ? 'u' + u.id : 'g' + String(d.pid || s.id).slice(0, 40);
    s.data.name = u ? u.name : (String(d.name || 'Player').replace(/[<>]/g, '').slice(0, 16) || 'Player');
  };
  const busy = () => s.data.room && !s.data.room.over;

  s.on('queue', async d => {                    // المطابقة المصنفة: للمسجلين فقط
    ident(d); leaveQueue(s); cancelPending(s.data.pid);
    if (busy()) return;
    if (!s.data.user) return s.emit('err', 'login');
    try { s.data.user = (await db.getUser(s.data.user.id)) || s.data.user; } catch (e) {}
    if (busy() || queue.includes(s) || !s.connected) return;
    const me = s.data.user.elo; let best = null;
    queue.filter(x => x.data.user.id !== s.data.user.id).forEach(x => {
      if (!best || Math.abs(x.data.user.elo - me) < Math.abs(best.data.user.elo - me)) best = x;
    });
    if (best) { queue = queue.filter(x => x !== best); pair(desc(best), desc(s), true); }
    else { queue.push(s); s.emit('waiting', {}); }
  });

  s.on('createRoom', d => {                     // غرف خاصة: ودّية بلا ELO
    ident(d); leaveQueue(s); cancelPending(s.data.pid);
    if (busy()) return;
    let c = code(); while (pending.has(c)) c = code();
    pending.set(c, { pid: s.data.pid, name: s.data.name, sock: s, timer: null });
    s.emit('waiting', { code: c });
  });
  s.on('joinRoom', d => {
    ident(d); leaveQueue(s);
    if (busy()) return;
    const c = String((d && d.code) || '').toUpperCase().trim(), e = pending.get(c);
    if (!e) return s.emit('err', 'room');
    if (e.pid === s.data.pid || e.sock === s) return s.emit('err', 'self');
    clearTimeout(e.timer); pending.delete(c);
    pair({ pid: e.pid, name: e.name, sock: e.sock, uid: null, elo: null }, Object.assign(desc(s), { uid: null, elo: null }), false);
  });
  s.on('resume', d => {
    ident(d);
    for (const [c, e] of pending) if (e.pid === s.data.pid) { clearTimeout(e.timer); e.sock = s; e.name = s.data.name; return s.emit('waiting', { code: c }); }
    for (const r of rooms.values()) {
      if (r.over) continue;
      for (const n of [1, 2]) if (r.pl[n].pid === s.data.pid) { clearTimeout(r.dc[n]); r.pl[n].sock = s; bindSock(r, n); emit(r); return; }
    }
    s.emit('gone');
  });
  s.on('cancel', () => { leaveQueue(s); cancelPending(s.data.pid); });

  s.on('move', d => {
    const r = s.data.room;
    if (!r || r.over || !d || r.pl[s.data.n].sock !== s || r.turn !== s.data.n) return;
    const { from, to } = d, p = r.turn;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 8 || to < 0 || to > 8) return s.emit('err', 'bad');
    if (r.board[from] !== p || r.board[to] !== 0 || !ADJ[from].includes(to)) return s.emit('err', 'illegal');
    const now = Date.now();
    r.times[p - 1] -= (now - r.last) / 1000; r.last = now;
    if (r.times[p - 1] <= 0) { r.times[p - 1] = 0; return finish(r, 3 - p, 'time'); }
    r.board[to] = p; r.board[from] = 0; r.moves++;
    if (isWin(r.board, p)) { emit(r); return finish(r, p, 'line'); }
    if (!hasMoves(r.board, 3 - p)) { emit(r); return finish(r, p, 'block'); }
    r.turn = 3 - p; emit(r);
  });
  s.on('resign', () => { const r = s.data.room; if (r && !r.over && r.pl[s.data.n].sock === s) finish(r, 3 - s.data.n, 'left'); });
  s.on('disconnect', () => {
    leaveQueue(s);
    for (const [c, e] of pending) if (e.sock === s) {
      e.sock = null; clearTimeout(e.timer);
      e.timer = setTimeout(() => { if (pending.get(c) === e) pending.delete(c); }, GRACE);
    }
    const r = s.data.room, n = s.data.n;
    if (r && !r.over && r.pl[n].sock === s) { r.pl[n].sock = null; emit(r); r.dc[n] = setTimeout(() => finish(r, 3 - n, 'left'), GRACE); }
  });
});

const PORT = process.env.PORT || 3000;
db.init().then(() => srv.listen(PORT, () => console.log('Al-Hadd server on :' + PORT)))
  .catch(e => { console.error('DB init failed', e); process.exit(1); });
