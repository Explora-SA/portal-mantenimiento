/*!
 * api.js — capa de red del portal de mantenimiento (Planta Explora)
 *
 * Se carga PRIMERO en cada HTML con <script src="./api.js?v=1"></script>.
 * No hay que tocar ningún fetch existente: este archivo intercepta únicamente los
 * pedidos a script.google.com. Si este archivo no carga, las páginas funcionan como antes.
 *
 * LECTURAS (GET de una lista cerrada de acciones, ver LECTURAS):
 *   · Máximo 4 pedidos a la vez por pestaña; el resto espera su turno.
 *   · Si dos partes de la página piden lo mismo al mismo tiempo, se hace un solo pedido.
 *   · COPIA FRESCA: si hace menos de 5 minutos que se bajó lo mismo (en esta u otra página del
 *     portal), las cargas automáticas (al abrir una página, polling) reutilizan esa copia y
 *     no llaman a Google. Así ir y volver entre herramientas no multiplica los pedidos.
 *     Las solicitudes de trabajo (ST) duran menos (90 s) para que los avisos de ST nuevas
 *     lleguen casi como antes. Los tiempos están en CFG.frescoMs y CFG.frescoPorAccion.
 *     La copia deja de valer apenas ESTE navegador guarda algo (cualquier escritura invalida
 *     todo lo anterior). Va siempre al dato fresco cuando: el usuario acaba de tocar algo
 *     (actualizar, cambiar de vista), el pedido lleva force=1, o la página se recargó a mano
 *     (F5 / Ctrl+R: durante los primeros segundos no se reutiliza nada).
 *   · Si falla (Google rechaza por cuota, timeout, página de error), reintenta 2 veces,
 *     con esperas largas y despareja: reintentar todos juntos empeora una saturación.
 *   · Si sigue fallando, devuelve la última respuesta buena guardada en el navegador
 *     (hasta 24 h) y avisa con un cartel; si no hay ninguna, un mensaje claro en lugar
 *     de "Failed to fetch".
 *
 * LOGIN: reintenta si hay falla de red. Nunca guarda nada.
 *
 * ESCRITURAS (POST, y los GET que escriben: ESCRIBEN_POR_GET): JAMÁS se reintentan ni se
 *   guardan. Un reintento podría duplicar una solicitud o gastar un número de aviso.
 *   Solo se traduce el error a un mensaje claro y se descarta lo guardado de ese script,
 *   para no mostrar datos más viejos que el cambio que acaba de hacer el usuario.
 *
 * POLLING: los setInterval de 30 s o más no corren con la pestaña oculta. Al volver a
 *   verla se ejecutan una vez (escalonados) para ponerse al día. Además cada ejecución se
 *   demora un poco al azar (hasta 15 % del período) para que las pestañas abiertas a la
 *   misma hora no consulten todas en el mismo instante.
 *
 * AVISO DE GUARDADO: cuando una escritura termina bien, se dispara el evento "pm:guardado"
 *   en window (lo usa nav.js para saber que ya no hay nada a medio guardar).
 *
 * Lo desconocido pasa sin tocar: cualquier acción GET que no esté en las listas va directo.
 */
(function () {
  'use strict';
  if (window.__portalApi) return;
  if (typeof window.fetch !== 'function' || typeof Promise === 'undefined') return;

  var CFG = {
    maxSimultaneas: 4,          // pedidos a Google a la vez, por pestaña
    timeoutMs: 25000,           // cuánto esperar cada intento de lectura
    reintentos: 2,              // reintentos después del primer intento
    esperaMs: [2500, 7000],     // espera antes de cada reintento (se suma azar, ver azar())
    frescoMs: 300000,           // una copia guardada más nueva que esto (5 min) se reutiliza sin pedir
    frescoPorAccion: { getAllST: 90000, getST: 90000 },   // excepciones: las ST duran menos (avisos de ST nuevas)
    recargaManualMs: 8000,      // tras F5/Ctrl+R, durante este tiempo no se reutiliza ninguna copia
    gestoMs: 1500,              // un clic/tecla hace menos de esto = pedido del usuario: va fresco
    jitterPolling: 0.15,        // el polling se demora al azar hasta este % de su período
    guardadoMaxMs: 24 * 3600 * 1000,  // cuánto tiempo sirve un dato guardado como respaldo
    guardadoMaxChars: 700000,   // respuestas más grandes que esto no se guardan
    guardadoMaxEntradas: 40,
    pausaDesdeMs: 30000         // setInterval de 30 s o más: se pausa con la pestaña oculta
  };

  function conjunto(lista) {
    var o = Object.create(null);
    lista.forEach(function (k) { o[k] = true; });
    return o;
  }

  // Acciones que solo leen. Cualquier acción que no esté acá NO se reintenta ni se guarda.
  var LECTURAS = conjunto([
    'get', 'getST', 'getAllST', 'getSTHistorico', 'getActivos', 'getAvisos', 'getStock',
    'getStockBuscar', 'historial', 'historialAgente', 'buscarEquipo',
    'resumen', 'detalle', 'hojas', 'hoja', 'ultima', 'ultimo', 'semana', 'equipos',
    'data', 'lista', 'lista_por_fecha', 'termoAgente', 'anomalias'
  ]);

  // Viajan por GET pero ESCRIBEN en la planilla.
  var ESCRIBEN_POR_GET = conjunto(['doST', 'guardarComentarioOperador', 'getProximoNumeroAviso']);

  var nativeFetch = window.fetch.bind(window);
  var PREF = 'pm_api1:';

  // ── Clasificación de cada pedido ──────────────────────────────────────────
  function parsear(url) {
    try { return new URL(url, window.location.href); } catch (e) { return null; }
  }

  function clasificar(input, init) {
    if (typeof input !== 'string' || input.indexOf('script.google.com') === -1) return { tipo: 'directo' };
    if (init && init.signal) return { tipo: 'directo' };
    var u = parsear(input);
    if (!u) return { tipo: 'directo' };
    var base = u.origin + u.pathname;
    var metodo = String((init && init.method) || 'GET').toUpperCase();

    if (metodo === 'GET') {
      var accion = u.searchParams.get('action');
      if (accion === null) {
        // Sin acción: la lectura "por defecto" (URL pelada de Gestión; ?dept=...&modo=... de los tableros diarios).
        var soloConocidos = true;
        u.searchParams.forEach(function (v, k) { if (k !== 'dept' && k !== 'modo') soloConocidos = false; });
        return soloConocidos ? { tipo: 'lectura', base: base, u: u } : { tipo: 'directo' };
      }
      if (ESCRIBEN_POR_GET[accion]) return { tipo: 'escritura', base: base };
      if (LECTURAS[accion]) return { tipo: 'lectura', base: base, u: u };
      return { tipo: 'directo' };
    }

    var accionPost = '';
    try { accionPost = JSON.parse(init.body).action || ''; } catch (e) {}
    if (accionPost === 'login') return { tipo: 'login', base: base };
    return { tipo: 'escritura', base: base };
  }

  function claveDe(u) {
    var pares = [];
    u.searchParams.forEach(function (v, k) {
      if (k !== 'force' && k !== '_' && k !== 't' && k !== 'ts' && k !== 'nocache') pares.push(k + '=' + v);
    });
    pares.sort();
    return u.origin + u.pathname + '?' + pares.join('&');
  }

  // ── Escrituras de este navegador ──────────────────────────────────────────
  // Cualquier escritura (de cualquier herramienta) deja una marca compartida entre pestañas:
  // ninguna copia pedida ANTES de esa marca se reutiliza como "fresca". Las copias siguen
  // sirviendo de respaldo si Google no responde, pero ya no se usan para evitar un pedido.
  var CLAVE_ESCRITURA = 'pm_api1_w';
  function marcarEscritura() { try { localStorage.setItem(CLAVE_ESCRITURA, String(Date.now())); } catch (e) {} }
  function ultimaEscritura() {
    try { return parseInt(localStorage.getItem(CLAVE_ESCRITURA), 10) || 0; } catch (e) { return 0; }
  }

  // ── Recarga manual (F5 / Ctrl+R) ──────────────────────────────────────────
  // Es la forma habitual de pedir "actualizar": en los primeros segundos de la página se va
  // siempre al dato fresco.
  var inicioPagina = Date.now();
  var recargaManual = false;
  try {
    var nav0 = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    recargaManual = !!(nav0 && nav0.type === 'reload');
  } catch (e) {}

  // ── Gestos del usuario ────────────────────────────────────────────────────
  var ultimoGesto = 0;
  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (ev) {
    try { document.addEventListener(ev, function () { ultimoGesto = Date.now(); }, true); } catch (e) {}
  });

  // ── Respaldo en el navegador ──────────────────────────────────────────────
  function clavesPropias() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREF) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  function edadDe(k) {
    try { var v = localStorage.getItem(k); return v ? parseInt(v.slice(0, v.indexOf('|')), 10) || 0 : 0; } catch (e) { return 0; }
  }

  function podar(maxEntradas) {
    try {
      var lista = clavesPropias().map(function (k) { return { k: k, t: edadDe(k) }; })
        .sort(function (a, b) { return a.t - b.t; });
      var n = maxEntradas === 0 ? Math.ceil(lista.length / 2) : lista.length - maxEntradas;
      for (var i = 0; i < n; i++) localStorage.removeItem(lista[i].k);
    } catch (e) {}
  }

  // La copia se fecha con el momento en que EMPEZÓ el pedido: si en el medio hubo una
  // escritura, la copia no puede pasar por posterior a ella.
  function guardar(clave, texto, inicio) {
    if (texto.length > CFG.guardadoMaxChars) return;
    if (texto.slice(0, 40).replace(/^\s+/, '').indexOf('{"ok":false') === 0) return;
    var v = (inicio || Date.now()) + '|' + texto;
    try {
      try { localStorage.setItem(PREF + clave, v); }
      catch (e) { podar(0); localStorage.setItem(PREF + clave, v); }   // sin lugar: libera lo más viejo y reintenta una vez
      podar(CFG.guardadoMaxEntradas);
    } catch (e) {}
  }

  function leerGuardado(clave) {
    try {
      var v = localStorage.getItem(PREF + clave);
      if (!v) return null;
      var i = v.indexOf('|');
      var t = parseInt(v.slice(0, i), 10);
      if (!t || Date.now() - t > CFG.guardadoMaxMs) return null;
      return { t: t, texto: v.slice(i + 1) };
    } catch (e) { return null; }
  }

  function descartarGuardado(base) {
    try {
      clavesPropias().forEach(function (k) {
        if (k.indexOf(PREF + base) === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  // ── Cartel de estado ──────────────────────────────────────────────────────
  var fallos = {};          // clave -> null (sin datos) | timestamp del dato guardado que se mostró
  var elCartel = null;
  var descartado = false;

  function hace(ts) {
    var min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'hace menos de 1 min';
    if (min < 60) return 'hace ' + min + ' min';
    return 'hace ' + Math.floor(min / 60) + ' h';
  }

  function cartel() {
    if (elCartel) return elCartel;
    if (!document.body) return null;
    var s = document.createElement('style');
    s.textContent = '#pm-estado{position:fixed;left:12px;bottom:12px;max-width:calc(100vw - 24px);z-index:2147483000;' +
      'background:#1f2937;color:#fff;font:600 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 12px;' +
      'border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;display:none}' +
      '@media print{#pm-estado{display:none!important}}';
    document.head.appendChild(s);
    elCartel = document.createElement('div');
    elCartel.id = 'pm-estado';
    elCartel.setAttribute('role', 'status');
    elCartel.title = 'Tocar para ocultar';
    elCartel.onclick = function () { descartado = true; elCartel.style.display = 'none'; };
    document.body.appendChild(elCartel);
    return elCartel;
  }

  function refrescarCartel() {
    var hay = false, hayError = false, masViejo = null;
    for (var k in fallos) {
      hay = true;
      if (fallos[k] === null) hayError = true;
      else if (masViejo === null || fallos[k] < masViejo) masViejo = fallos[k];
    }
    if (!hay) descartado = false;
    var el = cartel();
    if (!el) {
      document.addEventListener('DOMContentLoaded', refrescarCartel);
      return;
    }
    if (!hay || descartado) { el.style.display = 'none'; return; }
    el.textContent = hayError
      ? '⚠ No se pudo conectar con el servidor · probá de nuevo en unos segundos'
      : '⚠ Sin respuesta del servidor · mostrando datos guardados de ' + hace(masViejo);
    el.style.display = 'block';
  }

  // ── Mensajes de error ─────────────────────────────────────────────────────
  function errorLectura(err) {
    var e = new Error(navigator.onLine === false
      ? 'Sin conexión a internet.'
      : 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.');
    e.original = err;
    return e;
  }

  function errorEscritura(err) {
    var e = new Error(navigator.onLine === false
      ? 'Sin conexión a internet. No se guardó nada.'
      : 'No se pudo conectar con el servidor. Es posible que el cambio no se haya guardado: revisá la lista antes de volver a cargarlo.');
    e.original = err;
    return e;
  }

  // ── Pedido individual, con tope de tiempo ─────────────────────────────────
  function copiar(init) {
    var o = {};
    if (init) for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) o[k] = init[k];
    return o;
  }

  // Resuelve con el texto de la respuesta, o rechaza si es una falla (red, timeout,
  // código HTTP de error, o la página HTML de error que devuelve Google).
  function pedirUna(url, init) {
    return new Promise(function (resolve, reject) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var opts = copiar(init);
      if (ctl) opts.signal = ctl.signal;
      var terminado = false;
      var timer = setTimeout(function () {
        if (terminado) return;
        terminado = true;
        if (ctl) ctl.abort();
        reject(new Error('tiempo de espera agotado'));
      }, CFG.timeoutMs);
      nativeFetch(url, opts).then(function (resp) {
        return resp.text().then(function (txt) { return { resp: resp, txt: txt }; });
      }).then(function (x) {
        if (terminado) return;
        terminado = true;
        clearTimeout(timer);
        var cab = x.txt.slice(0, 40).replace(/^\s+/, '');
        if (x.resp.ok && cab.charAt(0) !== '<') resolve(x.txt);
        else reject(new Error('respuesta inválida (' + x.resp.status + ')'));
      }, function (e) {
        if (terminado) return;
        terminado = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function azar() { return Math.floor(Math.random() * 1500); }

  function respuesta(r) {
    var h = { 'Content-Type': 'application/json; charset=utf-8' };
    if (r.guardado) h['X-Datos-Guardados'] = String(r.guardado);
    return new Response(r.texto, { status: 200, statusText: 'OK', headers: h });
  }

  // ── Límite de pedidos simultáneos ─────────────────────────────────────────
  var activas = 0, cola = [];

  function conCupo(fn) {
    return new Promise(function (resolve, reject) {
      cola.push({ fn: fn, resolve: resolve, reject: reject });
      avanzar();
    });
  }

  function avanzar() {
    while (activas < CFG.maxSimultaneas && cola.length) {
      (function (t) {
        activas++;
        var p;
        try { p = t.fn(); } catch (e) { p = Promise.reject(e); }
        p.then(function (v) { activas--; t.resolve(v); avanzar(); },
               function (e) { activas--; t.reject(e); avanzar(); });
      })(cola.shift());
    }
  }

  // ── Lecturas ──────────────────────────────────────────────────────────────
  var enVuelo = {};

  function pedirLectura(url, init, clave) {
    var intento = 0;
    function probar() {
      var t0 = Date.now();
      return conCupo(function () { t0 = Date.now(); return pedirUna(url, init); }).then(function (texto) {
        guardar(clave, texto, t0);
        delete fallos[clave];
        refrescarCartel();
        return { texto: texto, guardado: null };
      }, function (err) {
        intento++;
        if (intento <= CFG.reintentos) return esperar(CFG.esperaMs[intento - 1] + azar()).then(probar);
        var g = leerGuardado(clave);
        if (g) {
          fallos[clave] = g.t;
          refrescarCartel();
          return { texto: g.texto, guardado: g.t };
        }
        fallos[clave] = null;
        refrescarCartel();
        throw errorLectura(err);
      });
    }
    return probar();
  }

  function leer(url, init, c) {
    var clave = claveDe(c.u);
    var forzado = c.u.searchParams.get('force') === '1';
    var llave = clave + (forzado ? '#force' : '');
    var recienRecargada = recargaManual && Date.now() - inicioPagina < CFG.recargaManualMs;
    if (!forzado && !recienRecargada && Date.now() - ultimoGesto >= CFG.gestoMs) {
      var copia = leerGuardado(clave);
      var vigencia = CFG.frescoPorAccion[c.u.searchParams.get('action')] || CFG.frescoMs;
      if (copia && copia.t > ultimaEscritura() && Date.now() - copia.t < vigencia) {
        return Promise.resolve(respuesta({ texto: copia.texto, guardado: null }));
      }
    }
    var vuelo = enVuelo[llave];
    if (!vuelo) {
      vuelo = enVuelo[llave] = pedirLectura(url, init, clave).then(function (r) {
        delete enVuelo[llave];
        return r;
      }, function (e) {
        delete enVuelo[llave];
        throw e;
      });
    }
    return vuelo.then(respuesta);   // cada quien recibe su propia Response
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  function iniciarSesion(url, init) {
    var intento = 0;
    function probar() {
      return pedirUna(url, init).then(function (texto) {
        return respuesta({ texto: texto });
      }, function (err) {
        intento++;
        if (intento <= CFG.reintentos) return esperar(CFG.esperaMs[intento - 1] + azar()).then(probar);
        throw errorLectura(err);
      });
    }
    return probar();
  }

  // ── Escrituras ────────────────────────────────────────────────────────────
  function avisarGuardado(r) {
    try {
      if (!r.ok) return;
      r.clone().text().then(function (t) {
        if (t.slice(0, 40).replace(/^\s+/, '').indexOf('{"ok":false') !== 0) window.dispatchEvent(new Event('pm:guardado'));
      }, function () {});
    } catch (e) {}
  }

  function escribir(input, init, c) {
    return nativeFetch(input, init).then(function (r) {
      marcarEscritura();
      descartarGuardado(c.base);
      avisarGuardado(r);
      return r;
    }, function (e) {
      marcarEscritura();
      descartarGuardado(c.base);
      throw errorEscritura(e);
    });
  }

  // ── Pausa del polling con la pestaña oculta ───────────────────────────────
  var siNativo = window.setInterval;
  var ciNativo = window.clearInterval;
  var registro = {};

  function instalarPolling() {
    window.setInterval = function (fn, ms) {
      if (typeof fn !== 'function' || !(ms >= CFG.pausaDesdeMs)) return siNativo.apply(window, arguments);
      var extra = Array.prototype.slice.call(arguments, 2);
      var reg = { pendiente: false };
      reg.ejecutar = function () { reg.pendiente = false; return fn.apply(window, extra); };
      var id = siNativo.call(window, function () {
        if (document.hidden) { reg.pendiente = true; return; }
        // Se demora un poco al azar para no consultar todas las pestañas en el mismo instante.
        var demora = Math.floor(Math.random() * ms * CFG.jitterPolling);
        reg.pendiente = true;   // si la pestaña se oculta durante la demora, se pone al día al volver
        setTimeout(function () {
          if (!registro[id] || !reg.pendiente) return;
          if (document.hidden) return;
          reg.ejecutar();
        }, demora);
      }, ms);
      registro[id] = reg;
      return id;
    };
    window.clearInterval = function (id) {
      delete registro[id];
      return ciNativo.call(window, id);
    };
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      Object.keys(registro).forEach(function (id) {
        if (registro[id] && registro[id].pendiente) {
          setTimeout(function () {
            if (registro[id] && registro[id].pendiente) registro[id].ejecutar();
          }, Math.floor(Math.random() * 3000));
        }
      });
    });
  }

  // ── Instalación ───────────────────────────────────────────────────────────
  window.fetch = function (input, init) {
    var c;
    try { c = clasificar(input, init); } catch (e) { return nativeFetch(input, init); }
    if (c.tipo === 'lectura') return leer(input, init, c);
    if (c.tipo === 'login') return iniciarSesion(input, init);
    if (c.tipo === 'escritura') return escribir(input, init, c);
    return nativeFetch(input, init);
  };

  try { instalarPolling(); } catch (e) { window.setInterval = siNativo; window.clearInterval = ciNativo; }

  window.__portalApi = {
    version: 3,
    // Para diagnóstico desde la consola: __portalApi.limpiarGuardado()
    limpiarGuardado: function () { clavesPropias().forEach(function (k) { localStorage.removeItem(k); }); }
  };
})();
