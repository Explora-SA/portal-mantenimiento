// IDs de los 13 archivos de rutas
const RUTAS = [
  { nombre: "Ruta 1",  id: "1x4DsFybJrSi69q8PU_S3oJ5whBBZK8HkHM2VsjczoI4" },
  { nombre: "Ruta 2",  id: "17b4IaGLiKWOi7fH2TlZ9rjKqB6t8ZYq9yQCKRNwWz3A" },
  { nombre: "Ruta 3",  id: "1XQeF4R9gdlrZ56dC7__NImuqKSjasgaWzTRCzyB4Gf8" },
  { nombre: "Ruta 4",  id: "1JuuLy2sdg1h7yPvfAiCQE2ECKIx6RYJ5JHCFS4es_dA" },
  { nombre: "Ruta 5",  id: "1a2wmZXfWIaZZNdudfVVYg9KIvvq63uP2JkoMZgRDQ8k" },
  { nombre: "Ruta 6",  id: "1F_IV92gmDL3DSu7cKTWVpujU2pGG15cyZU5vMreZ90k" },
  { nombre: "Ruta 7",  id: "1QZSM7JGEeLqupaHPMyzUS5eQ6NgmHnjLF7FnU2uVI3Q" },
  { nombre: "Ruta 8",  id: "11NM1l3N7N6BmfkZuMNezHk1rjyC6tYp8TXZTNTB9g3Y" },
  { nombre: "Ruta 9",  id: "1H0tus0Y71C5uiWSvKS7tIfi3KllEzNgUXbV_kBHVzm4" },
  { nombre: "Ruta 10", id: "19BIOpzdcdpMPyWJ9Aeyztb7jlnMGfOi9eDzrIrPenbY" },
  { nombre: "Ruta 11", id: "1hEtHzl99_neEkTPTPnoABXGl2fnrkmesyXPt6OLFj_c" },
  { nombre: "Ruta 12", id: "1XsYpdQdibCD7tWLMbxVH_F4J9DD1mGCtJZLek3obPIY" },
  { nombre: "Ruta 13", id: "1a_5RkqVAjC3MlogteoP37uUg2ZanXY8oti2JEDrzr3Y" }
];

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const TZ_M = "America/Argentina/Buenos_Aires";

const COLS_INSP = [
  {key:"cubierta_goma",    label:"Cubierta Goma",       col:1},
  {key:"pulsadores",       label:"Pulsadores",           col:2},
  {key:"nmotor",           label:"N° Motor y Registro",  col:3},
  {key:"acom_motor",       label:"Acometidas Motor",     col:4},
  {key:"acom_caja",        label:"Acometidas Caja",      col:5},
  {key:"sell_fm",          label:"Sellado FM",           col:6},
  {key:"sell_cmd",         label:"Sellado Comando",      col:7},
  {key:"pasta_fm",         label:"Pasta FM",             col:8},
  {key:"pasta_cmd",        label:"Pasta Comando",        col:9},
  {key:"pat",              label:"PAT",                  col:10},
  {key:"limp_carcasa",     label:"Limpieza Carcasa",     col:11},
  {key:"vent_estado",      label:"Ventilador Estado",    col:12},
  {key:"vent_limpieza",    label:"Ventilador Limpieza",  col:13},
  {key:"observaciones",    label:"Observaciones",        col:14}
];

function doGet_(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : "resumen";
  if (action === "resumen")  return getResumen();
  if (action === "detalle")  return getDetalle(e.parameter);
  if (action === "hojas")    return getHojas(e.parameter);
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Accion no reconocida"})).setMimeType(ContentService.MimeType.JSON);
}

function doPost_(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "guardar") return guardarEjecucion(payload);
    if (payload.action === "editar")  return editarMotor(payload);  // ← agregar
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Accion no reconocida"})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getResumen() {
  const resultado = [];
  RUTAS.forEach(function(ruta) {
    try {
      const ss = SpreadsheetApp.openById(ruta.id);
      const hojas = ss.getSheets();
      if (!hojas.length) { resultado.push({ruta:ruta.nombre,error:"Sin hojas"}); return; }
      const ultimaHoja = hojas[hojas.length - 1];
      const datos = leerHoja(ultimaHoja);
      let mal=0, urg=0, fs=0, total=0;
      datos.motores.forEach(function(m) {
        total++;
        COLS_INSP.forEach(function(c) {
          if (c.key === "nmotor" || c.key === "observaciones") return;
          const v = String(m[c.key]||"").toUpperCase().trim();
          if (v === "URG") urg++;
          else if (v === "MAL") mal++;
        });
      });
      var estado = urg > 0 ? "CRITICO" : mal > 0 ? "ATENCION" : "OK";
      resultado.push({
        ruta: ruta.nombre,
        hoja: ultimaHoja.getName(),
        realizado: datos.realizado,
        fecha: datos.fecha,
        ot: datos.ot,
        total_motores: total,
        mal: mal,
        urg: urg,
        fs: fs,
        estado: estado
      });
    } catch(err) {
      resultado.push({ruta:ruta.nombre, error:err.message});
    }
  });
  return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
}

function getDetalle(params) {
  const rutaNombre = params.ruta;
  const hojaNombre = params.hoja || null;
  const ruta = RUTAS.find(function(r){ return r.nombre === rutaNombre; });
  if (!ruta) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Ruta no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  try {
    const ss = SpreadsheetApp.openById(ruta.id);
    const sheet = hojaNombre ? ss.getSheetByName(hojaNombre) : ss.getSheets()[ss.getSheets().length-1];
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja no encontrada"})).setMimeType(ContentService.MimeType.JSON);
    const datos = leerHoja(sheet);
    datos.ruta = rutaNombre;
    datos.hoja = sheet.getName();
    return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getHojas(params) {
  const ruta = RUTAS.find(function(r){ return r.nombre === params.ruta; });
  if (!ruta) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Ruta no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  try {
    const ss = SpreadsheetApp.openById(ruta.id);
    const hojas = ss.getSheets().map(function(s){ return s.getName(); });
    return ContentService.createTextOutput(JSON.stringify({ok:true,hojas:hojas})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function leerHoja(sheet) {
  const rows = sheet.getDataRange().getValues();
  let realizado="", fecha="", ot="", motores=[];
  let headerRow = -1;

  for (let i=0; i<rows.length; i++) {
    const row = rows[i];
    for (let j=0; j<row.length; j++) {
      const v = String(row[j]||"").toLowerCase().trim();
      if (v.includes("realiz") && j+1<row.length) realizado = String(row[j+1]||"").trim();
      if (v === "fecha" && j+1<row.length) {
        fecha = row[j+1] instanceof Date
          ? Utilities.formatDate(row[j+1], TZ_M, "dd/MM/yyyy")
          : String(row[j+1]||"").trim();
      }
      if (v.includes("ot") && v.includes("n") && j+1<row.length) ot = String(row[j+1]||"").trim();
    }
    // Buscar fila de encabezado: col B (índice 1) = "TAG"
    if (String(row[1]||"").toUpperCase().trim() === "TAG") {
      headerRow = i;
    }
    // Leer datos de motores
    if (headerRow >= 0 && i > headerRow) {
      const tag = String(row[1]||"").trim();
      if (!tag) continue;
      if (tag.toUpperCase() === "TAG") continue;
      var motor = {tag: tag};
      COLS_INSP.forEach(function(c) {
        motor[c.key] = String(row[c.col+1]||"").trim(); // +1 por col A vacía
      });
      motores.push(motor);
    }
  }
  return {realizado:realizado, fecha:fecha, ot:ot, motores:motores};
}

function guardarEjecucion(payload) {
  const rutaNombre = payload.ruta;
  const ruta = RUTAS.find(function(r){ return r.nombre === rutaNombre; });
  if (!ruta) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Ruta no encontrada"})).setMimeType(ContentService.MimeType.JSON);

  try {
    const ss = SpreadsheetApp.openById(ruta.id);
    const fecha = new Date(payload.fecha);
    const nombreHoja = MESES[fecha.getMonth()] + " " + fecha.getFullYear();

    let sheet = ss.getSheetByName(nombreHoja);
    if (sheet) {
      let idx = 2;
      while (ss.getSheetByName(nombreHoja + " (" + idx + ")")) idx++;
      sheet = ss.insertSheet(nombreHoja + (idx>1?" ("+idx+")":""), ss.getSheets().length);
    } else {
      sheet = ss.insertSheet(nombreHoja, ss.getSheets().length);
    }

    // ── Encabezado general desde col B (índice 2) ──
    sheet.getRange(1,2).setValue("Mantenimiento preventivo de motores");
    sheet.getRange(1,6).setValue("Realizó:");
    sheet.getRange(1,7).setValue(payload.realizado||"");
    sheet.getRange(1,9).setValue("Fecha");
    sheet.getRange(1,10).setValue(Utilities.formatDate(fecha, TZ_M, "dd/MM/yyyy"));
    sheet.getRange(2,2).setValue(rutaNombre);
    sheet.getRange(2,9).setValue("OT N°");
    sheet.getRange(2,10).setValue(payload.ot||"");

    // ── Encabezado columnas desde col B (índice 2) ──
    const headers = [
      "TAG","Cubierta Goma","Pulsadores","N° Motor y Registro",
      "Acometidas Motor","Acometidas Caja","Sellado FM","Sellado Comando",
      "Pasta FM","Pasta Comando","PAT","Limpieza Carcasa",
      "Ventilador Estado","Ventilador Limpieza","Observaciones"
    ];
    sheet.getRange(4, 2, 1, headers.length).setValues([headers]);
    sheet.getRange(4, 2, 1, headers.length).setFontWeight("bold").setBackground("#d9e1f2");

    // ── Datos motores desde col B (índice 2) ──
    const motores = payload.motores || [];
    motores.forEach(function(m, i) {
      const rowData = [
        m.tag||"",
        m.cubierta_goma||"", m.pulsadores||"", m.nmotor||"",
        m.acom_motor||"",    m.acom_caja||"",
        m.sell_fm||"",       m.sell_cmd||"",
        m.pasta_fm||"",      m.pasta_cmd||"",
        m.pat||"",           m.limp_carcasa||"",
        m.vent_estado||"",   m.vent_limpieza||"",
        m.observaciones||""
      ];
      sheet.getRange(5+i, 2, 1, rowData.length).setValues([rowData]);

      // Colorear según estado (desde col C = índice 3)
      rowData.slice(1, 14).forEach(function(v, j) {
        const val = String(v).toUpperCase().trim();
        const cell = sheet.getRange(5+i, 3+j);
        if (val==="MAL")      cell.setBackground("#f4cccc");
        else if (val==="URG") cell.setBackground("#ea4335").setFontColor("#fff");
        else if (val==="F/S") cell.setBackground("#ffe599");
        else if (val==="OK")  cell.setBackground("#d9ead3");
      });
    });

    SpreadsheetApp.flush();
    Logger.log("Guardado: "+rutaNombre+" hoja="+sheet.getName()+" motores="+motores.length);
    return ContentService.createTextOutput(JSON.stringify({ok:true,hoja:sheet.getName()})).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log("Error guardarEjecucion: "+err.message);
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}
function editarMotor(payload) {
  const ruta = RUTAS.find(function(r){ return r.nombre === payload.ruta; });
  if (!ruta) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Ruta no encontrada"})).setMimeType(ContentService.MimeType.JSON);

  try {
    const ss    = SpreadsheetApp.openById(ruta.id);
    const sheet = ss.getSheetByName(payload.hoja);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja no encontrada"})).setMimeType(ContentService.MimeType.JSON);

    const rows = sheet.getDataRange().getValues();
    let headerRow = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]||"").toUpperCase().trim() === "TAG") { headerRow = i; break; }
    }
    if (headerRow < 0) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"No se encontró encabezado"})).setMimeType(ContentService.MimeType.JSON);

    const motores = payload.motores || [];
    motores.forEach(function(item) {
      let filaMotor = -1;
      for (let i = headerRow + 1; i < rows.length; i++) {
        if (String(rows[i][1]||"").trim() === String(item.tag).trim()) { filaMotor = i; break; }
      }
      if (filaMotor < 0) return;

      const campos = item.campos || {};
      COLS_INSP.forEach(function(c) {
        if (campos[c.key] === undefined) return;
        const colIdx = c.col + 2;
        const cell   = sheet.getRange(filaMotor + 1, colIdx);
        const val    = String(campos[c.key]).toUpperCase().trim();
        cell.setValue(campos[c.key]);
        cell.setFontColor("#000000");
        if      (val === "MAL") cell.setBackground("#f4cccc");
        else if (val === "URG") cell.setBackground("#ea4335").setFontColor("#ffffff");
        else if (val === "F/S") cell.setBackground("#ffe599");
        else if (val === "OK")  cell.setBackground("#d9ead3");
        else                    cell.setBackground("#ffffff");
      });
    });

    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}