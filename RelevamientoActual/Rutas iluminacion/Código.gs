// ══════════════════════════════════════════════════════════════
// APPS SCRIPT — ILUMINACIÓN
// Preventivos Eléctricos — Planta Explora
// ══════════════════════════════════════════════════════════════


// ── MAPA DE RUTAS ──
var ILUM_SHEETS = {
  'Iluminación de Emergencia Producción PB':                                     '1BmvuK2u2Azj5MUI1z9C9ibRJd7KJJf--9Er7uGu1j7k',
  'Iluminación de Emergencia Islas de Carga':                                    '1UK3f4ECe3qxErDSbHq3EHQWKmAF8N7soD4ie_SFa-zM',
  'ILUMINACION EMERGENCIA PRODUCCION P.A':                                       '1ci4MbThKNslOVhFay3GIK85Auw6p6uE-xYE1TSBohhs',
  'Iluminación de Emergencia CCM Producción-Servicios-Glicerólisis-Generador':   '1RqHxNqvoRxo5X-xe6eukVSOxs7fXk3N2iDvnsk1ym_w',
  'Iluminación Pañoles':                                                          '102qFx0IMVrEPnFsHz05vNa7lH5VPAVz7HxvJ1VlH8LU',
  'Iluminación Edificios Producción':                                             '1azEW1EdlnvsvWoR9OiV1oVjJpmdXJKVn3_gKYVVnpaA',
  'Iluminación Edificios Mantenimiento':                                          '1tynV6OqOPxPmtrpZi3HQwYrurQEVyxNoJzNaibBaI7o',
  'Iluminación Edificios de Logística':                                           '17n2ZF3eZju4QmZsISuRqXp9DWm8xTlTCsmQJQMtSEds',
  'Iluminación Edificios Administración':                                         '18EiAJelvpDvIpH6aUGAWOqp4eoZxOaZ3WHElwSwcOX0',
  'ILUMINACION CCM PRODUCCIÓN - SERVIC - GLICEROLISIS - GENERADOR':              '1sdL-Zy1Cy42y-ACKQ0HIPDnubVGfinkAFweW4OLzMjQ',
  'ILUMINACIÓN SERVICIOS':                                                        '1N8BStr88snSeKwHSlDJmNR3EECtSBDKVK06oYNTj7Dk',
  'ILUMINACION PRODUCCION PLANTA BAJA':                                          '1zyQM-Cf_TT-Sr01Qt9DB7LUI9OcF3xZtusZORhxTEr0',
  'ILUMINACION PLANTA ALTA PRODUCCION':                                          '1dK11ocSxqpkHihOYIyMMqJ9NKEpJ6YaptqPFCUrnsVc',
  'ILUMINACION PERIMETRALES':                                                     '17BMK90hTpR5DEipRmRyuKoSqsbtjNhP8fJ-zosVEPgo',
  'ILUMINACION PLAYA DE TANQUES':                                                 '1GyAgNbWi-F_kjPCjgj-ZVsVBzMSsDwujxHGf5B-ZQcE',
  'ILUMINACION ISLA DE CARGA':                                                    '1G1_iN05OdVjW8LifG5jn1MTbo7iaj-VqksaoP5TZ36U',
  'ILUMINACION GLICEROLISIS':                                                     '1Fzl7WesxC88JFmrsp_nsP9_4Jfcmkr9OAs9wrOS8jQ0',
  'ILUMINACION BALANZA':                                                          '1wyS2XiPXh9dkQWkSppfFNg5z57T-KunJSWP8tvTVb7U',
  'ILUMINACION AREA 40 y 50':                                                     '1I-xTn3TNz7G_a6GmPvVmeAq87ca-QdQwZcjfA-rzyo0',
  'ILUMINACION AREA 31 y 32':                                                     '1cH4yWnLDkVlDgdSkWE4FUMbdu_xx0rc_rYFvCGhOrwc',
  'ILUMINACION GALPON DE QUIMICOS':                                               '1JtzYfkjrF1mArsX54WS_eHuiV_j2y6lfGtiHMPX1xlE'
};

// ══════════════════════════════════════════════════════════════
// ENTRY POINTS
// ══════════════════════════════════════════════════════════════

function doGet_(e) {
  var params = e.parameter || {};
  var action = params.action || '';
  var sheetId = params.sheetId || '';
  var force = params.force === '1';

  try {
    if (action === 'resumen') return jsonResp(getResumen(force));
    if (action === 'hojas')   return jsonResp(getHojas(sheetId));
    if (action === 'detalle') return jsonResp(getDetalle(sheetId, params.hoja || ''));
    if (action === 'equipos') return jsonResp(getEquipos(sheetId));
    return jsonResp({ ok: false, error: 'Acción no reconocida: ' + action });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message });
  }
}

function doPost_(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'guardar') return jsonResp(guardarEjecucion(body));
    if (body.action === 'editar')  return jsonResp(editarEjecucion(body)); // ← agregar
    return jsonResp({ ok: false, error: 'Acción no reconocida' });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message });
  }
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════
// RESUMEN — todas las rutas (última hoja de cada planilla)
//
// El resumen ya NO se calcula en cada pedido (abrir 21 planillas tarda más de lo que
// el navegador espera). Se calcula en segundo plano cada 10 minutos (trigger, ver
// instalarTrigger) y se guarda en las propiedades del script. El portal solo lee eso.
//  · Al guardar/editar una ejecución se actualiza solo esa ruta (rápido).
//  · force=1 ("Forzar recarga") recalcula las 21 en el momento.
// ══════════════════════════════════════════════════════════════

var PROP_RESUMEN = 'ilum_resumen_v2';

function getResumen(force) {
  if (!force) {
    var guardado = leerResumenGuardado_();
    if (guardado) return { ok: true, data: guardado.data, cached: true, actualizado: guardado.ts };
  }
  var data = calcularResumenCompleto_();
  guardarResumen_(data);
  return { ok: true, data: data, cached: false, actualizado: new Date().toISOString() };
}

function calcularResumenCompleto_() {
  return Object.keys(ILUM_SHEETS).map(function (ruta) {
    return resumenDeRuta_(ruta);
  });
}

// Calcula la fila de resumen de UNA ruta. Nunca tira error: si falla, devuelve estado 'sin-dato'.
function resumenDeRuta_(ruta) {
  try {
    var ss = SpreadsheetApp.openById(ILUM_SHEETS[ruta]);
    var hojaData = getUltimaHojaEjecucion(ss.getSheets());
    if (!hojaData) {
      return { ruta: ruta, fecha: 'Sin ejecuciones', estado: 'sin-dato', ok: 0, mal: 0, urg: 0, fs: 0 };
    }
    var stats = calcularEstadisticas(hojaData.sheet);
    var estado = stats.urg > 0 ? 'critico' : stats.mal > 0 ? 'atencion' : 'ok';
    return { ruta: ruta, fecha: hojaData.nombre, estado: estado, ok: stats.ok, mal: stats.mal, urg: stats.urg, fs: stats.fs };
  } catch (err) {
    console.error('Resumen de "' + ruta + '" falló: ' + err.message);
    return { ruta: ruta, fecha: 'Error', estado: 'sin-dato', ok: 0, mal: 0, urg: 0, fs: 0 };
  }
}

function leerResumenGuardado_() {
  try {
    var txt = PropertiesService.getScriptProperties().getProperty(PROP_RESUMEN);
    if (!txt) return null;
    var obj = JSON.parse(txt);
    return (obj && obj.data && obj.data.length) ? obj : null;
  } catch (err) {
    return null;
  }
}

function guardarResumen_(data) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      PROP_RESUMEN, JSON.stringify({ ts: new Date().toISOString(), data: data }));
  } catch (err) {
    console.error('No se pudo guardar el resumen: ' + err.message);
  }
}

// Después de guardar/editar: recalcula solo la ruta tocada y la deja en el resumen guardado.
// Nunca hace fallar el guardado.
function actualizarRutaEnResumen_(sheetId) {
  try {
    var ruta = null;
    Object.keys(ILUM_SHEETS).forEach(function (r) { if (ILUM_SHEETS[r] === sheetId) ruta = r; });
    if (!ruta) return;
    var guardado = leerResumenGuardado_();
    if (!guardado) return;   // todavía no hay resumen: lo arma el trigger o el primer pedido
    var fila = resumenDeRuta_(ruta);
    var data = guardado.data.map(function (x) { return x.ruta === ruta ? fila : x; });
    guardarResumen_(data);
  } catch (err) {
    console.error('No se pudo actualizar el resumen de la ruta: ' + err.message);
  }
}

// ── TRIGGER (se instala una sola vez, a mano) ──
// Corre cada 10 minutos. Espera su turno detrás de los guardados (mismo lock).
function actualizarResumen() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) { console.warn('actualizarResumen: sistema ocupado, se saltea esta vuelta'); return; }
  try {
    guardarResumen_(calcularResumenCompleto_());
  } finally {
    lock.releaseLock();
  }
}

// EJECUTAR UNA VEZ desde el editor: crea el trigger y deja armado el primer resumen.
function instalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizarResumen') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarResumen').timeBased().everyMinutes(10).create();
  actualizarResumen();
  console.log('Trigger instalado y resumen inicial calculado.');
}

// EJECUTAR A MANO para revisar las 21 planillas: abre cada una, y cuenta cuántos equipos
// y cuántas hojas MESAÑO reconoce el parser. Mirar el registro de ejecución.
function verificarAccesos() {
  Object.keys(ILUM_SHEETS).forEach(function (ruta) {
    try {
      var ss = SpreadsheetApp.openById(ILUM_SHEETS[ruta]);
      var ult = getUltimaHojaEjecucion(ss.getSheets());
      var equipos = ult ? leerEquipos(ult.sheet, false).length : 0;
      var estado = !ult ? 'SIN HOJA MESAÑO' : (equipos === 0 ? 'HOJA SIN EQUIPOS (revisar cabecera EQUIPO/ESTADO)' : 'OK');
      console.log(estado + ' · ' + ruta + ' · última: ' + (ult ? ult.nombre : '-') + ' · equipos: ' + equipos);
    } catch (err) {
      console.error('NO ABRE · ' + ruta + ' · ' + err.message);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// HOJAS — lista de ejecuciones disponibles de una planilla
// ══════════════════════════════════════════════════════════════

function getHojas(sheetId) {
  if (!sheetId) return { ok: false, error: 'sheetId requerido' };
  var ss = SpreadsheetApp.openById(sheetId);
  var hojas = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return /^[A-ZÁÉÍÓÚ]+\s*\d{4}$/i.test(n); })
    .sort(function (a, b) { return parseMesAnio(a) - parseMesAnio(b); });
  return { ok: true, hojas: hojas };
}

// ══════════════════════════════════════════════════════════════
// DETALLE — leer una hoja de ejecución específica
// ══════════════════════════════════════════════════════════════

function getDetalle(sheetId, hoja) {
  if (!sheetId) return { ok: false, error: 'sheetId requerido' };
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = hoja ? ss.getSheetByName(hoja) : null;

  if (!sheet) {
    var ultima = getUltimaHojaEjecucion(ss.getSheets());
    if (!ultima) return { ok: false, error: 'Sin ejecuciones registradas' };
    sheet = ultima.sheet;
    hoja = ultima.nombre;
  }

  var meta = leerMetadata(sheet);
  var equipos = leerEquipos(sheet, false);

  return {
    ok: true,
    hoja: hoja,
    realizado: meta.realizado,
    fecha: meta.fecha,
    ot: meta.ot,
    equipos: equipos
  };
}

// ══════════════════════════════════════════════════════════════
// EQUIPOS — estructura base para pre-cargar el formulario
// ══════════════════════════════════════════════════════════════

function getEquipos(sheetId) {
  if (!sheetId) return { ok: false, error: 'sheetId requerido' };
  var ss = SpreadsheetApp.openById(sheetId);

  var hojaFuente = null;
  var ultima = getUltimaHojaEjecucion(ss.getSheets());
  if (ultima) {
    hojaFuente = ultima.sheet;
  } else {
    var allSheets = ss.getSheets();
    if (allSheets.length > 0) hojaFuente = allSheets[0];
  }

  if (!hojaFuente) return { ok: false, error: 'No se encontró hoja fuente' };

  var equipos = leerEquipos(hojaFuente, true); // true = modo plantilla, sin estados
  return { ok: true, equipos: equipos };
}

// ══════════════════════════════════════════════════════════════
// GUARDAR — escribe una nueva hoja de ejecución (ej: MAYO2026)
// ══════════════════════════════════════════════════════════════

function guardarEjecucion(body) {
  var sheetId   = body.sheetId;
  var hoja      = body.hoja;
  var realizado = body.realizado || '';
  var fecha     = body.fecha || '';
  var ot        = body.ot || '';
  var equipos   = body.equipos || [];

  if (!sheetId || !hoja) return { ok: false, error: 'sheetId y hoja son requeridos' };

  var ss = SpreadsheetApp.openById(sheetId);
  var nombreHoja = normalizarNombreHoja(hoja);

  // Buscar hoja fuente (la última ejecución existente)
  var hojaFuente = null;
  var ultima = getUltimaHojaEjecucion(ss.getSheets());
  if (ultima) hojaFuente = ultima.sheet;

  // Si ya existe la hoja destino, eliminarla
  var sheetExistente = ss.getSheetByName(nombreHoja);
  if (sheetExistente) {
    if (ss.getSheets().length > 1) {
      ss.deleteSheet(sheetExistente);
    } else {
      sheetExistente.clearContents();
    }
  }

  var sheet;
  if (hojaFuente) {
    // Copiar estructura de la hoja fuente
    sheet = hojaFuente.copyTo(ss);
    sheet.setName(nombreHoja);
    ss.moveActiveSheet(ss.getSheets().length);
  } else {
    sheet = ss.insertSheet(nombreHoja);
  }

  // Escribir metadata y actualizar estados
  escribirEjecucionSobreHoja(sheet, realizado, fecha, ot, equipos);

  actualizarRutaEnResumen_(sheetId);
  return { ok: true, hoja: nombreHoja };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

// "Mayo 2026" → "MAYO2026"
function normalizarNombreHoja(nombre) {
  return nombre.toUpperCase().replace(/\s+/g, '');
}

// Detecta la última hoja con formato MESAÑO
function getUltimaHojaEjecucion(sheets) {
  var regex = /^[A-ZÁÉÍÓÚ]+\s*\d{4}$/i;
  var hojas = sheets.filter(function (s) { return regex.test(s.getName()); });
  if (!hojas.length) return null;
  hojas.sort(function (a, b) {
    return parseMesAnio(b.getName()) - parseMesAnio(a.getName());
  });
  return { sheet: hojas[0], nombre: hojas[0].getName() };
}

var MESES_MAP = {
  'ENERO':1,'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,
  'JULIO':7,'AGOSTO':8,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12
};

function parseMesAnio(nombre) {
  var n = nombre.toUpperCase().replace(/\s+/g, '');
  var match = n.match(/^([A-ZÁÉÍÓÚ]+)(\d{4})$/);
  if (!match) return 0;
  var mes = MESES_MAP[match[1]] || 0;
  var anio = parseInt(match[2]);
  return anio * 100 + mes;
}

// ── LEER METADATA (Fecha, OT, Realizó) ──
function leerMetadata(sheet) {
  var data = sheet.getDataRange().getValues();
  var realizado = '', fecha = '', ot = '';

  for (var r = 0; r < Math.min(data.length, 12); r++) {
    for (var c = 0; c < data[r].length; c++) {
      var val = String(data[r][c] || '').trim();
      var valNext = c + 1 < data[r].length ? String(data[r][c + 1] || '').trim() : '';

      if (/^fecha[:\s]*$/i.test(val) && valNext)        fecha     = valNext;
      if (/^n[°º]?\s*ot[:\s]*$/i.test(val) && valNext) ot        = valNext;
      if (/^realiz[ao][:\s]*$/i.test(val) && valNext)   realizado = valNext;

      // "Realiza: Juan García" en una sola celda
      var m = val.match(/^realiz[ao][:\s]+(.+)/i);
      if (m && m[1].trim()) realizado = m[1].trim();
    }
  }
  return { realizado: realizado, fecha: String(fecha), ot: ot };
}

// ── LEER EQUIPOS ──
// Acepta TAGs con formato: letra(s) + guión/espacio opcional + número(s)
// Ejemplos válidos: S-1, S1, E-01, E01, LB-3, LB3, PBFL-1, PBCG-14, TR1CG-24
function esTag(valor) {
  // Letra(s) seguidas opcionalmente de guión/espacio y luego número(s)
  return /^[A-Za-záéíóúÁÉÍÓÚ]+[-\s]?\d/i.test(valor);
}

function esCabecera(rowJoined) {
  return rowJoined.includes('EQUIPO') && rowJoined.includes('ESTADO');
}

function esSeccion(row, rowJoined) {
  // Es sección si: la primera celda no vacía no es un TAG, no tiene columnas de tabla,
  // y el contenido parece un título (texto corto sin ser metadata)
  if (rowJoined.includes('EQUIPO') || rowJoined.includes('ESTADO')) return false;
  if (rowJoined.includes('FECHA') || rowJoined.includes('REALIZ')) return false;
  var primerNoVacia = '';
  for (var ci = 0; ci < row.length; ci++) {
    if (row[ci]) { primerNoVacia = row[ci]; break; }
  }
  if (!primerNoVacia || primerNoVacia.length < 3 || primerNoVacia.length > 60) return false;
  if (esTag(primerNoVacia)) return false;
  // Debe tener solo una celda con contenido en la fila (o pocas)
  var celdasConTenido = row.filter(function(c){ return c !== ''; }).length;
  return celdasConTenido <= 3;
}

function leerEquipos(sheet, soloPlantilla) {
  var data = sheet.getDataRange().getValues();
  var equipos = [];
  var seccionActual = '';
  var enTabla = false;

  var COL_EQUIPO = -1, COL_UBIC = -1, COL_CIRC = -1, COL_POT = -1,
      COL_TIPO  = -1, COL_LAMP = -1, COL_EST  = -1, COL_OBS = -1;

  for (var r = 0; r < data.length; r++) {
    var row = data[r].map(function (v) { return String(v || '').trim(); });
    var rowJoined = row.join('|').toUpperCase();

    // ── Detectar cabecera de columnas ──
    if (esCabecera(rowJoined)) {
      COL_EQUIPO = COL_UBIC = COL_CIRC = COL_POT =
      COL_TIPO   = COL_LAMP = COL_EST  = COL_OBS = -1;

      row.forEach(function (cell, idx) {
        var c = cell.toUpperCase();
        if (c === 'EQUIPO')                                      COL_EQUIPO = idx;
        else if (c.includes('UBIC'))                             COL_UBIC   = idx;
        else if (c.includes('CIRCU'))                            COL_CIRC   = idx;
        else if (c.includes('POTEN'))                            COL_POT    = idx;
        else if (c.includes('TIPO'))                             COL_TIPO   = idx;
        else if (c.includes('L\u00C1MPARA') || c.includes('LAMPARA')) COL_LAMP = idx;
        else if (c === 'ESTADO')                                 COL_EST    = idx;
        else if (c.includes('OBSERV'))                           COL_OBS    = idx;
      });
      enTabla = true;
      continue;
    }

    // ── Detectar encabezado de sección ──
    if (esSeccion(row, rowJoined)) {
      var primerNoVacia = '';
      for (var ci = 0; ci < row.length; ci++) {
        if (row[ci]) { primerNoVacia = row[ci]; break; }
      }
      seccionActual = primerNoVacia;
      // NO resetear enTabla — la cabecera de columnas puede no repetirse
      continue;
    }

    // ── Leer fila de equipo ──
    if (enTabla && COL_EQUIPO >= 0) {
      var tag = row[COL_EQUIPO];
      if (!tag || !esTag(tag)) continue;

      var estadoRaw = COL_EST >= 0 ? row[COL_EST] : '';
      var estNorm   = estadoRaw.toUpperCase().trim();
      if (['OK','MAL','URG','F/S'].indexOf(estNorm) === -1) estNorm = '';

      equipos.push({
        tag:          tag,
        seccion:      seccionActual || 'General',
        ubicacion:    COL_UBIC >= 0 ? row[COL_UBIC] : '',
        circuito:     COL_CIRC >= 0 ? row[COL_CIRC] : '',
        potencia:     COL_POT  >= 0 ? row[COL_POT]  : '',
        tipo:         COL_TIPO >= 0 ? row[COL_TIPO]  : '',
        lampara:      COL_LAMP >= 0 ? row[COL_LAMP]  : '',
        estado:       soloPlantilla ? '' : estNorm,
        observaciones: COL_OBS >= 0 ? row[COL_OBS]  : ''
      });
    }
  }

  return equipos;
}

// ── CALCULAR ESTADÍSTICAS ──
function calcularEstadisticas(sheet) {
  var equipos = leerEquipos(sheet, false);
  var ok = 0, mal = 0, urg = 0, fs = 0;
  equipos.forEach(function (e) {
    var est = String(e.estado || '').toUpperCase().trim();
    if      (est === 'OK')  ok++;
    else if (est === 'MAL') mal++;
    else if (est === 'URG') urg++;
    else if (est === 'F/S') fs++;
  });
  return { ok: ok, mal: mal, urg: urg, fs: fs };
}

// ── ESCRIBIR EJECUCIÓN EN HOJA ──
function escribirEjecucionSobreHoja(sheet, realizado, fecha, ot, equipos) {
  var data = sheet.getDataRange().getValues();

  // Actualizar metadata — buscar celdas de fecha, OT y realizó
  for (var r = 0; r < Math.min(data.length, 12); r++) {
    for (var c = 0; c < data[r].length; c++) {
      var val = String(data[r][c] || '').trim().toLowerCase();
      if (/^fecha[:\s]*$/.test(val) && c + 1 < data[r].length)
        sheet.getRange(r + 1, c + 2).setValue(fecha);
      if (/^n[°º]?\s*ot[:\s]*$/.test(val) && c + 1 < data[r].length)
        sheet.getRange(r + 1, c + 2).setValue(ot);
      if (/^realiz[ao][:\s]*$/.test(val) && c + 1 < data[r].length)
        sheet.getRange(r + 1, c + 2).setValue(realizado);
      // "Realizo:" en una celda y el valor en la siguiente
      if (val.includes('realiz') && c + 1 < data[r].length && String(data[r][c+1]||'').trim() !== '')
        sheet.getRange(r + 1, c + 2).setValue(realizado);
    }
  }

  // Construir mapa de equipos por TAG para actualizar estado/obs
  var mapaEquipos = {};
  equipos.forEach(function(e) { mapaEquipos[e.tag] = e; });

  // Detectar columnas y actualizar estados
  var COL_EQUIPO = -1, COL_EST = -1, COL_OBS = -1;
  for (var r = 0; r < data.length; r++) {
    var row = data[r].map(function(v){ return String(v||'').trim(); });
    var rowJoined = row.join('|').toUpperCase();

    if (esCabecera(rowJoined)) {
      COL_EQUIPO = COL_EST = COL_OBS = -1;
      row.forEach(function(cell, idx) {
        var c = cell.toUpperCase();
        if (c === 'EQUIPO')            COL_EQUIPO = idx;
        else if (c === 'ESTADO')       COL_EST    = idx;
        else if (c.includes('OBSERV')) COL_OBS    = idx;
      });
      continue;
    }

    if (COL_EQUIPO >= 0 && COL_EST >= 0) {
      var tag = row[COL_EQUIPO];
      if (!tag || !esTag(tag)) continue;
      var eq = mapaEquipos[tag];
      if (!eq) continue;
      sheet.getRange(r + 1, COL_EST + 1).setValue(eq.estado || '');
      if (COL_OBS >= 0) sheet.getRange(r + 1, COL_OBS + 1).setValue(eq.observaciones || '');
    }
  }

  SpreadsheetApp.flush();
}
function editarEjecucion(body) {
  // body: { sheetId, hoja, equipos: [{tag, seccion, estado, observaciones, ...}] }
  var sheetId = body.sheetId;
  var hoja    = body.hoja;
  var equipos = body.equipos || [];

  if (!sheetId || !hoja) return { ok: false, error: 'sheetId y hoja son requeridos' };

  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(hoja);
  if (!sheet) return { ok: false, error: 'Hoja no encontrada: ' + hoja };

  var data = sheet.getDataRange().getValues();

  // Buscar columnas EQUIPO y ESTADO en cada cabecera
  // Para cada fila de equipo, buscar su TAG y actualizar estado y observaciones
  var COL_EQUIPO = -1, COL_EST = -1, COL_OBS = -1;

  for (var r = 0; r < data.length; r++) {
    var row = data[r].map(function(v){ return String(v||'').trim(); });
    var rowJoined = row.join('|').toUpperCase();

    // Detectar cabecera
    if (esCabecera(rowJoined)) {
      COL_EQUIPO = COL_EST = COL_OBS = -1;
      row.forEach(function(cell, idx){
        var c = cell.toUpperCase();
        if (c === 'EQUIPO')        COL_EQUIPO = idx;
        else if (c === 'ESTADO')   COL_EST    = idx;
        else if (c.includes('OBSERV')) COL_OBS = idx;
      });
      continue;
    }

    // Si tenemos cabecera activa, buscar equipos
    if (COL_EQUIPO >= 0 && COL_EST >= 0) {
      var tag = row[COL_EQUIPO];
      if (!tag || !esTag(tag)) continue;

      // Buscar si este TAG viene en el payload
      var eq = null;
      for (var i = 0; i < equipos.length; i++) {
        if (equipos[i].tag === tag) { eq = equipos[i]; break; }
      }
      if (!eq) continue;

      // Actualizar estado
      sheet.getRange(r + 1, COL_EST + 1).setValue(eq.estado || '');
      // Actualizar observaciones si hay columna
      if (COL_OBS >= 0) {
        sheet.getRange(r + 1, COL_OBS + 1).setValue(eq.observaciones || '');
      }
    }
  }

  SpreadsheetApp.flush();
  actualizarRutaEnResumen_(sheetId);

  return { ok: true };
}