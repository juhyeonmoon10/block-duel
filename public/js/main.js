// 화면 전환, 로비/대기실 UI, 서버 이벤트 연결
import { WEAPONS, SLOTS, SLOT_LABEL, DEFAULT_LOADOUT, weaponsForSlot, sanitizeLoadout, shotsToKill } from '/shared/weapons.js';
import { MAPS, MAP_IDS } from '/shared/maps.js';
import { Game, TEAM_NAME } from './game.js';
import { Hud, esc } from './hud.js';
import * as A from './audio.js';
import * as AS from './assets.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('bd_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bd_' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

const settings = {
  sens: store.get('sens', 1), fov: store.get('fov', 80), vol: store.get('vol', 0.6), quality: store.get('quality', 1),
};
let loadout = sanitizeLoadout(store.get('loadout', DEFAULT_LOADOUT));

const app = { screen: 'lobby', myId: null, myName: store.get('name', ''), room: null, spectator: false, wantRematch: false, resultUntil: 0 };

const socket = io();
const hud = new Hud();
const game = new Game({ canvas: $('game'), hud, socket, settings });
window.__game = game; // 디버그용
game.onAutoQuality = (fps, q) => {
  toast(`화면이 버벅여서(${fps}fps) 화질을 자동으로 낮췄어요`);
  $('set-quality').value = String(q);
};

// ═════════════ 공통 ═════════════
function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function showScreen(s) {
  app.screen = s;
  $('lobby').classList.toggle('hidden', s !== 'lobby');
  $('room').classList.toggle('hidden', s !== 'room');
  hud.show(s === 'game');
  document.body.classList.toggle('in-room', s === 'room');
  document.body.classList.toggle('in-game', s === 'game');
  if (s === 'lobby') { game.stop(); $('game').style.visibility = 'hidden'; }
  else { $('game').style.visibility = 'visible'; game.start(); }
  if (s !== 'game' && document.pointerLockElement) document.exitPointerLock();
  updatePlayOverlay();
}

function mapOptions(sel) {
  sel.innerHTML = MAP_IDS.map((id) => `<option value="${id}">${MAPS[id].name}</option>`).join('');
}

document.addEventListener('pointerdown', () => { A.initAudio(); A.setVolume(settings.vol); }, { once: false });

// 세그먼트 버튼
document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    seg.dispatchEvent(new CustomEvent('change', { detail: b.dataset.v }));
  });
});
const segVal = (name) => Number(document.querySelector(`.seg[data-name="${name}"] button.on`)?.dataset.v);
const setSeg = (name, v) => document.querySelectorAll(`.seg[data-name="${name}"] button`).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === v));

// ═════════════ 로비 ═════════════
mapOptions($('create-map'));
mapOptions($('host-map'));

const nameInput = $('name');
nameInput.value = app.myName;
function sendHello() {
  socket.emit('hello', { name: nameInput.value.trim(), loadout });
}
nameInput.addEventListener('change', () => {
  store.set('name', nameInput.value.trim());
  sendHello();
});
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

function ensureName() {
  if (!nameInput.value.trim()) {
    nameInput.focus();
    toast('닉네임을 먼저 정해주세요');
    return false;
  }
  if (nameInput.value.trim() !== app.myName) {
    app.myName = nameInput.value.trim();
    store.set('name', app.myName);
    sendHello();
  }
  return true;
}

document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
  if (!ensureName()) return;
  socket.emit('quickMatch', { mode: Number(b.dataset.quick), map: MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] });
}));
$('btn-create').addEventListener('click', () => {
  if (!ensureName()) return;
  socket.emit('createRoom', { mode: segVal('mode'), map: $('create-map').value, winRounds: segVal('rounds') });
});
$('btn-join').addEventListener('click', () => {
  if (!ensureName()) return;
  const id = $('join-code').value.trim().toUpperCase();
  if (id.length !== 4) { toast('방 코드는 4글자예요'); return; }
  socket.emit('joinRoom', { id });
});
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-spectate').addEventListener('click', () => {
  const id = $('join-code').value.trim().toUpperCase();
  if (id.length !== 4) { toast('관전할 방 코드를 입력해주세요'); return; }
  ensureName();
  socket.emit('joinRoom', { id, spectate: true });
});
$('room-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-join]');
  if (!b) return;
  if (!b.dataset.spec && !ensureName()) return;
  socket.emit('joinRoom', { id: b.dataset.join, spectate: !!b.dataset.spec });
});

function renderLobby(l) {
  $('online').textContent = `지금 ${l.online}명 접속 중`;
  const list = $('room-list');
  if (!l.rooms.length) {
    list.innerHTML = '<li class="empty">아직 열린 방이 없어요. 빠른 대전을 누르면 방이 만들어지고, 다른 사람이 같은 버튼을 누르면 자동으로 매칭돼요.</li>';
  } else {
    list.innerHTML = l.rooms.map((r) => {
      const live = r.phase !== 'waiting';
      const full = r.players >= r.max;
      const btn = live || full
        ? `<button class="btn small ghost" data-join="${r.id}" data-spec="1">관전</button>`
        : `<button class="btn small yellow" data-join="${r.id}">입장</button>`;
      return `<li class="room-item"><span class="ri-code">${r.id}</span>
        <div><div class="ri-name">${esc(r.names.join(r.mode === 1 ? ' vs ' : ', ') || r.name)}</div>
        <div class="ri-meta">${r.mode}:${r.mode} · ${MAPS[r.map]?.name || ''} · ${r.players}/${r.max}명 ${live ? `<span class="ri-live">경기 중 ${r.score[0]}:${r.score[1]}</span>` : ''}</div></div>${btn}</li>`;
    }).join('');
  }
  $('king').innerHTML = l.king ? `현재 왕좌<b>${esc(l.king.name)} · ${l.king.streak}연승 중</b>` : '';
  const ranks = $('rank-list');
  ranks.innerHTML = l.leaders.length
    ? l.leaders.map((x) => `<li><span>${esc(x.name)}</span><span class="rk-stat">최고 <b>${x.best}연승</b> · ${x.wins}승</span></li>`).join('')
    : '<li class="empty" style="list-style:none">첫 승리를 기록해보세요</li>';
}

// ═════════════ 설정 ═════════════
function bindRange(id, key, fmt) {
  const el = $(id), out = $(id.replace('set-', '') + '-v');
  el.value = settings[key];
  const show = () => { if (out) out.textContent = fmt(settings[key]); };
  show();
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    store.set(key, settings[key]);
    show();
    game.applySettings(settings);
    if (key === 'vol') A.setVolume(settings.vol);
  });
}
bindRange('set-sens', 'sens', (v) => v.toFixed(2));
bindRange('set-fov', 'fov', (v) => v + '°');
bindRange('set-vol', 'vol', (v) => Math.round(v * 100) + '%');
$('set-quality').value = String(settings.quality);
$('set-quality').addEventListener('change', (e) => {
  settings.quality = Number(e.target.value);
  store.set('quality', settings.quality);
  game.applySettings(settings);
});

// ═════════════ 무기 선택 ═════════════
function statBars(w) {
  const bar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%"></b></i></div>`;
  const stk = (t) => `<div class="stk">${t}</div>`;
  if (w.kind === 'gun') {
    return stk(`처치: 몸 ${shotsToKill(w)}방 · 헤드 ${shotsToKill(w, true)}방${w.pellets ? ' (근접)' : ''}`) +
      bar('위력', (w.dmg * (w.pellets || 1)) / 56) + bar('연사', (w.burst ? w.rpm * w.burst : w.rpm) / 1300) +
      bar('사거리', Math.min(999, w.falloff?.[1] || 0) / 80) + bar('기동', ((w.speed || 1) - 0.65) / 0.55);
  }
  if (w.kind === 'proj') return stk(`처치: 직격 ${shotsToKill(w)}방`) + bar('위력', w.dmg / 66) + bar('범위', w.radius / 5) + bar('기동', ((w.speed || 1) - 0.65) / 0.55);
  if (w.kind === 'melee') return stk(`처치: ${shotsToKill(w)}방`) + bar('위력', w.dmg / 36) + bar('속도', 0.42 / w.rate) + bar('리치', w.range / 3.3) + bar('기동', ((w.speed || 1) - 0.65) / 0.55);
  return '';
}

function renderLoadoutModal() {
  $('loadout-cols').innerHTML = SLOTS.map((s) => `
    <div class="lc-col"><h3>${SLOT_LABEL[s]}</h3>
      ${weaponsForSlot(s).map((k) => {
        const w = WEAPONS[k];
        return `<button class="wcard ${loadout[s] === k ? 'on' : ''}" data-slot="${s}" data-w="${k}">
          <img class="wc-img" src="${AS.iconUrl(k)}" alt="" loading="lazy"><div class="wc-name">${w.name}</div><div class="wc-desc">${w.desc}</div>${statBars(w)}</button>`;
      }).join('')}
    </div>`).join('');
}
function renderChips() {
  $('loadout-chips').innerHTML = SLOTS.map((s) => `<div class="chip"><img src="${AS.iconUrl(loadout[s])}" alt=""><span><small>${SLOT_LABEL[s]}</small>${WEAPONS[loadout[s]].name}</span></div>`).join('');
}
function openLoadout() {
  if (document.pointerLockElement) document.exitPointerLock();
  renderLoadoutModal();
  $('loadout-modal').classList.remove('hidden');
  updatePlayOverlay();
}
function closeLoadout() {
  $('loadout-modal').classList.add('hidden');
  updatePlayOverlay();
}
$('loadout-cols').addEventListener('click', (e) => {
  const c = e.target.closest('.wcard');
  if (!c) return;
  loadout[c.dataset.slot] = c.dataset.w;
  loadout = sanitizeLoadout(loadout);
  store.set('loadout', loadout);
  renderLoadoutModal();
  renderChips();
  socket.emit('loadout', { loadout });
});
$('btn-loadout').addEventListener('click', openLoadout);
$('btn-loadout2').addEventListener('click', openLoadout);
$('btn-play-loadout').addEventListener('click', openLoadout);
$('btn-loadout-done').addEventListener('click', () => {
  closeLoadout();
  const ph = app.room?.phase;
  if (ph === 'live') toast('바꾼 무기는 다음 라운드부터 적용돼요');
});
renderChips();

// ═════════════ 대기실 ═════════════
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-play-leave').addEventListener('click', leaveRoom);
$('btn-result-leave').addEventListener('click', leaveRoom);
function leaveRoom() {
  socket.emit('leaveRoom');
  app.room = null;
  app.wantRematch = false;
  $('result-overlay').classList.add('hidden');
  $('vs-overlay').classList.add('hidden');
  showScreen('lobby');
}
$('btn-ready').addEventListener('click', () => {
  const me = app.room?.players.find((p) => p.id === app.myId);
  if (!me) return;
  socket.emit('ready', { ready: !me.ready });
});
$('btn-team').addEventListener('click', () => {
  const me = app.room?.players.find((p) => p.id === app.myId);
  if (me) socket.emit('setTeam', { team: 1 - me.team });
});
document.querySelector('.seg[data-name="hmode"]').addEventListener('change', (e) => socket.emit('settings', { mode: Number(e.detail) }));
document.querySelector('.seg[data-name="hrounds"]').addEventListener('change', (e) => socket.emit('settings', { winRounds: Number(e.detail) }));
$('host-map').addEventListener('change', (e) => socket.emit('settings', { map: e.target.value }));

function renderRoom(r) {
  $('room-code').textContent = r.id;
  $('room-name').textContent = r.name;
  $('room-desc').textContent = `${MAPS[r.map].name} · ${r.mode}:${r.mode} · ${r.winRounds}라운드 먼저 이기면 승리`;
  const isHost = r.host === app.myId && !app.spectator;
  $('host-settings').classList.toggle('hidden', !isHost);
  if (isHost) { setSeg('hmode', r.mode); setSeg('hrounds', r.winRounds); $('host-map').value = r.map; }

  const me = r.players.find((p) => p.id === app.myId);
  for (const t of [0, 1]) {
    const ps = r.players.filter((p) => p.team === t);
    let html = `<div class="team-head">${TEAM_NAME[t]} 팀</div>`;
    for (const p of ps) {
      const tags = [WEAPONS[p.loadout.primary].name, WEAPONS[p.loadout.secondary].name, WEAPONS[p.loadout.melee].name];
      const rec = r.h2h && r.h2h[p.id] != null ? `<span>상대 전적 ${r.h2h[p.id]}승</span>` : '';
      html += `<div class="pcard ${p.id === app.myId ? 'me' : ''}">
        <div><div class="pc-name">${esc(p.name)}${p.id === r.host ? ' 👑' : ''}</div>${p.streak ? `<div class="pc-streak">${p.streak}연승 중</div>` : ''}</div>
        <div class="pc-ready ${p.ready ? 'on' : ''}">${p.ready ? '준비 완료' : '대기 중'}</div>
        <div class="pc-tags">${tags.map((x) => `<span>${x}</span>`).join('')}${rec}</div></div>`;
    }
    for (let i = ps.length; i < r.mode; i++) html += '<div class="pcard slot">빈 자리</div>';
    $('team-' + t).innerHTML = html;
  }
  const btn = $('btn-ready');
  btn.disabled = !me;
  btn.classList.toggle('on', !!me?.ready);
  btn.textContent = me?.ready ? '준비 취소' : '준비 완료';
  $('btn-team').disabled = !me || r.players.filter((p) => p.team === 1 - me.team).length >= r.mode;
  $('btn-loadout2').disabled = false;
  const full = r.players.length >= r.mode * 2;
  $('room-hint').innerHTML = app.spectator
    ? '관전자로 들어왔어요. 경기가 시작되면 화면을 클릭해서 관전하세요.'
    : full ? '모두 준비 완료를 누르면 바로 시작해요' : `친구에게 알려줄 방 코드 <b>${r.id}</b>`;
  $('spectators').textContent = r.spectators.length ? `관전 중: ${r.spectators.map((s) => s.name).join(', ')}` : '';
}

// ═════════════ VS / 결과 ═════════════
function showVs(r) {
  const col = (t) => r.players.filter((p) => p.team === t).map((p) =>
    `<div><img class="vimg" src="${AS.iconUrl(p.loadout.primary)}" alt=""><div class="vn">${esc(p.name)}</div><div class="vw">${WEAPONS[p.loadout.primary].name} · ${WEAPONS[p.loadout.secondary].name}${p.streak ? ` · <span class="vk">${p.streak}연승 중</span>` : ''}</div></div>`).join('');
  $('vs-red').innerHTML = col(0);
  $('vs-blue').innerHTML = col(1);
  let sub = `${MAPS[r.map].name} · ${r.winRounds}선승`;
  if (r.h2h) {
    const red = r.players.find((p) => p.team === 0), blue = r.players.find((p) => p.team === 1);
    if (red && blue) sub += ` · 상대 전적 ${r.h2h[red.id] || 0} : ${r.h2h[blue.id] || 0}`;
  }
  $('vs-sub').textContent = sub;
  const ov = $('vs-overlay');
  ov.classList.add('hidden');
  void ov.offsetWidth;
  ov.classList.remove('hidden');
  A.beep(true);
}

function showResult(res) {
  const r = app.room;
  const me = res.players.find((p) => p.id === app.myId);
  const title = $('result-title');
  if (me && !app.spectator) {
    const win = me.team === res.winner;
    title.textContent = win ? '승리!' : '패배';
    title.className = 'result-title ' + (win ? 'win' : 'lose');
    A.fanfare(win);
  } else {
    title.textContent = `${TEAM_NAME[res.winner]} 팀 승리`;
    title.className = 'result-title ' + (res.winner ? 'blue' : 'red');
  }
  $('result-score').innerHTML = `<span class="r">${res.score[0]}</span> : <span class="b">${res.score[1]}</span>${res.forfeit ? ' <small>(기권승)</small>' : ''}`;
  const st = res.streaks?.[app.myId];
  let streakText = '';
  if (me && st) {
    if (me.team === res.winner) streakText = st.streak >= 2 ? `${st.streak}연승 중! 최고 기록 ${st.best}연승` : '첫 승리! 연승을 이어가 보세요';
    else streakText = '한 판 더 눌러서 바로 복수하세요';
  }
  $('result-streak').textContent = streakText;
  $('result-table').innerHTML = '<tr><th>플레이어</th><th>킬</th><th>데스</th><th>피해량</th></tr>' +
    res.players.slice().sort((a, b) => a.team - b.team || b.kills - a.kills).map((p) =>
      `<tr class="${p.id === app.myId ? 'me' : ''}"><td><span class="${p.team ? 'dotb' : 'dotr'}">■</span> ${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.dmg}</td></tr>`).join('');
  $('btn-rematch').classList.toggle('hidden', app.spectator || !me);
  $('btn-rematch').disabled = false;
  $('btn-rematch').textContent = '한 판 더';
  $('result-note').textContent = '잠시 후 대기실로 돌아가요';
  $('result-overlay').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  updatePlayOverlay();
}
$('btn-rematch').addEventListener('click', () => {
  app.wantRematch = true;
  $('btn-rematch').disabled = true;
  $('btn-rematch').textContent = '준비 완료! 대기실에서 만나요';
});

// ═════════════ 플레이 오버레이 (포인터 잠금) ═════════════
function updatePlayOverlay() {
  const ph = app.room?.phase;
  const need = app.screen === 'game' && ['countdown', 'live', 'roundEnd'].includes(ph) &&
    !game.locked && $('loadout-modal').classList.contains('hidden') && $('result-overlay').classList.contains('hidden');
  $('play-overlay').classList.toggle('hidden', !need);
  $('btn-play').textContent = app.spectator ? '클릭해서 관전' : '클릭해서 플레이';
  $('btn-play-loadout').classList.toggle('hidden', app.spectator);
}
game.onLockChange = () => updatePlayOverlay();
$('btn-play').addEventListener('click', () => {
  A.initAudio();
  A.setVolume(settings.vol);
  const p = $('game').requestPointerLock({ unadjustedMovement: true });
  // 일부 크롬북은 unadjustedMovement 미지원 → 일반 잠금으로 재시도
  if (p && p.catch) p.catch(() => $('game').requestPointerLock());
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && app.screen === 'game' && !app.spectator && app.room && app.room.phase !== 'live') {
    openLoadout();
  }
  if (e.code === 'Escape' && !$('loadout-modal').classList.contains('hidden')) closeLoadout();
});

// ═════════════ 소켓 ═════════════
socket.on('connect', () => {
  sendHello();
  if (app.room) {
    // 잠깐 끊겼다가 돌아오면 원래 방으로 자동 재입장
    const id = app.room.id;
    app.room = null;
    toast('다시 연결됐어요. 방에 다시 들어가는 중...');
    socket.emit('joinRoom', { id, spectate: app.spectator });
  }
});
socket.on('disconnect', () => toast('서버 연결이 끊겼어요. 다시 연결하는 중...', 4000));
socket.on('me', (m) => {
  app.myId = m.id;
  if (!nameInput.value.trim()) { nameInput.value = m.name; }
  app.myName = m.name;
  store.set('name', m.name);
});
socket.on('lobby', renderLobby);
socket.on('toast', (t) => toast(t.msg));

socket.on('joined', (m) => {
  app.spectator = m.spectator;
  app.myId = socket.id;
  app.wantRematch = false;
  showScreen('room');
});

socket.on('room', (r) => {
  const prev = app.room?.phase;
  app.room = r;
  game.setRoom(r, socket.id, app.spectator);
  if (r.phase === 'waiting') {
    $('vs-overlay').classList.add('hidden');
    $('result-overlay').classList.add('hidden');
    showScreen('room');
    renderRoom(r);
    if (app.wantRematch && !app.spectator && prev && prev !== 'waiting') {
      app.wantRematch = false;
      socket.emit('ready', { ready: true });
    }
  } else {
    if (app.screen !== 'game') showScreen('game');
    if (r.phase === 'vs' && prev !== 'vs') showVs(r);
    if (r.phase !== 'vs') $('vs-overlay').classList.add('hidden');
  }
  updatePlayOverlay();
});

socket.on('spawn', (sp) => { game.onSpawn(sp); updatePlayOverlay(); });
socket.on('snap', (s) => game.onSnap(s));
socket.on('fx', (f) => game.onFx(f));
socket.on('hit', (h) => game.onHit(h));
socket.on('hurt', (h) => game.onHurt(h));
socket.on('kill', (k) => game.onKill(k));
socket.on('knock', (k) => game.onKnock(k));
socket.on('correct', (c) => game.onCorrect(c));
socket.on('util', (u) => game.onUtil(u));
socket.on('healed', (h) => game.onHealed(h));
socket.on('loadoutApplied', (m) => game.onLoadoutApplied(m));
socket.on('roundResult', (r) => game.onRoundResult(r));
socket.on('fight', () => game.onFight());
socket.on('matchResult', (res) => showResult(res));

setInterval(() => {
  if (!socket.connected || app.screen !== 'game') { hud.ping(null); return; }
  const t = performance.now();
  socket.emit('ping2', null, () => hud.ping(Math.round(performance.now() - t)));
}, 2000);

showScreen('lobby');

// 3D 모델 미리 받기 (받는 동안은 블록 모델로 대신 표시)
(async () => {
  const bar = $('load-bar');
  try {
    await AS.preloadAll((t) => { bar.querySelector('i').style.width = Math.round(t * 100) + '%'; });
    await AS.loadWeapons();
    await AS.loadCharacter();
    bar.classList.add('done');
    game.onAssetsReady();
  } catch (e) {
    console.warn('3D 모델을 못 불러와서 블록 모델로 진행해요', e);
    bar.querySelector('span').textContent = '모델 로딩 실패 (블록 모델 사용)';
  }
})();
