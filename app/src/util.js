// Utilidades compartidas: JSON atómico, zip con el tar de Windows, tamaños de carpeta.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(file, data, pretty = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0));
  fs.renameSync(tmp, file);
}

function run(exe, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true, ...opts });
    let err = '';
    p.stderr && p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `${path.basename(exe)} terminó con código ${code}`))));
  });
}

// Comprime el contenido de una carpeta (sin la carpeta) en un .zip.
async function zipDir(srcDir, outFile, exclude = []) {
  const entries = fs.readdirSync(srcDir).filter((e) => !exclude.includes(e));
  if (!entries.length) throw new Error('La carpeta está vacía');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = outFile + '.parcial';
  try { fs.rmSync(tmp, { force: true }); } catch {}
  await run(P.TAR, ['-a', '-c', '-f', tmp, '--format', 'zip', '-C', srcDir, ...entries]);
  fs.renameSync(tmp, outFile);
}

async function unzip(file, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await run(P.TAR, ['-x', '-f', file, '-C', destDir]);
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of list) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) stack.push(f);
      else { try { total += fs.statSync(f).size; } catch {} }
    }
  }
  return total;
}

// Nombre válido como carpeta de Windows.
function safeName(name) {
  const s = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return s || 'Mundo';
}

function uniqueDir(parent, base) {
  let name = base;
  let i = 2;
  while (fs.existsSync(path.join(parent, name))) name = `${base} ${i++}`;
  return name;
}

function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
}

function tempDir(tag) {
  const d = path.join(P.TEMP, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); } catch {}
}

module.exports = { readJSON, writeJSON, run, zipDir, unzip, dirSize, safeName, uniqueDir, stamp, tempDir, rmrf };
