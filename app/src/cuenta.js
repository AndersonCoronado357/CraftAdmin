// La cuenta de CraftAdmin: se entra con correo y contraseña sin salir de la app,
// o con Google (solo eso abre el navegador). La sesión se guarda cifrada con la protección de Windows.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { safeStorage, shell } = require('electron');
const P = require('./paths');

const BASE = process.env.CRAFTADMIN_CUENTAS || 'https://craftadmin.acmsy.com';
const ARCHIVO_TOKEN = path.join(P.APPDATA_DIR, 'cuenta.dat');
const ARCHIVO_USUARIO = path.join(P.APPDATA_DIR, 'cuenta.json');

function leerToken() {
  try {
    const b = fs.readFileSync(ARCHIVO_TOKEN);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8');
  } catch { return null; }
}
function guardar(token, usuario) {
  if (!token) {
    for (const f of [ARCHIVO_TOKEN, ARCHIVO_USUARIO]) { try { fs.unlinkSync(f); } catch {} }
    return;
  }
  fs.writeFileSync(ARCHIVO_TOKEN, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token));
  if (usuario) fs.writeFileSync(ARCHIVO_USUARIO, JSON.stringify(usuario));
}
function usuarioGuardado() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO_USUARIO, 'utf8')); } catch { return null; }
}

async function pedir(ruta, { method = 'GET', body, token } = {}) {
  let r;
  try {
    r = await fetch(BASE + ruta, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor de cuentas. Revisa tu internet'), { sinConexion: true });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'El servidor de cuentas no respondió bien'), { status: r.status });
  return d;
}

const equipo = () => `${os.hostname()}`.slice(0, 80);

// Cómo está la cuenta al abrir la app: con sesión, sin sesión o sin conexión (se usa lo último que se supo).
async function estado() {
  const token = leerToken();
  if (!token) return { usuario: null };
  try {
    const { usuario } = await pedir('/api/yo', { token });
    fs.writeFileSync(ARCHIVO_USUARIO, JSON.stringify(usuario));
    return { usuario };
  } catch (e) {
    if (e.status === 401) { guardar(null); return { usuario: null }; }
    return { usuario: usuarioGuardado(), sinConexion: true };
  }
}

async function entrar({ email, clave }) {
  const r = await pedir('/api/entrar', { method: 'POST', body: { email, clave, equipo: equipo() } });
  guardar(r.token, r.usuario);
  return r.usuario;
}

async function registrar({ email, clave, nombre }) {
  const r = await pedir('/api/registro', { method: 'POST', body: { email, clave, nombre, equipo: equipo() } });
  guardar(r.token, r.usuario);
  return r.usuario;
}

// Google: se abre el navegador con un «estado» al azar y la app pregunta cada 2 segundos si ya terminó.
let espera = null;
function google(avisar) {
  cancelarGoogle();
  const estadoGoogle = crypto.randomBytes(32).toString('hex');
  shell.openExternal(`${BASE}/auth/google?estado=${estadoGoogle}`);
  const hasta = Date.now() + 10 * 60e3;
  const yo = { cancelado: false };
  espera = yo;
  (async () => {
    while (!yo.cancelado && Date.now() < hasta) {
      await new Promise((r) => setTimeout(r, 2000));
      if (yo.cancelado) return;
      try {
        const r = await pedir(`/api/google/espera?estado=${estadoGoogle}`);
        if (r.listo) { guardar(r.token, r.usuario); avisar({ usuario: r.usuario }); espera = null; return; }
      } catch (e) {
        if (e.status && e.status !== 429) { avisar({ error: e.message }); espera = null; return; }
      }
    }
    if (!yo.cancelado) avisar({ error: 'Se acabó el tiempo para entrar con Google. Intenta de nuevo' });
  })();
  return { esperando: true };
}
function cancelarGoogle() { if (espera) espera.cancelado = true; espera = null; }

async function salir() {
  cancelarGoogle();
  const token = leerToken();
  if (token) await pedir('/api/salir', { method: 'POST', token }).catch(() => {});
  guardar(null);
  return { usuario: null };
}

async function cambiarNombre(nombre) {
  const token = leerToken();
  if (!token) throw new Error('No has iniciado sesión');
  const r = await pedir('/api/yo', { method: 'PATCH', token, body: { nombre } });
  fs.writeFileSync(ARCHIVO_USUARIO, JSON.stringify(r.usuario));
  return r.usuario;
}

// La skin de la cuenta se guarda en el servidor de cuentas y se ve en cualquier PC donde entres.
async function cambiarPiel(png) {
  const token = leerToken();
  if (!token) throw new Error('No has iniciado sesión');
  const r = png
    ? await pedir('/api/yo/piel', { method: 'PUT', token, body: { png: png.toString('base64') } })
    : await pedir('/api/yo/piel', { method: 'DELETE', token });
  fs.writeFileSync(ARCHIVO_USUARIO, JSON.stringify(r.usuario));
  return r.usuario;
}

module.exports = { estado, entrar, registrar, google, cancelarGoogle, salir, cambiarNombre, cambiarPiel, BASE };
