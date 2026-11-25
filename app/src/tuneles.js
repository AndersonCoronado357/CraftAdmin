// Túneles automáticos de playit. Con un agente «autogestionado» (el que crea CraftAdmin al vincular playit),
// la app crea el túnel NetherNet de cada servidor por la API de playit y llena sola la dirección para los amigos,
// la dirección UDP y la clave NetherNet. Un agente viejo de playit (de los que se aprueban en la página) no deja
// crear túneles; con ese todo sigue como antes, a mano. La clave del agente nunca se muestra ni se guarda en otro lado.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const P = require('./paths');

const API = 'https://api.playit.gg';
// Los amigos entran con el dominio del túnel y el puerto de siempre de Bedrock; playit los lleva por NetherNet.
const PUERTO_AMIGOS = 19132;

function claveAgente() {
  try { return (/secret_key\s*=\s*"([^"]+)"/.exec(fs.readFileSync(P.PLAYIT_SECRET, 'utf8')) || [])[1] || null; } catch { return null; }
}

const ERRORES = {
  AgentVersionTooOld: 'El agente de playit todavía no terminó de conectarse',
  NotAllowedWithReadOnly: 'Este agente de playit no deja crear túneles',
  TunnelNotFound: 'Ese túnel ya no existe en playit',
  RequiresVerifiedAccount: 'Tu cuenta de playit necesita verificar el correo',
  InvalidAgentKey: 'La clave del agente de playit no sirve; vuelve a conectar playit',
};
async function pedir(ruta, body = {}) {
  const clave = claveAgente();
  if (!clave) throw new Error('playit todavía no está conectado');
  let r;
  try {
    r = await fetch(API + ruta, {
      method: 'POST',
      headers: { Authorization: `Agent-Key ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('No hay conexión con playit'); }
  const d = await r.json().catch(() => ({}));
  if (r.status !== 200 || d.status !== 'success') {
    const codigo = typeof d.data === 'string' ? d.data : d.data?.type || `HTTP ${r.status}`;
    throw Object.assign(new Error(ERRORES[codigo] || `playit respondió: ${codigo}`), { codigo });
  }
  return d.data;
}

// Si el agente de este PC deja crear túneles (se recuerda por clave para no preguntar cada vez).
let cache = { huella: null, info: null };
async function agente() {
  const clave = claveAgente();
  if (!clave) return null;
  const huella = crypto.createHash('sha256').update(clave).digest('hex');
  if (cache.huella === huella && cache.info) return cache.info;
  const d = await pedir('/v1/agents/rundata');
  cache = { huella, info: { id: d.agent_id, automatico: !!d.permissions?.is_self_managed } };
  return cache.info;
}
// true o false; null si no se pudo preguntar (sin internet o sin vincular).
async function automatico() {
  try { const a = await agente(); return a ? a.automatico : null; } catch { return null; }
}

const puertoLocal = (t) => Number((t.origin?.details?.config_data?.fields || []).find((f) => f.name === 'local_port')?.value);
async function tunelDe(puerto) {
  const yo = await agente();
  const { tunnels } = await pedir('/v1/tunnels/list');
  return (tunnels || []).find((t) => t.tunnel_type === 'nethernet' && t.origin?.details?.agent_id === yo.id && puertoLocal(t) === puerto) || null;
}
// Lo que necesita la entrada de un servidor, cuando playit ya le asignó dirección y clave.
function datosDe(t) {
  const a = (t?.public_allocations || []).find((x) => x.type === 'PortAllocation')?.details;
  if (!a || !a.auto_domain || !a.ip || !a.port || !t.nethernet_token) return null;
  return { direccion: `${a.auto_domain}:${PUERTO_AMIGOS}`, udp: `${a.ip}:${a.port}`, token: t.nethernet_token, id: t.id };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Busca el túnel NetherNet del servidor (por su puerto local) y, si no existe, lo crea. Devuelve sus datos.
// prenderAgente(): para el primer túnel de un agente recién vinculado, que playit exige que esté conectado.
async function asegurar({ nombre, puerto }, prenderAgente) {
  const yo = await agente();
  if (!yo?.automatico) throw new Error('Este agente de playit no deja crear túneles');
  let t = await tunelDe(puerto);
  if (!t) {
    const cuerpo = {
      name: String(nombre || 'Servidor').slice(0, 40),
      protocol: { type: 'tunnel-type', details: 'nethernet' },
      origin: { type: 'agent', data: { agent_id: yo.id, config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: String(puerto) }] } } },
      endpoint: { type: 'region', details: { region: 'global', port: null } },
      enabled: true,
    };
    for (let intento = 0; ; intento++) {
      try { await pedir('/v1/tunnels/create', cuerpo); break; } catch (e) {
        if (e.codigo !== 'AgentVersionTooOld' || intento >= 6) throw e;
        if (prenderAgente) prenderAgente();
        await espera(5000);
      }
    }
  }
  // playit tarda unos segundos en darle dirección y clave a un túnel nuevo.
  for (let i = 0; i < 20; i++) {
    t = await tunelDe(puerto);
    const datos = datosDe(t);
    if (datos) return datos;
    await espera(3000);
  }
  throw new Error('playit no terminó de armar el túnel; intenta de nuevo en un rato');
}

// Borra el túnel de un servidor que se quita (solo los de este agente).
async function borrar(puerto) {
  const t = await tunelDe(puerto).catch(() => null);
  if (t) await pedir('/tunnels/delete', { tunnel_id: t.id });
}

/* ---------- Vincular este PC a playit con un agente que deja crear túneles ---------- */
let vinculando = null;
function correr(args, ms) {
  return new Promise((resolve, reject) => {
    const p = execFile(P.PLAYIT_EXE, args, { cwd: P.PLAYIT_DIR, windowsHide: true, timeout: ms, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (vinculando === p) vinculando = null;
      if (err && !stdout) reject(err); else resolve(String(stdout || ''));
    });
    if (args[1] === 'exchange') vinculando = p;
  });
}
// Se abre playit en el navegador una sola vez para aprobar el agente "CraftAdmin" con tu cuenta.
// Al aprobarlo, su clave queda donde la busca el agente; si había otra, se guarda al lado (.anterior).
async function vincular(alAbrir) {
  cancelar();
  const codigo = (await correr(['claim', 'generate'], 30000)).trim().split(/\s+/).pop();
  if (!/^[0-9a-f]{6,}$/i.test(codigo)) throw new Error('playit no generó el código para conectar');
  const url = ((await correr(['claim', 'url', codigo, '--name', 'CraftAdmin', '--type', 'self-managed'], 30000)).match(/https:\/\/\S+/) || [])[0];
  if (!url) throw new Error('playit no dio el enlace para conectar');
  alAbrir(url);
  const salida = await correr(['claim', 'exchange', codigo, '--wait', '900'], 905000).catch(() => '');
  const clave = salida.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[0-9a-f]{40,128}$/i.test(l)).pop();
  if (!clave) throw new Error('No se completó la conexión con playit');
  fs.mkdirSync(path.dirname(P.PLAYIT_SECRET), { recursive: true });
  if (fs.existsSync(P.PLAYIT_SECRET)) fs.copyFileSync(P.PLAYIT_SECRET, `${P.PLAYIT_SECRET}.anterior`);
  fs.writeFileSync(P.PLAYIT_SECRET, `secret_key = "${clave}"\n`);
  cache = { huella: null, info: null };
  return true;
}
function cancelar() {
  if (vinculando) { try { vinculando.kill(); } catch {} vinculando = null; }
}

module.exports = { automatico, asegurar, borrar, vincular, cancelar, PUERTO_AMIGOS };
