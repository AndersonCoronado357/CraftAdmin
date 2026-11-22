// Copias de seguridad: en frío (servidor apagado) o en caliente con save hold / query / resume.
const fs = require('fs');
const path = require('path');
const PG = require('./paths');
const { zipDir, unzip, stamp, tempDir, rmrf } = require('./util');

// Todo lo de abajo trabaja con las rutas de un servidor (P) y su server.properties (props).
function crearCopias(P = PG, props) {

const NAME_RE = /^(.*) (\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})(?:-(\d{2}))? \((.+)\)\.zip$/;
const TYPES = { manual: 'Manual', auto: 'Automática', original: 'Original', 'antes de restaurar': 'Antes de restaurar', 'antes de borrar': 'Antes de borrar', 'antes de actualizar': 'Antes de actualizar' };

function parse(file) {
  const base = path.basename(file);
  const m = base.match(NAME_RE);
  let st = null;
  try { st = fs.statSync(file); } catch {}
  if (!m) return { file, name: base, world: base.replace(/\.zip$/i, ''), date: st?.mtimeMs || 0, type: 'manual', typeLabel: 'Manual', size: st?.size || 0 };
  const [, world, day, hh, mm, ss, type] = m;
  const date = new Date(`${day}T${hh}:${mm}:${ss || '00'}`).getTime();
  const t = type.toLowerCase();
  return { file, name: base, world, date, type: t, typeLabel: TYPES[t] || type, size: st?.size || 0 };
}

function list() {
  let names = [];
  try { names = fs.readdirSync(P.BACKUPS); } catch {}
  return names.filter((n) => /\.zip$/i.test(n)).map((n) => parse(path.join(P.BACKUPS, n))).sort((a, b) => b.date - a.date);
}

function target(world, type) {
  return path.join(P.BACKUPS, `${world} ${stamp()} (${type}).zip`);
}

async function cold(world, type) {
  const dir = path.join(P.WORLDS, world);
  if (!fs.existsSync(path.join(dir, 'level.dat'))) throw new Error('No hay mundo para copiar');
  const out = target(world, type);
  await zipDir(dir, out);
  return parse(out);
}

// Copia en caliente: el servidor deja de escribir, avisa qué bytes copiar y luego sigue.
async function hot(server, world, type) {
  await server.query('save hold', /Saving|already/i, 10000).catch(() => {});
  let listLine = null;
  try {
    // La lista de archivos llega en la línea que sigue a «Data saved»; se espera esa línea directamente.
    const isList = (m) => m.includes('/') && /:\d+\s*(,|$)/.test(m);
    for (let i = 0; i < 40 && !listLine; i++) {
      await new Promise((r) => setTimeout(r, 750));
      const res = await server.query('save query', (m) => isList(m) || /not yet|still|previous save|not ready/i.test(m), 3000).catch(() => null);
      if (res && isList(res)) listLine = res;
    }
    if (!listLine) throw new Error('El servidor no dejó listo el mundo para copiar');
    const tmp = tempDir('copia');
    try {
      for (const part of listLine.split(/,\s*/)) {
        const m = part.match(/^(.*):(\d+)$/);
        if (!m) continue;
        const rel = m[1].trim();
        const len = Number(m[2]);
        const src = path.join(P.WORLDS, rel);
        const dest = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const fd = fs.openSync(src, 'r');
        const buf = Buffer.alloc(len);
        let read = 0;
        while (read < len) {
          const n = fs.readSync(fd, buf, read, len - read, read);
          if (!n) break;
          read += n;
        }
        fs.closeSync(fd);
        fs.writeFileSync(dest, buf.subarray(0, read));
      }
      // Lo que no está en la lista (icono, paquetes) se copia tal cual.
      const worldDir = path.join(P.WORLDS, world);
      for (const e of fs.readdirSync(worldDir, { withFileTypes: true })) {
        const d = path.join(tmp, world, e.name);
        if (!fs.existsSync(d)) fs.cpSync(path.join(worldDir, e.name), d, { recursive: true });
      }
      const out = target(world, type);
      await zipDir(path.join(tmp, world), out);
      return parse(out);
    } finally {
      rmrf(tmp);
    }
  } finally {
    await server.query('save resume', /resumed|not on hold|No save/i, 6000).catch(() => {});
  }
}

async function create(server, type = 'manual') {
  const world = props.get()['level-name'];
  if (!world || !fs.existsSync(path.join(P.WORLDS, world, 'level.dat'))) throw new Error('Todavía no hay mundo para copiar');
  if (server.state === 'abierto') return hot(server, world, type);
  if (server.state !== 'apagado') throw new Error('Espera a que el servidor termine de abrir o cerrar');
  return cold(world, type);
}

// Borra las automáticas más viejas y deja solo las últimas `keep`.
function prune(keep) {
  const autos = list().filter((b) => b.type === 'auto');
  const gone = [];
  for (const b of autos.slice(Math.max(1, keep))) {
    try { fs.unlinkSync(b.file); gone.push(b.name); } catch {}
  }
  return gone;
}

async function restore(file, server) {
  if (server.state !== 'apagado') throw new Error('Cierra el servidor antes de restaurar');
  const b = parse(file);
  const world = b.world;
  const dir = path.join(P.WORLDS, world);
  if (fs.existsSync(path.join(dir, 'level.dat'))) await cold(world, 'antes de restaurar');
  const tmp = tempDir('restaurar');
  try {
    await unzip(file, tmp);
    let root = tmp;
    if (!fs.existsSync(path.join(root, 'level.dat'))) {
      const subs = fs.readdirSync(tmp, { withFileTypes: true }).filter((e) => e.isDirectory());
      const inner = subs.find((s) => fs.existsSync(path.join(tmp, s.name, 'level.dat')));
      if (!inner) throw new Error('La copia no trae un mundo válido');
      root = path.join(tmp, inner.name);
    }
    rmrf(dir);
    fs.mkdirSync(P.WORLDS, { recursive: true });
    await fs.promises.cp(root, dir, { recursive: true });
  } finally {
    rmrf(tmp);
  }
  return world;
}

return { list, create, cold, prune, restore, parse };
}

module.exports = { crearCopias };
