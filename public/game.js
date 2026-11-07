/* Al-Hadd - client. Set window.SERVER_URL (e.g. in index.html) if the server is on another domain. */
const SERVER_URL = window.SERVER_URL || '';
const ADJ = [[1,3,4],[0,2,4],[1,5,4],[0,4,6],[0,1,2,3,5,6,7,8],[2,4,8],[3,4,7],[6,4,8],[5,4,7]];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const HOME = { 1: [6,7,8], 2: [0,1,2] };
const $ = s => document.querySelector(s);
const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
             set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- Rules ---------- */
const startBoard = () => { const b = Array(9).fill(0); [6,7,8].forEach(i => b[i] = 1); [0,1,2].forEach(i => b[i] = 2); return b; };
const moves = (b, p) => { const r = []; b.forEach((v, i) => { if (v === p) ADJ[i].forEach(j => { if (!b[j]) r.push([i, j]); }); }); return r; };
const isWin = (b, p) => LINES.some(l => l.every(i => b[i] === p) && l.join() !== HOME[p].join());
const ap = (b, f, t) => { const n = b.slice(); n[t] = n[f]; n[f] = 0; return n; };
const outcome = (b, p) => isWin(b, p) ? 'line' : (!moves(b, 3 - p).length ? 'block' : null);

/* ---------- i18n ---------- */
const I = {
ar: { title:'الحَد', local:'لعب محلي', bot:'ضد الحاسوب', ranked:'أونلاين مصنّف', create:'إنشاء غرفة خاصة', join:'انضمام', code:'رمز الغرفة', name:'اسمك', lb:'المتصدرون', date:'نوى التمر', pebble:'الحصى', you:'أنت', opp:'الخصم', p1:'اللاعب 1 (نوى)', p2:'اللاعب 2 (حصى)', turn:'الدور: ', youturn:'دورك', oppturn:'دور الخصم', win:'🎉 فوز!', lose:'خسارة', pwin:'فاز اللاعب ', line:'بتكوين خط ثلاثي', block:'بحصار الخصم', time:'بنفاد الوقت', left:'بانسحاب الطرف الآخر', resign:'استسلام', menu:'القائمة', again:'العب مجدداً', help:'كيف تلعب', close:'إغلاق', ad:'إعلان', search:'جارٍ البحث عن خصم...', room:'رمز غرفتك (شاركه مع صديقك): ', noserver:'تعذر الاتصال بالخادم', cancel:'إلغاء', badroom:'الغرفة غير موجودة', elo:'تصنيفك: ',
  h1:'تبدأ القطع الست مصفوفة: نوى التمر أسفل، والحصى أعلى. الوسط فارغ.', h2:'في دورك حرّك قطعة واحدة إلى نقطة فارغة مجاورة على خط مباشر.', h3:'الفوز: صفّ قطعك الثلاث في خط (أفقي أو عمودي أو قطري).', h4:'تنبيه: اصطفاف قطعك في صفّ انطلاقك الأصلي لا يُحسب فوزاً.', h5:'من حوصرت كل قطعه أو نفد وقته (60 ثانية) خسر.' },
en: { title:'Al-Hadd', local:'Pass & Play', bot:'Vs Computer', ranked:'Ranked Online', create:'Create private room', join:'Join', code:'Room code', name:'Your name', lb:'Leaderboard', date:'Date pits', pebble:'Pebbles', you:'You', opp:'Opponent', p1:'Player 1 (pits)', p2:'Player 2 (pebbles)', turn:'Turn: ', youturn:'Your turn', oppturn:"Opponent's turn", win:'🎉 You win!', lose:'You lose', pwin:'Winner: player ', line:'by making a line of three', block:'by blocking the opponent', time:'on time', left:'by opponent leaving', resign:'Resign', menu:'Menu', again:'Play again', help:'How to play', close:'Close', ad:'Ad', search:'Looking for an opponent...', room:'Your room code (share it): ', noserver:'Cannot reach the server', cancel:'Cancel', badroom:'Room not found', elo:'Your rating: ',
  h1:'Six pieces start lined up: date pits at the bottom, pebbles on top. The middle row is empty.', h2:'On your turn, move one piece to an empty point connected by a line.', h3:'Win by lining up your three pieces (row, column or diagonal).', h4:'Careful: lining up on your own starting row does NOT count.', h5:'If all your pieces are blocked, or your 60 seconds run out, you lose.' },
fr: { title:'Al-Hadd', local:'Local à deux', bot:'Contre l’ordinateur', ranked:'En ligne classé', create:'Créer un salon privé', join:'Rejoindre', code:'Code du salon', name:'Votre nom', lb:'Classement', date:'Noyaux', pebble:'Galets', you:'Vous', opp:'Adversaire', p1:'Joueur 1 (noyaux)', p2:'Joueur 2 (galets)', turn:'Tour : ', youturn:'À vous', oppturn:'Tour adverse', win:'🎉 Victoire !', lose:'Défaite', pwin:'Gagnant : joueur ', line:'en alignant trois pièces', block:'en bloquant l’adversaire', time:'au temps', left:'par abandon adverse', resign:'Abandonner', menu:'Menu', again:'Rejouer', help:'Règles', close:'Fermer', ad:'Publicité', search:'Recherche d’un adversaire...', room:'Code de votre salon (à partager) : ', noserver:'Serveur injoignable', cancel:'Annuler', badroom:'Salon introuvable', elo:'Votre classement : ',
  h1:'Six pièces alignées au départ : noyaux en bas, galets en haut. La ligne centrale est vide.', h2:'À votre tour, déplacez une pièce vers un point vide relié par une ligne.', h3:'Gagnez en alignant vos trois pièces (ligne, colonne ou diagonale).', h4:'Attention : s’aligner sur sa ligne de départ ne compte pas.', h5:'Si toutes vos pièces sont bloquées ou si vos 60 secondes sont écoulées, vous perdez.' }
};
let lang = LS.get('lang', 'ar');
const t = k => I[lang][k] || k;
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  document.title = t('title'); $('#lang').value = lang;
  if (G) render();
}

/* ---------- Audio ---------- */
const Snd = {
  ctx: null, sfx: LS.get('sfx', true), music: LS.get('music', true), timer: null, step: 0,
  init() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.musicOn();
  },
  tone(f, d, type, v, delay, bus) {
    if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(), s = this.ctx.currentTime + (delay || 0);
    o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(v || .2, s); g.gain.exponentialRampToValueAtTime(.0001, s + d);
    o.connect(g); g.connect(bus || this.master); o.start(s); o.stop(s + d + .05);
  },
  play(n) {
    if (!this.sfx) return;
    if (n === 'select') this.tone(660, .08, 'triangle', .2);
    if (n === 'place') { this.tone(180, .15, 'triangle', .35); this.tone(120, .2, 'sine', .3, .02); }
    if (n === 'tick') this.tone(1200, .04, 'square', .08);
    if (n === 'win') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .3, 'triangle', .22, i * .12));
    if (n === 'lose') [330, 262, 196].forEach((f, i) => this.tone(f, .35, 'sine', .22, i * .15));
  },
  musicOn() {
    clearInterval(this.timer); if (!this.music || !this.ctx) return;
    const sc = [293.7, 349.2, 392, 440, 523.3, 440, 392, 349.2];
    this.timer = setInterval(() => { this.tone(sc[this.step++ % sc.length], 1.2, 'sine', .035); if (this.step % 4 === 0) this.tone(146.8, 2, 'sine', .03); }, 800);
  },
  setSfx(v) { this.sfx = v; LS.set('sfx', v); $('#bSfx').textContent = v ? '🔊' : '🔇'; },
  setMusic(v) { this.music = v; LS.set('music', v); $('#bMusic').style.opacity = v ? 1 : .4; v ? this.musicOn() : clearInterval(this.timer); }
};

/* ---------- Ads policy: 2 consecutive losses + 5 min cooldown ---------- */
const Ads = {
  COOLDOWN: 5 * 60 * 1000,
  record(humanLost) { LS.set('lossStreak', humanLost ? LS.get('lossStreak', 0) + 1 : 0); },
  shouldShow() { return LS.get('lossStreak', 0) >= 2 && Date.now() - LS.get('lastAd', 0) >= this.COOLDOWN; },
  maybeShow(done) {
    if (!this.shouldShow()) return done && done();
    LS.set('lastAd', Date.now()); LS.set('lossStreak', 0);
    $('#mAd').hidden = false; const b = $('#adClose'); b.disabled = true;
    /* Integrate a real ad SDK here: render the ad into #adSlot (e.g. AdSense/AdMob web interstitial). */
    setTimeout(() => b.disabled = false, 4000);
    b.onclick = () => { $('#mAd').hidden = true; done && done(); };
  }
};

/* ---------- State & helpers ---------- */
let G = null, sock = null, botTimer = null, pending = null;
const show = id => ['menu', 'game', 'lbox', 'wait'].forEach(s => $('#' + s).hidden = s !== id);
const fmt = s => { s = Math.ceil(Math.max(0, s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const myName = () => { const n = $('#name').value.trim().slice(0, 16) || (lang === 'ar' ? 'لاعب' : 'Player'); LS.set('name', n); return n; };
let pid = LS.get('pid', null); if (!pid) { pid = Math.random().toString(36).slice(2) + Date.now().toString(36); LS.set('pid', pid); }

function start(mode, me, extra) {
  clearTimeout(botTimer);
  G = Object.assign({ mode, me, board: startBoard(), turn: 1, times: [60, 60], sel: null, over: false, names: null, lastSec: 0 }, extra || {});
  show('game'); $('#mRes').hidden = true; Snd.init(); render();
  if (mode === 'bot' && me !== 1) botTurn();
}

function render() {
  const B = $('#board'); B.querySelectorAll('.cell').forEach(e => e.remove());
  const flip = G.me === 2;
  for (let i = 0; i < 9; i++) {
    const d = flip ? 8 - i : i, c = document.createElement('button'), v = G.board[i];
    c.className = 'cell'; c.style.left = (16.67 + 33.33 * (d % 3)) + '%'; c.style.top = (16.67 + 33.33 * Math.floor(d / 3)) + '%';
    if (v) { const s = document.createElement('i'); s.className = 'pc p' + v; c.appendChild(s); }
    if (G.sel === i) c.classList.add('sel');
    if (G.sel !== null && !v && ADJ[G.sel].includes(i)) c.classList.add('hint');
    c.onclick = () => onCell(i); B.appendChild(c);
  }
  const opp = 3 - G.me, lbl = p => G.names ? G.names[p - 1] : (G.mode === 'local' ? t('p' + p) : (p === G.me ? t('you') : t('opp')));
  $('#ctop .who').textContent = lbl(opp); $('#cbot .who').textContent = lbl(G.me);
  updateClocks();
  $('#status').textContent = G.over ? '' : (G.mode === 'local' ? t('turn') + t('p' + G.turn) : (G.turn === G.me ? t('youturn') : t('oppturn')));
  $('#gResign').hidden = G.mode === 'local';
}
function updateClocks() {
  const set = (el, p) => { el.querySelector('b').textContent = fmt(G.times[p - 1]); el.classList.toggle('on', !G.over && G.turn === p); el.classList.toggle('low', G.times[p - 1] <= 10); };
  set($('#ctop'), 3 - G.me); set($('#cbot'), G.me);
}

function canAct() {
  if (!G || G.over) return false;
  if (G.mode === 'local') return true;
  return G.turn === G.me;
}
function onCell(i) {
  Snd.init(); if (!canAct()) return;
  if (G.board[i] === G.turn) { G.sel = G.sel === i ? null : i; Snd.play('select'); return render(); }
  if (G.sel !== null && !G.board[i] && ADJ[G.sel].includes(i)) {
    const f = G.sel; G.sel = null;
    if (G.mode === 'online') { sock.emit('move', { from: f, to: i }); render(); }
    else applyLocal(f, i);
  }
}
function applyLocal(f, to) {
  const p = G.turn; G.board = ap(G.board, f, to); G.sel = null; Snd.play('place');
  const r = outcome(G.board, p);
  if (r) { render(); return finish(p, r); }
  G.turn = 3 - p; G.lastSec = 0; render();
  if (G.mode === 'bot' && G.turn !== G.me) botTurn();
}

/* ---------- Bot ---------- */
function botMove() {
  const b = G.board, p = G.turn, o = 3 - p, ms = moves(b, p);
  const win = ms.find(([f, t]) => outcome(ap(b, f, t), p));
  if (win) return win;
  const safe = ms.filter(([f, t]) => { const nb = ap(b, f, t); return !moves(nb, o).some(([a, c]) => outcome(ap(nb, a, c), o)); });
  const pool = safe.length ? safe : ms;
  const centre = pool.filter(m => m[1] === 4);
  if (centre.length && Math.random() < .75) return centre[Math.floor(Math.random() * centre.length)];
  const rest = pool.filter(m => m[1] !== 4), src = rest.length ? rest : pool;
  return src[Math.floor(Math.random() * src.length)];
}
function botTurn() {
  clearTimeout(botTimer);
  botTimer = setTimeout(() => { if (G && !G.over && G.mode === 'bot' && G.turn !== G.me) { const m = botMove(); applyLocal(m[0], m[1]); } }, 2000 + Math.random() * 2000);
}

/* ---------- Clock ---------- */
setInterval(() => {
  if (!G || G.over) return;
  G.times[G.turn - 1] -= .1;
  const left = G.times[G.turn - 1], sec = Math.ceil(left);
  if (sec <= 10 && sec > 0 && sec !== G.lastSec && (G.mode === 'local' || G.turn === G.me)) { G.lastSec = sec; Snd.play('tick'); }
  if (G.mode !== 'online' && left <= 0) { G.times[G.turn - 1] = 0; updateClocks(); return finish(3 - G.turn, 'time'); }
  if (G.mode === 'online' && left < 0) G.times[G.turn - 1] = 0;
  updateClocks();
}, 100);

/* ---------- Result ---------- */
function finish(winner, reason, elo) {
  if (G.over) return; G.over = true; clearTimeout(botTimer); render();
  const mine = G.mode === 'local' ? null : winner === G.me;
  let title = G.mode === 'local' ? t('pwin') + winner : (mine ? t('win') : t('lose'));
  let msg = G.mode === 'local' ? t(reason) : t(reason);
  if (elo) { const e = elo[G.me - 1]; msg += ' — ' + t('elo') + e.rating + ' (' + (e.delta >= 0 ? '+' : '') + e.delta + ')'; }
  Snd.play(mine === false ? 'lose' : 'win');
  $('#resT').textContent = title; $('#resP').textContent = msg; $('#mRes').hidden = false;
  if (G.mode !== 'local') Ads.record(!mine);
  $('#resAgain').hidden = G.mode === 'online';
}
function afterResult(fn) { $('#mRes').hidden = true; Ads.maybeShow(fn); }

/* ---------- Online ---------- */
function connect(cb) {
  if (sock) return cb();
  const s = document.createElement('script'); s.src = SERVER_URL + '/socket.io/socket.io.js';
  s.onload = () => { sock = SERVER_URL ? io(SERVER_URL) : io(); bind(); cb(); };
  s.onerror = () => alert(t('noserver')); document.head.appendChild(s);
}
function bind() {
  sock.on('waiting', d => { show('wait'); $('#waitMsg').textContent = d.code ? t('room') + d.code : t('search'); });
  sock.on('start', d => {
    start('online', d.you, { names: d.names.map((n, i) => n + ' (' + d.elo[i] + ')'), board: d.state.board, turn: d.state.turn, times: d.state.times });
    render();
  });
  sock.on('state', s => {
    if (!G || G.mode !== 'online') return;
    const moved = s.board.join() !== G.board.join();
    G.board = s.board; G.turn = s.turn; G.times = s.times; G.sel = null; G.lastSec = 0;
    if (moved) Snd.play('place');
    render(); if (s.winner) finish(s.winner, s.reason, s.elo);
  });
  sock.on('err', e => { if (e === 'room') alert(t('badroom')); });
}
const ident = () => ({ name: myName(), pid });

async function loadLb() {
  show('lbox'); const ol = $('#lbList'); ol.innerHTML = '';
  try {
    const r = await fetch(SERVER_URL + '/api/leaderboard'); const d = await r.json();
    d.forEach(p => { const li = document.createElement('li'); li.textContent = p.name + ' — ' + p.elo + '  (' + p.w + '/' + p.l + ')'; ol.appendChild(li); });
  } catch (e) { const li = document.createElement('li'); li.textContent = t('noserver'); ol.appendChild(li); }
}

/* ---------- Wiring ---------- */
$('#mLocal').onclick = () => start('local', 1);
$('#mBot').onclick = () => start('bot', +$('#pick').value);
$('#mRank').onclick = () => connect(() => sock.emit('queue', ident()));
$('#mCreate').onclick = () => connect(() => sock.emit('createRoom', ident()));
$('#mJoin').onclick = () => { const c = $('#code').value.trim(); if (c) connect(() => sock.emit('joinRoom', Object.assign(ident(), { code: c }))); };
$('#mLb').onclick = loadLb;
$('#wCancel').onclick = () => { if (sock) sock.emit('cancel'); show('menu'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('menu'));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').hidden = true);
$('#gResign').onclick = () => { if (!G || G.over) return; if (G.mode === 'online') sock.emit('resign'); else finish(3 - G.me, 'left'); };
const toMenu = () => { if (G && G.mode === 'online' && !G.over && sock) sock.emit('resign'); G = null; clearTimeout(botTimer); show('menu'); };
$('#gMenu').onclick = toMenu;
$('#resMenu').onclick = () => afterResult(toMenu);
$('#resAgain').onclick = () => afterResult(() => start(G.mode, G.me));
$('#bHelp').onclick = () => $('#mHelp').hidden = false;
$('#bSfx').onclick = () => { Snd.init(); Snd.setSfx(!Snd.sfx); };
$('#bMusic').onclick = () => { Snd.init(); Snd.setMusic(!Snd.music); };
$('#lang').onchange = e => { lang = e.target.value; LS.set('lang', lang); applyLang(); };
let theme = LS.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const setTheme = v => { theme = v; document.documentElement.dataset.theme = v; LS.set('theme', v); };
$('#bTheme').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
setTheme(theme); Snd.setSfx(Snd.sfx); Snd.setMusic(Snd.music);
$('#name').value = LS.get('name', ''); applyLang();
if (LS.get('seenHelp', false) === false) { LS.set('seenHelp', true); $('#mHelp').hidden = false; }
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
