const express = require('express'), http = require('http'), fs = require('fs'), path = require('path');
const { Server } = require('socket.io');
const ORIGIN = process.env.CLIENT_ORIGIN || '*';
const app = express(), srv = http.createServer(app);
const io = new Server(srv, { cors: { origin: ORIGIN } });
app.use((q, r, n) => { r.setHeader('Access-Control-Allow-Origin', ORIGIN); n(); });
app.use(express.static(path.join(__dirname, 'public')));

const ADJ = [[1,3,4],[0,2,4],[1,5,4],[0,4,6],[0,1,2,3,5,6,7,8],[2,4,8],[3,4,7],[6,4,8],[5,4,7]];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const HOME = { 1: [6,7,8], 2: [0,1,2] };
const startBoard = () => { const b = Array(9).fill(0); [6,7,8].forEach(i => b[i] = 1); [0,1,2].forEach(i => b[i] = 2); return b; };
const hasMoves = (b, p) => b.some((v, i) => v === p && ADJ[i].some(j => !b[j]));
const isWin = (b, p) => LINES.some(l => l.every(i => b[i] === p) && l.join() !== HOME[p].join());

// ---------- ELO ----------
const K = 32;
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const newRatings = (ra, rb, sa) => [
  Math.round(ra + K * (sa - expected(ra, rb))),
  Math.round(rb + K * ((1 - sa) - expected(rb, ra)))
];

// ---------- Persistence ----------
const DB_FILE = process.env.DATA_FILE || path.join(__dirname, 'players.json');
let players = {};
try { players = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { players = {}; }
const save = () => fs.writeFile(DB_FILE, JSON.stringify(players), () => {});
const P = (pid, name) => {
  if (!players[pid]) players[pid] = { name: name || 'Player', elo: 1000, w: 0, l: 0 };
  if (name) players[pid].name = name;
  return players[pid];
};
app.get('/api/leaderboard', (q, r) => {
  r.json(Object.values(players).sort((a, b) => b.elo - a.elo).slice(0, 20));
});

// ---------- Rooms ----------
const GRACE = 90000;      // مهلة العودة بعد انقطاع الاتصال (90 ثانية)
const MIN_MOVES = 2;      // أقل عدد نقلات ليُحتسب فوز/تصنيف
const rooms = new Map(), pending = new Map();
let queue = [];
const snap = r => ({ board: r.board, turn: r.turn, times: r.times, away: [!r.pl[1].sock, !r.pl[2].sock] });
const emit = (r, extra) => io.to(r.id).emit('state', Object.assign(snap(r), extra || {}));
const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const desc = s => ({ pid: s.data.pid, name: s.data.name, sock: s });

function finish(r, w, reason) {
  if (r.over) return;
  r.over = true; clearTimeout(r.dc[1]); clearTimeout(r.dc[2]);
  let elo = null;
  if (r.moves < MIN_MOVES || r.pl[1].pid === r.pl[2].pid) { w = 0; reason = 'abort'; }   // لا فوز بلا جولة حقيقية بين لاعبين مختلفين
  else if (r.ranked) {
    const a = P(r.pl[1].pid), b = P(r.pl[2].pid);
    const [na, nb] = newRatings(a.elo, b.elo, w === 1 ? 1 : 0);
    elo = [{ rating: na, delta: na - a.elo }, { rating: nb, delta: nb - b.elo }];
    a.elo = na; b.elo = nb;
    (w === 1 ? a : b).w++; (w === 1 ? b : a).l++;
    save();
  }
  emit(r, { over: true, winner: w, reason, elo });
  setTimeout(() => rooms.delete(r.id), 5000);
}

function bindSock(r, n) {
  const s = r.pl[n].sock; if (!s) return;
  s.join(r.id); s.data.room = r; s.data.n = n;
  s.emit('start', {
    you: n, ranked: r.ranked,
    names: [r.pl[1].name, r.pl[2].name],
    elo: [P(r.pl[1].pid).elo, P(r.pl[2].pid).elo],
    state: snap(r)
  });
}

function pair(a, b, ranked) {
  if (a.pid === b.pid || a.sock === b.sock) return false;
  const id = Math.random().toString(36).slice(2, 10);
  const pl = Math.random() < 0.5 ? { 1: b, 2: a } : { 1: a, 2: b };
  const r = { id, pl, board: startBoard(), turn: 1, times: [60, 60], last: Date.now(), over: false, ranked, moves: 0, dc: {} };
  rooms.set(id, r);
  bindSock(r, 1); bindSock(r, 2);
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

io.on('connection', s => {
  const ident = d => {
    d = d || {};
    if (!s.data.pid) s.data.pid = String(d.pid || s.id).slice(0, 40);   // المعرّف يُثبَّت مرة واحدة لكل اتصال
    s.data.name = String(d.name || 'Player').replace(/[<>]/g, '').slice(0, 16) || 'Player';
    P(s.data.pid, s.data.name);
  };
  const busy = () => s.data.room && !s.data.room.over;

  s.on('queue', d => {
    ident(d); leaveQueue(s); cancelPending(s.data.pid);
    if (busy()) return;
    const me = P(s.data.pid).elo; let best = null;
    queue.filter(x => x.data.pid !== s.data.pid).forEach(x => {
      if (!best || Math.abs(P(x.data.pid).elo - me) < Math.abs(P(best.data.pid).elo - me)) best = x;
    });
    if (best) { queue = queue.filter(x => x !== best); pair(desc(best), desc(s), true); }
    else { queue.push(s); s.emit('waiting', {}); }
  });

  s.on('createRoom', d => {
    ident(d); leaveQueue(s); cancelPending(s.data.pid);
    if (busy()) return;
    let c = code(); while (pending.has(c)) c = code();
    pending.set(c, { pid: s.data.pid, name: s.data.name, sock: s, timer: null });
    s.emit('waiting', { code: c });
  });

  s.on('joinRoom', d => {
    ident(d); leaveQueue(s);
    if (busy()) return;
    const c = String((d && d.code) || '').toUpperCase().trim();
    const e = pending.get(c);
    if (!e) return s.emit('err', 'room');
    if (e.pid === s.data.pid || e.sock === s) return s.emit('err', 'self');   // منع الدخول ضد النفس
    clearTimeout(e.timer); pending.delete(c);
    pair({ pid: e.pid, name: e.name, sock: e.sock }, desc(s), false);
  });

  // العودة بعد انقطاع مؤقت (تبديل التطبيق على الهاتف مثلاً)
  s.on('resume', d => {
    ident(d);
    for (const e of pending.values()) if (e.pid === s.data.pid) {
      clearTimeout(e.timer); e.sock = s; e.name = s.data.name;
      for (const [c, x] of pending) if (x === e) return s.emit('waiting', { code: c });
    }
    for (const r of rooms.values()) {
      if (r.over) continue;
      for (const n of [1, 2]) if (r.pl[n].pid === s.data.pid) {
        clearTimeout(r.dc[n]); r.pl[n].sock = s; bindSock(r, n); emit(r); return;
      }
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
    for (const [c, e] of pending) if (e.sock === s) {            // غرفة انتظار: مهلة قبل الحذف
      e.sock = null; clearTimeout(e.timer);
      e.timer = setTimeout(() => { if (pending.get(c) === e) pending.delete(c); }, GRACE);
    }
    const r = s.data.room, n = s.data.n;
    if (r && !r.over && r.pl[n].sock === s) {                    // مباراة: مهلة عودة 90 ثانية
      r.pl[n].sock = null; emit(r);
      r.dc[n] = setTimeout(() => finish(r, 3 - n, 'left'), GRACE);
    }
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('Al-Hadd server on :' + PORT));
