// WaterdogPE: la puerta de entrada NetherNet que playit necesita delante del servidor de Bedrock.
const { spawn, execFileSync } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

function findJava() {
  try { execFileSync('java', ['-version'], { windowsHide: true, stdio: 'ignore' }); return 'java'; } catch {}
  // Java que bajó CraftAdmin a su carpeta, si la persona no tenía uno.
  try {
    for (const d of fs.readdirSync(path.join(P.ROOT, 'java'))) {
      const exe = path.join(P.ROOT, 'java', d, 'bin', 'java.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {}
  for (const base of ['C:\\Program Files\\Microsoft', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java']) {
    try {
      for (const d of fs.readdirSync(base)) {
        const exe = path.join(base, d, 'bin', 'java.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch {}
  }
  return null;
}

class Proxy extends EventEmitter {
  constructor(R = P) {
    super();
    this.DIR = R.WATERDOG;
    this.JAR = path.join(R.WATERDOG, 'Waterdog.jar');
    this.DATA = R.DATA;
    this.proc = null;
    this.state = 'apagado'; // apagado | arrancando | listo | error
    this.lastError = null;
    this.partial = '';
  }

  installed() { return fs.existsSync(this.JAR) && fs.existsSync(path.join(this.DIR, 'config.yml')) && !!this.token(); }

  // Clave de playit (NXS) con la que WaterdogPE se registra; sin ella la entrada no puede abrirse.
  token() {
    try {
      const m = fs.readFileSync(path.join(this.DIR, 'config.yml'), 'utf8').match(/^\s+token:\s*['"]?([^'"\s#]+)/m);
      return m ? m[1] : '';
    } catch { return ''; }
  }

  snapshot() { return { installed: this.installed(), state: this.state, lastError: this.lastError }; }

  setState(s) { this.state = s; this.emit('change', this.snapshot()); }

  log(text) {
    try {
      const file = path.join(this.DATA, 'waterdog.log');
      try { if (fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, file + '.1'); } catch {}
      fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`);
    } catch {}
  }

  start() {
    if (this.proc || !this.installed()) return;
    const java = findJava();
    if (!java) { this.lastError = 'No encontré Java para abrir WaterdogPE'; this.setState('error'); return; }
    this.lastError = null;
    this.partial = '';
    const proc = spawn(java, ['-Xms256M', '-Xmx1G', '-jar', 'Waterdog.jar'], { cwd: this.DIR, windowsHide: true });
    this.proc = proc;
    this.setState('arrancando');
    this.log('--- Abriendo WaterdogPE');
    const onData = (d) => {
      const parts = (this.partial + d.toString('utf8').replace(ANSI, '')).split(/\r?\n/);
      this.partial = parts.pop();
      for (const raw of parts) this.onLine(raw.trim());
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => { this.lastError = e.message; this.setState('error'); });
    proc.on('exit', (code) => {
      this.proc = null;
      this.log(`--- WaterdogPE se cerró (código ${code})`);
      if (this.state !== 'error') this.state = 'apagado';
      this.emit('change', this.snapshot());
    });
  }

  onLine(line) {
    if (!line) return;
    const clean = line.replace(/(token[^:]*:\s*)\S+/gi, '$1***');
    this.log(clean);
    if (/Registered with the external signaling service/i.test(clean)) this.setState('listo');
    else if (/\[(ERROR|SEVERE)\s*\]/.test(clean) && this.state !== 'listo') this.lastError = clean.replace(/^\S+\s+\[\w+\s*\]\s*/, '');
    this.emit('line', clean);
  }

  stop() {
    if (!this.proc) return Promise.resolve();
    const proc = this.proc;
    return new Promise((resolve) => {
      const t = setTimeout(() => { try { proc.kill(); } catch {} }, 15000);
      proc.once('exit', () => { clearTimeout(t); resolve(); });
      try { proc.stdin.write('end\n'); } catch { try { proc.kill(); } catch {} }
    });
  }
}

module.exports = { Proxy, findJava };
