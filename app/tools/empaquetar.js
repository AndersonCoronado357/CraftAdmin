// Arma CraftAdmin para que otros la descarguen: Electron con la app adentro, el .exe con su ícono y un .zip.
// No lleva texturas ni letras de Minecraft: cada PC las saca de su propio juego al abrir la app (src/juego.js).
// Uso: node tools/empaquetar.js   (deja el zip en ../paquete y una copia en ../cuentas/descargas)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const SALIDA = path.resolve(APP, '..', 'paquete');
const DESTINO = path.join(SALIDA, 'CraftAdmin');
const DESCARGAS_WEB = path.resolve(APP, '..', 'cuentas', 'descargas');
const RCEDIT = path.join(__dirname, 'rcedit-x64.exe');
const URL_RCEDIT = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe';
const version = require(path.join(APP, 'package.json')).version;

const copiar = (de, a, saltar = () => false) => {
  const st = fs.statSync(de);
  if (st.isDirectory()) {
    fs.mkdirSync(a, { recursive: true });
    for (const n of fs.readdirSync(de)) if (!saltar(path.join(de, n))) copiar(path.join(de, n), path.join(a, n), saltar);
  } else { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(de, a); }
};

(async () => {
  console.log('1. Electron');
  fs.rmSync(DESTINO, { recursive: true, force: true });
  copiar(path.join(APP, 'node_modules', 'electron', 'dist'), DESTINO);
  fs.renameSync(path.join(DESTINO, 'electron.exe'), path.join(DESTINO, 'CraftAdmin.exe'));
  fs.rmSync(path.join(DESTINO, 'resources', 'default_app.asar'), { force: true });
  // Solo los idiomas español e inglés de Chromium.
  for (const n of fs.readdirSync(path.join(DESTINO, 'locales'))) if (!/^(es|es-419|en-US)\.pak$/.test(n)) fs.rmSync(path.join(DESTINO, 'locales', n));

  console.log('2. La app');
  const dentro = path.join(DESTINO, 'resources', 'app');
  for (const n of ['main.js', 'preload.js', 'src', 'renderer', 'assets', 'plantillas']) {
    copiar(path.join(APP, n), path.join(dentro, n), (p) => {
      const rel = path.relative(APP, p).replace(/\\/g, '/');
      // Lo que sale de Minecraft no se reparte: cada quien lo saca de su juego.
      return ['renderer/juego.js', 'renderer/ore.css', 'renderer/fonts'].includes(rel);
    });
  }
  const pkg = require(path.join(APP, 'package.json'));
  fs.writeFileSync(path.join(dentro, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: 'Administra tus servidores de Minecraft Bedrock', main: pkg.main }, null, 2));

  console.log('3. Ícono y datos del .exe');
  if (!fs.existsSync(RCEDIT)) {
    const r = await fetch(URL_RCEDIT, { redirect: 'follow' });
    if (!r.ok) throw new Error(`No pude bajar rcedit (${r.status})`);
    fs.writeFileSync(RCEDIT, Buffer.from(await r.arrayBuffer()));
  }
  execFileSync(RCEDIT, [path.join(DESTINO, 'CraftAdmin.exe'),
    '--set-icon', path.join(APP, 'assets', 'icon.ico'),
    '--set-file-version', version, '--set-product-version', version,
    '--set-version-string', 'ProductName', 'CraftAdmin',
    '--set-version-string', 'FileDescription', 'CraftAdmin',
    '--set-version-string', 'CompanyName', 'CraftAdmin',
    '--set-version-string', 'InternalName', 'CraftAdmin',
    '--set-version-string', 'OriginalFilename', 'CraftAdmin.exe',
    '--set-version-string', 'LegalCopyright', 'CraftAdmin no es un producto oficial de Minecraft']);

  console.log('4. El .zip');
  const zip = path.join(SALIDA, `CraftAdmin-${version}-windows.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', SALIDA, 'CraftAdmin']);
  fs.mkdirSync(DESCARGAS_WEB, { recursive: true });
  for (const n of fs.readdirSync(DESCARGAS_WEB)) if (/\.zip$/i.test(n)) fs.rmSync(path.join(DESCARGAS_WEB, n));
  fs.copyFileSync(zip, path.join(DESCARGAS_WEB, path.basename(zip)));
  console.log(`listo: ${zip} (${Math.round(fs.statSync(zip).size / 1048576)} MB)`);
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
