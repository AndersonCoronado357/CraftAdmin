// Ajustes propios de la app (no los del servidor).
const path = require('path');
const P = require('./paths');
const { readJSON, writeJSON } = require('./util');

const DEFAULTS = {
  tema: 'claro',
  abrirAlIniciar: true,
  tunelConServidor: true,
  reiniciarSiCae: true,
  copiaAlAbrir: true,
  copiaCadaHoras: 0,
  copiasGuardar: 10,
  direccionPublica: '',
  // Túnel UDP de playit por donde va el juego con NetherNet (host:puerto).
  udpPublico: '',
  versionServidor: null,
  // Mundo que el servidor crea solo la primera vez que abre (todavía no tiene level.dat).
  mundoNuevo: false,
};

class Settings {
  constructor(file = path.join(P.DATA, 'ajustes.json')) {
    this.file = file;
    this.data = { ...DEFAULTS, ...(readJSON(file, {}) || {}) };
  }
  get() { return { ...this.data }; }
  set(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in DEFAULTS)) continue;
      if (this.data[k] !== v) { this.data[k] = v; changed = true; }
    }
    if (changed) writeJSON(this.file, this.data);
    return this.get();
  }
}

module.exports = { Settings };
