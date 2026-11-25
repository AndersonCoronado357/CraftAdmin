// Saca de Minecraft Bedrock instalado en este PC las texturas, íconos y letras que usa la interfaz,
// la primera vez que se abre la app. Así CraftAdmin no reparte archivos del juego: cada quien usa los suyos.
// (Hace lo mismo que tools/texturas.py, pero sin Python, con las herramientas de imagen de Electron.)
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const VERSION = 1; // subir si cambia lo que se saca, para que se vuelva a generar
const MAGIA = 0x267052A0B125277Dn;

const TEXTURAS = {
  pasto_arriba: ['blocks.brarchive', 'grass_carried.png'],
  pasto_lado: ['blocks.brarchive', 'grass_side_carried.png'],
  tierra: ['blocks.brarchive', 'dirt.png'],
  mesa_arriba: ['blocks.brarchive', 'crafting_table_top.png'],
  mesa_frente: ['blocks.brarchive', 'crafting_table_front.png'],
  mesa_lado: ['blocks.brarchive', 'crafting_table_side.png'],
  estanteria: ['blocks.brarchive', 'bookshelf.png'],
  tablas_roble: ['blocks.brarchive', 'planks_oak.png'],
  barril_lado: ['blocks.brarchive', 'barrel_side.png'],
  barril_arriba: ['blocks.brarchive', 'barrel_top.png'],
  comando_frente: ['blocks.brarchive', 'command_block_front_mipmap.png'],
  comando_lado: ['blocks.brarchive', 'command_block_side_mipmap.png'],
  comando_atras: ['blocks.brarchive', 'command_block_back_mipmap.png'],
  lampara: ['blocks.brarchive', 'redstone_lamp_off.png'],
  lampara_on: ['blocks.brarchive', 'redstone_lamp_on.png'],
  portal: ['blocks.brarchive', 'portal.png'],
  oro: ['blocks.brarchive', 'gold_block.png'],
  barrera: ['blocks.brarchive', 'barrier.png'],
  mapa: ['items.brarchive', 'map_filled.png'],
  libro: ['items.brarchive', 'book_writable.png'],
  mundo: ['ui.brarchive', 'World.png'],
  steve: ['entity.brarchive', 'steve.png'],
  alex: ['entity.brarchive', 'alex.png'],
  cofre: ['entity\\chest.brarchive', 'normal.png'],
  cofre_ender: ['entity\\chest.brarchive', 'ender.png'],
};

// Íconos: 'menu' (pixeles de 1, se guarda al doble), 'grande' (ya viene al doble), 'color' (a color, tal cual)
const ICONOS = {
  copy: ['menu', 'duplicate@'], folder: ['grande', 'Folder-Closed-'], trash: ['menu', 'delete@'], restart: ['menu', 'reset@'],
  plus: ['grande', 'plus@1x'], userPlus: ['menu', 'add-player@'], users: ['menu', 'friends@'], search: ['menu', 'search@'],
  send: ['menu', 'arrow-right@'], external: ['menu', 'external-link@'], check: ['menu', 'checkmark@'], x: ['menu', 'cross@'],
  download: ['menu', 'download@'], upload: ['menu', 'export@'], edit: ['menu', 'edit@'], clock: ['menu', 'time@'],
  logout: ['menu', 'exit@'], ban: ['menu', 'block@'], unlock: ['menu', 'lock-unlocked@'], archive: ['menu', 'save@'],
  terminal: ['grande', 'Slash-Command-'], chat: ['menu', 'comment@'], link: ['menu', 'lan@'], signal: ['menu', 'ping_high@'],
  shield: ['menu', 'operator@'], server: ['menu', 'lan@'], chevronLeft: ['menu', 'chevron-left@'], chevronRight: ['menu', 'chevron-right@'],
  info: ['menu', 'information@'], alert: ['menu', 'warning@'], play: ['menu', 'play@'], pause: ['menu', 'pause@'],
  world: ['menu', 'world@'], operador: ['menu', 'permission-operator@'], miembro: ['menu', 'permission-member@'],
  visitante: ['menu', 'permission-visitor@'], swOn: ['menu', 'switch-on@'], swOff: ['menu', 'switch-off@'],
  sun: ['color', 'time_2day.png'], moon: ['color', 'time_5night.png'], cloud: ['color', 'weather_clear.png'],
};

// Letras de los menús de Bedrock: nombre en la app -> comienzo del nombre en el juego
const FUENTES = {
  'minecraft-ten.otf': 'Minecraft-Ten-',
  'minecraft-seven.otf': 'Minecraft-Seven-6',
  'minecraft-seven-pp.otf': 'Minecraft-Seven-Pixel-Perfect-9',
  'minecraft-seven-pp-bold.otf': 'Minecraft-Seven-Pixel-Perfect-Bold-',
};

// Dónde está la carpeta «data» de Minecraft Bedrock (versión de la tienda Xbox / launcher).
function buscarData() {
  const candidatos = [];
  if (process.env.CRAFTADMIN_MINECRAFT) candidatos.push(process.env.CRAFTADMIN_MINECRAFT);
  for (let c = 67; c <= 90; c++) candidatos.push(`${String.fromCharCode(c)}:\\XboxGames\\Minecraft for Windows\\Content\\data`);
  return candidatos.find((d) => {
    try { return fs.existsSync(path.join(d, 'resource_packs', 'vanilla', '__brarchive', 'textures')) && fs.existsSync(path.join(d, 'gui', 'dist', 'hbui')); } catch { return false; }
  }) || null;
}

// Contenedor .brarchive del juego: cabecera de 16 bytes, 256 bytes por entrada (nombre, posición, largo) y luego los datos.
function leerBrarchive(ruta) {
  const b = fs.readFileSync(ruta);
  if (b.readBigUInt64LE(0) !== MAGIA) throw new Error(`${ruta} no es un brarchive`);
  const n = b.readUInt32LE(8);
  const base = 16 + 256 * n;
  const out = {};
  for (let i = 0; i < n; i++) {
    const o = 16 + 256 * i;
    const nombre = b.subarray(o + 1, o + 1 + b[o]).toString('utf8');
    const pos = b.readUInt32LE(o + 248);
    const largo = b.readUInt32LE(o + 252);
    out[nombre] = b.subarray(base + pos, base + pos + largo);
  }
  return out;
}

const png64 = (img) => `data:image/png;base64,${img.toPNG().toString('base64')}`;

// Deja solo la forma del ícono, en blanco (la app lo pinta del color del texto); con escala 2 cada pixel queda de 2x2.
function mascara(img, escala) {
  const { width: w, height: h } = img.getSize();
  const src = img.toBitmap(); // BGRA
  const W = w * escala, H = h * escala;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = src[((Math.floor(y / escala) * w + Math.floor(x / escala)) * 4) + 3];
      const d = (y * W + x) * 4;
      out[d] = 255; out[d + 1] = 255; out[d + 2] = 255; out[d + 3] = a >= 128 ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(out, { width: W, height: H });
}

// Primer cuadro del portal (es una tira animada y medio transparente), sólido.
function cuadroSolido(img) {
  const { width: w } = img.getSize();
  const c = img.crop({ x: 0, y: 0, width: w, height: w });
  const bmp = c.toBitmap();
  for (let i = 3; i < bmp.length; i += 4) bmp[i] = 255;
  return nativeImage.createFromBitmap(bmp, { width: w, height: w });
}

function generar(data, destino) {
  const tx = path.join(data, 'resource_packs', 'vanilla', '__brarchive', 'textures');
  const hbui = path.join(data, 'gui', 'dist', 'hbui', 'assets');
  const fuentes = path.join(data, 'gui', 'dist', 'hbui', 'fonts');
  const cache = {};
  const textura = (archivo, nombre) => {
    cache[archivo] ||= leerBrarchive(path.join(tx, archivo));
    const buf = cache[archivo][nombre];
    if (!buf) throw new Error(`No encontré ${nombre} en ${archivo}`);
    return nativeImage.createFromBuffer(buf);
  };
  const assets = fs.readdirSync(hbui).sort();
  const buscarAsset = (prefijo, exacto = false) => {
    const n = assets.find((a) => a.endsWith('.png') && (exacto ? a.replace(/-[^-]+\.png$/, '') === prefijo : a.startsWith(prefijo)));
    if (!n) throw new Error(`No encontré ${prefijo} en los menús del juego`);
    return nativeImage.createFromPath(path.join(hbui, n));
  };

  const tex = {};
  for (const [clave, [archivo, nombre]] of Object.entries(TEXTURAS)) {
    let img = textura(archivo, nombre);
    if (clave === 'portal') img = cuadroSolido(img);
    tex[clave] = png64(img);
  }
  // Paisaje de los menús del juego, para el fondo cuando un mundo todavía no tiene foto.
  tex.fondo = `data:image/jpeg;base64,${buscarAsset('background-main', true).toJPEG(88).toString('base64')}`;

  const ic = {};
  for (const [clave, [tipo, nombre]] of Object.entries(ICONOS)) {
    if (tipo === 'color') {
      const img = textura('ui.brarchive', nombre);
      const { width, height } = img.getSize();
      ic[clave] = { u: png64(img), w: width, h: height, color: true };
    } else {
      const img = mascara(buscarAsset(nombre), tipo === 'menu' ? 2 : 1);
      const { width, height } = img.getSize();
      ic[clave] = { u: png64(img), w: width, h: height };
    }
  }

  fs.mkdirSync(path.join(destino, 'fonts'), { recursive: true });
  const listaFuentes = fs.readdirSync(fuentes).sort();
  for (const [nuevo, prefijo] of Object.entries(FUENTES)) {
    const n = listaFuentes.find((f) => f.startsWith(prefijo));
    if (!n) throw new Error(`No encontré la letra ${prefijo} del juego`);
    fs.copyFileSync(path.join(fuentes, n), path.join(destino, 'fonts', nuevo));
  }

  const js = ["'use strict';", '// Texturas e íconos sacados de Minecraft Bedrock instalado en este PC (los genera src/juego.js).', 'const JUEGO = {', '  tex: {',
    ...Object.entries(tex).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`), '  },', '  ic: {',
    ...Object.entries(ic).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`), '  },', '};', ''].join('\n');
  fs.writeFileSync(path.join(destino, 'juego.js'), js);
  fs.writeFileSync(path.join(destino, 'ore.css'), [
    '/* Letras de Minecraft Bedrock instalado en este PC (las copia src/juego.js). */',
    "@font-face { font-family: 'Minecraft Ten'; src: url(fonts/minecraft-ten.otf); }",
    "@font-face { font-family: 'Minecraft Seven'; src: url(fonts/minecraft-seven-pp.otf); }",
    "@font-face { font-family: 'Minecraft Seven'; font-weight: 700; src: url(fonts/minecraft-seven-pp-bold.otf); }",
    "@font-face { font-family: 'Minecraft Seven v2'; src: url(fonts/minecraft-seven.otf); }", ''].join('\n'));
  fs.writeFileSync(path.join(destino, 'version.json'), JSON.stringify({ version: VERSION, data, fecha: new Date().toISOString() }));
}

// Deja listas las piezas del juego en «destino»; devuelve null si todo bien o un texto con el problema.
function preparar(destino) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(destino, 'version.json'), 'utf8'));
    if (v.version === VERSION && fs.existsSync(path.join(destino, 'juego.js'))) return null;
  } catch {}
  const data = buscarData();
  if (!data) return 'No encontré Minecraft Bedrock instalado en este PC. CraftAdmin usa sus texturas y letras: instálalo desde la tienda de Xbox o el launcher de Minecraft y vuelve a abrir la app.';
  try {
    fs.mkdirSync(destino, { recursive: true });
    generar(data, destino);
    return null;
  } catch (e) {
    return `No pude leer las texturas de Minecraft (${e.message}). Vuelve a abrir la app; si sigue pasando, actualiza Minecraft.`;
  }
}

module.exports = { preparar, buscarData };
