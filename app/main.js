// Proceso principal de CraftAdmin: ventana, servidores y puente con la interfaz.
// Puede haber varios servidores abiertos a la vez; la interfaz mira uno (el elegido) y ve el resumen de todos.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const P = require('./src/paths');
const { crearProps } = require('./src/props');
const { crearMundos } = require('./src/worlds');
const { crearCopias } = require('./src/backups');
const updater = require('./src/updater');
const entradas = require('./src/entradas');
const tuneles = require('./src/tuneles');
const { Settings } = require('./src/settings');
const { Players } = require('./src/players');
const { Server } = require('./src/server');
const { Playit } = require('./src/playit');
const { Proxy, findJava } = require('./src/proxy');
const { rmrf, readJSON, writeJSON, safeName } = require('./src/util');
const skins = require('./src/skins');
const cuenta = require('./src/cuenta');
const juego = require('./src/juego');
const descargas = require('./src/descargas');

app.setAppUserModelId('com.ander.craftadmin');
// En pruebas se usa un perfil aparte para poder abrir una copia aunque CraftAdmin esté abierta.
if (process.env.POSADA_TEST) app.setPath('userData', path.join(require('os').tmpdir(), 'posada-prueba'));
else if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

for (const d of [P.APPDATA_DIR, P.SERVIDORES]) fs.mkdirSync(d, { recursive: true });
rmrf(P.TEMP);

let win = null;
let quitting = false;
let busy = null; // tarea larga en curso (copia, importación, actualización, servidor nuevo)
let updateInfo = null;

const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('posada:event', { type, data }); };
const toast = (text, tone = 'info') => send('toast', { text, tone });

/* ------------------------------------------------------------------ */
/* Servidores                                                          */
/* ------------------------------------------------------------------ */
const REGISTRO = path.join(P.APPDATA_DIR, 'servidores.json');

// Lista de servidores: [{ id, base }]. base vacía = la raíz (el servidor que existía antes de tener varios).
function cargarRegistro() {
  const r = readJSON(REGISTRO, null);
  if (r && Array.isArray(r.lista)) return r;
  const lista = fs.existsSync(P.SERVER) ? [{ id: 'principal', base: '' }] : [];
  return { lista, elegido: lista[0]?.id || null };
}
const registro = cargarRegistro();
const guardarRegistro = () => writeJSON(REGISTRO, registro);

class Instancia {
  constructor(meta) {
    this.id = meta.id;
    this.base = meta.base ? path.join(P.ROOT, meta.base) : P.ROOT;
    this.R = P.rutasServidor(this.base);
    for (const d of [this.R.DATA, this.R.BACKUPS]) fs.mkdirSync(d, { recursive: true });
    this.props = crearProps(this.R);
    this.settings = new Settings(path.join(this.R.DATA, 'ajustes.json'));
    this.players = new Players(this.R);
    this.server = new Server(this.players, this.settings, this.R, this.props);
    this.proxy = new Proxy(this.R);
    this.worlds = crearMundos(this.R, this.props);
    this.backups = crearCopias(this.R, this.props);
    this.autoTimer = null;
  }

  nombre() { return this.props.get()['server-name'] || 'Servidor'; }

  // Lo que muestra el selector de servidores; con foto solo cuando se pide la lista completa.
  resumen(conFoto = false) {
    const s = this.server;
    const pr = this.props.get();
    const out = {
      id: this.id,
      nombre: this.nombre(),
      state: s.state,
      installed: s.installed(),
      worldReady: s.worldReady(),
      online: s.online.size,
      max: Number(pr['max-players']) || 10,
      entrada: this.proxy.installed() ? this.proxy.state : 'sin-entrada',
      direccion: this.settings.get().direccionPublica || '',
      puerto: entradas.puertoDe(this.R.WATERDOG),
      modo: pr.gamemode || 'survival',
      dificultad: pr.difficulty || 'normal',
    };
    if (conFoto) out.icon = this.worlds.listServer().find((w) => w.active)?.icon || null;
    return out;
  }

  // Todo lo que muestra la vista previa de la pantalla de servidores, antes de entrar a uno.
  detalle() {
    const s = this.server;
    const pr = this.props.get();
    const w = this.worlds.listServer().find((m) => m.active) || null;
    const gente = this.players.list(s.online, pr['default-player-permission-level'] || 'member');
    const copias = this.backups.list();
    const vistos = gente.filter((p) => !p.blocked && (p.online || p.lastSeen))
      .sort((a, b) => (b.online - a.online) || ((b.lastSeen || 0) - (a.lastSeen || 0)));
    return {
      ...this.resumen(false),
      icon: w?.icon || null,
      direccion: this.settings.get().direccionPublica || (this === actual() ? playit.snapshot().address || '' : ''),
      mundo: w ? w.folder : pr['level-name'] || null,
      mundoTam: w?.size || 0,
      modo: pr.gamemode || 'survival',
      dificultad: pr.difficulty || 'normal',
      version: s.version || this.settings.get().versionServidor || null,
      startedAt: s.state === 'abierto' ? s.startedAt : null,
      stats: s.state === 'abierto' ? s.stats : null,
      lastError: s.lastError || null,
      puertoServidor: Number(pr['server-port']) || null,
      amigos: gente.filter((p) => p.access && !p.blocked).length,
      copias: copias.length,
      ultimaCopia: copias[0]?.date || null,
      ultimaPartida: vistos.reduce((m, p) => Math.max(m, p.online ? Date.now() : p.lastSeen || 0), 0) || null,
      jugadores: vistos.slice(0, 12).map((p) => ({ name: p.name, online: p.online, since: p.since, lastSeen: p.lastSeen })),
    };
  }
}

const servidores = new Map();
const actual = () => servidores.get(registro.elegido) || servidores.values().next().value || null;
const ninguno = () => { throw new Error('Todavía no hay ningún servidor. Crea uno primero.'); };
const I = () => actual() || ninguno();

// Un solo agente de playit para todos los túneles; la dirección que se muestra es la del servidor elegido.
const playit = new Playit({
  direccion: () => actual()?.settings.get().direccionPublica || '',
  guardar: (v) => { if (servidores.size === 1) actual()?.settings.set({ direccionPublica: v }); },
});

function resumenes(conFoto = false) { return [...servidores.values()].map((x) => x.resumen(conFoto)); }
let resumenT = null;
// Avisa a la interfaz cómo están todos los servidores (agrupado para no mandar de más).
function enviarResumen() {
  clearTimeout(resumenT);
  resumenT = setTimeout(() => send('servidores', { lista: resumenes(), elegido: registro.elegido }), 120);
}

function playersPayload(x = actual()) {
  if (!x) return { list: [], sessions: [], daily: [], allowlistOn: false };
  return {
    list: x.players.list(x.server.online, x.props.get()['default-player-permission-level'] || 'member'),
    sessions: x.players.sessions(400),
    daily: x.players.daily(14),
    allowlistOn: x.props.get()['allow-list'] === 'true',
  };
}

function snapshot() {
  const x = actual();
  return {
    servidores: { lista: resumenes(true), elegido: x ? x.id : null },
    server: x ? x.server.snapshot() : { state: 'apagado', installed: false, worldReady: false, online: [], stats: null },
    playit: playit.snapshot(),
    proxy: x ? x.proxy.snapshot() : { installed: false, state: 'apagado' },
    settings: x ? x.settings.get() : new Settings(path.join(P.TEMP, 'vacio.json')).get(),
    props: x ? x.props.get() : {},
    players: playersPayload(x),
    worlds: x ? x.worlds.listServer() : [],
    backups: x ? x.backups.list() : [],
    lines: x ? x.server.lines.slice(-800) : [],
    busy,
    update: updateInfo,
    paths: { root: P.ROOT, server: x ? x.R.SERVER : P.SERVER, backups: x ? x.R.BACKUPS : P.BACKUPS },
  };
}

async function withBusy(label, fn) {
  if (busy) throw new Error(`Espera: ${busy.label.toLowerCase()}`);
  busy = { label, progress: null };
  send('busy', busy);
  try {
    return await fn((progress) => { busy.progress = progress; send('busy', busy); });
  } finally {
    busy = null;
    send('busy', null);
  }
}

async function makeBackup(x, type) {
  const b = await x.backups.create(x.server, type);
  const gone = x.backups.prune(x.settings.get().copiasGuardar);
  if (x === actual()) send('backups', x.backups.list());
  return { backup: b, pruned: gone.length };
}

function scheduleAuto(x) {
  clearInterval(x.autoTimer);
  const h = Number(x.settings.get().copiaCadaHoras) || 0;
  if (!h) return;
  x.autoTimer = setInterval(async () => {
    if (x.server.state !== 'abierto' || busy) return;
    try {
      await withBusy(`Haciendo copia automática de ${x.nombre()}`, () => makeBackup(x, 'auto'));
      toast(`Copia automática de ${x.nombre()} lista`);
    } catch (e) { toast(e.message, 'error'); }
  }, h * 3600 * 1000);
}

// Con NetherNet el servidor anuncia a los jugadores la IP y el puerto UDP públicos del túnel de playit.
// Se resuelve el nombre en cada arranque por si playit cambia la IP.
async function announceUdp(x) {
  const udp = String(x.settings.get().udpPublico || '').trim();
  const p = x.props.get();
  if (!udp || p.transport !== 'nethernet') return;
  const [host, port] = udp.split(':');
  if (!host || !port) return;
  try {
    const { address } = await require('dns').promises.lookup(host, { family: 4 });
    const value = `${address}:${port}:${p['server-port'] || 19132}`;
    if (p['server-udp-ports'] !== value) {
      x.props.set({ 'server-udp-ports': value });
      x.server.push(`Dirección UDP pública para NetherNet: ${value}`, 'APP', 'app');
    }
  } catch (e) {
    x.server.push(`No pude resolver ${host}; se usa la dirección guardada (${p['server-udp-ports'] || 'ninguna'})`, 'WARN', 'app');
  }
}

const algunoAbierto = () => [...servidores.values()].some((x) => x.server.proc);

// Eventos de cada servidor hacia la interfaz: los del elegido van completos; de los demás, el resumen.
function conectar(x) {
  const es = () => x === actual();
  x.server.on('state', (s) => { if (es()) send('server', s); enviarResumen(); });
  x.server.on('line', (l) => { if (es()) send('line', l); });
  x.server.on('stats', () => { if (es()) send('server', x.server.snapshot()); });
  x.server.on('players', (ev) => {
    if (es()) send('players', playersPayload(x));
    enviarResumen();
    const varios = servidores.size > 1;
    if (ev.type === 'join') toast(`${ev.name} entró ${varios ? `a ${x.nombre()}` : 'al servidor'}`);
    if (ev.type === 'leave') toast(`${ev.name} salió ${varios ? `de ${x.nombre()}` : 'del servidor'}`);
    // Al aparecer en el mundo se le pone el rol que tiene guardado.
    if (ev.type === 'spawn') {
      const role = x.players.roleOf(ev.name);
      if (role) x.server.send(`permission set "${ev.name}" ${role}`, true);
    }
  });
  x.server.on('exit', ({ requested }) => {
    if (x.proxy.proc) x.proxy.stop();
    // El túnel se apaga solo cuando ya no queda ningún servidor abierto.
    if (x.settings.get().tunelConServidor && playit.proc && !algunoAbierto()) playit.stop();
    if (!requested && !quitting) toast(`${x.nombre()} se cerró solo`, 'error');
    enviarResumen();
  });
  // La entrada para los amigos (WaterdogPE) se abre cuando el servidor ya aceptó conexiones.
  x.server.on('started', () => { if (x.proxy.installed()) x.proxy.start(); });
  x.proxy.on('change', (s) => {
    if (es()) send('proxy', s);
    enviarResumen();
    if (s.state === 'listo') {
      x.server.push('La entrada para tus amigos está lista (playit + WaterdogPE)', 'APP', 'app');
      toast(servidores.size > 1 ? `Listo: ya pueden entrar a ${x.nombre()}` : 'Listo: tus amigos ya pueden entrar');
    }
    if (s.state === 'error') x.server.push(`WaterdogPE: ${s.lastError}`, 'ERROR', 'app');
  });
  scheduleAuto(x);
}

function agregar(meta) {
  const x = new Instancia(meta);
  servidores.set(x.id, x);
  conectar(x);
  return x;
}
for (const meta of registro.lista) agregar(meta);
if (registro.elegido && !servidores.has(registro.elegido)) registro.elegido = registro.lista[0]?.id || null;

playit.on('change', (s) => send('playit', s));
// Al abrir la app se pregunta una vez si el agente de playit deja crear túneles.
if (playit.linked()) tuneles.automatico().then((v) => { playit.automatico = v; send('playit', playit.snapshot()); });

// Con un agente que deja crear túneles, cada servidor tiene el suyo y su entrada se llena sola:
// dirección para los amigos, dirección UDP y clave NetherNet.
async function autoTunel(x) {
  if (!playit.automatico) return false;
  const puerto = entradas.puertoDe(x.R.WATERDOG);
  if (!puerto) return false;
  const t = await tuneles.asegurar({ nombre: x.nombre(), puerto }, () => { if (!playit.proc) { try { playit.start(); } catch {} } });
  const otraClave = x.proxy.token() !== t.token;
  if (entradas.udpDe(x.R.WATERDOG) !== t.udp || otraClave) {
    // Con la entrada abierta, se cierra para cambiarle el túnel y se vuelve a abrir.
    const abierta = !!x.proxy.proc;
    if (abierta) await x.proxy.stop();
    entradas.actualizar(x.R, { udp: t.udp, token: t.token });
    if (otraClave) entradas.olvidarRegistro(x.R);
    if (abierta) x.proxy.start();
  }
  const s = x.settings.get();
  if (s.direccionPublica !== t.direccion || s.udpPublico !== t.udp) x.settings.set({ direccionPublica: t.direccion, udpPublico: t.udp });
  if (x === actual()) { send('settings', x.settings.get()); send('proxy', x.proxy.snapshot()); send('playit', playit.snapshot()); }
  enviarResumen();
  return true;
}

// Conectar playit: se abre su página una sola vez para aprobar el agente "CraftAdmin" y desde ahí
// la app crea sola el túnel de cada servidor.
async function vincularPlayit() {
  try {
    await tuneles.vincular((url) => { playit.vinculo = url; playit.lastError = null; send('playit', playit.snapshot()); shell.openExternal(url); });
  } catch (e) {
    playit.vinculo = null;
    playit.lastError = e.message;
    send('playit', playit.snapshot());
    toast(e.message, 'error');
    return false;
  }
  playit.vinculo = null;
  playit.automatico = true;
  await playit.stop();
  try { playit.start(); } catch (e) { toast(e.message, 'error'); }
  toast('playit quedó conectado: el túnel de cada servidor se arma solo');
  for (const x of servidores.values()) {
    try { await autoTunel(x); } catch (e) { x.server.push(`playit: ${e.message}`, 'WARN', 'app'); }
  }
  return true;
}
playit.on('restarting', () => actual()?.server.push('La red del PC cambió; reconectando playit', 'WARN', 'app'));
playit.on('claim', (url) => shell.openExternal(url));

/* ------------------------------------------------------------------ */
/* Servidor nuevo                                                      */
/* ------------------------------------------------------------------ */
// Puertos libres: el del servidor de Bedrock (de 10 en 10 desde 19142) y el de su entrada (de 2 en 2 desde 19134).
function puertosLibres() {
  const usados = new Set();
  for (const x of servidores.values()) {
    const p = x.props.get();
    for (const k of ['server-port', 'server-portv6']) if (p[k]) usados.add(Number(p[k]));
    const e = entradas.puertoDe(x.R.WATERDOG);
    if (e) usados.add(e);
  }
  let servidor = 19142;
  while (usados.has(servidor) || usados.has(servidor + 1)) servidor += 10;
  let entrada = 19134;
  while (usados.has(entrada) || usados.has(entrada + 1)) entrada += 2;
  return { servidor, entrada };
}

function idNuevo(nombre) {
  const base = safeName(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'servidor';
  let id = base;
  for (let n = 2; servidores.has(id) || fs.existsSync(path.join(P.SERVIDORES, id)); n++) id = `${base}-${n}`;
  return id;
}

const NO_COPIAR = new Set(['worlds', 'server.properties', 'allowlist.json', 'permissions.json', 'packet-statistics.txt']);

async function crearServidor(o, progress) {
  const nombre = String(o.nombre || '').replace(/[\r\n]/g, ' ').trim();
  if (!nombre) throw new Error('Ponle un nombre al servidor');
  const id = idNuevo(nombre);
  const meta = { id, base: path.join('servidores', id) };
  const R = P.rutasServidor(path.join(P.ROOT, meta.base));
  const puertos = puertosLibres();
  fs.mkdirSync(R.SERVER, { recursive: true });
  try {
    // 1. El programa del servidor: se copia de otro servidor de este PC o se baja el oficial.
    progress(0.05);
    const fuente = [...servidores.values()].find((x) => x.server.installed());
    if (fuente) {
      for (const e of fs.readdirSync(fuente.R.SERVER)) {
        if (NO_COPIAR.has(e) || /\.log$/i.test(e)) continue;
        await fs.promises.cp(path.join(fuente.R.SERVER, e), path.join(R.SERVER, e), { recursive: true });
      }
      fs.writeFileSync(R.PROPS, fs.readFileSync(fuente.R.PROPS, 'utf8'));
    } else {
      if (!o.aceptoEula) throw new Error('Para bajar el servidor oficial tienes que aceptar la licencia de Minecraft');
      const l = await updater.latest();
      await updater.install(l, (f) => progress(0.05 + f * 0.55), R);
    }
    progress(0.62);
    fs.writeFileSync(R.ALLOWLIST, '[]');
    fs.writeFileSync(R.PERMISSIONS, '[]');

    // 2. Su configuración: nombre, modo, dificultad y puertos propios.
    const x = new Instancia(meta);
    const conEntrada = entradas.hayPlantilla();
    x.props.set({
      'server-name': nombre,
      gamemode: o.modo || 'survival',
      difficulty: o.dificultad || 'normal',
      'server-port': puertos.servidor,
      'server-portv6': puertos.servidor + 1,
      'server-udp-ports': '',
      'allow-list': o.soloLista ? 'true' : 'false',
      'online-mode': conEntrada ? 'false' : 'true',
      'max-players': Math.max(1, Math.min(100, Math.round(Number(o.maxJugadores) || 10))),
      'default-player-permission-level': ['visitor', 'member', 'operator'].includes(o.permiso) ? o.permiso : 'member',
    });

    // 3. El mundo.
    progress(0.68);
    const m = o.mundo || { tipo: 'nuevo' };
    if (m.tipo === 'nuevo') {
      x.props.set({
        'level-name': safeName(nombre),
        'level-seed': String(m.semilla || '').trim(),
        'level-type': m.tipoMundo === 'FLAT' ? 'FLAT' : 'DEFAULT',
        'allow-cheats': m.trucos ? 'true' : 'false',
      });
      x.settings.set({ mundoNuevo: true });
    } else {
      // Si el mundo es de otro servidor que está abierto, se copia desde una copia en caliente para que salga entero.
      const origen = m.tipo === 'copiar' ? [...servidores.values()].find((s) => path.resolve(m.ruta).startsWith(path.resolve(s.R.WORLDS) + path.sep)) : null;
      let r;
      if (origen && origen.server.proc) {
        const copia = await origen.backups.create(origen.server, 'manual');
        if (origen === actual()) send('backups', origen.backups.list());
        r = await x.worlds.importFile(copia.file);
      } else r = m.tipo === 'archivo' ? await x.worlds.importFile(m.ruta) : await x.worlds.importFolder(m.ruta);
      x.worlds.activate(r.folder);
    }

    // 4. La entrada para los amigos y la dirección de playit.
    progress(0.86);
    const en = o.entrada || {};
    const udp = String(en.udp || '').trim();
    if (conEntrada) entradas.crear(R, { puerto: puertos.entrada, puertoServidor: puertos.servidor, nombre, udp, token: String(en.token || '').trim() });
    x.settings.set({
      direccionPublica: String(en.direccion || '').trim(),
      udpPublico: udp,
      abrirAlIniciar: false,
      versionServidor: fuente ? fuente.server.version : x.settings.get().versionServidor,
    });
    x.server.version = x.settings.get().versionServidor;
    if (conEntrada && playit.automatico) {
      progress(0.9);
      try { await autoTunel(x); } catch (e) { x.server.push(`No se pudo armar el túnel de playit: ${e.message}`, 'WARN', 'app'); }
    }

    // 5. Queda en la lista y pasa a ser el elegido.
    servidores.set(id, x);
    conectar(x);
    registro.lista.push(meta);
    registro.elegido = id;
    guardarRegistro();
    progress(1);
    return { id, puerto: puertos.entrada };
  } catch (e) {
    try { await shell.trashItem(path.join(P.ROOT, meta.base)); } catch { rmrf(path.join(P.ROOT, meta.base)); }
    throw e;
  }
}

// Abre un servidor (el elegido o cualquiera de la lista) con su copia previa y el túnel.
async function abrir(x) {
  if (x.server.state !== 'apagado') return;
  if (playit.automatico === null && playit.linked()) playit.automatico = await tuneles.automatico();
  if (playit.automatico) {
    try { await autoTunel(x); } catch (e) { x.server.push(`playit: ${e.message}`, 'WARN', 'app'); }
  }
  await announceUdp(x);
  if (x.settings.get().copiaAlAbrir && x.server.worldReady() && !x.settings.get().mundoNuevo) {
    try { await withBusy(`Haciendo copia de ${x.nombre()} antes de abrir`, () => makeBackup(x, 'auto')); }
    catch (e) { toast(`No se pudo hacer la copia previa: ${e.message}`, 'error'); }
  }
  x.server.start();
  if (x.settings.get().mundoNuevo) {
    // El mundo nuevo queda creado en cuanto el servidor termina de abrir.
    x.server.once('started', () => { x.settings.set({ mundoNuevo: false }); if (x === actual()) send('worlds', x.worlds.listServer()); });
  }
  if (x.settings.get().tunelConServidor && playit.installed() && playit.linked()) {
    try { playit.start(); } catch (e) { toast(e.message, 'error'); }
  }
}

/* ------------------------------------------------------------------ */
/* API para la interfaz                                                */
/* ------------------------------------------------------------------ */
const api = {
  // Cuenta de CraftAdmin
  'cuenta.estado': () => cuenta.estado(),
  'cuenta.entrar': (o) => cuenta.entrar(o || {}),
  'cuenta.registrar': (o) => cuenta.registrar(o || {}),
  'cuenta.google': () => cuenta.google((r) => send('cuenta', r)),
  'cuenta.cancelarGoogle': () => cuenta.cancelarGoogle(),
  'cuenta.salir': () => cuenta.salir(),
  'cuenta.nombre': (n) => cuenta.cambiarNombre(n),
  'cuenta.pielJuego': () => { const b = skins.skinDelJuego(); return b ? `data:image/png;base64,${b.toString('base64')}` : null; },
  'cuenta.piel': async (de) => {
    let png;
    if (de === 'juego') {
      png = skins.skinDelJuego();
      if (!png) throw new Error('En Minecraft no tienes puesta una skin propia');
    } else {
      const res = await dialog.showOpenDialog(win, {
        title: 'Elige tu skin',
        defaultPath: app.getPath('downloads'),
        filters: [{ name: 'Skin de Minecraft (PNG)', extensions: ['png'] }],
        properties: ['openFile'],
      });
      if (res.canceled || !res.filePaths[0]) return null;
      png = skins.leerSkin(res.filePaths[0]);
    }
    return cuenta.cambiarPiel(png);
  },
  'cuenta.quitarPiel': () => cuenta.cambiarPiel(null),
  snapshot: () => snapshot(),

  // Servidores
  'servers.list': () => ({ lista: resumenes(true), elegido: registro.elegido }),
  'servers.detail': (id) => { const x = servidores.get(id); if (!x) throw new Error('Ese servidor ya no existe'); return x.detalle(); },
  // Las últimas visitas de todos los servidores juntos (la más nueva primero) y lo jugado cada día de esta semana.
  'servers.activity': () => {
    const todos = [...servidores.values()];
    const visitas = todos
      .flatMap((x) => x.players.sessions(40).map((v) => ({ servidor: x.id, nombre: x.nombre(), name: v.name, start: v.start, end: v.end, dentro: !v.end && x.server.online.has(String(v.name).toLowerCase()) })))
      .sort((a, b) => b.start - a.start).slice(0, 40)
      // Si la app se cerró de golpe pueden quedar visitas sin cerrar: solo la más nueva de cada jugador cuenta como «jugando».
      .map((v, i, l) => (v.dentro && l.findIndex((o) => o.servidor === v.servidor && o.name.toLowerCase() === v.name.toLowerCase()) !== i ? { ...v, dentro: false } : v));
    const dias = [];
    for (const x of todos) {
      x.players.daily(7).forEach((d, i) => {
        dias[i] ||= { day: d.day, ms: 0, people: 0 };
        dias[i].ms += d.ms;
        dias[i].people += d.people;
      });
    }
    return { visitas, dias };
  },
  'servers.folder': (id) => { const x = servidores.get(id); if (!x) throw new Error('Ese servidor ya no existe'); return shell.openPath(x.base); },
  'servers.select': (id) => {
    if (!servidores.has(id)) throw new Error('Ese servidor ya no existe');
    registro.elegido = id;
    guardarRegistro();
    return snapshot();
  },
  'servers.create': async (o) => {
    // Primero se baja lo que falte en este PC (playit, Java, WaterdogPE); a quien ya lo tiene no le toma nada.
    const f = descargas.falta(() => !!findJava());
    if (f.playit || f.java || f.waterdog) await withBusy('Bajando lo necesario', (progress) => descargas.prepararTodo(() => !!findJava(), progress));
    return withBusy('Creando el servidor', (progress) => crearServidor(o || {}, progress));
  },
  // Abrir o cerrar cualquier servidor sin tener que elegirlo.
  'servers.start': (id) => { const x = servidores.get(id); if (!x) throw new Error('Ese servidor ya no existe'); return abrir(x); },
  'servers.stop': (id) => { const x = servidores.get(id); if (!x) throw new Error('Ese servidor ya no existe'); return x.server.stop(); },
  'servers.remove': (id) => withBusy('Quitando el servidor', async () => {
    const x = servidores.get(id);
    if (!x) throw new Error('Ese servidor ya no existe');
    if (!registro.lista.find((m) => m.id === id)?.base) throw new Error('El primer servidor no se puede quitar desde aquí');
    if (x.server.proc) throw new Error('Cierra el servidor antes de quitarlo');
    clearInterval(x.autoTimer);
    const puertoEntrada = entradas.puertoDe(x.R.WATERDOG);
    if (playit.automatico && puertoEntrada) await tuneles.borrar(puertoEntrada).catch(() => {});
    await shell.trashItem(x.base);
    servidores.delete(id);
    registro.lista = registro.lista.filter((m) => m.id !== id);
    if (registro.elegido === id) registro.elegido = registro.lista[0]?.id || null;
    guardarRegistro();
    return snapshot();
  }),
  // Lo que el asistente necesita saber de este PC.
  'setup.estado': () => ({
    java: !!findJava(),
    // La entrada siempre se puede armar: lo que falte (WaterdogPE, Java, playit) se baja al crear el servidor.
    plantillaEntrada: true,
    faltan: Object.entries(descargas.falta(() => !!findJava())).filter(([, v]) => v).map(([k]) => ({ playit: 'playit', java: 'Java', waterdog: 'WaterdogPE' })[k]),
    servidorLocal: [...servidores.values()].some((x) => x.server.installed()),
    playit: { installed: playit.installed(), linked: playit.linked(), automatico: playit.automatico },
    puertos: puertosLibres(),
    otros: [...servidores.values()].map((x) => {
      const w = x.worlds.listServer().find((v) => v.active);
      return w ? { id: x.id, nombre: x.nombre(), mundo: w.folder, ruta: path.join(x.R.WORLDS, w.folder), icon: w.icon } : null;
    }).filter(Boolean),
  }),
  'setup.elegirArchivo': async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Elige un mundo para el servidor nuevo',
      filters: [{ name: 'Mundos de Minecraft', extensions: ['mcworld', 'zip'] }],
      properties: ['openFile'],
    });
    return res.canceled ? null : res.filePaths[0] || null;
  },
  // Entrada para los amigos del servidor elegido: dirección UDP y clave de playit.
  'entrada.set': (datos) => {
    const x = I();
    const udp = String(datos?.udp ?? '').trim();
    const token = String(datos?.token ?? '').trim();
    if (fs.existsSync(path.join(x.R.WATERDOG, 'config.yml'))) {
      const otraClave = token && token !== x.proxy.token();
      entradas.actualizar(x.R, { udp, ...(token ? { token } : {}) });
      if (otraClave) entradas.olvidarRegistro(x.R);
    } else entradas.crear(x.R, { puerto: puertosLibres().entrada, puertoServidor: Number(x.props.get()['server-port']) || 19142, nombre: x.nombre(), udp, token });
    x.settings.set({ udpPublico: udp });
    send('proxy', x.proxy.snapshot());
    send('settings', x.settings.get());
    enviarResumen();
    return api['entrada.info']();
  },
  'entrada.info': () => {
    const x = actual();
    if (!x) return null;
    return { puerto: entradas.puertoDe(x.R.WATERDOG), udp: entradas.udpDe(x.R.WATERDOG), conClave: !!x.proxy.token(), existe: fs.existsSync(path.join(x.R.WATERDOG, 'config.yml')) };
  },

  // Servidor elegido
  'server.start': () => abrir(I()),
  'server.stop': () => I().server.stop(),
  'server.restart': () => I().server.restart(),
  'server.send': (cmd) => I().server.send(cmd),

  // Jugadores
  'players.add': (name) => {
    const x = I();
    const added = x.players.addAccess(name);
    if (x.server.proc) x.server.send('allowlist reload', true);
    send('players', playersPayload(x));
    return added;
  },
  'players.remove': (name) => {
    const x = I();
    x.players.removeAccess(name);
    if (x.server.proc) {
      x.server.send('allowlist reload', true);
      if (x.server.online.has(name.toLowerCase())) x.server.send(`kick "${name}" Ya no tienes acceso`, true);
    }
    send('players', playersPayload(x));
  },
  'players.role': (name, role) => {
    const x = I();
    x.players.setRole(name, role);
    if (x.server.proc && x.server.online.has(name.toLowerCase())) x.server.send(`permission set "${name}" ${role}`, true);
    send('players', playersPayload(x));
  },
  'players.kick': (name, reason) => {
    I().server.send(`kick "${name}" ${reason || 'Te sacaron del servidor'}`, true);
  },
  'players.block': (name) => {
    const x = I();
    x.players.block(name);
    if (x.server.proc) {
      x.server.send('allowlist reload', true);
      if (x.server.online.has(name.toLowerCase())) x.server.send(`kick "${name}" No tienes acceso a este servidor`, true);
    }
    send('players', playersPayload(x));
  },
  'players.unblock': (name) => { const x = I(); x.players.unblock(name); send('players', playersPayload(x)); },
  'players.allowlist': (on) => {
    const x = I();
    if (on && x.proxy.installed()) throw new Error('Con la entrada de playit (WaterdogPE) la lista cerrada no funciona. Para sacar a alguien usa Bloquear.');
    x.props.set({ 'allow-list': on ? 'true' : 'false' });
    if (x.server.proc) x.server.send(on ? 'allowlist on' : 'allowlist off', true);
    send('props', x.props.get());
    send('players', playersPayload(x));
  },
  'players.message': (text) => I().server.send(`say ${text}`),

  // Skins personalizadas (solo se ven en CraftAdmin, sirven para todos los servidores)
  'skins.list': () => skins.listarSkins(),
  'skins.set': async (name) => {
    const res = await dialog.showOpenDialog(win, {
      title: `Elige la skin de ${name}`,
      defaultPath: app.getPath('downloads'),
      filters: [{ name: 'Skin de Minecraft (PNG)', extensions: ['png'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return false;
    skins.ponerSkin(name, res.filePaths[0]);
    send('skins', skins.listarSkins());
    return true;
  },
  'skins.remove': (name) => { skins.quitarSkin(name); send('skins', skins.listarSkins()); },

  // Mundos
  'worlds.list': () => I().worlds.listServer(),
  'worlds.minecraft': () => (actual() ? actual().worlds.listMinecraft() : crearMundos(P, crearProps(P)).listMinecraft()),
  'worlds.importFolder': (src) => withBusy('Trayendo el mundo', async () => {
    const x = I();
    const r = await x.worlds.importFolder(src);
    send('worlds', x.worlds.listServer());
    return r;
  }),
  'worlds.importFile': async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Elige un mundo para importar',
      filters: [{ name: 'Mundos de Minecraft', extensions: ['mcworld', 'zip'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return withBusy('Importando el mundo', async () => {
      const x = I();
      const r = await x.worlds.importFile(res.filePaths[0]);
      send('worlds', x.worlds.listServer());
      return r;
    });
  },
  'worlds.activate': (folder) => {
    const x = I();
    if (x.server.state !== 'apagado') throw new Error('Cierra el servidor para cambiar de mundo');
    x.worlds.activate(folder);
    x.settings.set({ mundoNuevo: false });
    send('worlds', x.worlds.listServer());
    send('server', x.server.snapshot());
    send('props', x.props.get());
    enviarResumen();
  },
  'worlds.rename': (folder, name) => {
    const x = I();
    if (x.server.state !== 'apagado') throw new Error('Cierra el servidor para renombrar el mundo');
    const r = x.worlds.rename(folder, name);
    send('worlds', x.worlds.listServer());
    send('server', x.server.snapshot());
    return r;
  },
  'worlds.export': async (folder) => {
    const x = I();
    const w = x.worlds.listServer().find((v) => v.folder === folder);
    const res = await dialog.showSaveDialog(win, {
      title: 'Guardar el mundo como .mcworld',
      defaultPath: path.join(app.getPath('downloads'), `${w ? w.name : folder}.mcworld`),
      filters: [{ name: 'Mundo de Minecraft', extensions: ['mcworld'] }],
    });
    if (res.canceled || !res.filePath) return null;
    if (x.server.state !== 'apagado' && x.props.get()['level-name'] === folder) throw new Error('Cierra el servidor para exportar el mundo activo');
    return withBusy('Exportando el mundo', async () => {
      await x.worlds.exportWorld(folder, res.filePath);
      shell.showItemInFolder(res.filePath);
      return res.filePath;
    });
  },
  'worlds.remove': (folder) => withBusy('Guardando una copia y quitando el mundo', async () => {
    const x = I();
    if (x.props.get()['level-name'] === folder && x.server.state !== 'apagado') throw new Error('Cierra el servidor para quitar el mundo activo');
    const dir = path.join(x.R.WORLDS, folder);
    await x.backups.cold(folder, 'antes de borrar');
    await shell.trashItem(dir);
    send('backups', x.backups.list());
    send('worlds', x.worlds.listServer());
    send('server', x.server.snapshot());
  }),
  'worlds.open': (folder) => shell.openPath(folder ? path.join(I().R.WORLDS, folder) : I().R.WORLDS),

  // Copias
  'backups.list': () => I().backups.list(),
  'backups.create': () => withBusy('Haciendo la copia', () => makeBackup(I(), 'manual')),
  'backups.restore': (file) => withBusy('Restaurando la copia', async () => {
    const x = I();
    const world = await x.backups.restore(file, x.server);
    send('backups', x.backups.list());
    send('worlds', x.worlds.listServer());
    send('server', x.server.snapshot());
    return world;
  }),
  'backups.remove': async (file) => {
    const x = I();
    if (path.dirname(path.resolve(file)) !== path.resolve(x.R.BACKUPS)) throw new Error('Esa copia no está en la carpeta de copias');
    await shell.trashItem(file);
    send('backups', x.backups.list());
  },
  'backups.show': (file) => (file ? shell.showItemInFolder(file) : shell.openPath(I().R.BACKUPS)),

  // Ajustes
  'props.set': (values) => {
    const x = I();
    const allowed = ['server-name', 'gamemode', 'difficulty', 'allow-cheats', 'max-players', 'view-distance', 'tick-distance', 'player-idle-timeout', 'transport', 'enable-lan-visibility', 'default-player-permission-level', 'online-mode', 'texturepack-required'];
    const clean = {};
    for (const [k, v] of Object.entries(values || {})) if (allowed.includes(k)) clean[k] = String(v).replace(/[\r\n]/g, ' ').trim();
    const r = x.props.set(clean);
    if ('server-name' in clean && fs.existsSync(path.join(x.R.WATERDOG, 'config.yml'))) {
      try { entradas.actualizar(x.R, { nombre: clean['server-name'] }); } catch {}
    }
    send('props', r);
    enviarResumen();
    return r;
  },
  'settings.set': (patch) => {
    const x = I();
    const r = x.settings.set(patch);
    if ('copiaCadaHoras' in patch) scheduleAuto(x);
    if ('tema' in patch) nativeTheme.themeSource = r.tema === 'claro' ? 'light' : 'dark';
    send('settings', r);
    send('playit', playit.snapshot());
    return r;
  },

  // playit
  'playit.start': async () => {
    if (!playit.installed()) await withBusy('Bajando playit', (progress) => descargas.asegurarPlayit(progress));
    if (!playit.linked()) { vincularPlayit(); return; }
    return playit.start();
  },
  'playit.stop': () => playit.stop(),
  'playit.link': async () => {
    if (playit.vinculo) { shell.openExternal(playit.vinculo); return; }
    if (!playit.installed()) await withBusy('Bajando playit', (progress) => descargas.asegurarPlayit(progress));
    vincularPlayit();
  },
  // Revisa (o crea) el túnel del servidor elegido y llena su entrada.
  'playit.tunel': async () => {
    if (playit.automatico === null && playit.linked()) playit.automatico = await tuneles.automatico();
    if (!playit.automatico) throw new Error('Este agente de playit no deja crear túneles; la entrada se llena a mano');
    return withBusy('Armando el túnel de playit', () => autoTunel(I()));
  },
  'playit.dashboard': () => shell.openExternal('https://playit.gg/account/tunnels'),
  'playit.address': (value) => {
    const v = String(value || '').trim().replace(/^https?:\/\//, '').replace(/\s+/g, '');
    I().settings.set({ direccionPublica: v });
    send('playit', playit.snapshot());
    enviarResumen();
    return v;
  },

  // Actualizaciones
  'update.check': async () => {
    const x = I();
    const l = await updater.latest();
    const current = x.server.version || x.settings.get().versionServidor;
    updateInfo = { latest: l.version, url: l.url, current, available: !x.server.installed() || updater.newer(l.version, current), checkedAt: Date.now() };
    send('update', updateInfo);
    return updateInfo;
  },
  'update.install': () => withBusy(actual()?.server.installed() ? 'Actualizando el servidor' : 'Instalando el servidor', async (progress) => {
    const x = I();
    if (x.server.state !== 'apagado') throw new Error('Cierra el servidor antes de actualizar');
    const l = updateInfo?.url ? { url: updateInfo.url, version: updateInfo.latest } : await updater.latest();
    if (x.server.worldReady() && !x.settings.get().mundoNuevo) await x.backups.cold(x.props.get()['level-name'], 'antes de actualizar');
    const v = await updater.install(l, progress, x.R);
    x.settings.set({ versionServidor: v });
    x.server.version = v;
    updateInfo = { ...(updateInfo || {}), current: v, available: false };
    send('update', updateInfo);
    send('server', x.server.snapshot());
    send('backups', x.backups.list());
    return v;
  }),

  // Utilidades
  copy: (text) => clipboard.writeText(String(text || '')),
  openRoot: () => shell.openPath(actual() ? actual().base : P.ROOT),
  'win.minimize': () => win.minimize(),
  'win.maximize': () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
  'win.close': () => win.close(),
};

ipcMain.handle('posada:call', async (_e, method, args) => {
  const fn = api[method];
  if (!fn) return { error: `No existe ${method}` };
  try {
    return { ok: true, value: await fn(...(args || [])) };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1286,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#1E1E1F',
    title: 'CraftAdmin',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Modo de prueba: un script externo maneja la ventana sin mostrarla.
  if (process.env.POSADA_TEST) {
    const x = actual();
    win.webContents.once('did-finish-load', () => require(process.env.POSADA_TEST)({ app, win, api, server: x?.server, players: x?.players, playit, settings: x?.settings, servidores, actual }));
    return;
  }
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => send('window', { maximized: true }));
  win.on('unmaximize', () => send('window', { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', async (e) => {
    if (quitting) return;
    if (!algunoAbierto() && !playit.proc) return;
    e.preventDefault();
    quitting = true;
    send('closing', true);
    // Se cierran todos los servidores a la vez, guardando cada mundo.
    await Promise.all([...servidores.values()].map(async (x) => {
      try { await x.proxy.stop(); } catch {}
      try { await x.server.stop(); } catch {}
    }));
    try { await playit.stop(); } catch {}
    tuneles.cancelar();
    app.exit(0);
  });
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

// Las texturas y letras salen del Minecraft instalado en cada PC; la interfaz las pide como juego://local/...
const JUEGO_DIR = path.join(P.APPDATA_DIR, 'juego');
protocol.registerSchemesAsPrivileged([{ scheme: 'juego', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

app.whenReady().then(() => {
  const problema = juego.preparar(JUEGO_DIR);
  if (problema) { dialog.showErrorBox('CraftAdmin', problema); app.exit(1); return; }
  protocol.handle('juego', (req) => {
    const f = path.normalize(path.join(JUEGO_DIR, decodeURIComponent(new URL(req.url).pathname)));
    if (!f.startsWith(JUEGO_DIR + path.sep)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(f).toString());
  });
  createWindow();
  if (process.env.POSADA_TEST) return;
  // Doble clic en CraftAdmin = abre los servidores marcados para abrirse solos, con su túnel.
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      for (const x of servidores.values()) {
        if (!x.settings.get().abrirAlIniciar || !x.server.installed() || !x.server.worldReady() || x.server.state !== 'apagado') continue;
        try { await abrir(x); } catch (e) { toast(`No se pudo abrir ${x.nombre()}: ${e.message}`, 'error'); }
      }
    }, 800);
  });
});

app.on('window-all-closed', () => app.quit());
