// Agente de playit.gg en modo portátil: lo abre, lee su salida y detecta enlace, estado y dirección.
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const CLAIM_RE = /https:\/\/playit\.gg\/claim\/[\w-]+/i;
const ADDR_RE = /\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:ply\.gg|joinmc\.link|playit\.gg|playit\.plus|at\.ply\.gg))(?::(\d{2,5}))?\b/i;
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

class Playit extends EventEmitter {
  // direccion(): dirección del servidor que se está mirando; guardar(v): la anota si ese servidor no tiene.
  constructor({ direccion, guardar }) {
    super();
    this.direccion = direccion;
    this.guardar = guardar;
    this.proc = null;
    this.state = 'apagado';
    this.claimUrl = null;
    this.lastError = null;
    this.lines = [];
    this.partial = '';
    this.openOnClaim = false;
    this.connectTimer = null;
    // Si el agente deja crear túneles (true/false; null si no se sabe) y el enlace de una vinculación en curso.
    this.automatico = null;
    this.vinculo = null;
  }

  installed() { return fs.existsSync(P.PLAYIT_EXE); }
  linked() { return fs.existsSync(P.PLAYIT_SECRET); }

  snapshot() {
    let state = this.state;
    if (!this.installed()) state = 'sin-programa';
    else if (this.vinculo) state = 'esperando';
    else if (!this.proc && !this.linked()) state = 'sin-vincular';
    return {
      state,
      running: !!this.proc,
      linked: this.linked(),
      automatico: this.automatico,
      claimUrl: this.vinculo || this.claimUrl,
      address: this.direccion() || '',
      lastError: this.lastError,
      lines: this.lines.slice(-80),
    };
  }

  setState(s) {
    this.state = s;
    this.emit('change', this.snapshot());
  }

  start({ openClaim = false } = {}) {
    if (!this.installed()) throw new Error('Falta el programa de playit');
    this.openOnClaim = openClaim;
    if (this.proc) {
      if (openClaim && this.claimUrl) this.emit('claim', this.claimUrl);
      return;
    }
    this.lastError = null;
    this.claimUrl = null;
    this.partial = '';
    const proc = spawn(P.PLAYIT_EXE, ['--stdout'], { cwd: P.PLAYIT_DIR, windowsHide: true });
    this.proc = proc;
    this.setState('conectando');
    proc.stdout.on('data', (d) => this.onData(d));
    proc.stderr.on('data', (d) => this.onData(d));
    proc.on('error', (e) => { this.lastError = e.message; this.setState('error'); });
    proc.on('exit', () => {
      this.proc = null;
      clearTimeout(this.connectTimer);
      this.claimUrl = null;
      if (this.state !== 'error') this.state = 'apagado';
      this.emit('change', this.snapshot());
    });
    // Si ya está vinculado y no hubo errores en unos segundos, se da por conectado.
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (this.proc && this.linked() && this.state === 'conectando') this.setState('conectado');
    }, 6000);
  }

  onData(buf) {
    const text = this.partial + buf.toString('utf8').replace(ANSI, '');
    const parts = text.split(/\r?\n/);
    this.partial = parts.pop();
    for (const line of parts) this.onLine(line.trim());
  }

  onLine(line) {
    if (!line) return;
    // No se guarda nada que parezca la clave secreta.
    const clean = line.replace(/(secret[_ ]?key\s*[=:]\s*)\S+/gi, '$1***');
    const claim = clean.match(CLAIM_RE);
    if (claim) {
      const isNew = this.claimUrl !== claim[0];
      this.claimUrl = claim[0];
      if (this.state !== 'esperando') this.setState('esperando');
      if (isNew && this.openOnClaim) this.emit('claim', this.claimUrl);
      if (!isNew && /Approve this program/i.test(clean)) return;
    }
    if (this.lines.length && this.lines[this.lines.length - 1].text === clean) return;
    this.lines.push({ at: Date.now(), text: clean });
    this.toFile(clean);
    if (this.lines.length > 300) this.lines.splice(0, this.lines.length - 300);
    const addr = clean.match(ADDR_RE);
    if (addr && !/claim|login|account|api\./i.test(addr[0])) {
      const value = addr[2] ? `${addr[1]}:${addr[2]}` : addr[1];
      if (!this.direccion()) this.guardar(value);
    }
    if (/\bERROR\b/.test(clean)) {
      this.lastError = clean.replace(/^\S+\s+ERROR\s+/, '');
      this.watchNetwork(clean);
    }
    if (/playit connected; tunnels loaded/.test(clean)) { this.netErrors = []; this.lastError = null; }
    if (this.state === 'esperando' && this.linked() && !claim) {
      this.claimUrl = null;
      this.setState('conectando');
    }
    if (this.state === 'conectando' && this.linked() && /(connected|established|running|tunnel|ready|online)/i.test(clean) && !/disconnect|not connected|failed/i.test(clean)) {
      this.setState('conectado');
    }
    this.emit('change', this.snapshot());
  }

  // Si el PC cambia de red (por ejemplo del wifi a los datos), el agente se queda intentando la
  // conexión vieja. Con muchos errores de red seguidos, se reinicia solo para tomar la red nueva.
  watchNetwork(line) {
    if (!/NetworkUnreachable|HostUnreachable|failed to authenticate|failed to send setup udp channel|10051|10065/i.test(line)) return;
    const now = Date.now();
    this.netErrors = (this.netErrors || []).filter((t) => now - t < 30000);
    this.netErrors.push(now);
    if (this.netErrors.length < 6 || this.restarting) return;
    if (this.lastRestart && now - this.lastRestart < 45000) return;
    this.restarting = true;
    this.lastRestart = now;
    this.netErrors = [];
    this.toFile('--- La red cambió o se cayó: reiniciando el agente de playit');
    this.emit('restarting');
    this.stop().then(() => setTimeout(() => {
      this.restarting = false;
      try { this.start(); } catch (e) { this.toFile(`No se pudo reiniciar: ${e.message}`); }
    }, 2000));
  }

  // Registro en datos/playit.log para revisar problemas del túnel (sin claves).
  toFile(text) {
    try {
      const file = path.join(P.DATA, 'playit.log');
      try { if (fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + '.1'); } catch {}
      fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`);
    } catch {}
  }

  stop() {
    if (!this.proc) return Promise.resolve();
    const pid = this.proc.pid;
    return new Promise((resolve) => {
      const proc = this.proc;
      proc.once('exit', () => resolve());
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
      setTimeout(resolve, 4000);
    });
  }
}

module.exports = { Playit };
