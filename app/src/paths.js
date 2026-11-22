// Rutas de todo lo que administra la app. POSADA_ROOT permite probar con una copia.
const path = require('path');
const fs = require('fs');

// Dónde viven los servidores, copias y datos. En el PC donde se armó la app es la carpeta de al lado
// (la que ya tiene «servidor» o «datos»); quien la descarga usa CraftAdmin dentro de su carpeta de usuario.
const JUNTO = path.resolve(__dirname, '..', '..');
const ROOT = process.env.POSADA_ROOT
  || (['servidor', 'datos', 'servidores'].some((d) => fs.existsSync(path.join(JUNTO, d))) ? JUNTO : path.join(require('os').homedir(), 'CraftAdmin'));
const APPDATA = process.env.APPDATA || '';
const LOCALAPPDATA = process.env.LOCALAPPDATA || '';

// Carpetas com.mojang donde Minecraft guarda mundos y paquetes.
function mojangDirs() {
  const dirs = [];
  const gdk = path.join(APPDATA, 'Minecraft Bedrock', 'Users');
  try {
    for (const u of fs.readdirSync(gdk)) {
      const d = path.join(gdk, u, 'games', 'com.mojang');
      if (fs.existsSync(d)) dirs.push(d);
    }
  } catch {}
  const uwp = path.join(LOCALAPPDATA, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang');
  if (fs.existsSync(uwp)) dirs.push(uwp);
  return dirs;
}

// Rutas de un servidor. El primero vive en la raíz (servidor, backups, datos, waterdog);
// los demás en servidores/<id> con las mismas carpetas adentro.
function rutasServidor(base) {
  const server = path.join(base, 'servidor');
  return {
    ...COMUNES,
    BASE: base,
    SERVER: server,
    SERVER_EXE: path.join(server, 'bedrock_server.exe'),
    PROPS: path.join(server, 'server.properties'),
    ALLOWLIST: path.join(server, 'allowlist.json'),
    PERMISSIONS: path.join(server, 'permissions.json'),
    WORLDS: path.join(server, 'worlds'),
    BACKUPS: path.join(base, 'backups'),
    DATA: path.join(base, 'datos'),
    WATERDOG: path.join(base, 'waterdog'),
  };
}

const COMUNES = {
  ROOT,
  SERVIDORES: path.join(ROOT, 'servidores'),
  APPDATA_DIR: path.join(ROOT, 'datos'),
  DOWNLOADS: path.join(ROOT, 'descargas'),
  TEMP: path.join(ROOT, 'datos', 'temporal'),
  PLAYIT_DIR: path.join(ROOT, 'playit'),
  PLAYIT_EXE: path.join(ROOT, 'playit', 'playit.exe'),
  PLAYIT_SECRET: path.join(LOCALAPPDATA, 'playit_gg', 'playit.toml'),
  TAR: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
  mojangDirs,
};

module.exports = { ...rutasServidor(ROOT), rutasServidor };
