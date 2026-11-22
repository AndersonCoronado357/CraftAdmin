// Jugadores: lista de acceso (allowlist), permisos, bloqueados e historial de visitas.
const path = require('path');
const P = require('./paths');
const { readJSON, writeJSON } = require('./util');

const MAX_SESSIONS = 3000;
const ROLES = ['visitor', 'member', 'operator'];

const key = (name) => String(name || '').trim().toLowerCase();

class Players {
  constructor(R = P) {
    this.R = R;
    this.FILE = path.join(R.DATA, 'jugadores.json');
    this.db = readJSON(this.FILE, null) || { known: {}, sessions: [], blocked: {} };
    this.db.known ||= {};
    this.db.sessions ||= [];
    this.db.blocked ||= {};
    this.db.roles ||= {}; // rol de cada jugador por nombre
    this.open = new Map(); // key -> índice de sesión abierta
  }

  save() { writeJSON(this.FILE, this.db); }

  allowlist() { return readJSON(this.R.ALLOWLIST, []) || []; }
  writeAllowlist(list) { writeJSON(this.R.ALLOWLIST, list); }
  permissions() { return readJSON(this.R.PERMISSIONS, []) || []; }
  writePermissions(list) { writeJSON(this.R.PERMISSIONS, list); }

  xuidOf(name) {
    const k = key(name);
    if (this.db.known[k]?.xuid) return this.db.known[k].xuid;
    const a = this.allowlist().find((e) => key(e.name) === k);
    return a?.xuid || this.db.blocked[k]?.xuid || null;
  }

  // Lista unificada para la interfaz.
  list(online, defaultRole = 'member') {
    const map = new Map();
    const ensure = (name) => {
      const k = key(name);
      if (!map.has(k)) map.set(k, { key: k, name, xuid: null, access: false, blocked: false, online: false, since: null, firstSeen: null, lastSeen: null, totalMs: 0, visits: 0, role: defaultRole, roleSet: false });
      return map.get(k);
    };
    for (const e of this.allowlist()) {
      const p = ensure(e.name);
      p.access = true;
      p.xuid = e.xuid || p.xuid;
    }
    for (const [k, b] of Object.entries(this.db.blocked)) {
      const p = ensure(b.name || k);
      p.blocked = true;
      p.blockedAt = b.at;
      p.xuid = p.xuid || b.xuid || null;
    }
    for (const k of Object.keys(this.db.known)) {
      const kn = this.db.known[k];
      const p = ensure(kn.name);
      p.name = kn.name;
      p.xuid = p.xuid || kn.xuid || null;
      p.firstSeen = kn.firstSeen;
      p.lastSeen = kn.lastSeen;
      p.totalMs = kn.totalMs || 0;
      p.visits = kn.visits || 0;
    }
    for (const o of online.values()) {
      const p = ensure(o.name);
      p.online = true;
      p.since = o.since;
      p.xuid = p.xuid || o.xuid;
    }
    const perms = this.permissions();
    for (const p of map.values()) {
      const perm = p.xuid && perms.find((x) => x.xuid === p.xuid);
      if (perm) { p.role = perm.permission; p.roleSet = true; }
      if (this.db.roles[p.key]) { p.role = this.db.roles[p.key]; p.roleSet = true; }
      if (p.online && p.since) p.totalMs += Date.now() - p.since;
    }
    return [...map.values()].sort((a, b) =>
      (b.online - a.online) || (b.access - a.access) || ((b.lastSeen || 0) - (a.lastSeen || 0)) || a.name.localeCompare(b.name));
  }

  addAccess(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('Escribe el gamertag');
    if (name.length > 32) throw new Error('Ese gamertag es demasiado largo');
    const list = this.allowlist();
    if (list.some((e) => key(e.name) === key(name))) return false;
    const entry = { ignoresPlayerLimit: false, name };
    const xuid = this.xuidOf(name);
    if (xuid) entry.xuid = xuid;
    list.push(entry);
    this.writeAllowlist(list);
    if (this.db.blocked[key(name)]) { delete this.db.blocked[key(name)]; this.save(); }
    return true;
  }

  removeAccess(name) {
    const list = this.allowlist();
    const next = list.filter((e) => key(e.name) !== key(name));
    this.writeAllowlist(next);
    return next.length !== list.length;
  }

  // El rol se guarda por nombre y la app se lo pone al jugador cada vez que entra.
  // Si además se conoce su xuid, también queda en permissions.json.
  setRole(name, role) {
    if (!ROLES.includes(role)) throw new Error('Rol no válido');
    this.db.roles[key(name)] = role;
    this.save();
    const xuid = this.xuidOf(name);
    if (xuid) {
      const perms = this.permissions().filter((x) => x.xuid !== xuid);
      perms.push({ permission: role, xuid });
      this.writePermissions(perms);
    }
    return role;
  }

  roleOf(name) { return this.db.roles[key(name)] || null; }

  block(name) {
    const k = key(name);
    this.db.blocked[k] = { name: this.db.known[k]?.name || name, xuid: this.xuidOf(name), at: Date.now() };
    this.save();
    this.removeAccess(name);
  }

  unblock(name) {
    delete this.db.blocked[key(name)];
    this.save();
  }

  isBlocked(name, xuid) {
    if (this.db.blocked[key(name)]) return true;
    return !!(xuid && Object.values(this.db.blocked).some((b) => b.xuid === xuid));
  }

  onJoin(name, xuid, at = Date.now()) {
    const k = key(name);
    const kn = (this.db.known[k] ||= { name, xuid, firstSeen: at, lastSeen: at, totalMs: 0, visits: 0 });
    kn.name = name;
    if (xuid) kn.xuid = xuid;
    kn.lastSeen = at;
    kn.visits = (kn.visits || 0) + 1;
    this.db.sessions.push({ name, xuid, start: at, end: null });
    if (this.db.sessions.length > MAX_SESSIONS) this.db.sessions.splice(0, this.db.sessions.length - MAX_SESSIONS);
    this.open.set(k, this.db.sessions.length - 1);
    // Si está en la lista sin xuid, se completa para que los roles funcionen.
    if (xuid) {
      const list = this.allowlist();
      const e = list.find((x) => key(x.name) === k);
      if (e && !e.xuid) { e.xuid = xuid; this.writeAllowlist(list); }
    }
    this.save();
  }

  onLeave(name, xuid, at = Date.now()) {
    const k = key(name);
    let idx = this.open.get(k);
    if (idx == null || !this.db.sessions[idx] || this.db.sessions[idx].end) {
      idx = this.db.sessions.map((s, i) => [s, i]).reverse().find(([s]) => key(s.name) === k && !s.end)?.[1];
    }
    const s = idx != null ? this.db.sessions[idx] : null;
    if (s) {
      s.end = at;
      const kn = this.db.known[k];
      if (kn) { kn.totalMs = (kn.totalMs || 0) + (s.end - s.start); kn.lastSeen = at; }
    }
    this.open.delete(k);
    this.save();
  }

  closeAll(at = Date.now()) {
    for (const s of this.db.sessions) {
      if (!s.end) {
        s.end = at;
        const kn = this.db.known[key(s.name)];
        if (kn) { kn.totalMs = (kn.totalMs || 0) + (s.end - s.start); kn.lastSeen = at; }
      }
    }
    this.open.clear();
    this.save();
  }

  sessions(limit = 400) {
    return this.db.sessions.slice(-limit).reverse();
  }

  // Minutos jugados por día (todas las personas sumadas), últimos n días.
  daily(days = 14) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d0 = new Date(today); d0.setDate(today.getDate() - i);
      const d1 = new Date(d0); d1.setDate(d0.getDate() + 1);
      let ms = 0; const people = new Set();
      for (const s of this.db.sessions) {
        const a = Math.max(s.start, d0.getTime());
        const b = Math.min(s.end || Date.now(), d1.getTime());
        if (b > a) { ms += b - a; people.add(key(s.name)); }
      }
      out.push({ day: d0.getTime(), ms, people: people.size });
    }
    return out;
  }
}

module.exports = { Players, key, ROLES };
