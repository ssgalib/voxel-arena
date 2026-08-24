const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

function Game() {
  this.settings = { sens: 1.0, vol: 0.7, pixelate: false };
  try {
    const s = JSON.parse(LS.get('voxelarena_settings'));
    if (s) Object.assign(this.settings, s);
  } catch (e) {}
  this.keys = new Set();
  this.tabHeld = false;
  this.state = 'menu';
  this.player = null;
  this.bots = [];
  this.rockets = [];
  this.grenades = [];
  this.cfg = { diff: 'normal', limit: 20 };
  this.shake = 0;
  this.boardT = 0;
  this.fpsAcc = 0;
  this.fpsN = 0;
  this.fpsT = 0;
  this.tipI = 0;
  this.tipT = 0;
  this.streakTimes = [];
  this.clock = new THREE.Clock();

  this.initGL();
  this.sfx = new Sfx();
  this.sfx.volume = this.settings.vol;
  const camRef = this.camera;
  this.sfx.getListener = () => ({
    pos: camRef.position,
    right: { x: Math.cos(camRef.rotation.y), z: -Math.sin(camRef.rotation.y) }
  });
  this.effects = new Effects(this);
  this.hud = new HUD();
  this.bindUI();
  this.bindInput();
  this.applyResolution();
  this.loop = this.loop.bind(this);
  requestAnimationFrame(this.loop);
}

Game.prototype.initGL = function () {
  const canvas = U.el('c');
  this.canvas = canvas;
  this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x87b5e0);
  this.scene.fog = new THREE.Fog(0x87b5e0, 70, 170);
  this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 400);
  this.camera.rotation.order = 'YXZ';
  this.scene.add(this.camera);
  this.world = buildWorld(this.scene);
  this.menuAngle = 0;
};

Game.prototype.applyResolution = function () {
  this.renderer.setPixelRatio(this.settings.pixelate ? 0.5 : Math.min(devicePixelRatio || 1, 2));
  this.renderer.setSize(innerWidth, innerHeight, false);
  this.camera.aspect = innerWidth / innerHeight;
  this.camera.updateProjectionMatrix();
};

Game.prototype.saveSettings = function () { LS.set('voxelarena_settings', JSON.stringify(this.settings)); };

Game.prototype.raycastWorld = function (o, d, len) { return raycastBoxes(o, d, len, this.world.colliders); };

Game.prototype.losClear = function (a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.01) return true;
  const hit = this.raycastWorld(a, { x: dx / len, y: dy / len, z: dz / len }, len);
  return !hit || hit.t > len - 0.05;
};

Game.prototype.combatants = function () {
  const arr = [];
  if (this.player) arr.push(this.player);
  for (const b of this.bots) arr.push(b);
  return arr;
};

Game.prototype.hurt = function (ent, amount, src, isHead, wpn) {
  if (!ent || !ent.alive) return false;
  if (src && src.quadT > 0 && src !== ent) amount *= 2;
  return ent.isPlayer ? ent.hurt(amount, src, isHead, wpn) : ent.takeDamage(amount, src, isHead, wpn);
};

const WPN_LABEL = { rifle: 'AR', shotgun: 'SHOTGUN', sniper: 'SNIPER', rpg: 'ROCKET', grenade: 'GRENADE' };

Game.prototype.registerKill = function (src, victim, isHead, wpn) {
  if (src && src !== victim) src.score.k++;
  const sName = src === victim ? victim.name : (src ? src.name : '?');
  const sCol = src && src.cls ? src.cls.color : '#' + ((src && src.colorHex) || 0xffffff).toString(16).padStart(6, '0');
  const vCol = victim.cls ? victim.cls.color : '#' + victim.colorHex.toString(16).padStart(6, '0');
  this.hud.killFeed(sName, sCol, victim.name, vCol, WPN_LABEL[wpn] || wpn, isHead);

  if (src && src.isPlayer && victim !== src) {
    const now = performance.now() / 1000;
    this.streakTimes.push(now);
    this.streakTimes = this.streakTimes.filter(t => now - t < 4.5);
    const n = this.streakTimes.length;
    if (n === 2) this.hud.subAnnounce('DOUBLE KILL');
    else if (n === 3) this.hud.subAnnounce('TRIPLE KILL');
    else if (n === 4) this.hud.subAnnounce('QUAD KILL');
    else if (n >= 5) this.hud.subAnnounce('RAMPAGE');
    this.hud.hitmark('kill');
  }
  if (victim.isPlayer) {
    this.canvas.style.filter = 'grayscale(0.85) brightness(0.8)';
    this.hud.showDeath(sName);
  }
  if (src && src.score.k >= this.cfg.limit) this.endMatch(src);
};

Game.prototype.pickSpawn = function (self) {
  const spawns = this.world.spawns;
  let best = spawns[0], bestScore = -Infinity;
  for (const s of spawns) {
    let minD = Infinity;
    for (const e of this.combatants()) {
      if (e === self || !e.alive) continue;
      const p = e.body ? e.body.pos : e.center(new THREE.Vector3());
      const d = (p.x - s.x) ** 2 + (p.z - s.z) ** 2;
      if (d < minD) minD = d;
    }
    const sc = minD + U.rand(0, 90);
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return best;
};

Game.prototype.addShake = function (a) { this.shake = Math.min(this.shake + a, 0.9); };

Game.prototype.resetHeldInputs = function () {
  this.mouseAds = false;
  const p = this.player;
  if (!p) return;
  p.fireHeld = false;
  p.fireEdge = false;
  p.grenadeEdge = false;
  p.dashEdge = false;
  p.adsHeld = false;
};

Game.prototype.spawnRocket = function (pos, dir, owner) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.55), new THREE.MeshLambertMaterial({ color: 0xff8c3a }));
  m.position.copy(pos);
  this.scene.add(m);
  this.rockets.push({ mesh: m, pos: pos.clone(), vel: dir.clone().multiplyScalar(WEAPONS.rpg.speed), owner: owner, t: 0 });
};

Game.prototype.spawnGrenade = function (pos, vel, owner) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3d5c34 }));
  m.position.copy(pos);
  m.castShadow = true;
  this.scene.add(m);
  this.grenades.push({ mesh: m, pos: pos.clone(), vel: vel.clone(), owner: owner, fuse: GRENADE.fuse });
};

Game.prototype._explode = function (pos, radius, dmgMax, owner, wpn) {
  this.effects.explosion(pos, radius);
  this.sfx.play('explosion', pos);
  const cp = this.camera.position;
  const camD = Math.sqrt((cp.x - pos.x) ** 2 + (cp.y - pos.y) ** 2 + (cp.z - pos.z) ** 2);
  this.addShake(U.clamp(1.4 - camD * 0.04, 0, 0.8));
  const tmpC = new THREE.Vector3();
  for (const e of this.combatants()) {
    if (!e.alive) continue;
    e.center(tmpC);
    const d = tmpC.distanceTo(pos);
    if (d > radius) continue;
    const probe = pos.clone(); probe.y += 0.5;
    if (!this.losClear(probe, tmpC)) continue;
    const falloff = Math.pow(1 - d / radius, 0.85);
    let dmg = dmgMax * falloff;
    if (e === owner) dmg *= 0.55;
    const kbDir = tmpC.clone().sub(pos).normalize();
    if (e.isPlayer) {
      e.body.vel.addScaledVector(kbDir, 10 * falloff);
      e.body.vel.y = Math.max(e.body.vel.y, 6.5 * falloff + 2);
    } else {
      e.kb.addScaledVector(kbDir, 11 * falloff);
    }
    this.hurt(e, Math.round(dmg), owner, false, wpn);
  }
};

Game.prototype.updateProjectiles = function (dt) {
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (let i = this.rockets.length - 1; i >= 0; i--) {
    const r = this.rockets[i];
    r.t += dt;
    tmpA.copy(r.pos);
    r.vel.y -= 3.5 * dt;
    r.pos.addScaledVector(r.vel, dt);
    tmpB.copy(r.pos).sub(tmpA);
    const len = tmpB.length();
    let hitT = 0, hitEnt = null;
    if (len > 0.0001) {
      tmpB.multiplyScalar(1 / len);
      const wall = this.raycastWorld(tmpA, tmpB, len);
      if (wall) hitT = wall.t;
      for (const e of this.combatants()) {
        if (e === r.owner || !e.alive) continue;
        const t = segBox(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, len, e.getAABB());
        if (t !== false && (hitT === 0 || t < hitT)) { hitT = t; hitEnt = e; }
      }
    } else hitT = 0;
    if (r.t > 6) hitT = 0;
    if (wallHitOrTime(hitT, r.t)) {
      const boomAt = tmpA.addScaledVector(tmpB, hitT);
      if (hitEnt) boomAt.y += 0.8;
      this.scene.remove(r.mesh);
      this.rockets.splice(i, 1);
      this._explode(boomAt, WEAPONS.rpg.radius, WEAPONS.rpg.dmg, r.owner, 'rocket');
      continue;
    }
    r.mesh.position.copy(r.pos);
    tmpA.copy(r.pos).add(r.vel);
    r.mesh.lookAt(tmpA);
    this.effects.burst(r.pos, { n: 1, color: 0x777c82, speed: 1.2, size: 0.14, life: 0.4, gravity: -1.5 });
  }

  for (let i = this.grenades.length - 1; i >= 0; i--) {
    const gr = this.grenades[i];
    gr.fuse -= dt;
    gr.vel.y -= 22 * dt;
    const rr = 0.15, hh = 0.3;
    let nx = gr.pos.x + gr.vel.x * dt;
    if (this._sphereBlocked(nx, gr.pos.y + hh / 2, gr.pos.z, rr)) gr.vel.x *= -0.42; else gr.pos.x = nx;
    let nz = gr.pos.z + gr.vel.z * dt;
    if (this._sphereBlocked(gr.pos.x, gr.pos.y + hh / 2, nz, rr)) gr.vel.z *= -0.42; else gr.pos.z = nz;
    let ny = gr.pos.y + gr.vel.y * dt;
    if (ny <= 0) { ny = 0; gr.vel.y *= -0.42; gr.vel.x *= 0.72; gr.vel.z *= 0.72; if (Math.abs(gr.vel.y) < 1.2) gr.vel.y = 0; }
    else if (this._sphereBlocked(gr.pos.x, ny + hh / 2, gr.pos.z, rr)) {
      if (gr.vel.y < 0) { const gy = this._groundBelow(gr.pos.x, gr.pos.z, gr.pos.y); if (gy >= 0 && ny < gy) { ny = gy; gr.vel.y *= -0.42; } else gr.vel.y *= -0.42; }
      else gr.vel.y *= -0.42;
    }
    gr.pos.y = ny;
    gr.vel.x *= Math.exp(-0.6 * dt);
    gr.vel.z *= Math.exp(-0.6 * dt);
    gr.mesh.position.copy(gr.pos);
    gr.mesh.material.color.setHex(Math.floor(gr.fuse * 8) % 2 === 0 && gr.fuse < 0.9 ? 0xff5040 : 0x3d5c34);
    if (gr.fuse <= 0) {
      this.scene.remove(gr.mesh);
      this.grenades.splice(i, 1);
      this._explode(gr.pos.clone(), GRENADE.radius, GRENADE.dmg, gr.owner, 'grenade');
    }
  }
};

Game.prototype._sphereBlocked = function (x, y, z, r) {
  for (const b of this.world.colliders) {
    if (x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1 && z + r > b.z0 && z - r < b.z1) return true;
  }
  return false;
};

Game.prototype._groundBelow = function (x, z, y) {
  let g = 0;
  for (const b of this.world.colliders) {
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 <= y && b.y1 > g) g = b.y1;
  }
  return g;
};

function wallHitOrTime(t, life) { return t > 0 || life > 6; }

Game.prototype.clearMatchObjects = function () {
  if (this.pickups) { this.pickups.dispose(); this.pickups = null; }
  for (const b of this.bots) b.dispose();
  this.bots = [];
  for (const r of this.rockets) this.scene.remove(r.mesh);
  this.rockets = [];
  for (const g of this.grenades) this.scene.remove(g.mesh);
  this.grenades = [];
  if (this.player) {
    for (const k of SLOT_ORDER) this.camera.remove(this.player.models[k]);
    this.player = null;
  }
  this.canvas.style.filter = '';
  this.hud.hideDeath();
};

Game.prototype.startMatch = function () {
  this.clearMatchObjects();
  const clsKey = document.querySelector('.classCard.sel').dataset.class;
  this.cfg.limit = parseInt(document.querySelector('#targetRow .seg.sel').dataset.target);
  this.cfg.diff = document.querySelector('#diffRow .seg.sel').dataset.diff;
  const playerName = (U.el('nameInput').value.trim() || 'YOU').toUpperCase().slice(0, 14);

  this.player = new Player(this, clsKey);
  this.player.name = playerName;
  this.pickups = new Pickups(this);
  const names = BOT_NAMES.slice();
  const cols = BOT_COLORS.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = names[i]; names[i] = names[j]; names[j] = t; }
  for (let i = cols.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
  for (let i = 0; i < 7; i++) this.bots.push(new Bot(this, names[i], cols[i], this.cfg.diff));

  U.el('menu').classList.add('hidden');
  U.el('end').classList.add('hidden');
  U.el('hud').classList.remove('hidden');
  this.state = 'playing';
  this.streakTimes = [];
  this.tipT = 4;
  this.tipI = 0;
  this.hud.reset(this.player.cls.label);
  this.hud.announce('FIGHT', 'FIRST TO ' + this.cfg.limit + ' FRAGS');
  const pl = this.canvas.requestPointerLock();
  if (pl && pl.catch) pl.catch(() => {});
};

Game.prototype.endMatch = function (winner) {
  this.state = 'end';
  document.exitPointerLock();
  this.resetHeldInputs();
  this.canvas.style.filter = '';
  this.hud.hideDeath();
  const list = this.combatants().slice().sort((a, b) => b.score.k - a.score.k || a.score.d - b.score.d);
  const rows = list.map(e => ({
    name: e.name,
    col: e.cls ? e.cls.color : '#' + e.colorHex.toString(16).padStart(6, '0'),
    k: e.score.k, d: e.score.d, me: !!e.isPlayer
  }));
  this.hud.endScreen(rows, winner.isPlayer ? 'VICTORY' : winner.name + ' WINS', !!winner.isPlayer);
  U.el('end').classList.remove('hidden');
  U.el('hud').classList.add('hidden');
};

Game.prototype.quitToMenu = function () {
  this.state = 'menu';
  document.exitPointerLock();
  this.resetHeldInputs();
  this.clearMatchObjects();
  U.el('pause').classList.add('hidden');
  U.el('end').classList.add('hidden');
  U.el('hud').classList.add('hidden');
  U.el('menu').classList.remove('hidden');
};

Game.prototype.bindUI = function () {
  const self = this;
  U.el('playBtn').onclick = () => { self.sfx.ensure(); self.sfx.play('ui'); self.startMatch(); };
  U.el('resumeBtn').onclick = () => { self.sfx.play('ui'); const pl = self.canvas.requestPointerLock(); if (pl && pl.catch) pl.catch(() => {}); };
  U.el('quitBtn').onclick = () => { self.sfx.play('ui'); self.quitToMenu(); };
  U.el('rematchBtn').onclick = () => { self.sfx.play('ui'); self.startMatch(); };
  U.el('endMenuBtn').onclick = () => { self.sfx.play('ui'); self.quitToMenu(); };

  document.querySelectorAll('.classCard').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.classCard').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      self.sfx.ensure(); self.sfx.play('ui');
    };
  });
  document.querySelectorAll('#diffRow .seg').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#diffRow .seg').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); self.sfx.ensure(); self.sfx.play('ui');
    };
  });
  document.querySelectorAll('#targetRow .seg').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#targetRow .seg').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); self.sfx.ensure(); self.sfx.play('ui');
    };
  });

  const sr = U.el('sensRange'), vr = U.el('volRange'), pc = U.el('pixChk');
  sr.value = this.settings.sens; vr.value = this.settings.vol; pc.checked = this.settings.pixelate;
  U.el('sensVal').textContent = Number(this.settings.sens).toFixed(2);
  U.el('volVal').textContent = Number(this.settings.vol).toFixed(2);
  sr.oninput = () => { self.settings.sens = parseFloat(sr.value); U.el('sensVal').textContent = self.settings.sens.toFixed(2); self.saveSettings(); };
  vr.oninput = () => { self.settings.vol = parseFloat(vr.value); self.sfx.setVolume(self.settings.vol); U.el('volVal').textContent = self.settings.vol.toFixed(2); self.saveSettings(); };
  pc.onchange = () => { self.settings.pixelate = pc.checked; self.applyResolution(); self.saveSettings(); };

  addEventListener('resize', () => self.applyResolution());
  U.el('nameInput').value = LS.get('voxelarena_name') || '';
  U.el('nameInput').addEventListener('input', e => LS.set('voxelarena_name', e.target.value));
  U.el('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') U.el('playBtn').click(); });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === self.canvas;
    if (!locked && self.state === 'playing') {
      self.resetHeldInputs();
      self.state = 'paused';
      U.el('pause').classList.remove('hidden');
    } else if (locked && self.state === 'paused') {
      self.state = 'playing';
      U.el('pause').classList.add('hidden');
    }
  });
};

Game.prototype.bindInput = function () {
  const self = this;

  addEventListener('keydown', e => {
    if (self.state !== 'playing' && self.state !== 'paused') return;
    if (e.code === 'Tab') { e.preventDefault(); self.tabHeld = true; return; }
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    if (self.state !== 'playing') return;
    if (!e.repeat) {
      self.keys.add(e.code);
      const p = self.player;
      if (!p) return;
      if (e.code === 'Space') p.tryJump();
      if (e.code === 'KeyQ' || e.code === 'KeyX') p.tryDash();
      if (e.code === 'KeyR') p.tryReload();
      if (e.code === 'KeyG') p.tryGrenade();
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5));
        if (n >= 1 && n <= 5) p.selectSlot(n - 1);
      }
      if (e.code === 'KeyM') {
        const muted = self.sfx.toggleMute();
        self.hud.subAnnounce(muted ? 'MUTED' : 'SOUND ON');
      }
      if (e.code === 'KeyE') p.adsHeld = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') p.runHeld = true;
      if (e.code === 'KeyC') p.crouchHeld = true;
    }
  });
  addEventListener('keyup', e => {
    if (e.code === 'Tab') { self.tabHeld = false; return; }
    self.keys.delete(e.code);
    const p = self.player;
    if (!p) return;
    if (e.code === 'KeyE') p.adsHeld = self.mouseAds;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') p.runHeld = false;
    if (e.code === 'KeyC') p.crouchHeld = false;
  });

  this.mouseAds = false;
  this.canvas.addEventListener('mousedown', e => {
    if (self.state !== 'playing' || document.pointerLockElement !== self.canvas) return;
    if (e.button === 0) { if (self.player) { self.player.fireHeld = true; self.player.fireEdge = true; } }
    if (e.button === 2) { self.mouseAds = true; if (self.player) self.player.adsHeld = true; }
  });
  addEventListener('mouseup', e => {
    if (e.button === 0 && self.player) self.player.fireHeld = false;
    if (e.button === 2) { self.mouseAds = false; if (self.player) self.player.adsHeld = self.keys.has('KeyE'); }
  });
  addEventListener('wheel', e => {
    if (self.state === 'playing' && self.player) self.player.cycleSlot(e.deltaY > 0 ? 1 : -1);
  });
  this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (document.pointerLockElement === self.canvas && self.player && self.state === 'playing') {
      self.player.look(e.movementX, e.movementY);
    }
  });
};

const TIPS = [
  'TIP: DASH WITH Q TO ROCKET-JUMP FURTHER',
  'TIP: HEADSHOTS DEAL BONUS DAMAGE',
  'TIP: HOLD TAB FOR FULL SCOREBOARD',
  'TIP: COOK YOUR ESCAPE \u2014 GRENADES BOUNCE',
  'TIP: THE CENTER PLATFORM CONTROLS THE MAP',
  'TIP: QUAD DAMAGE SPAWNS AT THE CENTER \u2014 CONTEST IT'
];

Game.prototype.loop = function () {
  requestAnimationFrame(this.loop);
  const dt = Math.min(this.clock.getDelta(), 0.05);
  const st = this.state;

  for (const cl of this.world.clouds) {
    cl.position.x += dt * 1.2;
    if (cl.position.x > 80) cl.position.x = -80;
  }

  if (st === 'menu' || st === 'end') {
    this.menuAngle += dt * 0.08;
    this.camera.position.set(Math.sin(this.menuAngle) * 32, 17, Math.cos(this.menuAngle) * 32);
    this.camera.lookAt(0, 3, 0);
    this.camera.fov = U.damp(this.camera.fov, 60, 4, dt);
    this.camera.updateProjectionMatrix();
    this.effects.update(dt);
  } else if (st === 'playing') {
    const p = this.player;
    p.update(dt);
    for (const b of this.bots) b.update(dt);
    this.pickups.update(dt);
    this.updateProjectiles(dt);
    this.effects.update(dt);
    this.shake *= Math.exp(-6 * dt);

    this.camera.rotation.set(p.pitch + p.recoil + U.rand(-1, 1) * this.shake * 0.02, p.yaw + U.rand(-1, 1) * this.shake * 0.02, 0);
    if (p.alive) {
      p.eyePos(this.camera.position);
    } else {
      this.camera.position.set(p.body.pos.x, p.body.pos.y + 0.6, p.body.pos.z);
      this.camera.rotation.z = U.damp(this.camera.rotation.z, 0.5, 3, dt);
      this.hud.deathTimer(p.respawnT);
      if (p.respawnT <= 0) {
        p.respawn();
        this.canvas.style.filter = '';
        this.hud.hideDeath();
      }
    }
    if (p.alive) this.camera.rotation.z = U.damp(this.camera.rotation.z, 0, 10, dt);

    const def = WEAPONS[p.cur];
    let targetFov = U.lerp(75, def.zoomFov || 62, p.adsAmt * p.adsAmt);
    if (p.dashT > 0) targetFov += 7;
    this.camera.fov = U.damp(this.camera.fov, targetFov, 14, dt);
    this.camera.updateProjectionMatrix();

    const scoped = p.cur === 'sniper' && p.adsAmt > 0.82;
    this.hud.ch.style.opacity = scoped ? 0 : 1;
    this.hud.scope(scoped);
    const hsp = Math.sqrt(p.body.vel.x ** 2 + p.body.vel.z ** 2);
    const gap = 5 + hsp * 0.7 + (p.body.grounded ? 0 : 7) + p.vmKick * 16 + (def.pellets ? 8 : 0);
    this.hud.crosshair(gap.toFixed(1));

    this.hud.health(p.hp, p.maxHp);
    this.hud.ammo(p.ammo[p.cur], def, !!p.reloading);
    this.hud.slots(SLOT_ORDER.indexOf(p.cur));
    this.hud.grenades(p.grenades);
    this.hud.dash(1 - U.clamp(p.dashCd / (1.25 * p.cls.dash), 0, 1));

    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.3;
      const list = this.combatants().slice().sort((a, b) => b.score.k - a.score.k || a.score.d - b.score.d);
      const rows = list.map(e => ({
        name: e.name,
        col: e.cls ? e.cls.color : '#' + e.colorHex.toString(16).padStart(6, '0'),
        k: e.score.k, d: e.score.d, me: !!e.isPlayer
      }));
      this.hud.board(rows, 'FFA \u2022 FIRST TO ' + this.cfg.limit, this.tabHeld);
    }
    this.hud.radar(this.combatants(), p.body.pos, p.yaw);
    this.hud.tick(dt);

    this.tipT -= dt;
    if (this.tipT <= 0 && this.tipI < TIPS.length) {
      this.hud.tip(TIPS[this.tipI++]);
      this.tipT = 8;
    }

    this.fpsAcc += dt; this.fpsN++; this.fpsT += dt;
    if (this.fpsT > 0.5) { this.hud.fps(Math.round(this.fpsN / this.fpsAcc)); this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; }
  }

  this.renderer.render(this.scene, this.camera);
};

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.GAME = new Game();
  } catch (err) {
    document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;padding:40px"><h2>WebGL failed to start</h2><pre>' + err.message + '</pre></div>';
    throw err;
  }
});
