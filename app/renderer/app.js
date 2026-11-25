'use strict';
// Interfaz de CraftAdmin. Sin frameworks: cada sección es una plantilla que se actualiza por partes.
// Los objetos, cabezas e íconos están en pixel.js.

const api = (m, ...a) => window.posada.call(m, ...a);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ORDER = ['inicio', 'jugadores', 'visitas', 'mundos', 'copias', 'consola', 'ajustes'];

const S = {
  snap: null,
  view: 'inicio',
  lines: [],
  worldsTab: 'servidor',
  mcWorlds: null,
  mcLoading: false,
  filter: 'todos',
  selPlayer: null,
  renaming: null,
  hist: [],
  histIdx: -1,
};

/* ---------- Formatos ---------- */
const LOC = 'es-CO';
const nf1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1 });
function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${nf1.format(n / 1024 ** 3)} GB`;
}
function fmtDur(ms) {
  if (!ms || ms < 60000) return ms ? 'menos de 1 min' : '0 min';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
function fmtDurShort(ms) {
  if (!ms) return '0';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${nf1.format(ms / 3600000)} h`;
}
function fmtAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  return new Date(ts).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' });
}
const dfDay = new Intl.DateTimeFormat(LOC, { weekday: 'short', day: 'numeric', month: 'short' });
const dfTime = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit', hour12: false });
const dfFull = new Intl.DateTimeFormat(LOC, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const clean = (s) => s.replace(/\./g, '').replace(/,/g, '').replace(/ de /g, ' ');
const fmtWhen = (ts) => `${clean(dfDay.format(ts))}, ${dfTime.format(ts)}`;
const fmtWhenFull = (ts) => `${clean(dfFull.format(ts))}, ${dfTime.format(ts)}`;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/* ---------- Avisos ---------- */
function toast(text, tone = 'info', obj = 'casa') {
  // El título ya dice «Listo»: no se repite al principio del texto.
  text = String(text).replace(/^Listo[:.,]?\s*/i, '');
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const box = $('#avisos');
  const el = document.createElement('div');
  el.className = `toast ${tone === 'error' ? 'error' : ''}`;
  const alias = { casa: 'comando', lista: 'estante', libro: 'estante', bloque: 'pasto', engranaje: 'mesa' };
  const pic = tone === 'error' ? ic('alert') : obj === 'barrera' ? item('barrera') : iso(alias[obj] || obj, 24);
  el.innerHTML = `<span class="toast-ico">${pic}</span>
    <span class="toast-t"><b>${tone === 'error' ? 'No se pudo completar' : 'Listo'}</b><span>${esc(text)}</span></span>`;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add('sale'); setTimeout(() => el.remove(), 220); }, tone === 'error' ? 7000 : 4200);
}

async function call(m, ...a) {
  try { return await api(m, ...a); } catch (e) { toast(e.message, 'error'); throw e; }
}
const quiet = (p) => p.catch(() => {});

/* ---------- Información al pasar el ratón ---------- */
// data-tip admite varias líneas; una línea que empieza con §a, §c, §e o §7 lleva ese color.
const TIPC = { a: 'ok', c: 'bad', e: 'warn', 7: 'muted', 9: 'info' };
const tipLine = (l) => { const m = /^§([0-9a-f])/.exec(l); return m ? `<span class="${TIPC[m[1]] || ''}">${esc(l.slice(2))}</span>` : `<span>${esc(l)}</span>`; };
const TIP = { target: null, t: 0 };
function tipShow(t) {
  const el = $('#tip');
  const [first, ...rest] = t.dataset.tip.split('\n');
  el.innerHTML = `<b>${esc(first)}</b>${rest.filter(Boolean).map(tipLine).join('')}`;
  el.hidden = false;
  const r = t.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const x0 = r.left + r.width / 2 - w / 2;
  let y = r.top - h - 8;
  if (y < 8 || t.closest('.top')) y = r.bottom + 8;
  const x = Math.max(8, Math.min(innerWidth - w - 8, x0));
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function tipHide() { clearTimeout(TIP.t); TIP.target = null; $('#tip').hidden = true; }
document.addEventListener('mouseover', (e) => {
  let t = e.target.closest?.('[data-tip]') || null;
  if (t?.closest('#nav') && !(document.body.classList.contains('compacto') && !t.classList.contains('on'))) t = null;
  if (t === TIP.target) return;
  tipHide();
  if (!t || !t.dataset.tip) return;
  TIP.target = t;
  TIP.t = setTimeout(() => { if (TIP.target === t && t.isConnected) tipShow(t); }, 380);
});
document.addEventListener('mousedown', tipHide);
document.addEventListener('mouseleave', tipHide);

/* ---------- Datos derivados ---------- */
const srv = () => S.snap.server;
const pl = () => S.snap.playit;
const px = () => S.snap.proxy || {};
const players = () => S.snap.players.list;
const prop = (k) => S.snap.props[k];
const running = () => srv().state !== 'apagado';
const onlineList = () => players().filter((p) => p.online);
const activeWorld = () => S.snap.worlds.find((w) => w.active) || null;
const serverName = () => prop('server-name') || 'Servidor de Bedrock';

// Estado del servidor en pocas palabras y un tono (ok, warn, bad, off).
function estado() {
  const s = srv();
  if (!s.installed) return { t: 'Sin instalar', c: 'bad' };
  if (s.state === 'arrancando') return { t: 'Abriendo…', c: 'warn' };
  if (s.state === 'cerrando') return { t: 'Cerrando…', c: 'warn' };
  if (s.state === 'abierto') return { t: 'En línea', c: 'ok' };
  return { t: 'Cerrado', c: 'off' };
}

// Si tus amigos pueden entrar ahora y, si no, por qué.
function entrada() {
  const s = srv(), p = pl(), x = px();
  const open = s.state === 'abierto';
  const viaProxy = x.installed && p.linked;
  const server = { abierto: ['Abierto', 'ok'], apagado: ['Cerrado', 'off'], arrancando: ['Abriendo…', 'warn'], cerrando: ['Cerrando…', 'warn'] }[s.state] || ['—', 'off'];
  let tunnel;
  if (p.state === 'sin-programa') tunnel = ['Falta el programa', 'bad'];
  else if (!p.linked && p.state !== 'esperando') tunnel = ['Sin conectar', 'bad'];
  else tunnel = { conectado: ['Conectado', 'ok'], conectando: ['Conectando…', 'warn'], esperando: ['Esperando tu aprobación', 'warn'], error: ['Con error', 'bad'], apagado: [s.state === 'apagado' ? 'Se abre con el servidor' : 'Apagado', 'off'] }[p.state] || [p.state, 'off'];
  let gate = null;
  if (x.installed) gate = !open ? ['Se abre con el servidor', 'off'] : x.state === 'listo' ? ['Lista', 'ok'] : x.state === 'error' ? ['Con error', 'bad'] : ['Abriendo…', 'warn'];
  const ready = !!(open && p.address && (viaProxy ? x.state === 'listo' && p.running : p.state === 'conectado'));
  let why = '';
  if (!s.installed) why = 'Falta instalar el servidor.';
  else if (!s.worldReady && s.state === 'apagado') why = 'Falta elegir un mundo.';
  else if (s.state === 'apagado') why = 'El servidor está cerrado.';
  else if (s.state !== 'abierto') why = `El servidor está ${s.state === 'arrancando' ? 'abriendo' : 'cerrando'}.`;
  else if (!p.linked) why = 'Falta conectar playit.';
  else if (!p.address) why = 'Falta la dirección de playit.';
  else if (!ready) why = 'La entrada todavía se está abriendo.';
  return { server, tunnel, gate, ready, why };
}

function sinceText(kind, since) {
  const d = Date.now() - Number(since);
  if (kind === 'fila') return d < 60000 ? 'Jugando, acaba de entrar' : `Jugando hace ${fmtDur(d)}`;
  return fmtDur(d);
}
function playerStatus(p) {
  if (p.online) return { t: sinceText('fila', p.since), c: 'ok', attrs: `data-since="${p.since}" data-kind="fila"` };
  if (p.blocked) return { t: `Bloqueado ${fmtAgo(p.blockedAt)}`, c: 'bad', attrs: '' };
  if (p.access && !p.lastSeen) return { t: 'Todavía no ha entrado', c: '', attrs: '' };
  if (p.access) return { t: `Jugó ${fmtAgo(p.lastSeen)}`, c: '', attrs: '' };
  return { t: p.lastSeen ? `Fuera de la lista, jugó ${fmtAgo(p.lastSeen)}` : 'Fuera de la lista', c: 'warn', attrs: '' };
}
const ROLE_NAME = { visitor: 'Visitante', member: 'Miembro', operator: 'Operador' };
const ROLES = [['visitor', 'Visitante'], ['member', 'Miembro'], ['operator', 'Operador']];
const badge = (t, c = '') => `<span class="badge ${c}">${esc(t)}</span>`;

/* ---------- Controles ---------- */
const sw = (on, attrs) => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" ${attrs}><i></i></button>`;
const SELECTS = {
  gamemode: { k: 'prop', opts: [['survival', 'Supervivencia'], ['creative', 'Creativo'], ['adventure', 'Aventura']] },
  difficulty: { k: 'prop', opts: [['peaceful', 'Pacífico'], ['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] },
  'default-player-permission-level': { k: 'prop', opts: [['visitor', 'Visitante'], ['member', 'Miembro'], ['operator', 'Operador']] },
  copiaCadaHoras: { k: 'setting', opts: [[0, 'Nunca'], [1, 'Cada hora'], [3, 'Cada 3 horas'], [6, 'Cada 6 horas']] },
  copiasGuardar: { k: 'setting', opts: [[5, '5 copias'], [10, '10 copias'], [20, '20 copias']] },
};
// Lista desplegable propia: la del sistema sale con el estilo de Windows. Al tocarla se abre #menu.
const valorSel = (key) => String(SELECTS[key].k === 'setting' ? S.snap.settings[key] : prop(key));
function select(key, label) {
  const cur = valorSel(key);
  const op = SELECTS[key].opts.find(([v]) => String(v) === cur);
  return `<span class="desp"><button class="desp-btn" type="button" data-key="${key}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}"><span class="desp-v">${esc(op ? op[1] : cur)}</span>${ic('chevronRight', 'ic desp-chev')}</button></span>`;
}
const MENU = { btn: null, key: null, t: 0 };
function abrirMenu(btn) {
  if (MENU.btn === btn) { cerrarMenu(); return; }
  cerrarMenu(true);
  const key = btn.dataset.key;
  const cur = valorSel(key);
  const m = $('#menu');
  clearTimeout(MENU.t);
  m.innerHTML = SELECTS[key].opts.map(([v, l], i) => `<button class="menu-op ${String(v) === cur ? 'on' : ''}" type="button" role="option" aria-selected="${String(v) === cur}" data-val="${v}" style="--i:${i}">${esc(l)}</button>`).join('');
  m.classList.remove('sale', 'arriba');
  m.hidden = false;
  const r = btn.getBoundingClientRect();
  m.style.minWidth = `${Math.round(r.width)}px`;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - 8 - w)))}px`;
  // Se abre hacia abajo; si no cabe, hacia arriba.
  if (r.bottom + 6 + h > innerHeight - 8) { m.style.top = `${Math.round(Math.max(8, r.top - 6 - h))}px`; m.classList.add('arriba'); }
  else m.style.top = `${Math.round(r.bottom + 6)}px`;
  MENU.btn = btn;
  MENU.key = key;
  btn.setAttribute('aria-expanded', 'true');
  ($('.menu-op.on', m) || m.firstElementChild).focus({ preventScroll: true });
}
function cerrarMenu(rapido = false) {
  const btn = MENU.btn;
  if (!btn) return null;
  btn.setAttribute('aria-expanded', 'false');
  MENU.btn = null;
  MENU.key = null;
  const m = $('#menu');
  if (rapido) { m.hidden = true; return btn; }
  m.classList.add('sale');
  MENU.t = setTimeout(() => { if (!MENU.btn) m.hidden = true; }, 140);
  return btn;
}
function elegir(key, val) {
  if (SELECTS[key].k === 'setting') quiet(call('settings.set', { [key]: /^\d+$/.test(val) ? Number(val) : val }));
  else quiet(call('props.set', { [key]: val }));
}
const STEPS = {
  'max-players': { min: 1, max: 30, step: 1, unit: (v) => (v === 1 ? 'jugador' : 'jugadores') },
  'view-distance': { min: 6, max: 48, step: 2, unit: () => 'chunks' },
  'tick-distance': { min: 4, max: 12, step: 1, unit: () => 'chunks' },
  'player-idle-timeout': { min: 0, max: 120, step: 5, unit: () => 'min' },
};
const MINUS = '<i class="menos" aria-hidden="true"></i>';
function stepper(key, label) {
  const d = STEPS[key];
  const v = Number(prop(key)) || 0;
  const txt = key === 'player-idle-timeout' && v === 0 ? 'Nunca' : `<b>${v}</b> ${esc(d.unit(v))}`;
  return `<div class="stepper" role="group" aria-label="${esc(label)}">
    <button data-act="step" data-key="${key}" data-d="${-d.step}" aria-label="Menos" ${v <= d.min ? 'disabled' : ''}>${MINUS}</button>
    <span>${txt}</span>
    <button data-act="step" data-key="${key}" data-d="${d.step}" aria-label="Más" ${v >= d.max ? 'disabled' : ''}>${ic('plus')}</button>
  </div>`;
}
const setRow = (label, help, ctl) => `<div class="set"><div class="set-t"><b>${label}</b>${help ? `<span>${help}</span>` : ''}</div><div class="set-c">${ctl}</div></div>`;

/* =================================================================== */
/* Secciones                                                            */
/* =================================================================== */
const VIEWS = {};
VIEWS.nuevo = VISTA_NUEVO; // asistente para crear un servidor (servidores.js)
VIEWS.servidores = VISTA_SERVIDORES; // todos tus servidores con la vista previa de cada uno (servidores.js)
VIEWS.acceso = VISTA_ACCESO; // entrar o crear cuenta (cuenta.js)
VIEWS.cuenta = VISTA_CUENTA; // tu cuenta (cuenta.js)

/* ---------- Inicio ---------- */
VIEWS.inicio = {
  html() {
    return `
      <section class="hero" id="hero">${this.hero()}</section>
      <section class="playbar" id="playbar">${this.playbar()}</section>
      <div class="home">
        <section class="panel" id="h-amigos">${this.amigos()}</section>
        <section class="panel" id="h-entrada">${this.entradaPanel()}</section>
      </div>`;
  },
  mount() { $('#hero').dataset.st = srv().state; },
  fotoKey() { const w = activeWorld(); return w ? `${w.folder}|${(w.icon || '').length}` : ''; },
  hero() {
    const w = activeWorld();
    // Partículas que suben sobre la foto, cada una con su tamaño, color, velocidad y desvío.
    const colores = ['oklch(0.97 0.03 110)', 'oklch(0.88 0.13 135)', 'oklch(0.93 0.1 95)'];
    const parts = Array.from({ length: 22 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--t:${[3, 4, 4, 5, 6][i % 5]}px;--d:${(7 + Math.random() * 8).toFixed(1)}s;--r:-${(Math.random() * 15).toFixed(1)}s;--dx:${Math.round(Math.random() * 90 - 45)}px;--h:${Math.round(160 + Math.random() * 300)}px;--c:${colores[i % 3]}"></i>`).join('');
    return `<img class="hero-img" src="${w?.icon || JUEGO.tex.fondo}" alt="" draggable="false" data-k="${esc(this.fotoKey())}"><div class="hero-shade"></div><div class="particulas">${parts}</div>
      <div class="hero-in" id="hero-in">${this.heroIn()}</div>`;
  },
  heroIn() {
    const s = srv();
    const w = activeWorld();
    const st = estado();
    const ver = s.version || S.snap.settings.versionServidor;
    const chip = s.state === 'abierto' ? `${st.t} · ${onlineList().length} de ${prop('max-players') || 10} jugando` : st.t;
    return `<div class="hero-txt">
        <span class="pill ${st.c}"><i class="dot"></i>${esc(chip)}</span>
        <h1 class="hero-name">${esc(serverName())}</h1>
        <p class="hero-meta"><span>${w ? esc(w.folder) : 'Sin mundo todavía'}</span>${ver ? `<i></i><span>Bedrock ${esc(ver)}</span>` : ''}</p>
      </div>`;
  },
  playbar() {
    const s = srv();
    const p = pl();
    let left;
    if (p.address) {
      const [host, port] = p.address.split(':');
      left = `<span class="addr-l">Dirección para tus amigos</span>
        <div class="addr-v"><span class="addr-host">${esc(host)}</span>${port ? `<span class="addr-port" data-tip="Puerto">${esc(port)}</span>` : ''}
          <button class="btn sm" data-act="copy-addr" data-tip="Copiar la dirección\n§7En Minecraft: Servidores, Agregar servidor">${ic('copy')}Copiar</button></div>`;
    } else {
      let msg = 'Conecta playit para que tus amigos entren desde sus casas.';
      let btn = `<button class="btn sm" data-act="playit.link">${ic('link')}Conectar playit</button>`;
      if (p.state === 'sin-programa') { msg = 'Falta el programa de playit en la carpeta playit.'; btn = ''; }
      else if (p.state === 'esperando') { msg = 'Se abrió playit en tu navegador. Aprueba la conexión ahí.'; btn = `<button class="btn sm" data-act="playit.link">${ic('external')}Abrir el enlace otra vez</button>`; }
      else if (p.linked && p.automatico) { msg = 'playit está armando el túnel de este servidor.'; btn = `<button class="btn sm" data-act="playit.tunel">${ic('restart')}Armar el túnel</button>`; }
      else if (p.linked) { msg = 'playit ya está conectado. Falta la dirección que te da.'; btn = `<button class="btn sm" data-view="ajustes">${ic('edit')}Poner la dirección</button>`; }
      left = `<span class="addr-l">Dirección para tus amigos</span><div class="addr-falta"><span>${esc(msg)}</span>${btn}</div>`;
    }
    let main;
    if (!s.installed) main = '<button class="btn play" data-act="update.install">Instalar el servidor</button>';
    else if (!s.worldReady && s.state === 'apagado') main = '<button class="btn play" data-view="mundos">Elegir un mundo</button>';
    else if (s.state === 'apagado') main = '<button class="btn play" data-act="server.start">Abrir servidor</button>';
    else if (s.state === 'abierto') main = '<button class="btn play stop" data-act="server.stop" data-tip="Cerrar el servidor\n§7Guardo el mundo antes de cerrar">Cerrar servidor</button>';
    else main = `<button class="btn play" disabled><span class="spin"></span>${s.state === 'arrancando' ? 'Abriendo…' : 'Cerrando…'}</button>`;
    const right = `${s.state === 'abierto' ? `<button class="btn sm" data-act="server.restart" data-tip="Reiniciar el servidor\n§7Tus amigos salen y pueden volver a entrar">${ic('restart')}Reiniciar</button>` : ''}
      <button class="btn sm icon" data-act="openRoot" data-tip="Abrir la carpeta de CraftAdmin\n§7Servidor, copias, playit y datos" aria-label="Abrir la carpeta">${ic('folder')}</button>`;
    const err = s.lastError && s.state === 'apagado' ? s.lastError : p.lastError && p.state === 'error' ? p.lastError : '';
    return `<div class="pb-left">${left}</div><div class="pb-right">${right}</div><div class="pb-main">${main}</div>
      ${err ? `<p class="pb-err">${ic('alert')}<span>${esc(err)}</span></p>` : ''}`;
  },
  amigos() {
    const max = prop('max-players') || 10;
    const on = onlineList().length;
    const list = players().filter((p) => !p.blocked && (p.access || p.online))
      .sort((a, b) => (b.online - a.online) || ((b.since || b.lastSeen || 0) - (a.since || a.lastSeen || 0)));
    const top = `<div class="panel-h"><span class="ph-ico">${iso('cabeza', 24)}</span><h2>Tus amigos</h2><span class="count">${on} de ${max} jugando</span>
      <button class="btn sm ghost" data-view="jugadores">${ic('userPlus')}Agregar</button></div>`;
    if (!list.length) {
      return `${top}<div class="empty">
        <div class="empty-heads">${['Steve', 'Alex', 'Ari'].map((n) => head(n, 'av lg')).join('')}</div>
        <p class="empty-t">Todavía no has agregado amigos</p>
        <p class="empty-s">${S.snap.players.allowlistOn ? 'Solo entran los que agregues, con su gamertag de Xbox.' : 'Ahora entra cualquiera que tenga la dirección. Agrega a tus amigos para ver aquí cuándo juegan.'}</p>
        <button class="btn sm primary" data-view="jugadores">${ic('userPlus')}Agregar un amigo</button></div>`;
    }
    // Tus amigos de pie sobre el pasto, con su nombre encima como en el juego.
    const figs = list.slice(0, 14).map((p, i) => {
      const st = p.online ? sinceText('fila', p.since) : p.lastSeen ? `Jugó ${fmtAgo(p.lastSeen)}` : 'Todavía no ha entrado';
      return `<button class="fig ${p.online ? 'on' : ''}" style="--i:${i}" data-view="jugadores" data-sel="${esc(p.key)}" data-tip="${esc(p.name)}\n${p.online ? '§a' : '§7'}${esc(st)}${p.role && p.xuid ? `\n§7${ROLE_NAME[p.role] || ''}` : ''}">
        <span class="tag">${p.online ? '<i class="dot"></i>' : ''}${esc(p.name)}</span>
        ${skin3d(p.name, 72, 133, 'fig-img')}
      </button>`;
    }).join('');
    const more = list.length > 14 ? `<button class="link" data-view="jugadores">Ver los ${list.length} amigos${ic('chevronRight')}</button>` : '';
    return `${top}<div class="escenario"><div class="figuras">${figs}</div><div class="suelo"></div></div>${more}`;
  },
  entradaPanel() {
    const e = entrada();
    const s = srv();
    const p = pl();
    const ok = (x) => x && x[1] === 'ok';
    const nodo = (icono, titulo, [t, c], tip) => `<div class="nodo ${c}" data-tip="${esc(tip)}"><span class="nodo-ico">${iso(icono, 32)}</span><span class="nodo-n">${titulo}</span><span>${esc(t)}</span></div>`;
    const cable = (on, i) => `<i class="cable ${on ? 'on' : ''}" style="--d:${i * 0.35}s"></i>`;
    const amigos = p.address ? ['Con dirección', 'ok'] : ['Sin dirección', 'off'];
    const ruta = [
      nodo('cabeza', 'Amigos', amigos, 'Tus amigos\n§7Entran con la dirección y el puerto'),
      cable(ok(amigos) && ok(e.tunnel), 0),
      nodo('portal', 'playit', e.tunnel, 'Túnel de playit\n§7Deja entrar a tus amigos desde sus casas sin tocar el router'),
      cable(ok(e.tunnel) && (e.gate ? ok(e.gate) : ok(e.server)), 1),
      ...(e.gate ? [nodo(ok(e.gate) ? 'lamparaOn' : 'lampara', 'Entrada', e.gate, 'Entrada para Bedrock (WaterdogPE)\n§7Hace que la conexión de playit funcione con Bedrock'), cable(ok(e.gate) && ok(e.server), 2)] : []),
      nodo('comando', 'Servidor', e.server, 'Servidor de Bedrock'),
    ].join('');
    const live = s.state === 'abierto' && s.stats;
    return `<div class="panel-h"><span class="ph-ico">${iso(e.ready ? 'lamparaOn' : 'lampara', 24)}</span><h2>Entrada para tus amigos</h2></div>
      <div class="ruta">${ruta}</div>
      <div class="veredicto ${e.ready ? 'ok' : ''}">
        <span class="ver-ico">${e.ready ? ic('check') : ic('info')}</span>
        <div><b>${e.ready ? 'Tus amigos pueden entrar' : 'Tus amigos todavía no pueden entrar'}</b><span>${e.ready ? 'Solo tienen que poner la dirección y el puerto.' : esc(e.why)}</span></div>
      </div>
      <dl class="stats">
        <div><dt>Abierto hace</dt><dd id="h-up">${s.state === 'abierto' && s.startedAt ? esc(fmtDur(Date.now() - s.startedAt)) : '—'}</dd></div>
        <div><dt>Memoria</dt><dd id="h-mem">${live ? fmtBytes(s.stats.mem) : '—'}</dd></div>
        <div><dt>Procesador</dt><dd id="h-cpu">${live && s.stats.cpu != null ? `${Math.round(s.stats.cpu)} %` : '—'}</dd></div>
      </dl>`;
  },
  metrics() {
    const s = srv();
    const up = $('#h-up');
    if (!up) return;
    const live = s.state === 'abierto' && s.stats;
    up.textContent = s.state === 'abierto' && s.startedAt ? fmtDur(Date.now() - s.startedAt) : '—';
    $('#h-mem').textContent = live ? fmtBytes(s.stats.mem) : '—';
    $('#h-cpu').textContent = live && s.stats.cpu != null ? `${Math.round(s.stats.cpu)} %` : '—';
  },
  update(part) {
    const set = (id, fn) => { const el = $(id); if (el) el.innerHTML = fn.call(this); };
    const h = $('#hero');
    if (h && ['server', 'props', 'worlds', 'players', 'settings'].includes(part)) {
      // La foto solo se cambia si cambió el mundo, para que no se corte su movimiento.
      const img = $('.hero-img', h);
      if (!img || img.dataset.k !== this.fotoKey()) h.innerHTML = this.hero();
      else set('#hero-in', this.heroIn);
      h.dataset.st = srv().state;
    }
    if (['server', 'playit', 'settings', 'props'].includes(part)) set('#playbar', this.playbar);
    if (['server', 'players', 'props'].includes(part)) set('#h-amigos', this.amigos);
    if (['server', 'playit', 'props'].includes(part)) set('#h-entrada', this.entradaPanel);
  },
};

/* ---------- Jugadores ---------- */
const FILTROS = [['todos', 'Todos'], ['dentro', 'Jugando'], ['acceso', 'En la lista'], ['bloqueados', 'Bloqueados']];
VIEWS.jugadores = {
  html() {
    return `<div class="page full">
      <header class="page-h">
        <div class="ph"><span class="page-ico">${iso('cabeza', 32)}</span><div><h1>Jugadores</h1><p class="sub" id="j-sub"></p></div></div>
        <form class="add-form" data-form="add"><input class="field" name="name" placeholder="Gamertag de tu amigo" maxlength="32" spellcheck="false" autocomplete="off" aria-label="Gamertag de tu amigo"><button class="btn primary" type="submit">${ic('userPlus')}Agregar</button></form>
      </header>
      <div class="toolbar"><div class="tabs" id="j-tabs"></div><div class="toolbar-r" id="j-allow"></div></div>
      <div class="split crece">
        <section class="panel flush scroll" id="j-list"></section>
        <aside class="panel ficha" id="j-ficha"></aside>
      </div>
    </div>`;
  },
  mount() { this.fill(); },
  counts() {
    const L = players();
    return { todos: L.length, dentro: L.filter((p) => p.online).length, acceso: L.filter((p) => p.access).length, bloqueados: L.filter((p) => p.blocked).length };
  },
  list() {
    const f = { todos: () => true, dentro: (p) => p.online, acceso: (p) => p.access, bloqueados: (p) => p.blocked }[S.filter];
    return players().filter(f).sort((a, b) => (b.online - a.online) || (a.blocked - b.blocked) || ((b.lastSeen || 0) - (a.lastSeen || 0)) || a.name.localeCompare(b.name));
  },
  sel() {
    const list = this.list();
    let p = list.find((x) => x.key === S.selPlayer);
    if (!p) { p = list[0] || null; S.selPlayer = p ? p.key : null; }
    return p;
  },
  fill() {
    const box = $('#j-list');
    if (!box) return;
    const n = this.counts();
    $('#j-sub').textContent = `${n.acceso} en la lista · ${n.dentro} jugando ahora`;
    $('#j-tabs').innerHTML = FILTROS.map(([k, l]) => `<button class="tab ${S.filter === k ? 'on' : ''}" data-act="filter" data-val="${k}">${l}<span class="tab-n">${n[k]}</span></button>`).join('');
    $('#j-allow').innerHTML = px().installed
      ? `<span class="hint">${ic('info')}Entra cualquiera con la dirección; a los bloqueados los saco al entrar</span>`
      : `<label class="sw-row">${sw(S.snap.players.allowlistOn, 'data-act="allow-toggle" aria-label="Solo entran los de la lista"')}<span>Solo entran los de la lista</span></label>`;
    const list = this.list();
    const cur = this.sel();
    if (!list.length) {
      const msg = {
        todos: ['Todavía no hay nadie', 'Escribe arriba el gamertag de un amigo (su nombre de Xbox) y dale a Agregar.'],
        dentro: ['Nadie está jugando', 'Cuando alguien entre al servidor aparecerá aquí.'],
        acceso: ['La lista está vacía', 'Escribe arriba el gamertag de un amigo y dale a Agregar.'],
        bloqueados: ['No hay bloqueados', 'Si bloqueas a alguien, lo saco cada vez que intente entrar.'],
      }[S.filter];
      box.innerHTML = `<div class="empty"><p class="empty-t">${msg[0]}</p><p class="empty-s">${msg[1]}</p></div>`;
    } else {
      const st0 = box.scrollTop;
      box.innerHTML = list.map((p) => {
        const st = playerStatus(p);
        const b = p.blocked ? badge('Bloqueado', 'bad') : p.online ? badge('Jugando', 'ok') : p.role && p.xuid ? badge(ROLE_NAME[p.role] || '', p.role === 'operator' ? 'gold' : '') : '';
        return `<button class="prow ${cur && cur.key === p.key ? 'sel' : ''}" data-act="sel" data-key="${esc(p.key)}">
          <span class="av-wrap ${p.online ? 'on' : ''} ${p.blocked ? 'bloq' : ''}">${head(p.name, 'av')}</span>
          <span class="prow-t"><b>${esc(p.name)}</b><span class="${st.c}" ${st.attrs}>${esc(st.t)}</span></span>
          ${b}
        </button>`;
      }).join('');
      // Con pocos jugadores, el espacio de abajo invita a agregar más amigos.
      if (S.filter !== 'bloqueados' && list.length < 9) {
        box.insertAdjacentHTML('beforeend', `<div class="lista-pie">
          <div class="empty-heads">${['Steve', 'Alex', 'Ari'].map((x) => head(x, 'av lg')).join('')}</div>
          <p>¿Falta alguien?</p>
          <p class="empty-s">Escribe su gamertag de Xbox y dale a Agregar. Así ves aquí cuándo juega y cuánto se queda.</p>
          <button class="btn primary" data-act="foco-agregar">${ic('userPlus')}Agregar un amigo</button>
        </div>`);
      }
      box.scrollTop = st0;
    }
    this.ficha();
  },
  ficha() {
    const box = $('#j-ficha');
    if (!box) return;
    const p = this.sel();
    if (!p) { box.innerHTML = '<div class="empty"><p class="empty-t">Elige a alguien</p><p class="empty-s">Aquí verás sus visitas, su rol y lo que puedes hacer.</p></div>'; return; }
    const st = playerStatus(p);
    const n = esc(p.name);
    const canRole = !p.blocked;
    const acts = [];
    if (p.online) acts.push(`<button class="btn" data-act="players.kick" data-arg="${n}" data-tip="Sacarlo del mundo\n§7Puede volver a entrar">${ic('logout')}Sacar del mundo</button>`);
    if (p.blocked) acts.push(`<button class="btn primary" data-act="players.unblock" data-arg="${n}">${ic('unlock')}Desbloquear</button>`);
    else {
      if (p.access) acts.push(`<button class="btn hold" data-act="players.remove" data-arg="${n}" data-tip="Mantén presionado\n§7para quitarlo de la lista"><span class="hold-fill"></span>${ic('x')}Quitar de la lista</button>`);
      else acts.push(`<button class="btn primary" data-act="players.add" data-arg="${n}">${ic('userPlus')}Agregar a la lista</button>`);
      acts.push(`<button class="btn hold danger-t" data-act="players.block" data-arg="${n}" data-tip="Mantén presionado\n§7para bloquearlo"><span class="hold-fill"></span>${ic('ban')}Bloquear</button>`);
    }
    const last = p.online ? 'Ahora' : p.lastSeen ? fmtAgo(p.lastSeen) : 'Nunca';
    const mias = S.snap.players.sessions.filter((v) => v.name.toLowerCase() === p.key);
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    const dias = Array.from({ length: 14 }, (_, i) => {
      const ini = hoy0.getTime() - (13 - i) * 86400000, fin = ini + 86400000;
      let ms = 0;
      for (const v of mias) { const a2 = Math.max(v.start, ini), b2 = Math.min(v.end || Date.now(), fin); if (b2 > a2) ms += b2 - a2; }
      return { ms, t: i === 13 ? 'Hoy' : clean(new Date(ini).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' })) };
    });
    const dmax = Math.max(...dias.map((d) => d.ms), 1);
    const propia = !!skinDe(p.name);
    box.innerHTML = `
      <div class="skin ${p.online ? 'on' : ''} ${p.blocked ? 'bloq' : ''}" style="--fondo:url(${activeWorld()?.icon || JUEGO.tex.fondo})">${skin3d(p.name, 150, 275)}<div class="suelo"></div>
        <div class="skin-acts">
          <button class="btn sm" data-act="skins.set" data-arg="${n}" data-tip="Elegir una skin (imagen PNG de 64x64)\n§7Solo se ve aquí en CraftAdmin">${ic('upload')}${propia ? 'Cambiar skin' : 'Poner skin'}</button>
          ${propia ? `<button class="btn sm icon ghost" data-act="skins.remove" data-arg="${n}" aria-label="Quitar la skin" data-tip="Quitar la skin">${ic('x')}</button>` : ''}
        </div>
      </div>
      <div class="ficha-id"><h2>${n}</h2><p class="${st.c}" ${st.attrs}>${esc(st.t)}</p></div>
      <dl class="kv">
        <div><dt>Visitas</dt><dd>${p.visits || 0}</dd></div>
        <div><dt>Tiempo jugado</dt><dd>${esc(fmtDur(p.totalMs))}</dd></div>
        <div><dt>Promedio por visita</dt><dd>${p.visits ? esc(fmtDur(p.totalMs / p.visits)) : '—'}</dd></div>
        <div><dt>Última vez</dt><dd>${esc(last)}</dd></div>
        <div><dt>Primera vez</dt><dd>${mias.length ? esc(fmtAgo(mias[mias.length - 1].start)) : 'Nunca'}</dd></div>
      </dl>
      <div class="ficha-mini">
        <span class="label">Sus últimos 14 días</span>
        <div class="mini">${dias.map((d) => `<i class="${d.ms ? '' : 'cero'}" style="--h:${d.ms ? Math.max(12, Math.round((d.ms / dmax) * 100)) : 0}%" data-tip="${esc(d.t)}\n§7${d.ms ? esc(fmtDur(d.ms)) : 'No jugó'}"></i>`).join('')}</div>
      </div>
      <div class="ficha-rol">
        <span class="label">Rol dentro del mundo</span>
        <div class="seg">${ROLES.map(([v, l]) => `<button class="${p.role === v && canRole ? 'on' : ''}" ${canRole ? '' : 'disabled'} data-act="players.role" data-arg="${n}" data-role="${v}">${l}</button>`).join('')}</div>
        <p class="help">${p.blocked ? 'Está bloqueado, así que no tiene rol.' : p.online ? 'Se le aplica al momento.' : 'Se le pone cada vez que entra al servidor.'}</p>
      </div>
      <div class="ficha-acts">${acts.join('')}</div>
      <div class="ficha-vis">
        <span class="label">Sus visitas${mias.length ? ` · ${mias.length}` : ''}</span>
        ${mias.length ? `<div class="fv-lista">${mias.slice(0, 40).map((v) => `<div class="fv"><span>${esc(fmtWhen(v.start))}</span><b class="${v.end ? '' : 'ok'}">${v.end ? esc(fmtDur(v.end - v.start)) : 'Sigue dentro'}</b></div>`).join('')}</div>` : '<p class="empty-s">Todavía no ha entrado al servidor.</p>'}
      </div>`;
  },
  update(part) {
    if (part === 'players' || part === 'props' || part === 'playit') {
      if ($('.btn.hold.pressing')) { S.pendingRows = true; return; }
      this.fill();
    }
  },
};

/* ---------- Visitas ---------- */
VIEWS.visitas = {
  html() {
    return `<div class="page full vis-p">
      <header class="page-h"><div class="ph"><span class="page-ico">${iso('estante', 32)}</span><div><h1>Visitas</h1><p class="sub">Quién entró, cuándo y cuánto se quedó</p></div></div></header>
      <section class="panel resumen" id="v-resumen"></section>
      <section class="panel" id="v-graf">
        <div class="panel-h"><span class="ph-ico">${iso('pasto', 24)}</span><h2>Últimos 14 días</h2><span class="count">Tiempo jugado por día</span></div>
        <div class="chart" id="v-chart"></div>
      </section>
      <div class="split vis">
        <section class="panel flush">
          <div class="panel-h pad"><span class="ph-ico">${iso('item:libro', 24)}</span><h2>Libro de visitas</h2><span class="count" id="v-count"></span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Jugador</th><th>Entró</th><th>Salió</th><th class="r">Se quedó</th></tr></thead><tbody id="v-rows"></tbody></table></div>
        </section>
        <section class="panel">
          <div class="panel-h"><span class="ph-ico">${iso('cabeza', 24)}</span><h2>Por jugador</h2><span class="count">En total</span></div>
          <div id="v-rank"></div>
        </section>
      </div>
    </div>`;
  },
  mount() { this.fill(); },
  fill() {
    const { daily, sessions } = S.snap.players;
    const weekAgo = Date.now() - 7 * 86400000;
    const week = daily.slice(-7).reduce((a, d) => a + d.ms, 0);
    const wk = sessions.filter((s) => s.start >= weekAgo);
    const per = {};
    for (const s of sessions) {
      const a = Math.max(s.start, weekAgo);
      const b = s.end || Date.now();
      if (b > a) per[s.name] = (per[s.name] || 0) + (b - a);
    }
    const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
    if (!$('#v-resumen')) return;
    $('#v-resumen').innerHTML = `
      <div><span class="label">Jugado esta semana</span><b data-cuenta="${week}" data-fmt="dur">${esc(fmtDur(week))}</b></div>
      <div><span class="label">Visitas esta semana</span><b data-cuenta="${wk.length}">${wk.length}</b></div>
      <div><span class="label">Quien más jugó</span><b class="quien">${top ? `${head(top[0], 'av sm')}${esc(top[0])}` : 'Nadie todavía'}</b></div>`;
    if ($('#vista > .v.entrando')) contar($('#v-resumen'));
    this.chart();
    $('#v-count').textContent = sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'visita' : 'visitas'}` : '';
    const fila = (s) => {
      const inNow = !s.end;
      const out = inNow ? 'Sigue dentro' : sameDay(s.start, s.end) ? dfTime.format(s.end) : fmtWhen(s.end);
      return `<tr>
        <td><span class="who">${head(s.name, 'av sm')}${esc(s.name)}</span></td>
        <td>${esc(fmtWhen(s.start))}</td>
        <td class="${inNow ? 'ok' : ''}">${esc(out)}</td>
        <td class="r ${inNow ? 'ok' : ''}" ${inNow ? `data-since="${s.start}" data-kind="dur"` : ''}>${fmtDur((s.end || Date.now()) - s.start)}</td>
      </tr>`;
    };
    // Primero las visitas que se ven; las más viejas se agregan después, para no trabar la animación.
    const filas = $('#v-rows');
    filas.innerHTML = sessions.length ? sessions.slice(0, 30).map(fila).join('') : '<tr><td colspan="4"><div class="empty"><p class="empty-t">Todavía no hay visitas</p><p class="empty-s">Cada vez que alguien entre al servidor quedará anotado aquí, con la hora y cuánto se quedó.</p></div></td></tr>';
    if (sessions.length > 30) setTimeout(() => { if (filas.isConnected) filas.insertAdjacentHTML('beforeend', sessions.slice(30, 300).map(fila).join('')); }, 2000);
    const rank = players().filter((p) => p.visits > 0).sort((a, b) => b.totalMs - a.totalMs);
    const tmax = Math.max(...rank.map((p) => p.totalMs), 1);
    $('#v-rank').innerHTML = rank.length ? rank.map((p) => `<div class="rank" data-tip="${esc(p.name)}\n§7${p.visits} ${p.visits === 1 ? 'visita' : 'visitas'} · ${esc(fmtDur(p.totalMs))}">
        ${head(p.name, 'av sm')}<span class="rank-n">${esc(p.name)}</span><b>${fmtDurShort(p.totalMs)}</b>
        <span class="rank-bar"><i style="width:${Math.max(3, (p.totalMs / tmax) * 100)}%"></i></span></div>`).join('')
      : '<p class="empty-s">Todavía nadie ha jugado.</p>';
  },
  // Torres de bloques: tan altas como quepan en el gráfico, y más grandes si hay espacio.
  chart() {
    const box = $('#v-chart');
    if (!box) return;
    const { daily } = S.snap.players;
    const s = box.clientWidth / 14 >= 90 ? 3 : 2;
    const alto = Math.max(0, box.clientHeight - 84);
    const maxN = Math.max(2, Math.min(14, Math.floor((alto - 8 * s) / (9.8 * s))));
    const max = Math.max(...daily.map((d) => d.ms), 1);
    const today = new Date().toDateString();
    box.innerHTML = daily.map((d, i) => {
      const dt = new Date(d.day);
      const isToday = dt.toDateString() === today;
      const n = d.ms ? Math.max(1, Math.round((d.ms / max) * maxN)) : 0;
      const tip = `${isToday ? 'Hoy' : clean(dt.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' }))}\n§7${d.ms ? fmtDur(d.ms) : 'Nadie jugó'}${d.people ? ` · ${d.people} ${d.people === 1 ? 'persona' : 'personas'}` : ''}`;
      return `<div class="bar ${isToday ? 'hoy' : ''} ${d.ms ? '' : 'cero'}" style="--i:${i}" data-tip="${esc(tip)}">
        <span class="bar-col"><span class="bar-v">${d.ms ? fmtDurShort(d.ms) : ''}</span>${n ? torre(n, isToday, s) : '<i class="vacio"></i>'}</span>
        <span class="bar-d"><small>${isToday ? 'hoy' : clean(dt.toLocaleDateString(LOC, { weekday: 'short' })).slice(0, 2)}</small>${dt.getDate()}</span>
      </div>`;
    }).join('');
    box.dataset.tam = `${box.clientWidth}x${box.clientHeight}`;
  },
  resize() { const c = $('#v-chart'); if (c && c.dataset.tam !== `${c.clientWidth}x${c.clientHeight}`) this.chart(); },
  update(part) { if (part === 'players') this.fill(); },
};

/* ---------- Mundos ---------- */
// Lista de mundos a la izquierda y el mundo elegido en grande a la derecha, con todo lo que se puede hacer.
VIEWS.mundos = {
  html() {
    return `<div class="page full">
      <header class="page-h">
        <div class="ph"><span class="page-ico">${iso('item:mundo', 32)}</span><div><h1>Mundos</h1><p class="sub" id="m-sub"></p></div></div>
        <div class="acts"><button class="btn" data-act="worlds.importFile">${ic('upload')}Importar .mcworld</button><button class="btn ghost" data-act="worlds.open" data-tip="Carpeta de mundos del servidor">${ic('folder')}Carpeta</button></div>
      </header>
      <div class="toolbar"><div class="tabs" id="m-tabs"></div></div>
      <div class="split crece">
        <section class="panel flush scroll" id="m-rows"></section>
        <aside class="panel mundo-det" id="m-det"></aside>
      </div>
    </div>`;
  },
  mount() {
    this.fill();
    // Al entrar se relee la carpeta por si algo cambió fuera de la app.
    api('worlds.list').then((l) => { S.snap.worlds = l; if (S.view === 'mundos') this.update('worlds'); }).catch(() => {});
  },
  packs: (w) => (w.packs ? `${w.packs} ${w.packs === 1 ? 'complemento' : 'complementos'}` : 'Sin complementos'),
  lista() {
    if (S.worldsTab === 'servidor') return S.snap.worlds.map((w) => ({ ...w, key: w.folder, titulo: w.folder }));
    return (S.mcWorlds || []).map((w) => ({ ...w, key: w.path, titulo: w.name }));
  },
  sel(list) {
    const k = S.worldsTab === 'servidor' ? S.selWorld : S.selMc;
    let w = list.find((x) => x.key === k);
    if (!w) w = list.find((x) => x.active) || list[0] || null;
    if (S.worldsTab === 'servidor') S.selWorld = w ? w.key : null; else S.selMc = w ? w.key : null;
    return w;
  },
  fill() {
    const box = $('#m-rows');
    if (!box) return;
    const n = S.snap.worlds.length;
    const w0 = activeWorld();
    $('#m-sub').textContent = w0 ? `El servidor usa «${w0.folder}»` : 'El servidor todavía no tiene mundo';
    $('#m-tabs').innerHTML = `<button class="tab ${S.worldsTab === 'servidor' ? 'on' : ''}" data-act="mundos-tab" data-val="servidor">En el servidor<span class="tab-n">${n}</span></button>
      <button class="tab ${S.worldsTab === 'minecraft' ? 'on' : ''}" data-act="mundos-tab" data-val="minecraft">En tu Minecraft${S.mcWorlds ? `<span class="tab-n">${S.mcWorlds.length}</span>` : ''}</button>`;
    const vacio = (t, s, b = '') => `<div class="empty"><p class="empty-t">${t}</p><p class="empty-s">${s}</p>${b}</div>`;
    if (S.worldsTab === 'minecraft' && !S.mcWorlds) {
      box.innerHTML = '<div class="empty"><span class="spin lg"></span><p class="empty-s">Buscando los mundos de Minecraft de este PC…</p></div>';
      $('#m-det').innerHTML = '';
      if (!S.mcLoading) {
        S.mcLoading = true;
        api('worlds.minecraft').then((l) => { S.mcWorlds = l; }).catch((e) => { S.mcWorlds = []; toast(e.message, 'error'); })
          .finally(() => { S.mcLoading = false; if (S.view === 'mundos') this.fill(); });
      }
      return;
    }
    const list = this.lista();
    const cur = this.sel(list);
    if (!list.length) {
      box.innerHTML = S.worldsTab === 'servidor'
        ? vacio('El servidor no tiene mundos', 'Trae uno de los tuyos desde «En tu Minecraft» o importa un archivo .mcworld.', `<button class="btn" data-act="mundos-tab" data-val="minecraft">${ic('search')}Ver mis mundos de Minecraft</button>`)
        : vacio('No encontré mundos', 'No hay mundos en las carpetas de Minecraft de este PC. Puedes importar un archivo .mcworld.');
      $('#m-det').innerHTML = '';
      return;
    }
    const thumb = (w) => `<span class="thumb">${w.icon ? `<img src="${w.icon}" alt="">` : iso('pasto', 32)}</span>`;
    box.innerHTML = list.map((w) => {
      const extra = S.worldsTab === 'servidor' ? (w.active ? badge('En uso', 'ok') : '') : (w.imported ? badge('En el servidor') : '');
      const meta = S.worldsTab === 'servidor' ? `Cambiado ${fmtAgo(w.mtime)} · ${fmtBytes(w.size)}` : `Jugado ${fmtAgo(w.mtime)} · ${fmtBytes(w.size)}`;
      return `<button class="wrow ${cur && cur.key === w.key ? 'sel' : ''} ${w.active ? 'activo' : ''}" data-act="msel" data-key="${esc(w.key)}">
        ${thumb(w)}<span class="wrow-t"><b>${esc(w.titulo)}</b><span>${esc(meta)}</span></span>${extra}
      </button>`;
    }).join('');
    this.detalle(cur);
  },
  detalle(w) {
    const box = $('#m-det');
    if (!box) return;
    if (!w) { box.innerHTML = ''; return; }
    const lock = running();
    const off = (why) => `disabled data-tip="${esc(why)}"`;
    const f = esc(w.key);
    const copias = S.snap.backups.filter((b) => b.world === w.folder).length;
    let titulo = `<h2>${esc(w.titulo)}</h2>`;
    let acts;
    if (S.worldsTab === 'servidor') {
      if (S.renaming === w.folder) titulo = `<form class="rename" data-form="rename" data-folder="${f}"><input class="field" name="name" value="${f}" maxlength="60" spellcheck="false" aria-label="Nombre del mundo"><button class="btn primary" type="submit">Guardar</button><button class="btn ghost" type="button" data-act="rename-cancel">Cancelar</button></form>`;
      acts = `${w.active ? `<p class="det-uso">${ic('check')}Es el mundo que usa el servidor</p>` : `<button class="btn primary grande" data-act="worlds.activate" data-arg="${f}" ${lock ? off('Cierra el servidor\n§7para cambiar de mundo') : ''}>${ic('play')}Usar este mundo</button>`}
        <div class="det-btns">
          <button class="btn" data-act="rename-start" data-arg="${f}" ${lock ? off('Cierra el servidor\n§7para renombrar') : ''}>${ic('edit')}Renombrar</button>
          <button class="btn" data-act="worlds.export" data-arg="${f}" ${w.active && lock ? off('Cierra el servidor\n§7para exportar este mundo') : 'data-tip="Guardar una copia como archivo .mcworld"'}>${ic('download')}Exportar</button>
          <button class="btn" data-act="worlds.open" data-arg="${f}">${ic('folder')}Carpeta</button>
          <button class="btn hold danger-t" data-act="worlds.remove" data-arg="${f}" ${w.active && lock ? off('Cierra el servidor\n§7para quitar este mundo') : 'data-tip="Mantén presionado para quitarlo\n§7Antes guardo una copia y lo mando a la papelera"'}><span class="hold-fill"></span>${ic('trash')}Quitar</button>
        </div>`;
    } else {
      acts = `<button class="btn primary grande" data-act="worlds.importFolder" data-arg="${f}" data-tip="Traer una copia al servidor\n§7Tu mundo de Minecraft no cambia">${ic('download')}${w.imported ? 'Traer otra copia al servidor' : 'Traer al servidor'}</button>
        <p class="help">Se copia al servidor con sus complementos. El mundo de tu Minecraft queda igual.</p>`;
    }
    const datos = S.worldsTab === 'servidor'
      ? [['Tamaño', fmtBytes(w.size)], ['Cambiado', fmtAgo(w.mtime)], ['Complementos', this.packs(w)], ['Copias de este mundo', String(copias)]]
      : [['Tamaño', fmtBytes(w.size)], ['Jugado', fmtAgo(w.mtime)], ['Complementos', this.packs(w)], ['En el servidor', w.imported ? 'Sí, ya hay una copia' : 'Todavía no']];
    box.innerHTML = `
      <div class="det-foto" style="--fondo:url(${w.icon || JUEGO.tex.fondo})">
        <div class="det-foto-in">${w.active ? badge('En uso', 'ok') : ''}${titulo}</div>
      </div>
      <dl class="det-datos">${datos.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="det-acts">${acts}</div>`;
    $('.rename input', box)?.select();
  },
  update(part) {
    if (part === 'worlds' || part === 'server' || part === 'backups') {
      if (part === 'worlds') S.mcWorlds = S.mcWorlds && S.mcWorlds.map((w) => ({ ...w, imported: S.snap.worlds.some((s) => (s.origin ? s.origin === w.path : s.name === w.name)) }));
      if (S.renaming && $('.rename')?.contains(document.activeElement)) return;
      if (!$('.btn.hold.pressing')) this.fill();
    }
  },
};

/* ---------- Copias ---------- */
const COFRE = { manual: 'cofreEnder', auto: 'cofre' };
VIEWS.copias = {
  html() {
    return `<div class="page full">
      <header class="page-h">
        <div class="ph"><span class="page-ico">${iso('cofre', 32)}</span><div><h1>Copias de seguridad</h1><p class="sub" id="c-sub"></p></div></div>
        <div class="acts"><button class="btn primary" data-act="backups.create" data-tip="Hacer una copia ahora\n§7Con el servidor abierto o cerrado, sin sacar a nadie">${ic('archive')}Hacer copia ahora</button><button class="btn ghost" data-act="backups.show">${ic('folder')}Carpeta</button></div>
      </header>
      <section class="panel opts" id="c-opts"></section>
      <section class="panel flush crece" id="c-rows"></section>
    </div>`;
  },
  mount() {
    this.fill();
    api('backups.list').then((l) => { S.snap.backups = l; if (S.view === 'copias') this.update('backups'); }).catch(() => {});
  },
  opts() {
    const st = S.snap.settings;
    return `<div class="opt"><div><b>Copia al abrir el servidor</b><span>Antes de que entre nadie</span></div>${sw(st.copiaAlAbrir, 'data-act="setting-toggle" data-key="copiaAlAbrir" aria-label="Copia al abrir el servidor"')}</div>
      <div class="opt"><div><b>Copias automáticas</b><span>Mientras está abierto</span></div>${select('copiaCadaHoras', 'Copias automáticas')}</div>
      <div class="opt"><div><b>Automáticas que guardo</b><span>Las más viejas se borran solas</span></div>${select('copiasGuardar', 'Automáticas que guardo')}</div>`;
  },
  fill() {
    const box = $('#c-rows');
    if (!box) return;
    if (!$('#c-opts').contains(document.activeElement)) $('#c-opts').innerHTML = this.opts();
    const L = S.snap.backups;
    const total = L.reduce((a, b) => a + b.size, 0);
    $('#c-sub').textContent = L.length ? `${L.length} ${L.length === 1 ? 'copia' : 'copias'} · ${fmtBytes(total)} · cada una es el mundo completo en un .zip` : 'Cada copia es el mundo completo en un .zip';
    if (!L.length) { box.innerHTML = '<div class="empty"><p class="empty-t">Todavía no hay copias</p><p class="empty-s">Haz la primera con «Hacer copia ahora». Se puede con el servidor abierto.</p></div>'; return; }
    const lock = running();
    box.innerHTML = L.map((b) => {
      const f = esc(b.file);
      const tone = b.type === 'manual' ? 'gold' : b.type === 'auto' ? '' : 'info';
      return `<div class="crow">
        <span class="crow-ico">${iso(COFRE[b.type] || 'barril', 32)}</span>
        <div class="crow-t"><b>${esc(b.world)}</b><span>${esc(fmtWhenFull(b.date))} · ${fmtBytes(b.size)}</span></div>
        ${badge(b.typeLabel, tone)}
        <div class="crow-a">
          <button class="btn sm hold" data-act="backups.restore" data-arg="${f}" ${lock ? 'disabled data-tip="Cierra el servidor\n§7para restaurar una copia"' : 'data-tip="Mantén presionado\n§7Antes guardo el mundo actual"'}><span class="hold-fill"></span>${ic('restart')}Restaurar</button>
          <button class="btn sm icon ghost" data-act="backups.show" data-arg="${f}" aria-label="Mostrar en la carpeta" data-tip="Mostrar en la carpeta">${ic('folder')}</button>
          <button class="btn sm icon ghost hold danger-t" data-act="backups.remove" data-arg="${f}" aria-label="Borrar" data-tip="Mantén presionado para borrarla\n§7Va a la papelera"><span class="hold-fill"></span>${ic('trash')}</button>
        </div>
      </div>`;
    }).join('');
  },
  update(part) {
    if (part === 'backups' || part === 'server' || part === 'settings') { if (!$('.btn.hold.pressing')) this.fill(); }
  },
};

/* ---------- Consola ---------- */
const QUICK = [['list', 'Quién está dentro', 'users'], ['time set day', 'Hacer de día', 'sun'], ['time set night', 'Hacer de noche', 'moon'], ['weather clear', 'Quitar la lluvia', 'cloud'], ['say Hola a todos', 'Saludar a todos', 'chat']];
VIEWS.consola = {
  html() {
    return `<div class="page full">
      <header class="page-h"><div class="ph"><span class="page-ico">${iso('comando', 32)}</span><div><h1>Consola</h1><p class="sub">Lo que pasa en el servidor y las respuestas a tus comandos</p></div></div><span id="c-estado"></span></header>
      <section class="term crece">
        <div class="term-log" id="log-in"><div id="log"></div></div>
        <div class="term-quick">${QUICK.map(([c, l, i]) => `<button class="chip" data-act="quick" data-cmd="${esc(c)}" data-tip="/${esc(c)}">${ic(i)}${esc(l)}</button>`).join('')}</div>
        <form class="term-in" data-form="cmd"><span class="term-pre">/</span><input name="cmd" id="cmd-in" placeholder="Escribe un comando, por ejemplo: say Hola a todos" spellcheck="false" autocomplete="off" aria-label="Comando"><button class="btn sm primary" type="submit">${ic('send')}Enviar</button></form>
      </section>
    </div>`;
  },
  mount() {
    $('#log').innerHTML = S.lines.length
      ? S.lines.slice(-700).map(this.line).join('')
      : '<div class="ln vacio">Cuando abras el servidor, aquí verás quién entra y sale, los avisos y las respuestas a tus comandos.</div>';
    const inn = $('#log-in');
    inn.scrollTop = inn.scrollHeight;
    this.state();
  },
  line(l) {
    const t = new Date(l.at);
    const z = (n) => String(n).padStart(2, '0');
    let cls = l.kind === 'cmd' ? 'CMD' : l.kind === 'app' ? (l.level === 'ERROR' ? 'ERROR' : 'APP') : esc(l.level);
    if (cls === 'INFO' && /Player (connected|disconnected|Spawned)/i.test(l.text)) cls = 'JOIN';
    return `<div class="ln ${cls}"><time>${z(t.getHours())}:${z(t.getMinutes())}:${z(t.getSeconds())}</time><span>${l.kind === 'cmd' ? '/' : ''}${esc(l.text)}</span></div>`;
  },
  append(l) {
    const log = $('#log');
    if (!log) return;
    const inn = $('#log-in');
    const stick = inn.scrollTop + inn.clientHeight >= inn.scrollHeight - 40;
    log.querySelector('.vacio')?.remove();
    log.insertAdjacentHTML('beforeend', this.line(l));
    while (log.children.length > 900) log.firstElementChild.remove();
    if (stick) inn.scrollTop = inn.scrollHeight;
  },
  state() {
    const el = $('#c-estado');
    if (!el) return;
    const st = estado();
    el.innerHTML = `<span class="pill ${st.c}"><i class="dot"></i>${esc(st.t)}</span>`;
    const busy = srv().state !== 'abierto';
    $$('.term-quick .chip').forEach((b) => { b.disabled = busy; });
  },
  update(part) { if (part === 'server') this.state(); },
};

/* ---------- Ajustes ---------- */
VIEWS.ajustes = {
  html() {
    return `<div class="page full">
      <header class="page-h"><div class="ph"><span class="page-ico">${iso('mesa', 32)}</span><div><h1>Ajustes</h1><p class="sub">Todo se guarda al cambiarlo</p></div></div></header>
      <p class="banner" id="aj-note" hidden>${ic('info')}<span>El servidor está abierto: los cambios del servidor se aplican la próxima vez que lo abras.</span></p>
      <div class="cols crece">
        <div><section class="panel"><div class="panel-h"><span class="ph-ico">${iso('comando', 24)}</span><h2>Servidor</h2></div><div id="aj-props"></div></section></div>
        <div>
          <section class="panel"><div class="panel-h"><span class="ph-ico">${iso('portal', 24)}</span><h2>Conexión con playit</h2><span id="aj-pst"></span></div><div id="aj-playit"></div></section>
          <section class="panel"><div class="panel-h"><span class="ph-ico">${iso('mesa', 24)}</span><h2>CraftAdmin</h2></div><div id="aj-app"></div></section>
        </div>
      </div>
    </div>`;
  },
  mount() {
    this.fill();
    api('entrada.info').then((i) => { S.entradaInfo = i; if (S.view === 'ajustes') this.fill(); }).catch(() => {});
  },
  fill() {
    if (!$('#aj-props')) return;
    $('#aj-note').hidden = !running();
    if (!$('#aj-props').contains(document.activeElement)) $('#aj-props').innerHTML = this.props();
    if (!$('#aj-playit').contains(document.activeElement)) $('#aj-playit').innerHTML = this.playit();
    $('#aj-pst').innerHTML = this.pst();
    $('#aj-app').innerHTML = this.app();
  },
  props() {
    return [
      setRow('Nombre del servidor', 'Lo ven tus amigos en la lista de servidores', `<input class="field" data-prop="server-name" value="${esc(prop('server-name') ?? '')}" maxlength="60" spellcheck="false" aria-label="Nombre del servidor">`),
      setRow('Modo de juego', 'Con el que entran tus amigos', select('gamemode', 'Modo de juego')),
      setRow('Dificultad', '', select('difficulty', 'Dificultad')),
      setRow('Trucos', 'Permite comandos dentro del juego', sw(prop('allow-cheats') === 'true', 'data-act="prop-toggle" data-key="allow-cheats" aria-label="Trucos"')),
      setRow('Jugadores a la vez', '', stepper('max-players', 'Jugadores a la vez')),
      setRow('Rol al entrar por primera vez', 'Después se cambia en Jugadores', select('default-player-permission-level', 'Rol al entrar')),
      setRow('Distancia de visión', 'Más alta gasta más memoria', stepper('view-distance', 'Distancia de visión')),
      setRow('Distancia de simulación', 'Chunks activos alrededor de cada jugador', stepper('tick-distance', 'Distancia de simulación')),
      setRow('Sacar a los inactivos', 'Minutos sin moverse antes de sacarlos', stepper('player-idle-timeout', 'Sacar a los inactivos')),
    ].join('');
  },
  pst() {
    const p = pl();
    const [t, c] = { conectado: ['Conectado', 'ok'], conectando: ['Conectando…', 'warn'], esperando: ['Esperando tu aprobación', 'warn'], error: ['Con error', 'bad'], apagado: ['Apagado', 'off'], 'sin-vincular': ['Sin conectar', 'off'], 'sin-programa': ['Falta el programa', 'bad'] }[p.state] || [p.state, 'off'];
    return badge(t, c);
  },
  playit() {
    const p = pl();
    let a;
    if (!p.linked) a = `<button class="btn primary" data-act="playit.link">${ic('link')}Conectar playit</button>`;
    else if (p.running) a = `<button class="btn" data-act="playit.stop">${ic('pause')}Apagar túnel</button>`;
    else a = `<button class="btn" data-act="playit.start">${ic('play')}Encender túnel</button>`;
    const auto = p.linked && p.automatico;
    if (auto) {
      return `<div class="set"><div class="set-t"><b>Dirección del túnel</b><span>CraftAdmin crea el túnel en playit y la llena sola</span></div>
          <div class="set-c inline">${p.address ? `<span class="addr-host mono">${esc(p.address)}</span>` : '<span class="help">Se arma al abrir el servidor</span>'}<button class="btn" data-act="playit.tunel">${ic('restart')}Revisar túnel</button></div></div>
        <div class="set"><div class="set-t"><b>Túnel</b><span>Es gratis y deja entrar a tus amigos sin tocar el router</span></div>
          <div class="set-c inline">${a}<button class="btn ghost" data-act="playit.dashboard">${ic('external')}Panel de playit</button></div></div>
        ${p.lastError ? `<p class="help pad bad">${esc(p.lastError)}</p>` : ''}`;
    }
    const viejo = p.linked && p.automatico === false
      ? `<button class="btn ghost" data-act="playit.link" data-tip="Conecta playit de nuevo para que el túnel de cada servidor se arme solo\n§eLa dirección para tus amigos cambia">${ic('link')}Que se arme solo</button>` : '';
    return `<div class="set"><div class="set-t"><b>Dirección del túnel</b><span>La que tus amigos ponen en Minecraft</span></div>
        <form class="set-c inline" data-form="addr"><input class="field mono" name="addr" placeholder="algo.ply.gg:12345" value="${esc(p.address)}" spellcheck="false" aria-label="Dirección del túnel"><button class="btn" type="submit">Guardar</button></form></div>
      <div class="set"><div class="set-t"><b>Túnel</b><span>Es gratis y deja entrar a tus amigos sin tocar el router</span></div>
        <div class="set-c inline">${a}<button class="btn ghost" data-act="playit.dashboard">${ic('external')}Panel de playit</button>${viejo}</div></div>
      ${this.entrada()}
      ${p.lastError ? `<p class="help pad bad">${esc(p.lastError)}</p>` : ''}`;
  },
  // La entrada para amigos de este servidor: el puerto que va en playit, la dirección UDP y la clave NetherNet.
  entrada() {
    const e = S.entradaInfo;
    if (!e) return '';
    const puerto = e.puerto ? `<span class="addr-port">${e.puerto}</span><button class="btn sm" data-act="as-copiar-puerto" data-v="${e.puerto}">${ic('copy')}Copiar</button>` : '<span class="help">Se asigna al guardar</span>';
    return `<div class="set"><div class="set-t"><b>Puerto local para playit</b><span>El que va en el túnel Minecraft Bedrock (NetherNet)</span></div><div class="set-c inline">${puerto}</div></div>
      <form class="set entrada-f" data-form="entrada">
        <div class="set-t"><b>Entrada para amigos</b><span>${e.conClave ? 'Tiene clave de playit guardada' : 'Pega lo que te da playit al crear el túnel'}</span></div>
        <div class="entrada-campos">
          <input class="field" name="udp" placeholder="Dirección UDP del túnel" value="${esc(e.udp || '')}" spellcheck="false" aria-label="Dirección UDP del túnel">
          <input class="field" name="token" type="password" placeholder="${e.conClave ? 'Clave guardada (escribe otra para cambiarla)' : 'Clave NetherNet de playit'}" spellcheck="false" autocomplete="off" aria-label="Clave NetherNet de playit">
          <button class="btn primary" type="submit">${ic('check')}Guardar entrada</button>
        </div>
      </form>`;
  },
  app() {
    const st = S.snap.settings;
    const u = S.snap.update;
    const ver = srv().version || st.versionServidor || 'sin instalar';
    let upd = `<button class="btn" data-act="update.check">${ic('search')}Buscar actualización</button>`;
    if (u && u.available) upd = `<button class="btn primary" data-act="update.install" ${running() ? 'disabled data-tip="Cierra el servidor\n§7para actualizar"' : ''}>${ic('download')}Actualizar a ${esc(u.latest)}</button>`;
    else if (u) upd = badge('Está al día', 'ok');
    const tog = (key, label) => sw(st[key], `data-act="setting-toggle" data-key="${key}" aria-label="${esc(label)}"`);
    return [
      setRow('Abrir el servidor al abrir CraftAdmin', 'Sin tener que darle al botón', tog('abrirAlIniciar', 'Abrir el servidor al abrir CraftAdmin')),
      setRow('Abrir el túnel con el servidor', 'Y apagarlo cuando el servidor se cierra', tog('tunelConServidor', 'Abrir el túnel con el servidor')),
      setRow('Volver a abrirlo si se cae', 'Hasta 3 veces en 10 minutos', tog('reiniciarSiCae', 'Volver a abrirlo si se cae')),
      setRow('Versión del servidor', `Bedrock ${esc(ver)}`, upd),
      setRow('Carpeta de este servidor', 'Servidor, copias, entrada y datos', `<button class="btn" data-act="openRoot">${ic('folder')}Abrir</button>`),
      ...(S.servidores?.elegido && S.servidores.elegido !== 'principal' ? [setRow('Quitar este servidor', 'Su carpeta va a la papelera, con su mundo y sus copias', `<button class="btn hold danger-t" data-act="servers.quitar" data-arg="${esc(S.servidores.elegido)}" ${running() ? 'disabled data-tip="Cierra el servidor\n§7para quitarlo"' : 'data-tip="Mantén presionado para quitarlo"'}><span class="hold-fill"></span>${ic('trash')}Quitar</button>`)] : []),
    ].join('');
  },
  update(part) {
    if (['props', 'playit', 'settings', 'update', 'server'].includes(part)) this.fill();
  },
};

/* =================================================================== */
/* Navegación                                                           */
/* =================================================================== */
// El bloque verde de la barra rápida se desliza hasta la casilla de la sección elegida.
function moverSel(sinAnim) {
  const sel = $('#nav-sel');
  const slot = $('#nav button.on .slot');
  if (!sel || !slot) return;
  const n = $('#nav').getBoundingClientRect();
  const r = slot.getBoundingClientRect();
  sel.classList.toggle('sin-anim', !!sinAnim);
  sel.style.setProperty('--x', `${Math.round(r.left - n.left)}px`);
  sel.style.setProperty('--y', `${Math.round(r.top - n.top)}px`);
  if (sinAnim) requestAnimationFrame(() => requestAnimationFrame(() => sel.classList.remove('sin-anim')));
}

function go(view, first = false) {
  if (!['nuevo', 'acceso', 'cuenta'].includes(view) && S.servidores && !S.servidores.lista.length) view = 'nuevo';
  if (!VIEWS[view] || (!first && view === S.view)) return;
  S.view = view;
  S.renaming = null;
  tipHide();
  cerrarMenu(true);
  // En la lista de servidores (y al crear uno) arriba solo queda «Servidores»; dentro de uno aparecen sus secciones.
  const casilla = view === 'nuevo' ? 'servidores' : view;
  // Al entrar o crear cuenta no se ve la barra de secciones; en la lista y en tu cuenta, solo «Servidores».
  document.body.dataset.zona = view === 'acceso' ? 'acceso' : ['servidores', 'cuenta'].includes(casilla) ? 'lista' : 'srv';
  pintarCuenta();
  $$('#nav [data-view]').forEach((b) => { const on = b.dataset.view === casilla; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  moverSel(first);
  const poner = () => {
    const vista = $('#vista');
    vista.innerHTML = `<div class="v v-${view} entrando">${VIEWS[view].html()}</div>`;
    vista.scrollTop = 0;
    VIEWS[view].mount?.();
  };
  // La sección de antes se desvanece mientras la nueva entra por partes.
  if (!first && document.startViewTransition) {
    const vt = document.startViewTransition(poner);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  }
  else poner();
  // Las animaciones de entrada solo corren al llegar; lo que se actualiza después no vuelve a animarse.
  clearTimeout(S.entT);
  S.entT = setTimeout(() => $('#vista > .v')?.classList.remove('entrando'), 1900);
}

// Vuelve a correr la entrada animada de una parte, por ejemplo al cambiar de pestaña.
function animar(el) {
  if (!el) return;
  el.classList.remove('entrando');
  void el.offsetWidth;
  el.classList.add('entrando');
  clearTimeout(el._anim);
  el._anim = setTimeout(() => el.classList.remove('entrando'), 900);
}

// Los números suben desde cero, como un contador.
function contar(box) {
  const els = $$('[data-cuenta]', box);
  if (!els.length) return;
  const t0 = performance.now();
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / 1000);
    const e = 1 - Math.pow(1 - k, 4);
    for (const el of els) {
      const v = Number(el.dataset.cuenta) * e;
      el.textContent = el.dataset.fmt === 'dur' ? fmtDur(v) : String(Math.round(v));
    }
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function renderSide() {
  pintarSelector();
}
function refresh(part) {
  VIEWS[S.view]?.update?.(part);
  if (['server', 'players', 'props'].includes(part)) renderSide();
}

function renderBusy() {
  const b = S.snap.busy;
  const el = $('#ocupado');
  el.hidden = !b;
  if (b) {
    el.classList.toggle('indet', b.progress == null);
    el.style.setProperty('--p', b.progress ?? 0);
  }
  renderSide();
}

/* =================================================================== */
/* Acciones                                                             */
/* =================================================================== */
async function act(name, ds) {
  const arg = ds.arg;
  if (name.startsWith('as-')) return accionAsistente(name, ds);
  if (name.startsWith('ac-')) return accionAcceso(name, ds);
  switch (name) {
    case 'sv-copiar': {
      await call('copy', ds.v);
      toast('Dirección copiada. Pásasela a tus amigos', 'info', 'portal');
      const b = $('[data-act="sv-copiar"]');
      if (b && !b.classList.contains('hecho')) {
        const antes = b.innerHTML;
        b.classList.add('hecho');
        b.innerHTML = `${ic('check')}¡Copiada!`;
        setTimeout(() => { if (b.isConnected) { b.classList.remove('hecho'); b.innerHTML = antes; } }, 1600);
      }
      return;
    }
    case 'sv-carpeta': quiet(call('servers.folder', ds.v)); return;
    case 'servers.quitar': {
      const snap = await call('servers.remove', arg).catch(() => null);
      if (snap) { aplicarSnap(snap); toast('El servidor quedó en la papelera', 'info', 'cofre'); S.view = null; go(S.servidores.lista.length ? 'servidores' : 'nuevo'); }
      return;
    }
    case 'copy-addr': {
      await call('copy', pl().address);
      toast('Dirección copiada. Pásasela a tus amigos', 'info', 'casa');
      // El botón confirma un momento que ya se copió.
      const b = $('[data-act="copy-addr"]');
      if (b && !b.classList.contains('hecho')) {
        const antes = b.innerHTML;
        b.classList.add('hecho');
        b.innerHTML = `${ic('check')}¡Copiada!`;
        setTimeout(() => { if (b.isConnected) { b.classList.remove('hecho'); b.innerHTML = antes; } }, 1600);
      }
      return;
    }
    case 'filter': S.filter = ds.val; VIEWS.jugadores.fill(); animar($('#j-list')); return;
    case 'foco-agregar': $('.add-form .field')?.focus(); return;
    case 'sel':
      S.selPlayer = ds.key;
      $$('#j-list .prow').forEach((r) => r.classList.toggle('sel', r.dataset.key === ds.key));
      VIEWS.jugadores.ficha();
      return;
    case 'mundos-tab': S.worldsTab = ds.val; S.renaming = null; VIEWS.mundos.fill(); animar($('#m-rows')); return;
    case 'msel': {
      if (S.worldsTab === 'servidor') S.selWorld = ds.key; else S.selMc = ds.key;
      S.renaming = null;
      $$('#m-rows .wrow').forEach((r) => r.classList.toggle('sel', r.dataset.key === ds.key));
      VIEWS.mundos.detalle(VIEWS.mundos.lista().find((x) => x.key === ds.key));
      animar($('#m-det'));
      return;
    }
    case 'rename-start': S.renaming = arg; VIEWS.mundos.fill(); return;
    case 'rename-cancel': S.renaming = null; VIEWS.mundos.fill(); return;
    case 'quick': quiet(call('server.send', ds.cmd)); return;
    case 'allow-toggle': await quiet(call('players.allowlist', !S.snap.players.allowlistOn)); return;
    case 'setting-toggle': await quiet(call('settings.set', { [ds.key]: !S.snap.settings[ds.key] })); return;
    case 'prop-toggle': await quiet(call('props.set', { [ds.key]: prop(ds.key) === 'true' ? 'false' : 'true' })); return;
    case 'step': {
      const d = STEPS[ds.key];
      const cur = Number(prop(ds.key)) || 0;
      const v = Math.min(d.max, Math.max(d.min, cur + Number(ds.d)));
      if (v !== cur) await quiet(call('props.set', { [ds.key]: v }));
      return;
    }
    case 'players.role': await quiet(call('players.role', arg, ds.role)); return;
    case 'players.add': {
      const added = await call('players.add', arg).catch(() => null);
      if (added) toast(`${arg} ya puede entrar`, 'info', 'cabeza');
      return;
    }
    case 'players.remove': await quiet(call('players.remove', arg)); toast(`${arg} ya no está en la lista`, 'info', 'lista'); return;
    case 'players.block': await quiet(call('players.block', arg)); toast(`${arg} quedó bloqueado`, 'info', 'barrera'); return;
    case 'players.unblock': await quiet(call('players.unblock', arg)); toast(`${arg} ya no está bloqueado. Agrégalo a la lista si quieres que vuelva`, 'info', 'cabeza'); return;
    case 'players.kick': await quiet(call('players.kick', arg)); return;
    case 'worlds.importFolder': {
      const r = await call('worlds.importFolder', arg).catch(() => null);
      if (r) {
        toast(r.packs?.copied?.length ? `Mundo traído con ${r.packs.copied.join(', ')}` : 'Mundo traído al servidor', 'info', 'bloque');
        if (r.packs?.missing?.length) toast(`No encontré ${r.packs.missing.length} complemento(s) que usa el mundo`, 'error');
        S.mcWorlds = null;
        if (!S.snap.worlds.some((w) => w.active)) toast('Ahora dale a «Usar este mundo» en la pestaña En el servidor', 'info', 'bloque');
      }
      return;
    }
    case 'worlds.importFile': {
      const r = await call('worlds.importFile').catch(() => null);
      if (r) toast('Mundo importado al servidor', 'info', 'bloque');
      return;
    }
    case 'worlds.activate': await quiet(call('worlds.activate', arg)); toast(`Ahora el servidor usa «${arg}»`, 'info', 'bloque'); return;
    case 'worlds.remove': {
      const ok = await call('worlds.remove', arg).then(() => true).catch(() => false);
      if (ok) toast(`«${arg}» está en la papelera y quedó una copia en Copias`, 'info', 'cofre');
      return;
    }
    case 'worlds.export': { const f = await call('worlds.export', arg).catch(() => null); if (f) toast('Mundo exportado', 'info', 'bloque'); return; }
    case 'backups.create': {
      const r = await call('backups.create').catch(() => null);
      if (r) toast(r.pruned ? `Copia lista. Borré ${r.pruned} automática(s) vieja(s)` : 'Copia lista', 'info', 'cofre');
      return;
    }
    case 'backups.restore': { const w = await call('backups.restore', arg).catch(() => null); if (w) toast(`«${w}» volvió a como estaba en esa copia`, 'info', 'cofre'); return; }
    case 'backups.remove': await quiet(call('backups.remove', arg)); toast('Copia enviada a la papelera', 'info', 'cofre'); return;
    case 'update.check': { const u = await call('update.check').catch(() => null); if (u && !u.available) toast(`El servidor está al día (${u.current})`, 'info', 'engranaje'); return; }
    case 'update.install': { const v = await call('update.install').catch(() => null); if (v) toast(`Servidor ${v} listo`, 'info', 'engranaje'); return; }
    case 'skins.set': { const ok = await call('skins.set', arg).catch(() => false); if (ok) toast(`La skin de ${arg} quedó puesta`, 'info', 'cabeza'); return; }
    case 'server.start': quiet(call('server.start')); return;
    case 'playit.tunel': { const ok = await call('playit.tunel').catch(() => false); if (ok) toast('El túnel de playit está listo', 'info', 'portal'); return; }
    default:
      await quiet(call(name, ...(arg !== undefined ? [arg] : [])));
  }
}

document.addEventListener('click', (e) => {
  if (clicServidores(e)) return;
  const op = e.target.closest('#menu .menu-op');
  if (op) {
    const key = MENU.key;
    const btn = cerrarMenu();
    if (key && op.dataset.val !== valorSel(key)) {
      if (btn?.isConnected) $('.desp-v', btn).textContent = op.textContent;
      elegir(key, op.dataset.val);
    }
    btn?.focus({ preventScroll: true });
    return;
  }
  const desp = e.target.closest('.desp-btn');
  if (desp) { abrirMenu(desp); return; }
  if (MENU.btn && !e.target.closest('#menu')) cerrarMenu();
  const nav = e.target.closest('[data-view]');
  if (nav) { if (nav.dataset.sel) S.selPlayer = nav.dataset.sel; go(nav.dataset.view); return; }
  const toque = e.target.closest('.btn, .chip, .tab, .seg button, .nav .slot');
  if (toque && !toque.disabled) { toque.classList.remove('golpe'); void toque.offsetWidth; toque.classList.add('golpe'); }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.classList.contains('hold')) return;
  act(el.dataset.act, el.dataset);
});

// Listas desplegables y el nombre del servidor.
document.addEventListener('change', (e) => {
  const s = e.target.closest('[data-sel-key]');
  if (s) {
    const d = SELECTS[s.dataset.selKey];
    if (d.k === 'setting') quiet(call('settings.set', { [s.dataset.selKey]: /^\d+$/.test(s.value) ? Number(s.value) : s.value }));
    else quiet(call('props.set', { [s.dataset.selKey]: s.value }));
    return;
  }
  const el = e.target.closest('[data-prop]');
  if (el) quiet(call('props.set', { [el.dataset.prop]: el.value }));
});

// Mantener presionado para confirmar.
function startHold(b) {
  if (!b || b.disabled || b.classList.contains('pressing')) return;
  b.classList.add('pressing');
  b._t = setTimeout(() => {
    b.classList.remove('pressing');
    act(b.dataset.act, b.dataset).finally(() => { if (S.pendingRows) { S.pendingRows = false; refresh('players'); } });
  }, 950);
}
function stopHold(b) {
  if (!b) return;
  clearTimeout(b._t);
  b.classList.remove('pressing');
}
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn.hold');
  if (!b || e.button !== 0) return;
  startHold(b);
  const end = () => { stopHold(b); b.removeEventListener('pointerup', end); b.removeEventListener('pointerleave', end); };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointerleave', end);
});
document.addEventListener('keydown', (e) => {
  const b = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && b?.classList?.contains('hold')) { e.preventDefault(); if (!e.repeat) startHold(b); }
});
document.addEventListener('keyup', (e) => {
  const b = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && b?.classList?.contains('hold')) stopHold(b);
});

// Con el menú abierto: flechas para moverse, Enter para elegir y Escape para cerrarlo.
document.addEventListener('keydown', (e) => {
  if (!MENU.btn) return;
  const ops = $$('#menu .menu-op');
  const i = ops.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    ops[(i + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length].focus();
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    cerrarMenu()?.focus({ preventScroll: true });
  } else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
window.addEventListener('resize', () => cerrarMenu(true));
document.addEventListener('scroll', (e) => { if (MENU.btn && !e.target.closest?.('#menu')) cerrarMenu(true); }, true);
window.addEventListener('blur', () => cerrarMenu(true));

// Teclas 1 a 7 cambian de sección.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || MENU.btn) return;
  if (e.key === 'Escape' && S.renaming) { S.renaming = null; VIEWS.mundos.fill(); return; }
  if (e.target.closest?.('input, textarea, select') || document.body.dataset.zona !== 'srv') return;
  const n = Number(e.key);
  if (n >= 1 && n <= ORDER.length) go(ORDER[n - 1]);
});

// Formularios.
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'cuenta-nombre') {
    const n = f.elements.nombre.value.trim();
    if (!n) return;
    const u = await call('cuenta.nombre', n).catch(() => null);
    if (u) { S.cuenta.usuario = u; pintarCuenta(); toast('Nombre guardado', 'info', 'cabeza'); S.view = null; go('cuenta'); }
    return;
  }
  if (kind === 'add') {
    const inp = f.elements.name;
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    const added = await call('players.add', name).catch(() => undefined);
    if (added === undefined) return;
    toast(added ? `${name} ya puede entrar` : `${name} ya estaba en la lista`, 'info', 'cabeza');
    S.selPlayer = name.toLowerCase();
    inp.value = '';
  }
  if (kind === 'entrada') {
    const r = await call('entrada.set', { udp: f.elements.udp.value, token: f.elements.token.value }).catch(() => null);
    if (r) { S.entradaInfo = r; toast('Entrada guardada. Se usa la próxima vez que abras el servidor', 'info', 'portal'); document.activeElement?.blur(); VIEWS.ajustes.fill(); }
  }
  if (kind === 'addr') {
    const v = await call('playit.address', f.elements.addr.value).catch(() => null);
    if (v !== null) { toast(v ? 'Dirección guardada' : 'Dirección borrada', 'info', 'casa'); document.activeElement?.blur(); refresh('playit'); }
  }
  if (kind === 'rename') {
    const r = await call('worlds.rename', f.dataset.folder, f.elements.name.value).catch(() => null);
    if (r) { S.renaming = null; toast(`El mundo ahora se llama «${r}»`, 'info', 'bloque'); VIEWS.mundos.fill(); }
  }
  if (kind === 'cmd') {
    const inp = f.elements.cmd;
    const v = inp.value.trim().replace(/^\//, '');
    if (!v) return;
    S.hist.push(v); S.histIdx = S.hist.length;
    const ok = await call('server.send', v).then(() => true).catch(() => false);
    if (ok) inp.value = '';
  }
});
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el.matches?.('[data-prop]') && e.key === 'Enter') el.blur();
  if (el.id === 'cmd-in' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (!S.hist.length) return;
    e.preventDefault();
    S.histIdx = Math.max(0, Math.min(S.hist.length, S.histIdx + (e.key === 'ArrowUp' ? -1 : 1)));
    el.value = S.hist[S.histIdx] || '';
  }
});

/* ---------- Eventos del proceso principal ---------- */
window.posada.on(({ type, data }) => {
  if (!S.snap) return;
  switch (type) {
    case 'server': {
      const prev = S.snap.server.state;
      S.snap.server = data;
      if (prev !== data.state || S.view !== 'inicio') refresh('server');
      else { VIEWS.inicio.metrics(); renderSide(); }
      break;
    }
    case 'line':
      S.lines.push(data);
      if (S.lines.length > 2500) S.lines.splice(0, S.lines.length - 2500);
      if (S.view === 'consola') VIEWS.consola.append(data);
      break;
    case 'players': S.snap.players = data; refresh('players'); break;
    case 'playit': S.snap.playit = data; refresh('playit'); break;
    case 'proxy': S.snap.proxy = data; refresh('playit'); break;
    case 'worlds': S.snap.worlds = data; refresh('worlds'); renderSide(); break;
    case 'backups': S.snap.backups = data; refresh('backups'); break;
    case 'props': S.snap.props = data; refresh('props'); break;
    case 'settings': S.snap.settings = data; refresh('settings'); break;
    case 'busy': S.snap.busy = data; renderBusy(); VIEWS[S.view]?.update?.('busy'); break;
    case 'servidores': recibirServidores(data); break;
    case 'cuenta': recibirCuenta(data); break;
    case 'update': S.snap.update = data; refresh('update'); break;
    case 'toast': toast(data.text, data.tone); break;
    case 'skins': cargarSkins(data).then(() => { VIEWS[S.view]?.update?.('players'); renderSide(); precalentar(); }); break;
    case 'closing': $('#cierre').hidden = false; break;
    case 'window': document.body.classList.toggle('max', !!data?.maximized); break;
    default: break;
  }
});

// Duraciones en vivo.
setInterval(() => {
  for (const el of $$('[data-since]')) el.textContent = sinceText(el.dataset.kind, el.dataset.since);
}, 15000);
setInterval(() => { if (S.view === 'inicio') VIEWS.inicio.metrics(); }, 5000);

// Si la ventana no es muy ancha, arriba solo se ve el nombre de la sección elegida.
const estrecho = () => {
  document.body.classList.toggle('compacto', innerWidth < 1760);
  document.body.classList.toggle('mini', innerWidth < 1120);
  moverSel(true);
};
let resizeT = 0;
window.addEventListener('resize', () => {
  estrecho();
  clearTimeout(resizeT);
  resizeT = setTimeout(() => VIEWS[S.view]?.resize?.(), 150);
});

/* ---------- Arranque ---------- */
(async () => {
  document.documentElement.style.setProperty('--m-x', `url(${JUEGO.ic.x.u})`);
  S.snap = await api('snapshot');
  S.servidores = S.snap.servidores;
  S.lines = S.snap.lines || [];
  await cargarSkins(await api('skins.list').catch(() => ({})));
  document.documentElement.style.setProperty('--tex-pasto', `url(${texturas().pastoL.toDataURL()})`);
  $$('[data-iso]').forEach((el) => { el.innerHTML = iso(el.dataset.iso, 32); });
  renderBusy();
  [S.cuenta, S.pielJuego] = await Promise.all([api('cuenta.estado').catch(() => ({ usuario: null, sinConexion: true })), api('cuenta.pielJuego').catch(() => null)]);
  await cargarPieles();
  go(!S.cuenta.usuario && !S.cuenta.sinConexion ? 'acceso' : S.servidores.lista.length ? 'servidores' : 'nuevo', true);
  estrecho();
  // Cuando terminan de cargar las letras del juego cambian los anchos: se vuelve a poner el bloque verde.
  document.fonts.ready.then(() => moverSel(true));
  precalentar();
})();

// En los ratos libres se dibujan de antemano las figuras, caras y torres, para que la primera vez
// que se abre cada sección la animación no se trabe.
function precalentar() {
  const tareas = [];
  for (const p of players()) {
    tareas.push(() => head(p.name, 'av'), () => head(p.name, 'av sm'), () => skin3d(p.name, 150, 275), () => skin3d(p.name, 72, 133, 'fig-img'));
  }
  for (const s of [2, 3]) for (let n = 1; n <= 14; n++) tareas.push(() => torre(n, false, s), () => torre(n, true, s));
  for (const w of S.snap.worlds) if (w.icon) tareas.push(() => { const im = new Image(); im.src = w.icon; im.decode().catch(() => {}); });
  const correr = (dl) => {
    while (tareas.length && dl.timeRemaining() > 6) tareas.shift()();
    if (tareas.length) requestIdleCallback(correr, { timeout: 2000 });
  };
  requestIdleCallback(correr, { timeout: 2000 });
}
