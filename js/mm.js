const MM_APP_ID = 'poxel-mm-v1';
const MM_ROOM_ID = 'poxel-public-lobby';
const MM_PASSWORD = 'public-room';
const MM_ANNOUNCE_MS = 2000;
const MM_COLLECT_MS = 2000;

const Matchmaker = {
  room: null,
  actions: null,
  infos: {},
  _announcer: null,

  async _open() {
    if (this.actions) return this.actions;
    const mod = await window.loadTrystero();
    const room = mod.joinRoom({ appId: MM_APP_ID, password: MM_PASSWORD }, MM_ROOM_ID);
    this.room = room;
    const actions = {};
    for (const name of ['mm_join', 'mm_info']) {
      const a = room.makeAction(name);
      actions[name] = a;
      a.onMessage = (data, meta) => {
        if (!meta || !meta.peerId) return;
        if (name === 'mm_info' && data && data.code) { this.infos[meta.peerId] = data; ; }
        if (name === 'mm_join' && this._isHost) {
          ;
          const g = window.GAME;
          if (g && g.state === 'playing' && this.roomCode) {
            this.actions.mm_info.send({
              code: this.roomCode,
              t: Math.min(TIME_LIMIT, Math.round(g.matchT)),
              n: g.roster.length
            }, { target: meta.peerId });
          }
        }
      };
    }
    this.actions = actions;
    return actions;
  },

  async deploy(game, sel) {
    try {
      const actions = await this._open();
      this.infos = {};
      actions.mm_join.send({ n: sel.name, c: sel.clsKey, l: Account.loggedIn ? Account.level : 0 });
      const deadline = Date.now() + 10000;
      let last = 0, noPeerSince = 0;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 300));
        const keys = Object.keys(this.infos);
        if (!keys.length) {
          let peers = 0;
          try {
            const p = this.room.getPeers ? this.room.getPeers() : null;
            if (p) peers = p.size !== undefined ? p.size : Object.keys(p).length;
          } catch (e) {}
          if (!peers) { if (!noPeerSince) noPeerSince = Date.now(); if (Date.now() - noPeerSince > 2500) { break; } }
          continue;
        }
        const list = keys
          .map(pid => ({ code: this.infos[pid].code, t: this.infos[pid].t | 0, n: this.infos[pid].n | 0 }))
          .filter(d => d.code && d.t < TIME_LIMIT && d.n < 8)
          .sort((a, b) => a.t - b.t);
        if (list.length) return { action: 'join', code: list[0].code };
        if (!last) last = Date.now();
        else if (Date.now() - last > 600) break;
      }
      return { action: 'host' };
    } catch (e) {
      return { action: 'offline' };
    }
  },
announceStart(code) {
    this.stopAnnounce();
    this.roomCode = code;
    this._isHost = true;
    const send = () => {
      const g = window.GAME;
      if (!g || !this.actions || g.netRole !== 'host') return;
      if (g.state !== 'playing' && g.state !== 'paused') return;
      this.actions.mm_info.send({ code: code, t: Math.min(TIME_LIMIT, Math.round(g.matchT)), n: g.roster.length });
    };
    send();
    this._announcer = setInterval(send, MM_ANNOUNCE_MS);
  },

  stopAnnounce() {
    this._isHost = false;
    this.roomCode = null;
    if (this._announcer) { clearInterval(this._announcer); this._announcer = null; }
  },

  close() {
    this.stopAnnounce();
    if (this.room) { try { this.room.leave(); } catch (e) {} }
    this.room = null;
    this.actions = null;
    this.infos = {};
  }
};
