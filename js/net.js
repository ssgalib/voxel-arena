const NET_APP_ID = 'poxel-clone-mp-v1';
const NET_ACTIONS = [
  'hello', 'roster', 'start', 'deny',
  'input', 'snap', 'shot', 'bshot', 'proj', 'boom',
  'feed', 'died', 'kb', 'pick', 'end'
];
const NET_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function makeRoomCode(len) {
  let s = '';
  for (let i = 0; i < (len || 5); i++) s += NET_CODE_CHARS[Math.floor(Math.random() * NET_CODE_CHARS.length)];
  return s;
}

function cleanRoomCode(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

class Net {
  constructor() {
    this.room = null;
    this.selfId = null;
    this.role = null;
    this.peers = new Set();
    this.handlers = {};
    this.closed = false;
    this._actions = {};
  }

  async connect(role, code) {
    if (!window.loadTrystero) throw new Error('Networking library failed to load');
    const mod = await window.loadTrystero();
    if (this.closed) return;
    this.selfId = mod.selfId;
    this.role = role;
    const room = mod.joinRoom({ appId: NET_APP_ID, password: code }, 'poxel-' + code);
    this.room = room;
    room.onPeerJoin = pid => { this.peers.add(pid); this._emit('_join', pid); };
    room.onPeerLeave = pid => { this.peers.delete(pid); this._emit('_leave', pid); };
    for (const name of NET_ACTIONS) {
      const action = room.makeAction(name);
      this._actions[name] = action;
      action.onMessage = (data, meta) => this._emit(name, data, meta && meta.peerId);
    }
  }

  on(name, fn) { this.handlers[name] = fn; }

  addStream(stream, toPid) {
    if (!this.room) return;
    try { this.room.addStream(stream, toPid !== undefined ? { target: toPid } : {}); } catch (e) {}
  }

  onPeerStream(fn) {
    if (!this.room) return;
    this.room.onPeerStream = (stream, pid, meta) => fn(stream, pid, meta);
  }

  _emit(name, data, pid) {
    const h = this.handlers[name];
    if (h) h(data, pid);
  }

  send(name, data, toPid) {
    const a = this._actions[name];
    if (!a) return;
    try {
      if (toPid !== undefined) a.send(data, { target: toPid });
      else a.send(data);
    } catch (e) {}
  }

  leave() {
    this.closed = true;
    this.peers.clear();
    if (this.room) { try { this.room.leave(); } catch (e) {} }
    this.room = null;
  }
}
