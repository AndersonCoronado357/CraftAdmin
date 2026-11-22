// Instalación y actualización del servidor oficial, conservando mundos y configuración.
const fs = require('fs');
const path = require('path');
const https = require('https');
const P = require('./paths');
const { unzip, tempDir, rmrf } = require('./util');

const LINKS = 'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links';
const KEEP = new Set(['worlds', 'server.properties', 'allowlist.json', 'permissions.json']);

function get(url, { json = false, file = null, onProgress = null, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CraftAdmin' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), { json, file, onProgress, redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`La descarga respondió ${res.statusCode}`)); }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      if (file) {
        const out = fs.createWriteStream(file);
        res.on('data', (c) => { got += c.length; onProgress && onProgress(total ? got / total : 0); });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(file)));
        out.on('error', reject);
      } else {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { try { resolve(json ? JSON.parse(body) : body); } catch (e) { reject(e); } });
      }
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('La descarga tardó demasiado')));
  });
}

async function latest() {
  const data = await get(LINKS, { json: true });
  const link = data?.result?.links?.find((l) => l.downloadType === 'serverBedrockWindows');
  if (!link) throw new Error('No encontré la descarga oficial');
  const version = (link.downloadUrl.match(/bedrock-server-([\d.]+)\.zip/) || [])[1] || null;
  return { version, url: link.downloadUrl };
}

function newer(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function install({ url, version }, onProgress, R = P) {
  fs.mkdirSync(P.DOWNLOADS, { recursive: true });
  const zip = path.join(P.DOWNLOADS, `bedrock-server-${version}.zip`);
  if (!fs.existsSync(zip)) {
    const part = zip + '.parcial';
    await get(url, { file: part, onProgress: (f) => onProgress && onProgress(f * 0.8) });
    fs.renameSync(part, zip);
  }
  onProgress && onProgress(0.82);
  const tmp = tempDir('servidor');
  try {
    await unzip(zip, tmp);
    if (!fs.existsSync(path.join(tmp, 'bedrock_server.exe'))) throw new Error('La descarga no trae el servidor');
    fs.mkdirSync(R.SERVER, { recursive: true });
    const fresh = !fs.existsSync(R.PROPS);
    for (const e of fs.readdirSync(tmp)) {
      if (!fresh && KEEP.has(e)) continue;
      fs.cpSync(path.join(tmp, e), path.join(R.SERVER, e), { recursive: true, force: true });
    }
  } finally {
    rmrf(tmp);
  }
  onProgress && onProgress(1);
  return version;
}

module.exports = { latest, newer, install };
