function Voice(game) {
  this.game = game;
  this.stream = null;
  this.track = null;
  this.analyser = null;
  this.buf = null;
  this.peers = new Map();
  this.ptt = false;
  this.active = false;
  this.starting = false;
  this.failed = '';
  this.talkers = new Set();
  this._rmsT = 0;
}

Voice.prototype.start = async function () {
  if (this.active || this.starting) return;
  if (!this.game.settings.voice) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.failed = 'VOICE NOT SUPPORTED'; return; }
  this.starting = true;
  this.failed = '';
  try {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (e) {
    this.starting = false;
    this.failed = 'MIC BLOCKED \u2014 CHECK PERMISSIONS';
    return;
  }
  this.starting = false;
  if (!this.game.net) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; return; }
  this.track = this.stream.getAudioTracks()[0];
  const ctx = this.game.sfx.ensure() ? this.game.sfx.ctx : null;
  if (!ctx) { this.failed = 'AUDIO UNAVAILABLE'; return; }
  this.analyser = ctx.createAnalyser();
  this.analyser.fftSize = 256;
  this.buf = new Uint8Array(this.analyser.fftSize);
  ctx.createMediaStreamSource(this.stream).connect(this.analyser);
  this.active = true;
  this.game.net.addStream(this.stream);
  const existing = this.game.net.getStreams();
  for (const pid in existing) this.onRemoteStream(pid, existing[pid]);
  this.game.hud.subAnnounce('VOICE ON \u2014 HOLD V TO TALK');
};

Voice.prototype.stop = function () {
  for (const pid of this.peers.keys()) {
    const e = this._entityFor(pid);
    if (e && e.tag && e.tag.setTalking) e.tag.setTalking(false);
  }
  if (this.stream) this.stream.getTracks().forEach(t => t.stop());
  for (const p of this.peers.values()) this._dropGraph(p);
  this.peers.clear();
  this.talkers.clear();
  this.stream = null;
  this.track = null;
  this.analyser = null;
  this.active = false;
  this.ptt = false;
  this.failed = '';
};

Voice.prototype._dropGraph = function (p) {
  try { p.src.disconnect(); } catch (e) {}
  try { p.gain.disconnect(); } catch (e) {}
  try { p.pan.disconnect(); } catch (e) {}
  try { p.an.disconnect(); } catch (e) {}
  if (p.el) { p.el.srcObject = null; p.el.remove(); }
};

Voice.prototype.onRemoteStream = function (pid, stream) {
  if (!this.active) return;
  const ctx = this.game.sfx.ctx;
  this._dropPeer(pid);
  const el = document.createElement('audio');
  el.autoplay = true;
  el.volume = 0;
  el.srcObject = stream;
  el.play().catch(() => {});
  document.body.appendChild(el);
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const an = ctx.createAnalyser();
  an.fftSize = 256;
  const p = { src: src, gain: gain, pan: pan, an: an, buf: new Uint8Array(an.fftSize), el: el, lvl: 0, inLobby: true };
  src.connect(an);
  if (pan) { src.connect(gain); gain.connect(pan); pan.connect(ctx.destination); }
  else { src.connect(gain); gain.connect(ctx.destination); }
  gain.gain.value = 1;
  this.peers.set(pid, p);
};

Voice.prototype._dropPeer = function (pid) {
  const p = this.peers.get(pid);
  if (!p) return;
  const e = this._entityFor(pid);
  if (e && e.tag && e.tag.setTalking) e.tag.setTalking(false);
  this._dropGraph(p);
  this.peers.delete(pid);
  this.talkers.delete(pid);
};

Voice.prototype.dropPeer = function (pid) { this._dropPeer(pid); };

Voice.prototype._entityFor = function (pid) {
  const g = this.game;
  if (g.netRole === 'host') {
    for (const r of g.remote) if (r.peerId === pid) return r;
    return null;
  }
  const row = g.roster.find(r => r.pid === pid);
  if (!row) return null;
  for (const r of g.remote) if (r.id === row.id) return r;
  return null;
};

Voice.prototype._nameFor = function (pid) {
  const row = this.game.roster.find(r => r.pid === pid);
  return row ? row.name : '???';
};

Voice.prototype.update = function (dt) {
  if (!this.active) return;
  const g = this.game;
  const openMic = !!g.settings.openMic;
  if (this.track) this.track.enabled = openMic || this.ptt;
  if (!g.net) return;

  const inMatch = g.state === 'playing' || g.state === 'paused';
  const L = g.sfx.getListener ? g.sfx.getListener() : null;
  const cp = g.camera.position;

  for (const [pid, p] of this.peers) {
    const e = inMatch ? this._entityFor(pid) : null;
    let gain = 1, panV = 0;
    if (e && e.alive && L) {
      const ep = e.body.pos;
      const rx = ep.x - cp.x, ry = (ep.y + 1.3) - cp.y, rz = ep.z - cp.z;
      const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
      gain = U.clamp(1.5 / (1 + d * 0.13), 0.04, 1);
      if (d > 0.01 && p.pan) panV = U.clamp((rx * L.right.x + rz * L.right.z) / d, -1, 1) * 0.75;
    }
    const t = this.game.sfx.ctx ? this.game.sfx.ctx.currentTime : 0;
    p.gain.gain.setTargetAtTime(gain, t, 0.1);
    if (p.pan) p.pan.pan.setTargetAtTime(panV, t, 0.1);
    p.inLobby = !e;
  }

  this._rmsT -= dt;
  if (this._rmsT <= 0) {
    this._rmsT = 0.12;
    const meTalking = this.track && this.track.enabled && this._rms(this.analyser, this.buf) > 0.06;
    if (meTalking) this.talkers.add('me');
    else this.talkers.delete('me');
    for (const [pid, p] of this.peers) {
      const talking = this._rms(p.an, p.buf) > 0.055;
      if (talking) this.talkers.add(pid);
      else this.talkers.delete(pid);
      const e = this._entityFor(pid);
      if (e && e.tag && e.tag.setTalking) e.tag.setTalking(talking);
    }
  }
};

Voice.prototype._rms = function (an, buf) {
  if (!an) return 0;
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / buf.length);
};

Voice.prototype.isTalking = function (pid) { return this.talkers.has(pid); };
