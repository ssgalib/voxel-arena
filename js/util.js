window.U = {
  rand(a, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(this.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  damp(a, b, k, dt) { return this.lerp(a, b, 1 - Math.exp(-k * dt)); },
  el(id) { return document.getElementById(id); }
};

window.segBox = function (ox, oy, oz, dx, dy, dz, len, b) {
  let tmin = 0, tmax = len;
  let t1, t2, inv;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return false; }
  else { inv = 1 / dx; t1 = (b.x0 - ox) * inv; t2 = (b.x1 - ox) * inv; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false; }
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return false; }
  else { inv = 1 / dy; t1 = (b.y0 - oy) * inv; t2 = (b.y1 - oy) * inv; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false; }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return false; }
  else { inv = 1 / dz; t1 = (b.z0 - oz) * inv; t2 = (b.z1 - oz) * inv; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false; }
  return tmin;
};

window.raycastBoxes = function (o, d, len, boxes) {
  let best = null;
  for (let i = 0; i < boxes.length; i++) {
    const t = segBox(o.x, o.y, o.z, d.x, d.y, d.z, len, boxes[i]);
    if (t !== false && (best === null || t < best.t)) best = { t: t, box: boxes[i] };
  }
  return best;
};

function bodyOverlap(body, b) {
  const p = body.pos;
  return p.x + body.r > b.x0 && p.x - body.r < b.x1 &&
         p.y + body.h > b.y0 && p.y < b.y1 &&
         p.z + body.r > b.z0 && p.z - body.r < b.z1;
}

window.anyOverlap = function (body, boxes) {
  for (let i = 0; i < boxes.length; i++) if (bodyOverlap(body, boxes[i])) return true;
  return false;
};

window.moveBody = function (body, dt, boxes) {
  const p = body.pos;
  body.hitWall = false;
  const wasGrounded = body.grounded;
  p.x += body.vel.x * dt;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (bodyOverlap(body, b)) {
      if (body.vel.x > 0) p.x = b.x0 - body.r - 0.001;
      else if (body.vel.x < 0) p.x = b.x1 + body.r + 0.001;
      body.vel.x = 0; body.hitWall = true;
    }
  }
  p.z += body.vel.z * dt;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (bodyOverlap(body, b)) {
      if (body.vel.z > 0) p.z = b.z0 - body.r - 0.001;
      else if (body.vel.z < 0) p.z = b.z1 + body.r + 0.001;
      body.vel.z = 0; body.hitWall = true;
    }
  }
  body.grounded = false;
  if (body.hitWall && body.step > 0 && wasGrounded && body.vel.y <= 0.01) {
    const oy = p.y;
    let support = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (p.x + body.r + 0.08 > b.x0 && p.x - body.r - 0.08 < b.x1 && p.z + body.r + 0.08 > b.z0 && p.z - body.r - 0.08 < b.z1 &&
          b.y1 > oy + 0.04 && b.y1 <= oy + body.step + 0.02 && b.y1 > support) support = b.y1;
    }
    if (support > 0) {
      const oy2 = p.y;
      p.y = support + 0.001;
      if (anyOverlap(body, boxes)) p.y = oy2;
    }
  }
  p.y += body.vel.y * dt;
  if (p.y <= 0) { p.y = 0; if (body.vel.y < 0) body.vel.y = 0; body.grounded = true; }
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (bodyOverlap(body, b)) {
      if (body.vel.y <= 0 && p.y > b.y1 - 1.2) { p.y = b.y1 + 0.001; body.vel.y = 0; body.grounded = true; }
      else if (body.vel.y > 0) { p.y = b.y0 - body.h - 0.001; body.vel.y = 0; }
    }
  }
};
