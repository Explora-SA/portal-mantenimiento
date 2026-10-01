/**
 * Rendimiento.gs — Generador
 *
 * Capa de estabilidad sobre doGet_ / doPost_ (Código.gs). No cambia ninguna respuesta.
 *  · Lecturas (ultima, semana, hojas): se guardan en caché.
 *  · Escrituras (guardar, editar): se hacen de a una (LockService), para que dos personas
 *    no se pisen la misma hoja. Después invalidan el caché.
 *  · Errores: siempre vuelven como JSON {ok:false,error}, nunca como página de Google.
 *  · Cada consulta deja una línea en Ejecuciones: acción, si salió del caché y cuánto tardó.
 *
 * Instalación: en Código.gs, doGet y doPost se renombran a doGet_ y doPost_.
 */

// Segundos que vale cada lectura en caché. Cualquier escritura hecha desde el portal
// invalida todo al instante; estos tiempos solo importan para cambios hechos a mano
// directamente en la planilla. Una acción que no figura acá no se cachea.
var CACHE_TTL = {
  ultima: 120,
  semana: 120,
  hojas:  300
};

var ACCION_POR_DEFECTO = 'ultima';

// ════════════════════════════════════════════════════════════════════════════
// A PARTIR DE ACÁ ES IGUAL EN TODOS LOS PROYECTOS — no hace falta tocar nada.
// ════════════════════════════════════════════════════════════════════════════

var PARAMS_IGNORADOS = ['action', 'force', '_', 't', 'ts', 'nocache'];
var LOCK_ESPERA_MS   = 30000;
var CACHE_FRAGMENTO  = 40000;   // caracteres por entrada (límite de Google: 100 KB por valor)
var CACHE_MAX_FRAG   = 100;     // respuestas de más de ~4 MB no se cachean

function doGet(e) {
  var t0 = Date.now();
  var p = (e && e.parameter) || {};
  var action = p.action || ACCION_POR_DEFECTO;
  var modo = 'directo';
  try {
    var ttl = CACHE_TTL[action];
    if (!ttl) return doGet_(e);

    var clave = claveCache_(action, p);
    if (p.force !== '1') {
      var guardado = leerCache_(clave);
      if (guardado !== null) {
        modo = 'cache';
        return json_(guardado);
      }
    }

    modo = 'planilla';
    var texto = doGet_(e).getContent();
    if (esCacheable_(texto)) guardarCache_(clave, texto, ttl);
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
    return conLock_(function () { return doPost_(e); });
  } catch (err) {
    return error_(action, err);
  } finally {
    console.log('POST ' + (action || '?') + ' · ' + (Date.now() - t0) + ' ms');
  }
}

// No se cachean respuestas de error, ni resúmenes en los que alguna planilla falló
// (así un fallo pasajero de Google no queda "pegado" hasta que venza el caché).
function esCacheable_(texto) {
  if (texto.indexOf('{"ok":false') === 0) return false;
  if (texto.indexOf('"error":"') !== -1) return false;
  return true;
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
// es simplemente cambiar la versión (un identificador único, no la hora: dos
// invalidaciones en el mismo milisegundo darían la misma versión).
function version_() {
  var c = CacheService.getScriptCache();
  var v = c.get('cache_version');
  if (!v) {
    v = Utilities.getUuid();
    c.put('cache_version', v, 21600);
  }
  return v;
}

function invalidarCache_() {
  try {
    CacheService.getScriptCache().put('cache_version', Utilities.getUuid(), 21600);
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

// Para correr a mano desde el editor si se editó una planilla y no se quiere esperar el TTL.
function limpiarCache() {
  invalidarCache_();
  console.log('Caché invalidado.');
}
