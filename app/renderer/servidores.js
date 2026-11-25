'use strict';
// Varios servidores: la pantalla con todos tus servidores, la vista previa de cada uno y el asistente para crear otro.
// Se carga antes que app.js; todo lo de aquí usa lo de app.js recién cuando se llama.

/* =================================================================== */
/* Pantalla de servidores                                               */
/* =================================================================== */
const estadoDe = (x) => {
  if (!x.installed) return ['Sin instalar', 'bad'];
  if (x.state === 'arrancando') return ['Abriendo…', 'warn'];
  if (x.state === 'cerrando') return ['Cerrando…', 'warn'];
  if (x.state === 'abierto') return ['En línea', 'ok'];
  return ['Cerrado', 'off'];
};
const listaSrv = () => S.servidores?.lista || [];
const elegidoActual = () => listaSrv().find((x) => x.id === S.servidores.elegido) || null;
const nombreModo = (v) => (MODOS.find(([k]) => k === v) || [0, 'Supervivencia'])[1];
const nombreDificultad = (v) => (DIFICULTADES.find(([k]) => k === v) || [0, 'Normal'])[1];

// Barras de señal como las de la lista de servidores del juego: verdes si está abierto,
// se encienden una tras otra mientras abre y quedan apagadas con una cruz si está cerrado.
const senal = (x) => {
  const c = x.state === 'abierto' ? 'ok' : x.state === 'arrancando' || x.state === 'cerrando' ? 'buscando' : 'off';
  return `<i class="senal ${c}"><b></b><b></b><b></b><b></b></i>`;
};

// En la barra de arriba, al lado de «Servidores»: el servidor en el que estás.
function pintarSelector() {
  const el = $('#nav-srv');
  if (!el || !S.snap) return;
  const cur = elegidoActual();
  if (!cur) { el.innerHTML = ''; return; }
  const [t, c] = estadoDe(cur);
  const sub = cur.state === 'abierto' ? `${t} · ${cur.online} de ${cur.max} jugando` : t;
  el.className = `nav-srv ${c}`;
  el.dataset.tip = `${cur.nombre}\n${c === 'ok' ? '§a' : '§7'}${sub}`;
  el.innerHTML = `${ic('chevronRight', 'ic nav-srv-f')}<i class="dot"></i><b>${esc(cur.nombre)}</b>`;
}

const VISTA_SERVIDORES = {
  // La pantalla tiene siempre la misma forma: arriba lo de todos tus servidores, a la izquierda la lista
  // (con casillas libres donde caben más) y la semana, y a la derecha el servidor elegido.
  html() {
    return `<div class="page full servs">
      <header class="page-h">
        <div class="ph"><span class="page-ico">${iso('lamparaOn', 32)}</span><div><h1>Tus servidores</h1><p class="sub" id="sv-sub"></p></div></div>
        <div class="acts sv-acts-h"><div class="sv-resumen" id="sv-todos"></div><button class="btn primary grande" data-srv-nuevo>${ic('plus')}Crear servidor</button></div>
      </header>
      <div class="sv-split crece">
        <div class="sv-col">
          <section class="panel flush scroll sv-lista" id="sv-lista" role="listbox" aria-label="Tus servidores"></section>
          <section class="panel sv-semana-p">
            <div class="panel-h"><span class="ph-ico">${iso('pasto', 24)}</span><h2>Esta semana</h2><span class="count">entre todos<span id="sv-sem-total"></span></span></div>
            <div class="sv-dias" id="sv-chart"></div>
          </section>
        </div>
        <section class="sv-prev" id="sv-prev"></section>
      </div>
    </div>`;
  },
  mount() {
    if (!listaSrv().some((x) => x.id === S.srvVer)) S.srvVer = S.servidores.elegido || listaSrv()[0]?.id;
    this.fill();
    this.cargar();
    this.cargarActividad();
  },
  // Pide los datos completos del servidor que se está mirando.
  async cargar() {
    const id = S.srvVer;
    if (!id) return;
    const d = await api('servers.detail', id).catch(() => null);
    if (!d || S.view !== 'servidores' || S.srvVer !== id) return;
    S.srvDet = d;
    this.vivo();
  },
  fill() {
    const lista = listaSrv();
    const abiertos = lista.filter((x) => x.state === 'abierto').length;
    $('#sv-sub').textContent = `${lista.length} ${lista.length === 1 ? 'servidor' : 'servidores'} · ${abiertos ? `${abiertos} ${abiertos === 1 ? 'abierto' : 'abiertos'}` : 'todos cerrados'}`;
    this.filas();
    this.todos();
    this.grafico();
    this.prev(false);
    this.acomodar();
  },
  // Lo que sobra de la lista lo ocupa la islita, que se achica o se esconde sola (por CSS) al llenarse la lista.
  acomodar() {},
  filas() {
    const box = $('#sv-lista');
    if (!box) return;
    box.innerHTML = listaSrv().map((x, i) => {
      const [t, c] = estadoDe(x);
      const sel = x.id === S.srvVer;
      return `<button class="sv-row ${c} ${sel ? 'sel' : ''}" style="--i:${i}" data-sv="${esc(x.id)}" role="option" aria-selected="${sel}">
        <span class="sv-thumb">${x.icon ? `<img src="${x.icon}" alt="" draggable="false">` : iso('pasto', 40)}</span>
        <span class="sv-row-t"><b><span class="sv-nombre">${esc(x.nombre)}</span>${x.id === S.servidores.elegido ? '<em data-tip="Es el que estás administrando">Aquí</em>' : ''}</b>
          <span class="sv-st"><i class="dot"></i>${esc(t)}<span class="sv-modo"> · ${esc(nombreModo(x.modo))}</span></span></span>
        <span class="sv-ping">${x.state === 'abierto' ? `<small>${x.online}/${x.max}</small>` : ''}${senal(x)}</span>
      </button>`;
    }).join('') + `<button class="sv-nuevo" data-srv-nuevo>${iso('pasto', 24)}<span>Crear servidor nuevo</span>${ic('plus')}</button><div class="sv-vacio"><button class="sv-isla" data-srv-nuevo data-tip="Crear servidor nuevo\n§7Cada uno con su mundo, sus copias y su entrada"><img src="${diorama(192)}" alt="" draggable="false"><i class="sv-isla-sombra"></i></button><p class="sv-vacio-t">Aquí caben más servidores</p></div>`;
  },
  // Arriba, junto a «Crear servidor»: quién juega en todos, cuáles están abiertos (una lámpara por
  // servidor, prendida si está abierto) y el túnel de playit que comparten.
  todos() {
    const box = $('#sv-todos');
    if (!box) return;
    const lista = listaSrv();
    const jugando = lista.reduce((n, x) => n + (x.state === 'abierto' ? x.online : 0), 0);
    const abiertos = lista.filter((x) => x.state === 'abierto').length;
    const p = pl();
    const tunel = ({ conectado: ['Conectado', 'ok'], conectando: ['Conectando…', 'warn'], esperando: ['Esperando que lo apruebes', 'warn'], error: ['Con un error', 'bad'], 'sin-programa': ['Falta el programa', 'bad'], 'sin-vincular': ['Sin conectar', 'off'] })[p.state] || ['Apagado', 'off'];
    // Con muchos servidores solo se ven las lámparas prendidas, para que quepan.
    const lamparas = (lista.length > 5 ? lista.filter((x) => x.state === 'abierto').slice(0, 5) : lista).map((x, i) => `<span class="sv-lamp ${x.state === 'abierto' ? 'on' : ''}" style="--i:${i}" data-tip="${esc(x.nombre)}\n${x.state === 'abierto' ? '§aAbierto' : '§7Cerrado'}">${iso(x.state === 'abierto' ? 'lamparaOn' : 'lampara', 24)}</span>`).join('');
    box.innerHTML = `<div class="sv-chip"><span>Jugando ahora</span><b>${jugando}</b></div>
      <div class="sv-chip"><span>Abiertos</span><b>${abiertos} de ${lista.length}<span class="sv-lamps">${lamparas}</span></b></div>
      <div class="sv-chip sv-chip-p"><span class="sv-playit-ico">${iso('portal', 24)}</span>
        <span class="sv-playit-t"><span>Túnel de playit</span><b class="${tunel[1]}"><i class="dot"></i>${tunel[0]}</b></span>
        <button class="btn sm ghost icon" data-act="playit.dashboard" data-tip="Abrir playit en el navegador\n§7Lo comparten todos tus servidores" aria-label="Abrir playit">${ic('external')}</button></div>`;
  },
  // Lo jugado cada día de esta semana en todos tus servidores: una fila por día con 10 casillas,
  // como la barra de vida o de hambre del juego; cada bloque de pasto es una parte de lo jugado.
  grafico() {
    const box = $('#sv-chart');
    if (!box) return;
    const dias = S.srvAct?.dias || [];
    if (!dias.length) { box.innerHTML = ''; return; }
    // Si en toda la semana se jugó poco, la escala no baja de 2 horas para que un rato corto no llene la fila.
    const tope = Math.max(...dias.map((d) => d.ms), 2 * 3600e3);
    const total = dias.reduce((n, d) => n + d.ms, 0);
    const t = $('#sv-sem-total');
    if (t) t.textContent = total ? ` · ${fmtDur(total)}` : '';
    const hoy = new Date().toDateString();
    const lleno = iso('pasto', 16);
    const vacio = lleno.replace('class="iso px"', 'class="iso px vacio"');
    box.innerHTML = dias.map((d, i) => {
      const dt = new Date(d.day);
      const esHoy = dt.toDateString() === hoy;
      const n = d.ms ? Math.max(1, Math.round((d.ms / tope) * 10)) : 0;
      const tip = `${esHoy ? 'Hoy' : clean(dt.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' }))}\n§7${d.ms ? `${fmtDur(d.ms)}${d.people ? ` · ${d.people} ${d.people === 1 ? 'persona' : 'personas'}` : ''}` : 'Nadie jugó'}`;
      return `<div class="sv-dia ${esHoy ? 'hoy' : ''} ${n ? '' : 'nada'}" style="--i:${i}" data-tip="${esc(tip)}">
        <span class="sv-dia-d"><small>${esHoy ? 'hoy' : clean(dt.toLocaleDateString(LOC, { weekday: 'short' })).slice(0, 2)}</small>${dt.getDate()}</span>
        <span class="sv-dia-b">${Array.from({ length: 10 }, (_, k) => `<i style="--k:${k}">${k < n ? lleno : vacio}</i>`).join('')}</span>
        <span class="sv-dia-t">${!d.ms ? '—' : d.ms < 60000 ? '<1 min' : d.ms < 3600e3 ? fmtDur(d.ms) : fmtDurShort(d.ms)}</span>
      </div>`;
    }).join('');
  },
  resize() { this.vivo(); },
  async cargarActividad() {
    const l = await api('servers.activity').catch(() => null);
    if (!l || S.view !== 'servidores') return;
    const antes = S.srvAct;
    S.srvAct = l;
    if (JSON.stringify(antes?.dias) !== JSON.stringify(l.dias)) { this.grafico(); if (!antes) animar($('#sv-chart')); }
  },
  // Datos del servidor mirado: el resumen llega al momento y lo demás cuando responde el proceso principal.
  datos() {
    const x = listaSrv().find((s) => s.id === S.srvVer);
    if (!x) return null;
    const d = S.srvDet && S.srvDet.id === x.id ? S.srvDet : null;
    return { ...(d || {}), ...x, icon: x.icon || d?.icon || null, completo: !!d };
  },
  prev(animado = true) {
    const box = $('#sv-prev');
    if (!box) return;
    const d = this.datos();
    if (!d) { box.innerHTML = ''; return; }
    const parts = particulas(18, 260);
    box.innerHTML = `
      <div class="hero sv-hero" data-st="${esc(d.state)}" data-k="${esc(d.id)}">
        <img class="hero-img" src="${d.icon || JUEGO.tex.fondo}" alt="" draggable="false"><div class="hero-shade"></div><div class="particulas">${parts}</div>
        <div class="hero-in" id="sv-hero-in"></div>
      </div>
      <div class="sv-barra" id="sv-barra"></div>
      <dl class="sv-datos" id="sv-datos"></dl>
      <section class="panel sv-gente" id="sv-gente"></section>`;
    poner($('#sv-hero-in'), this.heroIn(d));
    poner($('#sv-barra'), this.barra(d));
    poner($('#sv-datos'), this.celdas(d));
    poner($('#sv-gente'), this.gente(d));
    if (animado) animar(box);
  },
  // Solo cambia lo que se mueve; la foto sigue con su paneo.
  vivo() {
    const d = this.datos();
    const h = $('.sv-hero');
    if (!d || !h || h.dataset.k !== d.id) { this.prev(false); return; }
    const img = $('.hero-img', h);
    const foto = d.icon || JUEGO.tex.fondo;
    if (img.getAttribute('src') !== foto) img.src = foto;
    h.dataset.st = d.state;
    poner($('#sv-hero-in'), this.heroIn(d), true);
    poner($('#sv-barra'), this.barra(d), true);
    poner($('#sv-datos'), this.celdas(d), true);
    poner($('#sv-gente'), this.gente(d));
  },
  heroIn(d) {
    const [t, c] = estadoDe(d);
    const chip = d.state === 'abierto' ? `${t} · ${d.online} de ${d.max} jugando` : t;
    const meta = [d.mundo || (d.completo ? 'Sin mundo todavía' : ''), nombreModo(d.modo), nombreDificultad(d.dificultad), d.version ? `Bedrock ${d.version}` : ''].filter(Boolean);
    return `<div class="hero-txt">
        <span class="pill ${c}"><i class="dot"></i>${esc(chip)}</span>
        <h1 class="hero-name">${esc(d.nombre)}</h1>
        <p class="hero-meta">${meta.map((m, i) => `${i ? '<i></i>' : ''}<span>${esc(m)}</span>`).join('')}</p>
      </div>`;
  },
  barra(d) {
    let izq;
    if (d.direccion) {
      const [host, port] = d.direccion.split(':');
      izq = `<span class="addr-l">Dirección para tus amigos</span>
        <div class="addr-v"><span class="addr-host">${esc(host)}</span>${port ? `<span class="addr-port">${esc(port)}</span>` : ''}
          <button class="btn sm" data-act="sv-copiar" data-v="${esc(d.direccion)}" data-tip="Copiar la dirección\n§7En Minecraft: Servidores, Agregar servidor">${ic('copy')}Copiar</button></div>`;
    } else {
      const falta = d.puerto ? `Crea en playit un túnel Minecraft Bedrock (NetherNet) al puerto ${d.puerto} y pega la dirección en Ajustes.` : 'Este servidor todavía no tiene entrada desde internet.';
      izq = `<span class="addr-l">Dirección para tus amigos</span><p class="sv-falta">${esc(falta)}</p>`;
    }
    const ocupado = d.state === 'arrancando' || d.state === 'cerrando';
    let abrir;
    if (!d.installed) abrir = '';
    else if (ocupado) abrir = `<button class="btn grande" disabled><span class="spin"></span>${d.state === 'arrancando' ? 'Abriendo…' : 'Cerrando…'}</button>`;
    else if (d.state === 'abierto') abrir = `<button class="btn grande" data-srv-accion="stop" data-id="${esc(d.id)}" data-tip="Cerrar ${esc(d.nombre)}\n§7Guardo el mundo antes de cerrar">${ic('pause')}Cerrar</button>`;
    else if (!d.worldReady) abrir = `<button class="btn grande" disabled data-tip="Entra y elige un mundo\n§7para poder abrirlo">${ic('play')}Abrir</button>`;
    else abrir = `<button class="btn grande" data-srv-accion="start" data-id="${esc(d.id)}" data-tip="Abrir ${esc(d.nombre)}\n§7Puede estar abierto a la vez que los otros">${ic('play')}Abrir</button>`;
    const err = d.lastError && d.state === 'apagado' ? `<p class="pb-err">${ic('alert')}<span>${esc(d.lastError)}</span></p>` : '';
    return `<div class="pb-left">${izq}</div>
      <div class="sv-acts">
        <button class="btn sm icon ghost" data-act="sv-carpeta" data-v="${esc(d.id)}" data-tip="Abrir la carpeta de este servidor" aria-label="Abrir la carpeta">${ic('folder')}</button>
        ${abrir}
        <button class="btn play sv-entrar" data-sv-entrar="${esc(d.id)}">Entrar${ic('chevronRight')}</button>
      </div>${err}`;
  },
  celdas(d) {
    const espera = d.completo ? '—' : '…';
    const abierto = d.state === 'abierto';
    const filas = [
      ['Jugando', abierto ? `${d.online} de ${d.max}` : 'Cerrado'],
      abierto && d.startedAt ? ['Abierto hace', fmtDur(Date.now() - d.startedAt)] : ['Última partida', d.ultimaPartida ? fmtAgo(d.ultimaPartida) : d.completo ? 'Nadie ha jugado' : espera],
      ['Mundo', d.mundoTam ? fmtBytes(d.mundoTam) : espera],
      ['Copias', d.completo ? (d.copias ? `${d.copias} · ${fmtAgo(d.ultimaCopia)}` : 'Ninguna todavía') : espera],
      ['Amigos en la lista', d.completo ? String(d.amigos) : espera],
      ['Puerto para playit', d.puerto ? String(d.puerto) : 'Sin entrada'],
    ];
    return filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  },
  gente(d) {
    const js = d.jugadores || [];
    const dentro = js.filter((p) => p.online);
    const titulo = dentro.length ? 'Jugando ahora' : 'Jugaron hace poco';
    const top = `<div class="panel-h"><span class="ph-ico">${iso('cabeza', 24)}</span><h2>${titulo}</h2>${dentro.length ? `<span class="count">${dentro.length} de ${d.max}</span>` : ''}</div>`;
    if (!d.completo) return `${top}<div class="sv-gente-l"></div>`;
    if (!js.length) return `${top}<p class="empty-s sv-nadie">Todavía no ha entrado nadie a este servidor.</p>`;
    const ancho = ($('#sv-gente')?.clientWidth || 900) - 48;
    const n = Math.max(2, Math.floor((ancho + 8) / 236));
    const ver = js.length > n ? js.slice(0, n - 1) : js;
    const resto = js.slice(ver.length);
    return `${top}<div class="sv-gente-l" style="--n:${n}">${ver.map((p, i) => `<span class="sv-cab ${p.online ? 'on' : ''}" style="--i:${i}" data-tip="${esc(p.name)}\n${p.online ? `§a${esc(sinceText('fila', p.since))}` : `§7Jugó ${esc(fmtAgo(p.lastSeen))}`}">
        ${head(p.name, 'av')}<span class="sv-cab-t"><b>${p.online ? '<i class="dot"></i>' : ''}<span>${esc(p.name)}</span></b><small>${p.online ? 'Jugando' : esc(fmtAgo(p.lastSeen))}</small></span></span>`).join('')}${resto.length ? `<span class="sv-cab sv-mas" style="--i:${ver.length}" data-tip="${esc(resto.map((p) => p.name).join('\n'))}"><span class="sv-mas-caras">${resto.slice(0, 3).map((p) => head(p.name, 'av sm')).join('')}</span><b>+${resto.length} más</b></span>` : ''}</div>`;
  },
  update(part) {
    if (part === 'lista') {
      const lista = listaSrv();
      if (!lista.some((x) => x.id === S.srvVer)) { S.srvVer = S.servidores.elegido || lista[0]?.id; this.fill(); this.cargar(); return; }
      const abiertos = lista.filter((x) => x.state === 'abierto').length;
      $('#sv-sub').textContent = `${lista.length} ${lista.length === 1 ? 'servidor' : 'servidores'} · ${abiertos ? `${abiertos} ${abiertos === 1 ? 'abierto' : 'abiertos'}` : 'todos cerrados'}`;
      this.filas();
      this.todos();
      this.vivo();
      this.acomodar();
      clearTimeout(this.t);
      this.t = setTimeout(() => { this.cargar(); this.cargarActividad(); }, 250);
    }
    if (part === 'playit') this.todos();
  },
};

// Cambia el contenido solo si cambió; «quieto» evita que lo que ya se veía vuelva a hacer su entrada.
function poner(el, html, quieto = false) {
  if (!el || el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  if (quieto) for (const c of el.querySelectorAll('*')) c.style.animation = 'none';
}

// Muestra u oculta lo escrito en un campo de clave; el ojo se tacha mientras se ve.
function verClave(input, boton, que) {
  if (!input) return;
  const ver = input.type === 'password';
  input.type = ver ? 'text' : 'password';
  if (boton) {
    boton.innerHTML = ojo(ver);
    boton.dataset.tip = ver ? `Ocultar ${que}` : `Ver ${que}`;
    boton.setAttribute('aria-label', boton.dataset.tip);
  }
  input.focus({ preventScroll: true });
}

// Elige qué servidor se ve en la vista previa.
function verServidor(id) {
  if (id === S.srvVer) return;
  S.srvVer = id;
  VISTA_SERVIDORES.filas();
  VISTA_SERVIDORES.prev(true);
  VISTA_SERVIDORES.cargar();
}

// Entra a administrar un servidor: la barra de arriba muestra sus secciones.
async function elegirServidor(id, vista = 'inicio') {
  if (id !== S.servidores?.elegido) {
    const snap = await call('servers.select', id).catch(() => null);
    if (!snap) return;
    aplicarSnap(snap);
    S.view = null;
  }
  go(vista);
}

function aplicarSnap(snap) {
  S.snap = snap;
  S.servidores = snap.servidores;
  S.lines = snap.lines || [];
  S.mcWorlds = null;
  S.selWorld = null;
  S.selPlayer = null;
  S.entradaInfo = null;
  renderBusy();
  pintarSelector();
}

// Resumen de todos los servidores que manda el proceso principal (sin fotos: se conservan las de antes).
function recibirServidores(data) {
  const fotos = new Map(listaSrv().map((x) => [x.id, x.icon]));
  S.servidores = { ...data, lista: data.lista.map((x) => ({ ...x, icon: fotos.get(x.id) ?? x.icon ?? null })) };
  pintarSelector();
  if (S.view === 'servidores') VISTA_SERVIDORES.update('lista');
}

// Clics de la pantalla de servidores; devuelve true si el clic era suyo.
function clicServidores(e) {
  const t = e.target;
  const fila = t.closest('[data-sv]');
  if (fila) { verServidor(fila.dataset.sv); return true; }
  const entrar = t.closest('[data-sv-entrar]');
  if (entrar) { elegirServidor(entrar.dataset.svEntrar); return true; }
  const acc = t.closest('[data-srv-accion]');
  if (acc) {
    if (acc.disabled) return true;
    acc.disabled = true;
    quiet(call(acc.dataset.srvAccion === 'start' ? 'servers.start' : 'servers.stop', acc.dataset.id));
    return true;
  }
  if (t.closest('[data-srv-nuevo]')) { S.asis = null; go('nuevo'); return true; }
  return false;
}
// Doble clic en una fila entra directo a ese servidor.
document.addEventListener('dblclick', (e) => {
  const fila = e.target.closest('[data-sv]');
  if (fila) elegirServidor(fila.dataset.sv);
});
// En la lista: flechas para moverse entre servidores y Enter para entrar.
document.addEventListener('keydown', (e) => {
  if (S.view !== 'servidores' || e.target.closest?.('input, textarea') || e.ctrlKey || e.altKey) return;
  const lista = listaSrv();
  const i = lista.findIndex((x) => x.id === S.srvVer);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = lista[(i + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length];
    if (n) { verServidor(n.id); $(`[data-sv="${CSS.escape(n.id)}"]`)?.focus({ preventScroll: false }); }
  } else if (e.key === 'Enter' && S.srvVer && !e.target.closest?.('button:not(.sv-row)')) {
    e.preventDefault();
    elegirServidor(S.srvVer);
  }
});
// Lo que cambia solo (tiempo abierto, jugadores) se vuelve a pedir cada tanto mientras se mira la lista.
setInterval(() => { if (S.view === 'servidores' && !document.hidden) VISTA_SERVIDORES.cargar(); }, 5000);

/* =================================================================== */
/* Asistente para crear un servidor                                     */
/* =================================================================== */
const MODOS = [
  ['survival', 'Supervivencia', 'pasto', 'Junta recursos, construye y sobrevive'],
  ['creative', 'Creativo', 'oro', 'Bloques sin límite y se puede volar'],
  ['adventure', 'Aventura', 'item:mapa', 'Para mapas: los bloques no se rompen'],
];
const DIFICULTADES = [
  ['peaceful', 'Pacífico', 'Sin monstruos y la vida se recupera sola.'],
  ['easy', 'Fácil', 'Hay monstruos, pero hacen poco daño.'],
  ['normal', 'Normal', 'Como el juego de siempre: monstruos y hambre.'],
  ['hard', 'Difícil', 'Monstruos más fuertes y el hambre puede matarte.'],
];
const JUGADORES = ['5', '10', '20', '30'];
const QUIEN = [
  ['todos', 'Cualquiera con la dirección', 'Tus amigos entran sin que tengas que agregarlos', 'portal'],
  ['lista', 'Solo tu lista de amigos', 'Los agregas después en Jugadores, con su gamertag', 'cabeza'],
];
const PERMISOS = [
  ['visitor', 'Visitante', 'Solo puede mirar: no rompe ni pone bloques.'],
  ['member', 'Miembro', 'Juega normal: rompe, construye y abre cofres.'],
  ['operator', 'Operador', 'Puede usar comandos y cambiar las reglas.'],
];
const TIPOS = [
  ['DEFAULT', 'Normal', 'Montañas, cuevas, ríos y océanos', 'pasto'],
  ['FLAT', 'Plano', 'Todo plano, ideal para construir', 'losa'],
];
const PASOS = [['pasto', 'Tu servidor'], ['item:mundo', 'El mundo'], ['portal', 'La entrada'], ['comando', 'Crear']];
const MUNDOS = [
  ['nuevo', 'pasto', 'Mundo nuevo', 'El servidor lo crea al abrir por primera vez'],
  ['minecraft', 'item:mundo', 'De tu Minecraft', 'Una copia de un mundo que ya jugaste'],
  ['archivo', 'cofre', 'Archivo .mcworld', 'Un mundo que te pasaron o bajaste'],
  ['copiar', 'comando', 'De otro servidor', 'Una copia del mundo de otro de tus servidores'],
];
const nombreDe = (lista, v) => (lista.find(([k]) => k === v) || lista[0])[1];

// Partículas que suben sobre una foto, cada una con su tamaño, color, velocidad y desvío.
function particulas(n = 18, alto = 260) {
  const colores = ['oklch(0.97 0.03 110)', 'oklch(0.88 0.13 135)', 'oklch(0.93 0.1 95)'];
  return Array.from({ length: n }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--t:${[3, 4, 4, 5, 6][i % 5]}px;--d:${(7 + Math.random() * 8).toFixed(1)}s;--r:-${(Math.random() * 15).toFixed(1)}s;--dx:${Math.round(Math.random() * 90 - 45)}px;--h:${Math.round(alto * 0.55 + Math.random() * alto)}px;--c:${colores[i % 3]}"></i>`).join('');
}

const nuevoAsis = () => ({
  paso: 0, nombre: '', modo: 'survival', dificultad: 'normal', maxJugadores: '10', quien: 'todos', permiso: 'member',
  mundo: { tipo: 'nuevo', semilla: '' }, tipoMundo: 'DEFAULT', trucos: false,
  entrada: { direccion: '', udp: '', token: '' }, aceptoEula: false, creando: false, creado: null,
});

// Tarjeta grande para elegir una opción.
const carta = (act, datos, on, icono, titulo, desc, i = 0, tam = 32) => `<button class="as-op ${on ? 'on' : ''}" style="--i:${i}" data-act="${act}" ${Object.entries(datos).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} aria-pressed="${on}">
  <span class="as-op-ico">${iso(icono, tam)}</span><span class="as-op-t"><b>${titulo}</b><span>${desc}</span></span>${on ? `<i class="as-op-ok">${ic('check')}</i>` : ''}</button>`;

// Si el túnel de playit se arma solo: con un agente que lo permite o, sin vincular, con el que se va a crear.
function playitAuto() {
  const su = S.setup;
  const enlazado = !!(su?.playit?.linked || pl().linked);
  const auto = pl().automatico ?? su?.playit?.automatico ?? null;
  return { enlazado, auto: !enlazado || auto === true };
}

const VISTA_NUEVO = {
  html() {
    const primero = !listaSrv().length;
    return `<div class="page full asis">
      <header class="page-h">
        <div class="ph"><span class="page-ico">${iso('comando', 32)}</span><div><h1>${primero ? 'Bienvenido a CraftAdmin' : 'Servidor nuevo'}</h1>
          <p class="sub">${primero ? 'Arma tu primer servidor en cuatro pasos. Lo demás lo hago yo.' : 'Cuatro pasos y queda listo para tus amigos'}</p></div></div>
        ${primero ? '' : `<div class="acts"><button class="btn ghost" data-act="as-cancelar">${ic('x')}Cancelar</button></div>`}
      </header>
      <ol class="pasos" id="as-pasos"></ol>
      <div class="asis-grid crece">
        <section class="panel asis-cuerpo" id="as-cuerpo"></section>
        <aside class="as-escena" id="as-escena">
          <img class="as-esc-img" id="as-esc-img" src="${JUEGO.tex.fondo}" alt="" draggable="false">
          <div class="as-esc-sombra"></div>
          <div class="particulas">${particulas(18, 320)}</div>
          <div class="as-esc-in">
            <p class="as-esc-l">Así lo verán tus amigos en Minecraft</p>
            <div id="as-esc-lista"></div>
            <div class="as-esc-bloque" id="as-esc-bloque"></div>
            <dl class="as-ficha" id="as-esc-ficha"></dl>
          </div>
        </aside>
      </div>
      <footer class="asis-pie" id="as-pie"></footer>
    </div>`;
  },
  async mount() {
    S.asis ||= nuevoAsis();
    this.pintar(false);
    S.setup = await api('setup.estado').catch(() => null);
    if (S.view === 'nuevo') this.pintar(false);
  },
  // Los cuatro pasos arriba, unidos como un circuito de redstone que se enciende al avanzar.
  pasosHtml() {
    const a = S.asis;
    return PASOS.map(([icono, t], i) => {
      const cls = a.creado || i < a.paso ? 'hecho' : i === a.paso ? 'ahora' : '';
      return `${i ? `<i class="paso-cable ${a.creado || i <= a.paso ? 'on' : ''}"></i>` : ''}
        <li class="paso ${cls}"><button ${i < a.paso && !a.creando && !a.creado ? `data-act="as-ir" data-paso="${i}"` : 'disabled'}>
          <span class="paso-ico">${iso(icono, 32)}</span><span class="paso-t"><small>Paso ${i + 1}</small>${t}</span></button></li>`;
    }).join('');
  },
  pintar(animado = true) {
    const a = S.asis;
    if (!a || !$('#as-cuerpo')) return;
    $('#as-pasos').innerHTML = this.pasosHtml();
    const cuerpo = $('#as-cuerpo');
    cuerpo.innerHTML = a.creado ? this.listo() : [this.paso1, this.paso2, this.paso3, this.paso4][a.paso].call(this);
    $('#as-pie').innerHTML = this.pie();
    this.escena();
    if (animado) { cuerpo.scrollTop = 0; animar(cuerpo); }
  },

  // A la derecha, el servidor que se va armando: la foto de su mundo, cómo sale en la lista del juego,
  // el bloque de su modo flotando como un objeto tirado en el suelo y todo lo elegido hasta ahora.
  foto() {
    const a = S.asis;
    const m = a.mundo;
    return (m.tipo === 'minecraft' && S.mcWorlds?.find((w) => w.path === m.ruta)?.icon) || (m.tipo === 'copiar' && S.setup?.otros?.find((o) => o.ruta === m.ruta)?.icon) || JUEGO.tex.fondo;
  },
  escena() {
    const a = S.asis;
    const img = $('#as-esc-img');
    if (!img) return;
    const foto = this.foto();
    if (img.getAttribute('src') !== foto) { img.src = foto; img.classList.remove('cambia'); void img.offsetWidth; img.classList.add('cambia'); }
    const modo = MODOS.find(([v]) => v === a.modo) || MODOS[0];
    const fotoMundo = foto !== JUEGO.tex.fondo ? foto : null;
    poner($('#as-esc-lista'), `<div class="lista-mc">
        <span class="lista-mc-ico">${fotoMundo ? `<img src="${fotoMundo}" alt="">` : iso('comando', 32)}</span>
        <span class="lista-mc-t"><b id="as-prev-n">${esc(a.nombre.trim() || 'Tu servidor')}</b><span>${esc(modo[1])} · ${esc(nombreDe(DIFICULTADES, a.dificultad))}</span></span>
        <span class="lista-mc-r"><span>0/${esc(a.maxJugadores)}</span><i class="senal ok"><b></b><b></b><b></b><b></b></i></span>
      </div>`);
    poner($('#as-esc-bloque'), `<span class="as-item" data-modo="${esc(a.modo)}">${iso(modo[2], 96)}</span><i class="as-item-sombra"></i>`);
    const m = a.mundo;
    const mundo = m.tipo === 'nuevo' ? `Nuevo, ${a.tipoMundo === 'FLAT' ? 'plano' : 'normal'}` : m.nombre || 'Sin elegir todavía';
    const pa = playitAuto();
    const internet = S.setup && !S.setup.plantillaEntrada ? 'Se arma después' : pa.auto ? (pa.enlazado ? 'playit la arma sola' : 'Al conectar playit') : a.entrada.token && a.entrada.udp ? 'Lista para playit' : 'La completas después';
    const filas = [
      ['Modo', modo[1], 0], ['Dificultad', nombreDe(DIFICULTADES, a.dificultad), 0], ['Jugadores', `Hasta ${a.maxJugadores}`, 0],
      ['Mundo', mundo, 1], ['Quién entra', a.quien === 'lista' ? 'Solo tu lista' : 'Cualquiera', 2], ['Desde internet', internet, 2],
    ];
    poner($('#as-esc-ficha'), filas.map(([k, v, p]) => `<div class="${!a.creado && p > a.paso ? 'luego' : ''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join(''));
  },

  pie() {
    const a = S.asis;
    if (a.creado) return '';
    if (a.creando) return `<div class="as-progreso"><span class="spin"></span><span>${esc(S.snap.busy?.label || 'Creando el servidor')}…</span><span class="meter-l"><i style="width:${Math.round((S.snap.busy?.progress || 0.04) * 100)}%"></i></span></div>`;
    const falta = this.falta();
    const ultimo = a.paso === PASOS.length - 1;
    return `${a.paso ? `<button class="btn ghost grande" data-act="as-atras">${ic('chevronLeft')}Atrás</button>` : '<span></span>'}
      <span class="as-falta">${falta ? esc(falta) : `Paso ${a.paso + 1} de ${PASOS.length}`}</span>
      ${ultimo
        ? `<button class="btn primary grande as-crear" data-act="as-crear" ${falta ? 'disabled' : ''}>${ic('check')}Crear servidor</button>`
        : `<button class="btn primary grande as-sig" data-act="as-sig" ${falta ? 'disabled' : ''}>Siguiente${ic('chevronRight')}</button>`}`;
  },
  // Qué falta para poder seguir (o null si está todo).
  falta() {
    const a = S.asis;
    if (a.paso === 0 && !a.nombre.trim()) return 'Ponle un nombre';
    if (a.paso === 1 && a.mundo.tipo !== 'nuevo' && !a.mundo.ruta) return 'Elige el mundo';
    if (a.paso === 3 && S.setup && !S.setup.servidorLocal && !a.aceptoEula) return 'Acepta la licencia para bajar el servidor';
    return null;
  },
  seg(k, opts, extra = '') {
    const a = S.asis;
    return `<div class="seg ${extra}">${opts.map(([v, l]) => `<button class="${a[k] === v ? 'on' : ''}" data-act="as-set" data-k="${k}" data-v="${esc(v)}" aria-pressed="${a[k] === v}">${l}</button>`).join('')}</div>`;
  },

  paso1() {
    const a = S.asis;
    return `<div class="as-form">
      <label class="as-campo"><span class="label">Nombre del servidor</span>
        <input class="field grande" id="as-nombre" maxlength="40" placeholder="Por ejemplo: Supervivencia con amigos" value="${esc(a.nombre)}" spellcheck="false" autocomplete="off"></label>
      <div class="as-campo estira"><span class="label">Modo de juego</span>
        <div class="as-cartas c3">${MODOS.map(([v, t, icono, d], i) => carta('as-set', { k: 'modo', v }, a.modo === v, icono, t, d, i, 64)).join('')}</div></div>
      <div class="as-campo"><span class="label">Dificultad</span>${this.seg('dificultad', DIFICULTADES, 'seg4')}
        <p class="as-desc">${esc(DIFICULTADES.find(([v]) => v === a.dificultad)[2])}</p></div>
      <div class="as-campo"><span class="label">Jugadores a la vez</span>${this.seg('maxJugadores', JUGADORES.map((n) => [n, `Hasta ${n}`]), 'seg4')}
        <p class="as-desc">Cuántos pueden estar jugando al mismo tiempo. Lo puedes cambiar cuando quieras en Ajustes.</p></div>
    </div>`;
  },

  paso2() {
    const a = S.asis;
    const m = a.mundo;
    const ops = MUNDOS.filter(([t]) => t !== 'copiar' || (S.setup?.otros || []).length)
      .map(([t, icono, titulo, desc], i) => carta('as-mundo', { tipo: t }, m.tipo === t, icono, titulo, desc, i)).join('');
    let detalle = '';
    if (m.tipo === 'nuevo') {
      detalle = `<div class="as-campo estira"><span class="label">Tipo de mundo</span>
          <div class="as-cartas c2">${TIPOS.map(([v, t, d, icono], i) => carta('as-set', { k: 'tipoMundo', v }, a.tipoMundo === v, icono, t, d, i, 64)).join('')}</div></div>
        <label class="as-campo"><span class="label">Semilla (si no pones nada, sale al azar)</span>
          <input class="field" id="as-semilla" maxlength="30" placeholder="Por ejemplo: 12345" value="${esc(m.semilla || '')}" spellcheck="false" autocomplete="off"></label>
        <label class="as-sw"><button class="switch ${a.trucos ? 'on' : ''}" role="switch" aria-checked="${a.trucos}" data-act="as-trucos"><i></i></button>
          <span><b>Trucos y comandos</b><span>Los operadores pueden usar comandos como /tp, /give o /time.</span></span></label>`;
    } else if (m.tipo === 'minecraft') {
      if (!S.mcWorlds) {
        detalle = '<div class="empty as-lleno"><span class="spin lg"></span><p class="empty-s">Buscando los mundos de tu Minecraft…</p></div>';
        if (!S.mcLoading) {
          S.mcLoading = true;
          api('worlds.minecraft').then((l) => { S.mcWorlds = l; }).catch(() => { S.mcWorlds = []; })
            .finally(() => { S.mcLoading = false; if (S.view === 'nuevo' && S.asis?.paso === 1) { this.pintar(false); animar($('#as-detalle')); } });
        }
      } else detalle = this.listaMundos(S.mcWorlds.map((w) => ({ ruta: w.path, nombre: w.name, icon: w.icon, meta: `Jugado ${fmtAgo(w.mtime)} · ${fmtBytes(w.size)}` })), 'No encontré mundos en tu Minecraft.');
    } else if (m.tipo === 'archivo') {
      detalle = `<button class="as-soltar as-lleno ${m.ruta ? 'lleno' : ''}" data-act="as-archivo">
          <span class="as-soltar-ico">${iso('cofre', 64)}</span>
          ${m.ruta ? `<b>${esc(m.nombre)}</b><span>${esc(m.ruta)}</span><span class="btn sm">${ic('upload')}Elegir otro</span>` : '<b>Elige el archivo .mcworld</b><span>El mundo se copia al servidor con sus complementos.</span><span class="btn sm primary">' + ic('upload') + 'Elegir archivo</span>'}
        </button>`;
    } else if (m.tipo === 'copiar') {
      detalle = this.listaMundos((S.setup?.otros || []).map((o) => ({ ruta: o.ruta, nombre: o.mundo, icon: o.icon, meta: `De ${o.nombre}` })), 'No hay otros servidores con mundo.');
    }
    return `<div class="as-form">
      <div class="as-campo"><span class="label">¿De dónde sale el mundo?</span><div class="as-cartas c4">${ops}</div></div>
      <div class="as-detalle" id="as-detalle">${detalle}</div>
    </div>`;
  },
  listaMundos(lista, vacio) {
    if (!lista.length) return `<div class="empty as-lleno"><p class="empty-s">${vacio}</p></div>`;
    const sel = S.asis.mundo.ruta;
    return `<span class="label">Elige el mundo</span><div class="as-mundos">${lista.map((w, i) => `<button class="as-mundo ${sel === w.ruta ? 'on' : ''}" style="--i:${i}" data-act="as-elegir" data-ruta="${esc(w.ruta)}" data-nombre="${esc(w.nombre)}">
        <span class="as-mundo-img">${w.icon ? `<img src="${w.icon}" alt="" draggable="false">` : iso('pasto', 48)}</span>
        <span class="as-mundo-t"><b>${esc(w.nombre)}</b><span>${esc(w.meta)}</span></span>${sel === w.ruta ? `<i class="as-op-ok">${ic('check')}</i>` : ''}</button>`).join('')}</div>`;
  },

  paso3() {
    const a = S.asis;
    const su = S.setup;
    let internet;
    if (su && !su.plantillaEntrada) {
      internet = `<div class="as-aviso">${ic('info')}<div><b>En este PC todavía no hay entrada para amigos</b>
        <p class="help">El servidor se puede crear igual: quien esté en tu misma red puede entrar. La entrada por internet (playit y WaterdogPE) se arma después.</p></div></div>`;
    } else if (playitAuto().auto) {
      const { enlazado } = playitAuto();
      internet = `<div class="as-playit auto">
        <ol class="as-guia">
          <li class="${enlazado ? 'hecho' : ''}"><span class="as-n">1</span><div><b>Conecta tu cuenta de playit</b>
            <p class="help">Una sola vez: se abre playit para que lo apruebes. Es gratis y deja entrar a tus amigos sin tocar el router.</p>
            ${enlazado ? `<span class="badge ok">${ic('check')}Conectada</span>` : `<button class="btn sm" data-act="playit.link">${ic('link')}Conectar playit</button>`}</div></li>
          <li class="${enlazado ? 'hecho' : ''}"><span class="as-n">2</span><div><b>El túnel se arma solo</b>
            <p class="help">Al crear el servidor, CraftAdmin le hace su túnel en playit y llena la dirección para tus amigos.</p></div></li>
        </ol>
        <div class="as-ruta ${enlazado ? '' : 'apagada'}" aria-hidden="true">
          <div class="as-ruta-p">${iso('cabeza', 56)}<b>Tus amigos</b></div><i class="as-ruta-l"></i>
          <div class="as-ruta-p">${iso('portal', 56)}<b>playit</b></div><i class="as-ruta-l"></i>
          <div class="as-ruta-p">${iso('comando', 56)}<b>${esc(a.nombre.trim() || 'Tu servidor')}</b></div>
        </div>
      </div>`;
    } else {
      const puerto = su?.puertos?.entrada || '…';
      const enlazado = su?.playit?.linked || pl().linked;
      const e = a.entrada;
      internet = `<div class="as-playit">
        <ol class="as-guia">
          <li class="${enlazado ? 'hecho' : ''}"><span class="as-n">1</span><div><b>Conecta tu cuenta de playit</b>
            <p class="help">Deja entrar a tus amigos desde sus casas, gratis y sin tocar el router.</p>
            ${enlazado ? `<span class="badge ok">${ic('check')}Conectada</span>` : `<button class="btn sm" data-act="playit.link">${ic('link')}Conectar playit</button>`}</div></li>
          <li><span class="as-n">2</span><div><b>Crea un túnel en playit</b>
            <p class="help">Tipo <b>Minecraft Bedrock (NetherNet)</b>, con este puerto local:</p>
            <div class="as-puerto"><span class="addr-port">${puerto}</span><button class="btn sm" data-act="as-copiar-puerto" data-v="${puerto}">${ic('copy')}Copiar</button>
            <button class="btn sm ghost" data-act="playit.dashboard">${ic('external')}Abrir playit</button></div></div></li>
          <li><span class="as-n">3</span><div><b>Pega lo que te da playit</b><p class="help">O déjalo para después: se completa en Ajustes.</p></div></li>
        </ol>
        <div class="as-campos">
          <label class="as-campo"><span class="label">Dirección para tus amigos</span>
            <input class="field" data-as-entrada="direccion" placeholder="algo.ply.gg:12345" value="${esc(e.direccion)}" spellcheck="false" autocomplete="off"></label>
          <label class="as-campo"><span class="label">Dirección UDP del túnel</span>
            <input class="field" data-as-entrada="udp" placeholder="147.185.221.10:40000" value="${esc(e.udp)}" spellcheck="false" autocomplete="off"></label>
          <label class="as-campo"><span class="label">Clave NetherNet de playit</span>
            <span class="as-clave"><input class="field" type="password" data-as-entrada="token" placeholder="La clave larga que da playit" value="${esc(e.token)}" spellcheck="false" autocomplete="off">
            <button class="btn ghost icon" type="button" data-act="as-ver-clave" data-tip="Ver la clave" aria-label="Ver la clave">${ojo(false)}</button></span></label>
        </div>
      </div>`;
    }
    return `<div class="as-form">
      <div class="as-campo"><span class="label">Quién puede entrar</span>
        <div class="as-cartas c2">${QUIEN.map(([v, t, d, icono], i) => carta('as-set', { k: 'quien', v }, a.quien === v, icono, t, d, i)).join('')}</div></div>
      <div class="as-campo"><span class="label">Al entrar por primera vez son</span>${this.seg('permiso', PERMISOS)}
        <p class="as-desc">${esc(PERMISOS.find(([v]) => v === a.permiso)[2])}</p></div>
      <div class="as-campo crece-col"><span class="label">Desde internet, con playit</span>${internet}</div>
    </div>`;
  },

  paso4() {
    const a = S.asis;
    const su = S.setup;
    const m = a.mundo;
    const grupo = (icono, titulo, paso, filas) => `<section class="as-grupo">
        <header><span class="as-grupo-ico">${iso(icono, 24)}</span><b>${titulo}</b>${paso != null ? `<button class="link" data-act="as-ir" data-paso="${paso}">${ic('edit')}Cambiar</button>` : ''}</header>
        <dl>${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </section>`;
    const mundo = m.tipo === 'nuevo'
      ? [['Mundo', 'Nuevo'], ['Tipo', nombreDe(TIPOS, a.tipoMundo)], ['Semilla', m.semilla?.trim() || 'Al azar'], ['Trucos', a.trucos ? 'Sí' : 'No']]
      : [['Mundo', m.nombre || '—'], ['Sale de', nombreDe(MUNDOS.map(([t, , n]) => [t, n]), m.tipo)]];
    const pa = playitAuto();
    const internet = !su?.plantillaEntrada ? 'Se arma después' : pa.auto ? (pa.enlazado ? 'playit la arma sola' : 'Se arma sola al conectar playit') : a.entrada.token && a.entrada.udp ? 'Lista para playit' : 'La completas después en Ajustes';
    const programa = su?.servidorLocal ? 'Se copia del que ya tienes' : 'Se baja de Minecraft.net (unos 100 MB)';
    const extra = (su?.faltan || []).length ? [['También se baja', su.faltan.join(', ')]] : [];
    return `<div class="as-form">
      <div class="as-res">
        ${grupo('pasto', 'Tu servidor', 0, [['Nombre', a.nombre.trim()], ['Modo', nombreDe(MODOS, a.modo)], ['Dificultad', nombreDe(DIFICULTADES, a.dificultad)], ['Jugadores a la vez', `Hasta ${a.maxJugadores}`]])}
        ${grupo('item:mundo', 'El mundo', 1, mundo)}
        ${grupo('portal', 'La entrada', 2, [['Quién entra', nombreDe(QUIEN, a.quien)], ['Al entrar son', nombreDe(PERMISOS, a.permiso)], ['Desde internet', internet], ...(su?.puertos?.entrada && !pa.auto ? [['Puerto para playit', String(su.puertos.entrada)]] : [])])}
        ${grupo('comando', 'El programa', null, [['Servidor de Bedrock', programa], ...extra, ['Carpeta', 'Una propia, con sus copias y su consola'], ['Al crearlo', 'Queda cerrado; lo abres cuando quieras']])}
      </div>
      ${su && !su.servidorLocal ? `<label class="as-eula"><button class="switch ${a.aceptoEula ? 'on' : ''}" role="switch" aria-checked="${a.aceptoEula}" data-act="as-eula"><i></i></button>
        <span>Acepto la <a href="https://www.minecraft.net/eula" target="_blank" rel="noreferrer">licencia de Minecraft</a> para bajar el servidor oficial.</span></label>` : ''}
    </div>`;
  },

  listo() {
    const a = S.asis;
    return `<div class="as-listo">
      <div class="as-listo-ico">${iso('comando', 64)}</div>
      <h2>¡${esc(a.nombre.trim())} está listo!</h2>
      <p class="help">Ya aparece en Servidores, arriba a la izquierda. ${playitAuto().auto ? (playitAuto().enlazado ? 'Ábrelo y comparte la dirección con tus amigos.' : 'Conecta playit en Ajustes y su túnel se arma solo.') : a.creado.puerto && !(a.entrada.token && a.entrada.udp) ? `Cuando tengas el túnel de playit (puerto local ${a.creado.puerto}), completa la entrada en Ajustes.` : 'Ábrelo y comparte la dirección con tus amigos.'}</p>
      <div class="as-listo-acts">
        <button class="btn primary grande" data-act="as-abrir">${ic('play')}Abrir el servidor</button>
        <button class="btn grande" data-act="as-inicio">${ic('chevronRight')}Entrar sin abrirlo</button>
      </div>
    </div>`;
  },
  update(part) {
    if (part === 'busy' && S.asis?.creando) $('#as-pie').innerHTML = this.pie();
    if (part === 'playit' && S.asis?.paso === 2 && !S.asis.creado && !document.activeElement?.closest?.('#as-cuerpo input')) this.pintar(false);
  },
};

// Escribir en el asistente: se guarda al momento y se actualiza la vista previa.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!S.asis) return;
  if (t.id === 'as-nombre') {
    S.asis.nombre = t.value;
    const prev = $('#as-prev-n');
    if (prev) prev.textContent = t.value.trim() || 'Tu servidor';
    $('#as-pie').innerHTML = VISTA_NUEVO.pie();
  } else if (t.id === 'as-semilla') S.asis.mundo.semilla = t.value;
  else if (t.dataset.asEntrada) { S.asis.entrada[t.dataset.asEntrada] = t.value; VISTA_NUEVO.escena(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'as-nombre' && !VISTA_NUEVO.falta()) accionAsistente('as-sig', {});
});

async function accionAsistente(name, ds) {
  const a = S.asis;
  const V = VISTA_NUEVO;
  switch (name) {
    case 'as-set': a[ds.k] = ds.v; V.pintar(false); $(`.as-op[data-k="${ds.k}"][data-v="${CSS.escape(ds.v)}"]`)?.classList.add('recien'); return;
    case 'as-sig': if (!V.falta() && a.paso < PASOS.length - 1) { a.paso++; V.pintar(); } return;
    case 'as-atras': if (a.paso > 0) { a.paso--; V.pintar(); } return;
    case 'as-ir': a.paso = Number(ds.paso); V.pintar(); return;
    case 'as-mundo': a.mundo = { tipo: ds.tipo, semilla: a.mundo.semilla || '' }; V.pintar(false); $(`.as-op[data-tipo="${ds.tipo}"]`)?.classList.add('recien'); animar($('#as-detalle')); return;
    case 'as-elegir': a.mundo.ruta = ds.ruta; a.mundo.nombre = ds.nombre; V.pintar(false); return;
    case 'as-trucos': a.trucos = !a.trucos; V.pintar(false); return;
    case 'as-archivo': {
      const ruta = await call('setup.elegirArchivo').catch(() => null);
      if (ruta) { a.mundo.ruta = ruta; a.mundo.nombre = ruta.split(/[\\/]/).pop().replace(/\.(mcworld|zip)$/i, ''); V.pintar(false); }
      return;
    }
    case 'as-ver-clave': verClave($('[data-as-entrada="token"]'), $('[data-act="as-ver-clave"]'), 'la clave'); return;
    case 'as-copiar-puerto': await call('copy', ds.v); toast(`Puerto ${ds.v} copiado`, 'info', 'portal'); return;
    case 'as-eula': a.aceptoEula = !a.aceptoEula; V.pintar(false); return;
    case 'as-cancelar': S.asis = null; go('servidores'); return;
    case 'as-crear': {
      if (V.falta() || a.creando) return;
      a.creando = true;
      V.pintar(false);
      const r = await call('servers.create', {
        nombre: a.nombre, modo: a.modo, dificultad: a.dificultad, maxJugadores: Number(a.maxJugadores), soloLista: a.quien === 'lista', permiso: a.permiso,
        mundo: { ...a.mundo, tipoMundo: a.tipoMundo, trucos: a.trucos }, entrada: a.entrada, aceptoEula: a.aceptoEula,
      }).catch(() => null);
      a.creando = false;
      if (!r) { V.pintar(false); return; }
      a.creado = r;
      aplicarSnap(await api('snapshot'));
      V.pintar();
      return;
    }
    case 'as-abrir': S.asis = null; go('inicio'); quiet(call('server.start')); return;
    case 'as-inicio': S.asis = null; go('inicio'); return;
    default:
  }
}
