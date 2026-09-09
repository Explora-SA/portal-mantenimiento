// ─── UPS CRÍTICAS ────────────────────────────────────────────────────────────
const UPS_ID = "1WNVAYopCTTCEbBO0QDGfykt8QL-nk50qcdIaIA_vBt4";
const TZ_UPS = "America/Argentina/Buenos_Aires";
const MESES_UPS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Estructura fija del sheet
// Fecha     : F4  (idx fila 3, col 5)
// Ejecutante: F9  (idx fila 8, col 5)
// Ítems de cada UPS: 8 ítems
const ITEMS_UPS = [
  "Fallo",
  "Modo Normal",
  "Modo Bypass",
  "Modo Baterías",
  "Consumo Carga [%]",
  "Tensión Baterías [V]",
  "Tensión Salida [V]",
  "Limpieza General"
];

// Definición de cada UPS: nombre identificador, fila nombre, fila datos inicio, col inicio (0-based)
// Columnas lado izquierdo: C=2, D=3, E=4, F=5
// Columnas lado derecho:   H=7, I=8, J=9, K=10
const UPS_DEF = [
  { id: "UPS 1",  fila_nombre: 6,  fila_datos: 9,  col_nombre: 2, col_estado: 3, col_obs: 4 },
  { id: "UPS 2",  fila_nombre: 18, fila_datos: 21, col_nombre: 2, col_estado: 3, col_obs: 4 },
  { id: "UPS 3",  fila_nombre: 30, fila_datos: 33, col_nombre: 2, col_estado: 3, col_obs: 4 },
  { id: "UPS 4",  fila_nombre: 6,  fila_datos: 9,  col_nombre: 7, col_estado: 8, col_obs: 9 },
  { id: "UPS 6",  fila_nombre: 18, fila_datos: 21, col_nombre: 7, col_estado: 8, col_obs: 9 },
  { id: "UPS 5",  fila_nombre: 30, fila_datos: 33, col_nombre: 7, col_estado: 8, col_obs: 9 },
  { id: "UPS 12", fila_nombre: 43, fila_datos: 46, col_nombre: 7, col_estado: 8, col_obs: 9 }
];

// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ultima";
  if (action === "ultima")  return getUltimaHojaUPS();
  if (action === "hoja")    return getHojaUPS(e.parameter);
  if (action === "hojas")   return getHojasUPS();
  return jsonUPS({ ok: false, error: "Accion no reconocida" });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "guardar") return guardarUPS(payload);
    if (payload.action === "editar")  return editarUPS(payload); // ← agregar
    return jsonUPS({ ok: false, error: "Accion no reconocida" });
  } catch(err) {
    return jsonUPS({ ok: false, error: err.message });
  }
}

function jsonUPS(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ÚLTIMA HOJA ─────────────────────────────────────────────────────────────
function getUltimaHojaUPS() {
  try {
    const ss    = SpreadsheetApp.openById(UPS_ID);
    const hojas = ss.getSheets();
    if (!hojas.length) return jsonUPS({ ok: false, error: "Sin hojas" });

    // Buscar desde la última hoja hacia atrás la que tenga fecha
    for (let h = hojas.length - 1; h >= 0; h--) {
      const sheet = hojas[h];
      const rows  = sheet.getDataRange().getDisplayValues();
      const fecha = String(rows[3][5] || "").trim(); // F4 (idx 3,5)
      if (!fecha) continue;
      const datos = leerHojaUPS(rows);
      datos.hoja  = sheet.getName();
      return jsonUPS({ ok: true, ...datos });
    }
    return jsonUPS({ ok: false, error: "Sin datos cargados" });
  } catch(err) {
    return jsonUPS({ ok: false, error: err.message });
  }
}

// ─── HOJA ESPECÍFICA ─────────────────────────────────────────────────────────
function getHojaUPS(params) {
  try {
    const ss    = SpreadsheetApp.openById(UPS_ID);
    const sheet = ss.getSheetByName(params.hoja);
    if (!sheet) return jsonUPS({ ok: false, error: "Hoja no encontrada" });
    const rows  = sheet.getDataRange().getDisplayValues();
    const datos = leerHojaUPS(rows);
    datos.hoja  = sheet.getName();
    return jsonUPS({ ok: true, ...datos });
  } catch(err) {
    return jsonUPS({ ok: false, error: err.message });
  }
}

// ─── LISTA DE HOJAS ───────────────────────────────────────────────────────────
function getHojasUPS() {
  try {
    const ss    = SpreadsheetApp.openById(UPS_ID);
    const hojas = ss.getSheets().map(function(s){ return s.getName(); });
    return jsonUPS({ ok: true, hojas: hojas });
  } catch(err) {
    return jsonUPS({ ok: false, error: err.message });
  }
}

// ─── LEER HOJA ───────────────────────────────────────────────────────────────
function leerHojaUPS(rows) {
  // Fecha en F4 (idx 3, col 5)
  const fecha      = String(rows[3] && rows[3][5] ? rows[3][5] : "").trim();
  // Ejecutante en F9 (idx 8, col 5)
  const ejecutante = String(rows[8] && rows[8][5] ? rows[8][5] : "").trim();

  const ups_data = UPS_DEF.map(function(u) {
    // Nombre completo del UPS (ej: "UPS 1 - CCM Servicios - Kaise 6KVA")
    const nombreFila = u.fila_nombre - 1; // 0-based
    const nombre = String(rows[nombreFila] && rows[nombreFila][u.col_nombre] ? rows[nombreFila][u.col_nombre] : u.id).trim();

    // Leer los 8 ítems
    const items = [];
    let tieneMal = false;
    for (let i = 0; i < ITEMS_UPS.length; i++) {
      const filaIdx = u.fila_datos - 1 + i; // 0-based
      if (filaIdx >= rows.length) { items.push({ nombre: ITEMS_UPS[i], estado: "", obs: "" }); continue; }
      const row    = rows[filaIdx];
      const estado = String(row[u.col_estado] || "").trim();
      const obs    = String(row[u.col_obs]    || "").trim();
      if (estado.toUpperCase() === "MAL") tieneMal = true;
      items.push({ nombre: ITEMS_UPS[i], estado: estado, obs: obs });
    }

    return {
      id:        u.id,
      nombre:    nombre,
      items:     items,
      estado:    tieneMal ? "MAL" : "OK"
    };
  });

  return { fecha, ejecutante, ups: ups_data };
}

// ─── GUARDAR ──────────────────────────────────────────────────────────────────
function guardarUPS(payload) {
  try {
    const ss         = SpreadsheetApp.openById(UPS_ID);
    const fecha      = new Date(payload.fecha + "T12:00:00");
    const hojaNombre = payload.hoja || (MESES_UPS[fecha.getMonth()] + " " + fecha.getFullYear());

    // Obtener o crear hoja
    let sheet = ss.getSheetByName(hojaNombre);
    if (!sheet) {
      const hojas = ss.getSheets();
      const base  = hojas[hojas.length - 1];
      sheet = base.copyTo(ss);
      sheet.setName(hojaNombre);
      ss.setActiveSheet(sheet);
ss.moveActiveSheet(1);
      _limpiarHojaUPS(sheet);
    }

    const fechaStr = Utilities.formatDate(fecha, TZ_UPS, "dd/MM/yyyy");

    // Escribir fecha en F4 y ejecutante en F9
    sheet.getRange(4, 6).setValue(fechaStr);
    sheet.getRange(9, 6).setValue(payload.ejecutante || "");

    // Escribir datos de cada UPS
    const ups_payload = payload.ups || [];
    ups_payload.forEach(function(u) {
      const def = UPS_DEF.find(function(d){ return d.id === u.id; });
      if (!def) return;
      const items = u.items || [];
      items.forEach(function(item, i) {
        const fila = def.fila_datos + i;
        sheet.getRange(fila, def.col_estado + 1).setValue(item.estado || ""); // +1 porque getRange es 1-based
        sheet.getRange(fila, def.col_obs    + 1).setValue(item.obs    || "");
      });
    });

    SpreadsheetApp.flush();
    Logger.log("Guardado UPS: hoja=" + hojaNombre);
    return jsonUPS({ ok: true, hoja: hojaNombre });

  } catch(err) {
    Logger.log("Error guardarUPS: " + err.message);
    return jsonUPS({ ok: false, error: err.message });
  }
}

// ─── LIMPIAR HOJA COPIADA ─────────────────────────────────────────────────────
function _limpiarHojaUPS(sheet) {
  // Limpiar fecha y ejecutante
  sheet.getRange(4, 6).clearContent();
  sheet.getRange(9, 6).clearContent();
  // Limpiar estado y obs de cada UPS
  UPS_DEF.forEach(function(u) {
    for (var i = 0; i < ITEMS_UPS.length; i++) {
      sheet.getRange(u.fila_datos + i, u.col_estado + 1).clearContent();
      sheet.getRange(u.fila_datos + i, u.col_obs    + 1).clearContent();
    }
  });
}
function editarUPS(payload) {
  // payload: { hoja, ups: [{ id, items: [{estado, obs}] }] }
  try {
    const ss    = SpreadsheetApp.openById(UPS_ID);
    const sheet = ss.getSheetByName(payload.hoja);
    if (!sheet) return jsonUPS({ ok: false, error: "Hoja no encontrada" });

    const ups_payload = payload.ups || [];
    ups_payload.forEach(function(u) {
      const def = UPS_DEF.find(function(d){ return d.id === u.id; });
      if (!def) return;
      const items = u.items || [];
      items.forEach(function(item, i) {
        const fila = def.fila_datos + i;
        sheet.getRange(fila, def.col_estado + 1).setValue(item.estado || "");
        sheet.getRange(fila, def.col_obs    + 1).setValue(item.obs    || "");
      });
    });

    SpreadsheetApp.flush();
    return jsonUPS({ ok: true });

  } catch(err) {
    return jsonUPS({ ok: false, error: err.message });
  }
}