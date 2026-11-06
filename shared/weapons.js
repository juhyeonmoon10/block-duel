// 서버와 클라이언트가 함께 쓰는 무기 데이터.
// 숫자를 바꾸면 양쪽에 동시에 반영됩니다 (밸런스 조절은 여기서).

export const MAX_HP = 100;

export const SLOTS = ['primary', 'secondary', 'melee', 'utility'];
export const SLOT_LABEL = { primary: '주무기', secondary: '보조무기', melee: '근접', utility: '장비' };

// kind: gun(히트스캔) | proj(투사체 발사) | melee | throw(던지기) | heal
// rpm: 분당 발사 수, dmg/minDmg + falloff:[감소 시작 m, 최소 데미지 도달 m]
// head: 헤드샷 배율, spread: 지향사격 탄퍼짐(rad), adsSpread: 조준 시 탄퍼짐
// speed: 들고 있을 때 이동속도 배율, zoom: 조준 시 확대 배율
export const WEAPONS = {
  // ───────── 주무기 ─────────
  ar: {
    name: '돌격소총', slot: 'primary', kind: 'gun', auto: true,
    rpm: 620, dmg: 24, minDmg: 17, falloff: [22, 55], head: 1.5,
    mag: 30, reload: 2.0, spread: 0.012, adsSpread: 0.002, recoil: 0.011,
    zoom: 1.35, speed: 1.0, desc: '무난한 만능형. 처음이면 이거.',
    snd: { f: 1100, d: 0.10, low: 140, v: 0.55 },
  },
  burst: {
    name: '버스트 소총', slot: 'primary', kind: 'gun', auto: false, burst: 3, burstGap: 0.065,
    rpm: 210, dmg: 29, minDmg: 21, falloff: [30, 70], head: 1.6,
    mag: 24, reload: 2.2, spread: 0.009, adsSpread: 0.0012, recoil: 0.009,
    zoom: 1.7, speed: 0.98, desc: '3점사. 중거리 헤드 3방이면 끝.',
    snd: { f: 1300, d: 0.08, low: 160, v: 0.5 },
  },
  smg: {
    name: '기관단총', slot: 'primary', kind: 'gun', auto: true,
    rpm: 900, dmg: 16, minDmg: 9, falloff: [11, 28], head: 1.35,
    mag: 35, reload: 1.7, spread: 0.022, adsSpread: 0.012, recoil: 0.008,
    zoom: 1.2, speed: 1.08, desc: '빠르고 가볍다. 근거리 난사.',
    snd: { f: 1600, d: 0.06, low: 200, v: 0.42 },
  },
  shotgun: {
    name: '샷건', slot: 'primary', kind: 'gun', auto: false, pellets: 9,
    rpm: 75, dmg: 12, minDmg: 3, falloff: [6, 18], head: 1.25,
    mag: 6, reload: 2.4, spread: 0.075, adsSpread: 0.055, recoil: 0.05,
    zoom: 1.15, speed: 1.0, desc: '붙으면 한 방. 멀면 간지럽다.',
    snd: { f: 600, d: 0.22, low: 90, v: 0.8 },
  },
  sniper: {
    name: '저격총', slot: 'primary', kind: 'gun', auto: false, scope: true,
    rpm: 42, dmg: 90, minDmg: 90, falloff: [999, 999], head: 2.0,
    mag: 5, reload: 2.6, spread: 0.09, adsSpread: 0, recoil: 0.06,
    zoom: 4.0, speed: 0.9, desc: '조준하면 일직선. 헤드 원샷.',
    snd: { f: 500, d: 0.35, low: 70, v: 0.9 },
  },
  minigun: {
    name: '미니건', slot: 'primary', kind: 'gun', auto: true, spinup: 0.55,
    rpm: 1300, dmg: 11, minDmg: 7, falloff: [15, 40], head: 1.3,
    mag: 150, reload: 3.6, spread: 0.034, adsSpread: 0.024, recoil: 0.004,
    zoom: 1.1, speed: 0.72, desc: '예열 후 탄막. 대신 느려진다.',
    snd: { f: 1400, d: 0.05, low: 120, v: 0.35 },
  },
  rpg: {
    name: '로켓 런처', slot: 'primary', kind: 'proj', proj: 'rocket', auto: false,
    rpm: 60, mag: 1, reload: 2.3, projSpeed: 36,
    dmg: 95, radius: 4.0, selfDmg: 0.35, knock: 15, recoil: 0.07,
    zoom: 1.2, speed: 0.92, spread: 0, adsSpread: 0,
    desc: '범위 폭발. 발밑에 쏘면 로켓점프.',
    snd: { f: 300, d: 0.4, low: 60, v: 0.8 },
  },

  // ───────── 보조무기 ─────────
  pistol: {
    name: '권총', slot: 'secondary', kind: 'gun', auto: false,
    rpm: 420, dmg: 26, minDmg: 17, falloff: [15, 40], head: 1.6,
    mag: 12, reload: 1.3, spread: 0.008, adsSpread: 0.003, recoil: 0.018,
    zoom: 1.25, speed: 1.05, desc: '연타 가능한 기본 권총.',
    snd: { f: 1500, d: 0.09, low: 180, v: 0.45 },
  },
  revolver: {
    name: '리볼버', slot: 'secondary', kind: 'gun', auto: false,
    rpm: 115, dmg: 52, minDmg: 38, falloff: [20, 50], head: 1.75,
    mag: 6, reload: 2.1, spread: 0.01, adsSpread: 0.0015, recoil: 0.05,
    zoom: 1.35, speed: 1.0, desc: '느리지만 묵직. 헤드 2방.',
    snd: { f: 700, d: 0.2, low: 90, v: 0.75 },
  },
  uzi: {
    name: '우지', slot: 'secondary', kind: 'gun', auto: true,
    rpm: 1050, dmg: 13, minDmg: 7, falloff: [9, 24], head: 1.3,
    mag: 28, reload: 1.5, spread: 0.03, adsSpread: 0.02, recoil: 0.006,
    zoom: 1.12, speed: 1.08, desc: '보조인데 연사. 근접 난전용.',
    snd: { f: 1800, d: 0.05, low: 220, v: 0.38 },
  },

  // ───────── 근접 ─────────
  knife: {
    name: '나이프', slot: 'melee', kind: 'melee',
    rate: 0.42, dmg: 40, range: 2.5, arc: 0.55, knock: 2,
    speed: 1.18, desc: '들고 뛰면 제일 빠르다.',
  },
  katana: {
    name: '카타나', slot: 'melee', kind: 'melee',
    rate: 0.72, dmg: 62, range: 3.3, arc: 0.75, knock: 3,
    speed: 1.1, desc: '리치가 길고 두 방에 끝.',
  },
  hammer: {
    name: '해머', slot: 'melee', kind: 'melee',
    rate: 0.95, dmg: 50, range: 2.8, arc: 0.7, knock: 13,
    speed: 1.0, desc: '맞으면 멀리 날아간다.',
  },

  // ───────── 장비 ─────────
  grenade: {
    name: '수류탄', slot: 'utility', kind: 'throw', proj: 'grenade', count: 2,
    fuse: 2.0, dmg: 100, radius: 4.6, knock: 10, selfDmg: 0.5, throwSpeed: 17,
    desc: '2초 뒤 폭발. 튕겨서 넘겨라.',
  },
  smoke: {
    name: '연막탄', slot: 'utility', kind: 'throw', proj: 'smoke', count: 2,
    fuse: 1.1, duration: 9, radius: 4.2, throwSpeed: 17,
    desc: '시야 차단. 저격수 카운터.',
  },
  medkit: {
    name: '구급상자', slot: 'utility', kind: 'heal', count: 1,
    heal: 50, useTime: 1.0, desc: '1초 사용 후 체력 +50.',
  },
};

export const DEFAULT_LOADOUT = { primary: 'ar', secondary: 'pistol', melee: 'knife', utility: 'grenade' };

export function weaponsForSlot(slot) {
  return Object.keys(WEAPONS).filter((k) => WEAPONS[k].slot === slot);
}

export function sanitizeLoadout(l) {
  const out = { ...DEFAULT_LOADOUT };
  if (l && typeof l === 'object') {
    for (const s of SLOTS) {
      const w = WEAPONS[l[s]];
      if (w && w.slot === s) out[s] = l[s];
    }
  }
  return out;
}

// 거리별 데미지
export function damageAt(w, dist) {
  if (!w.falloff) return w.dmg;
  const [a, b] = w.falloff;
  if (dist <= a) return w.dmg;
  if (dist >= b) return w.minDmg;
  const t = (dist - a) / (b - a);
  return w.dmg + (w.minDmg - w.dmg) * t;
}

// 연사 간격(초). 버스트는 탄 사이 간격.
export function minShotGap(w) {
  if (w.burst) return w.burstGap;
  return 60 / w.rpm;
}

// 1초당 최대 발사 수 (서버 검증용)
export function maxShotsPerSec(w) {
  if (w.burst) return (w.burst * w.rpm) / 60;
  return w.rpm / 60;
}
