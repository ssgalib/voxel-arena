function makeCheckerTex(c1, c2, px) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px * 2;
  const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, px * 2, px * 2);
  g.fillStyle = c2; g.fillRect(0, 0, px, px); g.fillRect(px, px, px, px);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function mapArena(addBox, U) {
  const stoneA = 0x8a8f98, stoneB = 0x767b84;
  const S = 44;
  for (let i = 0; i < 4; i++) {
    const horiz = i < 2;
    const sign = i % 2 === 0 ? 1 : -1;
    if (horiz) addBox(0, 3, sign * S, 88, 6, 2, i === 0 ? stoneA : stoneB);
    else addBox(sign * S, 3, 0, 2, 6, 88, i === 2 ? stoneA : stoneB);
  }
  for (let x = -40; x <= 40; x += 5) {
    addBox(x, 6.75, -43.5, 2.4, 1.5, 2.4, x % 10 === 0 ? 0x9aa0aa : stoneB);
    addBox(x, 6.75, 43.5, 2.4, 1.5, 2.4, x % 10 === 0 ? 0x9aa0aa : stoneB);
    addBox(-43.5, 6.75, x, 2.4, 1.5, 2.4, x % 10 === 0 ? 0x9aa0aa : stoneB);
    addBox(43.5, 6.75, x, 2.4, 1.5, 2.4, x % 10 === 0 ? 0x9aa0aa : stoneB);
  }

  addBox(0, 1, 0, 18, 2, 18, 0xb0895c);
  const stepA = 0xc09a6a, stepB = 0xa9855a;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const d of dirs) {
    if (d[1] !== 0) {
      addBox(0, 0.375, d[1] * 13.5, 6, 0.75, 3, stepA);
      addBox(0, 0.75, d[1] * 10.5, 6, 1.5, 3, stepB);
    } else {
      addBox(d[0] * 13.5, 0.375, 0, 3, 0.75, 6, stepA);
      addBox(d[0] * 10.5, 0.75, 0, 3, 1.5, 6, stepB);
    }
  }
  for (const p of [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]]) {
    addBox(p[0], 3.25, p[1], 1.4, 2.5, 1.4, 0x6d7480);
    addBox(p[0], 4.75, p[1], 1.9, 0.5, 1.9, 0xff8c3a);
  }

  function tower(cx, cz) {
    addBox(cx, 5, cz, 7, 10, 7, 0x707786);
    addBox(cx, 10.4, cz, 8, 0.8, 8, 0x5d6470);
    for (let k = -1; k <= 1; k++) {
      addBox(cx + k * 3, 11.3, cz - 3.6, 1.6, 1.4, 1.2, 0x818896);
      addBox(cx + k * 3, 11.3, cz + 3.6, 1.6, 1.4, 1.2, 0x818896);
      addBox(cx - 3.6, 11.3, cz + k * 3, 1.2, 1.4, 1.6, 0x818896);
      addBox(cx + 3.6, 11.3, cz + k * 3, 1.2, 1.4, 1.6, 0x818896);
    }
    addBox(cx, 0.75, cz + 5.5, 3, 1.5, 2, 0x9aa0aa);
    addBox(cx, 2.25, cz + 4.6, 3, 1.5, 2.4, 0x8a90a0);
  }
  tower(-33, -33); tower(33, -33); tower(-33, 33); tower(33, 33);

  function container(cx, cz, rotZ, color) {
    if (rotZ) addBox(cx, 1.4, cz, 7, 2.8, 3, color);
    else addBox(cx, 1.4, cz, 3, 2.8, 7, color);
    addBox(cx, 2.85, cz, rotZ ? 6.6 : 2.6, 0.24, rotZ ? 2.6 : 6.6, color, { collide: false });
  }
  container(-16, -20, true, 0xc94f4f);
  container(18, -14, false, 0x4f7fc9);
  container(-20, 16, false, 0xd89438);
  container(15, 21, true, 0x53a86b);

  const crateC = [0xa8793e, 0x96682f, 0xb98a4a];
  function crate(cx, cz, big) {
    const s = big ? 2.6 : 1.8;
    addBox(cx, s / 2, cz, s, s, s, U.pick(crateC));
    addBox(cx, s / 2, cz, s * 1.02, s * 0.12, s * 1.02, 0x7c5624, { collide: false });
  }
  const crates = [[-8, -18, 1], [-6, -19, 0], [-26, -6, 1], [-27, -3, 0], [24, -27, 1], [26, -25, 0],
    [9, 17, 0], [10, 15.4, 1], [28, 12, 1], [-29, 27, 0], [-31, 25, 1], [5, -30, 0], [-4, 30, 1]];
  for (const c of crates) crate(c[0], c[1], c[2] === 1);

  addBox(-13, 0.35, 0, 8, 0.7, 1.2, 0xcf5746);
  addBox(13, 0.35, 0, 8, 0.7, 1.2, 0x468fcf);
  addBox(0, 0.35, -13, 1.2, 0.7, 8, 0xcf5746);
  addBox(0, 0.35, 13, 1.2, 0.7, 8, 0x468fcf);

  addBox(-30, 1.5, 8, 1.2, 3, 10, 0x6d7480);
  addBox(30, 1.5, -8, 1.2, 3, 10, 0x6d7480);
  addBox(8, 1.5, 30, 10, 3, 1.2, 0x6d7480);
  addBox(-8, 1.5, -30, 10, 3, 1.2, 0x6d7480);
}

function mapBunker(addBox, U) {
  const cA = 0x7a8066, cB = 0x6b7160, cDark = 0x565c4a;
  const S = 44, W = 2;
  for (let i = 0; i < 4; i++) {
    const horiz = i < 2;
    const sign = i % 2 === 0 ? 1 : -1;
    if (horiz) {
      addBox(0, 3, -23.5, 41, 6, W, i === 0 ? cA : cB);
      addBox(0, 3, 23.5, 41, 6, W, i === 0 ? cA : cB);
    } else {
      addBox(-23.5, 3, 0, W, 6, 41, i === 2 ? cA : cB);
      addBox(23.5, 3, 0, W, 6, 41, i === 2 ? cA : cB);
    }
  }
  for (let x = -40; x <= 40; x += 5) {
    addBox(x, 6.75, -43.5, 2.4, 1.5, 2.4, cDark);
    addBox(x, 6.75, 43.5, 2.4, 1.5, 2.4, cDark);
    addBox(-43.5, 6.75, x, 2.4, 1.5, 2.4, cDark);
    addBox(43.5, 6.75, x, 2.4, 1.5, 2.4, cDark);
  }

  addBox(0, 1, 0, 20, 2, 20, 0x6f7a55);
  const step = 0x84916a;
  for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (d[1] !== 0) {
      addBox(0, 0.5, d[1] * 14.5, 7, 1, 4, step);
      addBox(0, 0.8, d[1] * 11.5, 7, 1.6, 4, step);
    } else {
      addBox(d[0] * 14.5, 0.5, 0, 4, 1, 7, step);
      addBox(d[0] * 11.5, 0.8, 0, 4, 1.6, 7, step);
    }
  }
  addBox(0, 2.7, 0, 7, 1.4, 7, 0x565c4a);
  for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (d[1] !== 0) addBox(0, 3.05, d[1] * 5.5, 7, 0.7, 1, 0x8a9178);
    else addBox(d[0] * 5.5, 3.05, 0, 1, 0.7, 7, 0x8a9178);
  }

  function bunkerRoom(cx, cz, openDir) {
    addBox(cx, 0.45, cz, 11, 0.9, 11, 0x707a58);
    for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (d[0] === openDir && d[1] === 0) continue;
      if (d[1] === 0) addBox(cx + d[0] * 5, 1.5, cz, 1.2, 3, 11, cDark);
      else addBox(cx, 1.5, cz + d[1] * 5, 11, 3, 1.2, cDark);
    }
  }
  bunkerRoom(-33, -33, 1);
  bunkerRoom(33, -33, -1);
  bunkerRoom(-33, 33, 1);
  bunkerRoom(33, 33, -1);

  addBox(0, 0.6, 20, 30, 1.2, 1.2, 0x8a9178);
  addBox(0, 0.6, -20, 30, 1.2, 1.2, 0x8a9178);
  addBox(20, 0.6, 0, 1.2, 1.2, 30, 0x8a9178);
  addBox(-20, 0.6, 0, 1.2, 1.2, 30, 0x8a9178);

  addBox(24, 1.2, 24, 4, 2.4, 4, 0x9aa07e);
  addBox(-24, 1.2, 24, 4, 2.4, 4, 0x9aa07e);
  addBox(24, 1.2, -24, 4, 2.4, 4, 0x9aa07e);
  addBox(-24, 1.2, -24, 4, 2.4, 4, 0x9aa07e);
  addBox(14, 0.55, -12, 2, 1.1, 3, 0x565c4a);
  addBox(-14, 0.55, 12, 2, 1.1, 3, 0x565c4a);
  addBox(12, 0.55, 14, 3, 1.1, 2, 0x565c4a);
  addBox(-12, 0.55, -14, 3, 1.1, 2, 0x565c4a);
}

function mapFactory(addBox, U) {
  const cA = 0x9a8a6a, cB = 0x6d7480, cC = 0xb06a3a;
  const S = 44;
  for (let i = 0; i < 4; i++) {
    const horiz = i < 2;
    const sign = i % 2 === 0 ? 1 : -1;
    if (horiz) addBox(0, 3, sign * S, 88, 6, 2, i === 0 ? cA : cB);
    else addBox(sign * S, 3, 0, 2, 6, 88, i === 2 ? cA : cB);
  }
  for (let x = -40; x <= 40; x += 5) {
    addBox(x, 6.75, -43.5, 2.4, 1.5, 2.4, cC);
    addBox(x, 6.75, 43.5, 2.4, 1.5, 2.4, cC);
    addBox(-43.5, 6.75, x, 2.4, 1.5, 2.4, cC);
    addBox(43.5, 6.75, x, 2.4, 1.5, 2.4, cC);
  }

  addBox(-18, 1.5, 0, 6, 3, 40, 0x8b7c5c);
  addBox(18, 1.5, 0, 6, 3, 40, 0x8b7c5c);
  addBox(0, 1, 0, 14, 2, 14, 0x7a6e52);
  addBox(0, 2.5, 0, 6, 1, 6, 0x5d6470);

  for (const [x, z, rx] of [[-33, 20, 0], [33, 20, 1], [-33, -20, 0], [33, -20, 1]]) {
    if (rx) addBox(x, 0.55, z, 3, 1.1, 10, 0x9aa0aa);
    else addBox(x, 0.55, z, 10, 1.1, 3, 0x9aa0aa);
  }
  for (const [x, z] of [[-26, 6], [26, 6], [-26, -6], [26, -6]]) {
    addBox(x, 0.55, z, 8, 1.1, 1.4, 0x8f6b45);
  }

  function stack(cx, cz, n) {
    for (let i = 0; i < n; i++) {
      addBox(cx, i * 1.7 + 0.85, cz, 1.7, 1.7, 1.7, U.pick([0xa8793e, 0x96682f, 0xb98a4a]));
      addBox(cx, i * 1.7 + 0.85, cz, 1.74, 0.2, 1.74, 0x7c5624, { collide: false });
    }
  }
  stack(-31, 31, 2); stack(31, 31, 2); stack(-31, -31, 2); stack(31, -31, 2);
  stack(8, 26, 2); stack(-8, -26, 2); stack(26, -8, 2); stack(-26, 8, 2);

  addBox(-10, 0.35, 6, 1.4, 0.7, 8, 0xcf5746);
  addBox(10, 0.35, -6, 1.4, 0.7, 8, 0x468fcf);
  addBox(6, 0.35, 10, 8, 0.7, 1.4, 0xcf5746);
  addBox(-6, 0.35, -10, 8, 0.7, 1.4, 0x468fcf);

  addBox(-12, 2.2, -20, 1, 4.4, 1, 0x9aa0aa);
  addBox(12, 2.2, 20, 1, 4.4, 1, 0x9aa0aa);
  addBox(20, 2.2, -12, 1, 4.4, 1, 0x9aa0aa);
  addBox(-20, 2.2, 12, 1, 4.4, 1, 0x9aa0aa);
  addBox(-30, 1.5, 0, 2, 3, 2, 0x5d6470);
  addBox(30, 1.5, 0, 2, 3, 2, 0x5d6470);
  addBox(0, 1.5, 30, 2, 3, 2, 0x5d6470);
  addBox(0, 1.5, -30, 2, 3, 2, 0x5d6470);
}

const MAPS = { arena: mapArena, bunker: mapBunker, factory: mapFactory };

function buildWorld(scene, mapKey) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const mats = {};

  function matFor(color) {
    if (!mats[color]) mats[color] = new THREE.MeshLambertMaterial({ color: color });
    return mats[color];
  }

  function addBox(cx, cy, cz, sx, sy, sz, color, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), matFor(color));
    m.position.set(cx, cy, cz);
    if (opts.shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    if (opts.collide !== false) {
      colliders.push({
        x0: cx - sx / 2, x1: cx + sx / 2,
        y0: cy - sy / 2, y1: cy + sy / 2,
        z0: cz - sz / 2, z1: cz + sz / 2
      });
    }
    return m;
  }

  (MAPS[mapKey] || MAPS.arena)(addBox, U);

  const groundTex = makeCheckerTex('#5d9c3f', '#549237', 32);
  groundTex.repeat.set(22, 22);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(88, 88), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 7; i++) {
    const cl = new THREE.Group();
    const n = U.randi(3, 5);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(U.rand(4, 9), U.rand(1.5, 2.5), U.rand(3, 6)), cloudMat);
      b.position.set(U.rand(-4, 4), U.rand(-0.5, 0.5), U.rand(-2, 2));
      cl.add(b);
    }
    cl.position.set(U.rand(-70, 70), U.rand(34, 50), U.rand(-70, 70));
    group.add(cl);
    clouds.push(cl);
  }

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a7248, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.95);
  sun.position.set(34, 52, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  function groundYAt(x, z) {
    let y = 0;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3 && b.y1 <= 3.6 && b.y1 > y) y = b.y1;
    }
    return y;
  }

  function blockedAt(x, z) {
    const gy = groundYAt(x, z);
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.y0 < gy + 1.6 && b.y1 > gy + 0.9 && x > b.x0 - 0.45 && x < b.x1 + 0.45 && z > b.z0 - 0.45 && z < b.z1 + 0.45) return true;
    }
    return false;
  }

  const navPoints = [];
  for (let x = -40; x <= 40; x += 2.5) {
    for (let z = -40; z <= 40; z += 2.5) {
      if (!blockedAt(x, z)) navPoints.push({ x: x, z: z, y: groundYAt(x, z) });
    }
  }

  const spawns = [];
  const spawnXZ = [[0, 20], [0, -20], [20, 0], [-20, 0], [30, 30], [-30, 30], [30, -30], [-30, -30],
    [0, 36], [36, 0], [0, -36], [-36, 0], [14, 14], [-14, -14], [14, -14], [-14, 14]];
  for (const s of spawnXZ) spawns.push({ x: s[0], y: groundYAt(s[0], s[1]), z: s[1] });

  return { key: mapKey || 'arena', colliders: colliders, spawns: spawns, navPoints: navPoints, clouds: clouds, group: group, hemi: hemi, sun: sun };
}