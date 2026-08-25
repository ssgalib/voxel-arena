function makeNameTag(name, colorHex) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.9, 0.48, 1);
  const api = {
    sprite: spr,
    draw(hpFrac) {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 256, 64);
      g.font = '900 27px Arial';
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(name, 128, 30);
      g.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
      g.fillText(name, 128, 30);
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillRect(58, 42, 140, 11);
      const w = Math.max(0, hpFrac) * 136;
      g.fillStyle = hpFrac > 0.5 ? '#7ddf36' : hpFrac > 0.25 ? '#ffb03a' : '#ff4747';
      g.fillRect(60, 44, w, 7);
      tex.needsUpdate = true;
    }
  };
  api.draw(1);
  return api;
}

function buildCharacterMesh(name, colorHex) {
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
  gun.position.set(0.3, 1.32, 0.18);
  const gm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), new THREE.MeshLambertMaterial({ color: 0x23272e }));
  gun.add(gm);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), new THREE.MeshLambertMaterial({ color: 0x3a4150 }));
  barrel.position.z = 0.42;
  gun.add(barrel);
  g.add(gun);
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0.3, 1.35, 0.86);
  g.add(muzzleTip);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.45);
  flash.visible = false;
  muzzleTip.add(flash);
  const tag = makeNameTag(name, c);
  tag.sprite.position.y = 2.5;
  g.add(tag.sprite);
  return { group: g, legL, legR, armL, armR, muzzleTip, flash, tag };
}

function animateAvatar(av, hsp, dt, aiming) {
  av.animPhase = (av.animPhase || 0) + hsp * dt * 1.6;
  const swing = Math.min(hsp / 6, 1) * 0.6;
  const s = Math.sin(av.animPhase * 3.2);
  av.legL.rotation.x = s * swing;
  av.legR.rotation.x = -s * swing;
  av.armL.rotation.x = -s * swing * 0.7;
  av.armR.rotation.x = aiming ? -1.3 : s * swing * 0.7 - 0.25;
}
