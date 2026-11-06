// 3D 게임 본체: 렌더링, 내 캐릭터 조작, 총기 로직, 다른 플레이어 보간, 이펙트
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS, MAX_HP, SLOTS } from '/shared/weapons.js';
import { MAPS } from '/shared/maps.js';
import {
  EYE_H, JUMP_V, WALK_SPEED, moveAndCollide, rayMap, rayPlayer, lookDir, lineOfSight,
} from '/shared/physics.js';
import * as A from './audio.js';
import { buildViewmodel, buildAvatar, setAvatarWeapon, makeNameTag, drawNameTag, animateAvatar } from './models.js';
import * as AS from './assets.js';
import { SKINS } from './mapskin.js';
import { esc } from './hud.js';

export const TEAM_COLOR = ['#ff4b3e', '#2f7bff'];
export const TEAM_DARK = ['#b8291f', '#1d4fae'];
export const TEAM_NAME = ['레드', '블루'];
export const TAUNTS = ['ㅋㅋㅋ', 'GG', '나이스 샷', '덤벼라', '한 판 더?', '이게 실력이지'];
const INTERP_MS = 100;
const SEND_HZ = 30;
const SWAP_TIME = 0.32;

// ─────────────── 블록 텍스처 & 맵 메시 ───────────────
let blockTex = null;
function getBlockTexture() {
  if (blockTex) return blockTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const v = 232 + Math.floor(rnd() * 23);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.floor(rnd() * 16) * 4, Math.floor(rnd() * 16) * 4, 4, 4);
  }
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, 60, 64, 4); g.fillRect(60, 0, 4, 64);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 0, 3, 64);
  blockTex = new THREE.CanvasTexture(c);
  blockTex.wrapS = blockTex.wrapT = THREE.RepeatWrapping;
  blockTex.magFilter = THREE.NearestFilter;
  blockTex.colorSpace = THREE.SRGBColorSpace;
  blockTex.anisotropy = 4;
  return blockTex;
}

function worldBoxGeometry(b) {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z, y);
    else if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  return g;
}

// ─────────────── 파티클 (작은 큐브) ───────────────
class Particles {
  constructor(scene, n = 160) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();
    this.list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, this.mat('#ffffff'));
      m.visible = false;
      scene.add(m);
      this.list.push({ m, v: new THREE.Vector3(), life: 0, max: 1, g: 0, s: 0.1 });
    }
    this.i = 0;
  }
  mat(c) {
    if (!this.mats.has(c)) this.mats.set(c, new THREE.MeshBasicMaterial({ color: c }));
    return this.mats.get(c);
  }
  spawn(p, color, count, speed = 3, size = 0.1, life = 0.5, grav = 9) {
    for (let k = 0; k < count; k++) {
      const q = this.list[this.i++ % this.list.length];
      q.m.material = this.mat(Array.isArray(color) ? color[k % color.length] : color);
      q.m.position.set(p[0], p[1], p[2]);
      q.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      q.life = q.max = life * (0.6 + Math.random() * 0.6);
      q.g = grav;
      q.s = size * (0.6 + Math.random() * 0.8);
      q.m.scale.setScalar(q.s);
      q.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      q.m.visible = true;
    }
  }
  update(dt) {
    for (const q of this.list) {
      if (!q.m.visible) continue;
      q.life -= dt;
      if (q.life <= 0) { q.m.visible = false; continue; }
      q.v.y -= q.g * dt;
      q.m.position.addScaledVector(q.v, dt);
      q.m.scale.setScalar(q.s * Math.min(1, q.life / q.max * 1.5));
    }
  }
  clear() { for (const q of this.list) q.m.visible = false; }
}

// ─────────────── 총알 궤적 ───────────────
class Tracers {
  constructor(scene, n = 48) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.list = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#fff3a3', transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(this.geo, mat);
      m.visible = false;
      scene.add(m);
      this.list.push({ m, life: 0, max: 0.1 });
    }
    this.i = 0;
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }
  spawn(a, b, color = '#fff3a3', width = 0.03, life = 0.09) {
    const q = this.list[this.i++ % this.list.length];
    this._a.set(a[0], a[1], a[2]);
    this._b.set(b[0], b[1], b[2]);
    const len = this._a.distanceTo(this._b);
    if (len < 0.05) return;
    q.m.position.copy(this._a).lerp(this._b, 0.5);
    q.m.lookAt(this._b);
    q.m.scale.set(width, width, len);
    q.m.material.color.set(color);
    q.m.material.opacity = 0.9;
    q.m.visible = true;
    q.life = q.max = life;
  }
  update(dt) {
    for (const q of this.list) {
      if (!q.m.visible) continue;
      q.life -= dt;
      if (q.life <= 0) { q.m.visible = false; continue; }
      q.m.material.opacity = 0.9 * (q.life / q.max);
    }
  }
  clear() { for (const q of this.list) q.m.visible = false; }
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function spreadDir(d, s) {
  if (s <= 0) return d.slice();
  // d에 수직인 두 벡터
  const up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let r = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  let l = Math.hypot(...r); r = r.map((v) => v / l);
  const u = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
  const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * s;
  const ca = Math.cos(a) * m, sa = Math.sin(a) * m;
  const o = [d[0] + r[0] * ca + u[0] * sa, d[1] + r[1] * ca + u[1] * sa, d[2] + r[2] * ca + u[2] * sa];
  l = Math.hypot(...o);
  return o.map((v) => v / l);
}
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);

// ═══════════════════════════════ 게임 ═══════════════════════════════
export class Game {
  constructor({ canvas, hud, socket, settings }) {
    this.canvas = canvas;
    this.hud = hud;
    this.socket = socket;
    this.settings = settings;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov || 80, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight('#e6f3ff', '#8a7f72', 2.1);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
    sun.position.set(18, 34, 12);
    sun.castShadow = true;
    sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(this.hemi, sun, sun.target);

    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight('#ffffff', '#5d6474', 2.2));
    const vs = new THREE.DirectionalLight('#fff4e0', 2.4);
    vs.position.set(0.4, 1, 0.5);
    const vr = new THREE.DirectionalLight('#a8c8ff', 0.9);
    vr.position.set(-0.6, 0.3, -0.4);
    this.viewScene.add(vr);
    this.viewScene.add(vs);
    this.viewRoot = new THREE.Group();
    this.viewScene.add(this.viewRoot);
    const flashMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95 });
    this.vmFlash = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), flashMat);
    this.vmFlash.visible = false;

    this.mapGroup = null;
    this.mapId = null;
    this.boxes = [];
    this.players = new Map();
    this.meId = null;
    this.me = { team: 0, name: '' };
    this.room = null;
    this.spectator = false;
    this.phase = 'waiting';
    this.timeOffset = 0;

    this.L = { p: [0, 0, 0], v: [0, 0, 0], onGround: false, yaw: 0, pitch: 0, alive: false, hp: MAX_HP };
    this.weap = null;
    this.loadout = null;
    this.utilLeft = 0;

    this.keys = new Set();
    this.mouse = { l: false, r: false, lp: false, rp: false };
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.locked = false;

    this.particles = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.booms = [];
    this.smokes = [];
    this.projMeshes = new Map();
    this.remoteFlashes = [];
    this.shake = 0;
    this.bob = 0;
    this.sendAcc = 0;
    this.spec = { idx: 0, overview: false, pos: new THREE.Vector3(), init: false };
    this.deathAt = 0;
    this.killerId = null;
    this.tauntOpen = false;
    this.tauntCd = 0;
    this.lastCount = null;
    this.landDip = 0;
    this.running = false;
    this.lastT = performance.now();
    this.scoreboardOpen = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.buildClouds();
  }

  // ─────────────── 기본 ───────────────
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 1) * (this.settings.quality || 1);
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = w / h;
    this.viewCam.updateProjectionMatrix();
  }

  applySettings(s) {
    this.settings = s;
    this.resize();
    this.applyShadows();
  }

  applyShadows() {
    const q = this.settings.quality || 1;
    const on = q >= 0.99;
    if (this.renderer.shadowMap.enabled !== on) {
      this.renderer.shadowMap.enabled = on;
      this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
    }
    const size = 1024;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  serverNow() { return Date.now() + this.timeOffset; }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      try { this.frame(dt, t); } catch (e) { console.error(e); }
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  buildClouds() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.9 });
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(6 + rnd() * 12, 1.5 + rnd() * 1.5, 4 + rnd() * 8), m);
      const a = rnd() * Math.PI * 2, r = 50 + rnd() * 70;
      c.position.set(Math.cos(a) * r, 34 + rnd() * 18, Math.sin(a) * r);
      g.add(c);
    }
    this.clouds = g;
    this.scene.add(g);
  }

  // ─────────────── 맵 ───────────────
  loadMap(id, force) {
    if (this.mapId === id && !force) return;
    const map = MAPS[id];
    if (!map) return;
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.mapId = id;
    this.map = map;
    this.boxes = map.boxes;
    const skin = SKINS[id] || { colors: {}, deco: [] };
    this.mapTextured = !!AS.tex('concrete');
    const group = new THREE.Group();
    // 1) 색깔별로 합친 텍스처 박스
    const byColor = new Map();
    for (const b of map.boxes) {
      if (b.p && this.mapTextured) continue; // 소품이 대신 그려짐
      if (!byColor.has(b.c)) byColor.set(b.c, []);
      byColor.get(b.c).push(worldBoxGeometry(b));
    }
    for (const [color, geos] of byColor) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this.mapMaterial(color, skin.colors[color]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // 2) 충돌 박스 크기에 맞춘 3D 소품
    const props = map.boxes.filter((b) => b.p).map((b) => ({ prop: b.p, box: [b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]] }));
    // 3) 장식 (충돌 없음)
    for (const d of skin.deco || []) {
      if (d.glow) {
        const [x0, y0, z0, x1, y1, z1] = d.box;
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshBasicMaterial({ color: d.glow }));
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        group.add(m);
      } else props.push(d);
    }
    if (this.mapTextured) this.placeProps(group, props, id);
    this.mapGroup = group;
    this.scene.add(group);
    this.scene.background = this.skyTexture(skin.sky || [map.sky, map.fog]);
    this.scene.fog = new THREE.Fog(skin.sky ? skin.sky[1] : map.fog, map.fogNear + 10, map.fogFar + 30);
    this.applyShadows();
  }

  mapMaterial(color, sk) {
    if (!this.mapTextured || !sk) {
      return new THREE.MeshLambertMaterial({ color, map: getBlockTexture() });
    }
    if (sk.color) return new THREE.MeshLambertMaterial({ color: sk.color });
    const base = AS.tex(sk.t);
    if (!base) return new THREE.MeshLambertMaterial({ color, map: getBlockTexture() });
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(sk.s || 1, sk.s || 1);
    return new THREE.MeshLambertMaterial({ color: sk.tint || '#ffffff', map: t });
  }

  async placeProps(group, list, id) {
    for (const d of list) {
      const obj = await AS.getProp(d.prop).catch(() => null);
      if (!obj || this.mapId !== id) return;
      const holder = new THREE.Group();
      holder.add(obj);
      obj.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(obj);
      const bs = bb.getSize(new THREE.Vector3());
      let w, h, dpt, cx, cz, y0;
      if (d.box) {
        const [x0, yy0, z0, x1, y1, z1] = d.box;
        w = x1 - x0; h = y1 - yy0; dpt = z1 - z0; cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; y0 = yy0;
      } else {
        [w, h, dpt] = d.size; [cx, y0, cz] = d.at;
      }
      // 소품의 긴 쪽을 박스의 긴 쪽에 맞춤
      let rot = d.rot || 0;
      const propLongZ = bs.z >= bs.x, boxLongZ = dpt >= w;
      if (d.box && propLongZ !== boxLongZ) rot += Math.PI / 2;
      const swap = Math.abs(Math.sin(rot)) > 0.7;
      const sx = (swap ? dpt : w) / bs.x, sz = (swap ? w : dpt) / bs.z, sy = h / bs.y;
      obj.scale.set(sx, sy, sz);
      obj.position.set(-((bb.min.x + bb.max.x) / 2) * sx, -bb.min.y * sy, -((bb.min.z + bb.max.z) / 2) * sz);
      holder.rotation.y = rot;
      holder.position.set(cx, y0, cz);
      group.add(holder);
    }
  }

  skyTexture([top, bottom]) {
    const key = top + bottom;
    if (this._skyKey === key) return this._sky;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(0.62, bottom); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this._sky = t; this._skyKey = key;
    return t;
  }

  // 에셋 로딩이 끝난 뒤 다시 그리기
  onAssetsReady() {
    if (this.mapId) this.loadMap(this.mapId, true);
    for (const rp of this.players.values()) rp.rebuild = true;
    if (this.room) this.setRoom(this.room, this.meId, this.spectator);
    if (this.loadout && this.L.alive) this.setupWeapons(this.loadout, this.utilLeft);
  }

  // ─────────────── 방/플레이어 목록 ───────────────
  setRoom(room, meId, spectator) {
    this.room = room;
    this.meId = meId;
    this.spectator = spectator;
    this.timeOffset = room.now - Date.now();
    const prevPhase = this.phase;
    this.phase = room.phase;
    this.loadMap(room.map);

    const seen = new Set();
    for (const p of room.players) {
      seen.add(p.id);
      if (p.id === meId) { this.me = p; continue; }
      let rp = this.players.get(p.id);
      if (!rp) {
        rp = { id: p.id, buf: [], rp: [0, -100, 0], yaw: 0, pitch: 0, alive: false, hp: MAX_HP, w: 'ar', walk: 0, taunt: null, tauntUntil: 0, swing: 0, prevP: null };
        this.players.set(p.id, rp);
      }
      if (rp.team !== p.team || !rp.avatar || rp.rebuild) {
        rp.rebuild = false;
        if (rp.avatar) { this.scene.remove(rp.avatar); if (rp.flash) this.scene.remove(rp.flash); }
        rp.avatar = buildAvatar(TEAM_COLOR[p.team], TEAM_DARK[p.team]);
        rp.tag = makeNameTag();
        rp.avatar.add(rp.tag);
        rp.avatar.visible = false;
        rp.avatar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(rp.avatar);
        rp.flash = this.vmFlash.clone();
        rp.flash.material = this.vmFlash.material;
        rp.flash.scale.setScalar(rp.avatar.userData.skinned ? 1.1 : 1.6);
        this.scene.add(rp.flash);
      }
      rp.name = p.name;
      rp.team = p.team;
      rp.kills = p.kills;
    }
    for (const [id, rp] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(rp.avatar);
        this.scene.remove(rp.flash);
        this.players.delete(id);
      }
    }
    // 팀원 이름표는 벽 너머로도 보이게
    for (const rp of this.players.values()) {
      const mate = !spectator && rp.team === this.me.team;
      rp.tag.material.depthTest = !mate;
    }
    if (prevPhase !== this.phase) this.onPhase(prevPhase, this.phase);
    this.updateScoreHud();
  }

  onPhase(prev, phase) {
    if (phase === 'countdown') {
      this.lastCount = null;
      const ms = this.room.score.map((s) => s === this.room.winRounds - 1);
      if (ms[0] && ms[1]) this.hud.center(`라운드 ${this.room.round}`, '결승 라운드! 이기면 끝', 'gold', 1200);
      else if (ms[0] || ms[1]) this.hud.center(`라운드 ${this.room.round}`, `${TEAM_NAME[ms[0] ? 0 : 1]} 팀 매치 포인트`, 'gold', 1200);
      else this.hud.center(`라운드 ${this.room.round}`, '', '', 1200);
    }
    if (phase === 'waiting' || phase === 'matchEnd') {
      this.clearEffects();
      this.hud.death(null);
      this.hud.spectate(null);
      this.hud.scope(false);
      this.hud.progress('', -1);
      this.L.alive = false;
    }
  }

  updateScoreHud() {
    if (!this.room) return;
    const all = this.room.players;
    this.hud.score(this.room, all);
  }

  playerInfo(id) {
    if (id === this.meId) return this.me;
    return this.room?.players.find((p) => p.id === id) || null;
  }

  // ─────────────── 스폰 & 무기 ───────────────
  onSpawn(sp) {
    this.clearEffects();
    const L = this.L;
    L.p = sp.p.slice();
    L.v = [0, 0, 0];
    L.yaw = sp.yaw;
    L.pitch = 0;
    L.alive = true;
    L.hp = MAX_HP;
    L.onGround = true;
    this.deathAt = 0;
    this.killerId = null;
    this.hud.death(null);
    this.hud.spectate(null);
    this.hud.setHp(MAX_HP);
    this.setupWeapons(sp.loadout, sp.utilLeft);
  }

  setupWeapons(loadout, utilLeft) {
    this.loadout = { ...loadout };
    this.utilLeft = utilLeft;
    const slots = {};
    for (const s of SLOTS) {
      const key = loadout[s];
      const w = WEAPONS[key];
      slots[s] = { key, w, ammo: w.mag || 0 };
    }
    // 1인칭 모델
    this.viewRoot.clear();
    this.viewmodels = {};
    for (const s of SLOTS) {
      const vm = buildViewmodel(loadout[s], TEAM_COLOR[this.me.team || 0]);
      vm.visible = false;
      this.viewRoot.add(vm);
      this.viewmodels[s] = vm;
    }
    this.weap = {
      slots, cur: 'primary', prev: 'secondary', swapT: SWAP_TIME, reloadT: 0, fireCd: 0,
      burstLeft: 0, burstT: 0, adsT: 0, spin: 0, bloom: 0, kick: 0, healT: -1, swingT: 0, meleeCd: 0, throwT: 0,
    };
    this.equip('primary', true);
  }

  equip(slot, force) {
    const W = this.weap;
    if (!W || (!force && W.cur === slot)) return;
    if (slot === 'utility' && this.utilLeft <= 0) { A.dryFire(); return; }
    if (!force) W.prev = W.cur;
    W.cur = slot;
    W.swapT = SWAP_TIME;
    W.reloadT = 0;
    W.burstLeft = 0;
    W.healT = -1;
    W.spin = 0;
    for (const s of SLOTS) this.viewmodels[s].visible = s === slot;
    const vm = this.viewmodels[slot];
    if (vm.userData.muzzle) { vm.userData.muzzle.add(this.vmFlash); }
    this.hud.progress('', -1);
    this.hud.setReload(-1);
    A.swap();
  }

  get curW() { return this.weap ? this.weap.slots[this.weap.cur] : null; }

  // ─────────────── 서버 이벤트 ───────────────
  onSnap(s) {
    this.timeOffset = this.timeOffset * 0.9 + (s.t - Date.now()) * 0.1;
    const now = performance.now();
    for (const e of s.ps) {
      const [id, x, y, z, yaw, pitch, w, alive, hp, ads] = e;
      if (id === this.meId) {
        if (!alive && this.L.alive && this.phase === 'live') this.L.alive = false;
        if (alive && Math.abs(hp - this.L.hp) > 0.5 && this.L.alive) { this.L.hp = hp; this.hud.setHp(hp); }
        continue;
      }
      const rp = this.players.get(id);
      if (!rp) continue;
      const last = rp.buf[rp.buf.length - 1];
      if (last && (Math.hypot(x - last.p[0], y - last.p[1], z - last.p[2]) > 6 || (!last.alive && alive))) rp.buf.length = 0;
      rp.buf.push({ t: now, p: [x, y, z], yaw, pitch, w, alive: !!alive, hp, ads: !!ads });
      while (rp.buf.length > 2 && now - rp.buf[1].t > 1000) rp.buf.shift();
    }
    // 투사체
    const seen = new Set();
    for (const [id, type, x, y, z] of s.pr) {
      seen.add(id);
      let m = this.projMeshes.get(id);
      if (!m) {
        m = this.makeProjMesh(type);
        m.position.set(x, y, z);
        m.userData.target = new THREE.Vector3(x, y, z);
        m.userData.type = type;
        this.scene.add(m);
        this.projMeshes.set(id, m);
      }
      m.userData.target.set(x, y, z);
    }
    for (const [id, m] of this.projMeshes) {
      if (!seen.has(id)) { this.scene.remove(m); this.projMeshes.delete(id); }
    }
  }

  makeProjMesh(type) {
    const g = new THREE.Group();
    if (type === 'rocket') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.55), new THREE.MeshBasicMaterial({ color: '#d64545' }));
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.12), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
      glow.position.z = 0.32;
      g.add(body, glow);
    } else if (type === 'grenade') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), new THREE.MeshLambertMaterial({ color: '#4f6b3a' })));
    } else {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 8), new THREE.MeshLambertMaterial({ color: '#9aa1ad' })));
    }
    return g;
  }

  onFx(fx) {
    const cam = this.camera.position.toArray();
    switch (fx.t) {
      case 'shot': {
        const rp = this.players.get(fx.by);
        const w = WEAPONS[fx.w];
        const start = rp ? this.remoteMuzzle(rp) : fx.o;
        const sp = A.spatial(fx.o, cam, this.camYaw || 0);
        A.gunshot(w?.snd, sp.vol, sp.pan);
        for (const e of fx.e || []) {
          this.tracers.spawn(start, e, '#fff3a3', w?.pellets ? 0.02 : 0.035);
          this.particles.spawn(e, '#cfcfcf', 2, 1.5, 0.06, 0.3, 4);
        }
        if (rp) { rp.flashT = 0.05; rp.kick = 1; }
        break;
      }
      case 'fire': {
        const rp = this.players.get(fx.by);
        if (rp) {
          const sp = A.spatial(rp.rp, cam, this.camYaw || 0);
          A.rocketLaunch(sp.vol, sp.pan);
          rp.flashT = 0.08;
        }
        break;
      }
      case 'boom': this.explode(fx.p, fx.r, cam); break;
      case 'smoke': this.addSmoke(fx.p, fx.r, fx.dur, cam); break;
      case 'melee': {
        const rp = this.players.get(fx.by);
        if (rp) {
          rp.swing = 1;
          rp.swingTrig = true;
          const sp = A.spatial(rp.rp, cam, this.camYaw || 0);
          A.swing(sp.vol, sp.pan);
        }
        break;
      }
      case 'throw': {
        const rp = this.players.get(fx.by);
        if (rp) {
          rp.throwTrig = true;
          const sp = A.spatial(rp.rp, cam, this.camYaw || 0);
          A.throwSound(sp.vol, sp.pan);
        }
        break;
      }
      case 'reload': {
        const rp = this.players.get(fx.by);
        if (rp) {
          const sp = A.spatial(rp.rp, cam, this.camYaw || 0);
          A.reload(sp.vol * 0.7, sp.pan);
        }
        break;
      }
      case 'heal': {
        const pos = fx.by === this.meId ? this.L.p : this.players.get(fx.by)?.rp;
        if (pos) this.particles.spawn([pos[0], pos[1] + 1, pos[2]], ['#5be37d', '#ffffff'], 14, 2.5, 0.12, 0.8, -2);
        break;
      }
      case 'taunt': {
        const txt = TAUNTS[fx.i] || TAUNTS[0];
        if (fx.by === this.meId) {
          this.hud.center('', `나: ${txt}`, 'taunt', 1500);
        } else {
          const rp = this.players.get(fx.by);
          if (rp) { rp.taunt = txt; rp.tauntUntil = performance.now() + 2600; }
        }
        A.taunt();
        break;
      }
    }
  }

  onHit(h) {
    this.hud.hitmarker(h.head, h.kill);
    A.hitmark(h.head, h.kill);
    const tgt = this.players.get(h.id);
    if (h.p) {
      this.particles.spawn(h.p, [TEAM_COLOR[tgt?.team ?? 1], '#ffffff'], h.head ? 10 : 6, 3, 0.09, 0.45, 9);
      const v = new THREE.Vector3(h.p[0], h.p[1] + 0.3, h.p[2]).project(this.camera);
      if (v.z < 1) {
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        this.hud.damageNumber(x, y, h.dmg, h.head);
      }
    }
  }

  onHurt(h) {
    this.L.hp = h.hp;
    this.hud.setHp(h.hp);
    A.hurt();
    let angle = null;
    if (h.from) {
      const dx = h.from[0] - this.L.p[0], dz = h.from[2] - this.L.p[2];
      if (Math.hypot(dx, dz) > 0.3) {
        const ay = Math.atan2(-dx, -dz);
        angle = -(ay - this.L.yaw);
      }
    }
    this.hud.hurt(angle);
    this.shake = Math.min(0.6, this.shake + h.dmg / 120);
  }

  onKill(k) {
    const victim = this.playerInfo(k.v);
    const killer = k.k ? this.playerInfo(k.k) : null;
    if (!victim) return;
    this.hud.killfeed({ killer, victim, weapon: k.w, head: k.head, mine: k.k === this.meId, me: k.v === this.meId });
    // 쓰러진 자리에서 블록이 터지는 연출
    const pos = k.v === this.meId ? this.L.p : this.players.get(k.v)?.rp;
    if (pos) this.particles.spawn([pos[0], pos[1] + 1, pos[2]], [TEAM_COLOR[victim.team], TEAM_DARK[victim.team], '#f1c8a0'], 26, 5, 0.18, 1.0, 12);
    const rv = this.players.get(k.v);
    if (rv) rv.alive = false;

    if (k.v === this.meId) {
      this.L.alive = false;
      this.L.hp = 0;
      this.hud.setHp(0);
      this.deathAt = performance.now();
      this.killerId = k.k;
      const wname = k.w === 'fall' ? '추락' : WEAPONS[k.w]?.name || '';
      const by = killer ? `<b class="${killer.team ? 'blue' : 'red'}">${esc(killer.name)}</b>에게 당했어요` : '떨어졌어요';
      this.hud.death(`<div class="d-title">${by}</div><div class="d-sub">${esc(wname)}${k.head ? ' · 헤드샷' : ''}</div>`);
      this.hud.scope(false);
      this.hud.progress('', -1);
    } else if (k.k === this.meId) {
      this.hud.center(k.head ? '헤드샷 처치!' : '처치!', victim.name, k.head ? 'gold kill' : 'kill', 1200);
    }
  }

  onKnock(k) {
    if (!this.L.alive) return;
    this.L.v[0] += k.v[0];
    this.L.v[1] = Math.max(this.L.v[1], 0) + k.v[1];
    this.L.v[2] += k.v[2];
    this.L.onGround = false;
  }

  onCorrect(c) { this.L.p = c.p.slice(); this.L.v = [0, 0, 0]; }
  onUtil(u) { this.utilLeft = u.left; }
  onHealed(h) { this.L.hp = h.hp; this.hud.setHp(h.hp); A.heal(); }
  onLoadoutApplied(m) { if (this.L.alive) this.setupWeapons(m.loadout, m.utilLeft); }

  onRoundResult(r) {
    const myTeam = this.me.team;
    if (r.winner < 0) this.hud.center('무승부', r.reason, '', 2600);
    else if (this.spectator) this.hud.center(`${TEAM_NAME[r.winner]} 팀 승리`, r.reason, r.winner ? 'blue' : 'red', 2600);
    else if (r.winner === myTeam) { this.hud.center('라운드 승리', `${r.score[myTeam]} : ${r.score[1 - myTeam]}`, 'win', 2600); A.fanfare(true); }
    else { this.hud.center('라운드 패배', `${r.score[myTeam]} : ${r.score[1 - myTeam]}`, 'lose', 2600); A.fanfare(false); }
    if (this.room) { this.room.score = r.score; this.updateScoreHud(); }
  }

  onFight() {
    this.hud.center('FIGHT!', '', 'fight', 900);
    A.beep(true);
  }

  // ─────────────── 입력 ───────────────
  bindInput() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouse.l = this.mouse.r = false; }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      A.initAudio();
      if (e.button === 0) { this.mouse.l = true; this.mouse.lp = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rp = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    document.addEventListener('contextmenu', (e) => { if (this.locked || this.running) e.preventDefault(); });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        this.scoreboardOpen = true;
        return;
      }
      if (!this.locked) return;
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKey(e.code);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') { this.scoreboardOpen = false; e.preventDefault(); }
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
  }

  onKey(code) {
    // 도발 메뉴가 열려 있으면 숫자키는 도발 선택
    if (this.tauntOpen) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[code];
      if (n != null) {
        if (this.tauntCd <= 0) { this.socket.emit('taunt', { i: n }); this.tauntCd = 2; }
        this.tauntOpen = false;
        this.hud.tauntMenu(TAUNTS, false);
        return;
      }
      if (code === 'KeyT' || code === 'Escape') { this.tauntOpen = false; this.hud.tauntMenu(TAUNTS, false); return; }
    }
    if (code === 'KeyT') {
      this.tauntOpen = true;
      this.hud.tauntMenu(TAUNTS, true);
      clearTimeout(this.tauntTimer);
      this.tauntTimer = setTimeout(() => { this.tauntOpen = false; this.hud.tauntMenu(TAUNTS, false); }, 3000);
      return;
    }
    // 관전 중: 대상 바꾸기
    if (!this.L.alive || this.spectator) {
      if (code === 'KeyV') this.spec.overview = !this.spec.overview;
      if (code === 'ArrowRight' || code === 'KeyD' || code === 'KeyE') this.spec.idx++;
      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') this.spec.idx--;
      return;
    }
    if (!this.weap) return;
    if (code === 'Digit1') this.equip('primary');
    else if (code === 'Digit2') this.equip('secondary');
    else if (code === 'Digit3') this.equip('melee');
    else if (code === 'Digit4' || code === 'KeyG') {
      if (this.weap.cur !== 'utility') this.equip('utility');
      if (code === 'KeyG' && this.weap.cur === 'utility') this.weap.quickUse = true;
    }
    else if (code === 'KeyQ') this.equip(this.weap.prev);
    else if (code === 'KeyR') this.startReload();
  }

  // ─────────────── 프레임 ───────────────
  // 느린 기기면 자동으로 화질 낮추기 (경기 중 5초 평균 30fps 미만)
  autoQuality(dt, playing) {
    if (!playing || this.settings.autoLowered) return;
    this._fpsT = (this._fpsT || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsT < 5) return;
    const fps = this._fpsN / this._fpsT;
    this._fpsT = 0; this._fpsN = 0;
    if (fps < 30 && (this.settings.quality || 1) > 0.6) {
      this.settings.quality = (this.settings.quality || 1) >= 0.99 ? 0.75 : 0.55;
      if (this.settings.quality <= 0.55) this.settings.autoLowered = true;
      this.applySettings(this.settings);
      this.onAutoQuality?.(Math.round(fps), this.settings.quality);
    }
  }

  frame(dt, t) {
    const now = performance.now();
    this.tauntCd -= dt;
    const playing = this.L.alive && !this.spectator && ['countdown', 'live', 'roundEnd'].includes(this.phase);
    this.autoQuality(dt, playing);
    if (playing) this.updateLocal(dt);
    else { this.look.dx = this.look.dy = 0; this.mouse.lp = this.mouse.rp = false; this.wheel = 0; }
    this.updateRemotes(dt, now);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateCamera(dt, now, playing);
    this.updateHud(now, playing);
    this.sendState(dt, playing);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (playing && this.viewRoot.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCam);
    }
    this.mouse.lp = this.mouse.rp = false;
  }

  updateLocal(dt) {
    const L = this.L, W = this.weap, cw = this.curW;
    const w = cw.w;
    // 시점
    const zoom = W.adsT > 0.5 ? lerp(1, w.zoom || 1, W.adsT) : 1;
    const sens = 0.0022 * (this.settings.sens || 1) / zoom;
    L.yaw -= this.look.dx * sens;
    L.pitch -= this.look.dy * sens * (this.settings.invertY ? -1 : 1);
    L.pitch = Math.max(-1.5, Math.min(1.5, L.pitch));
    this.look.dx = this.look.dy = 0;

    // 이동
    const frozen = this.phase === 'countdown';
    let fx = 0, fz = 0;
    if (!frozen) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) fx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) fx += 1;
    }
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sy = Math.sin(L.yaw), cy = Math.cos(L.yaw);
    const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
    let speed = WALK_SPEED * (w.speed || 1);
    if (W.adsT > 0.3 && (w.kind === 'gun' || w.kind === 'proj')) speed *= 0.62;
    if (W.healT >= 0) speed *= 0.5;
    if (w.spinup && W.spin > 0.1) speed *= 0.8;
    const tvx = wx * speed, tvz = wz * speed;
    const k = L.onGround ? 1 - Math.exp(-16 * dt) : 1 - Math.exp(-2.2 * dt);
    if (L.onGround || fx || fz) {
      L.v[0] += (tvx - L.v[0]) * k;
      L.v[2] += (tvz - L.v[2]) * k;
    }
    if (!frozen && this.keys.has('Space') && L.onGround) {
      L.v[1] = JUMP_V;
      L.onGround = false;
    }
    const wasAir = !L.onGround, vy = L.v[1];
    if (!frozen) moveAndCollide(L, this.boxes, dt);
    if (wasAir && L.onGround && vy < -6) { this.landDip = Math.min(0.18, -vy * 0.012); A.jumpLand(Math.min(0.5, -vy / 40)); }
    if (frozen) L.v = [0, 0, 0];

    // 걷기 흔들림
    const hs = Math.hypot(L.v[0], L.v[2]);
    if (L.onGround) this.bob += dt * hs * 1.6;

    this.updateWeapon(dt);
  }

  // ─────────────── 무기 ───────────────
  startReload() {
    const W = this.weap, cw = this.curW;
    if (!cw || !(cw.w.kind === 'gun' || cw.w.kind === 'proj')) return;
    if (W.reloadT > 0 || cw.ammo >= cw.w.mag || W.swapT > 0) return;
    W.reloadT = cw.w.reload;
    W.burstLeft = 0;
    A.reload();
    this.socket.emit('reloadFx');
  }

  updateWeapon(dt) {
    const W = this.weap, cw = this.curW, w = cw.w, L = this.L;
    const live = this.phase === 'live';
    W.swapT = Math.max(0, W.swapT - dt);
    W.fireCd = Math.max(-0.05, W.fireCd - dt);
    W.burstT -= dt;
    W.meleeCd -= dt;
    W.kick *= Math.exp(-14 * dt);
    W.bloom *= Math.exp(-6 * dt);
    W.swingT = Math.max(0, W.swingT - dt);

    // 휠로 무기 순환
    if (this.wheel) {
      const order = ['primary', 'secondary', 'melee'];
      const i = order.indexOf(W.cur);
      const n = order[((i < 0 ? 0 : i) + (this.wheel > 0 ? 1 : 2)) % 3];
      this.wheel = 0;
      this.equip(n);
      return;
    }

    // 재장전
    if (W.reloadT > 0) {
      W.reloadT -= dt;
      this.hud.setReload(1 - W.reloadT / w.reload);
      if (W.reloadT <= 0) { cw.ammo = w.mag; W.reloadT = 0; this.hud.setReload(-1); }
    }

    // 조준
    const canAds = (w.kind === 'gun' || w.kind === 'proj') && W.reloadT <= 0 && W.swapT <= 0;
    const adsTime = w.scope ? 0.22 : 0.13;
    W.adsT = Math.max(0, Math.min(1, W.adsT + (this.mouse.r && canAds ? dt : -dt) / adsTime));

    // 미니건 예열
    if (w.spinup) {
      const spinning = (this.mouse.l || this.mouse.r) && W.reloadT <= 0 && W.swapT <= 0;
      W.spin = Math.max(0, Math.min(1, W.spin + (spinning ? dt / w.spinup : -dt / 0.9)));
      const vm = this.viewmodels[W.cur];
      if (vm.userData.spin) vm.userData.spin.rotation.z += dt * W.spin * 40;
    }

    if (W.swapT > 0 || !live) return;

    switch (w.kind) {
      case 'gun': {
        if (W.reloadT > 0) break;
        if (w.burst) {
          if (this.mouse.lp && W.burstLeft === 0 && W.fireCd <= 0) {
            if (cw.ammo <= 0) { A.dryFire(); this.startReload(); break; }
            W.burstLeft = w.burst;
            W.burstT = 0;
          }
          if (W.burstLeft > 0 && W.burstT <= 0) {
            if (cw.ammo > 0) this.fireGun(cw);
            W.burstLeft--;
            W.burstT = w.burstGap;
            if (W.burstLeft === 0 || cw.ammo <= 0) { W.burstLeft = 0; W.fireCd = 60 / w.rpm; }
          }
        } else {
          const want = w.auto ? this.mouse.l : this.mouse.lp;
          if (want && W.fireCd <= 0 && (!w.spinup || W.spin >= 1)) {
            if (cw.ammo <= 0) { if (this.mouse.lp) A.dryFire(); this.startReload(); break; }
            this.fireGun(cw);
            W.fireCd += 60 / w.rpm;
            if (W.fireCd < 0) W.fireCd = 60 / w.rpm;
          }
        }
        if (cw.ammo === 0 && W.reloadT <= 0 && W.burstLeft === 0 && W.fireCd <= 0) this.startReload();
        break;
      }
      case 'proj': {
        if (W.reloadT > 0) break;
        if (this.mouse.lp && W.fireCd <= 0) {
          if (cw.ammo <= 0) { this.startReload(); break; }
          this.fireRocket(cw);
          W.fireCd = 60 / w.rpm;
        }
        if (cw.ammo === 0 && W.reloadT <= 0 && W.fireCd <= 0) this.startReload();
        break;
      }
      case 'melee': {
        if (this.mouse.l && W.meleeCd <= 0) {
          W.meleeCd = w.rate;
          W.swingT = 0.3;
          A.swing();
          setTimeout(() => this.meleeHit(cw), 90);
        }
        break;
      }
      case 'throw': {
        if ((this.mouse.lp || W.quickUse) && this.utilLeft > 0) {
          W.quickUse = false;
          this.throwUtil(cw);
        }
        break;
      }
      case 'heal': {
        if ((this.mouse.lp || W.quickUse) && this.utilLeft > 0 && W.healT < 0 && L.hp < MAX_HP) {
          W.quickUse = false;
          W.healT = 0;
        } else if (W.quickUse && L.hp >= MAX_HP) {
          W.quickUse = false;
          this.hud.center('', '체력이 이미 가득 찼어요', '', 900);
        }
        if (W.healT >= 0) {
          W.healT += dt;
          this.hud.progress('치료 중', W.healT / w.useTime);
          if (W.healT >= w.useTime) {
            W.healT = -1;
            this.hud.progress('', -1);
            this.socket.emit('heal');
            this.utilLeft = Math.max(0, this.utilLeft - 1);
            setTimeout(() => this.equip(W.prev === 'utility' ? 'primary' : W.prev), 150);
          }
        }
        break;
      }
    }
  }

  currentSpread(w) {
    const W = this.weap, L = this.L;
    let s = lerp(w.spread || 0, w.adsSpread || 0, W.adsT);
    const hs = Math.hypot(L.v[0], L.v[2]);
    s += (hs / WALK_SPEED) * (w.scope ? 0.05 : (w.spread || 0) * 0.9) * (1 - W.adsT * 0.6);
    if (!L.onGround) s += w.scope ? 0.06 : 0.02;
    s += W.bloom;
    return s;
  }

  eye() { return [this.L.p[0], this.L.p[1] + EYE_H, this.L.p[2]]; }

  vmMuzzleWorld() {
    const vm = this.viewmodels[this.weap.cur];
    const m = vm.userData.muzzle;
    if (!m) return this.eye();
    vm.updateMatrixWorld(true);
    const v = m.getWorldPosition(new THREE.Vector3());
    // 뷰모델 공간 → 월드 (뷰모델 카메라는 원점, 회전 없음)
    v.multiplyScalar(1);
    this.camera.updateMatrixWorld();
    return this.camera.localToWorld(v).toArray();
  }

  fireGun(cw) {
    const w = cw.w, W = this.weap, L = this.L;
    cw.ammo--;
    const o = this.eye();
    const base = lookDir(L.yaw, L.pitch);
    const spread = this.currentSpread(w);
    const n = w.pellets || 1;
    const ends = [], hits = [];
    const muzzle = this.vmMuzzleWorld();
    for (let i = 0; i < n; i++) {
      const d = spreadDir(base, spread);
      const mh = rayMap(o, d, 250, this.boxes);
      let t = mh.t, hitP = null;
      for (const rp of this.players.values()) {
        if (!rp.alive || !rp.avatar.visible) continue;
        const r = rayPlayer(o, d, rp.rp, t);
        if (r && r.t < t) { t = r.t; hitP = { rp, zone: r.zone }; }
      }
      const end = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      ends.push(r3(end));
      this.tracers.spawn(muzzle, end, '#fff3a3', n > 1 ? 0.018 : 0.03, n > 1 ? 0.07 : 0.09);
      if (hitP) {
        if (hitP.rp.team !== this.me.team) hits.push({ id: hitP.rp.id, zone: hitP.zone, p: r3(end) });
      } else if (t < 250) {
        const c = mh.n ? [end[0] + mh.n[0] * 0.03, end[1] + mh.n[1] * 0.03, end[2] + mh.n[2] * 0.03] : end;
        this.particles.spawn(c, ['#d8d8d8', '#9a9a9a'], n > 1 ? 1 : 3, 2, 0.06, 0.35, 6);
      }
    }
    this.socket.emit('shoot', { w: cw.key, o: r3(o), e: ends, hits });
    A.gunshot(w.snd, 1, 0);
    // 반동
    const rc = w.recoil * (1 - W.adsT * 0.45);
    L.pitch = Math.min(1.5, L.pitch + rc * (0.75 + Math.random() * 0.5));
    L.yaw += (Math.random() - 0.5) * rc * 0.6;
    W.bloom = Math.min(0.05, W.bloom + (w.recoil || 0) * 0.25);
    W.kick = Math.min(1.5, W.kick + 1);
    W.flashT = 0.045;
  }

  fireRocket(cw) {
    const L = this.L, W = this.weap;
    cw.ammo--;
    const d = lookDir(L.yaw, L.pitch);
    const e = this.eye();
    const o = [e[0] + d[0] * 0.5, e[1] + d[1] * 0.5 - 0.05, e[2] + d[2] * 0.5];
    this.socket.emit('proj', { w: cw.key, o: r3(o), d: r3(d) });
    A.rocketLaunch(1, 0);
    L.pitch = Math.min(1.5, L.pitch + cw.w.recoil);
    W.kick = 1.6;
    W.flashT = 0.08;
    const back = [e[0] - d[0] * 0.8, e[1] - 0.2, e[2] - d[2] * 0.8];
    this.particles.spawn(back, ['#bbbbbb', '#888888'], 8, 2.5, 0.2, 0.6, -1);
  }

  meleeHit(cw) {
    if (!this.L.alive || this.phase !== 'live') return;
    const w = cw.w, o = this.eye(), d = lookDir(this.L.yaw, this.L.pitch);
    const hits = [];
    for (const rp of this.players.values()) {
      if (!rp.alive || rp.team === this.me.team) continue;
      const c = [rp.rp[0], rp.rp[1] + 1.1, rp.rp[2]];
      const v = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
      const dist = Math.hypot(...v);
      if (dist > w.range + 0.45) continue;
      const dot = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / (dist || 1);
      if (dist > 1.0 && dot < Math.cos(w.arc)) continue;
      if (!lineOfSight(o, c, this.boxes)) continue;
      hits.push(rp.id);
    }
    this.socket.emit('melee', { w: cw.key, hits });
  }

  throwUtil(cw) {
    const L = this.L, W = this.weap;
    const d = lookDir(L.yaw, L.pitch);
    const e = this.eye();
    const o = [e[0] + d[0] * 0.4, e[1] + d[1] * 0.4, e[2] + d[2] * 0.4];
    this.socket.emit('throw', { w: cw.key, o: r3(o), d: r3(d) });
    this.utilLeft = Math.max(0, this.utilLeft - 1);
    A.throwSound();
    W.swingT = 0.3;
    setTimeout(() => {
      if (this.weap === W && W.cur === 'utility') this.equip(W.prev === 'utility' ? 'primary' : W.prev);
    }, 260);
  }

  // ─────────────── 다른 플레이어 ───────────────
  sample(buf, t) {
    if (!buf.length) return null;
    if (t <= buf[0].t) return buf[0];
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= t) {
        const a = buf[i], b = buf[i + 1];
        if (!b) return a;
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return {
          p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)],
          yaw: lerpAngle(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k),
          w: b.w, alive: b.alive, hp: b.hp, ads: b.ads,
        };
      }
    }
    return buf[buf.length - 1];
  }

  updateRemotes(dt, now) {
    const inGame = this.phase !== 'waiting';
    for (const rp of this.players.values()) {
      const s = this.sample(rp.buf, now - INTERP_MS);
      if (!s || !inGame) { rp.avatar.visible = false; rp.alive = false; continue; }
      const prev = rp.rp;
      rp.rp = s.p;
      rp.yaw = s.yaw;
      rp.pitch = s.pitch;
      rp.alive = s.alive;
      rp.hp = s.hp;
      const av = rp.avatar, u = av.userData;
      if (u.skinned) {
        // 쓰러진 뒤 3초 동안은 사망 동작을 보여주고 숨김
        if (s.alive) rp.deadAt = 0; else if (!rp.deadAt) rp.deadAt = now;
        const showCorpse = !s.alive && now - rp.deadAt < 3000;
        av.visible = s.alive || showCorpse;
        rp.tag.visible = s.alive;
        if (!av.visible) { rp.flash.visible = false; continue; }
        av.position.set(s.p[0], s.p[1], s.p[2]);
        if (s.alive) av.rotation.y = s.yaw;
        setAvatarWeapon(av, s.w);
        const moved = prev ? Math.hypot(s.p[0] - prev[0], s.p[2] - prev[2]) / Math.max(dt, 1e-3) : 0;
        rp.spd = (rp.spd || 0) + (moved - (rp.spd || 0)) * Math.min(1, dt * 10);
        const vy = prev ? (s.p[1] - prev[1]) / Math.max(dt, 1e-3) : 0;
        rp.airT = Math.abs(vy) > 4 ? 0.2 : Math.max(0, (rp.airT || 0) - dt);
        const kind = WEAPONS[s.w]?.kind;
        animateAvatar(av, {
          dt, speed: rp.spd, air: rp.airT > 0, pitch: s.pitch, alive: s.alive,
          melee: kind === 'melee' || kind === 'heal', swing: rp.swingTrig, throwing: rp.throwTrig,
        });
        rp.swingTrig = false; rp.throwTrig = false;
        if (s.alive) {
          const taunt = rp.tauntUntil > now ? rp.taunt : null;
          drawNameTag(rp.tag, rp.name || '', rp.hp, TEAM_COLOR[rp.team], taunt);
        }
        rp.flashT = (rp.flashT || 0) - dt;
        if (rp.flashT > 0 && s.alive) {
          const m = this.remoteMuzzle(rp);
          rp.flash.position.set(m[0], m[1], m[2]);
          rp.flash.visible = true;
        } else rp.flash.visible = false;
        continue;
      }
      av.visible = s.alive;
      if (!s.alive) { rp.flash.visible = false; continue; }
      av.position.set(s.p[0], s.p[1], s.p[2]);
      av.rotation.y = s.yaw;
      setAvatarWeapon(av, s.w);
      // 팔/머리
      const kick = (rp.kick || 0);
      rp.kick = kick * Math.exp(-12 * dt);
      rp.swing = Math.max(0, (rp.swing || 0) - dt * 3.5);
      const isMelee = WEAPONS[s.w]?.kind === 'melee';
      u.head.rotation.x = s.pitch * 0.6;
      u.armR.rotation.x = s.pitch + kick * 0.15 + (isMelee ? Math.sin(rp.swing * Math.PI) * 1.4 : 0);
      u.armR.rotation.y = isMelee ? -Math.sin(rp.swing * Math.PI) * 0.8 : 0;
      u.armL.rotation.x = s.pitch;
      // 걷기
      const moved = prev ? Math.hypot(s.p[0] - prev[0], s.p[2] - prev[2]) / Math.max(dt, 1e-3) : 0;
      const sp = Math.min(1, moved / 5);
      rp.walk += dt * moved * 1.9;
      u.legL.rotation.x = Math.sin(rp.walk) * 0.75 * sp;
      u.legR.rotation.x = -Math.sin(rp.walk) * 0.75 * sp;
      // 이름표
      const taunt = rp.tauntUntil > now ? rp.taunt : null;
      drawNameTag(rp.tag, rp.name || '', rp.hp, TEAM_COLOR[rp.team], taunt);
      // 총구 화염
      rp.flashT = (rp.flashT || 0) - dt;
      if (rp.flashT > 0) {
        const m = this.remoteMuzzle(rp);
        rp.flash.position.set(m[0], m[1], m[2]);
        rp.flash.visible = true;
      } else rp.flash.visible = false;
    }
  }

  remoteMuzzle(rp) {
    const u = rp.avatar.userData;
    const m = u.weapon?.userData.muzzle;
    if (!m || !rp.avatar.visible) return [rp.rp[0], rp.rp[1] + 1.4, rp.rp[2]];
    rp.avatar.updateMatrixWorld(true);
    return m.getWorldPosition(new THREE.Vector3()).toArray();
  }

  // ─────────────── 투사체/이펙트 ───────────────
  updateProjectiles(dt) {
    for (const m of this.projMeshes.values()) {
      const tgt = m.userData.target;
      const prev = m.position.clone();
      m.position.lerp(tgt, 1 - Math.exp(-25 * dt));
      if (m.userData.type === 'rocket') {
        if (prev.distanceToSquared(tgt) > 1e-4) m.lookAt(tgt.clone().add(tgt.clone().sub(prev)));
        this.particles.spawn(m.position.toArray(), ['#e6e6e6', '#bdbdbd', '#ffb347'], 1, 0.6, 0.16, 0.5, -1.5);
      } else {
        m.rotation.x += dt * 9;
        m.rotation.z += dt * 6;
      }
    }
  }

  explode(p, r, cam) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffb03b', transparent: true, opacity: 0.95 }));
    const smoke = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#6b6b6b', transparent: true, opacity: 0.6, depthWrite: false }));
    core.position.set(p[0], p[1], p[2]);
    smoke.position.copy(core.position);
    this.scene.add(core, smoke);
    this.booms.push({ core, smoke, t: 0, r });
    this.particles.spawn(p, ['#ffd166', '#ff8c42', '#6b6b6b', '#3f3f3f'], 26, 9, 0.22, 0.9, 14);
    const sp = A.spatial(p, cam, this.camYaw || 0);
    A.explosion(Math.min(1.2, sp.vol * 1.6), sp.pan);
    const d = Math.hypot(p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]);
    this.shake = Math.min(1, this.shake + Math.max(0, 1 - d / (r * 3)) * 0.8);
  }

  addSmoke(p, r, dur, cam) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: '#dfe3e8', transparent: true, opacity: 0, depthWrite: false });
    const cubes = [];
    for (let i = 0; i < 22; i++) {
      const s = 1.2 + Math.random() * 1.6;
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.75;
      c.position.set(Math.cos(a) * rr, Math.random() * r * 0.7, Math.sin(a) * rr);
      c.rotation.set(Math.random(), Math.random(), Math.random());
      c.userData.spin = (Math.random() - 0.5) * 0.4;
      g.add(c);
      cubes.push(c);
    }
    g.position.set(p[0], p[1], p[2]);
    this.scene.add(g);
    this.smokes.push({ g, mat, t: 0, dur, r, p, cubes });
    const sp = A.spatial(p, cam, this.camYaw || 0);
    A.smokePop(sp.vol, sp.pan);
  }

  updateEffects(dt) {
    this.particles.update(dt);
    this.tracers.update(dt);
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / 0.45;
      b.core.scale.setScalar(0.4 + b.r * 0.55 * Math.min(1, k * 1.6));
      b.core.material.opacity = Math.max(0, 0.95 * (1 - k));
      b.smoke.scale.setScalar(0.5 + b.r * 0.75 * Math.min(1, b.t / 0.8));
      b.smoke.material.opacity = Math.max(0, 0.55 * (1 - b.t / 1.3));
      b.smoke.position.y += dt * 0.8;
      if (b.t > 1.3) {
        this.scene.remove(b.core, b.smoke);
        b.core.material.dispose(); b.smoke.material.dispose();
        this.booms.splice(i, 1);
      }
    }
    let inSmoke = 0;
    const cp = this.camera.position;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const fadeIn = Math.min(1, s.t / 0.7), fadeOut = Math.min(1, (s.dur - s.t) / 1.5);
      const op = Math.max(0, Math.min(fadeIn, fadeOut));
      s.mat.opacity = 0.93 * op;
      const grow = 0.3 + 0.7 * fadeIn;
      for (const c of s.cubes) { c.rotation.y += c.userData.spin * dt; }
      s.g.scale.setScalar(grow);
      const d = Math.hypot(cp.x - s.p[0], cp.y - (s.p[1] + s.r * 0.3), cp.z - s.p[2]);
      if (d < s.r * 0.85) inSmoke = Math.max(inSmoke, op * Math.min(1, (s.r * 0.85 - d) / 1.2 + 0.4));
      if (s.t >= s.dur) {
        this.scene.remove(s.g);
        s.cubes.forEach((c) => c.geometry.dispose());
        s.mat.dispose();
        this.smokes.splice(i, 1);
      }
    }
    this.hud.smoke(inSmoke);
  }

  clearEffects() {
    this.particles.clear();
    this.tracers.clear();
    for (const b of this.booms) this.scene.remove(b.core, b.smoke);
    this.booms = [];
    for (const s of this.smokes) this.scene.remove(s.g);
    this.smokes = [];
    for (const m of this.projMeshes.values()) this.scene.remove(m);
    this.projMeshes.clear();
    this.hud.smoke(0);
  }

  // ─────────────── 카메라 ───────────────
  updateCamera(dt, now, playing) {
    const cam = this.camera;
    this.shake *= Math.exp(-6 * dt);
    this.landDip *= Math.exp(-10 * dt);
    const sh = this.shake;
    const shx = (Math.random() - 0.5) * sh * 0.05, shy = (Math.random() - 0.5) * sh * 0.05;

    if (playing) {
      const L = this.L, W = this.weap, w = this.curW.w;
      cam.position.set(L.p[0], L.p[1] + EYE_H - this.landDip, L.p[2]);
      cam.rotation.set(L.pitch + shy, L.yaw + shx, 0);
      const zoom = lerp(1, w.zoom || 1, W.adsT);
      const fov = (this.settings.fov || 80) / zoom;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      this.camYaw = L.yaw;
      this.updateViewmodel(dt);
      this.hud.spectate(null);
      return;
    }

    if (this.camera.fov !== (this.settings.fov || 80)) { cam.fov = this.settings.fov || 80; cam.updateProjectionMatrix(); }
    this.viewRoot.visible = false;
    this.hud.scope(false);

    // 죽은 직후 1.6초는 나를 잡은 상대를 바라봄
    const killer = this.killerId ? this.players.get(this.killerId) : null;
    if (!this.spectator && this.deathAt && now - this.deathAt < 1600 && killer && killer.alive) {
      const eye = new THREE.Vector3(this.L.p[0], this.L.p[1] + 2.2, this.L.p[2]);
      cam.position.lerp(eye, 1 - Math.exp(-6 * dt));
      const look = new THREE.Vector3(killer.rp[0], killer.rp[1] + 1.4, killer.rp[2]);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, 1 - Math.exp(-8 * dt));
      cam.rotation.setFromQuaternion(cam.quaternion, 'YXZ');
      this.camYaw = cam.rotation.y;
      return;
    }

    // 관전: 살아있는 플레이어를 3인칭으로 따라감
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (!this.spectator) alive.sort((a, b) => (a.team === this.me.team ? 0 : 1) - (b.team === this.me.team ? 0 : 1));
    const map = this.map;
    if (!alive.length || this.spec.overview || this.phase === 'waiting' || this.phase === 'vs') {
      const t = now / 1000 * 0.08;
      const sc = map?.specCam || { p: [0, 25, 30], target: [0, 0, 0] };
      const rr = Math.hypot(sc.p[0], sc.p[2]);
      const want = new THREE.Vector3(Math.sin(t) * rr, sc.p[1], Math.cos(t) * rr);
      cam.position.lerp(want, this.spec.init ? 1 - Math.exp(-2 * dt) : 1);
      this.spec.init = true;
      cam.lookAt(sc.target[0], sc.target[1], sc.target[2]);
      cam.rotation.setFromQuaternion(cam.quaternion, 'YXZ');
      this.camYaw = cam.rotation.y;
      if (this.phase !== 'waiting' && this.phase !== 'vs' && (this.spectator || !this.L.alive)) {
        this.hud.spectate(alive.length ? '전체 보기 <kbd>V</kbd> 플레이어 따라가기' : '');
      } else this.hud.spectate(null);
      return;
    }
    const idx = ((this.spec.idx % alive.length) + alive.length) % alive.length;
    const tgt = alive[idx];
    const head = [tgt.rp[0], tgt.rp[1] + 1.7, tgt.rp[2]];
    const back = lookDir(tgt.yaw, -0.25);
    const dir = [-back[0], -back[1] + 0.25, -back[2]];
    const l = Math.hypot(...dir);
    const nd = dir.map((v) => v / l);
    const hit = rayMap(head, nd, 3.6, this.boxes);
    const dd = Math.max(0.6, hit.t - 0.25);
    const want = new THREE.Vector3(head[0] + nd[0] * dd, head[1] + nd[1] * dd + 0.3, head[2] + nd[2] * dd);
    cam.position.lerp(want, 1 - Math.exp(-10 * dt));
    cam.lookAt(head[0], head[1], head[2]);
    cam.rotation.setFromQuaternion(cam.quaternion, 'YXZ');
    this.camYaw = cam.rotation.y;
    const mate = !this.spectator && tgt.team === this.me.team;
    this.hud.spectate(`<b class="${tgt.team ? 'blue' : 'red'}">${esc(tgt.name || '')}</b> ${mate ? '(팀원)' : ''} 관전 중 <span><kbd>A</kbd><kbd>D</kbd> 바꾸기 <kbd>V</kbd> 전체 보기</span>`);
  }

  updateViewmodel(dt) {
    const W = this.weap, cw = this.curW, w = cw.w, L = this.L;
    const vm = this.viewmodels[W.cur];
    const scoped = w.scope && W.adsT > 0.85;
    this.viewRoot.visible = !scoped;
    this.hud.scope(scoped);
    const hs = Math.hypot(L.v[0], L.v[2]);
    const bobAmt = Math.min(1, hs / WALK_SPEED) * (L.onGround ? 1 : 0.3) * (1 - W.adsT * 0.85);
    const bx = Math.sin(this.bob) * 0.012 * bobAmt, by = Math.abs(Math.cos(this.bob)) * 0.014 * bobAmt;
    const hip = { x: 0.15, y: -0.155, z: -0.36 };
    const ads = { x: 0, y: -0.088, z: -0.3 };
    if (w.kind === 'melee') { hip.x = 0.2; hip.y = -0.2; hip.z = -0.34; }
    if (w.kind === 'throw' || w.kind === 'heal') { hip.x = 0.16; hip.y = -0.15; hip.z = -0.46; }
    const a = W.adsT;
    let x = lerp(hip.x, ads.x, a) + bx, y = lerp(hip.y, ads.y, a) - by, z = lerp(hip.z, ads.z, a);
    let rx = 0, ry = 0, rz = 0;
    // 반동
    z += W.kick * 0.05;
    rx += W.kick * 0.09;
    // 재장전 모션
    if (W.reloadT > 0) {
      const k = 1 - W.reloadT / w.reload;
      const s = Math.sin(k * Math.PI);
      rx -= s * 0.5; y -= s * 0.08; rz += s * 0.35;
    }
    // 교체 모션
    if (W.swapT > 0) { const k = W.swapT / SWAP_TIME; y -= k * 0.35; rx -= k * 0.6; }
    // 근접 휘두르기 / 던지기
    if (W.swingT > 0) {
      const k = 1 - W.swingT / 0.3, s = Math.sin(k * Math.PI);
      if (w.kind === 'melee') { ry += s * 1.2; rx -= s * 0.6; x -= s * 0.15; z -= s * 0.1; }
      else { rx -= s * 1.0; z -= s * 0.15; y += s * 0.08; }
    }
    if (W.healT >= 0) { y += 0.04 * Math.sin(W.healT * 12); rx -= 0.3; }
    vm.position.set(x, y, z);
    vm.rotation.set(rx, ry, rz);
    if (vm.userData.rocketTip) vm.userData.rocketTip.visible = cw.ammo > 0 && W.reloadT <= 0;
    W.flashT = (W.flashT || 0) - dt;
    this.vmFlash.visible = W.flashT > 0;
    if (this.vmFlash.visible) this.vmFlash.rotation.z = Math.random() * Math.PI;
  }

  // ─────────────── HUD ───────────────
  updateHud(now, playing) {
    const room = this.room;
    if (!room) return;
    // 타이머 & 카운트다운
    const left = room.phaseEnd ? (room.phaseEnd - this.serverNow()) / 1000 : null;
    if (this.phase === 'live') this.hud.timer(left, left != null && left < 10);
    else if (this.phase === 'countdown' && left != null) {
      const n = Math.ceil(left);
      this.hud.timer(null);
      if (n !== this.lastCount && n > 0 && n <= 3) {
        this.lastCount = n;
        this.hud.center(String(n), '', 'count', 900);
        A.beep(false);
      }
    } else this.hud.timer(null);

    if (playing && this.weap) {
      const cw = this.curW, w = cw.w, W = this.weap;
      this.hud.setWeapon(cw.key, cw.ammo, w.mag || 0, this.utilLeft);
      this.hud.setSlots(this.loadout, W.cur, this.utilLeft);
      // 크로스헤어: 탄퍼짐을 화면 픽셀로
      const spread = (w.kind === 'gun') ? this.currentSpread(w) : 0.01;
      const px = Math.tan(spread) / Math.tan((this.camera.fov * Math.PI / 180) / 2) * (window.innerHeight / 2);
      const show = !(w.scope && W.adsT > 0.85);
      this.hud.crosshair(px + 4, show, W.adsT > 0.6 && !w.pellets ? 'ads' : w.kind);
    } else {
      this.hud.crosshair(10, false);
      this.hud.setReload(-1);
    }
    this.hud.el.hud.classList.toggle('not-playing', !playing);
    this.hud.el.hud.classList.toggle('spectator', this.spectator);
    this.hud.scoreboard(this.scoreboardOpen, room, room.players.map((p) => {
      const rp = this.players.get(p.id);
      const alive = p.id === this.meId ? this.L.alive : rp ? rp.alive : p.alive;
      return { ...p, alive };
    }), this.meId);
  }

  sendState(dt, playing) {
    this.sendAcc += dt;
    if (this.sendAcc < 1 / SEND_HZ) return;
    this.sendAcc = 0;
    if (!playing || !this.weap) return;
    const L = this.L;
    this.socket.volatile.emit('st', {
      p: r3(L.p), yaw: Math.round(L.yaw * 1000) / 1000, pitch: Math.round(L.pitch * 1000) / 1000,
      w: this.curW.key, ads: this.weap.adsT > 0.5,
    });
  }
}
