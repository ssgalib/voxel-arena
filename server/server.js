#!/usr/bin/env node
'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT || '4200', 10);
const DB_DIR = process.env.VOXEL_DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'voxelarena.db');

const NAME_MIN = 3, NAME_MAX = 14, PASS_MIN = 6, PASS_MAX = 100;
const XP_PER_KILL = 10, XP_WIN = 50, XP_MATCH_CAP = 300;
const REPORT_COOLDOWN_MS = 20000;

function levelFromXp(xp) {
  let level = 1, rem = Math.max(0, xp | 0);
  while (rem >= 100 * level && level < 9999) { rem -= 100 * level; level++; }
  return { level, into: rem, need: 100 * level };
}

const fs = require('fs');
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );
`);

const stmts = {
  userByName: db.prepare('SELECT id, username, hash, salt, xp FROM users WHERE username = ?'),
  userById: db.prepare('SELECT id, username, xp FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (username, hash, salt, xp, created_at) VALUES (?, ?, ?, 0, ?)'),
  addXp: db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT user_id, created_at FROM sessions WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?')
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function profile(u) {
  const { level, into, need } = levelFromXp(u.xp);
  return { username: u.username, xp: u.xp, level, xpIntoLevel: into, xpForNextLevel: need };
}

const rateBuckets = new Map();
function rateLimit(ip, limit, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now - b.t0 > windowMs) { b = { t0: now, n: 0 }; rateBuckets.set(ip, b); }
  b.n++;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.t0 > windowMs) rateBuckets.delete(k);
  }
  return b.n <= limit;
}

const lastReport = new Map();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 10240) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function validName(name) {
  return typeof name === 'string' && name.length >= NAME_MIN && name.length <= NAME_MAX && /^[A-Za-z0-9_\-]+$/.test(name);
}
function validPass(pass) {
  return typeof pass === 'string' && pass.length >= PASS_MIN && pass.length <= PASS_MAX;
}

function authUser(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.{16,128})$/.exec(h);
  if (!m) return null;
  const row = stmts.session.get(m[1]);
  if (!row) return null;
  const u = stmts.userById.get(row.user_id);
  if (!u) return null;
  return { user: u, token: m[1] };
}

async function handle(req, res, pathname) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  if (!rateLimit(ip, 60, 60000)) return json(res, 429, { error: 'TOO MANY REQUESTS' });

  if (req.method === 'GET' && pathname === '/api/me') {
    const a = authUser(req);
    if (!a) return json(res, 401, { error: 'NOT LOGGED IN' });
    return json(res, 200, profile(a.user));
  }

  if (req.method === 'POST' && pathname === '/api/register') {
    if (!rateLimit(ip + ':reg', 10, 60000)) return json(res, 429, { error: 'TOO MANY ATTEMPTS' });
    const b = await readBody(req);
    if (!validName(b.username)) return json(res, 400, { error: 'NAME MUST BE 3-14 CHARS: A-Z 0-9 _ -' });
    if (!validPass(b.password)) return json(res, 400, { error: 'PASSWORD MUST BE 6-100 CHARS' });
    if (stmts.userByName.get(b.username)) return json(res, 409, { error: 'NAME ALREADY TAKEN' });
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(b.password, salt);
    const info = stmts.insertUser.run(b.username, hash, salt, Date.now());
    const token = crypto.randomBytes(32).toString('hex');
    stmts.insertSession.run(token, Number(info.lastInsertRowid), Date.now());
    return json(res, 200, { token, ...profile({ username: b.username, xp: 0 }) });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    if (!rateLimit(ip + ':login', 10, 60000)) return json(res, 429, { error: 'TOO MANY ATTEMPTS' });
    const b = await readBody(req);
    const u = stmts.userByName.get(String(b.username || ''));
    if (u) {
      const hash = hashPassword(String(b.password || ''), u.salt);
      const ok = hash.length === u.hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(u.hash));
      if (ok) {
        const token = crypto.randomBytes(32).toString('hex');
        stmts.insertSession.run(token, u.id, Date.now());
        return json(res, 200, { token, ...profile(u) });
      }
    }
    return json(res, 401, { error: 'WRONG NAME OR PASSWORD' });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const a = authUser(req);
    if (a) stmts.delSession.run(a.token);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/report') {
    const a = authUser(req);
    if (!a) return json(res, 401, { error: 'NOT LOGGED IN' });
    const b = await readBody(req);
    const kills = Math.max(0, Math.min(200, parseInt(b.kills, 10) || 0));
    const won = !!b.won;
    const last = lastReport.get(a.user.id) || 0;
    if (Date.now() - last < REPORT_COOLDOWN_MS) return json(res, 429, { error: 'REPORT TOO SOON' });
    lastReport.set(a.user.id, Date.now());
    const gain = Math.min(XP_MATCH_CAP, kills * XP_PER_KILL + (won ? XP_WIN : 0));
    if (gain > 0) stmts.addXp.run(gain, a.user.id);
    const u = stmts.userById.get(a.user.id);
    return json(res, 200, { gained: gain, ...profile(u) });
  }

  json(res, 404, { error: 'NOT FOUND' });
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { return json(res, 400, { error: 'BAD URL' }); }
  handle(req, res, pathname).catch(() => json(res, 400, { error: 'BAD REQUEST' }));
});

server.listen(PORT, '127.0.0.1', () => console.log(`voxel-arena API on 127.0.0.1:${PORT}`));

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
