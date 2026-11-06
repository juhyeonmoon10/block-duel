// 효과음은 전부 Web Audio로 합성합니다 (음원 파일 없음 → 로딩 0, 오프라인 OK)
let ctx = null, master = null, noise = null;
let volume = 0.6;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function out(vol = 1, pan = 0) {
  const g = ctx.createGain();
  g.gain.value = vol;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(master);
  } else g.connect(master);
  return g;
}

function noiseBurst(dest, { f = 1000, q = 0.8, dur = 0.1, vol = 1, type = 'bandpass', attack = 0.002 }) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = f;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(dest, { f0 = 200, f1 = 50, dur = 0.1, vol = 1, type = 'sine', delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// 총소리: 무기별 snd = { f: 대역, d: 길이, low: 저음 펀치, v: 볼륨 }
export function gunshot(snd, vol = 1, pan = 0) {
  if (!ctx || !snd) return;
  const o = out(vol * snd.v, pan);
  noiseBurst(o, { f: snd.f * (0.92 + Math.random() * 0.16), q: 0.7, dur: snd.d, vol: 1 });
  noiseBurst(o, { f: 4200, q: 0.5, dur: snd.d * 0.35, vol: 0.4, type: 'highpass' });
  tone(o, { f0: snd.low * 2.2, f1: snd.low * 0.5, dur: snd.d * 1.3, vol: 0.9 });
}

export function explosion(vol = 1, pan = 0) {
  if (!ctx) return;
  const o = out(vol, pan);
  noiseBurst(o, { f: 380, q: 0.4, dur: 0.9, vol: 1.2, type: 'lowpass', attack: 0.005 });
  tone(o, { f0: 120, f1: 28, dur: 0.7, vol: 1.2 });
  noiseBurst(o, { f: 2400, q: 0.6, dur: 0.18, vol: 0.5 });
}

export function rocketLaunch(vol = 1, pan = 0) {
  if (!ctx) return;
  const o = out(vol, pan);
  noiseBurst(o, { f: 700, q: 0.5, dur: 0.45, vol: 0.9, attack: 0.02 });
  tone(o, { f0: 90, f1: 40, dur: 0.3, vol: 0.7 });
}

export function hitmark(head, kill) {
  if (!ctx) return;
  const o = out(0.55);
  if (kill) {
    tone(o, { f0: 880, f1: 880, dur: 0.09, vol: 0.5, type: 'square' });
    tone(o, { f0: 1320, f1: 1320, dur: 0.22, vol: 0.45, type: 'square', delay: 0.07 });
  } else if (head) {
    tone(o, { f0: 1900, f1: 1700, dur: 0.16, vol: 0.55, type: 'triangle' });
  } else {
    tone(o, { f0: 1250, f1: 1100, dur: 0.05, vol: 0.4, type: 'triangle' });
  }
}

export function hurt() {
  if (!ctx) return;
  const o = out(0.6);
  tone(o, { f0: 160, f1: 70, dur: 0.15, vol: 0.8, type: 'sawtooth' });
}

export function dryFire() {
  if (!ctx) return;
  tone(out(0.4), { f0: 2200, f1: 1800, dur: 0.03, vol: 0.6, type: 'square' });
}

export function reload(vol = 1, pan = 0) {
  if (!ctx) return;
  const o = out(0.45 * vol, pan);
  noiseBurst(o, { f: 3000, q: 2, dur: 0.05, vol: 0.8 });
  setTimeout(() => ctx && noiseBurst(out(0.45 * vol, pan), { f: 2200, q: 2, dur: 0.07, vol: 0.9 }), 260);
}

export function swing(vol = 1, pan = 0) {
  if (!ctx) return;
  noiseBurst(out(0.5 * vol, pan), { f: 1600, q: 1.2, dur: 0.18, vol: 0.8, attack: 0.05 });
}

export function throwSound(vol = 1, pan = 0) {
  if (!ctx) return;
  noiseBurst(out(0.4 * vol, pan), { f: 900, q: 1, dur: 0.15, vol: 0.7, attack: 0.04 });
}

export function smokePop(vol = 1, pan = 0) {
  if (!ctx) return;
  noiseBurst(out(0.6 * vol, pan), { f: 500, q: 0.3, dur: 1.4, vol: 0.8, type: 'lowpass', attack: 0.05 });
}

export function heal() {
  if (!ctx) return;
  const o = out(0.5);
  tone(o, { f0: 660, f1: 660, dur: 0.12, vol: 0.4, type: 'triangle' });
  tone(o, { f0: 990, f1: 990, dur: 0.2, vol: 0.4, type: 'triangle', delay: 0.1 });
}

export function swap() {
  if (!ctx) return;
  noiseBurst(out(0.3), { f: 2600, q: 3, dur: 0.04, vol: 0.7 });
}

export function jumpLand(vol = 0.3) {
  if (!ctx) return;
  noiseBurst(out(vol), { f: 220, q: 0.6, dur: 0.08, vol: 0.8, type: 'lowpass' });
}

// 카운트다운/라운드 알림
export function beep(high) {
  if (!ctx) return;
  tone(out(0.5), { f0: high ? 1046 : 523, f1: high ? 1046 : 523, dur: high ? 0.4 : 0.15, vol: 0.5, type: 'square' });
}

export function fanfare(win) {
  if (!ctx) return;
  const o = out(0.5);
  const notes = win ? [523, 659, 784, 1046] : [392, 349, 311, 262];
  notes.forEach((f, i) => tone(o, { f0: f, f1: f, dur: 0.22, vol: 0.45, type: 'square', delay: i * 0.13 }));
}

export function taunt() {
  if (!ctx) return;
  const o = out(0.4);
  tone(o, { f0: 700, f1: 1100, dur: 0.12, vol: 0.4, type: 'triangle' });
}

// 3D 위치 → 볼륨/팬
export function spatial(src, cam, yaw) {
  const dx = src[0] - cam[0], dz = src[2] - cam[2], dy = src[1] - cam[1];
  const d = Math.hypot(dx, dy, dz);
  const vol = Math.max(0.05, Math.min(1, 6 / (d + 3)));
  // 카메라 오른쪽 벡터 = (cos yaw, 0, -sin yaw)
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const pan = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
  return { vol, pan: pan * 0.8 };
}
