/**
 * Rendimiento.gs — capa de estabilidad sobre doGet_ / doPost_ (Código.gs)
 *
 * Qué hace, sin cambiar ninguna respuesta del contrato actual:
 *  1. Lecturas: guarda la respuesta en CacheService. Mientras el caché esté vigente,
 *     la consulta no abre la planilla (responde en milisegundos).
 *  2. Escrituras: las serializa con LockService. Evita IDs duplicados de ST/activos/
 *     vencimientos y borrados de la fila equivocada cuando dos personas guardan a la vez.
 *     Después de cada escritura invalida todo el caché, así nadie ve datos viejos.
 *  3. Errores: cualquier excepción vuelve como JSON {ok:false,error}, nunca como la
 *     página HTML de Google (que el navegador muestra como "Failed to fetch").
 *  4. Registro: cada consulta deja una línea en Ejecuciones con acción, caché y tiempo.
 *
 * Instalación: en Código.gs, doGet y doPost se renombran a doGet_ y doPost_.
 */

// Segundos que vale cada lectura en caché. Una acción que no está acá no se cachea.
// Las escrituras hechas por el portal invalidan todo al instante; estos tiempos solo
// importan para cambios hechos a mano directamente en la planilla.
var CACHE_TTL = {
  get:             120,  // vencimientos
  getST:            60,
  getAllST:         60,
  getSTHistorico:  600,
  getActivos:      300,
  getAvisos:       300,
  getStock:        120,
  getStockBuscar:  120,
  historial:       300,
  historialAgente: 300,
  buscarEquipo:    300,
  getTextoPDF:    3600   // convierte un PDF a Doc: la operación más cara del script
};

// Acciones que llegan por GET pero escriben: van con lock y sin caché.
var GET_QUE_ESCRIBEN = ['doST', 'guardarComentarioOperador', 'getProximoNumeroAviso'];

// Acciones que llegan por POST pero solo leen: sin lock, para no esperar detrás de una escritura.
var POST_QUE_LEEN = ['login'];

// Parámetros que no forman parte de la clave de caché (anti-caché del navegador, etc.).
var PARAMS_IGNORADOS = ['action', '_', 't', 'ts', 'nocache'];

var LOCK_ESPERA_MS  = 30000;
var CACHE_FRAGMENTO = 40000;   // caracteres por entrada (límite de Google: 100 KB por valor)
var CACHE_MAX_FRAG  = 100;     // respuestas de más de ~4 MB no se cachean

function doGet(e) {
  var t0 = Date.now();
  var p = (e && e.parameter) || {};
  var action = p.action || 'get';
  var modo = 'directo';
  try {
    // Ficha de equipo (HTML): se sirve tal cual, sin tocar.
    if (p.activo) return doGet_(e);

    if (GET_QUE_ESCRIBEN.indexOf(action) !== -1) {
      modo = 'lock';
      return conLock_(function () { return doGet_(e); });
    }

    var ttl = CACHE_TTL[action];
    if (!ttl) return doGet_(e);

    var clave = claveCache_(action, p);
    var guardado = leerCache_(clave);
    if (guardado !== null) {
      modo = 'cache';
      return json_(guardado);
    }

    modo = 'planilla';
    var texto = doGet_(e).getContent();
    if (texto.indexOf('{"ok":false') !== 0) guardarCache_(clave, texto, ttl);
    return json_(texto);
  } catch (err) {
    modo = 'error';
    return error_(action, err);
  } finally {
    console.log('GET ' + action + ' · ' + modo + ' · ' + (Date.now() - t0) + ' ms');
  }
}

function doPost(e) {
  var t0 = Date.now();
  var action = '';
  try {
    try { action = JSON.parse(e.postData.contents).action || ''; } catch (x) {}
    if (POST_QUE_LEEN.indexOf(action) !== -1) return doPost_(e);
    return conLock_(function () { return doPost_(e); });
  } catch (err) {
    return error_(action, err);
  } finally {
    console.log('POST ' + (action || 'create') + ' · ' + (Date.now() - t0) + ' ms');
  }
}

// ── Lock de escritura ──────────────────────────────────────────────────────
function conLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) {
    return json_(JSON.stringify({
      ok: false,
      error: 'El sistema está ocupado guardando otros cambios. Probá de nuevo en unos segundos.'
    }));
  }
  try {
    var salida = fn();
    SpreadsheetApp.flush();   // asegura que la escritura esté en la planilla antes de soltar el lock
    invalidarCache_();
    return salida;
  } finally {
    lock.releaseLock();
  }
}

// ── Caché ──────────────────────────────────────────────────────────────────
// La clave incluye una "versión" que cambia con cada escritura: invalidar todo
// es simplemente cambiar la versión. Una lectura que empezó antes de una escritura
// guarda su resultado bajo la versión vieja, que ya nadie consulta.
function version_() {
  var c = CacheService.getScriptCache();
  var v = c.get('cache_version');
  if (!v) {
    v = String(Date.now());
    c.put('cache_version', v, 21600);
  }
  return v;
}

function invalidarCache_() {
  try {
    CacheService.getScriptCache().put('cache_version', String(Date.now()), 21600);
  } catch (err) {
    console.warn('No se pudo invalidar el caché: ' + err);
  }
}

function claveCache_(action, params) {
  var partes = Object.keys(params)
    .filter(function (k) { return PARAMS_IGNORADOS.indexOf(k) === -1; })
    .sort()
    .map(function (k) { return k + '=' + params[k]; });
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, action + '?' + partes.join('&'));
  var hex = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return 'r_' + version_() + '_' + hex;
}

function leerCache_(clave) {
  try {
    var c = CacheService.getScriptCache();
    var n = parseInt(c.get(clave), 10);
    if (!n) return null;
    var claves = [];
    for (var i = 0; i < n; i++) claves.push(clave + '_' + i);
    var frag = c.getAll(claves);
    var texto = '';
    for (var j = 0; j < n; j++) {
      if (frag[claves[j]] == null) return null;   // se perdió un fragmento: tratar como vacío
      texto += frag[claves[j]];
    }
    return texto;
  } catch (err) {
    console.warn('Lectura de caché falló: ' + err);
    return null;
  }
}

function guardarCache_(clave, texto, ttl) {
  try {
    var n = Math.ceil(texto.length / CACHE_FRAGMENTO) || 1;
    if (n > CACHE_MAX_FRAG) return;
    var valores = {};
    for (var i = 0; i < n; i++) valores[clave + '_' + i] = texto.substr(i * CACHE_FRAGMENTO, CACHE_FRAGMENTO);
    valores[clave] = String(n);
    CacheService.getScriptCache().putAll(valores, ttl);
  } catch (err) {
    console.warn('Escritura de caché falló: ' + err);
  }
}

// ── Utilidades ─────────────────────────────────────────────────────────────
function json_(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

function error_(action, err) {
  var mensaje = String((err && err.message) || err);
  console.error('Error en ' + action + ': ' + mensaje + (err && err.stack ? '\n' + err.stack : ''));
  return json_(JSON.stringify({ ok: false, error: mensaje }));
}

// Para correr a mano desde el editor si se editó la planilla y no se quiere esperar el TTL.
function limpiarCache() {
  invalidarCache_();
  console.log('Caché invalidado.');
}
