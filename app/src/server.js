// Proceso de Bedrock Dedicated Server: arranque, parada, consola, jugadores y consumo.
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LINE_RE = /^\[(\d{4}-\d{2}-\d{2} [\d:]+) (\w+)\]\s?(.*)$/;
const JOIN_RE = /Player connected:\s*(.+?),\s*xuid:\s*(\d*)/i;
const LEAVE_RE = /Player disconnected:\s*(.+?),\s*xuid:\s*(\d*)/i;
const SPAWN_RE = /Player Spawned:\s*(.+?)\s+xuid:/i;
const MAX_LINES = 2500;

class Server extends EventEmitter {
  constructor(players, settings, P, props) {
    super();
    this.P = P;
    this.props = props;
    this.players = players;
    this.settings = settings;
    this.proc = null;
    this.state = 'apagado'; // apagado | arrancando | abierto | cerrando
    this.version = settings.get().versionServidor || null;
    this.level = null;
    this.startedAt = null;
    this.online = new Map();
    this.lines = [];
    this.seq = 0;
    this.partial = '';
    this.lastLevel = 'INFO';
    this.stopRequested = false;
    this.crashes = [];
    this.lastError = null;
    this.waiters = [];
    this.stats = null;
    this.statsProc = null;
  }

  installed() { return fs.existsSync(this.P.SERVER_EXE); }

  worldReady() {
    const lvl = this.props.get()['level-name'];
    return !!lvl && (fs.existsSync(path.join(this.P.WORLDS, lvl, 'level.dat')) || !!this.settings.get().mundoNuevo);
  }

  snapshot() {
    return {
      state: this.state,
      installed: this.installed(),
      worldReady: this.worldReady(),
      level: this.props.get()['level-name'] || null,
      version: this.version,
      startedAt: this.startedAt,
      online: [...this.online.values()],
      lastError: this.lastError,
      stats: this.stats,
    };
  }

  setState(s) {
    this.state = s;
    this.emit('state', this.snapshot());
  }

  push(text, level = 'INFO', kind = 'log') {
    const line = { id: ++this.seq, at: Date.now(), level, text, kind };
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.emit('line', line);
    // Copia en disco para poder revisar problemas después (datos/consola.log).
    try {
      const file = path.join(this.P.DATA, 'consola.log');
      try { if (fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.1'); } catch {}
      fs.appendFileSync(file, `${new Date(line.at).toISOString()} [${level}] ${text}\n`);
    } catch {}
    return line;
  }

  start() {
    if (this.proc) return;
    if (!this.installed()) throw new Error('Falta instalar el servidor');
    if (!this.worldReady()) throw new Error('Primero elige un mundo para el servidor');
    this.stopRequested = false;
    this.lastError = null;
    this.online.clear();
    this.partial = '';
    this.level = this.props.get()['level-name'];
    this.push(`Abriendo el servidor con el mundo «${this.level}»`, 'APP', 'app');
    const proc = spawn(this.P.SERVER_EXE, [], { cwd: this.P.SERVER, windowsHide: true });
    this.proc = proc;
    this.setState('arrancando');
    proc.stdout.on('data', (d) => this.onData(d));
    proc.stderr.on('data', (d) => this.onData(d));
    proc.on('error', (e) => {
      this.lastError = e.message;
      this.push(`No se pudo abrir el servidor: ${e.message}`, 'ERROR', 'app');
    });
    proc.on('exit', (code) => this.onExit(code));
    this.startStats(proc.pid);
  }

  onData(buf) {
    const text = this.partial + buf.toString('utf8');
    const parts = text.split(/\r?\n/);
    this.partial = parts.pop();
    for (const raw of parts) this.onLine(raw);
  }

  onLine(raw) {
    if (!raw.trim()) return;
    const m = raw.match(LINE_RE);
    let level = this.lastLevel;
    let msg = raw;
    if (m) { level = m[2].toUpperCase(); msg = m[3]; this.lastLevel = level; }
    this.push(msg, level);
    for (const w of [...this.waiters]) {
      if (w.test(msg)) { w.resolve(msg); this.waiters.splice(this.waiters.indexOf(w), 1); }
    }
    let r;
    if ((r = msg.match(/^Version:\s*([\d.]+)/))) {
      this.version = r[1];
      this.settings.set({ versionServidor: r[1] });
    } else if (/^Server started\./.test(msg)) {
      this.startedAt = Date.now();
      this.setState('abierto');
      this.emit('started');
    } else if ((r = msg.match(JOIN_RE))) {
      const name = r[1].trim();
      const xuid = r[2] || null;
      this.online.set(name.toLowerCase(), { name, xuid, since: Date.now() });
      this.players.onJoin(name, xuid);
      this.emit('players', { type: 'join', name });
      if (this.players.isBlocked(name, xuid)) {
        setTimeout(() => this.send(`kick "${name}" No tienes acceso a este servidor`, true), 1500);
      }
    } else if ((r = msg.match(LEAVE_RE))) {
      const name = r[1].trim();
      this.online.delete(name.toLowerCase());
      this.players.onLeave(name, r[2] || null);
      this.emit('players', { type: 'leave', name });
    } else if ((r = msg.match(SPAWN_RE))) {
      this.emit('players', { type: 'spawn', name: r[1].trim() });
    } else if (/^There are \d+\/\d+ players online/.test(msg)) {
      this.emit('list-header', msg);
    }
  }

  onExit(code) {
    const wasOpen = this.state === 'abierto';
    const requested = this.stopRequested;
    if (this.partial) { this.onLine(this.partial); this.partial = ''; }
    this.proc = null;
    this.stopStats();
    if (this.online.size) {
      this.players.closeAll();
      this.online.clear();
      this.emit('players', { type: 'reset' });
    }
    this.startedAt = null;
    for (const w of this.waiters) w.reject(new Error('El servidor se cerró'));
    this.waiters = [];
    if (requested) {
      this.push('El servidor se cerró y el mundo quedó guardado', 'APP', 'app');
    } else {
      this.lastError = `El servidor se cerró solo (código ${code})`;
      this.push(this.lastError, 'ERROR', 'app');
    }
    this.setState('apagado');
    this.emit('exit', { code, requested });
    if (!requested && wasOpen && this.settings.get().reiniciarSiCae) {
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < 10 * 60 * 1000);
      if (this.crashes.length < 3) {
        this.crashes.push(now);
        this.push('Volviendo a abrir el servidor en 5 segundos', 'APP', 'app');
        setTimeout(() => { try { this.start(); } catch (e) { this.push(e.message, 'ERROR', 'app'); } }, 5000);
      } else {
        this.push('Se cayó 3 veces en 10 minutos; no lo vuelvo a abrir solo', 'ERROR', 'app');
      }
    }
  }

  stop() {
    if (!this.proc) return Promise.resolve();
    return new Promise((resolve) => {
      const proc = this.proc;
      this.stopRequested = true;
      this.setState('cerrando');
      const done = () => { clearTimeout(t); resolve(); };
      proc.once('exit', done);
      this.send('stop', true);
      const t = setTimeout(() => {
        if (this.proc === proc) {
          this.push('El servidor no respondió; se forzó el cierre', 'WARN', 'app');
          try { proc.kill(); } catch {}
        }
      }, 45000);
    });
  }

  async restart() {
    await this.stop();
    this.start();
  }

  send(cmd, silent = false) {
    if (!this.proc) throw new Error('El servidor está apagado');
    cmd = String(cmd || '').replace(/^\//, '').trim();
    if (!cmd) return;
    if (!silent) this.push(cmd, 'CMD', 'cmd');
    this.proc.stdin.write(cmd + '\r\n');
  }

  // Envía un comando y espera la primera línea que cumpla la condición.
  query(cmd, test, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const w = { test: (m) => test.test ? test.test(m) : test(m), resolve, reject };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) { this.waiters.splice(i, 1); reject(new Error('El servidor no respondió a tiempo')); }
      }, timeout);
      try { this.send(cmd, true); } catch (e) { this.waiters.splice(this.waiters.indexOf(w), 1); reject(e); }
    });
  }

  // Consumo del proceso con un solo PowerShell que reporta cada 2 s.
  startStats(pid) {
    this.stopStats();
    const script = `$ErrorActionPreference='Stop'; while($true){ try { $p=Get-Process -Id ${pid}; [Console]::Out.WriteLine(('{0} {1}' -f [int64]$p.TotalProcessorTime.TotalMilliseconds, $p.WorkingSet64)); [Console]::Out.Flush() } catch { exit }; Start-Sleep -Milliseconds 2000 }`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    this.statsProc = ps;
    const cores = os.cpus().length || 1;
    let prev = null;
    let buf = '';
    ps.stdout.on('data', (d) => {
      buf += d.toString();
      const rows = buf.split(/\r?\n/);
      buf = rows.pop();
      for (const row of rows) {
        const [cpuMs, mem] = row.trim().split(' ').map(Number);
        if (!Number.isFinite(cpuMs)) continue;
        const now = Date.now();
        let cpu = null;
        if (prev) cpu = Math.max(0, Math.min(100, ((cpuMs - prev.cpuMs) / ((now - prev.at) * cores)) * 100));
        prev = { cpuMs, at: now };
        this.stats = { cpu, mem, at: now };
        this.emit('stats', this.stats);
      }
    });
    ps.on('error', () => {});
  }

  stopStats() {
    if (this.statsProc) { try { this.statsProc.kill(); } catch {} this.statsProc = null; }
    this.stats = null;
  }
}

module.exports = { Server };
