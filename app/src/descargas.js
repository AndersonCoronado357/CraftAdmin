// Baja lo que la app necesita y la persona no tiene: el programa de playit, Java (para WaterdogPE)
// y WaterdogPE con su configuración de base. Todo gratis y de sus páginas oficiales.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const P = require('./paths');
const entradas = require('./entradas');

const URL_PLAYIT = 'https://github.com/playit-cloud/playit-agent/releases/download/v2.0.2/playit-windows-x86_64-signed.exe';
const URL_WATERDOG = 'https://github.com/WaterdogPE/WaterdogPE/releases/download/latest/Waterdog.jar';
const URL_JAVA = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk';
const JAVA_DIR = path.join(P.ROOT, 'java');
const PLANTILLA_CONFIG = path.join(__dirname, '..', 'plantillas', 'waterdog-config.yml');

// Baja un archivo a «destino» (primero a un .parcial, así nunca queda uno a medias).
async function bajar(url, destino, que, progreso) {
  let r;
  try { r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'CraftAdmin' } }); } catch { throw new Error(`No pude bajar ${que}. Revisa tu internet`); }
  if (!r.ok || !r.body) throw new Error(`No pude bajar ${que} (respuesta ${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.parcial`;
  const out = fs.createWriteStream(tmp);
  let n = 0;
  try {
    for await (const trozo of r.body) {
      n += trozo.length;
      if (!out.write(trozo)) await new Promise((ok) => out.once('drain', ok));
      if (total && progreso) progreso(n / total);
    }
    await new Promise((ok, mal) => out.end((e) => (e ? mal(e) : ok())));
  } catch (e) {
    out.destroy();
    try { fs.unlinkSync(tmp); } catch {}
    throw new Error(`Se cortó la descarga de ${que}. Intenta de nuevo`);
  }
  fs.renameSync(tmp, destino);
}

// Java que bajó la app (si la persona no tenía uno).
function javaPropio() {
  try {
    for (const d of fs.readdirSync(JAVA_DIR)) {
      const exe = path.join(JAVA_DIR, d, 'bin', 'java.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {}
  return null;
}

async function asegurarPlayit(progreso) {
  if (fs.existsSync(P.PLAYIT_EXE)) return false;
  await bajar(URL_PLAYIT, P.PLAYIT_EXE, 'el programa de playit', progreso);
  return true;
}

async function asegurarJava(hayJava, progreso) {
  if (hayJava()) return false;
  const zip = path.join(P.TEMP, 'java.zip');
  await bajar(URL_JAVA, zip, 'Java', (f) => progreso && progreso(f * 0.85));
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  await new Promise((ok, mal) => execFile(P.TAR, ['-xf', zip, '-C', JAVA_DIR], { windowsHide: true }, (e) => (e ? mal(new Error('No pude descomprimir Java')) : ok())));
  try { fs.unlinkSync(zip); } catch {}
  if (progreso) progreso(1);
  if (!javaPropio()) throw new Error('Java se bajó, pero no encontré java.exe adentro');
  return true;
}

// La base de las entradas para amigos: WaterdogPE y su configuración sin claves de nadie.
async function asegurarPlantilla(progreso) {
  if (entradas.hayPlantilla()) return false;
  const dir = path.join(P.ROOT, 'waterdog');
  fs.mkdirSync(path.join(dir, 'nethernet'), { recursive: true });
  if (!fs.existsSync(path.join(dir, 'Waterdog.jar'))) await bajar(URL_WATERDOG, path.join(dir, 'Waterdog.jar'), 'WaterdogPE', progreso);
  fs.copyFileSync(PLANTILLA_CONFIG, path.join(dir, 'config.yml'));
  return true;
}

// Todo lo que falte antes de crear un servidor; «progreso» recibe de 0 a 1 en total.
async function prepararTodo(hayJava, progreso = () => {}, avisar = () => {}) {
  const pasos = [
    ['el programa de playit', (p) => asegurarPlayit(p)],
    ['Java', (p) => asegurarJava(hayJava, p)],
    ['WaterdogPE', (p) => asegurarPlantilla(p)],
  ];
  for (let i = 0; i < pasos.length; i++) {
    const [que, fn] = pasos[i];
    avisar(que);
    await fn((f) => progreso((i + f) / pasos.length));
    progreso((i + 1) / pasos.length);
  }
}

function falta(hayJava) {
  return { playit: !fs.existsSync(P.PLAYIT_EXE), java: !hayJava(), waterdog: !entradas.hayPlantilla() };
}

module.exports = { asegurarPlayit, asegurarJava, asegurarPlantilla, prepararTodo, falta, javaPropio };
