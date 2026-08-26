const NET_INTERP_DELAY = 120;
const NET_INPUT_TIMEOUT = 3;

class NetPlayer extends Bot {
  constructor(game, id, name, clsKey, peerId, lvl) {
    super(game, name || 'PLAYER', CLASS_DEFS[clsKey] ? CLASS_DEFS[clsKey].hex : 0x4fc3f7, 'normal', lvl || 0, clsKey);
    this.id = id;
    this.peerId = peerId;
    this.clsKey = clsKey || 'assault';
    this.cls = CLASS_DEFS[this.clsKey];
    this.maxHp = this.cls.hp;
    this.hp = this.cls.hp;
    this.body.r = 0.38;
    this.body.h = 1.95;
    this.body.step = 0.8;
    this.lastInputAt = performance.now();
    this.fireVisT = 0;
    this.netYaw = this.mesh.rotation.y;
    this.netPitch = 0;
    this.netAds = false;
    this.netCr = 0;
    this.pitchS = 0;
    this.crS = 0;
    this.state = 'idle';
  }

  applyInput(m) {
    this.lastInputAt = performance.now();
    const b = this.body;
    b.vel.set(m.vx, m.vy, m.vz);
    const maxSp = 8 * this.cls.spd * 1.45 + 6;
    const hsp = Math.sqrt(b.vel.x ** 2 + b.vel.z ** 2);
    if (hsp > maxSp) { const f = maxSp / hsp; b.vel.x *= f; b.vel.z *= f; }
    if (m.crouch) b.h = 1.4; else b.h = 1.95;
    this.netYawTarget = m.yaw;
    this.netPitch = U.clamp(parseFloat(m.pt) || 0, -1.53, 1.53);
    this.netAds = !!m.ads;
    this.netCr = m.cr ? 1 : 0;
    this.netDash = m.d ? 1 : 0;
    this.wpnIdx = Math.max(0, Math.min(SLOT_ORDER.length - 1, m.w | 0));
    if (!this.alive) return;
    b.pos.set(m.x, Math.max(m.y, -2), m.z);
  }

  die(from, isHead, wpn) {
    super.die(from, isHead, wpn);
    if (this.game.isNetHost) {
      const kName = from === this ? this.name : (from ? from.name : '?');
      this.game.netSend('died', { kn: kName, wpn: wpn }, this.peerId);
    }
  }

  showShot(wpn, end) {
    this.fireVisT = 0.35;
    this.recT = 0.12;
    this.flash.visible = true;
    this.flashT = 0.05;
    const eye = new THREE.Vector3(this.body.pos.x, this.body.pos.y + 1.5, this.body.pos.z);
    this.game.sfx.play(WEAPONS[wpn] ? WEAPONS[wpn].snd : 'rifle', eye, 0.8);
    const muzzleW = this.muzzleTip.getWorldPosition(new THREE.Vector3());
    this.game.effects.tracer(muzzleW, end, 0xfff3b0);
  }

  update(dt) {
    if (!this.alive) {
      if (this.mesh.visible && this.deathT >= 0) {
        this.deathT += dt;
        avatarDeathAnim(this, dt);
        if (this.deathT > 0.55) this.mesh.visible = false;
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    if (this.prot > 0) this.prot -= dt;
    if (this.flinchT > 0) this.flinchT -= dt;
    if (this.fireVisT > 0) this.fireVisT -= dt;

    const stale = (performance.now() - this.lastInputAt) / 1000 > NET_INPUT_TIMEOUT;
    if (stale) { this.body.vel.x *= 0.9; this.body.vel.z *= 0.9; }

    const hsp = Math.sqrt(this.body.vel.x ** 2 + this.body.vel.z ** 2);
    this.pitchS = U.damp(this.pitchS, this.netPitch, 14, dt);
    this.crS = U.damp(this.crS, this.netCr, 10, dt);
    this.dashLean = this.netDash ? 1 : 0;
    this.setGun(SLOT_ORDER[this.wpnIdx || 0]);
    animateAvatar(this, hsp, dt, this.fireVisT > 0 || this.netAds, this.pitchS, this.crS);

    let d = (this.netYawTarget !== undefined ? this.netYawTarget : this.netYaw) - this.netYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.netYaw += d * Math.min(1, dt * 14);
    this.mesh.rotation.y = this.netYaw;
    this.mesh.position.copy(this.body.pos);

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
  }

  dispose() {
    this.tag.destroy();
    this.game.scene.remove(this.mesh);
  }
}

class Ghost {
  constructor(game, id, name, colorHex, lvl, clsKey) {
    this.game = game;
    this.id = id;
    this.name = name || 'PLAYER';
    this.colorHex = colorHex;
    this.lvl = lvl | 0;
    this.clsKey = clsKey || 'assault';
    this.isPlayer = false;
    this.score = { k: 0, d: 0 };
    this.maxHp = 100;
    this.hp = 100;
    this.alive = true;
    this.prot = 0;
    this.quadT = 0;
    this.respawnT = 0;
    this.body = { pos: new THREE.Vector3(), r: 0.42, h: 2.05, vel: new THREE.Vector3(), grounded: false };
    this.animPhase = 0;
    this.flashT = 0;
    this.fireVisT = 0;
    this.recT = 0;
    this.lean = 0;
    this.dashLean = 0;
    this.landT = 0;
    this.spawnT = 0.35;
    this.deathT = -1;
    this.samples = [];
    this.hasSample = false;
    const a = buildCharacterMesh(this.name, colorHex, this.lvl, this.clsKey);
    this.legL = a.legL; this.legR = a.legR; this.armL = a.armL; this.armR = a.armR;
    this.torso = a.torso; this.head = a.head; this.visor = a.visor; this.gun = a.gun;
    this.setGun = a.setGun;
    this.crown = a.crown;
    this.setCrown = a.setCrown;
    this.muzzleTip = a.muzzleTip; this.flash = a.flash; this.tag = a.tag;
    this.mesh = a.group;
    this.tPitch = 0;
    this.tAds = false;
    this.tCr = 0;
    this.pitchS = 0;
    this.crS = 0;
    a.group.visible = false;
    this.game.scene.add(a.group);
  }

  center(out) {
    out = out || new THREE.Vector3();
    return out.copy(this.body.pos).add(new THREE.Vector3(0, 1.25, 0));
  }

  getAABB() {
    const p = this.body.pos;
    return { x0: p.x - 0.42, x1: p.x + 0.42, y0: p.y, y1: p.y + 2.07, z0: p.z - 0.42, z1: p.z + 0.42 };
  }

  applyState(e) {
    this.samples.push({ t: performance.now(), x: e.x, y: e.y, z: e.z, yaw: e.yaw });
    if (this.samples.length > 30) this.samples.shift();
    this.hasSample = true;
    this.tPitch = e.pitch || 0;
    this.tAds = !!e.ads;
    this.tCr = e.cr ? 1 : 0;
    this.tW = Math.max(0, Math.min(SLOT_ORDER.length - 1, (e.w | 0) || 0));
    const wasAlive = this.alive;
    this.alive = !!e.a;
    this.hp = e.hp;
    this.score.k = e.k;
    this.score.d = e.d;
    this.respawnT = e.rt || 0;
    this.mesh.visible = this.alive;
    if (!wasAlive && this.alive) {
      this.body.pos.set(e.x, e.y, e.z);
      this.samples.length = 0;
      this.samples.push({ t: performance.now(), x: e.x, y: e.y, z: e.z, yaw: e.yaw });
      this.mesh.rotation.x = 0;
      this.mesh.scale.setScalar(1);
      this.deathT = -1;
      this.spawnT = 0.35;
    } else if (wasAlive && !this.alive) {
      this.deathT = 0;
    }
    this.tag.draw(this.hp / this.maxHp);
  }

  _interp() {
    const s = this.samples;
    if (!s.length) return null;
    const target = performance.now() - NET_INTERP_DELAY;
    if (target <= s[0].t) return s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= target) {
        const a = s[i], b = s[i + 1];
        if (!b) return a;
        const span = b.t - a.t;
        const f = span > 1 ? U.clamp((target - a.t) / span, 0, 1.25) : 1;
        let dy = b.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        return { x: U.lerp(a.x, b.x, f), y: U.lerp(a.y, b.y, f), z: U.lerp(a.z, b.z, f), yaw: a.yaw + dy * f, vx: (b.x - a.x) / (span / 1000), vz: (b.z - a.z) / (span / 1000) };
      }
    }
    return s[s.length - 1];
  }

  update(dt) {
    if (!this.alive) {
      if (this.hasSample && this.mesh.visible && this.deathT >= 0) {
        this.deathT += dt;
        avatarDeathAnim(this, dt);
        if (this.deathT > 0.55) this.mesh.visible = false;
      }
      return;
    }
    if (!this.hasSample) return;
    const st = this._interp();
    if (!st) return;
    this.body.pos.set(st.x, st.y, st.z);
    if (this.fireVisT > 0) this.fireVisT -= dt;
    const hsp = Math.min(Math.sqrt((st.vx || 0) ** 2 + (st.vz || 0) ** 2), 12);
    this.pitchS = U.damp(this.pitchS, this.tPitch, 14, dt);
    this.crS = U.damp(this.crS, this.tCr, 10, dt);
    this.setGun(SLOT_ORDER[this.tW || 0]);
    animateAvatar(this, hsp, dt, this.tAds || this.fireVisT > 0, this.pitchS, this.crS);
    this.mesh.rotation.y = st.yaw;
    this.mesh.position.copy(this.body.pos);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
  }

  showShot(wpn, end) {
    this.fireVisT = 0.35;
    this.recT = 0.12;
    this.flash.visible = true;
    this.flashT = 0.05;
    const eye = new THREE.Vector3(this.body.pos.x, this.body.pos.y + 1.5, this.body.pos.z);
    this.game.sfx.play(WEAPONS[wpn] ? WEAPONS[wpn].snd : 'rifle', eye, 0.8);
    const muzzleW = this.muzzleTip.getWorldPosition(new THREE.Vector3());
    this.game.effects.tracer(muzzleW, end, 0xfff3b0);
  }

  dispose() {
    this.tag.destroy();
    this.game.scene.remove(this.mesh);
  }
}
