const PICKUP_DEFS = {
  health: { color: 0x53d76a, respawn: 12, heal: 40 },
  nades: { color: 0xffb03a, respawn: 15 },
  quad: { color: 0xc14fff, respawn: 45, duration: 25 }
};

function Pickups(game) {
  this.game = game;
  this.items = [];
  this.t = 0;
  const spots = [
    ['quad', 0, 2.75, 0],
    ['health', -13, 0.6, -14],
    ['health', 23, 0.6, -8],
    ['health', -24, 0.6, 10],
    ['health', 12, 0.6, 26],
    ['nades', -12, 0.6, 12],
    ['nades', 12, 0.6, -12],
    ['nades', 27, 0.6, 27],
    ['nades', -27, 0.6, -27]
  ];
  for (const s of spots) this.items.push(this._make(s[0], s[1], s[2], s[3]));
}

Pickups.prototype._make = function (kind, x, y, z) {
  const def = PICKUP_DEFS[kind];
  const grp = new THREE.Group();
  if (kind === 'health') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xf2f6f8 }));
    grp.add(box);
    const barMat = new THREE.MeshLambertMaterial({ color: def.color });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.11), barMat);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.11), barMat);
    grp.add(b1); grp.add(b2);
  } else if (kind === 'nades') {
    for (let i = -1; i <= 1; i++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshLambertMaterial({ color: i === 0 ? def.color : 0x3d5c34 }));
      n.position.set(i * 0.21, 0, 0);
      grp.add(n);
    }
  } else {
    const q = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshLambertMaterial({ color: def.color, emissive: 0x5a1a80 }));
    grp.add(q);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 18), new THREE.MeshLambertMaterial({ color: 0xe8c8ff }));
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  grp.position.set(x, y, z);
  grp.userData.phase = U.rand(0, Math.PI * 2);
  this.game.scene.add(grp);
  return { kind: kind, def: def, grp: grp, x: x, baseY: y, active: true, cd: 0 };
};

Pickups.prototype.update = function (dt) {
  this.t += dt;
  const ents = this.game.combatants();
  for (const e of ents) {
    if (e.quadT > 0) {
      e.quadT -= dt;
      if (e.quadT <= 0) {
        e.quadT = 0;
        if (e.isPlayer) this.game.hud.subAnnounce('QUAD EXPIRED');
      }
    }
  }
  for (const it of this.items) {
    if (!it.active) {
      it.cd -= dt;
      if (it.cd <= 0) { it.active = true; it.grp.visible = true; }
      continue;
    }
    it.grp.rotation.y += dt * 1.7;
    it.grp.position.y = it.baseY + Math.sin(this.t * 2.2 + it.grp.userData.phase) * 0.12;
    for (const e of ents) {
      if (!e.alive) continue;
      const p = e.body.pos;
      const dx = p.x - it.x, dz = p.z - it.z;
      if (dx * dx + dz * dz > 1.7) continue;
      const gy = it.grp.position.y;
      if (p.y > gy + 1.2 || p.y + 1.95 < gy - 0.4) continue;
      if (!this._apply(it, e)) continue;
      it.active = false;
      it.cd = it.def.respawn;
      it.grp.visible = false;
      const fx = new THREE.Vector3(it.x, gy, it.z);
      this.game.effects.burst(fx, { n: 14, color: it.def.color, speed: 5, size: 0.15, life: 0.5 });
      this.game.sfx.play('pickup', fx, 0.9);
      break;
    }
  }
};

Pickups.prototype._apply = function (it, e) {
  const g = this.game;
  if (it.kind === 'health') {
    if (e.hp >= e.maxHp) return false;
    e.hp = Math.min(e.maxHp, e.hp + it.def.heal);
    if (e.tag) e.tag.draw(e.hp / e.maxHp);
    if (e.isPlayer) g.hud.subAnnounce('+' + it.def.heal + ' HP');
    return true;
  }
  if (it.kind === 'nades') {
    if (!e.isPlayer || e.grenades >= GRENADE.max) return false;
    e.grenades = GRENADE.max;
    g.hud.subAnnounce('GRENADES RESTOCKED');
    return true;
  }
  e.quadT = it.def.duration;
  if (e.isPlayer) g.hud.subAnnounce('QUAD DAMAGE \u2014 ' + it.def.duration + 'S');
  return true;
};

Pickups.prototype.dispose = function () {
  for (const it of this.items) this.game.scene.remove(it.grp);
  this.items = [];
};
