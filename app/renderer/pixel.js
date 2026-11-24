'use strict';
// Arte de CraftAdmin: texturas, skins e íconos de Minecraft Bedrock (juego.js, sacado con tools/texturas.py),
// con los bloques en 3D como en el inventario del juego.

/* ---------- Utilidades ---------- */
function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function cut(src, x, y, w, h, espejo = false) {
  const c = lienzo(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (espejo) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}
function cargarImagen(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = lienzo(img.width, img.height);
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

/* ---------- Texturas del juego ---------- */
const TJ = {};
let juegoListo = null;
function cargarJuego() {
  if (!juegoListo) juegoListo = Promise.all(Object.entries(JUEGO.tex).map(async ([k, u]) => { TJ[k] = await cargarImagen(u); }));
  return juegoListo;
}
// Para lo que todavía pide las texturas por su nombre de antes (el pasto del escenario).
function texturas() {
  return { pastoTop: TJ.pasto_arriba, pastoL: TJ.pasto_lado, pastoR: TJ.pasto_lado, tierra: TJ.tierra, oro: TJ.oro };
}

/* ---------- Objetos planos (mapa, barrera, libro) ---------- */
const item = (n, cls = 'it') => {
  const k = { barrera: 'barrera', mapa: 'mapa', libro: 'libro' }[n] || n;
  return `<img class="${cls} px" src="${JUEGO.tex[k]}" alt="" draggable="false">`;
};

/* ---------- Skins: la propia de cada jugador o, si no tiene, Steve o Alex como en el juego ---------- */
const MC = { custom: {}, slim: new Map() };
const skinDe = (name) => MC.custom[String(name || '').toLowerCase()] || null;
const skinPara = (name) => skinDe(name) || (hashStr(String(name || '?').toLowerCase()) % 2 ? TJ.alex : TJ.steve);
function esSlim(c) {
  if (MC.slim.has(c)) return MC.slim.get(c);
  let s = false;
  if (c.height === 64) {
    const d = c.getContext('2d').getImageData(54, 20, 2, 12).data;
    s = true;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) { s = false; break; }
  }
  MC.slim.set(c, s);
  return s;
}
// Una capa extra (sombrero, chaqueta...) solo cuenta si tiene algo dibujado y no es un bloque de un solo color.
function capaUtil(c, x, y, w, h) {
  const d = c.getContext('2d').getImageData(x, y, w, h).data;
  let vis = 0, opaco = 0;
  const first = `${d[0]},${d[1]},${d[2]}`;
  let unico = true;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) vis++;
    if (d[i + 3] === 255) opaco++;
    if (`${d[i]},${d[i + 1]},${d[i + 2]}` !== first) unico = false;
  }
  return vis > 0 && !(opaco === d.length / 4 && unico);
}
const headCache = new Map();
const skinCache = new Map();
// map: las skins de los jugadores. extra: las que no son de un jugador (la de tu cuenta, la de tu Minecraft).
async function cargarSkins(map, extra) {
  await cargarJuego();
  if (map) MC.mapa = map;
  if (extra) MC.extra = extra;
  const todas = { ...(MC.mapa || {}), ...(MC.extra || {}) };
  const out = {};
  await Promise.all(Object.entries(todas).map(async ([k, url]) => { if (!url) return; const c = await cargarImagen(url); if (c) out[k] = c; }));
  MC.custom = out;
  MC.slim.clear();
  headCache.clear();
  skinCache.clear();
}
// Cara de 8x8 con el sombrero de la skin encima.
function caraSkin(c) {
  const o = lienzo(8, 8);
  const x = o.getContext('2d');
  x.drawImage(c, 8, 8, 8, 8, 0, 0, 8, 8);
  if (capaUtil(c, 40, 8, 8, 8)) x.drawImage(c, 40, 8, 8, 8, 0, 0, 8, 8);
  return o.toDataURL();
}
function head(name, cls = 'cab') {
  const key = String(name || '?').toLowerCase() + '|' + cls;
  if (!headCache.has(key)) headCache.set(key, `<img class="${cls} px" src="${caraSkin(skinPara(name))}" alt="" draggable="false">`);
  return headCache.get(key);
}

/* ---------- Bloques en 3D como los del inventario del juego ---------- */
// La misma vista que el inventario de Minecraft (girado 45° y mirado desde 30° arriba): las caras de arriba
// quedan en diagonales de 2 a 1 y las aristas verticales miden 1,22 veces el ancho de cada pixel,
// así el bloque se ve como un cubo y no aplastado.
const VISTA_MC = { ex: [1, 0.5], ez: [-1, 0.5], ey: [0, -1.2247] };
const ALTO_CUBO = (16 + 16 * 1.2247) / 32; // alto del bloque por cada pixel de ancho
const texCache = new WeakMap();
function texDatos(c) {
  let d = texCache.get(c);
  if (!d) { d = { w: c.width, h: c.height, px: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }; texCache.set(c, d); }
  return d;
}
// Dibuja cajas texturizadas pixel por pixel, sin suavizar la textura, como el juego en el inventario.
// Si la escala no es entera se dibuja más grande y se reduce, para que los bordes no salgan dentados.
function rasterIso(boxes, W, H, vista = VISTA_MC) {
  const { ex, ez, ey } = vista;
  const proj = (x, y, z) => [x * ex[0] + z * ez[0] + y * ey[0], x * ex[1] + z * ez[1] + y * ey[1]];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) for (const x of [b.x, b.x + b.w]) for (const y of [b.y, b.y + b.h]) for (const z of [b.z, b.z + b.d]) {
    const [px, py] = proj(x, y, z);
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4);
  const Wd = Math.round(W * dpr), Hd = Math.round(H * dpr);
  let s = Math.min(Wd / (maxX - minX), Hd / (maxY - minY));
  if (s >= 1) { const e = Math.floor(s + 0.02); s = e / s >= 0.9 ? e : s; }
  const k = Number.isInteger(s) ? 1 : 4;
  const S = s * k, CW = Wd * k, CH = Hd * k;
  const ox = Math.round((CW - (maxX - minX) * S) / 2 - minX * S);
  const oy = Math.round((CH - (maxY - minY) * S) / 2 - minY * S);
  const buf = new Uint8ClampedArray(CW * CH * 4);
  const P = (x, y, z) => { const q = proj(x, y, z); return [q[0] * S + ox, q[1] * S + oy]; };
  const cara = (t, O, A, B, f) => {
    if (!t) return;
    const d = texDatos(t);
    const U = [A[0] - O[0], A[1] - O[1]], V = [B[0] - O[0], B[1] - O[1]];
    const det = U[0] * V[1] - U[1] * V[0];
    if (Math.abs(det) < 1e-9) return;
    const xs = [O[0], A[0], B[0], A[0] + V[0]], ys = [O[1], A[1], B[1], A[1] + V[1]];
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(CW - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(CH - 1, Math.ceil(Math.max(...ys)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5001 - O[0], dy = py + 0.5001 - O[1];
      const a = (dx * V[1] - dy * V[0]) / det, b = (U[0] * dy - U[1] * dx) / det;
      if (a < 0 || a >= 1 || b < 0 || b >= 1) continue;
      const si = (Math.min(d.h - 1, Math.floor(b * d.h)) * d.w + Math.min(d.w - 1, Math.floor(a * d.w))) * 4;
      if (d.px[si + 3] < 128) continue;
      const di = (py * CW + px) * 4;
      buf[di] = d.px[si] * f; buf[di + 1] = d.px[si + 1] * f; buf[di + 2] = d.px[si + 2] * f; buf[di + 3] = 255;
    }
  };
  for (const b of boxes) {
    const { x, y, z, w, h, d } = b;
    cara(b.front, P(x, y + h, z + d), P(x + w, y + h, z + d), P(x, y, z + d), b.fs ?? 0.8);
    cara(b.side, P(x + w, y + h, z + d), P(x + w, y + h, z), P(x + w, y, z + d), b.ss ?? 0.6);
    cara(b.top, P(x, y + h, z), P(x + w, y + h, z), P(x, y + h, z + d), b.ts ?? 1);
  }
  let out = buf;
  if (k > 1) {
    out = new Uint8ClampedArray(Wd * Hd * 4);
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
      let r = 0, g = 0, bl = 0, al = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const si = ((y * k + j) * CW + x * k + i) * 4, a = buf[si + 3];
        r += buf[si] * a; g += buf[si + 1] * a; bl += buf[si + 2] * a; al += a;
      }
      const di = (y * Wd + x) * 4;
      if (al) { out[di] = r / al; out[di + 1] = g / al; out[di + 2] = bl / al; out[di + 3] = al / (k * k); }
    }
  }
  const c = lienzo(Wd, Hd);
  c.getContext('2d').putImageData(new ImageData(out, Wd, Hd), 0, 0);
  return c.toDataURL();
}

// Caras de una caja sacadas de una textura con el formato de los modelos del juego (skins, cofres).
function parte(sk, u, v, w, h, d, espejo = false) {
  if (!espejo) return { top: cut(sk, u + d, v, w, d), front: cut(sk, u + d, v + d, w, h), side: cut(sk, u + d + w, v + d, d, h) };
  // En las skins viejas (64x32) el brazo y la pierna izquierdos son los derechos en espejo.
  return { top: cut(sk, u + d, v, w, d, true), front: cut(sk, u + d, v + d, w, h, true), side: cut(sk, u, v + d, d, h, true) };
}
// Junta la cabeza con su sombrero en una sola textura por cara.
function cabezaDe(sk) {
  const base = parte(sk, 0, 0, 8, 8, 8);
  if (!capaUtil(sk, 32, 0, 32, 16)) return base;
  const capa = parte(sk, 32, 0, 8, 8, 8);
  for (const k of ['top', 'front', 'side']) base[k].getContext('2d').drawImage(capa[k], 0, 0);
  return base;
}
const cubo = (top, front, side, extra = {}) => [{ x: 0, y: 0, z: 0, w: 16, h: 16, d: 16, top, front, side, ...extra }];
// Cofre como el del juego: base, tapa y cerrojo, apoyado en el suelo de un bloque de 16.
function cofreDe(t) {
  return [
    { x: 0, y: 0, z: 0, w: 16, h: 16, d: 16 },
    { x: 1, y: 0, z: 1, w: 14, h: 10, d: 14, ...parte(t, 0, 19, 14, 10, 14) },
    { x: 1, y: 9, z: 1, w: 14, h: 5, d: 14, ...parte(t, 0, 0, 14, 5, 14) },
    { x: 7, y: 7, z: 15, w: 2, h: 4, d: 1, ...parte(t, 0, 0, 2, 4, 1) },
  ];
}
const ISO = {
  pasto: () => cubo(TJ.pasto_arriba, TJ.pasto_lado, TJ.pasto_lado),
  comando: () => cubo(TJ.comando_lado, TJ.comando_frente, TJ.comando_lado),
  mesa: () => cubo(TJ.mesa_arriba, TJ.mesa_frente, TJ.mesa_lado),
  estante: () => cubo(TJ.tablas_roble, TJ.estanteria, TJ.estanteria),
  portal: () => cubo(TJ.portal, TJ.portal, TJ.portal),
  lampara: () => cubo(TJ.lampara, TJ.lampara, TJ.lampara),
  lamparaOn: () => cubo(TJ.lampara_on, TJ.lampara_on, TJ.lampara_on, { fs: 0.92, ss: 0.8 }),
  cofre: () => cofreDe(TJ.cofre),
  cofreEnder: () => cofreDe(TJ.cofre_ender),
  barril: () => cubo(TJ.barril_arriba, TJ.barril_lado, TJ.barril_lado),
  oro: () => cubo(TJ.oro, TJ.oro, TJ.oro),
  // Losa de pasto (medio bloque) para el mundo plano; la caja vacía mantiene el tamaño de un bloque entero.
  losa: () => [{ x: 0, y: 0, z: 0, w: 16, h: 16, d: 16 }, { x: 0, y: 0, z: 0, w: 16, h: 8, d: 16, top: TJ.pasto_arriba, front: cut(TJ.pasto_lado, 0, 0, 16, 8), side: cut(TJ.pasto_lado, 0, 0, 16, 8) }],
  cabeza: () => { const c = cabezaDe(TJ.steve); return [{ x: 0, y: 0, z: 0, w: 8, h: 8, d: 8, ...c, fs: 0.92, ss: 0.7 }]; },
};
ISO.cofreOro = ISO.cofreEnder;
ISO.cofreHierro = ISO.barril;
const isoCache = new Map();
// Bloque en 3D de «size» de ancho (un poco más alto, como un cubo), o un objeto plano si el nombre empieza con «item:».
function iso(name, size, cls = 'iso') {
  if (name.startsWith('item:')) return item(name.slice(5), `${cls} plano`).replace('<img ', `<img width="${size}" height="${size}" `);
  const h = Math.round(size * ALTO_CUBO);
  const key = `${name}|${size}`;
  let url = isoCache.get(key);
  if (!url) { url = rasterIso((ISO[name] || ISO.pasto)(), size, h); isoCache.set(key, url); }
  return `<img class="${cls} px" src="${url}" width="${size}" height="${h}" alt="" draggable="false">`;
}

// Islita de pasto de 3 por 3 con un «servidor» (bloque de comandos con una lámpara de redstone prendida
// encima), una mesa de trabajo y un cofre, hecha con las texturas del juego. Se dibuja de atrás hacia adelante.
const mover = (boxes, dx, dy, dz) => boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy, z: b.z + dz }));
function diorama(W) {
  const key = `diorama|${W}`;
  if (!isoCache.has(key)) {
    const piezas = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) piezas.push([i, 0, j, ISO.pasto()]);
    piezas.push([0, 1, 0, ISO.comando()], [0, 2, 0, ISO.lamparaOn()], [2, 1, 0, ISO.mesa()], [0, 1, 2, ISO.cofre()]);
    piezas.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[1] - b[1]);
    const boxes = piezas.flatMap(([i, l, j, bx]) => mover(bx, i * 16, l * 16, j * 16));
    isoCache.set(key, rasterIso(boxes, W, Math.round(W * 106.8 / 96)));
  }
  return isoCache.get(key);
}

// Torre de n bloques en 3D (pasto arriba y tierra abajo, o de oro) para el gráfico de Visitas.
// s: cada pixel del juego mide s/2 pixeles de pantalla (2 = 32 de ancho, 3 = 48).
const torreCache = new Map();
const altoTorre = (n, s) => Math.round((16 + 16 * n * 1.2247) * s / 2);
function torre(n, oro = false, s = 2) {
  const key = `${n}|${oro}|${s}`;
  if (!torreCache.has(key)) {
    const c = lienzo(16, 16 * n);
    const x = c.getContext('2d');
    for (let i = 0; i < n; i++) x.drawImage(oro ? TJ.oro : i === 0 ? TJ.pasto_lado : TJ.tierra, 0, 16 * i);
    const W = 16 * s, H = altoTorre(n, s);
    const url = rasterIso([{ x: 0, y: 0, z: 0, w: 16, h: 16 * n, d: 16, top: oro ? TJ.oro : TJ.pasto_arriba, front: c, side: c }], W, H);
    torreCache.set(key, `<img class="torre-img px" src="${url}" width="${W}" height="${H}" alt="" draggable="false">`);
  }
  return torreCache.get(key);
}

/* ---------- Personaje completo en 3D, como la vista de aspectos del launcher ---------- */
function vistaGiro(yaw, pitch) {
  const a = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  return { ex: [Math.cos(a), Math.sin(a) * Math.sin(p)], ez: [-Math.sin(a), Math.cos(a) * Math.sin(p)], ey: [0, -Math.cos(p)] };
}
function shaded(c, f) {
  if (f === 1) return c;
  const o = lienzo(c.width, c.height);
  const x = o.getContext('2d');
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = f < 1 ? `rgba(0,0,0,${1 - f})` : `rgba(255,255,255,${f - 1})`;
  x.fillRect(0, 0, o.width, o.height);
  return o;
}
// Dibuja cajas texturizadas (de atrás hacia adelante) y devuelve una imagen suavizada en los bordes.
function renderIso(boxes, W, H, pad = 0.06, SS = 4, vista = vistaGiro(45, 30)) {
  const { ex, ez, ey } = vista;
  const proj = (x, y, z) => [x * ex[0] + z * ez[0] + y * ey[0], x * ex[1] + z * ez[1] + y * ey[1]];
  const pts = [];
  for (const b of boxes) for (const x of [b.x, b.x + b.w]) for (const y of [b.y, b.y + b.h]) for (const z of [b.z, b.z + b.d]) pts.push(proj(x, y, z));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cw = W * SS, ch = H * SS;
  const s = Math.min((cw * (1 - 2 * pad)) / (maxX - minX), (ch * (1 - 2 * pad)) / (maxY - minY));
  const ox = (cw - (maxX - minX) * s) / 2 - minX * s;
  const oy = (ch - (maxY - minY) * s) / 2 - minY * s;
  const big = lienzo(cw, ch);
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const P = (x, y, z) => { const q = proj(x, y, z); return [q[0] * s + ox, q[1] * s + oy]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const face = (t, O, U, V, f) => {
    if (!t) return;
    // Un poco más grande para que no queden rendijas entre caras.
    const lu = Math.hypot(U[0], U[1]), lv = Math.hypot(V[0], V[1]);
    const gu = 0.7 / lu, gv = 0.7 / lv;
    const O2 = [O[0] - U[0] * gu - V[0] * gv, O[1] - U[1] * gu - V[1] * gv];
    const U2 = [U[0] * (1 + 2 * gu), U[1] * (1 + 2 * gu)], V2 = [V[0] * (1 + 2 * gv), V[1] * (1 + 2 * gv)];
    ctx.setTransform(U2[0] / t.width, U2[1] / t.width, V2[0] / t.height, V2[1] / t.height, O2[0], O2[1]);
    ctx.drawImage(shaded(t, f), 0, 0);
  };
  for (const b of boxes) {
    const { x, y, z, w, h, d } = b;
    const L0 = P(x, y + h, z + d);
    face(b.front, L0, sub(P(x + w, y + h, z + d), L0), sub(P(x, y, z + d), L0), b.fs ?? 0.86);
    const R0 = P(x + w, y + h, z + d);
    face(b.side, R0, sub(P(x + w, y + h, z), R0), sub(P(x + w, y, z + d), R0), b.ss ?? 0.66);
    const T0 = P(x, y + h, z);
    face(b.top, T0, sub(P(x + w, y + h, z), T0), sub(P(x, y + h, z + d), T0), b.ts ?? 1);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const out = lienzo(W, H);
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(big, 0, 0, W, H);
  return out.toDataURL();
}
function cajasSkin(sk) {
  const nuevo = sk.height === 64;
  const a = nuevo && esSlim(sk) ? 3 : 4;
  const look = { fs: 0.94, ss: 0.72 };
  const caja = (x, y, z, w, h, d, f, e = 0) => ({ x: x - e, y: y - e, z: z - e, w: w + 2 * e, h: h + 2 * e, d: d + 2 * e, ...f, ...look });
  const capa = (x, y, z, w, h, d, u, v, e) => (capaUtil(sk, u, v, 2 * d + 2 * w, d + h) ? [caja(x, y, z, w, h, d, parte(sk, u, v, w, h, d), e)] : []);
  return [
    caja(4 - a, 12, 0, a, 12, 4, parte(sk, 40, 16, a, 12, 4)),
    ...(nuevo ? capa(4 - a, 12, 0, a, 12, 4, 40, 32, 0.25) : []),
    caja(4, 0, 0, 4, 12, 4, parte(sk, 0, 16, 4, 12, 4)),
    ...(nuevo ? capa(4, 0, 0, 4, 12, 4, 0, 32, 0.25) : []),
    caja(8, 0, 0, 4, 12, 4, nuevo ? parte(sk, 16, 48, 4, 12, 4) : parte(sk, 0, 16, 4, 12, 4, true)),
    ...(nuevo ? capa(8, 0, 0, 4, 12, 4, 0, 48, 0.25) : []),
    caja(4, 12, 0, 8, 12, 4, parte(sk, 16, 16, 8, 12, 4)),
    ...(nuevo ? capa(4, 12, 0, 8, 12, 4, 16, 32, 0.25) : []),
    caja(12, 12, 0, a, 12, 4, nuevo ? parte(sk, 32, 48, a, 12, 4) : parte(sk, 40, 16, 4, 12, 4, true)),
    ...(nuevo ? capa(12, 12, 0, a, 12, 4, 48, 48, 0.25) : []),
    caja(4, 24, -2, 8, 8, 8, parte(sk, 0, 0, 8, 8, 8)),
    ...capa(4, 24, -2, 8, 8, 8, 32, 0, 0.5),
  ];
}
function skin3d(name, w = 120, h = 220, cls = 'skin3d') {
  const key = `${String(name).toLowerCase()}|${w}x${h}`;
  let url = skinCache.get(key);
  if (!url) {
    url = renderIso(cajasSkin(skinPara(name)), w * 2, h * 2, 0.04, 3, vistaGiro(28, 14));
    skinCache.set(key, url);
  }
  return `<img class="${cls}" src="${url}" width="${w}" height="${h}" alt="" draggable="false">`;
}

/* ---------- Íconos de la interfaz: los de los menús de Bedrock, del color del texto ---------- */
const ICONOS = JUEGO.ic;
// Ojo en pixel art para ver u ocultar una contraseña; tachado cuando ya se está viendo.
function ojo(visible = false) {
  const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const forma = [r(5, 4, 6, 1), r(3, 5, 2, 1), r(11, 5, 2, 1), r(2, 6, 1, 1), r(13, 6, 1, 1), r(1, 7, 1, 2), r(14, 7, 1, 2),
    r(2, 9, 1, 1), r(13, 9, 1, 1), r(3, 10, 2, 1), r(11, 10, 2, 1), r(5, 11, 6, 1), r(6, 6, 4, 4)].join('');
  const tache = visible ? Array.from({ length: 12 }, (_, k) => r(2 + k, 2 + k, 2, 1)).join('') : '';
  return `<svg class="ojo" viewBox="0 0 16 16" width="20" height="20" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${forma}${tache}</svg>`;
}
const ic = (n, cls = 'ic') => {
  const g = ICONOS[n];
  if (!g) return '';
  if (g.color) return `<img class="${cls} color px" src="${g.u}" width="${g.w}" height="${g.h}" alt="" draggable="false">`;
  return `<i class="${cls}" style="--m:url(${g.u});width:${g.w}px;height:${g.h}px" aria-hidden="true"></i>`;
};

if (typeof module !== 'undefined') module.exports = { ICONOS };
