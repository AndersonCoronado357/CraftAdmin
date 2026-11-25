'use strict';
// La cuenta: la pantalla para entrar o crear cuenta (correo y contraseña dentro de la app, o Google)
// y la página de tu cuenta. Se carga antes que app.js; usa lo de app.js recién cuando se llama.

const G_LOGO = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

const VISTA_ACCESO = {
  html() {
    return `<div class="acceso">
      <section class="ac-escena">
        <img class="ac-fondo" src="${JUEGO.tex.fondo}" alt="" draggable="false">
        <div class="ac-sombra"></div>
        <div class="particulas">${particulas(24, 420)}</div>
        <div class="ac-texto">
          <h1>Tus servidores de Minecraft, en un solo lugar</h1>
          <p>Crea, abre y cuida tus servidores de Bedrock, y deja entrar a tus amigos desde sus casas.</p>
        </div>
      </section>
      <section class="ac-panel"><div class="ac-caja" id="ac-caja"></div></section>
    </div>`;
  },
  mount() { S.acceso ||= { modo: 'entrar', error: '', cargando: false, google: false }; this.pintar(); },
  pintar() {
    const a = S.acceso;
    const box = $('#ac-caja');
    if (!box) return;
    if (a.google) {
      box.innerHTML = `<div class="ac-google-espera">
        <span class="ac-g-ico">${G_LOGO}</span>
        <h2>Termina en tu navegador</h2>
        <p class="help">Elige tu cuenta de Google en la pestaña que se abrió. Apenas termines, CraftAdmin entra solo.</p>
        <span class="bar indet"><span></span></span>
        <button class="btn ghost" data-act="ac-google-cancelar">${ic('x')}Cancelar</button>
      </div>`;
      return;
    }
    const crear = a.modo === 'crear';
    box.innerHTML = `
      <span class="ac-logo">${iso('comando', 48)}</span>
      <h2>${crear ? 'Crea tu cuenta' : 'Entra a CraftAdmin'}</h2>
      <p class="ac-sub">${crear ? 'Gratis. Solo necesitas un correo y una contraseña.' : 'Con tu correo y contraseña, o con Google.'}</p>
      <div class="seg ac-modos"><button class="${crear ? '' : 'on'}" data-act="ac-modo" data-v="entrar">Entrar</button><button class="${crear ? 'on' : ''}" data-act="ac-modo" data-v="crear">Crear cuenta</button></div>
      <form class="ac-form" id="ac-form" novalidate>
        ${crear ? `<label class="as-campo"><span class="label">Tu nombre</span><input class="field grande" name="nombre" maxlength="40" autocomplete="nickname" placeholder="Como te dicen tus amigos" value="${esc(a.nombre || '')}"></label>` : ''}
        <label class="as-campo"><span class="label">Correo</span><input class="field grande" name="email" type="email" maxlength="190" autocomplete="email" placeholder="tu@correo.com" value="${esc(a.email || '')}" spellcheck="false"></label>
        <label class="as-campo"><span class="label">Contraseña${crear ? ' (mínimo 8 caracteres)' : ''}</span>
          <span class="ac-clave"><input class="field grande" name="clave" type="password" maxlength="200" autocomplete="${crear ? 'new-password' : 'current-password'}" placeholder="${crear ? 'Inventa una contraseña' : 'Tu contraseña'}">
          <button class="btn ghost icon" type="button" data-act="ac-ver" data-tip="Ver la contraseña" aria-label="Ver la contraseña">${ojo(false)}</button></span></label>
        <p class="ac-error" id="ac-error" role="alert">${esc(a.error || '')}</p>
        <button class="btn play ac-enviar" type="submit" ${a.cargando ? 'disabled' : ''}>${a.cargando ? `<span class="spin"></span>${crear ? 'Creando tu cuenta…' : 'Entrando…'}` : crear ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      <div class="ac-o"><span>o</span></div>
      <button class="btn grande ac-google" data-act="ac-google" ${a.cargando ? 'disabled' : ''}>${G_LOGO}${crear ? 'Crear cuenta con Google' : 'Entrar con Google'}</button>
      <button class="link ac-luego" data-act="ac-luego">Ahora no, seguir sin cuenta</button>`;
    const primero = $(crear ? '[name="nombre"]' : (a.email ? '[name="clave"]' : '[name="email"]'), box);
    primero?.focus({ preventScroll: true });
  },
};

// La figura de tu cuenta: tu skin o, si no pusiste una, Steve o Alex según tu nombre.
const figuraCuenta = () => (S.cuenta?.usuario?.piel ? '@cuenta' : S.cuenta?.usuario?.nombre || 'Steve');
// Carga tu skin y la que tienes puesta en Minecraft para dibujarlas.
const cargarPieles = () => cargarSkins(null, { '@cuenta': S.cuenta?.usuario?.piel || null, '@juego': S.pielJuego || null });

// Tu skin: la que tienes en Minecraft en este PC (si es una propia) o una imagen PNG.
function htmlPiel(u) {
  const pj = S.pielJuego;
  const igual = !!(pj && u.piel === pj);
  const ocupado = S.pielCargando ? 'disabled' : '';
  return `<div class="as-campo cuenta-piel"><span class="label">Tu skin</span>
    <span class="cu-piel">
      ${pj ? `<button class="btn cu-piel-juego${igual ? ' on' : ''}" data-act="ac-piel-juego" ${igual || S.pielCargando ? 'disabled' : ''} data-tip="La skin que tienes puesta en Minecraft en este PC">${head('@juego', 'av sm')}${igual ? 'Es la de tu Minecraft' : 'Usar la de mi Minecraft'}</button>` : ''}
      <button class="btn" data-act="ac-piel-archivo" ${ocupado} data-tip="Una imagen PNG de 64x64, como las de Minecraft">${ic('upload')}${S.pielCargando ? 'Guardando…' : pj ? 'Otra imagen' : 'Elegir imagen'}</button>
      ${u.piel ? `<button class="btn icon ghost" data-act="ac-piel-quitar" ${ocupado} aria-label="Quitar tu skin" data-tip="Quitar tu skin">${ic('x')}</button>` : ''}
    </span></div>`;
}
// Cambia solo la figura y los botones de la skin; con una skin nueva la figura vuelve a caer.
function pintarPiel(cae) {
  const u = S.cuenta?.usuario;
  if (!u || S.view !== 'cuenta') return;
  const fig = $('.cuenta-esc');
  if (fig && cae) fig.innerHTML = skin3d(figuraCuenta(), 220, 403, 'cuenta-skin cambia');
  const p = $('.cuenta-piel');
  if (p) p.outerHTML = htmlPiel(u);
}
async function cambiarPiel(metodo, arg) {
  if (S.pielCargando) return;
  S.pielCargando = true;
  pintarPiel();
  let u = null;
  try {
    u = await call(metodo, arg).catch(() => null);
    if (u) {
      S.cuenta.usuario = u;
      await cargarPieles();
      pintarCuenta();
      toast(u.piel ? 'Tu skin quedó puesta' : 'Volviste a la skin de siempre', 'info', 'cabeza');
    }
  } finally {
    S.pielCargando = false;
    pintarPiel(!!u);
  }
}

const VISTA_CUENTA = {
  html() {
    const u = S.cuenta?.usuario;
    if (!u) return '<div class="page full"></div>';
    const lista = listaSrv();
    const filas = lista.map((x, i) => {
      const [t, c] = estadoDe(x);
      return `<button class="cu-srv ${c}" style="--i:${i}" data-sv-entrar="${esc(x.id)}" data-tip="Entrar a ${esc(x.nombre)}">
        <span class="sv-thumb">${x.icon ? `<img src="${x.icon}" alt="" draggable="false">` : iso('pasto', 40)}</span>
        <span class="sv-row-t"><b><span class="sv-nombre">${esc(x.nombre)}</span></b><span class="sv-st"><i class="dot"></i>${esc(t)}<span class="sv-modo"> · ${esc(nombreModo(x.modo))}</span></span></span>
        ${ic('chevronRight', 'ic cu-ir')}</button>`;
    }).join('');
    return `<div class="page full cuenta-p">
      <header class="page-h"><div class="ph"><span class="page-ico">${iso('cabeza', 32)}</span><div><h1>Tu cuenta</h1><p class="sub">${S.cuenta.sinConexion ? 'Sin conexión con el servidor de cuentas' : 'Conectada'}</p></div></div>
        <div class="acts"><button class="btn hold danger-t" data-act="ac-salir" data-tip="Mantén presionado para cerrar sesión"><span class="hold-fill"></span>${ic('logout')}Cerrar sesión</button></div></header>
      <div class="cuenta-g crece">
        <section class="cuenta-fig" style="--fondo:url(${JUEGO.tex.fondo})">
          <div class="particulas">${particulas(14, 300)}</div>
          <div class="cuenta-esc">${skin3d(figuraCuenta(), 220, 403, 'cuenta-skin')}</div><div class="suelo"></div>
          <div class="cuenta-tag"><b>${esc(u.nombre)}</b><span>${esc(u.email)}</span></div>
        </section>
        <section class="panel cuenta-datos">
          <dl class="det-datos cuenta-kv">
            <div><dt>Entra con</dt><dd>${u.google ? 'Google' : 'Correo y contraseña'}</dd></div>
            <div><dt>Servidores en este PC</dt><dd>${lista.length}</dd></div>
            <div><dt>Abiertos ahora</dt><dd>${lista.filter((x) => x.state === 'abierto').length}</dd></div>
          </dl>
          <div class="cuenta-ajustes">
            <form class="cuenta-nombre" data-form="cuenta-nombre"><label class="as-campo"><span class="label">Tu nombre</span>
              <span class="ac-clave"><input class="field" name="nombre" maxlength="40" value="${esc(u.nombre)}"><button class="btn" type="submit">${ic('check')}Guardar</button></span></label></form>
            ${htmlPiel(u)}
          </div>
          <div class="cu-lista"><span class="label">Tus servidores</span><div class="cu-filas scroll">${filas || '<p class="empty-s">Todavía no tienes servidores en este PC.</p>'}
            <button class="sv-nuevo" data-srv-nuevo>${iso('pasto', 24)}<span>Crear servidor nuevo</span>${ic('plus')}</button>
            <div class="sv-vacio"><button class="sv-isla" data-srv-nuevo data-tip="Crear servidor nuevo"><img src="${diorama(192)}" alt="" draggable="false"><i class="sv-isla-sombra"></i></button><p class="sv-vacio-t">Aquí caben más servidores</p></div></div></div>
        </section>
      </div>
    </div>`;
  },
};

// Botón de la cuenta arriba a la derecha (su cara y su nombre).
function pintarCuenta() {
  const el = $('#nav-cuenta');
  if (!el) return;
  const u = S.cuenta?.usuario;
  el.hidden = false;
  el.classList.toggle('on', S.view === 'cuenta');
  el.innerHTML = u ? `${head(figuraCuenta(), 'av')}<span>${esc(u.nombre)}</span>` : `${head('Steve', 'av')}<span>Entrar</span>`;
  el.dataset.view = u ? 'cuenta' : 'acceso';
  el.dataset.tip = u ? `${u.nombre}\n§7${u.email}` : 'Entrar o crear tu cuenta';
}

async function entrarListo(usuario) {
  S.cuenta = { usuario };
  S.acceso = null;
  await cargarPieles();
  pintarCuenta();
  toast(`Hola, ${usuario.nombre}`, 'info', 'cabeza');
  S.view = null;
  go(S.servidores?.lista?.length ? 'servidores' : 'nuevo');
}

async function accionAcceso(name, ds) {
  const a = S.acceso || {};
  const V = VISTA_ACCESO;
  switch (name) {
    case 'ac-modo': guardarCampos(); a.modo = ds.v; a.error = ''; V.pintar(); return;
    case 'ac-ver': verClave($('#ac-form [name="clave"]'), $('[data-act="ac-ver"]'), 'la contraseña'); return;
    case 'ac-google': a.google = true; a.error = ''; V.pintar(); await api('cuenta.google').catch(() => {}); return;
    case 'ac-google-cancelar': a.google = false; V.pintar(); await api('cuenta.cancelarGoogle').catch(() => {}); return;
    case 'ac-luego': S.sinCuenta = true; S.view = null; go(S.servidores?.lista?.length ? 'servidores' : 'nuevo'); return;
    case 'ac-salir': {
      await api('cuenta.salir').catch(() => {});
      S.cuenta = { usuario: null };
      S.acceso = { modo: 'entrar', error: '' };
      await cargarPieles();
      pintarCuenta();
      S.view = null; go('acceso');
      return;
    }
    case 'ac-piel-juego': return cambiarPiel('cuenta.piel', 'juego');
    case 'ac-piel-archivo': return cambiarPiel('cuenta.piel', 'archivo');
    case 'ac-piel-quitar': return cambiarPiel('cuenta.quitarPiel');
    default:
  }
}

function guardarCampos() {
  const f = $('#ac-form');
  if (!f || !S.acceso) return;
  if (f.elements.email) S.acceso.email = f.elements.email.value;
  if (f.elements.nombre) S.acceso.nombre = f.elements.nombre.value;
}

// Enviar el formulario de entrar o crear cuenta.
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('#ac-form');
  if (!f) return;
  e.preventDefault();
  const a = S.acceso;
  if (!a || a.cargando) return;
  guardarCampos();
  const email = (f.elements.email.value || '').trim();
  const clave = f.elements.clave.value || '';
  const nombre = (f.elements.nombre?.value || '').trim();
  const crear = a.modo === 'crear';
  const falta = !email ? 'Escribe tu correo' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Ese correo no parece válido' : !clave ? 'Escribe tu contraseña' : crear && clave.length < 8 ? 'La contraseña necesita al menos 8 caracteres' : '';
  if (falta) { a.error = falta; $('#ac-error').textContent = falta; $('#ac-error').classList.remove('sacude'); void $('#ac-error').offsetWidth; $('#ac-error').classList.add('sacude'); return; }
  a.cargando = true; a.error = ''; VISTA_ACCESO.pintar();
  try {
    const usuario = await api(crear ? 'cuenta.registrar' : 'cuenta.entrar', crear ? { email, clave, nombre } : { email, clave });
    entrarListo(usuario);
  } catch (err) {
    a.cargando = false;
    a.error = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    VISTA_ACCESO.pintar();
  }
});

// Resultado de entrar con Google (llega del proceso principal).
function recibirCuenta(data) {
  if (data.usuario) { entrarListo(data.usuario); return; }
  if (S.acceso) { S.acceso.google = false; S.acceso.error = data.error || 'No se pudo entrar con Google'; if (S.view === 'acceso') VISTA_ACCESO.pintar(); }
}
