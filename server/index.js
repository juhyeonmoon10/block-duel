// BLOCK DUEL 서버: 정적 파일 + Socket.IO 실시간 대전
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './room.js';
import { MAPS } from '../shared/maps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TICK_HZ = 30;

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/vendor', express.static(path.join(ROOT, 'node_modules/three/build')));
app.use('/vendor/jsm', express.static(path.join(ROOT, 'node_modules/three/examples/jsm')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, online: io.engine.clientsCount }));

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 5000, pingTimeout: 8000 });

// ─────────────── 연승 랭킹 (파일에 저장) ───────────────
const DATA_DIR = path.join(ROOT, 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
let leaders = {};
try { leaders = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch { leaders = {}; }
let saveTimer = null;
function saveLeaders() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(LB_FILE, JSON.stringify(leaders, null, 1));
      fs.writeFileSync(path.join(DATA_DIR, 'rivals.json'), JSON.stringify(rivals));
    } catch (e) { console.warn('랭킹 저장 실패', e.message); }
  }, 1000);
}
function leaderboard() {
  return Object.values(leaders)
    .sort((a, b) => b.best - a.best || b.wins - a.wins || b.kills - a.kills)
    .slice(0, 10);
}
function currentKing() {
  let king = null;
  for (const l of Object.values(leaders)) if (l.streak > 0 && (!king || l.streak > king.streak)) king = l;
  return king;
}

// ─────────────── 방 관리 ───────────────
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

// 1:1 상대 전적 (이름 쌍 기준)
let rivals = {};
try { rivals = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rivals.json'), 'utf8')); } catch { rivals = {}; }
const pairKey = (a, b) => [a, b].sort().join('\u0000');

const hooks = {
  onEmpty(room) { rooms.delete(room.id); pushLobby(); },
  streakOf(name) { return leaders[name]?.streak || 0; },
  h2h(a, b) { return rivals[pairKey(a, b)] || null; },
  onChange() { pushLobby(); },
  onMatchEnd(result) {
    const out = {};
    for (const p of result.players) {
      const key = p.name;
      const l = leaders[key] || (leaders[key] = { name: p.name, wins: 0, losses: 0, streak: 0, best: 0, kills: 0 });
      l.kills += p.kills;
      if (p.team === result.winner) { l.wins++; l.streak++; l.best = Math.max(l.best, l.streak); }
      else { l.losses++; l.streak = 0; }
      out[p.id] = { streak: l.streak, best: l.best, wins: l.wins };
    }
    if (result.mode === 1 && result.players.length === 2 && !result.forfeit) {
      const [a, b] = result.players;
      const key = pairKey(a.name, b.name);
      const rec = rivals[key] || (rivals[key] = { [a.name]: 0, [b.name]: 0 });
      const w = result.players.find((p) => p.team === result.winner);
      if (w && a.name !== b.name) rec[w.name] = (rec[w.name] || 0) + 1;
    }
    saveLeaders();
    setTimeout(pushLobby, 50);
    return out;
  },
};

function lobbyPayload() {
  return {
    rooms: [...rooms.values()].map((r) => r.lobbyInfo()),
    leaders: leaderboard(),
    king: currentKing(),
    online: io.engine.clientsCount,
  };
}
let lobbyTimer = null;
function pushLobby() {
  clearTimeout(lobbyTimer);
  lobbyTimer = setTimeout(() => io.to('lobby').emit('lobby', lobbyPayload()), 100);
}

function cleanName(n) {
  let s = String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12);
  if (!s) s = '플레이어' + Math.floor(1000 + Math.random() * 9000);
  return s;
}

function leaveCurrent(socket) {
  const rid = socket.data.roomId;
  if (!rid) return;
  socket.data.roomId = null;
  const room = rooms.get(rid);
  if (room) room.remove(socket.id);
  socket.join('lobby');
  pushLobby();
}

function enterRoom(socket, room, spectate) {
  leaveCurrent(socket);
  socket.leave('lobby');
  socket.data.roomId = room.id;
  if (spectate || room.inMatch || room.players.size >= room.capacity) {
    socket.emit('joined', { roomId: room.id, spectator: true });
    room.addSpectator(socket, socket.data.name);
    if (!spectate) socket.emit('toast', { msg: room.inMatch ? '경기 중이라 관전으로 들어왔어요' : '방이 가득 차서 관전으로 들어왔어요' });
  } else {
    socket.emit('joined', { roomId: room.id, spectator: false });
    room.addPlayer(socket, socket.data.name, socket.data.loadout);
  }
  pushLobby();
}

io.on('connection', (socket) => {
  socket.data.name = cleanName();
  socket.data.roomId = null;
  socket.join('lobby');
  socket.emit('lobby', lobbyPayload());
  pushLobby();

  const room = () => rooms.get(socket.data.roomId);

  socket.on('hello', (m) => {
    socket.data.name = cleanName(m?.name);
    socket.data.loadout = m?.loadout;
    socket.emit('me', { id: socket.id, name: socket.data.name });
    socket.emit('lobby', lobbyPayload());
  });

  socket.on('createRoom', (m = {}) => {
    const id = newCode();
    const r = new Room(io, id, {
      mode: m.mode === 2 ? 2 : 1,
      map: MAPS[m.map] ? m.map : 'warehouse',
      winRounds: m.winRounds === 5 ? 5 : 3,
      name: `${socket.data.name}의 방`,
    }, hooks);
    rooms.set(id, r);
    enterRoom(socket, r, false);
  });

  socket.on('joinRoom', (m = {}) => {
    const r = rooms.get(String(m.id || '').toUpperCase());
    if (!r) { socket.emit('toast', { msg: '그런 방이 없어요' }); return; }
    enterRoom(socket, r, !!m.spectate);
  });

  socket.on('quickMatch', (m = {}) => {
    const mode = m.mode === 2 ? 2 : 1;
    let best = null;
    for (const r of rooms.values()) {
      if (r.mode === mode && !r.inMatch && r.players.size < r.capacity) {
        if (!best || r.players.size > best.players.size) best = r;
      }
    }
    if (best) { enterRoom(socket, best, false); return; }
    const id = newCode();
    const r = new Room(io, id, { mode, map: m.map, winRounds: 3, name: `${socket.data.name}의 방` }, hooks);
    rooms.set(id, r);
    enterRoom(socket, r, false);
  });

  socket.on('leaveRoom', () => leaveCurrent(socket));
  socket.on('setTeam', (m) => room()?.setTeam(socket.id, m?.team));
  socket.on('ready', (m) => room()?.setReady(socket.id, m?.ready));
  socket.on('loadout', (m) => {
    socket.data.loadout = m?.loadout;
    room()?.setLoadout(socket.id, m?.loadout);
  });
  socket.on('settings', (m) => room()?.setSettings(socket.id, m || {}));

  // 게임 중 입력
  socket.on('st', (m) => room()?.onState(socket.id, m));
  socket.on('shoot', (m) => room()?.onShoot(socket.id, m));
  socket.on('melee', (m) => room()?.onMelee(socket.id, m));
  socket.on('proj', (m) => room()?.onProj(socket.id, m));
  socket.on('throw', (m) => room()?.onThrow(socket.id, m));
  socket.on('heal', () => room()?.onHeal(socket.id));
  socket.on('taunt', (m) => room()?.onTaunt(socket.id, m?.i));
  socket.on('reloadFx', () => {
    const r = room();
    if (r) socket.to(r.ch).emit('fx', { t: 'reload', by: socket.id });
  });
  socket.on('ping2', (_m, ack) => { if (typeof ack === 'function') ack(Date.now()); });

  socket.on('disconnect', () => {
    leaveCurrent(socket);
    socket.leave('lobby');
    pushLobby();
  });
});

// ─────────────── 게임 루프 ───────────────
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const r of rooms.values()) {
    try { r.tick(dt); } catch (e) { console.error('tick error', r.id, e); }
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
  }
  console.log('');
  console.log('  BLOCK DUEL 서버 실행 중');
  console.log(`  이 컴퓨터:      http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  같은 와이파이:  http://${ip}:${PORT}`);
  console.log('');
});
