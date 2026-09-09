// ─── GENERADOR ───────────────────────────────────────────────────────────────
const GENERADOR_ID = "1fyb1MCBC7qCzEKdg-X9pZ1fWyRF70jsqB1Pn6oNshlU";
const TZ_GEN       = "America/Argentina/Buenos_Aires";
const MESES_GEN    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Cada semana tiene su fila de FECHA fija dentro de la hoja
// Estructura: fila_fecha, fila_encabezado, fila_datos_inicio (17 ítems)
const SEMANAS = [
  { semana: 1, fila_fecha: 6,   fila_datos: 9   },
  { semana: 2, fila_fecha: 37,  fila_datos: 40  },
  { semana: 3, fila_fecha: 68,  fila_datos: 71  },
  { semana: 4, fila_fecha: 99,  fila_datos: 102 },
  { semana: 5, fila_fecha: 125, fila_datos: 128 }
];

// Col C (idx 2) = ítem, Col D (idx 3) = estado, Col E (idx 4) = observaciones
// Ejecutante en Col F (idx 5) de la fila fila_datos + 2 (Nivel agua dest. norte)
const ITEMS_GEN = [
  "Nivel Aceite",
  "Nivel Refrigerante",
  "Nivel de agua destilada Batería norte",
  "Nivel de agua destilada Batería sur",
  "Limpieza bornes de baterías norte",
  "Limpieza bornes de baterías sur",
  "Medición de tensión baterías norte",
  "Medición de tensión baterías sur",
  "Horas de funcionamiento",
  "Concentración de ácido",
  "Visual estado de correas",
  "Visual estado de radiador",
  "Estado filtros de aire",
  "Pérdidas de aceite",
  "Pérdidas de refrigerante",
  "Pérdidas de combustible",
  "Estado general de limpieza"
];

// Calcula número de semana del mes según el día
function getSemanaDelMes(fecha) {
  var dia = fecha.getDate();
  if (dia <= 7)  return 1;
  if (dia <= 14) return 2;
  if (dia <= 21) return 3;
  if (dia <= 28) return 4;
  return 5;
}

// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ultima";
  if (action === "ultima")   return getUltimaSemana();
  if (action === "semana")   return getSemana(e.parameter);
  if (action === "hojas")    return getHojasGen();
  return jsonGen({ ok: false, error: "Accion no reconocida" });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "guardar") return guardarSemanaGen(payload);
    if (payload.action === "editar")  return editarSemanaGen(payload); // ← agregar
    return jsonGen({ ok: false, error: "Accion no reconocida" });
  } catch(err) {
    return jsonGen({ ok: false, error: err.message });
  }
}

function jsonGen(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ÚLTIMA SEMANA COMPLETADA ─────────────────────────────────────────────────
// Busca en la última hoja la semana más reciente que tenga fecha
function getUltimaSemana() {
  try {
    const ss    = SpreadsheetApp.openById(GENERADOR_ID);
    const hojas = ss.getSheets();
    if (!hojas.length) return jsonGen({ ok: false, error: "Sin hojas" });

    // Buscar desde la última hoja hacia atrás
    for (let h = hojas.length - 1; h >= 0; h--) {
      const sheet = hojas[h];
      const rows  = sheet.getDataRange().getDisplayValues();

      // Buscar la última semana con fecha cargada (de mayor a menor)
      for (let s = SEMANAS.length - 1; s >= 0; s--) {
        const sem      = SEMANAS[s];
        const filaIdx  = sem.fila_fecha - 1; // 0-based
        if (filaIdx >= rows.length) continue;
        const fechaVal = rows[filaIdx][2]; // Col C (idx 2)
        if (!fechaVal) continue;

        const datos = leerSemanaGen(rows, sem);
        datos.hoja   = sheet.getName();
        datos.semana = sem.semana;
        return jsonGen({ ok: true, ...datos });
      }
    }
    return jsonGen({ ok: false, error: "Sin datos cargados" });
  } catch(err) {
    return jsonGen({ ok: false, error: err.message });
  }
}

// ─── SEMANA ESPECÍFICA ────────────────────────────────────────────────────────
function getSemana(params) {
  const hojaNombre = params.hoja;
  const semanaNum  = parseInt(params.semana);
  try {
    const ss    = SpreadsheetApp.openById(GENERADOR_ID);
    const sheet = ss.getSheetByName(hojaNombre);
    if (!sheet) return jsonGen({ ok: false, error: "Hoja no encontrada" });

    const sem = SEMANAS.find(function(s){ return s.semana === semanaNum; });
    if (!sem) return jsonGen({ ok: false, error: "Semana no válida" });

    const rows  = sheet.getDataRange().getDisplayValues();
    const datos = leerSemanaGen(rows, sem);
    datos.hoja   = hojaNombre;
    datos.semana = semanaNum;
    return jsonGen({ ok: true, ...datos });
  } catch(err) {
    return jsonGen({ ok: false, error: err.message });
  }
}

// ─── HOJAS DISPONIBLES ────────────────────────────────────────────────────────
function getHojasGen() {
  try {
    const ss    = SpreadsheetApp.openById(GENERADOR_ID);
    const hojas = ss.getSheets().map(function(s){ return s.getName(); });
    return jsonGen({ ok: true, hojas: hojas });
  } catch(err) {
    return jsonGen({ ok: false, error: err.message });
  }
}

// ─── LEER SEMANA ─────────────────────────────────────────────────────────────
function leerSemanaGen(rows, sem) {
  const filaFechaIdx = sem.fila_fecha - 1;
  const filaDatosIdx = sem.fila_datos - 1;

  // Fecha en col C (idx 2)
  let fecha = "";
  if (filaFechaIdx < rows.length) {
    fecha = String(rows[filaFechaIdx][2] || "").trim(); // Col C — displayValue
  }

  // Ejecutante en col F (idx 5) de fila_datos + 2 (Nivel agua dest. norte = 3er ítem)
  let ejecutante = "";
  const filaEjec = filaDatosIdx + 2;
  if (filaEjec < rows.length) {
    ejecutante = String(rows[filaEjec][5] || "").trim(); // Col F — displayValue
  }

  // Leer los 17 ítems
  const items = [];
  for (let i = 0; i < ITEMS_GEN.length; i++) {
    const filaItem = filaDatosIdx + i;
    if (filaItem >= rows.length) { items.push({ nombre: ITEMS_GEN[i], estado: "", observaciones: "" }); continue; }
    const row = rows[filaItem];
    // Si el valor es una fecha (horas de funcionamiento puede ser número formateado como fecha)
    var estadoVal = row[3];
    if (estadoVal instanceof Date) {
      // Convertir a número si es una fecha que representa horas
      estadoVal = String(estadoVal);
    } else {
      estadoVal = String(estadoVal || "").trim();
    }
    items.push({
      nombre:        ITEMS_GEN[i],
      estado:        estadoVal,
      observaciones: String(row[4] || "").trim()  // Col E
    });
  }

  // Observaciones generales — fila después del último ítem + 2
  let obsGenerales = "";
  const filaObs = filaDatosIdx + ITEMS_GEN.length + 1;
  if (filaObs < rows.length) {
    obsGenerales = String(rows[filaObs][2] || "").trim(); // displayValue
  }

  return { fecha, ejecutante, items, observaciones_generales: obsGenerales };
}

// ─── GUARDAR SEMANA ───────────────────────────────────────────────────────────
function guardarSemanaGen(payload) {
  try {
    const ss         = SpreadsheetApp.openById(GENERADOR_ID);
    const fecha      = new Date(payload.fecha + "T12:00:00");
    const MESES      = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const hojaNombre = payload.hoja || (MESES[fecha.getMonth()] + " " + fecha.getFullYear());
    const semanaNum  = payload.semana ? parseInt(payload.semana) : getSemanaDelMes(fecha);
    const sem        = SEMANAS.find(function(s){ return s.semana === semanaNum; });
    if (!sem) return jsonGen({ ok: false, error: "Semana no válida" });

    let sheet = ss.getSheetByName(hojaNombre);
    if (!sheet) {
      const hojas = ss.getSheets();
      const base  = hojas[hojas.length - 1];
      sheet = base.copyTo(ss);
      sheet.setName(hojaNombre);
      ss.moveActiveSheet(ss.getSheets().length);
      _limpiarHojaGen(sheet);
    }

    const fechaStr = Utilities.formatDate(fecha, TZ_GEN, "dd/MM/yyyy");

    // Escribir fecha en col C de fila_fecha
    sheet.getRange(sem.fila_fecha, 3).setValue(fechaStr); // Col C

    // Escribir ejecutante en col F de fila_datos + 2
    sheet.getRange(sem.fila_datos + 2, 6).setValue(payload.ejecutante || "");

    // Escribir ítems
    const items = payload.items || [];
    items.forEach(function(item, i) {
      const fila = sem.fila_datos + i;
      sheet.getRange(fila, 4).setValue(item.estado        || ""); // Col D
      sheet.getRange(fila, 5).setValue(item.observaciones || ""); // Col E
    });

    // Observaciones generales
    if (payload.observaciones_generales) {
      sheet.getRange(sem.fila_datos + ITEMS_GEN.length + 1, 3).setValue(payload.observaciones_generales);
    }

    SpreadsheetApp.flush();
    Logger.log("Guardado Generador: hoja=" + hojaNombre + " semana=" + semanaNum);
    return jsonGen({ ok: true, hoja: hojaNombre, semana: semanaNum });

  } catch(err) {
    Logger.log("Error guardarSemanaGen: " + err.message);
    return jsonGen({ ok: false, error: err.message });
  }
}

// Limpia los valores de datos de una hoja copiada
function _limpiarHojaGen(sheet) {
  SEMANAS.forEach(function(sem) {
    // Limpiar fecha
    sheet.getRange(sem.fila_fecha, 3).clearContent(); // Col C
    // Limpiar ejecutante
    sheet.getRange(sem.fila_datos + 2, 6).clearContent();
    // Limpiar ítems (col D y E)
    for (let i = 0; i < ITEMS_GEN.length; i++) {
      sheet.getRange(sem.fila_datos + i, 4).clearContent();
      sheet.getRange(sem.fila_datos + i, 5).clearContent();
    }
    // Limpiar obs generales
    sheet.getRange(sem.fila_datos + ITEMS_GEN.length + 1, 3).clearContent();
  });
}
function editarSemanaGen(payload) {
  // payload: { hoja, semana, ejecutante, items: [{nombre, estado, observaciones}], observaciones_generales }
  try {
    const ss    = SpreadsheetApp.openById(GENERADOR_ID);
    const sheet = ss.getSheetByName(payload.hoja);
    if (!sheet) return jsonGen({ ok: false, error: "Hoja no encontrada" });

    const semanaNum = parseInt(payload.semana);
    const sem = SEMANAS.find(function(s){ return s.semana === semanaNum; });
    if (!sem) return jsonGen({ ok: false, error: "Semana no válida" });

    // Ejecutante
    if (payload.ejecutante !== undefined) {
      sheet.getRange(sem.fila_datos + 2, 6).setValue(payload.ejecutante);
    }

    // Ítems
    const items = payload.items || [];
    items.forEach(function(item, i) {
      const fila = sem.fila_datos + i;
      sheet.getRange(fila, 4).setValue(item.estado        || ""); // Col D
      sheet.getRange(fila, 5).setValue(item.observaciones || ""); // Col E
    });

    // Observaciones generales
    if (payload.observaciones_generales !== undefined) {
      sheet.getRange(sem.fila_datos + ITEMS_GEN.length + 1, 3).setValue(payload.observaciones_generales);
    }

    SpreadsheetApp.flush();
    return jsonGen({ ok: true });

  } catch(err) {
    return jsonGen({ ok: false, error: err.message });
  }
}