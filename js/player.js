const CLASS_DEFS = {
  assault: { label: 'ASSAULT', hp: 100, spd: 1.0, dash: 1.0, resist: 1.0, color: '#4fc3f7', hex: 0x4fc3f7 },
  scout: { label: 'SCOUT', hp: 75, spd: 1.16, dash: 0.55, resist: 1.0, color: '#76ff03', hex: 0x76ff03 },
  heavy: { label: 'HEAVY', hp: 150, spd: 0.86, dash: 1.35, resist: 0.45, color: '#ff9e40', hex: 0xff9e40 }
};

class Player {
  constructor(game, clsKey) {
    this.game = game;
    this.isPlayer = true;
    this.clsKey = clsKey || 'assault';
    this.cls = CLASS_DEFS[this.clsKey];
    this.name = 'YOU';
    this.colorHex = this.cls.hex;
    this.score = { k: 0, d: 0 };
    this.body = { pos: new THREE.Vector3(0, 0, 24), r: 0.38, h: 1.95, step: 0.8, vel: new THREE.Vector3(), grounded: false };
    this.yaw = Math.PI;
    this.pitch = 0;
    this.recoil = 0;
    this.hp = this.cls.hp;
    this.maxHp = this.cls.hp;
    this.alive = true;
    this.prot = 0;
    this.respawnT = 0;
    this.quadT = 0;
    this.crouchHeld = false;
    this.crouchAmt = 0;
    this.runHeld = false;
    this.adsHeld = false;
    this.adsAmt = 0;
    this.fireHeld = false;
    this.fireEdge = false;
    this.grenadeEdge = false;
    this.dashEdge = false;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.fireCd = 0;
    this.cur = 'rifle';
    this.ammo = {};
    for (const k of SLOT_ORDER) this.ammo[k] = WEAPONS[k].mag;
    this.reloading = null;
    this.pendingSlot = null;
    this.switchT = 0;
    this.dashCd = 0;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.grenades = GRENADE.max;
    this.bobT = 0;
    this.vmKick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.landDip = 0;
    this.flashT = 0;
    this.models = {};
    for (const k of SLOT_ORDER) {
      const m = buildViewModel(k);
      this.models[k] = m;
      game.camera.add(m);
    }
    this.models[this.cur].visible = true;
  }

  eyePos(out) {
    const eh = U.lerp(1.62, 1.05, this.crouchAmt) - this.landDip;
    return out.set(this.body.pos.x, this.body.pos.y + eh, this.body.pos.z);
  }

  center(out) { return out.set(this.body.pos.x, this.body.pos.y + 1.1, this.body.pos.z); }

  getAABB() {
    const p = this.body.pos, h = U.lerp(1.95, 1.4, this.crouchAmt);
    return { x0: p.x - 0.38, x1: p.x + 0.38, y0: p.y, y1: p.y + h, z0: p.z - 0.38, z1: p.z + 0.38 };
  }

  look(mx, my) {
    const zoomScale = U.lerp(1, 0.55, this.adsAmt);
    const s = 0.0022 * this.game.settings.sens * zoomScale;
    this.yaw -= mx * s;
    this.pitch -= my * s;
    this.pitch = U.clamp(this.pitch, -1.53, 1.53);
    this.swayX = U.clamp(this.swayX + mx * 0.0004, -0.05, 0.05);
    this.swayY = U.clamp(this.swayY + my * 0.0004, -0.05, 0.05);
  }

  _wishDir() {
    const k = this.game.keys;
    let f = 0, r = 0;
    if (k.has('KeyW')) f += 1;
    if (k.has('KeyS')) f -= 1;
    if (k.has('KeyD')) r += 1;
    if (k.has('KeyA')) r -= 1;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dx = (-sy * f) + (cy * r);
    const dz = (-cy * f) + (-sy * r);
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return null;
    return { x: dx / len, z: dz / len };
  }

  tryDash() { this.dashEdge = true; }
  tryJump() { this.jumpBuf = 0.12; }
  tryGrenade() { this.grenadeEdge = true; }
  tryReload() { this._startReload(); }
  selectSlot(i) {
    const key = SLOT_ORDER[i];
    if (!key || key === this.cur || !this.alive) return;
    this.pendingSlot = key;
    this.switchT = 0.22;
    this.reloading = null;
  }
  cycleSlot(dir) {
    let i = SLOT_ORDER.indexOf(this.cur);
    i = (i + dir + SLOT_ORDER.length) % SLOT_ORDER.length;
    this.selectSlot(i);
  }

  _startReload() {
    const def = WEAPONS[this.cur];
    if (this.reloading || this.ammo[this.cur] >= def.mag || this.switchT > 0) return;
    this.reloading = { t: def.rel, total: def.rel };
    this.game.sfx.play('reload');
  }

  update(dt) {
    if (!this.alive) {
      this.respawnT -= dt;
      return;
    }
    if (this.prot > 0) this.prot -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;

    let crouchTarget = this.crouchHeld ? 1 : 0;
    if (crouchTarget === 0 && this.crouchAmt > 0.02) {
      const probe = { pos: this.body.pos, r: this.body.r, h: 1.95 };
      if (anyOverlap(probe, this.game.world.colliders)) crouchTarget = 1;
    }
    this.crouchAmt = U.damp(this.crouchAmt, crouchTarget, 12, dt);
    this.body.h = U.lerp(1.95, 1.4, this.crouchAmt);

    const wish = this._wishDir();
    const def = WEAPONS[this.cur];
    const hsp0 = Math.sqrt(this.body.vel.x ** 2 + this.body.vel.z ** 2);
    const maxSp = 8 * this.cls.spd * (this.runHeld && !this.adsHeld && !this.crouchHeld ? 1.32 : 1) * (this.crouchHeld ? 0.52 : 1) * U.lerp(1, 0.62, this.adsAmt);

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.body.vel.x = this.dashDir.x * 16.5;
      this.body.vel.z = this.dashDir.z * 16.5;
    } else {
      if (wish) {
        const k = this.body.grounded ? 12 : 3.2;
        this.body.vel.x = U.damp(this.body.vel.x, wish.x * maxSp, k, dt);
        this.body.vel.z = U.damp(this.body.vel.z, wish.z * maxSp, k, dt);
      } else {
        const f = Math.exp(-(this.body.grounded ? 11 : 0.7) * dt);
        this.body.vel.x *= f;
        this.body.vel.z *= f;
      }
    }

    if (this.dashEdge) {
      this.dashEdge = false;
      if (this.dashCd <= 0 && this.dashT <= 0) {
        const d = wish || { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
        this.dashDir.set(d.x, 0, d.z);
        this.dashT = 0.16;
        this.dashCd = 1.25 * this.cls.dash;
        this.game.sfx.play('dash');
      }
    }

    if (this.body.grounded) this.coyote = 0.09;
    else if (this.coyote > 0) this.coyote -= dt;
    if (this.jumpBuf > 0 && (this.body.grounded || this.coyote > 0)) {
      this.body.vel.y = 9.6;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.game.sfx.play('jump');
    }
    this.body.vel.y -= 27 * dt;

    const wasGrounded = this.body.grounded;
    const prevVy = this.body.vel.y;
    moveBody(this.body, dt, this.game.world.colliders);
    if (!wasGrounded && this.body.grounded && prevVy < -13) {
      this.landDip = Math.min(0.22, -prevVy * 0.012);
      this.game.sfx.play('land');
      this.game.addShake(Math.min(0.35, -prevVy * 0.012));
    }
    if (this.landDip > 0) this.landDip = Math.max(0, this.landDip - dt * 0.9);

    this.fireCd -= dt;
    if (this.reloading) {
      this.reloading.t -= dt;
      if (this.reloading.t <= 0) {
        this.ammo[this.cur] = def.mag;
        this.reloading = null;
      }
    }
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.switchT <= 0.11 && this.pendingSlot) {
        this.models[this.cur].visible = false;
        this.cur = this.pendingSlot;
        this.pendingSlot = null;
        this.models[this.cur].visible = true;
      }
    }

    const canFire = this.fireCd <= 0 && !this.reloading && this.switchT <= 0;
    const wantFire = def.auto ? this.fireHeld : this.fireEdge;
    if (wantFire && canFire) {
      if (this.ammo[this.cur] <= 0) {
        this.game.sfx.play('dry');
        this.fireCd = 0.25;
        this._startReload();
      } else {
        this._shoot(def);
      }
    }
    this.fireEdge = false;

    if (this.grenadeEdge) {
      this.grenadeEdge = false;
      if (this.grenades > 0 && !this.reloading) {
        this.grenades--;
        const cam = this.game.camera;
        cam.updateMatrixWorld();
        const o = cam.getWorldPosition(new THREE.Vector3());
        const d = cam.getWorldDirection(new THREE.Vector3());
        this.game.spawnGrenade(o.addScaledVector(d, 0.4), d.multiplyScalar(GRENADE.spd).add(new THREE.Vector3(0, 4.5, 0)).add(this.body.vel.clone().multiplyScalar(0.4)), this);
        this.game.sfx.play('throw');
      }
    }

    this.adsAmt = U.damp(this.adsAmt, (this.adsHeld && !this.reloading && this.switchT <= 0) ? 1 : 0, 13, dt);

    this.recoil = U.damp(this.recoil, 0, 9, dt);
    this.vmKick = U.damp(this.vmKick, 0, 11, dt);
    this.swayX = U.damp(this.swayX, 0, 7, dt);
    this.swayY = U.damp(this.swayY, 0, 7, dt);

    const hsp = Math.sqrt(this.body.vel.x ** 2 + this.body.vel.z ** 2);
    if (this.body.grounded) this.bobT += hsp * dt * 1.15;
    const mvF = U.clamp(hsp / 8, 0, 1) * (this.body.grounded ? 1 : 0.15);
    const model = this.models[this.cur];
    const bx = U.lerp(0.27, 0, this.adsAmt) + Math.cos(this.bobT * 2) * 0.012 * mvF - this.swayX * 0.6;
    const by = U.lerp(-0.25, -0.175, this.adsAmt) + Math.abs(Math.sin(this.bobT * 2)) * 0.014 * mvF - this.swayY * 0.5 - this.landDip * 0.35;
    const bz = U.lerp(-0.52, -0.4, this.adsAmt) + this.vmKick * 0.07;
    model.position.set(bx, by, bz);
    model.rotation.set(this.vmKick * 0.12 + this.swayY * 1.2, this.swayX * 1.6, this.swayX * 0.8);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) model.userData.flash.visible = false;
    }
  }

  _shoot(def) {
    const g = this.game;
    g.camera.updateMatrixWorld();
    this.ammo[this.cur]--;
    this.fireCd = 60 / def.rpm;
    this.fireEdge = false;

    const origin = g.camera.getWorldPosition(new THREE.Vector3());
    const baseDir = g.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(g.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(g.camera.matrixWorld, 1);
    const hsp = Math.sqrt(this.body.vel.x ** 2 + this.body.vel.z ** 2);

    const muzzleW = this.models[this.cur].userData.muzzle.getWorldPosition(new THREE.Vector3());
    const flash = this.models[this.cur].userData.flash;
    flash.visible = true;
    this.flashT = 0.045;

    if (def.proj) {
      g.spawnRocket(muzzleW.clone().addScaledVector(baseDir, 0.5), baseDir.clone(), this);
      this.recoil += def.kick;
      this.yaw += U.rand(-1, 1) * def.kick * 0.3;
      this.vmKick = 1;
      g.sfx.play('rpg');
      return;
    }

    const pellets = def.pellets || 1;
    const spreadMul = 1 + hsp * 0.055 + (this.body.grounded ? 0 : 0.9) + this.crouchAmt * -0.25;
    const spr = U.lerp(def.spread, def.adsSpr === undefined ? def.spread : def.adsSpr, this.adsAmt) * Math.max(spreadMul, 0.35);
    let anyHit = false, anyHead = false, anyKill = false;

    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone()
        .addScaledVector(right, U.rand(-1, 1) * spr)
        .addScaledVector(up, U.rand(-1, 1) * spr)
        .normalize();
      const wall = g.raycastWorld(origin, dir, def.range);
      let bestT = wall ? wall.t : def.range;
      let hitEnt = null, isHead = false;
      for (const e of g.combatants()) {
        if (e === this || !e.alive) continue;
        const b = e.getAABB();
        const t = segBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bestT, b);
        if (t !== false) {
          bestT = t;
          hitEnt = e;
          const hy = origin.y + dir.y * t;
          isHead = hy > b.y1 - 0.55;
        }
      }
      const end = origin.clone().addScaledVector(dir, bestT);
      g.effects.tracer(muzzleW, end, 0xfff3b0);
      if (hitEnt) {
        let dmg = def.dmg * (isHead ? def.head : 1);
        const fallStart = def.range * 0.45;
        if (bestT > fallStart) dmg *= U.lerp(1, 0.55, U.clamp((bestT - fallStart) / (def.range - fallStart), 0, 1));
        dmg = Math.round(dmg);
        const damaged = g.hurt(hitEnt, dmg, this, isHead, this.cur);
        if (damaged) {
          anyHit = true;
          if (isHead) anyHead = true;
          if (!hitEnt.alive) anyKill = true;
          g.effects.impact(end, true);
          g.effects.dmgNum(end, dmg, isHead ? 'crit' : '');
        }
      } else if (wall) {
        g.effects.impact(end, false);
      }
    }

    if (anyKill) g.sfx.play('kill');
    else if (anyHead) g.sfx.play('crit');
    else if (anyHit) g.sfx.play('hit');

    this.recoil += def.kick * U.rand(0.85, 1.15) * U.lerp(1, 0.6, this.adsAmt);
    this.yaw += U.rand(-1, 1) * def.kick * 0.35;
    this.vmKick = 1;
    g.sfx.play(def.snd, null, 1);
  }

  hurt(dmg, from, isHead, wpn) {
    if (!this.alive || this.prot > 0) return false;
    let d = dmg;
    if ((wpn === 'rocket' || wpn === 'grenade') && this.cls.resist < 1) d *= this.cls.resist;
    this.hp -= d;
    const g = this.game;
    g.hud.setDmgFlash();
    g.addShake(0.12);
    g.sfx.play('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.score.d++;
      this.adsHeld = false;
      this.fireHeld = false;
      this.fireEdge = false;
      this.grenadeEdge = false;
      this.dashEdge = false;
      this.dashT = 0;
      g.registerKill(from, this, isHead, wpn);
    }
    return true;
  }

  respawn() {
    const s = this.game.pickSpawn(this);
    this.body.pos.set(s.x, s.y + 0.1, s.z);
    this.body.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.alive = true;
    this.prot = 1.5;
    this.quadT = 0;
    this.grenades = GRENADE.max;
    for (const k of SLOT_ORDER) this.ammo[k] = WEAPONS[k].mag;
    this.reloading = null;
    this.pendingSlot = null;
    this.switchT = 0;
    this.recoil = 0;
    this.pitch = 0;
    this.game.sfx.play('spawn');
  }
}
