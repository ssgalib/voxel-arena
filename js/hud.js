class HUD {
  constructor() {
    this.hpfill = U.el('hpfill');
    this.hptext = U.el('hptext');
    this.lowhp = U.el('lowhp');
    this.classtag = U.el('classtag');
    this.wname = U.el('wname');
    this.ammocur = U.el('ammocur');
    this.ammomax = U.el('ammomax');
    this.slotsRow = U.el('slotsRow');
    this.grencount = U.el('grencount');
    this.dashfill = U.el('dashfill');
    this.ch = U.el('ch');
    this.scopeEl = U.el('scope');
    this.hm = U.el('hm');
    this.vig = U.el('vignette');
    this.kfEl = U.el('killfeed');
    this.annEl = U.el('announce');
    this.subEl = U.el('subann');
    this.boardrows = U.el('boardrows');
    this.boardgoal = U.el('boardgoal');
    this.boardwrap = U.el('boardwrap');
    this.radarCv = U.el('radar');
    this.rctx = this.radarCv.getContext('2d');
    this.fpsEl = U.el('fpsmeter');
    this.protip = U.el('protip');
    this.death = U.el('death');
    this.deathKiller = U.el('deathKiller');
    this.deathCount = U.el('deathCount');

    this.slotEls = [];
    SLOT_ORDER.forEach((k, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = '<b>' + (i + 1) + '</b>' + WEAPONS[k].name.split(' ')[0];
      this.slotsRow.appendChild(d);
      this.slotEls.push(d);
    });

    this._vigT = 0;
    this._hmT = null;
    this._annT = null;
    this._subT = null;
    this._lastHud = {};
  }

  reset(clsLabel) {
    this.kfEl.innerHTML = '';
    this.classtag.textContent = clsLabel;
    this.vig.style.opacity = 0;
    this._vigT = 0;
    this.protip.style.opacity = 0;
  }

  _set(id, v) { if (this._lastHud[id] !== v) { this._lastHud[id] = v; return true; } return false; }

  health(hp, max) {
    const f = U.clamp(hp / max, 0, 1);
    if (this._set('hp', Math.round(f * 100))) {
      this.hpfill.style.width = (f * 100) + '%';
      this.hptext.textContent = Math.ceil(hp);
      this.hpfill.classList.toggle('hurt', f < 0.35);
      this.lowhp.classList.toggle('on', f < 0.28 && f > 0);
    }
  }

  ammo(cur, def, reloading) {
    if (this._set('wname', def.name)) this.wname.textContent = def.name;
    const txt = reloading ? '--' : cur;
    if (this._set('am', txt)) {
      this.ammocur.textContent = txt;
      this.ammocur.classList.toggle('low', !reloading && cur <= Math.max(3, def.mag * 0.2));
    }
    if (this._set('ammx', def.mag)) this.ammomax.textContent = '/ ' + def.mag;
  }

  slots(idx) { if (this._set('slot', idx)) this.slotEls.forEach((e, i) => e.classList.toggle('on', i === idx)); }
  grenades(n) { if (this._set('gr', n)) this.grencount.textContent = n; }
  dash(frac) { if (this._set('dash', Math.round(frac * 20))) this.dashfill.style.height = (frac * 100) + '%'; }

  crosshair(bloomPx) {
    this.ch.style.setProperty('--gap', bloomPx + 'px');
  }

  scope(on) {
    if (this._set('scope', !!on)) this.scopeEl.classList.toggle('on', !!on);
  }

  hitmark(kind) {
    this.hm.className = '';
    void this.hm.offsetWidth;
    this.hm.className = 'show' + (kind === 'crit' ? ' crit' : kind === 'kill' ? ' kill' : '');
  }

  setDmgFlash() {
    this._vigT = 1;
    this.vig.style.opacity = 0.85;
  }

  tick(dt) {
    if (this._vigT > 0) {
      this._vigT -= dt * 2.4;
      if (this._vigT <= 0) { this._vigT = 0; this.vig.style.opacity = 0; }
      else this.vig.style.opacity = this._vigT * 0.85;
    }
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _col(c) {
    const s = String(c);
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '#ffffff';
  }

  killFeed(kName, kCol, vName, vCol, wpn, head, sTier, vTier) {
    const d = document.createElement('div');
    d.className = 'kf';
    const sc = sTier ? ' t' + sTier : '', vc = vTier ? ' t' + vTier : '';
    d.innerHTML = '<b class="' + sc.trim() + '" style="color:' + this._col(kCol) + '">' + this._esc(kName) + '</b><i>[' + this._esc(wpn.toUpperCase()) + (head ? ' \u2022 HS' : '') + ']</i><b class="' + vc.trim() + '" style="color:' + this._col(vCol) + '">' + this._esc(vName) + '</b>';
    this.kfEl.prepend(d);
    while (this.kfEl.children.length > 6) this.kfEl.lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = 0; }, 3800);
    setTimeout(() => d.remove(), 4300);
  }

  announce(txt, sub) {
    this.annEl.textContent = txt;
    this.annEl.className = '';
    void this.annEl.offsetWidth;
    this.annEl.className = 'show';
    clearTimeout(this._annT);
    this._annT = setTimeout(() => { this.annEl.className = ''; }, 1600);
    if (sub !== undefined) this.subAnnounce(sub);
  }

  subAnnounce(txt) {
    this.subEl.textContent = txt;
    this.subEl.className = 'show';
    clearTimeout(this._subT);
    this._subT = setTimeout(() => { this.subEl.className = ''; }, 1800);
  }

  board(list, goalTxt, expanded) {
    if (this._set('goal', goalTxt)) this.boardgoal.textContent = goalTxt;
    let html = '';
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const tc = e.lvl && tierForLevel(e.lvl) ? ' t' + tierForLevel(e.lvl) : '';
      html += '<div class="brow' + (e.me ? ' me' : '') + '"><span class="bk">' + (i + 1) + '</span><span class="bn' + tc + '" style="color:' + e.col + '">' + this._esc(e.name) + '</span><span class="bs">' + (e.k | 0) + '</span><span class="bd">' + (e.d | 0) + '</span></div>';
    }
    if (this._set('board', html)) this.boardrows.innerHTML = html;
    this.boardwrap.classList.toggle('exp', !!expanded);
  }

  radar(combatants, selfPos, yaw) {
    const g = this.rctx;
    const R = 75, range = 44;
    g.clearRect(0, 0, 150, 150);
    g.save();
    g.beginPath();
    g.arc(75, 75, 73, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.arc(75, 75, 36, 0, Math.PI * 2); g.stroke();
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const e of combatants) {
      if (!e.alive || e.isPlayer) continue;
      const rx = e.body.pos.x - selfPos.x;
      const rz = e.body.pos.z - selfPos.z;
      let px = rx * cy - rz * sy;
      let py = -(rx * sy + rz * cy);
      const d = Math.sqrt(px * px + py * py);
      let edge = false;
      if (d > range) { edge = true; px *= range / d; py *= range / d; }
      const sx = 75 + px / range * R * 0.96;
      const syp = 75 + py / range * R * 0.96;
      g.fillStyle = '#' + e.colorHex.toString(16).padStart(6, '0');
      if (edge) { g.globalAlpha = 0.45; g.beginPath(); g.arc(sx, syp, 2.4, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.arc(sx, syp, 3.6, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(75, 68);
    g.lineTo(70, 79);
    g.lineTo(80, 79);
    g.closePath();
    g.fill();
    g.restore();
  }

  showDeath(killerName) {
    this.deathKiller.textContent = killerName;
    this.death.classList.remove('hidden');
  }
  deathTimer(t) { this.deathCount.textContent = Math.max(1, Math.ceil(t)); }
  hideDeath() { this.death.classList.add('hidden'); }

  fps(v) {
    if (this._set('fps', v)) this.fpsEl.textContent = v + ' FPS';
  }

  tip(txt) {
    this.protip.textContent = txt;
    this.protip.style.opacity = 1;
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => { this.protip.style.opacity = 0; }, 5000);
  }

  endScreen(rows, title, win) {
    U.el('endTitle').textContent = title;
    U.el('endTitle').style.color = win ? 'var(--acc)' : '#ff6b6b';
    let html = '';
    rows.forEach((r, i) => {
      const tc = r.lvl && tierForLevel(r.lvl) ? ' t' + tierForLevel(r.lvl) : '';
      html += '<div class="endRow' + (r.me ? ' me' : '') + '"><span class="rk">#' + (i + 1) + '</span><span class="nm' + tc + '" style="color:' + r.col + '">' + this._esc(r.name) + '</span><span class="kd">' + (r.k | 0) + ' / ' + (r.d | 0) + '</span></div>';
    });
    U.el('endBoardWrap').innerHTML = html;
  }
}
