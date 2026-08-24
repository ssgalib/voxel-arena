class Sfx {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; this.volume = 0.7; this.muted = false; this.getListener = null; }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; return this.muted; }

  _out(pos) {
    let node = this.master, g = 1;
    if (pos && this.getListener) {
      const L = this.getListener();
      if (L) {
        const rx = pos.x - L.pos.x, ry = pos.y - L.pos.y, rz = pos.z - L.pos.z;
        const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
        g = U.clamp(1.5 / (1 + d * 0.13), 0.04, 1);
        let pan = 0;
        if (d > 0.01) pan = U.clamp((rx * L.right.x + rz * L.right.z) / d, -1, 1) * 0.75;
        const gain = this.ctx.createGain(); gain.gain.value = g;
        if (this.ctx.createStereoPanner) {
          const panner = this.ctx.createStereoPanner(); panner.pan.value = pan;
          gain.connect(panner); panner.connect(this.master); node = gain;
        } else { gain.connect(this.master); node = gain; }
      }
    }
    return node;
  }

  noise(out, o) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = U.rand(0.9, 1.1);
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), t + o.dur);
    f.Q.value = o.q || 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  tone(out, o) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), t + o.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  play(name, pos, vol) {
    if (!this.ensure()) return;
    vol = vol === undefined ? 1 : vol;
    const out = this._out(pos);
    switch (name) {
      case 'rifle':
        this.noise(out, { dur: 0.09, gain: 0.5 * vol, type: 'bandpass', f0: 900, q: 0.7 });
        this.tone(out, { dur: 0.06, gain: 0.3 * vol, type: 'square', f0: 160, f1: 80 });
        break;
      case 'shotgun':
        this.noise(out, { dur: 0.2, gain: 0.75 * vol, type: 'lowpass', f0: 1600, f1: 300 });
        this.tone(out, { dur: 0.11, gain: 0.4 * vol, type: 'square', f0: 110, f1: 55 });
        break;
      case 'sniper':
        this.noise(out, { dur: 0.32, gain: 0.8 * vol, type: 'lowpass', f0: 2600, f1: 220 });
        this.tone(out, { dur: 0.18, gain: 0.35 * vol, type: 'triangle', f0: 700, f1: 110 });
        break;
      case 'pistol':
        this.noise(out, { dur: 0.07, gain: 0.42 * vol, type: 'bandpass', f0: 1300, q: 1 });
        this.tone(out, { dur: 0.05, gain: 0.25 * vol, type: 'square', f0: 210, f1: 100 });
        break;
      case 'rpg':
        this.noise(out, { dur: 0.55, gain: 0.5 * vol, type: 'lowpass', f0: 400, f1: 2000 });
        break;
      case 'explosion':
        this.noise(out, { dur: 0.9, gain: 1.0 * vol, type: 'lowpass', f0: 900, f1: 60 });
        this.tone(out, { dur: 0.7, gain: 0.7 * vol, type: 'sine', f0: 72, f1: 28 });
        break;
      case 'hit': this.tone(out, { dur: 0.045, gain: 0.22 * vol, type: 'square', f0: 1150 }); break;
      case 'crit': this.tone(out, { dur: 0.05, gain: 0.24 * vol, type: 'square', f0: 1500 }); this.tone(out, { dur: 0.07, gain: 0.18 * vol, type: 'square', f0: 2050 }); break;
      case 'kill': this.tone(out, { dur: 0.07, gain: 0.26 * vol, type: 'triangle', f0: 880 }); this.tone(out, { dur: 0.1, gain: 0.24 * vol, type: 'triangle', f0: 1318 }); break;
      case 'hurt':
        this.tone(out, { dur: 0.13, gain: 0.4 * vol, type: 'sawtooth', f0: 230, f1: 90 });
        this.noise(out, { dur: 0.09, gain: 0.2 * vol, type: 'lowpass', f0: 700 });
        break;
      case 'dry': this.tone(out, { dur: 0.03, gain: 0.16 * vol, type: 'square', f0: 260 }); break;
      case 'reload':
        this.noise(out, { dur: 0.04, gain: 0.22 * vol, type: 'highpass', f0: 1800 });
        setTimeout(() => { if (this.ctx) this.noise(this._out(null), { dur: 0.05, gain: 0.25 * vol, type: 'highpass', f0: 1400 }); }, 260);
        break;
      case 'dash': this.noise(out, { dur: 0.14, gain: 0.3 * vol, type: 'highpass', f0: 500 }); break;
      case 'jump': this.tone(out, { dur: 0.06, gain: 0.12 * vol, type: 'sine', f0: 300, f1: 430 }); break;
      case 'land': this.noise(out, { dur: 0.08, gain: 0.25 * vol, type: 'lowpass', f0: 500 }); break;
      case 'throw': this.noise(out, { dur: 0.1, gain: 0.2 * vol, type: 'bandpass', f0: 600 }); break;
      case 'ui': this.tone(out, { dur: 0.04, gain: 0.15 * vol, type: 'square', f0: 720 }); break;
      case 'spawn': this.tone(out, { dur: 0.09, gain: 0.2 * vol, type: 'triangle', f0: 520, f1: 1040 }); break;
    }
  }
}
