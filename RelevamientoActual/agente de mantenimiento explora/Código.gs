// ══════════════════════════════════════════════════════════════════════
// ORQUESTADOR CENTRAL — Agente de Mantenimiento
// Planta Explora — v3
//
// Acciones:
//   ?action=alertas                → críticos/urgentes 2026 de todas las fuentes
//   ?action=resumen                → panorama general por módulo
//   ?action=historial&equipo=XXX   → historial de fallas en ST + ST_HISTORICO
//   ?action=plano&equipo=XXX       → link al plano del equipo (col M hoja EQUIPOS)
// ══════════════════════════════════════════════════════════════════════


// ── 1. URLs ──────────────────────────────────────────────────────────
var URLS = {
  termo:   "https://script.google.com/macros/s/AKfycby8csX0lGP2KSnmci36DlbmsY1ITehQtg5WHTLYVoJqtYrJzB7htJCOjanwxb888DgA/exec",
  motores: "https://script.google.com/macros/s/AKfycbyQFDz8Iu-d8VbcvFA1oDD4bJSUZcxk9UBQmNoaeIfFZPhhCgjY8TfcU23qwc3LCNO4NA/exec",
  inst:    "https://script.google.com/macros/s/AKfycbzeTpVTJLQsTPz7rliOTCCGe93aoTJWuc0hLq9n--H0CQmFsBqEvvA5iAARJ9aZbfal/exec",
  gen:     "https://script.google.com/macros/s/AKfycbzXtAdtux9Cak7OXdl9MWb5m7c0CG2PeEmfIY99xJhWLX4cnG0OLet59Z3k-aS0hmBDsQ/exec",
  ups:     "https://script.google.com/macros/s/AKfycbwzyC0PKWOEQ9zvO6AJEzqYoilsQaW7gAJthjaYcENpHWywi0Vb6PfKaqy5GHtRGd__/exec",
  ilum:    "https://script.google.com/macros/s/AKfycbw9by_ho3PtiKvD0w06DO0i33YnjF4xoX7-2EVNpuE_r0qgiME3Ficj8hOjlzEMPCCJgQ/exec",
  mec:     "https://script.google.com/macros/s/AKfycby5So_nECYJTCAynBNMCsA2_xAixgY3qGJ04HhUBmvs4J82U3DbOidr8RNLRYe6F032cA/exec",
  vibr:    "https://script.google.com/macros/s/AKfycbxD6LrpcW0ez2eGzUxP8WZ-HErHFm2plzv0Ii2pSZESRaFGMidSbERFyQJfUt8mh_4cPw/exec",
  planif:  "https://script.google.com/macros/s/AKfycbxBBiJZexMdWlGFDWKnIaPiOmSACB9RL1G-w03amZYBBwIw4AUWl59WzIdZoyqNrtiXvg/exec",
  oper:    "https://script.google.com/macros/s/AKfycbw_5QaekPMEZlvA4kG0ipAZbr1YNQdJ3Fc2LARfDTLparODulBn4sU-J4DUnlI6S0tvXg/exec"
};

var NOMBRES = {
  termo:   "Termografía",
  motores: "Motores",
  inst:    "Instrumentación",
  gen:     "Generador",
  ups:     "UPS",
  ilum:    "Iluminación",
  mec:     "Preventivos Mecánicos",
  vibr:    "Vibraciones",
  planif:  "Planificador"
};


// ── 2. Filtros por módulo ────────────────────────────────────────────
// Solo alertas del 2026 con los estados definidos por módulo

function esFechaAnioActual(fecha) {
  if (!fecha) return false;
  var anio = new Date().getFullYear();
  var s = String(fecha);
  if (s.includes(String(anio))) return true;
  // Formato corto "dd/MM/yy" — últimos 2 dígitos
  var anioCorto = String(anio).slice(-2);
  if (s.includes("/" + anioCorto) || s.includes("-" + anioCorto)) return true;
  if (!isNaN(Date.parse(s))) return new Date(s).getFullYear() === anio;
  return false;
}
// Alias para compatibilidad
var esFecha2026 = esFechaAnioActual;

function esAlertaTermografia(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e === "AT" || e === "MT";
}

function esAlertaMotores(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e === "URG" || e === "MAL";
}

function esAlertaInst(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e === "URG" || e === "MAL" || e.includes("CRITI");
}

function esAlertaIlum(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e === "URG" || e === "MAL";
}

function esAlertaVibr(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e.includes("CRITI");  // solo críticos, no alerta
}

// Normalizador: mayúsculas sin tildes
function norm(s) {
  return s.toString().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Detector genérico (para resumen)
function esAlerta(estado) {
  if (!estado) return false;
  var e = norm(estado);
  return e === "AT" || e === "MT" || e === "MAL" || e === "URG" ||
    e.includes("CRITI") || e.includes("ALERTA") || e.includes("URGENT");
}


// ── 3. fetchAll paralelo con timeout ────────────────────────────────
function fetchTodos(requests) {
  var opciones = requests.map(function(r) {
    var qs = Object.keys(r.params).map(function(k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(r.params[k]);
    }).join("&");
    return {
      url: r.url + (qs ? "?" + qs : ""),
      muteHttpExceptions: true,
      followRedirects: true,
      deadline: 25
    };
  });

  var resultado = {};
  try {
    var resps = UrlFetchApp.fetchAll(opciones);
    resps.forEach(function(resp, i) {
      try {
        resultado[requests[i].key] = resp.getResponseCode() === 200
          ? JSON.parse(resp.getContentText())
          : null;
      } catch(e) {
        resultado[requests[i].key] = null;
      }
    });
  } catch(e) {
    Logger.log("fetchAll error: " + e.toString());
    requests.forEach(function(r) { resultado[r.key] = null; });
  }
  return resultado;
}

function fetchUno(url, params) {
  try {
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    var resp = UrlFetchApp.fetch(url + "?" + qs, {
      muteHttpExceptions: true, followRedirects: true, deadline: 12
    });
    return resp.getResponseCode() === 200 ? JSON.parse(resp.getContentText()) : null;
  } catch(e) { return null; }
}


// ── 4. Formato común ─────────────────────────────────────────────────
function mkAlerta(modulo, equipo, estado, sector, fecha, obs) {
  return {
    modulo:        NOMBRES[modulo] || modulo,
    equipo:        equipo  || "Sin nombre",
    estado:        estado  || "—",
    sector:        sector  || "—",
    fecha:         fecha   || "—",
    observaciones: obs     || ""
  };
}


// ── 5. Extractores con filtro 2026 ───────────────────────────────────

function extraerTermografia(d) {
  var out = [];
  if (!d) return out;
  (d.tableros || []).forEach(function(t) {
    if (esAlertaTermografia(t.estado) && esFecha2026(t.fecha))
      out.push(mkAlerta("termo", t.tag || t.nombre, t.estado, t.sector, t.fecha, t.observaciones || t.obs));
  });
  return out;
}

function extraerMotores(d) {
  var out = [];
  if (!d) return out;
  (d.equipos || d.items || d.data || []).forEach(function(e) {
    if (esAlertaMotores(e.estado) && esFecha2026(e.fecha))
      out.push(mkAlerta("motores", e.nombre || e.equipo, e.estado, e.sector || e.ruta, e.fecha, e.observaciones || e.obs));
  });
  return out;
}

function extraerInst(d) {
  var out = [];
  if (!d) return out;
  // El script devuelve {cached, data:[{ruta, hoja, fecha, mal, urg, estado}]}
  var lista = d.data || d.equipos || d.items || [];
  lista.forEach(function(e) {
    if (esAlertaInst(e.estado) && esFechaAnioActual(e.fecha)) {
      var obs = [];
      if (e.mal > 0) obs.push(e.mal + ' MAL');
      if (e.urg > 0) obs.push(e.urg + ' URG');
      out.push(mkAlerta("inst",
        e.ruta || e.nombre || e.equipo || 'Sin nombre',
        e.estado,
        e.hoja || e.sector || '—',
        e.fecha,
        obs.join(', ')
      ));
    }
  });
  return out;
}

function extraerIlum(d) {
  var out = [];
  if (!d) return out;
  // Formato real: {ok, data:[{ruta, fecha, estado, mal, urg, fs, ok}]}
  var lista = d.data || d.rutas || [];
  lista.forEach(function(r) {
    var fechaRuta = r.fecha || '';
    // Si tiene items adentro (formato anidado)
    var items = r.items || r.equipos || [];
    if (items.length) {
      items.forEach(function(item) {
        if (esAlertaIlum(item.estado) && esFecha2026(item.fecha || fechaRuta))
          out.push(mkAlerta("ilum", item.nombre || item.ubicacion, item.estado,
            r.ruta || r.nombre, item.fecha || fechaRuta, item.obs || ''));
      });
    } else {
      // Formato plano: mal y urg son contadores
      var tieneAlertas = (r.mal > 0 || r.urg > 0);
      if (tieneAlertas && esFecha2026(fechaRuta)) {
        var estadoRuta = r.urg > 0 ? 'URG' : 'MAL';
        var obs = [];
        if (r.mal > 0) obs.push(r.mal + ' MAL');
        if (r.urg > 0) obs.push(r.urg + ' URG');
        out.push(mkAlerta("ilum", r.ruta || r.nombre, estadoRuta,
          r.sector || '—', fechaRuta, obs.join(', ')));
      }
    }
  });
  return out;
}

function extraerUPS(d) {
  var out = [];
  if (!d) return out;
  (d.ups || d.items || d.data || []).forEach(function(u) {
    if (esAlerta(u.estado) && esFecha2026(u.fecha))
      out.push(mkAlerta("ups", u.nombre || u.ups, u.estado, u.sector, u.fecha, u.observaciones || u.obs));
  });
  return out;
}

function extraerGen(d) {
  var out = [];
  if (!d) return out;
  var items = d.items || d.data || d.generador || [];
  if (!Array.isArray(items)) items = [items];
  items.forEach(function(g) {
    if (esAlerta(g.estado) && esFecha2026(g.fecha))
      out.push(mkAlerta("gen", g.nombre || "Generador", g.estado, g.sector, g.fecha, g.observaciones || g.obs));
  });
  return out;
}

function extraerVibr(d) {
  var out = [];
  if (!d) return out;
  (d.bombas || d.items || d.data || []).forEach(function(b) {
    if (esAlertaVibr(b.estado) && esFecha2026(b.fecha))
      out.push(mkAlerta("vibr", b.tag || b.nombre, b.estado, b.sector, b.fecha,
        b.maxAcel ? "Acel. máx: " + b.maxAcel + "g" : (b.obs || "")));
  });
  return out;
}


// ══════════════════════════════════════════════════════════════════════
// 6. ACTION: alertas
// ══════════════════════════════════════════════════════════════════════

function accionAlertas() {
  // Caché de 10 minutos
  var cache = CacheService.getScriptCache();
  var cachedAlertas = cache.get('orq_alertas');
  if (cachedAlertas) {
    return JSON.parse(cachedAlertas);
  }

  // Solo termografía y vibraciones — consulta rápida inicial
  var datos = fetchTodos([
    { key: "termo",   url: URLS.termo,   params: { action: "resumen" } },
    { key: "vibr",    url: URLS.vibr,    params: { action: "resumen" } }
  ]);

  var alertas = []
    .concat(extraerTermografia(datos.termo))
    .concat(extraerVibr(datos.vibr));

  var errores = Object.keys(datos)
    .filter(function(k) { return datos[k] === null; })
    .map(function(k) { return NOMBRES[k] || k; });

  var resultado = {
    ok:      true,
    fecha:   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    total:   alertas.length,
    alertas: alertas,
    errores: errores
  };
  // Guardar en caché 10 minutos — se invalida cuando hay nueva carga
  cache.put('orq_alertas', JSON.stringify(resultado), 600);
  return resultado;
}


// ══════════════════════════════════════════════════════════════════════
// 6b. ACTION: alertas_completas — todas las fuentes (consulta bajo demanda)
// ══════════════════════════════════════════════════════════════════════

function accionAlertasCompletas() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('orq_alertas_full');
  if (cached) return JSON.parse(cached);

  var datos = fetchTodos([
    { key: "termo",   url: URLS.termo,   params: { action: "resumen" } },
    { key: "vibr",    url: URLS.vibr,    params: { action: "resumen" } },
    { key: "motores", url: URLS.motores, params: { action: "resumen" } },
    { key: "inst",    url: URLS.inst,    params: { action: "resumen" } },
    { key: "ilum",    url: URLS.ilum,    params: { action: "resumen" } },
    { key: "ups",     url: URLS.ups,     params: { action: "ultima"  } },
    { key: "gen",     url: URLS.gen,     params: { action: "ultima"  } }
  ]);

  var alertas = []
    .concat(extraerTermografia(datos.termo))
    .concat(extraerVibr(datos.vibr))
    .concat(extraerMotores(datos.motores))
    .concat(extraerInst(datos.inst))
    .concat(extraerIlum(datos.ilum))
    .concat(extraerUPS(datos.ups))
    .concat(extraerGen(datos.gen));

  var errores = Object.keys(datos)
    .filter(function(k) { return datos[k] === null; })
    .map(function(k) { return NOMBRES[k] || k; });

  var resultado = {
    ok:      true,
    fecha:   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    total:   alertas.length,
    alertas: alertas,
    errores: errores
  };
  cache.put('orq_alertas_full', JSON.stringify(resultado), 600);
  return resultado;
}


// ══════════════════════════════════════════════════════════════════════
// 7. ACTION: resumen
// ══════════════════════════════════════════════════════════════════════

function accionResumen() {
  var datos = fetchTodos([
    { key: "termo",   url: URLS.termo,   params: { action: "resumen" } },
    { key: "motores", url: URLS.motores, params: { action: "resumen" } },
    { key: "inst",    url: URLS.inst,    params: { action: "resumen" } },
    { key: "ilum",    url: URLS.ilum,    params: { action: "resumen" } },
    { key: "ups",     url: URLS.ups,     params: { action: "ultima"  } },
    { key: "gen",     url: URLS.gen,     params: { action: "ultima"  } },
    { key: "vibr",    url: URLS.vibr,    params: { action: "resumen" } }
  ]);

  var modulos = [
    { key: "termo",   nombre: "Termografía",     items: (datos.termo   || {}).tableros || []                                       },
    { key: "motores", nombre: "Motores",          items: (datos.motores || {}).equipos  || (datos.motores || {}).items || []        },
    { key: "inst",    nombre: "Instrumentación",  items: (datos.inst    || {}).equipos  || (datos.inst    || {}).items || []        },
    { key: "ups",     nombre: "UPS",              items: (datos.ups     || {}).ups      || (datos.ups     || {}).items || []        },
    { key: "gen",     nombre: "Generador",        items: (datos.gen     || {}).items    || (datos.gen     || {}).data  || []        }
  ].map(function(m) {
    var al = (m.items || []).filter(function(i) { return esAlerta(i.estado); }).length;
    return { modulo: m.nombre, total: m.items.length, alertas: al, ok: m.items.length - al,
             error: datos[m.key] === null };
  });

  var totalAlertas = modulos.reduce(function(s, m) { return s + m.alertas; }, 0);
  return {
    ok:           true,
    fecha:        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    totalAlertas: totalAlertas,
    modulos:      modulos
  };
}


// ══════════════════════════════════════════════════════════════════════
// 8. ACTION: historial — busca en ST y ST_HISTORICO del planificador
// ══════════════════════════════════════════════════════════════════════

function accionHistorial(equipo) {
  var eqNorm = equipo.toString().toUpperCase().trim();
  var registros = [];

  // Leer ST activas y ST_HISTORICO del planificador en paralelo
  var datos = fetchTodos([
    { key: "st",   url: URLS.planif, params: { action: "getST" } },
    { key: "hist", url: URLS.planif, params: { action: "getSTHistorico" } }
  ]);

  // Procesar ST activas
  var sts = datos.st;
  var stList = [];
  if (sts) {
    if (Array.isArray(sts)) stList = sts;
    else if (sts.data)  stList = sts.data;
    else if (sts.ots)   stList = sts.ots;
    else if (sts.items) stList = sts.items;
  }
  stList.forEach(function(ot) {
    var eqOt = String(ot.equipo || ot.tag || ot.activo || ot.EQUIPO || ot.TAG || "").toUpperCase().trim();
    if (eqOt && (eqOt.includes(eqNorm) || eqNorm.includes(eqOt))) {
      registros.push({
        fuente:  "ST Activa",
        fecha:   ot.fecha_ejecucion || ot.fecha || ot.fecha_bol || ot.FECHA || "—",
        numero:  ot.ot || ot.numero || ot.ST || ot.id || "—",
        estado:  ot.estado || ot.ESTADO || "—",
        desc:    ot.descripcion || ot.desc || ot.DESCRIPCION || "",
        quien:   ot.ejecutante_1 || ot.ejecutante || ot.responsable || ot.EJECUTANTE || "",
        obs:     ot.observaciones || ot.comentarios || ot.OBS || ""
      });
    }
  });

  // Procesar ST_HISTORICO
  var hist = datos.hist;
  var histList = [];
  if (hist) {
    if (Array.isArray(hist)) histList = hist;
    else if (hist.data)  histList = hist.data;
    else if (hist.ots)   histList = hist.ots;
    else if (hist.items) histList = hist.items;
  }
  histList.forEach(function(ot) {
    var eqOt = String(ot.equipo || ot.tag || ot.activo || ot.EQUIPO || ot.TAG || "").toUpperCase().trim();
    if (eqOt && (eqOt.includes(eqNorm) || eqNorm.includes(eqOt))) {
      registros.push({
        fuente:  "ST Histórico",
        fecha:   ot.fecha_ejecucion || ot.fecha || ot.FECHA_EJECUCION || ot.FECHA || "—",
        numero:  ot.ot || ot.numero || ot.ST || ot.id || "—",
        estado:  ot.estado || ot.ESTADO || "Cerrada",
        desc:    ot.descripcion || ot.desc || ot.DESCRIPCION || "",
        quien:   ot.ejecutante_1 || ot.ejecutante || ot.responsable || ot.EJECUTANTE || "",
        obs:     ot.observaciones || ot.comentarios || ot.OBS || ""
      });
    }
  });

  // Operadores (eléctrico y mecánico) — año actual
  try {
    var doOper = fetchUno(URLS.oper, { action: "historial", equipo: equipo, dept: "ambos" });
    if (doOper && doOper.registros) {
      doOper.registros.forEach(function(r) {
        if (!r.descripcion) return;
        registros.push({
          fuente:        "Operadores (" + (r.especialidad || '') + ")",
          fecha:         r.fecha || "—",
          numero:        r.semana || "—",
          estado:        r.realizado === "1" || r.realizado === 1 ? "Realizado" : "Pendiente",
          desc:          r.descripcion || "",
          quien:         r.operador || "",
          obs_supervisor: r.obs_supervisor || "",
          obs_operador:  r.obs_operador || ""
        });
      });
    }
  } catch(e) {}

  // Ordenar por fecha descendente
  registros.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  return {
    ok:        true,
    equipo:    equipo,
    total:     registros.length,
    registros: registros
  };
}


// ══════════════════════════════════════════════════════════════════════
// 9. ACTION: plano — busca el link al plano en hoja EQUIPOS col M
// ══════════════════════════════════════════════════════════════════════

function accionPlano(equipo) {
  var eqNorm = equipo.toString().toUpperCase().trim();

  var datos = fetchUno(URLS.planif, { action: "getActivos" });
  if (!datos) return { ok: false, error: "No se pudo acceder a la lista de equipos" };

  var lista = [];
  if (Array.isArray(datos))      lista = datos;
  else if (datos.data)           lista = datos.data;
  else if (datos.activos)        lista = datos.activos;
  else if (datos.items)          lista = datos.items;
  else if (datos.equipos)        lista = datos.equipos;

  // Buscar el equipo — flexiblemente
  var encontrado = null;
  lista.forEach(function(item) {
    if (encontrado) return;
    var cod = String(
      item.codigo || item.tag || item.TAG || item.CODIGO ||
      item.equipo || item.EQUIPO || item.nombre || item.NOMBRE || ""
    ).toUpperCase().trim();
    if (cod && (cod.includes(eqNorm) || eqNorm.includes(cod))) {
      encontrado = item;
    }
  });

  if (!encontrado) return { ok: false, error: "Equipo no encontrado: " + equipo };

  // Columna M = índice 12 si es array, o campo plano/PLANO/link/archivo
  var plano = "";
  if (Array.isArray(encontrado)) {
    plano = encontrado[12] || "";
  } else {
    plano = encontrado.plano || encontrado.PLANO || encontrado.archivo ||
            encontrado.link  || encontrado.LINK  || encontrado.documento || "";
  }

  if (!plano) return { ok: false, error: "El equipo existe pero no tiene plano cargado" };

  return {
    ok:     true,
    equipo: equipo,
    plano:  plano.toString(),
    datos:  {
      nombre:  encontrado.nombre || encontrado.NOMBRE || encontrado.descripcion || equipo,
      sector:  encontrado.sector || encontrado.SECTOR || "—",
      tipo:    encontrado.tipo   || encontrado.TIPO   || "—"
    }
  };
}


// ══════════════════════════════════════════════════════════════════════
// 10. PUNTO DE ENTRADA
// ══════════════════════════════════════════════════════════════════════

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || "resumen";
  var resultado;

  try {
    if (action === "alertas") {
      resultado = accionAlertas();
    } else if (action === "alertas_completas") {
      resultado = accionAlertasCompletas();
    } else if (action === "resumen") {
      resultado = accionResumen();
    } else if (action === "historial") {
      var equipo = params.equipo || params.tag || "";
      resultado = equipo
        ? accionHistorial(equipo)
        : { ok: false, error: "Falta parámetro 'equipo'" };
    } else if (action === "plano") {
      var equipoPlano = params.equipo || params.tag || "";
      resultado = equipoPlano
        ? accionPlano(equipoPlano)
        : { ok: false, error: "Falta parámetro 'equipo'" };
    } else {
      resultado = { ok: false, error: "Acción no reconocida: " + action };
    }
  } catch(err) {
    resultado = { ok: false, error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}
function limpiarCache() {
  var cache = CacheService.getScriptCache();
  cache.remove('orq_alertas');
  cache.remove('orq_alertas_full');
}