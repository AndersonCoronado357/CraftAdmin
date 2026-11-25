'use strict';
// Cuentas y página de descarga de CraftAdmin (craftadmin.acmsy.com).
// La app entra con correo y contraseña sin salir de ella; con Google abre el navegador solo para eso.
// Las tablas auth_users y auth_logins siguen el formato de acmsy, así acmsy Control muestra los usuarios.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 3000);
const SECRETO = process.env.SESSION_SECRET || 'craftadmin-local';
const SUB = process.env.ACMSY_SUBDOMAIN || 'craftadmin';
const BASE = process.env.PUBLIC_URL || `https://${SUB}.acmsy.com`;
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_SECRETO = process.env.GOOGLE_CLIENT_SECRET || '';
const PUBLICO = path.join(__dirname, 'publico');
const DESCARGAS = path.join(__dirname, 'descargas');

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'app',
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
});

const error = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const resumen = (t) => crypto.createHmac('sha256', SECRETO).update(String(t)).digest('hex');
const correoValido = (e) => typeof e === 'string' && e.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const limpiarNombre = (n) => String(n || '').replace(/[\r\n<>]/g, ' ').trim().slice(0, 80);

// Contraseñas con scrypt y sal propia; se comparan en tiempo constante.
function cifrar(clave) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(clave, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${sal.toString('hex')}$${h.toString('hex')}`;
}
function comprobar(clave, guardada) {
  const [tipo, n, sal, h] = String(guardada || '').split('$');
  if (tipo !== 'scrypt' || !sal || !h) return false;
  const otra = crypto.scryptSync(clave, Buffer.from(sal, 'hex'), 64, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(otra, Buffer.from(h, 'hex'));
}

async function prepararTablas() {
  await db.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    name VARCHAR(80) NULL,
    password_hash VARCHAR(255) NULL,
    google_id VARCHAR(64) NULL UNIQUE,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    login_count INT NOT NULL DEFAULT 0
  ) CHARACTER SET utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS auth_logins (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    method VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id)
  ) CHARACTER SET utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS sesiones (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    equipo VARCHAR(80) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id)
  ) CHARACTER SET utf8mb4`);
  // Entradas con Google a medio camino: la app espera con su «estado» hasta que el navegador termina.
  await db.query(`CREATE TABLE IF NOT EXISTS google_esperas (
    estado CHAR(64) PRIMARY KEY,
    token VARCHAR(64) NULL,
    error VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`);
  // La skin de cada cuenta (PNG de 64x64 o 64x32, como las de Minecraft).
  await db.query(`CREATE TABLE IF NOT EXISTS pieles (
    user_id BIGINT PRIMARY KEY,
    png MEDIUMBLOB NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`);
}

async function abrirSesion(u, metodo, equipo) {
  await db.query('UPDATE auth_users SET last_login_at = NOW(), last_seen_at = NOW(), login_count = login_count + 1 WHERE id = ?', [u.id]);
  await db.query('INSERT INTO auth_logins (user_id, method) VALUES (?, ?)', [u.id, metodo]);
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO sesiones (token_hash, user_id, equipo) VALUES (?, ?, ?)', [resumen(token), u.id, limpiarNombre(equipo) || null]);
  return token;
}

async function usuarioDeSesion(req) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  const [filas] = await db.query(
    'SELECT u.id, u.email, u.name, u.google_id, u.password_hash, s.token_hash FROM sesiones s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ?', [resumen(m[1])]);
  if (!filas.length) return null;
  await db.query('UPDATE sesiones SET last_seen_at = NOW() WHERE token_hash = ?', [filas[0].token_hash]);
  await db.query('UPDATE auth_users SET last_seen_at = NOW() WHERE id = ?', [filas[0].id]);
  return filas[0];
}
const publico = (u, png) => ({ id: String(u.id), email: u.email, nombre: u.name || u.email.split('@')[0], google: !!u.google_id, piel: png ? `data:image/png;base64,${png.toString('base64')}` : null });
// Lo que la app sabe de la cuenta, con su skin.
async function completo(u) {
  const [[p]] = await db.query('SELECT png FROM pieles WHERE user_id = ?', [u.id]);
  return publico(u, p && p.png);
}
// Una skin válida: PNG de 64x64 (o 64x32, las viejas) y no más pesada de lo normal.
function pielDe(b64) {
  if (typeof b64 !== 'string' || !b64 || b64.length > 60000) throw error(400, 'Esa imagen es demasiado pesada para una skin');
  const b = Buffer.from(b64, 'base64');
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') throw error(400, 'Ese archivo no es una imagen PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) throw error(400, `Una skin de Minecraft mide 64x64 y esta imagen mide ${w}x${h}`);
  return b;
}

// Freno a quien prueba muchas contraseñas: 6 fallos seguidos por correo bloquean 10 minutos.
const fallos = new Map();
function frenado(email) {
  const f = fallos.get(email);
  return f && f.n >= 6 && Date.now() - f.t < 10 * 60e3;
}
function fallo(email) {
  const f = fallos.get(email) || { n: 0, t: 0 };
  fallos.set(email, { n: Date.now() - f.t > 10 * 60e3 ? 1 : f.n + 1, t: Date.now() });
}

const rutas = {
  'GET /api/salud': async () => ({ ok: true, google: !!(GOOGLE_ID && GOOGLE_SECRETO) }),

  'POST /api/registro': async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const clave = String(body.clave || '');
    const nombre = limpiarNombre(body.nombre);
    if (!correoValido(email)) throw error(400, 'Ese correo no parece válido');
    if (clave.length < 8) throw error(400, 'La contraseña necesita al menos 8 caracteres');
    if (clave.length > 200) throw error(400, 'La contraseña es demasiado larga');
    const [[existe]] = await db.query('SELECT id, password_hash, google_id FROM auth_users WHERE email = ?', [email]);
    if (existe && existe.password_hash) throw error(409, 'Ya hay una cuenta con ese correo. Entra con tu contraseña');
    if (existe) {
      // La cuenta ya existía por Google: se le agrega la contraseña.
      await db.query('UPDATE auth_users SET password_hash = ?, name = COALESCE(name, ?) WHERE id = ?', [cifrar(clave), nombre || null, existe.id]);
    } else {
      await db.query('INSERT INTO auth_users (email, name, password_hash) VALUES (?, ?, ?)', [email, nombre || null, cifrar(clave)]);
    }
    const [[u]] = await db.query('SELECT id, email, name, google_id FROM auth_users WHERE email = ?', [email]);
    return { token: await abrirSesion(u, 'password', body.equipo), usuario: await completo(u) };
  },

  'POST /api/entrar': async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const clave = String(body.clave || '');
    if (!correoValido(email) || !clave) throw error(400, 'Escribe tu correo y tu contraseña');
    if (frenado(email)) throw error(429, 'Demasiados intentos. Espera unos minutos');
    const [[u]] = await db.query('SELECT id, email, name, google_id, password_hash FROM auth_users WHERE email = ?', [email]);
    if (u && !u.password_hash && u.google_id) throw error(400, 'Esa cuenta entra con Google');
    if (!u || !comprobar(clave, u.password_hash)) { fallo(email); throw error(401, 'El correo o la contraseña no coinciden'); }
    fallos.delete(email);
    return { token: await abrirSesion(u, 'password', body.equipo), usuario: await completo(u) };
  },

  // La app pregunta si ya terminó la entrada con Google que empezó con su «estado».
  'GET /api/google/espera': async ({ query }) => {
    const estado = String(query.get('estado') || '');
    if (!/^[a-f0-9]{64}$/.test(estado)) throw error(400, 'Estado inválido');
    const [[e]] = await db.query('SELECT token, error FROM google_esperas WHERE estado = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [estado]);
    if (!e || (!e.token && !e.error)) return { listo: false };
    await db.query('DELETE FROM google_esperas WHERE estado = ?', [estado]);
    if (e.error) throw error(400, e.error);
    const [[u]] = await db.query('SELECT u.id, u.email, u.name, u.google_id FROM sesiones s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ?', [resumen(e.token)]);
    return { listo: true, token: e.token, usuario: await completo(u) };
  },

  'GET /api/yo': async ({ req }) => {
    const u = await usuarioDeSesion(req);
    if (!u) throw error(401, 'La sesión ya no es válida');
    return { usuario: await completo(u) };
  },

  'PATCH /api/yo': async ({ req, body }) => {
    const u = await usuarioDeSesion(req);
    if (!u) throw error(401, 'La sesión ya no es válida');
    const nombre = limpiarNombre(body.nombre);
    if (nombre) await db.query('UPDATE auth_users SET name = ? WHERE id = ?', [nombre, u.id]);
    return { usuario: await completo({ ...u, name: nombre || u.name }) };
  },

  'PUT /api/yo/piel': async ({ req, body }) => {
    const u = await usuarioDeSesion(req);
    if (!u) throw error(401, 'La sesión ya no es válida');
    const png = pielDe(body.png);
    await db.query('INSERT INTO pieles (user_id, png) VALUES (?, ?) ON DUPLICATE KEY UPDATE png = VALUES(png)', [u.id, png]);
    return { usuario: publico(u, png) };
  },

  'DELETE /api/yo/piel': async ({ req }) => {
    const u = await usuarioDeSesion(req);
    if (!u) throw error(401, 'La sesión ya no es válida');
    await db.query('DELETE FROM pieles WHERE user_id = ?', [u.id]);
    return { usuario: publico(u) };
  },

  'POST /api/salir': async ({ req }) => {
    const u = await usuarioDeSesion(req);
    if (u) await db.query('DELETE FROM sesiones WHERE token_hash = ?', [u.token_hash]);
    return { ok: true };
  },
};

// ---------- Google (solo esta parte usa el navegador) ----------
function paginaGoogle(titulo, texto, bien) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141614;color:#f2f4f2;font-family:'Segoe UI',system-ui,sans-serif}
main{max-width:440px;padding:32px;text-align:center}i{display:block;width:56px;height:56px;margin:0 auto 18px;background:${bien ? '#3f9a2e' : '#a8372c'};box-shadow:inset 0 -6px 0 rgba(0,0,0,.3)}
h1{margin:0 0 8px;font-size:24px}p{margin:0;color:#aab4aa;line-height:1.5}</style></head>
<body><main><i></i><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;
}

async function googleEmpezar(req, res, query) {
  const estado = String(query.get('estado') || '');
  if (!/^[a-f0-9]{64}$/.test(estado)) return enviarHtml(res, 400, paginaGoogle('Algo no cuadra', 'Vuelve a CraftAdmin e intenta entrar con Google otra vez.', false));
  if (!GOOGLE_ID || !GOOGLE_SECRETO) return enviarHtml(res, 503, paginaGoogle('Google no está disponible', 'Por ahora entra con tu correo y contraseña desde CraftAdmin.', false));
  await db.query('INSERT IGNORE INTO google_esperas (estado) VALUES (?)', [estado]);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: GOOGLE_ID, redirect_uri: `${BASE}/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state: estado, prompt: 'select_account' }).toString();
  res.writeHead(302, { Location: u.toString() });
  res.end();
}

async function googleVuelta(req, res, query) {
  const estado = String(query.get('state') || '');
  const code = String(query.get('code') || '');
  const [[espera]] = /^[a-f0-9]{64}$/.test(estado) ? await db.query('SELECT estado FROM google_esperas WHERE estado = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [estado]) : [[null]];
  if (!espera) return enviarHtml(res, 400, paginaGoogle('Se venció la espera', 'Vuelve a CraftAdmin e intenta entrar con Google otra vez.', false));
  const fallar = async (texto) => {
    await db.query('UPDATE google_esperas SET error = ? WHERE estado = ?', [texto, estado]);
    enviarHtml(res, 400, paginaGoogle('No se pudo entrar', `${texto}. Vuelve a CraftAdmin para intentarlo de nuevo.`, false));
  };
  if (!code) return fallar('Google no confirmó la entrada');
  try {
    const t = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_ID, client_secret: GOOGLE_SECRETO, redirect_uri: `${BASE}/auth/google/callback`, grant_type: 'authorization_code' }),
    }).then((r) => r.json());
    if (!t.access_token) return fallar('Google no entregó el acceso');
    const g = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
    const email = String(g.email || '').toLowerCase();
    if (!g.sub || !correoValido(email) || g.email_verified === false) return fallar('Esa cuenta de Google no tiene un correo verificado');
    await db.query(`INSERT INTO auth_users (email, name, google_id, email_verified) VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE google_id = COALESCE(google_id, VALUES(google_id)), email_verified = 1, name = COALESCE(name, VALUES(name))`, [email, limpiarNombre(g.name) || null, String(g.sub)]);
    const [[u]] = await db.query('SELECT id, email, name, google_id FROM auth_users WHERE email = ?', [email]);
    const token = await abrirSesion(u, 'google', 'Google');
    await db.query('UPDATE google_esperas SET token = ? WHERE estado = ?', [token, estado]);
    enviarHtml(res, 200, paginaGoogle('Listo, ya entraste', 'Puedes cerrar esta pestaña y volver a CraftAdmin.', true));
  } catch (e) {
    console.error('google', e);
    fallar('Hubo un problema hablando con Google');
  }
}

// ---------- Página de descarga y archivos ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable' };
function enviarHtml(res, status, html) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); }
function servirArchivo(res, base, rel, extra = {}) {
  const ruta = path.normalize(path.join(base, rel));
  if (!ruta.startsWith(base + path.sep) || !fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) return false;
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(ruta).size, ...extra });
  fs.createReadStream(ruta).pipe(res);
  return true;
}
// La descarga más nueva que haya en la carpeta descargas (instalador o zip).
function ultimaDescarga() {
  try {
    return fs.readdirSync(DESCARGAS).filter((n) => /\.(exe|zip)$/i.test(n))
      .map((n) => ({ n, t: fs.statSync(path.join(DESCARGAS, n)).mtimeMs, s: fs.statSync(path.join(DESCARGAS, n)).size }))
      .sort((a, b) => b.t - a.t)[0] || null;
  } catch { return null; }
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => { datos += c; if (datos.length > 65536) { reject(error(413, 'Demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(datos ? JSON.parse(datos) : {}); } catch { reject(error(400, 'JSON inválido')); } });
    req.on('error', reject);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const camino = url.pathname;
  const responder = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'GET' && camino === '/auth/google') return await googleEmpezar(req, res, url.searchParams);
    if (req.method === 'GET' && camino === '/auth/google/callback') return await googleVuelta(req, res, url.searchParams);
    if (req.method === 'GET' && camino === '/api/descarga') {
      const d = ultimaDescarga();
      return responder(200, d ? { disponible: true, archivo: d.n, tamano: d.s, fecha: d.t } : { disponible: false });
    }
    if (req.method === 'GET' && camino === '/descargar') {
      const d = ultimaDescarga();
      if (d && servirArchivo(res, DESCARGAS, d.n, { 'Content-Disposition': `attachment; filename="${d.n}"` })) return undefined;
      res.writeHead(302, { Location: '/#descargar' });
      return res.end();
    }
    const fn = rutas[`${req.method} ${camino}`];
    if (fn) {
      const body = req.method === 'GET' ? {} : await leerCuerpo(req);
      return responder(200, await fn({ req, body, query: url.searchParams }));
    }
    if (camino.startsWith('/api/')) return responder(404, { error: 'No existe' });
    const archivo = camino === '/' ? 'index.html' : camino.slice(1);
    if (req.method === 'GET' && servirArchivo(res, PUBLICO, archivo, { 'Cache-Control': archivo.endsWith('.html') ? 'no-cache' : 'public, max-age=600' })) return undefined;
    enviarHtml(res, 404, paginaGoogle('Aquí no hay nada', 'Esa página no existe. <a href="/" style="color:#7fdc6f">Volver al inicio</a>.', false));
  } catch (e) {
    if (!e.status) console.error(camino, e);
    responder(e.status || 500, { error: e.status ? e.message : 'Algo falló en el servidor de cuentas' });
  }
});

(async function arrancar() {
  for (let i = 1; ; i++) {
    try { await prepararTablas(); break; } catch (e) {
      if (i >= 30) throw e;
      console.log('Esperando la base de datos…', e.code || e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  setInterval(() => db.query('DELETE FROM google_esperas WHERE created_at < NOW() - INTERVAL 1 HOUR').catch(() => {}), 3600e3);
  servidor.listen(PORT, '0.0.0.0', () => console.log(`CraftAdmin (cuentas y descarga) en el puerto ${PORT}`));
})();
