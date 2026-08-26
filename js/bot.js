const BOT_NAMES = ['NoScopeNina', 'Blockzilla', 'xX_Pixel_Xx', 'CrateCamper', 'SirShoots', 'GriefGuac', 'TurboTurtle', 'VoxelViper', 'DodgeDuck', 'LagLord', 'QuickPeek', 'BoomBox'];
const BOT_COLORS = [0xe74c3c, 0x3498db, 0xe67e22, 0x2ecc71, 0xe91e8c, 0x00bcd4, 0xf1c40f, 0x9b59b6];
const DIFFS = {
  easy: { acc: 0.11, react: 1.0, dmg: 0.7, range: 50 },
  normal: { acc: 0.2, react: 0.55, dmg: 1.0, range: 62 },
  hard: { acc: 0.33, react: 0.28, dmg: 1.25, range: 72 }
};

class Bot {
  constructor(game, name, colorHex, diffKey, lvl) {
    this.game = game;
    this.name = name;
    this.colorHex = colorHex;
    this.lvl = lvl | 0;
    this.diff = DIFFS[diffKey] || DIFFS.normal;
    this.isPlayer = false;
    this.score = { k: 0, d: 0 };
    this.maxHp = 100;
    this.hp = 100;
    this.alive = true;
    this.prot = 0;
    this.respawnT = 0;
    this.quadT = 0;
    this.body = { pos: new THREE.Vector3(), r: 0.42, h: 2.05, vel: new THREE.Vector3(), grounded: false };
    this.kb = new THREE.Vector3();
    this.state = 'patrol';
    this.goal = null;
    this.thinkT = U.rand(0, 0.15);
    this.target = null;
    this.lastKnown = new THREE.Vector3();
    this.lostT = 0;
    this.reactT = 0;
    this.burstLeft = 0;
    this.shotCd = 0;
    this.pauseCd = U.rand(0.3, 1);
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = U.rand(0.7, 1.5);
    this.stuckT = 0;
    this.flinchT = 0;
    this.idleT = 0;
    this.animPhase = 0;
    this.speedMul = U.rand(0.88, 1.08);
    this._buildMesh();
    const s = U.pick(game.world.spawns);
    this.body.pos.set(s.x, s.y, s.z);
  }

  _buildMesh() {
    const a = buildCharacterMesh(this.name, this.colorHex, this.lvl);
    this.legL = a.legL;
    this.legR = a.legR;
    this.armL = a.armL;
    this.armR = a.armR;
    this.torso = a.torso;
    this.head = a.head;
    this.visor = a.visor;
    this.gun = a.gun;
    this.muzzleTip = a.muzzleTip;
    this.flash = a.flash;
    this.tag = a.tag;
    this.flashT = 0;
    this.mesh = a.group;
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

  takeDamage(amount, from, isHead, wpn) {
    if (!this.alive || this.prot > 0) return false;
    this.hp -= amount;
    this.flinchT = 0.25;
    this.tag.draw(this.hp / this.maxHp);
    if (from && from !== this && from.alive) {
      this.lastKnown.copy(from.body ? from.body.pos : from.eyePos ? from.eyePos(new THREE.Vector3()) : this.lastKnown);
      if (this.state !== 'engage') { this.state = 'hunt'; }
      this.target = from;
      this.reactT = Math.min(this.reactT, 0.15);
    }
    if (this.hp <= 0) { this.die(from, isHead, wpn); }
    return true;
  }

  die(from, isHead, wpn) {
    this.alive = false;
    this.score.d++;
    this.mesh.visible = false;
    this.game.effects.burst(this.center(), { n: 24, color: this.colorHex, speed: 8, size: 0.22, life: 0.9 });
    this.game.effects.burst(this.center(), { n: 10, color: 0xc22a2a, speed: 6, size: 0.16, life: 0.7 });
    this.game.registerKill(from, this, isHead, wpn);
    this.respawnT = U.rand(3.2, 4.5);
  }

  respawn() {
    const spawn = this.game.pickSpawn(this);
    this.body.pos.set(spawn.x, spawn.y + 0.1, spawn.z);
    this.body.vel.set(0, 0, 0);
    this.kb.set(0, 0, 0);
    this.hp = this.maxHp;
    this.alive = true;
    this.prot = 1.2;
    this.quadT = 0;
    this.state = 'patrol';
    this.target = null;
    this.goal = null;
    this.mesh.visible = true;
    this.tag.draw(1);
  }

  _pickPatrolPoint() {
    const nav = this.game.world.navPoints;
    let best = null, bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const p = U.pick(nav);
      const dp = p.x - this.body.pos.x, dz = p.z - this.body.pos.z;
      const d = Math.sqrt(dp * dp + dz * dz);
      const sc = -Math.abs(d - 16) + U.rand(0, 6);
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    this.goal = best;
  }

  _moveToward(x, z, dt, mul) {
    const dx = x - this.body.pos.x, dz = z - this.body.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.001) return 0;
    const sp = 6.1 * this.speedMul * (mul === undefined ? 1 : mul);
    this.body.vel.x = dx / d * sp;
    this.body.vel.z = dz / d * sp;
    return d;
  }

  update(dt) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    if (this.prot > 0) this.prot -= dt;
    if (this.flinchT > 0) this.flinchT -= dt;

    this.thinkT -= dt;
    const myPos = this.body.pos;
    if (this.thinkT <= 0) {
      this.thinkT = 0.13;
      let best = null, bestD = Infinity;
      const range = this.diff.range;
      const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
      for (const e of this.game.combatants()) {
        if (e === this || !e.alive || e.prot > 0) continue;
        e.center(tmpA);
        tmpB.set(myPos.x, myPos.y + 1.4, myPos.z);
        const d = tmpA.distanceTo(tmpB);
        if (d < range && d < bestD && this.game.losClear(tmpB, tmpA)) { best = e; bestD = d; }
      }
      if (best) {
        if (this.target !== best) this.reactT = this.diff.react * U.rand(0.7, 1.3);
        this.target = best;
        this.state = 'engage';
        this.lostT = 0;
        this.lastKnown.copy(best.body.pos);
      } else if (this.state === 'engage') {
        this.lostT += 0.13;
        if (this.lostT > 1.4) { this.state = 'hunt'; this.target = null; }
      }
    }

    let moveAmt = 0;
    if (this.state === 'patrol') {
      if (this.idleT > 0) {
        this.idleT -= dt;
        this.body.vel.x *= 0.8; this.body.vel.z *= 0.8;
      } else {
        if (!this.goal) this._pickPatrolPoint();
        if (this.goal) {
          const d = this._moveToward(this.goal.x, this.goal.z, dt, 0.75);
          moveAmt = 1;
          if (d < 1.2) { this.goal = null; this.idleT = U.rand(0.3, 1.6); }
        }
      }
    } else if (this.state === 'hunt') {
      const d = this._moveToward(this.lastKnown.x, this.lastKnown.z, dt, 0.95);
      moveAmt = 1;
      if (d < 2) { this.state = 'patrol'; this.target = null; }
    } else if (this.state === 'engage' && this.target && this.target.alive) {
      const tp = this.target.body ? this.target.body.pos : this.target.eyePos(new THREE.Vector3());
      const dx = tp.x - myPos.x, dz = tp.z - myPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
      this.aimPitch = Math.atan2((tp.y + 1.25) - (myPos.y + 1.4), d);
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = U.rand(0.7, 1.6); }
      let fwd = 0;
      if (d > 24) fwd = 1; else if (d < 9) fwd = -0.8;
      const nx = dx / d, nz = dz / d;
      const sp = 5.4 * this.speedMul;
      this.body.vel.x = (nx * fwd + -nz * this.strafeDir * 0.75) * sp;
      this.body.vel.z = (nz * fwd + nx * this.strafeDir * 0.75) * sp;
      moveAmt = 1;
      if (this.body.grounded && Math.random() < dt * 0.5) this.body.vel.y = 9.3;
      this.fireControl(dt, d);
    } else {
      this.body.vel.x *= 0.8; this.body.vel.z *= 0.8;
      this.aimPitch = U.damp(this.aimPitch || 0, 0, 4, dt);
    }

    this.kb.multiplyScalar(Math.exp(-5 * dt));
    this.body.vel.x += this.kb.x;
    this.body.vel.z += this.kb.z;
    this.body.vel.y -= 26 * dt;
    moveBody(this.body, dt, this.game.world.colliders);

    if ((this.body.hitWall || this.stuckT > 0.55) && this.body.grounded && moveAmt) {
      this.stuckT += dt;
      if (this.stuckT > 0.35) { this.body.vel.y = 9.3; }
      if (this.stuckT > 1.1) { this.stuckT = 0; this.goal = null; if (this.state === 'patrol') this._pickPatrolPoint(); }
    } else if (moveAmt) {
      this.stuckT = Math.max(0, this.stuckT - dt * 2);
    }

    const hsp = Math.sqrt(this.body.vel.x ** 2 + this.body.vel.z ** 2);
    animateAvatar(this, hsp, dt, this.state === 'engage', this.aimPitch || 0, 0);

    let yaw = this.mesh.rotation.y;
    let wantYaw = yaw;
    if (this.state === 'engage' && this.target && this.target.alive) {
      const tp = this.target.body ? this.target.body.pos : this.target.eyePos(new THREE.Vector3());
      wantYaw = Math.atan2(tp.x - myPos.x, tp.z - myPos.z);
    } else if (hsp > 0.5) {
      wantYaw = Math.atan2(this.body.vel.x, this.body.vel.z);
    }
    let diff = wantYaw - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = yaw + diff * Math.min(1, dt * 10);
    this.mesh.position.copy(myPos);

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
  }

  fireControl(dt, dist) {
    this.shotCd -= dt;
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (this.pauseCd > 0) { this.pauseCd -= dt; return; }
    if (this.shotCd > 0) return;
    const tgt = this.target;
    if (!tgt || !tgt.alive) return;
    const eye = new THREE.Vector3(this.body.pos.x, this.body.pos.y + 1.5, this.body.pos.z);
    const tc = tgt.center(new THREE.Vector3());
    if (!this.game.losClear(eye, tc)) return;
    if (this.burstLeft <= 0) this.burstLeft = U.randi(3, 6);
    this.burstLeft--;
    this.shotCd = 0.13;
    if (this.burstLeft <= 0) this.pauseCd = U.rand(0.45, 1.1);

    this.flash.visible = true;
    this.flashT = 0.05;
    this.game.sfx.play('rifle', eye, 0.8);

    const tv = Math.sqrt((tgt.body ? tgt.body.vel.x : 0) ** 2 + (tgt.body ? tgt.body.vel.z : 0) ** 2);
    let chance = this.diff.acc * U.clamp(1.2 - dist / this.diff.range, 0.15, 1);
    if (tv > 6) chance *= 0.72;
    if (tv > 11) chance *= 0.7;
    if (this.flinchT > 0) chance *= 0.5;
    const hit = Math.random() < chance;
    const muzzleW = this.muzzleTip.getWorldPosition(new THREE.Vector3());
    let end;
    if (hit) {
      end = tc.clone().add(new THREE.Vector3(U.rand(-0.1, 0.1), U.rand(-0.1, 0.1), U.rand(-0.1, 0.1)));
      const dmg = 8 * this.diff.dmg * U.rand(0.85, 1.15);
      this.game.hurt(tgt, dmg, this, false, 'rifle');
    } else {
      end = tc.clone().add(new THREE.Vector3(U.rand(-1, 1), U.rand(-0.6, 1), U.rand(-1, 1)).normalize().multiplyScalar(U.rand(0.8, 1.8)));
    }
    const dir = end.clone().sub(muzzleW);
    const len = dir.length();
    dir.normalize();
    const wall = this.game.raycastWorld(muzzleW, dir, len);
    if (wall) {
      end = muzzleW.clone().addScaledVector(dir, wall.t);
      this.game.effects.impact(end, false);
    } else if (!hit) {
      this.game.effects.impact(end, false);
    }
    this.game.effects.tracer(muzzleW, end, 0xffb46a);
    if (this.game.isNetHost) this.game.netSend('bshot', { id: this.id, e: [rnd2(end.x), rnd2(end.y), rnd2(end.z)] });
  }

  dispose() {
    this.tag.destroy();
    this.game.scene.remove(this.mesh);
  }
}
