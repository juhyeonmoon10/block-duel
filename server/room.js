// 방 하나 = 매치 하나. 라운드 진행, 피격 판정, 투사체 시뮬레이션을 담당합니다.
import { WEAPONS, MAX_HP, sanitizeLoadout, damageAt, minShotGap, maxShotsPerSec } from '../shared/weapons.js';
import { MAPS } from '../shared/maps.js';
import {
  EYE_H, rayMap, rayPlayer, playerBoxes, dist3, norm3, lineOfSight,
} from '../shared/physics.js';

export const T = {
  VS: 3500,
  COUNTDOWN: 3000,
  ROUND_1V1: 75000,
  ROUND_2V2: 90000,
  ROUND_END: 3500,
  MATCH_END: 8000,
};

const TEAM_NAME = ['레드', '블루'];
// 지연 보정: 최근 이 시간 동안 적이 있던 위치 중 어디든 맞으면 인정 (한국↔해외 서버 핑 대비)
const HIST_MS = 1000;
const HIT_MARGIN = 0.55;

// 플레이어가 최근 HIST_MS 동안 있었던 위치들 (현재 포함)
function recentPositions(tgt) {
  const now = Date.now();
  const out = [tgt.p];
  for (let i = tgt.hist.length - 1; i >= 0; i--) {
    const h = tgt.hist[i];
    if (now - h[0] > HIST_MS) break;
    out.push([h[1], h[2], h[3]]);
  }
  return out;
}

export class Room {
  constructor(io, id, opts, hooks) {
    this.io = io;
    this.id = id;
    this.ch = 'r:' + id;
    this.hooks = hooks; // { onMatchEnd(result), onEmpty(room), onChange() }
    this.mode = opts.mode === 2 ? 2 : 1;          // 팀당 인원
    this.mapId = MAPS[opts.map] ? opts.map : 'warehouse';
    this.winRounds = opts.winRounds === 5 ? 5 : 3;
    this.name = opts.name || '방';
    this.hostId = null;
    this.players = new Map();   // id → player
    this.spectators = new Map(); // id → { id, name, socket }
    this.phase = 'waiting';
    this.phaseEnd = 0;
    this.round = 0;
    this.score = [0, 0];
    this.projectiles = [];
    this.smokes = [];
    this.nextProj = 1;
    this.lastResult = null;
  }

  get map() { return MAPS[this.mapId]; }
  get capacity() { return this.mode * 2; }
  get inMatch() { return this.phase !== 'waiting'; }

  // ─────────────── 입장/퇴장 ───────────────
  addPlayer(socket, name, loadout) {
    const counts = this.teamCounts();
    const team = counts[0] <= counts[1] ? 0 : 1;
    const p = {
      id: socket.id, socket, name, team, ready: false,
      loadout: sanitizeLoadout(loadout),
      alive: false, hp: MAX_HP, p: [0, 0, 0], yaw: 0, pitch: 0, w: 'ar', ads: false,
      lastStateAt: 0, shots: {}, lastMelee: 0, utilLeft: 0, hist: [],
      kills: 0, deaths: 0, dmg: 0,
    };
    this.players.set(socket.id, p);
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.ch);
    this.broadcastState();
    return p;
  }

  addSpectator(socket, name) {
    this.spectators.set(socket.id, { id: socket.id, name, socket });
    socket.join(this.ch);
    this.broadcastState();
  }

  remove(socketId) {
    const sock = this.players.get(socketId)?.socket || this.spectators.get(socketId)?.socket;
    if (sock) sock.leave(this.ch);
    this.spectators.delete(socketId);
    const pl = this.players.get(socketId);
    if (!pl) { this.broadcastState(); return; }
    this.players.delete(socketId);

    if (this.hostId === socketId) {
      this.hostId = this.players.size ? this.players.keys().next().value : null;
    }
    if (this.players.size === 0) {
      this.hooks.onEmpty(this);
      return;
    }
    // 경기 중 한 팀이 통째로 나가면 남은 팀 기권승
    if (this.inMatch && this.phase !== 'matchEnd') {
      const counts = this.teamCounts();
      if (counts[pl.team] === 0) {
        this.toast(`${pl.name} 님이 나가서 ${TEAM_NAME[1 - pl.team]} 팀 기권승!`);
        this.endMatch(1 - pl.team, true);
      } else if (this.phase === 'live') {
        this.checkRoundEnd();
      }
    }
    this.broadcastState();
  }

  teamCounts() {
    const c = [0, 0];
    for (const p of this.players.values()) c[p.team]++;
    return c;
  }

  // ─────────────── 대기실 조작 ───────────────
  setTeam(id, team) {
    const p = this.players.get(id);
    if (!p || this.inMatch || (team !== 0 && team !== 1) || p.team === team) return;
    if (this.teamCounts()[team] >= this.mode) return;
    p.team = team;
    p.ready = false;
    this.broadcastState();
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (!p || this.inMatch) return;
    p.ready = !!ready;
    this.broadcastState();
    this.tryStart();
  }

  setLoadout(id, loadout) {
    const p = this.players.get(id);
    if (!p) return;
    p.loadout = sanitizeLoadout(loadout);
    // 카운트다운 중이면 바로 적용
    if (this.phase === 'countdown' && p.alive) {
      p.utilLeft = WEAPONS[p.loadout.utility].count || 0;
      p.socket.emit('loadoutApplied', { loadout: p.loadout, utilLeft: p.utilLeft });
    }
    this.broadcastState();
  }

  setSettings(id, s) {
    if (id !== this.hostId || this.inMatch) return;
    if (s.mode === 1 || s.mode === 2) {
      if (s.mode === 1 && this.players.size > 2) {
        this.whisper(id, '인원이 3명 이상이라 1v1로 바꿀 수 없어요');
      } else {
        this.mode = s.mode;
        // 팀 인원 재정렬
        const c = this.teamCounts();
        for (const p of this.players.values()) {
          if (c[p.team] > this.mode) { c[p.team]--; p.team = 1 - p.team; c[p.team]++; }
        }
      }
    }
    if (MAPS[s.map]) this.mapId = s.map;
    if (s.winRounds === 3 || s.winRounds === 5) this.winRounds = s.winRounds;
    for (const p of this.players.values()) p.ready = false;
    this.broadcastState();
  }

  tryStart() {
    if (this.inMatch) return;
    const c = this.teamCounts();
    if (c[0] !== this.mode || c[1] !== this.mode) return;
    for (const p of this.players.values()) if (!p.ready) return;
    this.startMatch();
  }

  // ─────────────── 경기 흐름 ───────────────
  startMatch() {
    this.score = [0, 0];
    this.round = 0;
    this.lastResult = null;
    for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.dmg = 0; }
    this.setPhase('vs', T.VS);
  }

  beginRound() {
    this.round++;
    this.projectiles = [];
    this.smokes = [];
    const idx = [0, 0];
    for (const p of this.players.values()) {
      const sp = this.map.spawns[p.team][idx[p.team]++ % this.map.spawns[p.team].length];
      p.alive = true;
      p.hp = MAX_HP;
      p.p = sp.p.slice();
      p.yaw = sp.yaw;
      p.pitch = 0;
      p.shots = {};
      p.utilLeft = WEAPONS[p.loadout.utility].count || 0;
      p.lastStateAt = Date.now();
      p.hist = [[Date.now(), p.p[0], p.p[1], p.p[2]]];
      p.socket.emit('spawn', { p: p.p, yaw: p.yaw, loadout: p.loadout, utilLeft: p.utilLeft, round: this.round });
    }
    this.setPhase('countdown', T.COUNTDOWN);
  }

  setPhase(phase, dur) {
    this.phase = phase;
    this.phaseEnd = dur ? Date.now() + dur : 0;
    this.broadcastState();
    this.hooks.onChange();
  }

  checkRoundEnd() {
    if (this.phase !== 'live') return;
    const alive = [0, 0];
    for (const p of this.players.values()) if (p.alive) alive[p.team]++;
    if (alive[0] > 0 && alive[1] > 0) return;
    if (alive[0] === 0 && alive[1] === 0) this.endRound(-1, '무승부');
    else this.endRound(alive[0] > 0 ? 0 : 1, '전멸');
  }

  endRound(winner, reason) {
    if (winner >= 0) this.score[winner]++;
    this.lastResult = { winner, reason, round: this.round };
    this.io.to(this.ch).emit('roundResult', { winner, reason, score: this.score, round: this.round });
    if (winner >= 0 && this.score[winner] >= this.winRounds) {
      this.phase = 'roundEnd';
      setTimeout(() => this.endMatch(winner, false), 1800);
      this.phaseEnd = Date.now() + 1800;
      this.broadcastState();
      return;
    }
    this.setPhase('roundEnd', T.ROUND_END);
  }

  endMatch(winner, forfeit) {
    if (this.phase === 'matchEnd' || this.phase === 'waiting') return;
    const players = [...this.players.values()];
    const result = {
      winner, forfeit, score: this.score.slice(), mode: this.mode,
      players: players.map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, dmg: Math.round(p.dmg) })),
    };
    const lb = this.hooks.onMatchEnd(result);
    result.streaks = lb;
    this.io.to(this.ch).emit('matchResult', result);
    for (const p of players) { p.alive = false; p.ready = false; }
    this.projectiles = [];
    this.setPhase('matchEnd', T.MATCH_END);
  }

  // ─────────────── 플레이어 입력 ───────────────
  onState(id, s) {
    const p = this.players.get(id);
    if (!p || !s || !Array.isArray(s.p)) return;
    if (typeof s.yaw === 'number') p.yaw = s.yaw;
    if (typeof s.pitch === 'number') p.pitch = Math.max(-1.55, Math.min(1.55, s.pitch));
    if (WEAPONS[s.w]) p.w = s.w;
    p.ads = !!s.ads;
    if (!p.alive) return;
    if (this.phase === 'countdown' || this.phase === 'vs') return; // 카운트다운 중엔 위치 고정
    const np = s.p.map(Number);
    if (np.some((v) => !Number.isFinite(v))) return;
    const now = Date.now();
    const dt = Math.min(1, Math.max(0.016, (now - p.lastStateAt) / 1000));
    const horiz = Math.hypot(np[0] - p.p[0], np[2] - p.p[2]);
    // 순간이동 방지 (넉백/로켓점프 감안해서 넉넉하게)
    if (horiz > 32 * dt + 1.5) {
      p.socket.emit('correct', { p: p.p });
      return;
    }
    p.p = np;
    p.lastStateAt = now;
    p.hist.push([now, np[0], np[1], np[2]]);
    while (p.hist.length > 2 && now - p.hist[0][0] > HIST_MS) p.hist.shift();
    if (p.p[1] < this.map.killY) this.kill(p, null, 'fall', false);
  }

  canFire(p, wkey) {
    const w = WEAPONS[wkey];
    if (this.phase !== 'live' || !p.alive || !w) return false;
    if (p.loadout[w.slot] !== wkey) return false;
    const now = Date.now();
    const rec = p.shots[wkey] || (p.shots[wkey] = { last: 0, log: [] });
    if (now - rec.last < minShotGap(w) * 1000 * 0.55) return false;
    rec.log = rec.log.filter((t) => now - t < 1000);
    if (rec.log.length > Math.ceil(maxShotsPerSec(w) * 1.35) + 2) return false;
    rec.last = now;
    rec.log.push(now);
    return true;
  }

  onShoot(id, m) {
    const p = this.players.get(id);
    if (!p || !m || !this.canFire(p, m.w)) return;
    const w = WEAPONS[m.w];
    if (w.kind !== 'gun') return;
    const o = Array.isArray(m.o) ? m.o.map(Number) : null;
    if (!o || o.some((v) => !Number.isFinite(v))) return;
    if (!recentPositions(p).some((q) => dist3(o, [q[0], q[1] + EYE_H, q[2]]) <= 2.5)) return;

    // 다른 사람 화면에 총알 궤적 표시
    const ends = Array.isArray(m.e) ? m.e.slice(0, w.pellets || 1) : [];
    p.socket.to(this.ch).emit('fx', { t: 'shot', by: id, w: m.w, o, e: ends });

    const hits = Array.isArray(m.hits) ? m.hits.slice(0, w.pellets || 1) : [];
    const perTarget = new Map();
    for (const h of hits) {
      const tgt = this.players.get(h?.id);
      if (!tgt || !tgt.alive || tgt.team === p.team) continue;
      const hp = Array.isArray(h.p) ? h.p.map(Number) : null;
      if (!hp || hp.some((v) => !Number.isFinite(v))) continue;
      // 지연 보정 허용범위: 서버가 알고 있는 위치 근처여야 인정
      const M = HIT_MARGIN;
      const near = recentPositions(tgt).some((pos) => playerBoxes(pos).some((b) =>
        hp[0] > b.min[0] - M && hp[0] < b.max[0] + M &&
        hp[1] > b.min[1] - M - 0.4 && hp[1] < b.max[1] + M &&
        hp[2] > b.min[2] - M && hp[2] < b.max[2] + M));
      if (!near) continue;
      if (!lineOfSight(o, hp, this.map.boxes)) continue;
      if (this.blockedBySmoke(o, hp) && w.scope) continue;
      const d = dist3(o, hp);
      const head = h.zone === 'head';
      const dmg = damageAt(w, d) * (head ? w.head : 1);
      const acc = perTarget.get(tgt) || { dmg: 0, head: false };
      acc.dmg += dmg;
      acc.head = acc.head || head;
      perTarget.set(tgt, acc);
    }
    for (const [tgt, acc] of perTarget) this.damage(tgt, acc.dmg, p, m.w, acc.head, o);
  }

  onMelee(id, m) {
    const p = this.players.get(id);
    if (!p || !m || this.phase !== 'live' || !p.alive) return;
    const w = WEAPONS[m.w];
    if (!w || w.kind !== 'melee' || p.loadout.melee !== m.w) return;
    const now = Date.now();
    if (now - p.lastMelee < w.rate * 1000 * 0.6) return;
    p.lastMelee = now;
    p.socket.to(this.ch).emit('fx', { t: 'melee', by: id, w: m.w });
    const eye = [p.p[0], p.p[1] + EYE_H, p.p[2]];
    const ids = Array.isArray(m.hits) ? m.hits.slice(0, 3) : [];
    for (const tid of ids) {
      const tgt = this.players.get(tid);
      if (!tgt || !tgt.alive || tgt.team === p.team) continue;
      let chest = null, best = Infinity;
      for (const q of recentPositions(tgt)) {
        const c = [q[0], q[1] + 1.1, q[2]], dd = dist3(eye, c);
        if (dd < best) { best = dd; chest = c; }
      }
      if (best > w.range + 1.2) continue;
      if (!lineOfSight(eye, chest, this.map.boxes)) continue;
      const dir = norm3([tgt.p[0] - p.p[0], 0, tgt.p[2] - p.p[2]]);
      this.damage(tgt, w.dmg, p, m.w, false, eye);
      if (tgt.alive && w.knock) {
        tgt.socket.emit('knock', { v: [dir[0] * w.knock, 3 + w.knock * 0.35, dir[2] * w.knock] });
      }
    }
  }

  onProj(id, m) {
    const p = this.players.get(id);
    if (!p || !m) return;
    const w = WEAPONS[m.w];
    if (!w || w.kind !== 'proj' || !this.canFire(p, m.w)) return;
    const o = this.validOrigin(p, m.o);
    const d = this.validDir(m.d);
    if (!o || !d) return;
    this.spawnProj(p, m.w, w.proj, o, [d[0] * w.projSpeed, d[1] * w.projSpeed, d[2] * w.projSpeed]);
    p.socket.to(this.ch).emit('fx', { t: 'fire', by: id, w: m.w });
  }

  onThrow(id, m) {
    const p = this.players.get(id);
    if (!p || !m || this.phase !== 'live' || !p.alive) return;
    const w = WEAPONS[m.w];
    if (!w || w.kind !== 'throw' || p.loadout.utility !== m.w || p.utilLeft <= 0) return;
    const o = this.validOrigin(p, m.o);
    const d = this.validDir(m.d);
    if (!o || !d) return;
    p.utilLeft--;
    const s = w.throwSpeed;
    this.spawnProj(p, m.w, w.proj, o, [d[0] * s, d[1] * s + 3.2, d[2] * s]);
    p.socket.emit('util', { left: p.utilLeft });
    p.socket.to(this.ch).emit('fx', { t: 'throw', by: id, w: m.w });
  }

  onHeal(id) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'live' || !p.alive) return;
    const w = WEAPONS[p.loadout.utility];
    if (w.kind !== 'heal' || p.utilLeft <= 0 || p.hp >= MAX_HP) return;
    p.utilLeft--;
    p.hp = Math.min(MAX_HP, p.hp + w.heal);
    p.socket.emit('util', { left: p.utilLeft });
    p.socket.emit('healed', { hp: p.hp });
    this.io.to(this.ch).emit('fx', { t: 'heal', by: id });
  }

  onTaunt(id, i) {
    const p = this.players.get(id);
    if (!p) return;
    const n = Number(i) | 0;
    this.io.to(this.ch).emit('fx', { t: 'taunt', by: id, i: Math.max(0, Math.min(5, n)) });
  }

  validOrigin(p, o) {
    if (!Array.isArray(o)) return null;
    const v = o.map(Number);
    if (v.some((x) => !Number.isFinite(x))) return null;
    const eye = [p.p[0], p.p[1] + EYE_H, p.p[2]];
    return dist3(v, eye) <= 3 ? v : eye;
  }

  validDir(d) {
    if (!Array.isArray(d)) return null;
    const v = d.map(Number);
    if (v.some((x) => !Number.isFinite(x))) return null;
    if (Math.hypot(v[0], v[1], v[2]) < 1e-6) return null;
    return norm3(v);
  }

  // ─────────────── 데미지 ───────────────
  damage(tgt, amount, attacker, wkey, head, from) {
    if (!tgt.alive || this.phase !== 'live') return;
    const dmg = Math.max(1, Math.round(amount));
    tgt.hp -= dmg;
    if (attacker && attacker !== tgt) attacker.dmg += dmg;
    const kill = tgt.hp <= 0;
    tgt.socket.emit('hurt', { by: attacker?.id || null, dmg, from, hp: Math.max(0, tgt.hp) });
    if (attacker && attacker !== tgt) {
      attacker.socket.emit('hit', { id: tgt.id, dmg, head, kill, p: [tgt.p[0], tgt.p[1] + (head ? 1.7 : 1.1), tgt.p[2]] });
    }
    if (kill) this.kill(tgt, attacker, wkey, head);
  }

  kill(victim, killer, wkey, head) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    if (killer && killer !== victim) killer.kills++;
    this.io.to(this.ch).emit('kill', {
      k: killer && killer !== victim ? killer.id : null,
      v: victim.id, w: wkey, head: !!head,
    });
    this.checkRoundEnd();
  }

  // ─────────────── 투사체 ───────────────
  spawnProj(owner, wkey, type, o, v) {
    const w = WEAPONS[wkey];
    this.projectiles.push({
      id: this.nextProj++, type, w: wkey, owner: owner.id, team: owner.team,
      p: o.slice(), v, born: Date.now(), fuseAt: w.fuse ? Date.now() + w.fuse * 1000 : 0,
    });
  }

  stepProjectiles(dt) {
    const now = Date.now();
    const boxes = this.map.boxes;
    const keep = [];
    for (const pr of this.projectiles) {
      if (pr.type === 'rocket') {
        const len = Math.hypot(pr.v[0], pr.v[1], pr.v[2]) * dt;
        const dir = norm3(pr.v);
        let hitT = rayMap(pr.p, dir, len, boxes).t;
        let exploded = hitT < len;
        // 적 직격
        for (const pl of this.players.values()) {
          if (!pl.alive) continue;
          if (pl.id === pr.owner && now - pr.born < 250) continue;
          if (pl.team === pr.team && pl.id !== pr.owner) continue;
          const r = rayPlayer(pr.p, dir, pl.p, len + 0.25);
          if (r && r.t < hitT + 0.001) { hitT = r.t; exploded = true; }
        }
        if (exploded || now - pr.born > 4000) {
          const at = [pr.p[0] + dir[0] * (hitT - 0.15), pr.p[1] + dir[1] * (hitT - 0.15), pr.p[2] + dir[2] * (hitT - 0.15)];
          this.explode(at, pr.w, pr.owner);
          continue;
        }
        pr.p = [pr.p[0] + dir[0] * len, pr.p[1] + dir[1] * len, pr.p[2] + dir[2] * len];
        keep.push(pr);
      } else {
        // 수류탄/연막: 중력 + 튕김
        pr.v[1] -= 22 * dt;
        for (let ax = 0; ax < 3; ax++) {
          const prev = pr.p[ax];
          pr.p[ax] += pr.v[ax] * dt;
          for (const b of boxes) {
            if (pr.p[0] > b.min[0] - 0.12 && pr.p[0] < b.max[0] + 0.12 &&
                pr.p[1] > b.min[1] - 0.12 && pr.p[1] < b.max[1] + 0.12 &&
                pr.p[2] > b.min[2] - 0.12 && pr.p[2] < b.max[2] + 0.12) {
              pr.p[ax] = prev;
              pr.v[ax] *= -0.42;
              for (let o = 0; o < 3; o++) if (o !== ax) pr.v[o] *= 0.82;
              break;
            }
          }
        }
        if (now >= pr.fuseAt || pr.p[1] < this.map.killY) {
          if (pr.type === 'grenade') this.explode(pr.p, pr.w, pr.owner);
          else if (pr.type === 'smoke') this.popSmoke(pr.p, pr.w);
          continue;
        }
        keep.push(pr);
      }
    }
    this.projectiles = keep;
    this.smokes = this.smokes.filter((s) => s.until > now);
  }

  explode(at, wkey, ownerId) {
    const w = WEAPONS[wkey];
    const owner = this.players.get(ownerId);
    this.io.to(this.ch).emit('fx', { t: 'boom', p: at, r: w.radius, w: wkey });
    if (this.phase !== 'live') return;
    for (const pl of [...this.players.values()]) {
      if (!pl.alive) continue;
      const self = pl.id === ownerId;
      if (!self && owner && pl.team === owner.team) continue;
      const center = [pl.p[0], pl.p[1] + 0.9, pl.p[2]];
      const head = [pl.p[0], pl.p[1] + 1.6, pl.p[2]];
      const d = Math.min(dist3(at, center), dist3(at, head));
      if (d > w.radius) continue;
      if (!lineOfSight(at, center, this.map.boxes) && !lineOfSight(at, head, this.map.boxes)) continue;
      const k = Math.max(0, Math.min(1, 1 - Math.max(0, d - 0.8) / (w.radius - 0.8)));
      let dmg = w.dmg * (0.2 + 0.8 * k);
      if (self) dmg *= w.selfDmg ?? 0.5;
      const dir = norm3([center[0] - at[0], center[1] - at[1] + 0.6, center[2] - at[2]]);
      const kn = (w.knock || 8) * (0.45 + 0.55 * k);
      pl.socket.emit('knock', { v: [dir[0] * kn, Math.max(2, dir[1] * kn), dir[2] * kn] });
      this.damage(pl, dmg, owner || null, wkey, false, at);
    }
  }

  popSmoke(at, wkey) {
    const w = WEAPONS[wkey];
    const s = { p: at, r: w.radius, until: Date.now() + w.duration * 1000 };
    this.smokes.push(s);
    this.io.to(this.ch).emit('fx', { t: 'smoke', p: at, r: w.radius, dur: w.duration });
  }

  blockedBySmoke(a, b) {
    for (const s of this.smokes) {
      // 선분-구 교차
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((s.p[0] - a[0]) * ab[0] + (s.p[1] - a[1]) * ab[1] + (s.p[2] - a[2]) * ab[2]) / len2));
      const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      if (dist3(c, s.p) < s.r * 0.8) return true;
    }
    return false;
  }

  // ─────────────── 틱 ───────────────
  tick(dt) {
    const now = Date.now();
    switch (this.phase) {
      case 'vs':
        if (now >= this.phaseEnd) this.beginRound();
        break;
      case 'countdown':
        if (now >= this.phaseEnd) {
          const dur = this.mode === 2 ? T.ROUND_2V2 : T.ROUND_1V1;
          this.setPhase('live', dur);
          this.io.to(this.ch).emit('fight', { round: this.round });
        }
        break;
      case 'live':
        if (now >= this.phaseEnd) {
          // 시간 종료: 남은 체력 합이 많은 팀 승
          const hp = [0, 0];
          for (const p of this.players.values()) if (p.alive) hp[p.team] += p.hp;
          if (hp[0] === hp[1]) this.endRound(-1, '시간 초과 무승부');
          else this.endRound(hp[0] > hp[1] ? 0 : 1, '시간 초과 (체력 우세)');
        }
        break;
      case 'roundEnd':
        if (now >= this.phaseEnd && !(this.score[0] >= this.winRounds || this.score[1] >= this.winRounds)) this.beginRound();
        break;
      case 'matchEnd':
        if (now >= this.phaseEnd) {
          this.phase = 'waiting';
          this.phaseEnd = 0;
          this.broadcastState();
          this.hooks.onChange();
        }
        break;
    }
    this.stepProjectiles(dt);
    this.sendSnapshot();
  }

  sendSnapshot() {
    if (this.phase === 'waiting') return;
    const ps = [];
    for (const p of this.players.values()) {
      ps.push([p.id, +p.p[0].toFixed(3), +p.p[1].toFixed(3), +p.p[2].toFixed(3), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.w, p.alive ? 1 : 0, Math.max(0, Math.round(p.hp)), p.ads ? 1 : 0]);
    }
    const pr = this.projectiles.map((q) => [q.id, q.type, +q.p[0].toFixed(2), +q.p[1].toFixed(2), +q.p[2].toFixed(2)]);
    this.io.to(this.ch).volatile.emit('snap', { t: Date.now(), ps, pr });
  }

  // ─────────────── 상태 전송 ───────────────
  publicState() {
    return {
      id: this.id, name: this.name, mode: this.mode, map: this.mapId, winRounds: this.winRounds,
      host: this.hostId, phase: this.phase, phaseEnd: this.phaseEnd, now: Date.now(),
      round: this.round, score: this.score, lastResult: this.lastResult,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team, ready: p.ready, loadout: p.loadout,
        alive: p.alive, hp: Math.max(0, Math.round(p.hp)), kills: p.kills, deaths: p.deaths,
        streak: this.hooks.streakOf?.(p.name) || 0,
      })),
      h2h: this.mode === 1 && this.players.size === 2 ? this.headToHead() : null,
      spectators: [...this.spectators.values()].map((s) => ({ id: s.id, name: s.name })),
    };
  }

  headToHead() {
    const [a, b] = [...this.players.values()];
    const rec = this.hooks.h2h?.(a.name, b.name);
    if (!rec) return null;
    return { [a.id]: rec[a.name] || 0, [b.id]: rec[b.name] || 0 };
  }

  lobbyInfo() {
    return {
      id: this.id, name: this.name, mode: this.mode, map: this.mapId,
      players: this.players.size, max: this.capacity, phase: this.phase,
      names: [...this.players.values()].map((p) => p.name),
      score: this.score,
    };
  }

  broadcastState() {
    this.io.to(this.ch).emit('room', this.publicState());
  }

  toast(msg) { this.io.to(this.ch).emit('toast', { msg }); }
  whisper(id, msg) { this.players.get(id)?.socket.emit('toast', { msg }); }
}
