// Mundos: los del servidor, los de Minecraft en este PC, importar, exportar y activar.
const fs = require('fs');
const path = require('path');
const PG = require('./paths');
const { readJSON, zipDir, unzip, dirSize, safeName, uniqueDir, tempDir, rmrf } = require('./util');

// Todo lo de abajo trabaja con las rutas de un servidor (P) y su server.properties (props).
function crearMundos(P = PG, props) {

const ORIGIN = 'posada-origen.txt';
const PACK_TYPES = [
  { json: 'world_behavior_packs.json', dir: 'behavior_packs', sources: ['behavior_packs', 'development_behavior_packs'] },
  { json: 'world_resource_packs.json', dir: 'resource_packs', sources: ['resource_packs', 'development_resource_packs'] },
];

function readName(dir) {
  try { return fs.readFileSync(path.join(dir, 'levelname.txt'), 'utf8').trim() || path.basename(dir); } catch { return path.basename(dir); }
}

function isWorld(dir) {
  return fs.existsSync(path.join(dir, 'level.dat'));
}

function packCount(dir) {
  let n = 0;
  for (const t of PACK_TYPES) {
    const list = readJSON(path.join(dir, t.json), []);
    if (Array.isArray(list)) n += list.length;
  }
  return n;
}

function info(dir, withSize = true) {
  let mtime = 0;
  try { mtime = fs.statSync(path.join(dir, 'level.dat')).mtimeMs; } catch {}
  try { mtime = Math.max(mtime, fs.statSync(path.join(dir, 'db')).mtimeMs); } catch {}
  let icon = null;
  const iconFile = path.join(dir, 'world_icon.jpeg');
  try { icon = 'data:image/jpeg;base64,' + fs.readFileSync(iconFile).toString('base64'); } catch {}
  let origin = null;
  try { origin = fs.readFileSync(path.join(dir, ORIGIN), 'utf8').trim() || null; } catch {}
  return {
    folder: path.basename(dir),
    path: dir,
    origin,
    name: readName(dir),
    size: withSize ? dirSize(dir) : null,
    mtime,
    icon,
    packs: packCount(dir),
  };
}

function listServer() {
  const active = props.get()['level-name'];
  let names = [];
  try { names = fs.readdirSync(P.WORLDS); } catch {}
  return names
    .map((n) => path.join(P.WORLDS, n))
    .filter((d) => { try { return fs.statSync(d).isDirectory() && isWorld(d); } catch { return false; } })
    .map((d) => ({ ...info(d), active: path.basename(d) === active }))
    .sort((a, b) => (b.active - a.active) || b.mtime - a.mtime);
}

function listMinecraft() {
  const server = listServer();
  const out = [];
  for (const m of P.mojangDirs()) {
    const wdir = path.join(m, 'minecraftWorlds');
    let names = [];
    try { names = fs.readdirSync(wdir); } catch { continue; }
    for (const n of names) {
      const d = path.join(wdir, n);
      if (!isWorld(d)) continue;
      const i = info(d);
      i.imported = server.some((s) => (s.origin ? s.origin === d : s.name === i.name));
      out.push(i);
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// Busca un paquete por uuid en las carpetas de Minecraft.
function findPack(uuid, sources) {
  for (const m of P.mojangDirs()) {
    for (const s of sources) {
      const base = path.join(m, s);
      let dirs = [];
      try { dirs = fs.readdirSync(base); } catch { continue; }
      for (const d of dirs) {
        const found = searchManifest(path.join(base, d), uuid, 3);
        if (found) return found;
      }
    }
  }
  return null;
}

function searchManifest(dir, uuid, depth) {
  const mf = path.join(dir, 'manifest.json');
  if (fs.existsSync(mf)) {
    const j = readJSON(mf, null);
    return j?.header?.uuid === uuid ? dir : null;
  }
  if (depth <= 0) return null;
  let subs = [];
  try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return null; }
  for (const s of subs) {
    const r = searchManifest(path.join(dir, s.name), uuid, depth - 1);
    if (r) return r;
  }
  return null;
}

function packsInside(dir) {
  const ids = new Set();
  const walk = (d, depth) => {
    const mf = path.join(d, 'manifest.json');
    if (fs.existsSync(mf)) { const j = readJSON(mf, null); if (j?.header?.uuid) ids.add(j.header.uuid); return; }
    if (depth <= 0) return;
    let subs = [];
    try { subs = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return; }
    for (const s of subs) walk(path.join(d, s.name), depth - 1);
  };
  walk(dir, 3);
  return ids;
}

// Copia dentro del mundo los paquetes que usa y que no traiga consigo.
function bundlePacks(worldDir) {
  const report = { copied: [], missing: [] };
  for (const t of PACK_TYPES) {
    const list = readJSON(path.join(worldDir, t.json), []);
    if (!Array.isArray(list) || !list.length) continue;
    const have = new Set([...packsInside(path.join(worldDir, t.dir)), ...packsInside(path.join(P.SERVER, t.dir))]);
    for (const p of list) {
      if (!p.pack_id || have.has(p.pack_id)) continue;
      const src = findPack(p.pack_id, t.sources);
      if (!src) { report.missing.push(p.pack_id); continue; }
      const dest = path.join(worldDir, t.dir, path.basename(src));
      fs.cpSync(src, dest, { recursive: true });
      const name = readJSON(path.join(src, 'manifest.json'), {})?.header?.name || path.basename(src);
      report.copied.push(String(name).replace(/§./g, ''));
    }
  }
  return report;
}

async function importFolder(src) {
  if (!isWorld(src)) throw new Error('Esa carpeta no es un mundo de Minecraft');
  fs.mkdirSync(P.WORLDS, { recursive: true });
  const folder = uniqueDir(P.WORLDS, safeName(readName(src)));
  const dest = path.join(P.WORLDS, folder);
  await fs.promises.cp(src, dest, { recursive: true });
  // Recuerda de dónde vino, para distinguir mundos con el mismo nombre.
  try { fs.writeFileSync(path.join(dest, ORIGIN), path.resolve(src)); } catch {}
  const packs = bundlePacks(dest);
  return { folder, packs };
}

function findWorldRoot(dir, depth = 3) {
  if (isWorld(dir)) return dir;
  if (depth <= 0) return null;
  let subs = [];
  try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return null; }
  for (const s of subs) {
    const r = findWorldRoot(path.join(dir, s.name), depth - 1);
    if (r) return r;
  }
  return null;
}

async function importFile(file) {
  const tmp = tempDir('importar');
  try {
    await unzip(file, tmp);
    const root = findWorldRoot(tmp);
    if (!root) throw new Error('El archivo no trae un mundo de Minecraft');
    fs.mkdirSync(P.WORLDS, { recursive: true });
    const folder = uniqueDir(P.WORLDS, safeName(readName(root)));
    await fs.promises.cp(root, path.join(P.WORLDS, folder), { recursive: true });
    const packs = bundlePacks(path.join(P.WORLDS, folder));
    return { folder, packs };
  } finally {
    rmrf(tmp);
  }
}

function activate(folder) {
  const dir = path.join(P.WORLDS, folder);
  if (!isWorld(dir)) throw new Error('Ese mundo no existe');
  props.set({ 'level-name': folder });
}

function rename(folder, newName) {
  const dir = path.join(P.WORLDS, folder);
  if (!isWorld(dir)) throw new Error('Ese mundo no existe');
  const clean = safeName(newName);
  if (clean === folder) return folder;
  if (fs.existsSync(path.join(P.WORLDS, clean))) throw new Error('Ya hay un mundo con ese nombre');
  fs.renameSync(dir, path.join(P.WORLDS, clean));
  fs.writeFileSync(path.join(P.WORLDS, clean, 'levelname.txt'), clean);
  if (props.get()['level-name'] === folder) props.set({ 'level-name': clean });
  return clean;
}

async function exportWorld(folder, dest) {
  await zipDir(path.join(P.WORLDS, folder), dest, [ORIGIN]);
}

return { listServer, listMinecraft, importFolder, importFile, activate, rename, exportWorld, isWorld, info };
}

module.exports = { crearMundos };
