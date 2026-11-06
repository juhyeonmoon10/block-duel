// 블록으로 조립하는 무기/캐릭터 모델. 텍스처 없이 박스만 사용 → 크롬북에서도 가볍게.
import * as THREE from 'three';
import * as AS from './assets.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

function box(g, w, h, d, color, x = 0, y = 0, z = 0, rx = 0) {
  const m = new THREE.Mesh(boxGeo, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  g.add(m);
  return m;
}
function cyl(g, r, len, color, x = 0, y = 0, z = 0) {
  // Z축 방향 원통
  const m = new THREE.Mesh(cylGeo, mat(color));
  m.scale.set(r * 2, len, r * 2);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function muzzleAt(g, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  g.add(o);
  g.userData.muzzle = o;
}

const METAL = '#3b404c', DARK = '#23262e', WOOD = '#9c6b3f', STEEL = '#c9ced8', OLIVE = '#5f7a3e';

// 모든 총은 총구가 -Z 방향, 손잡이가 원점 근처
export function buildWeapon(key) {
  const g = new THREE.Group();
  switch (key) {
    case 'ar':
      box(g, 0.08, 0.11, 0.44, METAL, 0, 0.02, -0.16);
      box(g, 0.035, 0.035, 0.26, DARK, 0, 0.035, -0.5);
      box(g, 0.06, 0.17, 0.08, DARK, 0, -0.1, -0.2, 0.25);
      box(g, 0.07, 0.1, 0.22, METAL, 0, 0.0, 0.15);
      box(g, 0.05, 0.13, 0.06, DARK, 0, -0.09, 0.0, -0.3);
      box(g, 0.03, 0.045, 0.1, DARK, 0, 0.095, -0.12);
      box(g, 0.084, 0.02, 0.2, '#ff9f1c', 0, 0.075, -0.25);
      muzzleAt(g, 0, 0.035, -0.64);
      break;
    case 'burst':
      box(g, 0.08, 0.12, 0.46, '#2f4a52', 0, 0.02, -0.16);
      box(g, 0.035, 0.035, 0.22, DARK, 0, 0.035, -0.5);
      box(g, 0.06, 0.15, 0.08, DARK, 0, -0.1, -0.16);
      box(g, 0.07, 0.11, 0.2, '#2f4a52', 0, 0.0, 0.16);
      box(g, 0.05, 0.13, 0.06, DARK, 0, -0.09, 0.02, -0.3);
      box(g, 0.055, 0.055, 0.18, DARK, 0, 0.115, -0.12);
      box(g, 0.06, 0.06, 0.02, '#43c6ac', 0, 0.115, -0.22);
      muzzleAt(g, 0, 0.035, -0.62);
      break;
    case 'smg':
      box(g, 0.08, 0.1, 0.3, '#4a4f5c', 0, 0.02, -0.1);
      box(g, 0.035, 0.035, 0.12, DARK, 0, 0.03, -0.31);
      box(g, 0.05, 0.22, 0.06, DARK, 0, -0.13, -0.12);
      box(g, 0.05, 0.12, 0.06, DARK, 0, -0.08, 0.04, -0.2);
      box(g, 0.03, 0.03, 0.18, METAL, 0, 0.0, 0.14);
      box(g, 0.084, 0.02, 0.12, '#ffd23f', 0, 0.07, -0.12);
      muzzleAt(g, 0, 0.03, -0.38);
      break;
    case 'shotgun':
      box(g, 0.065, 0.065, 0.6, DARK, 0, 0.04, -0.32);
      box(g, 0.075, 0.065, 0.18, WOOD, 0, -0.03, -0.36);
      box(g, 0.08, 0.1, 0.18, METAL, 0, 0.01, -0.02);
      box(g, 0.07, 0.11, 0.26, WOOD, 0, -0.02, 0.18);
      box(g, 0.05, 0.12, 0.06, WOOD, 0, -0.09, 0.04, -0.3);
      muzzleAt(g, 0, 0.04, -0.63);
      break;
    case 'sniper':
      box(g, 0.07, 0.1, 0.5, OLIVE, 0, 0.0, -0.12);
      box(g, 0.03, 0.03, 0.5, DARK, 0, 0.02, -0.62);
      box(g, 0.075, 0.075, 0.3, DARK, 0, 0.11, -0.1);
      box(g, 0.08, 0.08, 0.02, '#7fd1ff', 0, 0.11, -0.26);
      box(g, 0.065, 0.12, 0.28, OLIVE, 0, -0.02, 0.24);
      box(g, 0.05, 0.12, 0.06, DARK, 0, -0.1, 0.06, -0.3);
      box(g, 0.05, 0.08, 0.05, DARK, 0, -0.08, -0.12);
      muzzleAt(g, 0, 0.02, -0.88);
      break;
    case 'minigun': {
      box(g, 0.16, 0.16, 0.3, '#59606e', 0, 0, -0.05);
      box(g, 0.05, 0.14, 0.07, DARK, 0, -0.14, 0.05, -0.2);
      box(g, 0.14, 0.12, 0.12, '#c0c4cc', 0.0, 0.12, 0.0);
      const spin = new THREE.Group();
      spin.position.set(0, 0, -0.2);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(spin, 0.017, 0.5, DARK, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.25);
      }
      box(spin, 0.13, 0.13, 0.03, METAL, 0, 0, -0.42);
      g.add(spin);
      g.userData.spin = spin;
      muzzleAt(g, 0, 0, -0.72);
      break;
    }
    case 'rpg':
      cyl(g, 0.065, 0.85, OLIVE, 0, 0.05, -0.2);
      cyl(g, 0.075, 0.12, DARK, 0, 0.05, 0.22);
      box(g, 0.05, 0.13, 0.06, DARK, 0, -0.07, -0.02, -0.2);
      box(g, 0.05, 0.1, 0.05, DARK, 0, -0.04, -0.3);
      box(g, 0.03, 0.07, 0.06, DARK, -0.06, 0.13, -0.12);
      {
        const tip = new THREE.Group();
        cyl(tip, 0.05, 0.1, '#d64545', 0, 0.05, -0.66);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), mat('#d64545'));
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(0, 0.05, -0.78);
        tip.add(cone);
        g.add(tip);
        g.userData.rocketTip = tip;
      }
      muzzleAt(g, 0, 0.05, -0.65);
      break;
    case 'pistol':
      box(g, 0.05, 0.075, 0.22, '#2b2e36', 0, 0.03, -0.08);
      box(g, 0.045, 0.13, 0.065, DARK, 0, -0.06, 0.0, -0.25);
      box(g, 0.052, 0.02, 0.06, '#ff6b6b', 0, 0.075, -0.14);
      muzzleAt(g, 0, 0.035, -0.2);
      break;
    case 'revolver':
      cyl(g, 0.022, 0.24, STEEL, 0, 0.04, -0.16);
      cyl(g, 0.045, 0.08, '#8d939e', 0, 0.025, -0.02);
      box(g, 0.05, 0.06, 0.1, STEEL, 0, 0.04, 0.03);
      box(g, 0.045, 0.14, 0.07, WOOD, 0, -0.06, 0.06, -0.35);
      muzzleAt(g, 0, 0.04, -0.29);
      break;
    case 'uzi':
      box(g, 0.065, 0.1, 0.24, '#3a3d45', 0, 0.02, -0.08);
      box(g, 0.03, 0.03, 0.06, DARK, 0, 0.03, -0.23);
      box(g, 0.045, 0.2, 0.06, DARK, 0, -0.1, -0.02);
      box(g, 0.07, 0.02, 0.1, '#43c6ac', 0, 0.075, -0.06);
      muzzleAt(g, 0, 0.03, -0.27);
      break;
    case 'knife':
      box(g, 0.035, 0.04, 0.11, DARK, 0, 0, 0.02);
      box(g, 0.06, 0.05, 0.015, METAL, 0, 0, -0.04);
      box(g, 0.012, 0.04, 0.2, STEEL, 0, 0.005, -0.15);
      muzzleAt(g, 0, 0, -0.25);
      break;
    case 'katana':
      box(g, 0.035, 0.035, 0.26, '#2b2140', 0, 0, 0.06);
      box(g, 0.09, 0.02, 0.06, '#c9a227', 0, 0, -0.08);
      box(g, 0.012, 0.045, 0.85, STEEL, 0, 0.005, -0.52);
      muzzleAt(g, 0, 0, -0.95);
      break;
    case 'hammer':
      box(g, 0.04, 0.04, 0.6, WOOD, 0, 0, -0.18);
      box(g, 0.13, 0.13, 0.26, '#4a4f5c', 0, 0.0, -0.5);
      box(g, 0.135, 0.135, 0.03, '#ffd23f', 0, 0.0, -0.5);
      muzzleAt(g, 0, 0, -0.55);
      break;
    case 'grenade':
      box(g, 0.08, 0.1, 0.08, '#4f6b3a', 0, 0, -0.05);
      box(g, 0.03, 0.03, 0.03, STEEL, 0, 0.065, -0.05);
      box(g, 0.012, 0.04, 0.04, STEEL, 0.03, 0.07, -0.05);
      muzzleAt(g, 0, 0, -0.1);
      break;
    case 'smoke':
      cyl(g, 0.045, 0.14, '#9aa1ad', 0, 0, -0.05);
      cyl(g, 0.047, 0.03, '#e8e8e8', 0, 0, -0.05);
      muzzleAt(g, 0, 0, -0.1);
      break;
    case 'medkit':
      box(g, 0.2, 0.14, 0.09, '#f4f4f4', 0, 0, -0.08);
      box(g, 0.1, 0.03, 0.092, '#e14b4b', 0, 0, -0.08);
      box(g, 0.03, 0.1, 0.092, '#e14b4b', 0, 0, -0.08);
      box(g, 0.08, 0.02, 0.04, DARK, 0, 0.08, -0.08);
      muzzleAt(g, 0, 0, -0.15);
      break;
    default:
      box(g, 0.08, 0.1, 0.3, METAL);
      muzzleAt(g, 0, 0, -0.2);
  }
  return g;
}

// 1인칭 화면에 보이는 손 + 총
const VM_SCALE = 0.42;
// 무기별 1인칭 크기/위치 보정
const VM = {
  minigun: { s: 0.27, p: [0.05, -0.06, 0.02] },
  rpg: { s: 0.32, p: [0.02, 0.0, 0.04] },
  sniper: { s: 0.38 },
  shotgun: { s: 0.4 },
  katana: { s: 0.26, p: [0.02, -0.02, 0] },
  hammer: { s: 0.28, p: [0.02, -0.04, 0] },
  knife: { s: 0.42 },
  medkit: { s: 0.26, p: [0, -0.01, -0.02] },
  grenade: { s: 0.4 },
  smoke: { s: 0.4 },
};
export function buildViewmodel(key, teamColor) {
  const root = new THREE.Group();
  const real = AS.getWeapon(key);
  const cfg = AS.WEAPON_MODELS[key];
  const gun = real || buildWeapon(key);
  root.add(gun);
  const v = VM[key] || {};
  const k = v.s || VM_SCALE;
  if (real) {
    if (cfg?.melee) gun.rotation.x = 1.05; // 칼날을 위로 세움
    gun.scale.multiplyScalar(k);
    if (v.p) gun.position.set(...v.p);
    // 손잡이를 쥔 장갑 (작게)
    const hand = new THREE.Group();
    box(hand, 0.022, 0.026, 0.03, '#3a3f4b', 0.002, -0.014, 0.004);
    hand.scale.setScalar(k / VM_SCALE);
    hand.position.copy(gun.position);
    if (cfg?.fwd === 'up') hand.position.y -= 0.03;
    root.add(hand);
  } else {
    const arm = new THREE.Group();
    box(arm, 0.07, 0.07, 0.07, '#f1c8a0', 0, -0.075, 0.02);
    box(arm, 0.075, 0.075, 0.1, teamColor, 0.01, -0.095, 0.1, -0.5);
    root.add(arm);
    gun.scale.setScalar(0.82); arm.scale.setScalar(0.82);
  }
  root.userData = { muzzle: gun.userData.muzzle, spin: gun.userData.spin, rocketTip: gun.userData.rocketTip, box: gun.userData.box, real: !!real };
  return root;
}

// 3인칭 캐릭터 (실제 모델이 로드됐으면 애니메이션 캐릭터, 아니면 블록 캐릭터)
export function buildAvatar(teamColor, darker) {
  if (AS.charReady()) {
    const g = AS.makeCharacter(teamColor, darker);
    g.userData.weapon = null; g.userData.weaponKey = null; g.userData.skinned = true;
    return g;
  }
  return buildBlockAvatar(teamColor, darker);
}

function buildBlockAvatar(teamColor, darker) {
  const g = new THREE.Group();
  const SKIN = '#f1c8a0', PANTS = '#2e3448', SHOE = '#1d2130';
  const legL = new THREE.Group(); legL.position.set(-0.14, 0.8, 0);
  const legR = new THREE.Group(); legR.position.set(0.14, 0.8, 0);
  box(legL, 0.24, 0.72, 0.28, PANTS, 0, -0.36, 0);
  box(legL, 0.25, 0.1, 0.32, SHOE, 0, -0.75, -0.02);
  box(legR, 0.24, 0.72, 0.28, PANTS, 0, -0.36, 0);
  box(legR, 0.25, 0.1, 0.32, SHOE, 0, -0.75, -0.02);
  g.add(legL, legR);
  box(g, 0.62, 0.62, 0.34, teamColor, 0, 1.11, 0);
  box(g, 0.64, 0.08, 0.36, darker, 0, 0.84, 0);
  const head = new THREE.Group(); head.position.set(0, 1.42, 0);
  box(head, 0.46, 0.44, 0.46, SKIN, 0, 0.23, 0);
  box(head, 0.48, 0.1, 0.48, darker, 0, 0.36, 0);
  g.add(head);
  const armR = new THREE.Group(); armR.position.set(0.4, 1.36, 0);
  box(armR, 0.18, 0.18, 0.56, teamColor, 0, 0, -0.22);
  const hand = new THREE.Group(); hand.position.set(-0.05, 0, -0.55);
  armR.add(hand);
  const armL = new THREE.Group(); armL.position.set(-0.4, 1.36, 0);
  box(armL, 0.18, 0.18, 0.5, teamColor, 0, 0, -0.2);
  armL.rotation.y = -0.45;
  g.add(armR, armL);
  g.userData = { legL, legR, head, armR, armL, hand, weapon: null, weaponKey: null };
  return g;
}

export function setAvatarWeapon(av, key) {
  const u = av.userData;
  if (u.weaponKey === key) return;
  if (u.weapon) u.weapon.parent?.remove(u.weapon);
  if (u.skinned) {
    const real = AS.getWeapon(key);
    const w = real || buildWeapon(key);
    w.scale.multiplyScalar(real ? 1.35 : 1.6);
    av.add(w);
    u.weapon = w;
  } else {
    const w = buildWeapon(key);
    w.scale.setScalar(1.6);
    u.hand.add(w);
    u.weapon = w;
  }
  u.weaponKey = key;
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _axis = new THREE.Vector3();
function fade(u, slot, next, t = 0.18) {
  const cur = u[slot];
  if (cur === next) return;
  next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.play();
  if (cur) cur.crossFadeTo(next, t, false);
  u[slot] = next;
}

// 애니메이션 캐릭터 갱신. o = { dt, speed, air, pitch, alive, melee, swing, throwing, dead }
export function animateAvatar(av, o) {
  const u = av.userData;
  if (!u.skinned) return false;
  const A = u.actions;
  if (!o.alive) {
    if (!u.dead) {
      u.dead = true;
      u.mixer.stopAllAction();
      A.death.reset(); A.death.play();
      if (u.weapon) u.weapon.visible = false;
    }
    u.mixer.update(o.dt);
    return true;
  }
  if (u.dead) {
    u.dead = false;
    u.mixer.stopAllAction();
    u.lower = null; u.upperAct = null;
    if (u.weapon) u.weapon.visible = true;
  }
  // 하체
  const lower = o.air ? A.jump : o.speed > 4.2 ? A.run : o.speed > 0.6 ? A.walk : A.idle;
  if (!u.lower) { lower.reset().play(); u.lower = lower; } else fade(u, 'lower', lower);
  if (lower === A.run) lower.timeScale = Math.max(0.7, o.speed / 6.5);
  if (lower === A.walk) lower.timeScale = Math.max(0.8, o.speed / 2.6);
  // 상체
  let upper = o.melee ? A.idleUp : A.aim;
  if (o.swing) { A.slash.reset(); upper = A.slash; u.oneShotUntil = performance.now() + 450; }
  else if (o.throwing) { A.throwUp.reset(); upper = A.throwUp; u.oneShotUntil = performance.now() + 450; }
  else if (u.oneShotUntil && performance.now() < u.oneShotUntil) upper = u.upperAct;
  if (!u.upperAct) {
    if (upper === A.aim) { A.aim.play(); A.aim.paused = true; A.aim.time = A.aim.getClip().duration * AS.AIM_T; } else upper.reset().play();
    u.upperAct = upper;
  } else if (upper !== u.upperAct) {
    if (upper === A.aim) { A.aim.reset(); A.aim.play(); A.aim.paused = true; A.aim.time = A.aim.getClip().duration * AS.AIM_T; }
    fade(u, 'upperAct', upper, 0.12);
  }
  if (u.torsoRest) u.bones.Torso.quaternion.copy(u.torsoRest);
  u.mixer.update(o.dt);
  // 위아래 시선: 상체를 시선 방향으로 숙이거나 젖힘
  av.updateMatrixWorld(true);
  const torso = u.bones.Torso;
  if (torso && torso.parent) {
    _axis.set(1, 0, 0).applyQuaternion(av.getWorldQuaternion(_q));
    torso.parent.getWorldQuaternion(_q2).invert();
    _axis.applyQuaternion(_q2).normalize();
    torso.quaternion.premultiply(_q.setFromAxisAngle(_axis, -o.pitch * 0.7));
    torso.updateMatrixWorld(true);
  }
  // 무기를 오른손 위치에 붙이고 시선 방향으로
  const hand = u.bones.FistR;
  if (u.weapon && hand) {
    hand.getWorldPosition(_v);
    av.worldToLocal(_v);
    u.weapon.position.copy(_v);
    const cfg = AS.WEAPON_MODELS[u.weaponKey] || {};
    u.weapon.rotation.set(o.pitch + (cfg.melee ? 1.1 : 0), 0, 0);
    if (o.swing || (u.upperAct === A.slash && performance.now() < (u.oneShotUntil || 0))) u.weapon.rotation.x -= 1.4;
  }
  return true;
}

// 이름표 (이름 + 체력바)
export function makeNameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(sm);
  sp.scale.set(1.7, 0.425, 1);
  sp.position.y = 2.35;
  sp.renderOrder = 10;
  sp.userData = { canvas, tex, last: '' };
  return sp;
}

export function drawNameTag(sp, name, hp, color, taunt) {
  const key = name + '|' + hp + '|' + color + '|' + (taunt || '');
  if (sp.userData.last === key) return;
  sp.userData.last = key;
  const { canvas, tex } = sp.userData;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.font = '700 26px "Black Han Sans", "Noto Sans KR", sans-serif';
  c.textAlign = 'center';
  c.lineWidth = 6;
  c.strokeStyle = '#1c1f2e';
  const label = taunt ? `${name}: ${taunt}` : name;
  c.strokeText(label, 128, 28);
  c.fillStyle = taunt ? '#ffd23f' : '#ffffff';
  c.fillText(label, 128, 28);
  // 체력바
  c.fillStyle = '#1c1f2e';
  c.fillRect(48, 40, 160, 16);
  c.fillStyle = color;
  c.fillRect(51, 43, Math.max(0, 154 * hp / 100), 10);
  tex.needsUpdate = true;
}
