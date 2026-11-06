// 맵 데이터. 모든 지형은 박스(블록)로만 구성됩니다.
// 팀 A(레드)는 -Z 쪽, 팀 B(블루)는 +Z 쪽에서 시작. 맵은 Z축 대칭이라 공정합니다.

function builder() {
  const boxes = [];
  const B = (x0, y0, z0, x1, y1, z1, c) => {
    boxes.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      c,
    });
  };
  // Z 대칭 (팀 반대편 복사)
  const mz = (x0, y0, z0, x1, y1, z1, c) => { B(x0, y0, z0, x1, y1, z1, c); B(x0, y0, -z0, x1, y1, -z1, c); };
  // X 대칭
  const mx = (x0, y0, z0, x1, y1, z1, c) => { B(x0, y0, z0, x1, y1, z1, c); B(-x0, y0, z0, -x1, y1, z1, c); };
  // 4방향 대칭
  const m4 = (x0, y0, z0, x1, y1, z1, c) => { mz(x0, y0, z0, x1, y1, z1, c); mz(-x0, y0, z0, -x1, y1, z1, c); };
  // Z 방향 계단: 시작점에서 dir 방향으로 내려감
  const stairsZ = (x0, x1, zStart, dir, n, depth, h, c, sym) => {
    for (let i = 0; i < n; i++) {
      const a = zStart + dir * i * depth, b = zStart + dir * (i + 1) * depth;
      (sym || B)(x0, 0, a, x1, (n - i) * h, b, c);
    }
  };
  const stairsX = (z0, z1, xStart, dir, n, depth, h, c, sym) => {
    for (let i = 0; i < n; i++) {
      const a = xStart + dir * i * depth, b = xStart + dir * (i + 1) * depth;
      (sym || B)(a, 0, z0, b, (n - i) * h, z1, c);
    }
  };
  return { boxes, B, mz, mx, m4, stairsZ, stairsX };
}

// ─────────────────────────── 1. 블록 창고 ───────────────────────────
function warehouse() {
  const { boxes, B, mz, mx, m4 } = builder();
  const FLOOR = '#a7adb5', WALL = '#d8c7a8', WALL2 = '#b9a58a', CRATE = '#d9964b', CRATE2 = '#c47a35',
    COVER = '#6f93bd', PLAT = '#e8c45a', STEP = '#d6b24e', PILLAR = '#8d7f70', TEAL = '#5fb3a1';

  B(-18, -1, -26, 18, 0, 26, FLOOR);
  B(-19, 0, -27, -18, 8, 27, WALL); B(18, 0, -27, 19, 8, 27, WALL);
  B(-18, 0, -27, 18, 8, -26, WALL); B(-18, 0, 26, 18, 8, 27, WALL);

  // 스폰 앞 엄폐벽 (가운데 틈)
  mz(-5.5, 0, -21.5, -1.6, 2.6, -20.6, COVER);
  mz(1.6, 0, -21.5, 5.5, 2.6, -20.6, COVER);
  m4(11, 0, -23, 13.5, 2, -20.5, CRATE);
  m4(11.5, 2, -22.5, 12.5, 3, -21.5, CRATE2);

  // 레인 벽
  m4(8.4, 0, -14, 9.4, 3.4, -6.5, WALL2);
  // 중앙 상자 더미
  m4(3.8, 0, -10.5, 6, 2, -8.3, CRATE);
  m4(4.4, 2, -10, 5.4, 3, -9, CRATE2);
  m4(6.6, 0, -2.2, 7.6, 1, -1.2, CRATE);
  // 낮은 엄폐 (점프로 넘기 가능)
  mz(-2.6, 0, -14.2, 2.6, 1.1, -13.4, COVER);
  // 사이드 기둥 & 엄폐
  m4(12.6, 0, -13, 14.2, 5.5, -11.4, PILLAR);
  mx(13.4, 0, -3, 15.4, 2.8, 3, TEAL);
  m4(15.6, 0, -8, 17, 1.2, -5.5, CRATE);

  // 중앙 단상 + 4면 계단
  B(-3, 0, -3, 3, 1.6, 3, PLAT);
  mz(-1.5, 0, 3, 1.5, 1.2, 4, STEP);
  mz(-1.5, 0, 4, 1.5, 0.8, 5, STEP);
  mz(-1.5, 0, 5, 1.5, 0.4, 6, STEP);
  mx(3, 0, -1.5, 4, 1.2, 1.5, STEP);
  mx(4, 0, -1.5, 5, 0.8, 1.5, STEP);
  mx(5, 0, -1.5, 6, 0.4, 1.5, STEP);
  // 단상 위 엄폐
  mx(1.6, 1.6, -0.5, 2.6, 2.6, 0.5, CRATE2);

  return {
    id: 'warehouse', name: '블록 창고', desc: '중앙 단상을 먹는 쪽이 유리한 기본 맵',
    boxes,
    sky: '#9fd3f5', fog: '#cfe6f5', fogNear: 30, fogFar: 90,
    spawns: [
      [{ p: [-2.6, 0, -23.6], yaw: Math.PI }, { p: [2.6, 0, -23.6], yaw: Math.PI }],
      [{ p: [-2.6, 0, 23.6], yaw: 0 }, { p: [2.6, 0, 23.6], yaw: 0 }],
    ],
    specCam: { p: [0, 26, 34], target: [0, 0, 0] },
    killY: -15,
  };
}

// ─────────────────────────── 2. 루프탑 ───────────────────────────
function rooftops() {
  const { boxes, B, mz, mx, m4, stairsZ, stairsX } = builder();
  const STREET = '#5c6370', LINE = '#e9d36c', BLDG = '#c98f74', ROOF = '#d9a184', ROOF2 = '#a9b8c9',
    ROOF3 = '#9cc59a', PLANK = '#8b6a4f', AC = '#e3e6ea', TANK = '#6aa6c9', CAR1 = '#e85d5d', CAR2 = '#5d8fe8', STAIR = '#b98a6e';

  B(-20, -1, -30, 20, 0, 30, STREET);
  B(-0.25, 0, -12, 0.25, 0.03, 12, LINE);
  B(-21, 0, -31, -20, 12, 31, BLDG); B(20, 0, -31, 21, 12, 31, BLDG);
  B(-20, 0, -31, 20, 12, -30, BLDG); B(-20, 0, 30, 20, 12, 31, BLDG);

  // 팀 옥상 (높이 4)
  mz(-8, 0, -28, 8, 4, -15, ROOF);
  mz(-6.2, 4, -20.4, -4.4, 5.3, -18.6, AC);
  mz(4.4, 4, -20.4, 6.2, 5.3, -18.6, AC);
  mz(-1.5, 4, -16.4, 1.5, 5.0, -15.6, AC);
  // 팀 옥상 → 거리 계단 (양옆)
  stairsZ(8, 10, -27.6, 1, 8, 1.15, 0.5, STAIR, m4);

  // 중앙 옥상 (높이 4)
  B(-5, 0, -5, 5, 4, 5, ROOF2);
  B(-1, 4, -1, 1, 5.2, 1, AC);
  m4(2.6, 4, -3.6, 3.6, 4.9, -2.6, AC);
  // 팀 옥상 ↔ 중앙 다리
  mz(-1.2, 3.7, -15, 1.2, 4, -5, PLANK);
  // 중앙 옥상 → 거리 계단 (X 방향)
  stairsX(-1.5, 1.5, 5, 1, 8, 0.75, 0.5, STAIR, mx);

  // 사이드 옥상 (높이 2.5)
  mx(11, 0, -12, 18, 2.5, 12, ROOF3);
  mx(14, 2.5, -2, 15, 3.8, 2, AC);
  m4(15.5, 2.5, -8.5, 17.2, 4.6, -6.5, TANK);
  m4(11.5, 2.5, -10.5, 12.5, 3.4, -9.5, AC);
  stairsZ(12.6, 14.6, -12, -1, 5, 1, 0.5, STAIR, m4);

  // 거리 위 자동차 엄폐
  m4(6.2, 0, -12.5, 8.2, 1.4, -8.5, CAR1);
  m4(6.6, 1.4, -11.6, 7.8, 2.0, -9.4, CAR1);
  mx(-3.5, 0, -12.5, -1.5, 1.4, -8.5, CAR2);

  return {
    id: 'rooftops', name: '루프탑', desc: '높은 곳을 잡아라. 떨어져도 계단으로 복귀',
    boxes,
    sky: '#f7c9a0', fog: '#f5d7bf', fogNear: 35, fogFar: 100,
    spawns: [
      [{ p: [-3, 4, -24.5], yaw: Math.PI }, { p: [3, 4, -24.5], yaw: Math.PI }],
      [{ p: [-3, 4, 24.5], yaw: 0 }, { p: [3, 4, 24.5], yaw: 0 }],
    ],
    specCam: { p: [0, 30, 38], target: [0, 2, 0] },
    killY: -15,
  };
}

// ─────────────────────────── 3. 큐브 아레나 (빠른 1v1) ───────────────────────────
function arena() {
  const { boxes, B, mz, mx, m4 } = builder();
  const FLOOR = '#b7c4b0', WALL = '#7c8fa3', PIL = '#f0b35a', LOW = '#e07a7a', MID = '#8f7ad6', STEP = '#a996e6';

  B(-13, -1, -15, 13, 0, 15, FLOOR);
  B(-14, 0, -16, -13, 6, 16, WALL); B(13, 0, -16, 14, 6, 16, WALL);
  B(-13, 0, -16, 13, 6, -15, WALL); B(-13, 0, 15, 13, 6, 16, WALL);

  m4(4.2, 0, -6, 5.8, 4, -4.4, PIL);
  m4(8.5, 0, -11, 11, 1.1, -10.2, LOW);
  mz(-2, 0, -10.6, 2, 1.1, -9.8, LOW);
  m4(9.5, 0, -2, 10.5, 2.2, -0.6, LOW);
  // 중앙 큐브 + 계단
  B(-1.6, 0, -1.6, 1.6, 2, 1.6, MID);
  mx(1.6, 0, -1, 2.6, 1.5, 1, STEP);
  mx(2.6, 0, -1, 3.6, 1.0, 1, STEP);
  mx(3.6, 0, -1, 4.2, 0.5, 1, STEP);

  return {
    id: 'arena', name: '큐브 아레나', desc: '작고 빠른 맵. 한 판이 금방 끝남',
    boxes,
    sky: '#c3b6f2', fog: '#e0d9fa', fogNear: 25, fogFar: 70,
    spawns: [
      [{ p: [-2.5, 0, -13], yaw: Math.PI }, { p: [2.5, 0, -13], yaw: Math.PI }],
      [{ p: [-2.5, 0, 13], yaw: 0 }, { p: [2.5, 0, 13], yaw: 0 }],
    ],
    specCam: { p: [0, 20, 24], target: [0, 0, 0] },
    killY: -15,
  };
}

export const MAPS = { warehouse: warehouse(), rooftops: rooftops(), arena: arena() };
export const MAP_IDS = Object.keys(MAPS);
