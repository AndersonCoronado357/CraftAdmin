// Skins personalizadas de los jugadores: datos\skins\<gamertag en minúsculas>.png (64x64 o 64x32, como en Minecraft).
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const SKINS = path.join(P.DATA, 'skins');

function tamPng(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function listarSkins() {
  const out = {};
  let names = [];
  try { names = fs.readdirSync(SKINS); } catch {}
  for (const n of names) {
    if (!/\.png$/i.test(n)) continue;
    try { out[n.slice(0, -4).toLowerCase()] = `data:image/png;base64,${fs.readFileSync(path.join(SKINS, n)).toString('base64')}`; } catch {}
  }
  return out;
}
// Lee un PNG y comprueba que tenga el tamaño de una skin.
function leerSkin(file) {
  const b = fs.readFileSync(file);
  const t = tamPng(b);
  if (!t) throw new Error('Ese archivo no es una imagen PNG');
  if (t.w !== 64 || (t.h !== 64 && t.h !== 32)) throw new Error(`Una skin de Minecraft mide 64x64 y esta imagen mide ${t.w}x${t.h}`);
  return b;
}
function ponerSkin(name, file) {
  const b = leerSkin(file);
  fs.mkdirSync(SKINS, { recursive: true });
  fs.writeFileSync(path.join(SKINS, `${String(name).toLowerCase()}.png`), b);
}
function quitarSkin(name) {
  try { fs.unlinkSync(path.join(SKINS, `${String(name).toLowerCase()}.png`)); } catch {}
}

// La skin que tienes puesta en Minecraft en este PC, si es una propia (las importadas quedan en custom_skins).
// El juego anota la elegida en options.txt («game_skintypefull:<paquete>_<id>»); se usa la del usuario que jugó último.
const ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i;
function skinDelJuego() {
  const mojang = [];
  const gdk = path.join(process.env.APPDATA || '', 'Minecraft Bedrock', 'Users');
  try { for (const u of fs.readdirSync(gdk)) mojang.push(path.join(gdk, u, 'games', 'com.mojang')); } catch {}
  mojang.push(path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang'));
  let mejor = null;
  for (const m of mojang) {
    const opciones = path.join(m, 'minecraftpe', 'options.txt');
    let t, cuando;
    try { t = fs.readFileSync(opciones, 'utf8'); cuando = fs.statSync(opciones).mtimeMs; } catch { continue; }
    const linea = t.split(/\r?\n/).find((l) => l.startsWith('game_skintypefull:'));
    const id = linea && ID.exec(linea);
    if (!id) continue;
    const donde = [path.join(m, 'custom_skins'), path.join(gdk, 'Shared', 'games', 'com.mojang', 'custom_skins')];
    for (const d of donde) {
      const f = path.join(d, `${id[1]}.png`);
      try { const b = leerSkin(f); if (!mejor || cuando > mejor.cuando) mejor = { b, cuando }; break; } catch {}
    }
  }
  return mejor ? mejor.b : null;
}

module.exports = { listarSkins, ponerSkin, quitarSkin, leerSkin, skinDelJuego };
