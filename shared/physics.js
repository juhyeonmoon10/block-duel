// 서버/클라이언트 공용 물리: 박스(AABB) 충돌, 레이캐스트, 히트박스.
// 플레이어 위치 p = 발바닥 중앙 [x, y, z]

export const PLAYER_R = 0.32;   // 가로 반지름 (AABB 반폭)
export const PLAYER_H = 1.8;    // 키
export const EYE_H = 1.62;      // 눈 높이
export const GRAVITY = 24;
export const JUMP_V = 8.6;
export const WALK_SPEED = 7.2;
export const STEP_H = 0.55;     // 자동으로 올라가는 턱 높이
const EPS = 1e-4;

function hits(px, py, pz, b) {
  return (
    px + PLAYER_R > b.min[0] && px - PLAYER_R < b.max[0] &&
    py + PLAYER_H > b.min[1] && py < b.max[1] &&
    pz + PLAYER_R > b.min[2] && pz - PLAYER_R < b.max[2]
  );
}

function anyHit(px, py, pz, boxes) {
  for (let i = 0; i < boxes.length; i++) if (hits(px, py, pz, boxes[i])) return true;
  return false;
}

// 한 축씩 이동하며 충돌 처리. st = { p:[x,y,z], v:[x,y,z], onGround:bool }
export function moveAndCollide(st, boxes, dt) {
  const speed = Math.hypot(st.v[0], st.v[1], st.v[2]);
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) step(st, boxes, h);
}

function step(st, boxes, dt) {
  const p = st.p, v = st.v;
  const wasGround = st.onGround;
  v[1] -= GRAVITY * dt;

  // X, Z 축
  for (const ax of [0, 2]) {
    const prev = p[ax];
    p[ax] += v[ax] * dt;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!hits(p[0], p[1], p[2], b)) continue;
      // 계단 자동 오르기
      const rise = b.max[1] - p[1];
      if (wasGround && rise > 0 && rise <= STEP_H && !anyHit(p[0], b.max[1] + EPS, p[2], boxes)) {
        p[1] = b.max[1] + EPS;
        continue;
      }
      if (prev <= (b.min[ax] + b.max[ax]) / 2) p[ax] = b.min[ax] - PLAYER_R - EPS;
      else p[ax] = b.max[ax] + PLAYER_R + EPS;
      v[ax] = 0;
    }
  }

  // Y 축
  p[1] += v[1] * dt;
  st.onGround = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!hits(p[0], p[1], p[2], b)) continue;
    if (v[1] <= 0) {
      p[1] = b.max[1];
      st.onGround = true;
    } else {
      p[1] = b.min[1] - PLAYER_H - EPS;
    }
    v[1] = 0;
  }
  // 바닥에 딱 붙어있는지 한 번 더 확인 (경사 오르내릴 때 떨림 방지)
  if (!st.onGround && v[1] <= 0 && anyHit(p[0], p[1] - 0.05, p[2], boxes)) {
    st.onGround = true;
  }
}

// 레이 vs 박스. 반환: [t, 법선축, 부호] 또는 null
export function rayBox(o, d, min, max) {
  let tmin = 0, tmax = Infinity, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (min[i] - o[i]) * inv, t2 = (max[i] - o[i]) * inv;
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return [tmin, axis, sign];
}

// 맵 레이캐스트. 반환 { t, n:[nx,ny,nz] } (안 맞으면 t = maxT)
export function rayMap(o, d, maxT, boxes) {
  let best = maxT, n = null;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const r = rayBox(o, d, b.min, b.max);
    if (r && r[0] < best) {
      best = r[0];
      n = [0, 0, 0];
      if (r[1] >= 0) n[r[1]] = r[2];
    }
  }
  return { t: best, n };
}

export function playerBoxes(p) {
  return [
    { zone: 'head', min: [p[0] - 0.26, p[1] + 1.36, p[2] - 0.26], max: [p[0] + 0.26, p[1] + 1.88, p[2] + 0.26] },
    { zone: 'body', min: [p[0] - 0.36, p[1], p[2] - 0.32], max: [p[0] + 0.36, p[1] + 1.36, p[2] + 0.32] },
  ];
}

// 레이 vs 플레이어. 반환 { t, zone } 또는 null
export function rayPlayer(o, d, p, maxT) {
  let best = null;
  for (const hb of playerBoxes(p)) {
    const r = rayBox(o, d, hb.min, hb.max);
    if (r && r[0] < maxT && (!best || r[0] < best.t)) best = { t: r[0], zone: hb.zone };
  }
  return best;
}

export function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// 두 점 사이에 벽이 있는지
export function lineOfSight(a, b, boxes) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return true;
  const dir = [d[0] / len, d[1] / len, d[2] / len];
  return rayMap(a, dir, len, boxes).t >= len - 0.05;
}

// yaw(좌우), pitch(상하) → 시선 방향 벡터. yaw=0 이면 -Z 방향.
export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
