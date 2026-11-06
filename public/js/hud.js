// 게임 화면 위 HTML 오버레이 (체력, 탄약, 크로스헤어, 킬피드 등)
import { WEAPONS, SLOTS } from '/shared/weapons.js';
import { iconUrl } from './assets.js';

const $ = (id) => document.getElementById(id);
const TEAM_CLASS = ['red', 'blue'];

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), hpNum: $('hp-num'), hpFill: $('hp-fill'), wName: $('w-name'),
      ammoCur: $('ammo-cur'), ammoMag: $('ammo-mag'), reload: $('w-reload'), slots: $('slots'),
      cross: $('crosshair'), hit: $('hitmarker'), dmgNums: $('dmg-numbers'), dmgDirs: $('dmg-dirs'),
      center: $('center-msg'), progress: $('progress'), killfeed: $('killfeed'),
      scope: $('scope'), vignette: $('vignette'), smoke: $('smoke-cover'),
      sbRed: $('sb-red'), sbBlue: $('sb-blue'), sbRedNames: $('sb-red-names'), sbBlueNames: $('sb-blue-names'),
      sbRedPips: $('sb-red-pips'), sbBluePips: $('sb-blue-pips'), sbRound: $('sb-round'), sbTimer: $('sb-timer'),
      ping: $('ping'), death: $('death-box'), spec: $('spec-box'), tauntMenu: $('taunt-menu'),
      scoreboard: $('scoreboard'), util: $('util-count'),
    };
    this.centerTimer = null;
    this.hitTimer = null;
    this.lastHp = 100;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setHp(hp) {
    const v = Math.max(0, Math.round(hp));
    this.el.hpNum.textContent = v;
    this.el.hpFill.style.width = v + '%';
    this.el.hpFill.classList.toggle('low', v <= 35);
    this.el.vignette.classList.toggle('low', v > 0 && v <= 30);
    this.lastHp = v;
  }

  setWeapon(key, ammo, mag, utilLeft) {
    const w = WEAPONS[key];
    if (!w) return;
    this.el.wName.textContent = w.name;
    if (this._wIcon !== key) { this._wIcon = key; const im = document.getElementById('w-icon'); if (im) im.src = iconUrl(key); }
    if (w.kind === 'gun' || w.kind === 'proj') {
      this.el.ammoCur.textContent = ammo;
      this.el.ammoMag.textContent = '/ ' + mag;
      this.el.ammoCur.classList.toggle('empty', ammo === 0);
      this.el.ammoCur.classList.toggle('low', ammo > 0 && ammo <= Math.ceil(mag * 0.25));
    } else if (w.kind === 'melee') {
      this.el.ammoCur.textContent = '∞';
      this.el.ammoMag.textContent = '';
      this.el.ammoCur.classList.remove('empty', 'low');
    } else {
      this.el.ammoCur.textContent = utilLeft;
      this.el.ammoMag.textContent = '개 남음';
      this.el.ammoCur.classList.toggle('empty', utilLeft === 0);
      this.el.ammoCur.classList.remove('low');
    }
  }

  setReload(t) {
    // t: 0~1 진행률, -1이면 숨김
    if (t < 0) { this.el.reload.classList.remove('on'); return; }
    this.el.reload.classList.add('on');
    this.el.reload.firstElementChild.style.width = (t * 100).toFixed(1) + '%';
  }

  setSlots(loadout, cur, utilLeft) {
    const html = SLOTS.map((s, i) => {
      const w = WEAPONS[loadout[s]];
      const extra = s === 'utility' ? ` <em>×${utilLeft}</em>` : '';
      return `<div class="slot ${s === cur ? 'on' : ''} ${s === 'utility' && utilLeft === 0 ? 'out' : ''}"><kbd>${s === 'utility' ? 'G' : i + 1}</kbd><img src="${iconUrl(loadout[s])}" alt="">${w.name}${extra}</div>`;
    }).join('');
    if (html !== this._slotsHtml) { this.el.slots.innerHTML = html; this._slotsHtml = html; }
  }

  crosshair(gapPx, visible, kind) {
    const c = this.el.cross;
    c.style.setProperty('--gap', Math.min(90, gapPx).toFixed(1) + 'px');
    c.classList.toggle('hidden', !visible);
    c.dataset.kind = kind || '';
  }

  hitmarker(head, kill) {
    const h = this.el.hit;
    h.className = '';
    void h.offsetWidth;
    h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => (h.className = ''), kill ? 420 : 200);
  }

  damageNumber(x, y, dmg, head) {
    const d = document.createElement('div');
    d.className = 'dmg-num' + (head ? ' head' : '');
    d.textContent = dmg;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.style.setProperty('--dx', (Math.random() * 40 - 20).toFixed(0) + 'px');
    this.el.dmgNums.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  hurt(angle) {
    const v = this.el.vignette;
    v.classList.remove('hurt');
    void v.offsetWidth;
    v.classList.add('hurt');
    if (angle != null) {
      const a = document.createElement('div');
      a.className = 'dmg-dir';
      a.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      this.el.dmgDirs.appendChild(a);
      setTimeout(() => a.remove(), 1100);
    }
  }

  center(big, sub = '', cls = '', ms = 1600) {
    const c = this.el.center;
    c.querySelector('.big').textContent = big;
    c.querySelector('.sub').textContent = sub;
    c.className = 'on ' + cls;
    clearTimeout(this.centerTimer);
    if (ms > 0) this.centerTimer = setTimeout(() => (c.className = ''), ms);
  }
  clearCenter() { this.el.center.className = ''; }

  progress(label, t) {
    const p = this.el.progress;
    if (t < 0) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    p.querySelector('.label').textContent = label;
    p.querySelector('i').style.width = (t * 100).toFixed(1) + '%';
  }

  killfeed({ killer, victim, weapon, head, mine, me }) {
    const row = document.createElement('div');
    row.className = 'kf' + (mine ? ' mine' : '') + (me ? ' me' : '');
    const w = WEAPONS[weapon];
    const wname = weapon === 'fall' ? '추락' : (w ? w.name : weapon);
    row.innerHTML = (killer ? `<b class="${TEAM_CLASS[killer.team]}">${esc(killer.name)}</b>` : '') +
      `<span class="kw">${w ? `<img src="${iconUrl(weapon)}" alt="${esc(wname)}" title="${esc(wname)}">` : esc(wname)}${head ? ' <i>헤드샷</i>' : ''}</span>` +
      `<b class="${TEAM_CLASS[victim.team]}">${esc(victim.name)}</b>`;
    this.el.killfeed.prepend(row);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 5600);
  }

  score(room, players) {
    const winR = room.winRounds;
    this.el.sbRed.textContent = room.score[0];
    this.el.sbBlue.textContent = room.score[1];
    const names = [[], []];
    for (const p of players) names[p.team].push(p.name);
    this.el.sbRedNames.textContent = names[0].join(', ');
    this.el.sbBlueNames.textContent = names[1].join(', ');
    const pips = (n) => Array.from({ length: winR }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    this.el.sbRedPips.innerHTML = pips(room.score[0]);
    this.el.sbBluePips.innerHTML = pips(room.score[1]);
    this.el.sbRound.textContent = room.round ? `라운드 ${room.round}` : '';
  }

  timer(sec, urgent) {
    if (sec == null) { this.el.sbTimer.textContent = ''; return; }
    const s = Math.max(0, Math.ceil(sec));
    this.el.sbTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.sbTimer.classList.toggle('urgent', !!urgent);
  }

  scope(on) { this.el.scope.classList.toggle('hidden', !on); }
  smoke(op) { this.el.smoke.style.opacity = op.toFixed(2); }
  ping(ms) { this.el.ping.textContent = ms == null ? '' : `핑 ${ms}ms`; }

  death(info) {
    const d = this.el.death;
    if (!info) { d.classList.add('hidden'); return; }
    d.classList.remove('hidden');
    d.innerHTML = info;
  }

  spectate(text) {
    const s = this.el.spec;
    if (!text) { s.classList.add('hidden'); return; }
    s.classList.remove('hidden');
    s.innerHTML = text;
  }

  tauntMenu(list, open) {
    const m = this.el.tauntMenu;
    if (!open) { m.classList.add('hidden'); return; }
    m.innerHTML = list.map((t, i) => `<div><kbd>${i + 1}</kbd>${esc(t)}</div>`).join('');
    m.classList.remove('hidden');
  }

  scoreboard(open, room, players, meId) {
    const s = this.el.scoreboard;
    if (!open) { s.classList.add('hidden'); return; }
    s.classList.remove('hidden');
    const rows = (team) => players.filter((p) => p.team === team).map((p) =>
      `<tr class="${p.id === meId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${WEAPONS[p.loadout.primary].name}</td></tr>`).join('');
    s.innerHTML = `<h3>${esc(room.name)} <small>${room.id}</small></h3>` +
      [0, 1].map((t) => `<table class="${TEAM_CLASS[t]}"><thead><tr><th>${t ? '블루' : '레드'} ${room.score[t]}</th><th>킬</th><th>데스</th><th>주무기</th></tr></thead><tbody>${rows(t)}</tbody></table>`).join('');
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
