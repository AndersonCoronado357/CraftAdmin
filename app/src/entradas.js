// Entrada para los amigos de cada servidor: una copia de WaterdogPE con su propio puerto y su túnel de playit.
// La primera entrada (la carpeta waterdog de la raíz) sirve de plantilla para las demás.
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const PLANTILLA = path.join(P.ROOT, 'waterdog');
const hayPlantilla = () => fs.existsSync(path.join(PLANTILLA, 'Waterdog.jar')) && fs.existsSync(path.join(PLANTILLA, 'config.yml'));

const comillas = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Cambia valores sueltos del config.yml de WaterdogPE sin tocar sus comentarios.
function ajustarConfig(texto, { puerto, puertoServidor, nombre, udp, token }) {
  let t = texto;
  if (puerto) t = t.replace(/^(\s*host:\s*)\S+/m, `$10.0.0.0:${puerto}`);
  if (puertoServidor) {
    t = t.replace(/^(\s*address:\s*)127\.0\.0\.1:\d+/m, `$1127.0.0.1:${puertoServidor}`);
    t = t.replace(/^(\s*public_address:\s*)127\.0\.0\.1:\d+/m, `$1127.0.0.1:${puertoServidor}`);
  }
  if (nombre) for (const k of ['motd', 'sub_motd', 'name']) t = t.replace(new RegExp(`^(\\s*${k}:\\s*).*$`, 'm'), `$1${comillas(nombre)}`);
  if (udp !== undefined) {
    const lista = udp ? `\n    - ${udp}` : ' []';
    // Admite finales de línea de Windows (\r\n), que tienen los config.yml editados en este PC.
    t = t.replace(/^([ \t]*advertise_addresses:)(?:[ \t]*\[\]|(?:\r?\n[ \t]*-[ \t]*\S+)+)/m, `$1${lista}`);
  }
  if (token !== undefined) t = t.replace(/^(\s+token:\s*).*$/m, `$1${token ? comillas(token) : "''"}`);
  return t;
}

function leerConfig(dir) {
  try { return fs.readFileSync(path.join(dir, 'config.yml'), 'utf8'); } catch { return ''; }
}

// Puerto en el que escucha la entrada (el que va en el túnel de playit como puerto local).
function puertoDe(dir) {
  const m = leerConfig(dir).match(/^\s*host:\s*[\d.]+:(\d+)/m);
  return m ? Number(m[1]) : null;
}

function udpDe(dir) {
  const m = leerConfig(dir).match(/advertise_addresses:\s*\n\s*-\s*(\S+)/);
  return m ? m[1] : '';
}

// Crea la entrada de un servidor nuevo copiando la plantilla y poniéndole sus datos.
function crear(R, datos) {
  if (!hayPlantilla()) throw new Error('No encontré WaterdogPE para armar la entrada');
  fs.mkdirSync(path.join(R.WATERDOG, 'nethernet'), { recursive: true });
  for (const f of ['Waterdog.jar', 'lang.ini']) {
    const src = path.join(PLANTILLA, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(R.WATERDOG, f));
  }
  // La misma identidad para todas las entradas: los jugadores ven al mismo operador.
  const id = path.join(PLANTILLA, 'nethernet', 'identity.pem');
  if (fs.existsSync(id)) fs.copyFileSync(id, path.join(R.WATERDOG, 'nethernet', 'identity.pem'));
  const cfg = ajustarConfig(leerConfig(PLANTILLA), { udp: '', token: '', ...datos });
  fs.writeFileSync(path.join(R.WATERDOG, 'config.yml'), cfg);
}

// Cambia la dirección UDP y la clave de playit de una entrada que ya existe.
function actualizar(R, datos) {
  if (!fs.existsSync(path.join(R.WATERDOG, 'config.yml'))) throw new Error('Este servidor todavía no tiene entrada');
  fs.writeFileSync(path.join(R.WATERDOG, 'config.yml'), ajustarConfig(leerConfig(R.WATERDOG), datos));
}

// WaterdogPE guarda su registro de NetherNet (a qué túnel de playit pertenece) y lo reutiliza aunque cambie la
// clave. Al cambiar de túnel se borra ese registro para que se registre de nuevo con la clave nueva; la identidad
// (identity.pem) se queda, así los jugadores que ya entraron no ven avisos nuevos.
function olvidarRegistro(R) {
  const dir = path.join(R.WATERDOG, 'nethernet', 'provider-state');
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch { return; }
  for (const n of nombres) if (/^provider-state.*\.(json|tmp)$/.test(n)) { try { fs.unlinkSync(path.join(dir, n)); } catch {} }
}

module.exports = { hayPlantilla, crear, actualizar, puertoDe, udpDe, ajustarConfig, olvidarRegistro };
