const Account = {
  token: null,
  username: null,
  xp: 0,
  level: 1,
  into: 0,
  need: 100,
  pendingAnnounce: null,

  get loggedIn() { return !!this.token; },

  init() {
    try { this.token = localStorage.getItem('voxelarena_token'); } catch (e) {}
    this._bind();
    if (this.token) this._me();
    else this.refreshUI();
  },

  _bind() {
    const self = this;
    U.el('loginBtn').onclick = () => self._auth('/api/login', 'LOGGED IN');
    U.el('regBtn').onclick = () => self._auth('/api/register', 'ACCOUNT CREATED');
    U.el('logoutBtn').onclick = () => self.logout();
    for (const id of ['acctUser', 'acctPass']) {
      U.el(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.stopPropagation(); self._auth('/api/login', 'LOGGED IN'); }
      });
    }
  },

  async _api(path, opts) {
    try {
      const r = await fetch(path, opts);
      return await r.json().catch(() => ({}));
    } catch (e) {
      return { error: 'API UNREACHABLE' };
    }
  },

  async _auth(path, okMsg) {
    if (this._busy) return;
    const name = U.el('acctUser').value.trim();
    const pass = U.el('acctPass').value;
    this._msg(name && pass ? '...' : 'ENTER NAME + PASSWORD');
    if (!name || !pass) return;
    this._busy = true;
    const res = await this._api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: pass })
    });
    this._busy = false;
    if (res.error) { this._msg(res.error); return; }
    this.token = res.token;
    this.username = res.username;
    this.xp = res.xp;
    this.level = res.level;
    this.into = res.xpIntoLevel;
    this.need = res.xpForNextLevel;
    try { localStorage.setItem('voxelarena_token', this.token); } catch (e) {}
    U.el('acctPass').value = '';
    this._msg(okMsg);
    this.refreshUI();
  },

  async _me() {
    const res = await this._api('/api/me', { headers: { 'Authorization': 'Bearer ' + this.token } });
    if (res.error) { this._clearToken(); this.refreshUI(); return; }
    this.username = res.username;
    this.xp = res.xp;
    this.level = res.level;
    this.into = res.xpIntoLevel;
    this.need = res.xpForNextLevel;
    this.refreshUI();
  },

  async logout() {
    await this._api('/api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + this.token } });
    this._clearToken();
    this._msg('');
    this.refreshUI();
  },

  _clearToken() {
    this.token = null;
    this.username = null;
    this.xp = 0;
    this.level = 1;
    this.into = 0;
    this.need = 100;
    try { localStorage.removeItem('voxelarena_token'); } catch (e) {}
  },

  async reportMatch(kills, won) {
    if (!this.loggedIn) return null;
    const before = this.level;
    const res = await this._api('/api/report', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kills: kills | 0, won: !!won })
    });
    if (res.error || res.gained === undefined) return null;
    this.xp = res.xp;
    this.level = res.level;
    this.into = res.xpIntoLevel;
    this.need = res.xpForNextLevel;
    if (res.level > before) this.pendingAnnounce = 'LEVEL UP \u2014 NOW LEVEL ' + res.level + (tierForLevel(res.level) > tierForLevel(before) ? ' \u2014 FLAMES GROW STRONGER' : '');
    this.refreshUI();
    return { gained: res.gained, level: res.level };
  },

  refreshUI() {
    const out = U.el('acctOut'), inn = U.el('acctIn');
    out.classList.toggle('hidden', this.loggedIn);
    inn.classList.toggle('hidden', !this.loggedIn);
    const nameInput = U.el('nameInput');
    if (this.loggedIn) {
      const t = tierForLevel(this.level);
      U.el('acctWho').innerHTML = '<b class="t' + t + '">' + escHtml(this.username) + '</b><i>LEVEL ' + this.level + '</i>';
      U.el('acctFill').style.width = Math.round(this.into / this.need * 100) + '%';
      U.el('acctXp').textContent = this.into + ' / ' + this.need + ' XP TO LEVEL ' + (this.level + 1);
      nameInput.value = this.username;
      nameInput.disabled = true;
    } else {
      nameInput.disabled = false;
    }
  },

  _msg(t) { U.el('acctMsg').textContent = t || ''; }
};

window.Account = Account;
