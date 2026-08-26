const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

function Game() {
  this.settings = { sens: 1.0, vol: 0.7, pixelate: false, voice: true, openMic: false };
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
  this.net = null;
  this.netRole = 'off';
  this.roster = [];
  this.remote = [];
  this.entMeta = {};
  this.botMeta = [];
  this.myId = 0;
  this.nextEntId = 1;
  this.snapT = 0;
  this.inputT = 0;
  this.projSeq = 0;
  this.matchT = 0;
  this.publicRoom = false;

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
  this.voice = new Voice(this);
  Account.init();
  this.bindUI();
  this.bindInput();
  this.applyResolution();
  this.loop = this.loop.bind(this);
  requestAnimationFrame(this.loop);
}

Object.defineProperty(Game.prototype, 'isNetHost', {
  get() { return this.netRole === 'host'; }
});

Game.prototype.netSend = function (action, data, toPid) {
  if (this.net) this.net.send(action, data, toPid);
};

Game.prototype.entityById = function (id) {
  if (this.player && this.player.id === id) return this.player;
  for (const r of this.remote) if (r.id === id) return r;
  for (const b of this.bots) if (b.id === id) return b;
  return null;
};

Game.prototype.clientClaimHit = function (ent, dmg, isHead, wpn, end) {
  const now = performance.now();
  if (now - (this._lastClaimSfx || 0) > 90) {
    this._lastClaimSfx = now;
    this.hud.hitmark(isHead ? 'crit' : '');
    this.sfx.play('hit');
  }
  if (ent && ent.id !== undefined) {
    this.netSend('shot', { sid: this.myId, w: wpn, h: ent.id, hs: isHead ? 1 : 0, d: dmg, e: [rnd2(end.x), rnd2(end.y), rnd2(end.z)] });
  }
};

function rnd2(v) { return Math.round(v * 100) / 100; }

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
  for (const r of this.remote) arr.push(r);
  if (this.netRole !== 'client') {
    for (const b of this.bots) arr.push(b);
  }
  return arr;
};

Game.prototype.hurt = function (ent, amount, src, isHead, wpn) {
  if (!ent || !ent.alive) return false;
  if (src && src.quadT > 0 && src !== ent) amount *= 2;
  return ent.isPlayer ? ent.hurt(amount, src, isHead, wpn) : ent.takeDamage(amount, src, isHead, wpn);
};

const WPN_LABEL = { rifle: 'AR', shotgun: 'SHOTGUN', sniper: 'SNIPER', rpg: 'ROCKET', grenade: 'GRENADE' };
const TIME_LIMIT = 600;

Game.prototype.registerKill = function (src, victim, isHead, wpn) {
  if (src && src !== victim) src.score.k++;
  const sName = src === victim ? victim.name : (src ? src.name : '?');
  const sCol = src && src.cls ? src.cls.color : '#' + ((src && src.colorHex) || 0xffffff).toString(16).padStart(6, '0');
  const vCol = victim.cls ? victim.cls.color : '#' + victim.colorHex.toString(16).padStart(6, '0');
  const sTier = tierForLevel(src && src.lvl), vTier = tierForLevel(victim.lvl);
  this.hud.killFeed(sName, sCol, victim.name, vCol, WPN_LABEL[wpn] || wpn, isHead, sTier, vTier);
  if (this.isNetHost) {
    this.netSend('feed', { kn: sName, kc: sCol, vn: victim.name, vc: vCol, w: wpn, h: isHead ? 1 : 0, sl: sTier, vl: vTier });
  }

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
  const r = { mesh: m, pos: pos.clone(), vel: dir.clone().multiplyScalar(WEAPONS.rpg.speed), owner: owner, t: 0 };
  this.rockets.push(r);
  if (this.netRole !== 'off' && owner && owner.isPlayer) {
    r.pid = ++this.projSeq;
    this.netSend('proj', { k: 'r', pid: r.pid, p: [rnd2(pos.x), rnd2(pos.y), rnd2(pos.z)], v: [rnd2(r.vel.x), rnd2(r.vel.y), rnd2(r.vel.z)] });
  }
};

Game.prototype.addRemoteRocket = function (m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.55), new THREE.MeshLambertMaterial({ color: 0xff8c3a }));
  mesh.position.set(m.p[0], m.p[1], m.p[2]);
  this.scene.add(mesh);
  this.rockets.push({ mesh: mesh, pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), owner: null, t: 0, visual: true, oid: m.o, pid: m.pid });
};

Game.prototype.spawnGrenade = function (pos, vel, owner) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3d5c34 }));
  m.position.copy(pos);
  m.castShadow = true;
  this.scene.add(m);
  const gr = { mesh: m, pos: pos.clone(), vel: vel.clone(), owner: owner, fuse: GRENADE.fuse };
  this.grenades.push(gr);
  if (this.netRole !== 'off' && owner && owner.isPlayer) {
    gr.pid = ++this.projSeq;
    this.netSend('proj', { k: 'g', pid: gr.pid, p: [rnd2(pos.x), rnd2(pos.y), rnd2(pos.z)], v: [rnd2(vel.x), rnd2(vel.y), rnd2(vel.z)] });
  }
};

Game.prototype.addRemoteGrenade = function (m) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3d5c34 }));
  mesh.position.set(m.p[0], m.p[1], m.p[2]);
  mesh.castShadow = true;
  this.scene.add(mesh);
  this.grenades.push({ mesh: mesh, pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), owner: null, fuse: GRENADE.fuse, visual: true, oid: m.o, pid: m.pid });
};

Game.prototype._explodeVisual = function (pos, radius) {
  this.effects.explosion(pos, radius);
  this.sfx.play('explosion', pos);
  const cp = this.camera.position;
  const camD = Math.sqrt((cp.x - pos.x) ** 2 + (cp.y - pos.y) ** 2 + (cp.z - pos.z) ** 2);
  this.addShake(U.clamp(1.4 - camD * 0.04, 0, 0.8));
};

Game.prototype._explodeDamage = function (pos, radius, dmgMax, owner, wpn) {
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
    if (!e.isPlayer && e.peerId && this.netRole !== 'off' && e.alive) {
      this.netSend('kb', { x: rnd2(kbDir.x * 11 * falloff), z: rnd2(kbDir.z * 11 * falloff), y: rnd2(6.5 * falloff + 2) }, e.peerId);
    }
    if (e.isPlayer) {
      e.body.vel.addScaledVector(kbDir, 10 * falloff);
      e.body.vel.y = Math.max(e.body.vel.y, 6.5 * falloff + 2);
    } else {
      e.kb.addScaledVector(kbDir, 11 * falloff);
    }
    this.hurt(e, Math.round(dmg), owner, false, wpn);
  }
};

Game.prototype.detonate = function (kind, pos, owner) {
  const isGrenade = kind === 'g';
  const radius = isGrenade ? GRENADE.radius : WEAPONS.rpg.radius;
  const dmgMax = isGrenade ? GRENADE.dmg : WEAPONS.rpg.dmg;
  this._explodeVisual(pos, radius);
  if (this.netRole !== 'client') {
    this._explodeDamage(pos, radius, dmgMax, owner, isGrenade ? 'grenade' : 'rocket');
  }
  if (this.net) {
    this.netSend('boom', { k: kind, p: [rnd2(pos.x), rnd2(pos.y), rnd2(pos.z)], o: owner && owner.id !== undefined ? owner.id : (this.isNetHost ? 0 : this.myId) });
  }
};

Game.prototype.receiveBoom = function (m) {
  const pos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
  const isGrenade = m.k === 'g';
  this.dropVisualProj(m.pid);
  this._explodeVisual(pos, isGrenade ? GRENADE.radius : WEAPONS.rpg.radius);
  if (this.isNetHost) {
    this._explodeDamage(pos, isGrenade ? GRENADE.radius : WEAPONS.rpg.radius, isGrenade ? GRENADE.dmg : WEAPONS.rpg.dmg, this.entityById(m.o), isGrenade ? 'grenade' : 'rocket');
  }
};

Game.prototype.dropVisualProj = function (pid) {
  if (pid === undefined) return;
  for (let i = this.rockets.length - 1; i >= 0; i--) {
    if (this.rockets[i].pid === pid) { this.scene.remove(this.rockets[i].mesh); this.rockets.splice(i, 1); }
  }
  for (let i = this.grenades.length - 1; i >= 0; i--) {
    if (this.grenades[i].pid === pid) { this.scene.remove(this.grenades[i].mesh); this.grenades.splice(i, 1); }
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
        if (e === r.owner || !e.alive || (r.oid !== undefined && e.id === r.oid)) continue;
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
      if (r.visual) {
        this.effects.burst(boomAt, { n: 6, color: 0xff8c3a, speed: 4, size: 0.12, life: 0.3 });
      } else {
        this.detonate('r', boomAt, r.owner);
      }
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
      if (gr.visual) {
        this.effects.burst(gr.pos.clone(), { n: 6, color: 0x3d5c34, speed: 4, size: 0.12, life: 0.3 });
      } else {
        this.detonate('g', gr.pos.clone(), gr.owner);
      }
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
  for (const r of this.remote) r.dispose();
  this.remote = [];
  this.entMeta = {};
  this.botMeta = [];
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

Game.prototype._readMenuCfg = function () {
  return {
    clsKey: document.querySelector('.classCard.sel').dataset.class,
    limit: parseInt(document.querySelector('#targetRow .seg.sel').dataset.target),
    diff: document.querySelector('#diffRow .seg.sel').dataset.diff,
    name: (U.el('nameInput').value.trim() || 'YOU').toUpperCase().slice(0, 14)
  };
};

Game.prototype._commonStart = function () {
  U.el('menu').classList.add('hidden');
  U.el('mp').classList.add('hidden');
  U.el('end').classList.add('hidden');
  U.el('hud').classList.remove('hidden');
  this.state = 'playing';
  this.streakTimes = [];
  this.tipT = 4;
  this.tipI = 0;
  this.snapT = 0;
  this.inputT = 0;
  this.reportedEnd = false;
  this.matchT = 0;
  this.hud.timer(TIME_LIMIT);
  this.player.lvl = Account.loggedIn ? Account.level : 0;
  if (Account.pendingAnnounce) {
    this.hud.subAnnounce(Account.pendingAnnounce);
    Account.pendingAnnounce = null;
  }
  this.lastKillerName = null;
  this.hud.reset(this.player.cls.label);
  this.hud.announce('FIGHT', 'FIRST TO ' + this.cfg.limit + ' FRAGS');
  const pl = this.canvas.requestPointerLock();
  if (pl && pl.catch) pl.catch(() => {});
};

Game.prototype.startMatch = function () {
  this.clearMatchObjects();
  const sel = this._readMenuCfg();
  this.cfg.limit = sel.limit;
  this.cfg.diff = sel.diff;
  this.netRole = 'off';
  this.player = new Player(this, sel.clsKey);
  this.player.name = sel.name;
  this.player.id = 0;
  this.nextEntId = 1;
  this.pickups = new Pickups(this);
  const names = BOT_NAMES.slice();
  const cols = BOT_COLORS.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = names[i]; names[i] = names[j]; names[j] = t; }
  for (let i = cols.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
  for (let i = 0; i < 7; i++) {
    const b = new Bot(this, names[i], cols[i], this.cfg.diff);
    b.id = ++this.nextEntId;
    this.bots.push(b);
  }
  this._commonStart();
};

Game.prototype.beginMatchHost = function () {
  if (!this.net || this.netRole !== 'host') return;
  this.clearMatchObjects();
  const sel = this._readMenuCfg();
  this.cfg.limit = sel.limit;
  this.cfg.diff = sel.diff;
  this.player = new Player(this, sel.clsKey);
  this.player.name = sel.name;
  this.player.id = 0;
  this.entMeta[0] = { name: this.player.name, hex: this.player.cls.hex, lvl: Account.loggedIn ? Account.level : 0 };
  for (const r of this.roster) {
    if (r.pid === this.net.selfId) continue;
    const np = new NetPlayer(this, r.id, r.name, r.cls, r.pid, r.lvl);
    this.remote.push(np);
    this.entMeta[r.id] = { name: r.name, hex: np.colorHex, lvl: r.lvl || 0 };
  }
  let maxId = 0;
  for (const r of this.roster) maxId = Math.max(maxId, r.id);
  const names = BOT_NAMES.slice();
  const cols = BOT_COLORS.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = names[i]; names[i] = names[j]; names[j] = t; }
  for (let i = cols.length - 1; i > 0; i--) { const j = U.randi(0, i); const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
  const nBots = Math.max(0, Math.min(7, 8 - this.roster.length));
  this.botMeta = [];
  for (let i = 0; i < nBots; i++) {
    const bid = ++maxId;
    this.botMeta.push({ id: bid, name: names[i], hex: cols[i] });
    const b = new Bot(this, names[i], cols[i], this.cfg.diff);
    b.id = bid;
    this.bots.push(b);
    this.entMeta[bid] = { name: names[i], hex: cols[i], lvl: 0 };
  }
  this.pickups = new Pickups(this);
  this.netSend('start', { limit: this.cfg.limit, diff: this.cfg.diff, roster: this._rosterMsg(), bots: this.botMeta });
  this._commonStart();
  if (this.publicRoom) Matchmaker.announceStart(this.roomCode);
};

Game.prototype.beginMatchClient = function (pl) {
  this.clearMatchObjects();
  this.cfg.limit = pl.limit;
  this.cfg.diff = pl.diff;
  const me = this.roster.find(r => r.pid === this.net.selfId);
  this.botMeta = pl.bots || [];
  this.player = new Player(this, me ? me.cls : 'assault');
  this.player.name = me ? me.name : 'YOU';
  this.player.id = this.myId;
  const myLvl = me ? (me.lvl || 0) : (Account.loggedIn ? Account.level : 0);
  if (Account.loggedIn && me) Account.level = myLvl;
  this.entMeta[this.myId] = { name: this.player.name, hex: this.player.cls.hex, lvl: myLvl };
  for (const r of this.roster) {
    if (r.pid === this.net.selfId) continue;
    const clsDef = CLASS_DEFS[r.cls];
    this.entMeta[r.id] = { name: r.name, hex: clsDef ? clsDef.hex : 0xffffff, lvl: r.lvl || 0 };
  }
  for (const bm of this.botMeta) this.entMeta[bm.id] = { name: bm.name, hex: bm.hex, lvl: bm.lvl || 0 };
  this.pickups = new Pickups(this);
  this.lastOwnHp = this.player.hp;
  this._commonStart();
};

Game.prototype._rosterMsg = function () {
  return this.roster.map(r => [r.pid, r.id, r.name, r.cls, r.lvl || 0]);
};

Game.prototype.ensureRemote = function (id) {
  for (const r of this.remote) if (r.id === id) return r;
  const meta = this.entMeta[id];
  const g = new Ghost(this, id, meta ? meta.name : '???', meta ? meta.hex : 0xffffff, meta ? meta.lvl : 0);
  this.remote.push(g);
  return g;
};

Game.prototype.sendSnap = function () {
  const enc = e => {
    let pitch = 0, ads = 0, cr = 0, w = 0;
    if (e.isPlayer) {
      pitch = e.pitch; ads = e.adsAmt > 0.5 ? 1 : 0; cr = e.crouchAmt > 0.5 ? 1 : 0; w = SLOT_ORDER.indexOf(e.cur);
    } else if (e.netPitch !== undefined) {
      pitch = e.netPitch; ads = e.netAds ? 1 : 0; cr = e.netCr ? 1 : 0; w = e.wpnIdx | 0;
    } else {
      pitch = e.aimPitch || 0; ads = e.state === 'engage' ? 1 : 0;
    }
    return [
      e.id !== undefined ? e.id : -1,
      rnd2(e.body.pos.x), rnd2(e.body.pos.y), rnd2(e.body.pos.z),
      e.mesh ? Math.round(e.mesh.rotation.y * 100) / 100 : (e.isPlayer ? Math.round((e.yaw + Math.PI) * 100) / 100 : 0),
      Math.round(e.hp), e.score.k | 0, e.score.d | 0,
      e.alive ? 1 : 0,
      Math.round(Math.max(0, e.alive ? 0 : (e.respawnT || 0)) * 10),
      Math.round(pitch * 100) / 100,
      ads | (cr ? 2 : 0),
      w
    ];
  };
  const ps = [];
  if (this.player) ps.push(enc(this.player));
  for (const r of this.remote) ps.push(enc(r));
  const bs = [];
  for (const b of this.bots) bs.push(enc(b));
  this.netSend('snap', { p: ps, b: bs, t: Math.max(0, TIME_LIMIT - this.matchT) });
};

Game.prototype.applySnap = function (s) {
  if (!this.player || (this.state !== 'playing' && this.state !== 'paused')) return;
  for (const e of s.p) this._applyEntState(e);
  for (const e of s.b) this._applyEntState(e);
  if (typeof s.t === 'number') this.hud.timer(s.t);
};

Game.prototype._applyEntState = function (e) {
  const id = e[0];
  if (id === this.myId) {
    this.applySelfState(e);
    return;
  }
  let g = null;
  for (const r of this.remote) if (r.id === id) { g = r; break; }
  if (!g) g = this.ensureRemote(id);
  g.applyState({ x: e[1], y: e[2], z: e[3], yaw: e[4], hp: e[5], k: e[6], d: e[7], a: e[8], rt: e[9] / 10, pitch: e[10] || 0, ads: !!(e[11] & 1), cr: !!(e[11] & 2), w: (e[12] || 0) });
};

Game.prototype.applySelfState = function (e) {
  const p = this.player;
  if (!p) return;
  const hp = e[5];
  const alive = !!e[8];
  p.respawnT = e[9] / 10;
  if (p.alive && hp < p.hp && alive) {
    this.hud.setDmgFlash();
    this.addShake(0.12);
    this.sfx.play('hurt');
  }
  p.hp = hp;
  p.score.k = e[6];
  p.score.d = e[7];
  if (!alive && p.alive) {
    p.alive = false;
    p.fireHeld = false; p.adsHeld = false;
    this.canvas.style.filter = 'grayscale(0.85) brightness(0.8)';
    this.hud.showDeath(this.lastKillerName || '???');
    this.resetHeldInputs();
  } else if (alive && !p.alive) {
    p.respawn({ x: e[1], y: Math.max(e[2], 0), z: e[3] });
    this.canvas.style.filter = '';
    this.hud.hideDeath();
    this.sfx.play('spawn');
  }
};

Game.prototype.sendInput = function () {
  const p = this.player;
  if (!p || !p.alive) return;
  this.netSend('input', {
    x: rnd2(p.body.pos.x), y: rnd2(p.body.pos.y), z: rnd2(p.body.pos.z),
    vx: rnd2(p.body.vel.x), vy: rnd2(p.body.vel.y), vz: rnd2(p.body.vel.z),
    yaw: Math.round((p.yaw + Math.PI) * 1000) / 1000,
    cr: p.crouchAmt > 0.5 ? 1 : 0,
    pt: Math.round(p.pitch * 100) / 100,
    ads: p.adsAmt > 0.5 ? 1 : 0,
    w: SLOT_ORDER.indexOf(p.cur)
  });
};

Game.prototype.startPublic = async function () {
  if (this.net) return;
  const sel = this._readMenuCfg();
  const btn = U.el('playBtn');
  btn.textContent = 'FINDING MATCH...';
  btn.disabled = true;
  const res = await Matchmaker.deploy(this, sel);
  btn.textContent = 'DEPLOY';
  btn.disabled = false;
  if (res.action === 'join') this.mpJoinPublic(res.code, sel);
  else if (res.action === 'host') this.mpHostPublic(sel);
  else this.startMatch();
};

Game.prototype.mpHostPublic = function (sel) {
  (async () => {
    const code = makeRoomCode(5);
    const net = new Net();
    try { await net.connect('host', code); } catch (e) { this.startMatch(); return; }
    this.net = net;
    this.netRole = 'host';
    this.publicRoom = true;
    this.roomCode = code;
    this.hostNextId = 1;
    this.roster = [{ pid: net.selfId, id: 0, name: sel.name, cls: sel.clsKey, lvl: Account.loggedIn ? Account.level : 0 }];
    this.setupNetHandlers();
    this.voice.start();
    this.beginMatchHost();
    Matchmaker.announceStart(this.roomCode);
  })();
};

Game.prototype.mpJoinPublic = function (code, sel) {
  (async () => {
    const net = new Net();
    try { await net.connect('client', code); } catch (e) { this.startMatch(); return; }
    this.net = net;
    this.netRole = 'client';
    this.publicRoom = true;
    this.roomCode = code;
    this.setupNetHandlers();
    this.voice.start();
    net.send('hello', { n: sel.name, c: sel.clsKey, l: Account.loggedIn ? Account.level : 0 });
    this.joinTimeout = setTimeout(() => {
      if (this.state === 'menu' && !this.roster.length) {
        this._teardownNet();
        this.startMatch();
      }
    }, 15000);
  })();
};

Game.prototype.mpHost = async function () {
  if (this.net) return;
  const sel = this._readMenuCfg();
  this._mpStatus('CREATING MATCH...', '');
  const code = makeRoomCode(5);
  const net = new Net();
  try {
    await net.connect('host', code);
  } catch (e) {
    this._mpStatus(String(e && e.message || e), 'err');
    return;
  }
  this.net = net;
  this.netRole = 'host';
  this.roomCode = code;
  this.hostNextId = 1;
  this.roster = [{ pid: net.selfId, id: 0, name: sel.name, cls: sel.clsKey, lvl: Account.loggedIn ? Account.level : 0 }];
  this.setupNetHandlers();
  this.voice.start();
  this._showLobby(true);
  this.updateLobbyUI();
  this.sfx.play('ui');
};

Game.prototype.mpJoin = async function () {
  if (this.net) return;
  const code = cleanRoomCode(U.el('joinCode').value);
  if (code.length < 4) { this._mpStatus('ENTER A MATCH CODE FIRST', 'err'); return; }
  const sel = this._readMenuCfg();
  this._mpStatus('JOINING ' + code + ' ...', '');
  const net = new Net();
  try {
    await net.connect('client', code);
  } catch (e) {
    this._mpStatus(String(e && e.message || e), 'err');
    return;
  }
  this.net = net;
  this.netRole = 'client';
  this.roomCode = code;
  this.setupNetHandlers();
  this.voice.start();
  net.send('hello', { n: sel.name, c: sel.clsKey, l: Account.loggedIn ? Account.level : 0 });
  this.joinTimeout = setTimeout(() => {
    if (this.state === 'menu' && !this.roster.length) {
      this._mpStatus('NO MATCH FOUND FOR CODE ' + code, 'err');
      this._teardownNet();
    }
  }, 15000);
};

Game.prototype._teardownNet = function () {
  this.voice.stop();
  this.publicRoom = false;
  Matchmaker.close();
  if (this.net) { this.net.leave(); this.net = null; }
  this.netRole = 'off';
  this.roster = [];
  this.roomCode = null;
  this.hostPid = null;
  this.helloAcked = false;
};

Game.prototype._showLobby = function (isHost) {
  U.el('menu').classList.add('hidden');
  U.el('mp').classList.remove('hidden');
  U.el('mpEntry').classList.add('hidden');
  U.el('mpLobby').classList.remove('hidden');
  U.el('mpStartBtn').classList.toggle('hidden', !isHost);
  U.el('mpWaitTxt').classList.toggle('hidden', !!isHost);
  U.el('mpWaitTxt').textContent = isHost ? '' : 'WAITING FOR HOST TO START...';
};

Game.prototype._mpStatus = function (txt, kind) {
  const el = U.el('mpStatus');
  el.textContent = txt || '';
  el.classList.toggle('err', kind === 'err');
};

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

Game.prototype.updateLobbyUI = function () {
  let html = '';
  const sorted = this.roster.slice().sort((a, b) => a.id - b.id);
  for (const r of sorted) {
    const cd = CLASS_DEFS[r.cls];
    const me = this.net && r.pid === this.net.selfId;
    html += '<div class="lobbyRow"><b style="color:' + (cd ? cd.color : '#fff') + '">' + escHtml(r.name) + '</b><i>' + (cd ? cd.label : '') + '</i>' + (me ? '<em>YOU</em>' : '') + '</div>';
  }
  U.el('mpRoster').innerHTML = html;
  U.el('mpCount').textContent = this.roster.length;
  U.el('mpCodeBox').textContent = this.roomCode || '';
};

Game.prototype.leaveLobby = function () {
  clearTimeout(this.joinTimeout);
  this._teardownNet();
  U.el('mpLobby').classList.add('hidden');
  U.el('mpEntry').classList.remove('hidden');
  this._mpStatus('', '');
  U.el('mp').classList.add('hidden');
  U.el('menu').classList.remove('hidden');
  this.sfx.play('ui');
};

Game.prototype.setupNetHandlers = function () {
  const net = this.net;
  const self = this;

  this.net.onPeerStream((stream, pid) => self.voice.onRemoteStream(pid, stream));

  net.on('_join', pid => {
    if (this.voice.active) this.net.addStream(this.voice.stream, pid);
    if (this.netRole === 'client' && this.state === 'menu' && !this.helloAcked) {
      const sel = this._readMenuCfg();
      this.net.send('hello', { n: sel.name, c: sel.clsKey, l: Account.loggedIn ? Account.level : 0 }, pid);
    }
  });

  net.on('_leave', pid => {
    this.voice.dropPeer(pid);
    if (this.netRole === 'host') {
      const row = this.roster.find(r => r.pid === pid);
      this.roster = this.roster.filter(r => r.pid !== pid);
      const np = this.remote.find(r => r.peerId === pid);
      if (np) {
        this.remote = this.remote.filter(r => r !== np);
        np.dispose();
        if (this.state === 'playing') this.hud.subAnnounce(np.name + ' LEFT');
      }
      this.netSend('roster', this._rosterMsg());
      this.updateLobbyUI();
    } else if (this.netRole === 'client' && pid === this.hostPid) {
      if (this.state === 'playing' || this.state === 'paused') {
        this.quitToMenu();
        this.hud.subAnnounce('HOST LEFT \u2014 MATCH ENDED');
      } else {
        this._mpStatus('HOST DISCONNECTED', 'err');
        this.leaveLobby();
      }
    }
  });

  net.on('hello', (h, pid) => {
    if (this.netRole !== 'host') return;
    if (this.state !== 'menu' && !(this.publicRoom && (this.state === 'playing' || this.state === 'paused'))) { net.send('deny', { r: 'MATCH ALREADY RUNNING' }, pid); return; }
    if (this.roster.length >= 8) { net.send('deny', { r: 'LOBBY FULL' }, pid); return; }
    let row = this.roster.find(r => r.pid === pid);
    if (!row) {
      row = { pid: pid, id: this.hostNextId++, name: ('' + (h.n || 'PLAYER')).toUpperCase().slice(0, 14), cls: CLASS_DEFS[h.c] ? h.c : 'assault', lvl: Math.max(0, Math.min(999, parseInt(h.l, 10) || 0)) };
      this.roster.push(row);
      if (this.state !== 'menu' && !this.remote.find(r => r.peerId === pid)) {
        const np = new NetPlayer(this, row.id, row.name, row.cls, pid, row.lvl);
        this.remote.push(np);
        this.entMeta[row.id] = { name: row.name, hex: np.colorHex, lvl: row.lvl || 0 };
        this.hud.subAnnounce(row.name + ' JOINED');
      }
    } else {
      row.name = ('' + (h.n || row.name)).toUpperCase().slice(0, 14);
      row.cls = CLASS_DEFS[h.c] ? h.c : row.cls;
      row.lvl = Math.max(0, Math.min(999, parseInt(h.l, 10) || 0));
    }
    this.netSend('roster', this._rosterMsg());
    this.updateLobbyUI();
    this.netSend('start', { limit: this.cfg.limit, diff: this.cfg.diff, roster: this._rosterMsg(), bots: this.botMeta }, pid);
    this.sfx.play('ui');
  });

  net.on('deny', d => {
    this._mpStatus(d && d.r ? d.r : 'REJECTED BY HOST', 'err');
    clearTimeout(this.joinTimeout);
    this._teardownNet();
  });

  net.on('roster', rows => {
    if (this.netRole !== 'client') return;
    this.roster = rows.map(r => ({ pid: r[0], id: r[1], name: r[2], cls: r[3], lvl: (r[4] | 0) }));
    clearTimeout(this.joinTimeout);
    const hostRow = this.roster.find(r => r.id === 0);
    if (hostRow) this.hostPid = hostRow.pid;
    const meRow = this.roster.find(r => r.pid === this.net.selfId);
    if (!meRow) return;
    this.helloAcked = true;
    this.myId = meRow.id;
    if (this.state === 'menu') {
      this._showLobby(false);
      this.updateLobbyUI();
      this.sfx.play('ui');
    }
  });

  net.on('start', pl => {
    if (this.netRole !== 'client') return;
    clearTimeout(this.joinTimeout);
    this.beginMatchClient(pl);
  });

  net.on('snap', s => this.applySnap(s));

  net.on('input', (m, pid) => {
    if (this.netRole !== 'host') return;
    for (const r of this.remote) {
      if (r.peerId === pid) { r.applyInput(m); return; }
    }
  });

  net.on('shot', (m, pid) => {
    const end = new THREE.Vector3(m.e[0], m.e[1], m.e[2]);
    if (this.netRole === 'host') {
      const np = this.remote.find(r => r.peerId === pid);
      if (!np || !np.alive) return;
      const def = WEAPONS[m.w];
      if (!def || def.proj) return;
      const now = performance.now();
      if (!np.shotTimes) np.shotTimes = {};
      const minGap = 60000 / def.rpm * 0.7;
      if (now - (np.shotTimes[m.w] || 0) < minGap) return;
      np.shotTimes[m.w] = now;
      np.showShot(m.w, end);
      if (m.h !== null && m.h !== undefined && m.h >= 0) {
        const victim = this.entityById(m.h);
        if (victim && victim.alive && victim !== np) this.hurt(victim, m.d, np, !!m.hs, m.w);
      }
    } else {
      if (m.sid === undefined || m.sid < 0) return;
      const g = this.ensureRemote(m.sid);
      if (g && g.alive) g.showShot(m.w, end);
    }
  });

  net.on('bshot', m => {
    if (this.netRole !== 'client') return;
    const g = this.ensureRemote(m.id);
    if (g && g.alive) g.showShot('rifle', new THREE.Vector3(m.e[0], m.e[1], m.e[2]));
  });

  net.on('proj', m => {
    if (m.k === 'r') this.addRemoteRocket(m);
    else this.addRemoteGrenade(m);
  });

  net.on('boom', m => this.receiveBoom(m));

  net.on('feed', d => {
    this.hud.killFeed(d.kn, d.kc, d.vn, d.vc, WPN_LABEL[d.w] || d.w, !!d.h, d.sl | 0, d.vl | 0);
  });

  net.on('died', d => {
    this.lastKillerName = d.kn;
    const p = this.player;
    if (p && p.alive) {
      p.alive = false;
      p.respawnT = d.rt || 3.5;
      p.fireHeld = false; p.adsHeld = false;
      this.canvas.style.filter = 'grayscale(0.85) brightness(0.8)';
      this.hud.showDeath(d.kn);
      this.resetHeldInputs();
    }
  });

  net.on('kb', v => {
    const p = this.player;
    if (!p || !p.alive) return;
    p.body.vel.x += v.x;
    p.body.vel.z += v.z;
    p.body.vel.y = Math.max(p.body.vel.y, v.y);
  });

  net.on('pick', m => {
    if (this.pickups) this.pickups.takeRemote(m.i, m.t);
  });

  net.on('end', m => this.showEndRemote(m));
};

Game.prototype._reportMatchResult = function (won) {
  if (this.reportedEnd) return;
  this.reportedEnd = true;
  if (!Account.loggedIn || !this.player) return;
  Account.reportMatch(this.player.score.k, won);
};

Game.prototype.endMatch = function (winner, timed) {
  this.state = 'end';
  document.exitPointerLock();
  this.resetHeldInputs();
  this.canvas.style.filter = '';
  this.hud.hideDeath();
  const list = this.combatants().slice().sort((a, b) => b.score.k - a.score.k || a.score.d - b.score.d);
  const rows = list.map(e => ({
    name: e.name,
    col: e.cls ? e.cls.color : '#' + e.colorHex.toString(16).padStart(6, '0'),
    k: e.score.k, d: e.score.d, me: !!e.isPlayer, lvl: e.lvl || 0
  }));
  if (this.isNetHost) {
    this.netSend('end', {
      rows: list.map(e => [e.id !== undefined ? e.id : -1, e.score.k, e.score.d]),
      win: winner && winner.id !== undefined ? winner.id : -1,
      wn: winner ? winner.name : '?',
      tm: timed ? 1 : 0
    });
  }
  this._reportMatchResult(!!winner.isPlayer);
  const title = timed ? 'TIME UP' : (winner.isPlayer ? 'VICTORY' : winner.name + ' WINS');
  this.hud.endScreen(rows, title, !!winner.isPlayer);
  U.el('rematchBtn').classList.toggle('hidden', this.netRole === 'client');
  U.el('endWait').classList.toggle('hidden', this.netRole !== 'client');
  U.el('end').classList.remove('hidden');
  U.el('hud').classList.add('hidden');
};

Game.prototype.showEndRemote = function (m) {
  if (this.state !== 'playing') return;
  this.state = 'end';
  document.exitPointerLock();
  this.resetHeldInputs();
  this.canvas.style.filter = '';
  this.hud.hideDeath();
  const rows = m.rows.map(r => {
    const meta = this.metaForId(r[0]);
    return { name: meta.name, col: meta.col, k: r[1], d: r[2], me: r[0] === this.myId, lvl: meta.lvl || 0 };
  }).sort((a, b) => b.k - a.k || a.d - b.d);
  this._reportMatchResult(m.win === this.myId);
  const title = m.tm ? 'TIME UP' : (m.win === this.myId ? 'VICTORY' : m.wn + ' WINS');
  this.hud.endScreen(rows, title, m.win === this.myId);
  U.el('rematchBtn').classList.add('hidden');
  U.el('endWait').classList.remove('hidden');
  U.el('end').classList.remove('hidden');
  U.el('hud').classList.add('hidden');
};

Game.prototype.metaForId = function (id) {
  if (this.player && id === this.myId) {
    return { name: this.player.name, col: this.player.cls ? this.player.cls.color : '#ffffff', lvl: this.player.lvl || 0 };
  }
  const m = this.entMeta[id];
  if (m) return m;
  return { name: '???', col: '#ffffff', lvl: 0 };
};

Game.prototype.quitToMenu = function () {
  this.state = 'menu';
  document.exitPointerLock();
  this.resetHeldInputs();
  this.clearMatchObjects();
  this._teardownNet();
  clearTimeout(this.joinTimeout);
  U.el('pause').classList.add('hidden');
  U.el('end').classList.add('hidden');
  U.el('hud').classList.add('hidden');
  U.el('mp').classList.add('hidden');
  U.el('mpLobby').classList.add('hidden');
  U.el('mpEntry').classList.remove('hidden');
  U.el('rematchBtn').classList.remove('hidden');
  U.el('endWait').classList.add('hidden');
  this._mpStatus('', '');
  U.el('menu').classList.remove('hidden');
};

Game.prototype.bindUI = function () {
  const self = this;
  U.el('playBtn').onclick = () => { self.sfx.ensure(); self.sfx.play('ui'); self.startPublic(); };
  U.el('resumeBtn').onclick = () => { self.sfx.play('ui'); const pl = self.canvas.requestPointerLock(); if (pl && pl.catch) pl.catch(() => {}); };
  U.el('quitBtn').onclick = () => { self.sfx.play('ui'); self.quitToMenu(); };
  U.el('rematchBtn').onclick = () => {
    self.sfx.play('ui');
    if (self.isNetHost) self.beginMatchHost();
    else self.startMatch();
  };
  U.el('endMenuBtn').onclick = () => { self.sfx.play('ui'); self.quitToMenu(); };

  U.el('mpBtn').onclick = () => {
    self.sfx.ensure(); self.sfx.play('ui');
    U.el('menu').classList.add('hidden');
    U.el('mp').classList.remove('hidden');
    U.el('mpEntry').classList.remove('hidden');
    U.el('mpLobby').classList.add('hidden');
    self._mpStatus('', '');
  };
  U.el('mpBackBtn').onclick = () => { self.sfx.play('ui'); self.leaveLobby(); };
  U.el('hostBtn').onclick = () => self.mpHost();
  U.el('joinBtn').onclick = () => self.mpJoin();
  U.el('joinCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') self.mpJoin();
    e.stopPropagation();
  });
  U.el('mpStartBtn').onclick = () => { self.sfx.play('ui'); self.beginMatchHost(); };
  U.el('copyCodeBtn').onclick = () => {
    const code = self.roomCode || '';
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        U.el('copyCodeBtn').textContent = 'COPIED';
        setTimeout(() => { U.el('copyCodeBtn').textContent = 'COPY'; }, 1200);
      }).catch(() => {});
    }
  };

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
  const vc = U.el('voiceChk'), oc = U.el('omicChk');
  sr.value = this.settings.sens; vr.value = this.settings.vol; pc.checked = this.settings.pixelate;
  vc.checked = this.settings.voice; oc.checked = this.settings.openMic;
  U.el('sensVal').textContent = Number(this.settings.sens).toFixed(2);
  U.el('volVal').textContent = Number(this.settings.vol).toFixed(2);
  sr.oninput = () => { self.settings.sens = parseFloat(sr.value); U.el('sensVal').textContent = self.settings.sens.toFixed(2); self.saveSettings(); };
  vr.oninput = () => { self.settings.vol = parseFloat(vr.value); self.sfx.setVolume(self.settings.vol); U.el('volVal').textContent = self.settings.vol.toFixed(2); self.saveSettings(); };
  pc.onchange = () => { self.settings.pixelate = pc.checked; self.applyResolution(); self.saveSettings(); };
  vc.onchange = () => {
    self.settings.voice = vc.checked; self.saveSettings();
    if (!vc.checked) self.voice.stop();
    else if (self.net) self.voice.start();
  };
  oc.onchange = () => { self.settings.openMic = oc.checked; self.saveSettings(); };

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
    if (e.code === 'KeyV') { if (!e.repeat) self.voice.ptt = true; return; }
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
    if (e.code === 'KeyV') self.voice.ptt = false;
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
  this.voice.update(dt);

  if (st === 'menu' || st === 'end') {
    this.menuAngle += dt * 0.08;
    this.camera.position.set(Math.sin(this.menuAngle) * 32, 17, Math.cos(this.menuAngle) * 32);
    this.camera.lookAt(0, 3, 0);
    this.camera.fov = U.damp(this.camera.fov, 60, 4, dt);
    this.camera.updateProjectionMatrix();
    this.effects.update(dt);
  } else if (st === 'playing' || (st === 'paused' && this.netRole !== 'off')) {
    const live = st === 'playing';
    const p = this.player;
    if (live) p.update(dt);
    if (live || (st === 'paused' && this.netRole !== 'off')) {
      this.matchT += dt;
      if (live && this.matchT >= TIME_LIMIT && this.netRole !== 'client') {
        const list = this.combatants().slice().sort((a, b) => b.score.k - a.score.k || a.score.d - b.score.d);
        this.endMatch(list[0], true);
      }
    }

    if (this.netRole === 'off') {
      for (const b of this.bots) b.update(dt);
      this.pickups.update(dt);
    } else {
      for (const r of this.remote) r.update(dt);
      if (this.isNetHost) {
        for (const b of this.bots) b.update(dt);
        this.pickups.update(dt);
        this.snapT -= dt;
        if (this.snapT <= 0) { this.snapT = 0.05; this.sendSnap(); }
      } else {
        this.pickups.animate(dt);
        if (live) {
          this.inputT -= dt;
          if (this.inputT <= 0) { this.inputT = 0.033; this.sendInput(); }
        }
      }
    }
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
      if (p.respawnT <= 0 && this.netRole !== 'client') {
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
      if (this.netRole !== 'client') this.hud.timer(Math.max(0, TIME_LIMIT - this.matchT));
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
        k: e.score.k, d: e.score.d, me: !!e.isPlayer, lvl: e.lvl || 0
      }));
      this.hud.board(rows, 'FFA \u2022 FIRST TO ' + this.cfg.limit, this.tabHeld);
      let topK = 0;
      for (const e of list) if (e.score.k > topK) topK = e.score.k;
      for (const e of this.combatants()) {
        if (e.setCrown) e.setCrown(topK >= 1 && e.score.k === topK);
      }
      this.hud.voice(this.voice, this.netRole !== 'off' && this.settings.voice);
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
