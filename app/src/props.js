// Lectura y escritura de server.properties conservando comentarios y orden.
const fs = require('fs');

function crearProps(P) {
function readLines() {
  try { return fs.readFileSync(P.PROPS, 'utf8').split(/\r?\n/); } catch { return []; }
}

function get() {
  const out = {};
  for (const line of readLines()) {
    if (!line || /^\s*#/.test(line)) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function set(values) {
  const lines = readLines();
  const pending = { ...values };
  const next = lines.map((line) => {
    if (!line || /^\s*#/.test(line)) return line;
    const i = line.indexOf('=');
    if (i <= 0) return line;
    const key = line.slice(0, i).trim();
    if (key in pending) {
      const v = pending[key];
      delete pending[key];
      return `${key}=${v}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(pending)) next.push(`${k}=${v}`);
  fs.writeFileSync(P.PROPS, next.join('\r\n'));
  return get();
}

return { get, set };
}

module.exports = { crearProps };
