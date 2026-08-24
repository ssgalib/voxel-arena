class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tracers = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true }));
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.parts = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      this.scene.add(m);
      this.parts.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, g: 0 });
    }
    this.shocks = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      this.shocks.push({ mesh: m, life: 0 });
    }
    this.flash = new THREE.PointLight(0xffb055, 0, 34);
    this.scene.add(this.flash);
    this.flashLife = 0;
    this.dmgNums = [];
    this.tmpV = new THREE.Vector3();
  }

  tracer(a, b, color) {
    let best = null;
    for (const t of this.tracers) if (t.life <= 0) { best = t; break; }
    if (!best) best = this.tracers[0];
    const len = a.distanceTo(b);
    if (len < 0.2) return;
    const m = best.mesh;
    m.material.color.setHex(color === undefined ? 0xffe9a0 : color);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    m.scale.set(0.04, 0.04, len);
    m.visible = true;
    m.material.opacity = 0.95;
    best.life = 0.09;
  }

  burst(pos, o) {
    const n = o.n || 8;
    let made = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      const s = o.size || 0.12;
      p.mesh.scale.set(s * U.rand(0.6, 1.4), s * U.rand(0.6, 1.4), s * U.rand(0.6, 1.4));
      p.mesh.material.color.setHex(o.color);
      p.mesh.position.copy(pos);
      p.vel.set(U.rand(-1, 1), U.rand(o.up === undefined ? -0.4 : o.up, 1), U.rand(-1, 1)).normalize().multiplyScalar((o.speed || 6) * U.rand(0.4, 1));
      p.g = o.gravity === undefined ? 16 : o.gravity;
      p.max = p.life = (o.life || 0.6) * U.rand(0.7, 1.3);
      p.mesh.visible = true;
      made++;
      if (made >= n) break;
    }
  }

  impact(pos, flesh) {
    if (flesh) this.burst(pos, { n: 6, color: 0xc22a2a, speed: 5, size: 0.11, life: 0.45 });
    else {
      this.burst(pos, { n: 5, color: 0x9aa0aa, speed: 5, size: 0.08, life: 0.35 });
      this.burst(pos, { n: 2, color: 0xffd77a, speed: 7, size: 0.06, life: 0.15, gravity: 2 });
    }
  }

  explosion(pos, radius) {
    this.burst(pos, { n: 26, color: 0xff8c3a, speed: 15, size: 0.3, life: 0.7, gravity: 9, up: 0.1 });
    this.burst(pos, { n: 14, color: 0x555a60, speed: 6, size: 0.42, life: 1.1, gravity: -2, up: 0.4 });
    let sh = null;
    for (const s of this.shocks) if (s.life <= 0) { sh = s; break; }
    if (!sh) sh = this.shocks[0];
    sh.mesh.position.copy(pos);
    sh.mesh.scale.setScalar(radius * 0.25);
    sh.mesh.material.opacity = 0.85;
    sh.mesh.visible = true;
    sh.life = 0.28;
    this.flash.position.copy(pos).y += 1;
    this.flash.intensity = 4;
    this.flashLife = 0.22;
  }

  dmgNum(pos, txt, cls) {
    const el = document.createElement('span');
    el.textContent = txt;
    if (cls) el.className = cls;
    U.el('dmglayer').appendChild(el);
    this.dmgNums.push({ el: el, p: pos.clone(), t: 0 });
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(t.life / 0.09, 0) * 0.95;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const p of this.parts) {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= p.g * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.03 && p.vel.y < 0) { p.mesh.position.y = 0.03; p.vel.y *= -0.4; p.vel.x *= 0.7; p.vel.z *= 0.7; }
        p.mesh.material.opacity = Math.max(p.life / p.max, 0);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (const s of this.shocks) {
      if (s.life > 0) {
        s.life -= dt;
        const k = 1 - Math.max(s.life, 0) / 0.28;
        s.mesh.scale.setScalar(s.mesh.scale.x + dt * 26);
        s.mesh.material.opacity = 0.85 * (1 - k);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(this.flashLife / 0.22, 0) * 4;
    }
    const cam = this.game.camera;
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.t += dt;
      d.p.y += dt * 1.4;
      this.tmpV.copy(d.p).project(cam);
      if (this.tmpV.z < 1 && d.t < 0.75) {
        d.el.style.left = ((this.tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
        d.el.style.top = ((-this.tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
        d.el.style.opacity = 1 - d.t / 0.75;
      } else { d.el.remove(); this.dmgNums.splice(i, 1); }
    }
  }
}
