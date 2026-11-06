// 맵 겉모습: 박스 색 → 텍스처/색조, 장식 소품 배치.
// 텍스처는 Kenney Retro Urban Kit (CC0). s = 1m당 반복 횟수.
export const SKINS = {
  warehouse: {
    sky: ['#8ec5ef', '#dcefff'],
    colors: {
      '#a7adb5': { t: 'concrete', s: 0.5, tint: '#e8ecf0' },
      '#d8c7a8': { t: 'wall_lines', s: 0.5, tint: '#ffffff' },
      '#b9a58a': { t: 'wall', s: 0.5, tint: '#ffffff' },
      '#d9964b': { t: 'planks', s: 1, tint: '#f2c48f' },
      '#c47a35': { t: 'planks', s: 1, tint: '#c98a52' },
      '#6f93bd': { t: 'concrete', s: 0.8, tint: '#c6d6ea' },
      '#e8c45a': { t: 'roof_plates', s: 0.7, tint: '#ffe08a' },
      '#d6b24e': { t: 'roof_plates', s: 0.7, tint: '#f2cf6a' },
      '#8d7f70': { t: 'concrete', s: 0.7, tint: '#c9bcae' },
      '#5fb3a1': { t: 'metal_wall', s: 0.7, tint: '#cfeee6' },
    },
    deco: [
      // 벽에 붙은 조명 (충돌 없음)
      ...[-12, 0, 12].flatMap((z) => [
        { box: [-18, 5.6, z - 1.2, -17.8, 5.9, z + 1.2], glow: '#fff3c4' },
        { box: [17.8, 5.6, z - 1.2, 18, 5.9, z + 1.2], glow: '#fff3c4' },
      ]),
      { prop: 'pallet', at: [-16.5, 0, 9], size: [1.6, 0.18, 1.6] },
      { prop: 'pallet', at: [16.5, 0, -9], size: [1.6, 0.18, 1.6] },
      { prop: 'pallet', at: [-16.5, 0, -9], size: [1.6, 0.18, 1.6], rot: 0.3 },
      { prop: 'pallet', at: [16.5, 0, 9], size: [1.6, 0.18, 1.6], rot: -0.3 },
    ],
  },
  rooftops: {
    sky: ['#f4a87c', '#ffe3c6'],
    colors: {
      '#5c6370': { t: 'asphalt', s: 0.4, tint: '#eef0f5' },
      '#e9d36c': { color: '#f2d65c' },
      '#c98f74': { t: 'wall', s: 0.33, tint: '#ffffff' },
      '#d9a184': { t: 'roof_plates', s: 0.6, tint: '#e9b598' },
      '#a9b8c9': { t: 'tiles', s: 0.6, tint: '#d4dde8' },
      '#9cc59a': { t: 'roof', s: 0.6, tint: '#b9e0b4' },
      '#8b6a4f': { t: 'planks', s: 1, tint: '#d6a77a' },
      '#e3e6ea': { t: 'metal', s: 1, tint: '#ffffff' },
      '#6aa6c9': { t: 'metal_wall', s: 0.8, tint: '#9fd0ef' },
      '#b98a6e': { t: 'concrete', s: 0.8, tint: '#e2c2ab' },
    },
    deco: [
      ...[-22, -6, 6, 22].flatMap((z) => [
        { prop: 'detail-light-single', at: [-19.2, 0, z], size: [0.5, 4.6, 1.6], rot: Math.PI / 2 },
        { prop: 'detail-light-single', at: [19.2, 0, z], size: [0.5, 4.6, 1.6], rot: -Math.PI / 2 },
      ]),
    ],
  },
  arena: {
    sky: ['#9d8ef0', '#ebe6ff'],
    colors: {
      '#b7c4b0': { t: 'tiles', s: 0.5, tint: '#e4eadf' },
      '#7c8fa3': { t: 'wall_garage', s: 0.33, tint: '#c8d4e2' },
      '#f0b35a': { t: 'metal_wall', s: 0.7, tint: '#ffcf86' },
      '#e07a7a': { t: 'concrete', s: 0.8, tint: '#f4a3a3' },
      '#8f7ad6': { t: 'roof_plates', s: 0.6, tint: '#b8a6f4' },
      '#a996e6': { t: 'roof_plates', s: 0.6, tint: '#cbbef6' },
    },
    deco: [
      ...[-10, 0, 10].flatMap((x) => [
        { box: [x - 1.4, 4.2, -15, x + 1.4, 4.5, -14.8], glow: '#f2ecff' },
        { box: [x - 1.4, 4.2, 14.8, x + 1.4, 4.5, 15], glow: '#f2ecff' },
      ]),
    ],
  },
};
