const WEAPONS = {
  rifle: { name: 'ASSAULT RIFLE', dmg: 14, head: 1.8, rpm: 600, mag: 30, rel: 1.7, spread: 0.022, adsSpr: 0.007, range: 130, auto: true, kick: 0.011, snd: 'rifle' },
  shotgun: { name: 'SHOTGUN', dmg: 9, head: 1.6, pellets: 8, rpm: 78, mag: 6, rel: 2.2, spread: 0.065, adsSpr: 0.05, range: 42, auto: false, kick: 0.042, snd: 'shotgun' },
  sniper: { name: 'SNIPER', dmg: 80, head: 2.0, rpm: 45, mag: 5, rel: 2.4, spread: 0.05, adsSpr: 0.0006, range: 300, auto: false, kick: 0.055, zoomFov: 22, snd: 'sniper' },
  rpg: { name: 'ROCKET LAUNCHER', proj: true, speed: 40, dmg: 110, radius: 6.2, rpm: 38, mag: 1, rel: 2.6, kick: 0.06, zoomFov: 60, snd: 'rpg' },
  pistol: { name: 'PISTOL', dmg: 20, head: 2.0, rpm: 330, mag: 12, rel: 1.25, spread: 0.02, adsSpr: 0.008, range: 90, auto: false, kick: 0.016, snd: 'pistol' }
};
const SLOT_ORDER = ['rifle', 'shotgun', 'sniper', 'rpg', 'pistol'];
const GRENADE = { max: 3, fuse: 2.1, spd: 21, dmg: 105, radius: 6 };

let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(0.35, 'rgba(255,200,80,0.85)');
  gr.addColorStop(1, 'rgba(255,150,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _flashTex = new THREE.CanvasTexture(cv);
  return _flashTex;
}

const GM = 0x23272e, GM2 = 0x3a4150, WOOD = 0x6e4a26;
function vbox(g, sx, sy, sz, x, y, z, color, rx) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  g.add(m);
  return m;
}

function buildViewModel(kind) {
  const g = new THREE.Group();
  let muzzleZ = -0.6;
  if (kind === 'rifle') {
    vbox(g, 0.09, 0.13, 0.58, 0, 0, -0.18, GM);
    vbox(g, 0.05, 0.05, 0.34, 0, 0.01, -0.6, GM2);
    vbox(g, 0.07, 0.2, 0.12, 0, -0.14, -0.16, GM2, 0.28);
    vbox(g, 0.08, 0.1, 0.22, 0, -0.03, 0.2, WOOD);
    vbox(g, 0.03, 0.05, 0.1, 0, 0.09, -0.32, GM2);
    muzzleZ = -0.78;
  } else if (kind === 'shotgun') {
    vbox(g, 0.1, 0.11, 0.72, 0, 0, -0.24, GM);
    vbox(g, 0.09, 0.09, 0.24, 0, -0.09, -0.34, WOOD);
    vbox(g, 0.08, 0.12, 0.24, 0, -0.04, 0.18, WOOD);
    muzzleZ = -0.62;
  } else if (kind === 'sniper') {
    vbox(g, 0.08, 0.12, 0.9, 0, 0, -0.3, GM);
    vbox(g, 0.06, 0.07, 0.26, 0, 0.1, -0.28, GM2);
    vbox(g, 0.05, 0.05, 0.3, 0, 0, -0.82, GM2);
    vbox(g, 0.08, 0.14, 0.2, 0, -0.05, 0.14, WOOD);
    muzzleZ = -0.98;
  } else if (kind === 'rpg') {
    const tube = vbox(g, 0.17, 0.17, 0.95, 0, 0.02, -0.25, 0x5c6b46);
    tube.rotation.x = 0;
    vbox(g, 0.2, 0.2, 0.16, 0, 0.02, -0.68, 0x49563a);
    vbox(g, 0.13, 0.13, 0.2, 0, 0.02, 0.22, 0x49563a);
    vbox(g, 0.07, 0.16, 0.1, 0, -0.12, -0.05, GM2);
    muzzleZ = -0.78;
  } else {
    vbox(g, 0.07, 0.13, 0.26, 0, 0, -0.1, GM);
    vbox(g, 0.06, 0.16, 0.09, 0, -0.13, 0.02, GM2, 0.15);
    muzzleZ = -0.25;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, muzzleZ);
  g.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.34);
  flash.visible = false;
  muzzle.add(flash);
  g.userData.muzzle = muzzle;
  g.userData.flash = flash;
  g.userData.base = new THREE.Vector3(0.27, -0.25, -0.52);
  g.visible = false;
  return g;
}
