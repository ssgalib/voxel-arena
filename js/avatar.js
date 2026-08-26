const FLAME_TAGS = new Set();

const FLAME_TIERS = [
  null,
  { tongues: 3, hMin: 9, hMax: 15, spread: 46, outer: 'rgba(255,120,20,0.55)', core: 'rgba(255,200,60,0)' },
  { tongues: 5, hMin: 13, hMax: 21, spread: 54, outer: 'rgba(255,110,15,0.8)', core: 'rgba(255,210,70,0.25)' },
  { tongues: 7, hMin: 17, hMax: 27, spread: 62, outer: 'rgba(255,90,10,0.9)', core: 'rgba(255,225,90,0.5)' },
  { tongues: 9, hMin: 21, hMax: 33, spread: 68, outer: 'rgba(255,60,5,1)', core: 'rgba(255,235,120,0.65)', embers: true },
  { tongues: 12, hMin: 25, hMax: 40, spread: 74, outer: 'rgba(255,40,0,1)', core: 'rgba(160,220,255,0.85)', embers: true }
];

function makeNameTag(name, colorHex, level) {
  const tier = tierForLevel(level);
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.9, 0.71, 1);
  let lastDraw = 0;
  let lastHp = 1;
  let talking = false;
  const api = {
    sprite: spr,
    tier: tier,
    draw(hpFrac) {
      lastHp = hpFrac;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 256, 96);
      g.font = '900 27px Arial';
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(name, 128, 64);
      g.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
      g.fillText(name, 128, 64);
      if (talking) {
        g.beginPath();
        g.arc(34, 55, 8, 0, Math.PI * 2);
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fill();
        g.beginPath();
        g.arc(34, 55, 5.5, 0, Math.PI * 2);
        g.fillStyle = '#7ddf36';
        g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillRect(58, 76, 140, 11);
      const w = Math.max(0, hpFrac) * 136;
      g.fillStyle = hpFrac > 0.5 ? '#7ddf36' : hpFrac > 0.25 ? '#ffb03a' : '#ff4747';
      g.fillRect(60, 78, w, 7);
      if (tier > 0) this._flames(g);
      tex.needsUpdate = true;
    },
    setTalking(on) {
      if (talking === on) return;
      talking = on;
      this.draw(lastHp);
    },
    _flames(g) {
      const t = FLAME_TIERS[tier];
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < t.tongues; i++) {
        const x = 128 + U.rand(-t.spread, t.spread);
        const h = U.rand(t.hMin, t.hMax) * (1 - Math.abs(x - 128) / (t.spread + 30) * 0.45);
        const w = U.rand(5, 10);
        const tipX = x + U.rand(-6, 6);
        const grad = g.createLinearGradient(x, 52, tipX, 52 - h);
        grad.addColorStop(0, t.outer);
        grad.addColorStop(0.55, t.core || 'rgba(255,180,50,0.2)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - w, 52);
        g.quadraticCurveTo(x - w * 0.9, 52 - h * 0.45, tipX, 52 - h);
        g.quadraticCurveTo(x + w * 0.9, 52 - h * 0.45, x + w, 52);
        g.closePath();
        g.fill();
      }
      if (t.embers) {
        g.fillStyle = tier >= 5 ? 'rgba(170,225,255,0.9)' : 'rgba(255,190,60,0.9)';
        for (let i = 0; i < tier * 2; i++) {
          const s = U.rand(1, 2.4);
          g.fillRect(U.rand(128 - t.spread, 128 + t.spread), U.rand(6, 44), s, s);
        }
      }
      g.restore();
    },
    tick(now) {
      if (tier <= 0) return;
      if (now - lastDraw < 130) return;
      lastDraw = now;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 256, 52);
      this._flames(g);
      tex.needsUpdate = true;
    },
    destroy() { FLAME_TAGS.delete(this); }
  };
  api.draw(1);
  if (tier > 0) FLAME_TAGS.add(api);
  return api;
}

const GUNMETAL = 0x23272e, GUNMETAL2 = 0x3a4150, WOODG = 0x6e4a26;

function abox(g, sx, sy, sz, x, y, z, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color: col }));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function buildAvatarGun(kind) {
  const g = new THREE.Group();
  if (kind === 'shotgun') {
    abox(g, 0.1, 0.12, 0.5, 0, 0, 0.18, GUNMETAL);
    abox(g, 0.042, 0.042, 0.34, -0.026, 0.02, -0.16, GUNMETAL2);
    abox(g, 0.042, 0.042, 0.34, 0.026, 0.02, -0.16, GUNMETAL2);
    abox(g, 0.085, 0.07, 0.16, 0, -0.03, -0.1, WOODG);
    abox(g, 0.08, 0.11, 0.16, 0, -0.05, 0.36, WOODG);
  } else if (kind === 'sniper') {
    abox(g, 0.07, 0.1, 0.6, 0, 0, 0.1, GUNMETAL);
    abox(g, 0.04, 0.04, 0.4, 0, 0.01, -0.32, GUNMETAL2);
    abox(g, 0.05, 0.05, 0.18, 0, 0.09, 0.02, 0x1a1e24);
    abox(g, 0.07, 0.12, 0.16, 0, -0.04, 0.32, WOODG);
  } else if (kind === 'rpg') {
    abox(g, 0.15, 0.15, 0.72, 0, 0.02, 0.05, 0x5c6b46);
    abox(g, 0.19, 0.19, 0.14, 0, 0.02, -0.34, 0x49563a);
    abox(g, 0.1, 0.1, 0.14, 0, 0.02, 0.44, 0x49563a);
    abox(g, 0.06, 0.13, 0.08, 0, -0.1, 0.14, GUNMETAL2);
  } else if (kind === 'pistol') {
    abox(g, 0.055, 0.09, 0.2, 0, 0.02, -0.02, GUNMETAL);
    abox(g, 0.05, 0.12, 0.07, 0, -0.07, 0.07, GUNMETAL2);
  } else {
    abox(g, 0.09, 0.12, 0.5, 0, 0, 0.08, GUNMETAL);
    abox(g, 0.045, 0.045, 0.26, 0, 0.01, -0.28, GUNMETAL2);
    abox(g, 0.06, 0.16, 0.1, 0, -0.11, 0.06, GUNMETAL2);
    abox(g, 0.08, 0.09, 0.16, 0, -0.02, 0.3, WOODG);
  }
  g.visible = false;
  return g;
}

function buildCrown() {
  const g = new THREE.Group();
  const gold = 0xffd23e;
  abox(g, 0.36, 0.1, 0.36, 0, 0.05, 0, gold);
  abox(g, 0.07, 0.15, 0.07, -0.13, 0.17, -0.13, gold);
  abox(g, 0.07, 0.19, 0.07, 0.13, 0.19, -0.13, gold);
  abox(g, 0.07, 0.15, 0.07, -0.13, 0.17, 0.13, gold);
  abox(g, 0.07, 0.19, 0.07, 0.13, 0.19, 0.13, gold);
  abox(g, 0.07, 0.07, 0.07, 0, 0.14, 0, 0xff4747);
  g.visible = false;
  return g;
}

function buildCharacterMesh(name, colorHex, level) {
  const c = colorHex;
  const dark = new THREE.Color(c).multiplyScalar(0.65).getHex();
  const g = new THREE.Group();
  const skin = 0xd9a066;
  function limb(w, h, d, x, y, z, col) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  const legL = limb(0.26, 0.82, 0.26, -0.17, 0.84, 0, 0x39404d);
  const legR = limb(0.26, 0.82, 0.26, 0.17, 0.84, 0, 0x39404d);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.4), new THREE.MeshLambertMaterial({ color: c }));
  torso.position.y = 1.21;
  torso.castShadow = true;
  g.add(torso);
  const armL = limb(0.2, 0.66, 0.2, -0.47, 1.52, 0, c);
  const armR = limb(0.2, 0.66, 0.2, 0.47, 1.52, 0, c);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.83;
  head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.03), new THREE.MeshLambertMaterial({ color: dark }));
  visor.position.set(0, 1.87, 0.245);
  g.add(visor);
  const gun = new THREE.Group();
  gun.position.set(0.42, 1.28, 0.42);
  gun.scale.setScalar(1.3);
  const guns = {};
  for (const k of SLOT_ORDER) {
    guns[k] = buildAvatarGun(k);
    gun.add(guns[k]);
  }
  guns.rifle.visible = true;
  g.add(gun);
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.03, 0.68);
  gun.add(muzzleTip);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.45);
  flash.visible = false;
  muzzleTip.add(flash);
  const tag = makeNameTag(name, c, level || 0);
  tag.sprite.position.y = 2.72;
  g.add(tag.sprite);
  const crown = buildCrown();
  crown.position.y = 2.32;
  g.add(crown);
  const api = {
    group: g, legL, legR, armL, armR, torso, head, visor, gun,
    muzzleTip, flash, tag, crown,
    setGun(kind) {
      if (!guns[kind] || this.curGun === kind) return;
      if (this.curGun) guns[this.curGun].visible = false;
      guns[kind].visible = true;
      this.curGun = kind;
    },
    setCrown(on) {
      if (this.crown.visible !== !!on) this.crown.visible = !!on;
    }
  };
  api.curGun = 'rifle';
  return api;
}

function animateAvatar(av, hsp, dt, aiming, pitch, crouch) {
  av.animPhase = (av.animPhase || 0) + hsp * dt * 1.6;
  av.aimAmt = U.damp(av.aimAmt || 0, aiming ? 1 : 0, 12, dt);
  const a = av.aimAmt;
  const p = U.clamp(pitch || 0, -1.53, 1.53);
  const c = U.clamp(crouch || 0, 0, 1);
  const swing = Math.min(hsp / 6, 1) * 0.6 * (1 - a * 0.7);
  const s = Math.sin(av.animPhase * 3.2);
  av.legL.rotation.x = s * swing;
  av.legR.rotation.x = -s * swing;
  av.legL.scale.y = av.legR.scale.y = 1 - 0.3 * c;
  if (av.torso) {
    av.torso.position.y = 1.21 - 0.28 * c;
    av.head.position.y = 1.83 - 0.42 * c;
    av.visor.position.y = 1.87 - 0.42 * c;
    av.gun.position.y = 1.28 - 0.35 * c;
    const tagTarget = av.crown && av.crown.visible ? 3.16 : 2.72;
    av.tagY = U.damp(av.tagY || 2.72, tagTarget, 8, dt);
    av.tag.sprite.position.y = av.tagY - 0.42 * c;
  }
  av.armL.rotation.x = U.lerp(-s * swing * 0.7, -1.05, a * 0.85);
  av.armR.rotation.x = U.lerp(s * swing * 0.7 - 0.25, -1.3 - p * 0.55, a);
  av.gun.rotation.x = -p * (0.3 + 0.7 * a);
  av.gun.position.z = 0.42 + a * 0.12;
  if (av.crown && av.crown.visible) {
    av.crown.position.y = 2.32 + Math.sin(performance.now() * 0.004) * 0.05;
    av.crown.rotation.y += dt * 1.6;
  }
  if (av.tag && av.tag.tick) av.tag.tick(performance.now());
}
