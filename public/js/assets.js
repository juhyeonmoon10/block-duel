// 3D 에셋 로더. 모델은 전부 CC0 (Quaternius, Kenney 등 — CREDITS.md 참고)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/models/';
const loader = new GLTFLoader();
const cache = new Map();

// 무기 모델 설정
// fwd: 원본 파일에서 총구가 향한 축, len: 실제 길이(m), gz: 뒤끝에서 손잡이까지 비율, gy: 바닥에서 손잡이 높이 비율
export const WEAPON_MODELS = {
  ar:       { fwd: '+x', len: 0.86, gz: 0.17, gy: 0.42 },
  burst:    { fwd: '+x', len: 0.86, gz: 0.30, gy: 0.45 },
  smg:      { fwd: '+x', len: 0.62, gz: 0.40, gy: 0.45 },
  shotgun:  { fwd: '+x', len: 1.00, gz: 0.30, gy: 0.45 },
  sniper:   { fwd: '+x', len: 1.18, gz: 0.24, gy: 0.40 },
  minigun:  { fwd: '+z', len: 1.00, gz: 0.20, gy: 0.30, recolor: ['#4a505b', '#24272e'] },
  rpg:      { fwd: '+x', len: 1.10, gz: 0.48, gy: 0.20 },
  pistol:   { fwd: '+x', len: 0.22, gz: 0.24, gy: 0.30 },
  revolver: { fwd: '+x', len: 0.30, gz: 0.17, gy: 0.28 },
  uzi:      { fwd: '+x', len: 0.36, gz: 0.19, gy: 0.40 },
  knife:    { fwd: '+y', len: 0.30, gz: 0.16, gy: 0.50, melee: true },
  katana:   { fwd: '+y', len: 0.95, gz: 0.08, gy: 0.50, melee: true },
  hammer:   { fwd: '+y', len: 0.78, gz: 0.12, gy: 0.50, melee: true },
  grenade:  { fwd: 'up', len: 0.11, gz: 0.50, gy: 0.30 },
  smoke:    { fwd: 'up', len: 0.15, gz: 0.50, gy: 0.30 },
  medkit:   { fwd: 'up', len: 0.22, gz: 0.50, gy: 0.30 },
};

export const PROPS = [
  'truck-grey', 'truck-green-cargo',
  'detail-light-single', 'pallet',
];

function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

// 모든 에셋 미리 받기 (진행률 콜백)
export async function preloadAll(onProgress) {
  const urls = [
    BASE + 'soldier.glb',
    ...Object.keys(WEAPON_MODELS).map((k) => BASE + 'w_' + k + '.glb'),
    ...PROPS.map((p) => BASE + 'p_' + p + '.glb'),
  ];
  let done = 0;
  await Promise.all(urls.map((u) => load(u).then(() => { done++; onProgress?.(done / urls.length); })));
  await loadTextures();
}

// ───────────── 무기 ─────────────
const weaponTemplates = new Map();

function prepWeapon(key, gltf) {
  const cfg = WEAPON_MODELS[key];
  const inner = gltf.scene.clone(true);
  let mi = 0;
  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.material = o.material.clone();
      if (cfg.recolor) { o.material.color.set(cfg.recolor[mi++ % cfg.recolor.length]); o.material.map = null; }
      o.material.side = THREE.FrontSide;
      if (o.material.metalness > 0.4) o.material.metalness = 0.4;
    }
  });
  const pivot = new THREE.Group();
  const orient = new THREE.Group();
  orient.add(inner);
  pivot.add(orient);
  if (cfg.fwd === '+x') orient.rotation.y = Math.PI / 2;
  else if (cfg.fwd === '+z') orient.rotation.y = Math.PI;
  else if (cfg.fwd === '+y') orient.rotation.x = -Math.PI / 2;
  pivot.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(orient);
  const size = box.getSize(new THREE.Vector3());
  const along = cfg.fwd === 'up' ? size.y : size.z;
  orient.scale.setScalar(cfg.len / along);
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(orient);
  const s2 = box.getSize(new THREE.Vector3());
  // 손잡이를 원점으로
  const grip = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.min.y + s2.y * cfg.gy,
    cfg.fwd === 'up' ? (box.min.z + box.max.z) / 2 : box.max.z - s2.z * cfg.gz,
  );
  orient.position.sub(grip);
  pivot.updateMatrixWorld(true);
  // 총구 위치: 가장 앞쪽 정점들의 평균
  box = new THREE.Box3().setFromObject(orient);
  const muzzle = new THREE.Vector3(0, 0, box.min.z);
  if (cfg.fwd !== 'up' && !cfg.melee) {
    const v = new THREE.Vector3();
    let sy = 0, sx = 0, n = 0;
    const lim = box.min.z + (box.max.z - box.min.z) * 0.02;
    inner.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.z <= lim) { sy += v.y; sx += v.x; n++; }
      }
    });
    if (n) muzzle.set(sx / n, sy / n, box.min.z);
  }
  const mz = new THREE.Object3D();
  mz.name = 'muzzle';
  mz.position.copy(muzzle);
  pivot.add(mz);
  pivot.userData = { muzzle: mz, size: box.getSize(new THREE.Vector3()), box };
  return pivot;
}

export function getWeapon(key) {
  const t = weaponTemplates.get(key);
  if (!t) return null;
  const c = t.clone(true);
  c.userData = { size: t.userData.size, box: t.userData.box, muzzle: c.getObjectByName('muzzle') };
  return c;
}

export async function loadWeapons() {
  await Promise.all(Object.keys(WEAPON_MODELS).map(async (k) => {
    const g = await load(BASE + 'w_' + k + '.glb');
    weaponTemplates.set(k, prepWeapon(k, g));
  }));
}

// ───────────── 캐릭터 ─────────────
let soldier = null;
export const CHAR_HEIGHT = 1.8;

export async function loadCharacter() {
  const g = await load(BASE + 'soldier.glb');
  const box = new THREE.Box3().setFromObject(g.scene);
  const scale = CHAR_HEIGHT / (box.max.y - box.min.y);
  const clips = {};
  for (const a of g.animations) clips[a.name] = a;
  soldier = { scene: g.scene, scale, minY: box.min.y, clips };
}

// GLTFLoader가 뼈 이름의 '.'을 지움 (Fist.R → FistR)
const UPPER = new Set(['Abdomen', 'Torso', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'FistL', 'ShoulderR', 'UpperArmR', 'LowerArmR', 'FistR']);
const splitCache = new Map();
function splitClip(name, part) {
  const key = name + '|' + part;
  if (splitCache.has(key)) return splitCache.get(key);
  const src = soldier.clips[name];
  const tracks = src.tracks.filter((t) => {
    const bone = t.name.split('.').slice(0, -1).join('.');
    return part === 'upper' ? UPPER.has(bone) : !UPPER.has(bone);
  });
  const c = new THREE.AnimationClip(name + '_' + part, src.duration, tracks);
  splitCache.set(key, c);
  return c;
}

// 팀 색 입힌 캐릭터 인스턴스
export function makeCharacter(teamColor, teamDark) {
  const model = SkeletonUtils.clone(soldier.scene);
  const tint = {
    Main: teamColor, Helmet: teamDark, DarkGreen: teamDark, Skin: '#f2c49b', Black: '#262a35', Face: '#ffffff',
  };
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map((m) => {
        const c = m.clone();
        if (tint[m.name]) c.color.set(tint[m.name]);
        c.roughness = 0.85; c.metalness = 0;
        return c;
      });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    }
  });
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(soldier.scale);
  holder.position.y = -soldier.minY * soldier.scale;
  holder.rotation.y = Math.PI; // 모델은 +Z를 보고 있음 → 게임은 -Z가 정면
  root.add(holder);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(model);
  const act = (name, part, loop = true) => {
    const a = mixer.clipAction(part ? splitClip(name, part) : soldier.clips[name]);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    return a;
  };
  const actions = {
    idle: act('Idle', 'lower'), walk: act('Walk', 'lower'), run: act('Run', 'lower'), jump: act('Jump', 'lower'),
    aim: act('Shoot_OneHanded', 'upper'), idleUp: act('Idle', 'upper'), slash: act('SwordSlash', 'upper', false),
    throwUp: act('Punch', 'upper', false), hit: act('RecieveHit', null, false), death: act('Death', null, false),
    victory: act('Victory', null),
  };
  // 조준 자세는 팔을 앞으로 뻗은 순간에서 멈춘 포즈로 사용
  actions.aim.play(); actions.aim.paused = true; actions.aim.time = soldier.clips.Shoot_OneHanded.duration * AIM_T;
  actions.idle.play();
  const torsoRest = bones.Torso ? bones.Torso.quaternion.clone() : null;
  root.userData = { model, holder, bones, mixer, actions, state: 'idle', upper: 'aim', torsoRest };
  return root;
}

export const AIM_T = 0.4;
export function charReady() { return !!soldier; }

// ───────────── 맵 텍스처 ─────────────
const TEX_NAMES = ['asphalt', 'concrete', 'metal', 'metal_wall', 'planks', 'roof', 'roof_plates', 'tiles', 'wall', 'wall_lines', 'wall_garage'];
const textures = {};
async function loadTextures() {
  const tl = new THREE.TextureLoader();
  await Promise.all(TEX_NAMES.map(async (n) => {
    const t = await tl.loadAsync(BASE + 'Textures/' + n + '.png');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures[n] = t;
  }));
}
export function tex(name) { return textures[name] || null; }

// ───────────── 소품 ─────────────
export async function getProp(name) {
  const g = await load(BASE + 'p_' + name + '.glb');
  const s = g.scene.clone(true);
  s.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.colorSpace = THREE.SRGBColorSpace; }
      if (m.transparent || (m.map && /tree/.test(m.map.name || ''))) { m.alphaTest = 0.5; m.transparent = false; }
    }
  });
  return s;
}

export function iconUrl(key) { return '/assets/icons/' + key + '.png'; }
