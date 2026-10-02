/*!
 * nav.js — navegación entre herramientas del portal de mantenimiento (Planta Explora)
 *
 * Se carga en cada HTML con <script src="./nav.js?v=1"></script> (después de api.js).
 *
 * QUÉ HACE
 *  · En cada herramienta agrega, a la derecha de la barra superior, un botón "🏠 Inicio" y una
 *    flechita ▾ con las herramientas a las que el usuario tiene acceso, para saltar de una a otra
 *    sin pasar por el portal. Navega en la MISMA pestaña. Son links comunes: con Ctrl+clic o
 *    clic del medio se abren en una pestaña aparte, como siempre.
 *  · Es la ÚNICA fuente de la lista de herramientas y sus permisos: el portal también la lee de acá
 *    (PortalNav.TOOLS), así que el menú y las tarjetas del portal nunca pueden diferir.
 *  · AVISO DE DATOS SIN GUARDAR: si el usuario escribió en un campo de texto (observaciones,
 *    descripción, etc.) y no guardó, el navegador pregunta antes de salir o de volver atrás.
 *    No cuentan los buscadores, filtros, listas desplegables, casillas ni el login, ni los campos
 *    de un formulario que ya se cerró.
 *
 *  · CIERRE DE SESIÓN POR INACTIVIDAD: si en la pestaña no se toca nada durante 10 minutos (30 en
 *    las herramientas de campo, donde hay pausas largas entre carga y carga), se cierra la sesión
 *    y se vuelve al login del portal, que no consulta nada. Un minuto antes aparece un aviso con
 *    cuenta regresiva ("Seguir conectado"); cualquier toque lo cancela. Si hay algo a medio
 *    cargar en pantalla (texto escrito, una lista desplegable o casilla cambiada) se espera el
 *    doble antes de cerrar. Una pantalla fija (TV) se abre con &pantalla=1 en el link y queda
 *    exenta. Sin sesión iniciada no se hace nada.
 *    OJO: esto alivia la carga, no es una medida de seguridad: el link de cada herramienta
 *    lleva usuario y rol, así que quien lo abra de nuevo entra igual.
 *
 * Esta pantalla (portal.html / index.html) no lleva el botón: ya es el inicio.
 */
(function () {
  'use strict';
  if (window.PortalNav) return;

  // ── Herramientas y permisos ───────────────────────────────────────────────
  var TOOLS = [
    {
      id: 'planificador',
      nombre: 'Planificador',
      desc: 'Dashboard principal — ST, vencimientos, calendario, activos e indicadores',
      icon: '📋',
      color: '#e67e22',
      archivo: 'Planificador_v3.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        return 'none';
      }
    },
    {
      id: 'solicitudes',
      nombre: 'Solicitudes de Trabajo',
      desc: 'Portal para cargar y hacer seguimiento de solicitudes de trabajo',
      icon: '📝',
      color: '#7c3aed',
      archivo: 'solicitudes_trabajo_v2.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor') || r.includes('solicitante') || r.includes('logistica')) return 'full';
        return 'none';
      }
    },
    {
      id: 'operadores',
      nombre: 'Dashboard Operadores',
      desc: 'Tareas diarias del planificador — ver, marcar realizadas y cargar observaciones',
      icon: '🔧',
      color: '#16a34a',
      archivo: 'operadores.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('logistica')) return 'none';
        if(r.includes('editor') || r.includes('supervisor') || r.includes('operador')) return 'full';
        return 'none';
      }
    },
    {
      id: 'preventivos',
      nombre: 'Preventivos Eléctricos',
      desc: 'Termografía, motores, instrumentación, UPS y generador',
      icon: '⚡',
      color: '#f97316',
      archivo: 'Dashboard_Preventivos_Electricos.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        if(r.includes('operador_mecanico')) return 'read';
        if(r.includes('operador_electrico')) return 'full';
        return 'none';
      }
    },
    {
      id: 'gestion',
      nombre: 'KPIs de Gestión',
      desc: 'Indicadores de desempeño del mantenimiento, historial y ficha por equipo',
      icon: '📊',
      color: '#8b5cf6',
      archivo: 'Dashboard_Gestion_del_Mantenimiento.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        return 'none';
      }
    },
    {
      id: 'activos',
      nombre: 'Activos',
      desc: 'Gestión de activos, historial de intervenciones y stock de repuestos',
      icon: '🏭',
      color: '#6366f1',
      archivo: 'Dashboard_Activos.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        if(r.includes('solicitante')) return 'read';
        return 'none';
      }
    },
    {
      id: 'prev_mecanicos',
      nombre: 'Preventivos Mecánicos',
      desc: 'Autoelevador, compresores, generador, red contra incendio e inspección TAAH',
      icon: '🔧',
      color: '#0ea5e9',
      archivo: 'Dashboard_Preventivos_Mecanicos.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        if(r.includes('operador_electrico')) return 'read';
        if(r.includes('operador_mecanico')) return 'full';
        return 'none';
      }
    },
    {
      id: 'logistica',
      nombre: 'Logística',
      desc: 'Inspección visual TAAH — Control mensual de condición externo',
      icon: '🛢️',
      color: '#10b981',
      archivo: 'Dashboard_Logistica.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor') || r.includes('logistica')) return 'full';
        return 'none';
      }
    },
    {
      id: 'vibraciones',
      nombre: 'Vibraciones',
      desc: 'Medición de vibraciones y análisis histórico de bombas',
      icon: '📊',
      color: '#2563eb',
      archivo: 'Vibraciones_Final_Historico.html',
      accesoPor: function(rol) {
        var r = (rol||'').toLowerCase();
        if(r.includes('editor') || r.includes('supervisor')) return 'full';
        if(r.includes('operador_electrico')) return 'read';
        if(r.includes('operador_mecanico')) return 'full';
        return 'none';
      }
    }
  ];

  // gestor_st ve lo mismo que un solicitante en el portal:
  // se normaliza el rol para que las verificaciones .includes('solicitante') lo incluyan.
  function rolEfectivo(rol) {
    var r = rol || '';
    if (r.toLowerCase().includes('gestor_st') && !r.toLowerCase().includes('solicitante')) {
      r = r + ',solicitante';
    }
    return r;
  }

  // ── Sesión actual (la misma que usan las herramientas) ────────────────────
  var CLAVES_SESION = ['mant_session', 'st_session', 'op_session', 'portal_session'];

  function sesion() {
    try {
      var p = new URLSearchParams(window.location.search);
      var u = p.get('usuario'), r = p.get('rol');
      if (u && r) return { usuario: u, rol: r };
    } catch (e) {}
    for (var i = 0; i < CLAVES_SESION.length; i++) {
      try {
        var s = JSON.parse(sessionStorage.getItem(CLAVES_SESION[i]));
        if (s && s.usuario && s.rol) return { usuario: s.usuario, rol: s.rol };
      } catch (e) {}
    }
    return null;
  }

  function urlDe(archivo, s) {
    return archivo + '?usuario=' + encodeURIComponent(s.usuario) + '&rol=' + encodeURIComponent(s.rol);
  }

  var pagina = '';
  try { pagina = decodeURIComponent(window.location.pathname.split('/').pop() || '').toLowerCase(); } catch (e) {}
  var esPortal = pagina === '' || pagina === 'portal.html' || pagina === 'index.html';

  // ── Botón Inicio + menú ───────────────────────────────────────────────────
  var CSS =
    '.pm-nav{position:relative;display:inline-flex;align-items:stretch;font:600 12px/1 inherit;font-family:inherit;flex-shrink:0}' +
    '.pm-nav a,.pm-nav button{font:inherit;color:var(--text3,#4b5563);background:var(--surface,#fff);' +
      'border:1px solid var(--border,#e5e7eb);height:30px;display:inline-flex;align-items:center;gap:6px;' +
      'cursor:pointer;text-decoration:none;box-sizing:border-box;margin:0}' +
    '.pm-nav-home{padding:0 10px;border-radius:8px 0 0 8px}' +
    '.pm-nav-more{padding:0 8px;border-left:0!important;border-radius:0 8px 8px 0}' +
    '.pm-nav a:hover,.pm-nav button:hover{background:var(--surface2,#f3f4f6);color:var(--text,#111827)}' +
    '.pm-menu{display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:270px;max-height:70vh;overflow:auto;' +
      'background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.18);padding:6px;z-index:5000}' +
    '.pm-menu.pm-abierto{display:block}' +
    '.pm-menu .pm-item{display:flex;width:100%;height:auto;padding:8px 10px;border:0;border-radius:7px;gap:10px;' +
      'background:transparent;font-weight:600;font-size:13px;color:var(--text,#111827);text-align:left}' +
    '.pm-menu a.pm-item:hover{background:var(--surface2,#f3f4f6)}' +
    '.pm-menu .pm-actual{background:var(--surface2,#f3f4f6);cursor:default;opacity:.75}' +
    '.pm-menu .pm-ic{width:20px;text-align:center}' +
    '.pm-menu .pm-nm{flex:1}' +
    '.pm-menu .pm-bd{font-size:10px;font-weight:600;color:var(--text4,#9ca3af)}' +
    '.pm-menu .pm-sep{height:1px;background:var(--border,#e5e7eb);margin:4px 2px}' +
    '#pm-idle{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:calc(100vw - 24px);z-index:2147483001;' +
      'display:none;align-items:center;gap:14px;background:#1f2937;color:#fff;font:600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;' +
      'padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4)}' +
    '#pm-idle button{font:inherit;background:#fff;color:#111827;border:0;border-radius:7px;padding:7px 12px;cursor:pointer;white-space:nowrap}' +
    '@media(max-width:700px){.pm-nav-home .pm-tx{display:none}}' +
    '@media print{.pm-nav,#pm-idle{display:none!important}}';

  function asegurarCSS() {
    if (document.getElementById('pm-nav-css')) return;
    var st = document.createElement('style');
    st.id = 'pm-nav-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function llenarMenu(menu) {
    var s = sesion();
    var h = '<a class="pm-item" href="portal.html"><span class="pm-ic">🏠</span><span class="pm-nm">Inicio</span></a>';
    if (s) {
      var rol = rolEfectivo(s.rol), filas = '';
      TOOLS.forEach(function (t) {
        var ac = t.accesoPor(rol);
        if (ac === 'none') return;
        var bd = ac === 'read' ? '<span class="pm-bd">Solo lectura</span>' : '';
        if (t.archivo.toLowerCase() === pagina) {
          filas += '<div class="pm-item pm-actual" aria-current="page"><span class="pm-ic">' + t.icon + '</span><span class="pm-nm">' + t.nombre + '</span><span class="pm-bd">Estás acá</span></div>';
        } else {
          filas += '<a class="pm-item" href="' + urlDe(t.archivo, s) + '"><span class="pm-ic">' + t.icon + '</span><span class="pm-nm">' + t.nombre + '</span>' + bd + '</a>';
        }
      });
      if (filas) h += '<div class="pm-sep"></div>' + filas;
    }
    menu.innerHTML = h;
  }

  function crearControl() {
    var wrap = el('div', 'pm-nav');
    wrap.id = 'pm-nav';
    var home = el('a', 'pm-nav-home', '<span class="pm-ic">🏠</span><span class="pm-tx">Inicio</span>');
    home.href = 'portal.html';
    home.title = 'Volver al inicio';
    var mas = el('button', 'pm-nav-more', '▾');
    mas.type = 'button';
    mas.title = 'Ir a otra herramienta';
    mas.setAttribute('aria-haspopup', 'true');
    mas.setAttribute('aria-expanded', 'false');
    var menu = el('div', 'pm-menu');
    menu.setAttribute('role', 'menu');
    wrap.appendChild(home);
    wrap.appendChild(mas);
    wrap.appendChild(menu);

    function cerrar() { menu.classList.remove('pm-abierto'); mas.setAttribute('aria-expanded', 'false'); }
    mas.addEventListener('click', function (e) {
      e.stopPropagation();
      var abrir = !menu.classList.contains('pm-abierto');
      if (abrir) { llenarMenu(menu); menu.classList.add('pm-abierto'); } else { cerrar(); }
      mas.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) cerrar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
    return wrap;
  }

  function insertar(wrap) {
    var host = document.querySelector('.topbar-right');
    if (host) { host.insertBefore(wrap, host.firstChild); return; }
    var barra = document.querySelector('.topbar') || document.querySelector('body > div[style*="sticky"]');
    if (barra && barra.lastElementChild) {
      // Cabecera sin bloque derecho propio: el botón se suma junto al último bloque, sin mover el resto.
      var ultimo = barra.lastElementChild;
      var sobre = el('div');
      sobre.style.cssText = 'display:flex;align-items:center;gap:14px';
      barra.replaceChild(sobre, ultimo);
      sobre.appendChild(wrap);
      sobre.appendChild(ultimo);
      return;
    }
    wrap.style.cssText = 'position:fixed;top:10px;right:10px;z-index:4000';
    document.body.appendChild(wrap);
  }

  function montar() {
    if (document.getElementById('pm-nav')) return;
    asegurarCSS();
    insertar(crearControl());
    // Para que "Inicio" no pida login de nuevo aunque la herramienta se haya abierto en otra pestaña.
    var s = sesion();
    try {
      if (s && !sessionStorage.getItem('portal_session')) {
        sessionStorage.setItem('portal_session', JSON.stringify({ usuario: s.usuario, rol: s.rol }));
      }
    } catch (e) {}
  }

  // ── Aviso de datos sin guardar ────────────────────────────────────────────
  var campos = [];
  var TIPOS_TEXTO = ['text', 'number', 'tel', 'email', 'date', 'time', 'datetime-local', 'url', ''];
  var PARECE_FILTRO = /busc|search|filtr|filter|login|usuario|pass|contrase/i;

  function esCampoDeTrabajo(e) {
    if (!e || !e.tagName) return false;
    var tag = e.tagName.toUpperCase();
    if (tag !== 'TEXTAREA' && !(tag === 'INPUT' && TIPOS_TEXTO.indexOf((e.getAttribute('type') || '').toLowerCase()) !== -1)) return false;
    var huella = [e.id, e.name, e.className, e.getAttribute('placeholder'), e.getAttribute('aria-label')].join(' ');
    if (PARECE_FILTRO.test(huella)) return false;
    try { if (e.closest('[class*="login"],[id*="login"]')) return false; } catch (x) {}
    return true;
  }

  function haySinGuardar() {
    return campos.some(function (e) {
      return e.isConnected && e.getClientRects().length > 0 && String(e.value || '').trim() !== '';
    });
  }

  document.addEventListener('input', function (ev) {
    var e = ev.target;
    if (esCampoDeTrabajo(e) && campos.indexOf(e) === -1) campos.push(e);
  }, true);

  // Para el cierre por inactividad también cuentan las listas desplegables y casillas que el
  // usuario cambió (un chequeo a medio llenar): acá un falso aviso solo posterga el cierre.
  var tocados = [];
  var PARECE_LOGIN = /login|usuario|pass|contrase/i;
  document.addEventListener('change', function (ev) {
    var e = ev.target;
    if (!e || !e.tagName) return;
    var tag = e.tagName.toUpperCase();
    var esControl = tag === 'SELECT' || (tag === 'INPUT' && /^(checkbox|radio)$/i.test(e.getAttribute('type') || ''));
    if (!esControl || tocados.indexOf(e) !== -1) return;
    if (PARECE_LOGIN.test([e.id, e.name, e.className].join(' '))) return;
    try { if (e.closest('[class*="login"],[id*="login"]')) return; } catch (x) {}
    tocados.push(e);
  }, true);

  function hayTrabajoEnCurso() {
    if (haySinGuardar()) return true;
    return tocados.some(function (e) { return e.isConnected && e.getClientRects().length > 0; });
  }

  window.addEventListener('pm:guardado', function () { campos.length = 0; tocados.length = 0; });

  window.addEventListener('beforeunload', function (ev) {
    if (window.__pmSalidaForzada || !haySinGuardar()) return;
    ev.preventDefault();
    ev.returnValue = '';
    return '';
  });

  // ── Cierre de sesión por inactividad ──────────────────────────────────────
  var INACTIVIDAD_MIN = {
    defecto: 10,
    // Herramientas de campo (se recorren con la tablet): hay pausas largas entre una carga y otra.
    'dashboard_preventivos_electricos.html': 30,
    'dashboard_preventivos_mecanicos.html': 30,
    'dashboard_logistica.html': 30,
    'vibraciones_final_historico.html': 30
  };
  var TICK_MS = 15000;    // cada cuánto se revisa
  var AVISO_MS = 60000;   // aviso previo al cierre
  var CLAVE_PANTALLA = 'pm_pantalla';
  var CLAVE_EXPIRADA = 'pm_sesion_expirada';

  function limiteMin() { return INACTIVIDAD_MIN[pagina] || INACTIVIDAD_MIN.defecto; }

  // Pantalla fija (TV): se abre con &pantalla=1 y queda exenta mientras dure la pestaña (&pantalla=0 lo quita).
  try {
    var pp = new URLSearchParams(window.location.search).get('pantalla');
    if (pp === '1') sessionStorage.setItem(CLAVE_PANTALLA, '1');
    else if (pp === '0') sessionStorage.removeItem(CLAVE_PANTALLA);
  } catch (e) {}

  function sesionVigilada() {
    try { if (sessionStorage.getItem(CLAVE_PANTALLA) === '1') return false; } catch (e) {}
    return !!sesion();
  }

  var ultimaActividad = Date.now();
  var avisoEl = null, cuenta = null;

  function ocultarAviso() {
    if (avisoEl) avisoEl.style.display = 'none';
    if (cuenta) { clearInterval(cuenta); cuenta = null; }
  }

  function mostrarAviso(seg) {
    if (!document.body) return;
    asegurarCSS();
    if (!avisoEl) {
      avisoEl = el('div', '', '<div><b>¿Seguís ahí?</b> Por inactividad, tu sesión se cerrará en <span id="pm-idle-s"></span> s.</div><button type="button">Seguir conectado</button>');
      avisoEl.id = 'pm-idle';
      avisoEl.setAttribute('role', 'alertdialog');
      document.body.appendChild(avisoEl);
    }
    avisoEl.querySelector('#pm-idle-s').textContent = seg;
    avisoEl.style.display = 'flex';
    if (!cuenta) cuenta = setInterval(revisarInactividad, 1000);
  }

  function cerrarPorInactividad() {
    if (window.__pmSalidaForzada) return;   // ya se está saliendo: no volver a ordenarlo
    window.__pmSalidaForzada = true;        // y que el aviso de "datos sin guardar" no frene la salida
    try {
      CLAVES_SESION.forEach(function (k) { sessionStorage.removeItem(k); });
      sessionStorage.setItem(CLAVE_EXPIRADA, String(limiteMin()));
    } catch (e) {}
    window.PortalNav.irA(esPortal ? window.location.pathname : 'portal.html');
  }

  function revisarInactividad() {
    if (!sesionVigilada()) { ocultarAviso(); return; }
    var inactivo = Date.now() - ultimaActividad;
    var limite = limiteMin() * 60000;
    var tope = hayTrabajoEnCurso() ? limite * 2 : limite;   // con algo a medio cargar, el doble
    if (inactivo >= tope) { cerrarPorInactividad(); return; }
    if (inactivo >= tope - AVISO_MS) mostrarAviso(Math.ceil((tope - inactivo) / 1000));
    else ocultarAviso();
  }

  ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      ultimaActividad = Date.now();
      if (avisoEl && avisoEl.style.display !== 'none') ocultarAviso();
    }, true);
  });

  setInterval(revisarInactividad, TICK_MS);
  // Al volver a una pestaña que estuvo oculta, se revisa enseguida (los temporizadores de las pestañas ocultas se frenan).
  document.addEventListener('visibilitychange', function () { if (!document.hidden) revisarInactividad(); });

  // En el login del portal, avisar por qué se cerró la sesión.
  function mostrarExpiracion() {
    var min = null;
    try { min = sessionStorage.getItem(CLAVE_EXPIRADA); } catch (e) {}
    if (!min) return;
    var err = document.getElementById('login-error');
    if (err) {
      err.textContent = 'Tu sesión se cerró por inactividad (' + min + ' min). Ingresá de nuevo.';
      err.style.color = 'var(--text3,#4b5563)';
    }
    try { sessionStorage.removeItem(CLAVE_EXPIRADA); } catch (e) {}
  }

  // ── API pública ───────────────────────────────────────────────────────────
  window.PortalNav = {
    version: 2,
    TOOLS: TOOLS,
    rolEfectivo: rolEfectivo,
    sesion: sesion,
    haySinGuardar: haySinGuardar,
    limiteInactividadMin: limiteMin,
    irA: function (url) { window.location.replace(url); }   // aparte para poder probarlo
  };

  function alCargar(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  if (!esPortal) alCargar(montar);
  else alCargar(mostrarExpiracion);
})();
