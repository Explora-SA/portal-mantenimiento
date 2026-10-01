const SHEET_ID = "1FiWvwImJqp4GxT5Xo4E0rA5BARcfH3cY3fyidsM7j4k";
const SHEET_NAME = "VENCIMIENTOS";
const SHEET_ST = "ST";
const SHEET_USUARIOS = "USUARIOS";
const SHEET_EQUIPOS = "EQUIPOS";
const TZ = "America/Argentina/Buenos_Aires";
const DRIVE_FOLDER_ID = "1KH-Mr8GjcfUALD47DeEGYwsoSK48BoXM";

const SHEET_ID_ELECTRICO = "1oVCVQfDOuzQkojhOZoY7WWwaWTEJvWDOrwZ_8fI8XBM";
const SHEET_ID_MECANICO  = "1y_eoa9tlKlipM-_nAQnbZN4j8ZxfoC-lV7dLdTJnybM";
const SHEET_STOCK = "STOCK";

function doGet_(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : "get";
  
  // Si viene con parámetro "activo", servir la ficha de solo lectura
if (e && e.parameter && e.parameter.activo) {
  var activoId = e.parameter.activo;
  var html = HtmlService.createHtmlOutputFromFile('Ficha_Equipo').getContent();
  html = html.replace("'<?= activoId ?>'", "'" + activoId + "'");
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
  
  if (action === "loginGoogle") return loginGoogle();
  if (action === "get")                     return getData();
  if (action === "getST")                   return getDataST();
  if (action === "getAllST")                return getAllDataST();
  if (action === "getSTHistorico")          return getDataSTHistorico();
  if (action === "doST")                    return marcarRealizadoST(e.parameter);
  if (action === "getActivos")              return getDataActivos();
  if (action === "getAvisos")               return getAvisos();
  if (action === "guardarComentarioOperador") return guardarComentarioOperador(e.parameter);
  if (action === "getProximoNumeroAviso")   return getProximoNumeroAviso();
  if (action === "getStock")                return getStock();
  if (action === "getStockBuscar")          return getStockBuscar(e.parameter);
  if (action === "historial") return getHistorialEquipo(e.parameter);
  if (action === "historialAgente") return getHistorialAgente(e.parameter);
  if (action === "getTextoPDF") return getTextoPDF(e.parameter);
  if (action === "buscarEquipo") return buscarEquipo(e.parameter);
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Acción no reconocida"})).setMimeType(ContentService.MimeType.JSON);
}

function doPost_(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || "create";
    if (action === "login")                     return loginUsuario(payload);
    if (action === "update")                    return updateRow(payload);
    if (action === "delete")                    return deleteRow(payload);
    if (action === "addST")                     return createRowST(payload);
    if (action === "updateST")                  return updateRowST(payload);
    if (action === "deleteST")                  return deleteRowST(payload);
    if (action === "doST")                      return marcarRealizadoST(payload);
    if (action === "addActivo")                 return createRowActivo(payload);
    if (action === "updateActivo")              return updateRowActivo(payload);
    if (action === "deleteActivo")              return deleteRowActivo(payload);
    if (action === "guardarComentarioOperador") return guardarComentarioOperador(payload);
    if (action === "cambiarContrasena")         return cambiarContrasena(payload);
    if (action === "guardarStock")              return guardarStock(payload);
    if (action === "eliminarStock")             return eliminarStock(payload);
    return createRow(payload);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── LOGIN ────────────────────────────────────────────────
function loginUsuario(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_USUARIOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja USUARIOS no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const usuario = String(payload.usuario||"").trim().toLowerCase();
  const contrasena = String(payload.contrasena||"").trim();
  for (let i = 1; i < rows.length; i++) {
    const u = String(rows[i][0]||"").trim().toLowerCase();
    const c = String(rows[i][1]||"").trim();
    const rol = String(rows[i][2]||"").trim();
    if (u === usuario && c === contrasena) {
      return ContentService.createTextOutput(JSON.stringify({ok:true,rol:rol,usuario:rows[i][0]})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Usuario o contraseña incorrectos"})).setMimeType(ContentService.MimeType.JSON);
}
// Nueva función — va junto a loginUsuario:
function loginGoogle() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"No se pudo obtener el email de Google"})).setMimeType(ContentService.MimeType.JSON);
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_USUARIOS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const u = String(rows[i][0]||"").trim().toLowerCase();
    const rol = String(rows[i][2]||"").trim();
    if (u === email.toLowerCase()) {
      return ContentService.createTextOutput(JSON.stringify({ok:true,rol:rol,usuario:rows[i][0]})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Tu cuenta de Google no tiene acceso al sistema"})).setMimeType(ContentService.MimeType.JSON);
}

// ── VENCIMIENTOS ─────────────────────────────────────────
function createRow(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const newId = lastRow <= 1 ? 1 : sheet.getRange(lastRow,1).getValue()+1;
  let archivoUrl = payload.archivo_url || "";
  if (payload.archivos && payload.archivos.length > 0) {
    archivoUrl = subirArchivosVenc(payload.archivos, newId, payload.equipo||"VENC");
  } else if (payload.archivo && payload.archivo.datos) {
    archivoUrl = subirArchivo(payload.archivo, newId, payload.equipo||"VENC");
  }
  sheet.appendRow([newId,payload.equipo||"",payload.descripcion||"",payload.tipo||"",payload.fecha_vencimiento||"",payload.frecuencia_dias||"",payload.responsable||"",payload.ejecutante||"",payload.especialidad||"",payload.email_responsable||"",payload.observaciones||"",archivoUrl]);
  return ContentService.createTextOutput(JSON.stringify({ok:true,id:newId})).setMimeType(ContentService.MimeType.JSON);
}

function updateRow(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      let archivoUrl = rows[i][11]||"";
      if (payload.archivos && payload.archivos.length > 0) {
        archivoUrl = subirArchivosVenc(payload.archivos, id, payload.equipo||"VENC");
      } else if (payload.archivo && payload.archivo.datos) {
        archivoUrl = subirArchivo(payload.archivo, id, payload.equipo||"VENC");
      } else if (payload.archivo_url !== undefined) {
        archivoUrl = payload.archivo_url;
      }
      sheet.getRange(i+1,2).setValue(payload.equipo||"");
      sheet.getRange(i+1,3).setValue(payload.descripcion||"");
      sheet.getRange(i+1,4).setValue(payload.tipo||"");
      sheet.getRange(i+1,5).setValue(payload.fecha_vencimiento||"");
      sheet.getRange(i+1,6).setValue(payload.frecuencia_dias||"");
      sheet.getRange(i+1,7).setValue(payload.responsable||"");
      sheet.getRange(i+1,8).setValue(payload.ejecutante||"");
      sheet.getRange(i+1,9).setValue(payload.especialidad||"");
      sheet.getRange(i+1,10).setValue(payload.email_responsable||"");
      sheet.getRange(i+1,11).setValue(payload.observaciones||"");
      sheet.getRange(i+1,12).setValue(archivoUrl);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function deleteRow(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      sheet.deleteRow(i+1);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function getData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const data = rows.slice(1).map(row => {
    let obj={};
    headers.forEach((h,i)=>{ let val=row[i]; if(val instanceof Date) val=Utilities.formatDate(val,TZ,"dd/MM/yyyy"); obj[h]=val; });
    return obj;
  }).filter(r => r.equipo||r.descripcion);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// Sube un único archivo (compatibilidad hacia atrás)
function subirArchivo(archivo, id, equipo) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const nombreSubcarpeta = "VENC_"+id+"_"+equipo.replace(/[^a-zA-Z0-9_-]/g,"_");
    let subcarpeta;
    const iter = carpetaRaiz.getFoldersByName(nombreSubcarpeta);
    subcarpeta = iter.hasNext() ? iter.next() : carpetaRaiz.createFolder(nombreSubcarpeta);
    const blob = Utilities.newBlob(Utilities.base64Decode(archivo.datos),archivo.tipo,archivo.nombre);
    const file = subcarpeta.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch(err) { Logger.log("Error subiendo archivo: "+err.message); return ""; }
}

// Sube múltiples archivos para vencimientos — devuelve URL de carpeta
function subirArchivosVenc(archivos, id, equipo) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const nombreSubcarpeta = "VENC_"+id+"_"+equipo.replace(/[^a-zA-Z0-9_-]/g,"_");
    let subcarpeta;
    const iter = carpetaRaiz.getFoldersByName(nombreSubcarpeta);
    subcarpeta = iter.hasNext() ? iter.next() : carpetaRaiz.createFolder(nombreSubcarpeta);
    archivos.forEach(function(archivo) {
      const blob = Utilities.newBlob(Utilities.base64Decode(archivo.datos), archivo.tipo, archivo.nombre);
      const file = subcarpeta.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    });
    subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return subcarpeta.getUrl();
  } catch(err) { Logger.log("Error subirArchivosVenc: "+err.message); return ""; }
}

// ── ST ───────────────────────────────────────────────────
function getDataST() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const data = rows.slice(1).map(row => {
    let obj={};
    headers.forEach((h,i)=>{ let val=row[i]; if(val instanceof Date) val=Utilities.formatDate(val,TZ,"dd/MM/yyyy"); obj[h]=val; });
    return obj;
  }).filter(r => String(r.realizado)!=="1" && (r.equipo||r.descripcion));
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getAllDataST() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const data = rows.slice(1).map(row => {
    let obj={};
    headers.forEach((h,i)=>{ let val=row[i]; if(val instanceof Date) val=Utilities.formatDate(val,TZ,"dd/MM/yyyy"); obj[h]=val; });
    return obj;
  }).filter(r => r.equipo||r.descripcion);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function normalizarFecha(val) {
  if (!val) return "";
  var s = String(val).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var p = s.split("-");
    return p[2]+"/"+p[1]+"/"+p[0];
  }
  return s;
}

function createRowST(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const lastRow = sheet.getLastRow();
  const newId = lastRow <= 1 ? 1 : sheet.getRange(lastRow,1).getValue()+1;
  let fotoUrl = "";
  if (payload.fotos && payload.fotos.length > 0) fotoUrl = subirFotos(payload.fotos,newId,payload.equipo||"ST");
  sheet.appendRow([newId,payload.equipo||"",payload.sector||"",payload.descripcion||"",payload.tipo||"",payload.especialidad||"",payload.prioridad||"Media",payload.solicitante||"",payload.responsable||"",payload.ejecutante||"",normalizarFecha(payload.fecha_solicitud),normalizarFecha(payload.fecha_ejecucion),"",fotoUrl,payload.observaciones||"","",""]);
  return ContentService.createTextOutput(JSON.stringify({ok:true,id:newId})).setMimeType(ContentService.MimeType.JSON);
}

function updateRowST(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      let fotoUrl = rows[i][13]||"";
      if (payload.fotos && payload.fotos.length > 0) {
        const nuevaUrl = subirFotos(payload.fotos, id, payload.equipo||rows[i][1]||"ST");
        fotoUrl = fotoUrl ? fotoUrl+" | "+nuevaUrl : nuevaUrl;
        sheet.getRange(i+1,14).setValue(fotoUrl);
      }
      if (payload.equipo        !== undefined) sheet.getRange(i+1,2).setValue(payload.equipo);
      if (payload.sector        !== undefined) sheet.getRange(i+1,3).setValue(payload.sector);
      if (payload.descripcion   !== undefined) sheet.getRange(i+1,4).setValue(payload.descripcion);
      if (payload.tipo          !== undefined) sheet.getRange(i+1,5).setValue(payload.tipo);
      if (payload.especialidad  !== undefined) sheet.getRange(i+1,6).setValue(payload.especialidad);
      if (payload.prioridad     !== undefined) sheet.getRange(i+1,7).setValue(payload.prioridad);
      if (payload.solicitante   !== undefined) sheet.getRange(i+1,8).setValue(payload.solicitante);
      if (payload.responsable   !== undefined) sheet.getRange(i+1,9).setValue(payload.responsable);
      if (payload.ejecutante    !== undefined) sheet.getRange(i+1,10).setValue(payload.ejecutante);
      if (payload.fecha_solicitud  !== undefined) sheet.getRange(i+1,11).setValue(normalizarFecha(payload.fecha_solicitud));
      if (payload.fecha_ejecucion  !== undefined) sheet.getRange(i+1,12).setValue(normalizarFecha(payload.fecha_ejecucion));
      if (payload.realizado        !== undefined) sheet.getRange(i+1,13).setValue(payload.realizado);
      if (payload.observaciones    !== undefined) sheet.getRange(i+1,15).setValue(payload.observaciones);
      if (payload.motivo_cierre    !== undefined) sheet.getRange(i+1,17).setValue(payload.motivo_cierre);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function marcarRealizadoST(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      sheet.getRange(i+1,13).setValue("1");
      if (payload.motivo_cierre) sheet.getRange(i+1,17).setValue(payload.motivo_cierre);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function deleteRowST(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ST);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      sheet.deleteRow(i+1);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function subirFotos(fotos, id, equipo) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const nombreSubcarpeta = "ST_"+id+"_"+equipo.replace(/[^a-zA-Z0-9_-]/g,"_");
    let subcarpeta;
    const iter = carpetaRaiz.getFoldersByName(nombreSubcarpeta);
    subcarpeta = iter.hasNext() ? iter.next() : carpetaRaiz.createFolder(nombreSubcarpeta);
    const urls = [];
    fotos.forEach(function(foto) {
      const blob = Utilities.newBlob(Utilities.base64Decode(foto.datos),foto.tipo,foto.nombre);
      const file = subcarpeta.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
      urls.push(file.getUrl());
    });
    subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    return urls.length===1 ? urls[0] : subcarpeta.getUrl();
  } catch(err) { Logger.log("Error subiendo fotos: "+err.message); return ""; }
}

// ── EQUIPOS (ACTIVOS) ────────────────────────────────────
function getDataActivos() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase()
    .replace(/\//g,"_").replace(/\./g,"").replace(/&/g,"_").replace(/ +/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,""));
  const data = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
      obj[h] = val;
    });
    return obj;
  }).filter(r => r.tag || r.descripcion);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function createRowActivo(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja EQUIPOS no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const lastRow = sheet.getLastRow();
  const newId = lastRow <= 1 ? 1 : sheet.getRange(lastRow, 1).getValue() + 1;
  let archivoUrl = payload.archivo_url || "";
  if (payload.archivo && payload.archivo.datos)
    archivoUrl = subirArchivoActivo(payload.archivo, newId, payload.tag||"ACT");
  let archivo2Url = payload.archivo_2 || "";
  if (payload.archivo2 && payload.archivo2.datos)
    archivo2Url = subirArchivoActivo(payload.archivo2, newId, payload.tag||"ACT");
  let archivo3Url = payload.archivo_3 || "";
  if (payload.archivo3 && payload.archivo3.datos)
    archivo3Url = subirArchivoActivo(payload.archivo3, newId, payload.tag||"ACT");
sheet.appendRow([
  newId, payload.tag||"", payload.descripcion||"", payload.area||"",
  payload.subarea||"", payload.p_id||"", payload.tipo||"",
  payload.proveedor_modelo||"", "", "", "", payload.estado||"",
  archivoUrl, payload.criticidad||"", payload.modo_de_falla||"",
  payload.ultima_inspeccion||"", payload.repuestos_criticos||"",
  payload.observaciones_tecnicas||"", archivo2Url, archivo3Url
]);
  return ContentService.createTextOutput(JSON.stringify({ok:true,id:newId})).setMimeType(ContentService.MimeType.JSON);
}

function updateRowActivo(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja EQUIPOS no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      let archivoUrl = rows[i][12] || "";
      if (payload.archivo && payload.archivo.datos)
        archivoUrl = subirArchivoActivo(payload.archivo, id, payload.tag||rows[i][1]||"ACT");
      else if (payload.archivo_url !== undefined)
        archivoUrl = payload.archivo_url;

      let archivo2Url = rows[i][18] || "";
      if (payload.archivo2 && payload.archivo2.datos)
        archivo2Url = subirArchivoActivo(payload.archivo2, id, payload.tag||rows[i][1]||"ACT");
      else if (payload.archivo_2 !== undefined)
        archivo2Url = payload.archivo_2;

      let archivo3Url = rows[i][19] || "";
      if (payload.archivo3 && payload.archivo3.datos)
        archivo3Url = subirArchivoActivo(payload.archivo3, id, payload.tag||rows[i][1]||"ACT");
      else if (payload.archivo_3 !== undefined)
        archivo3Url = payload.archivo_3;

      if (payload.tag               !== undefined) sheet.getRange(i+1,2).setValue(payload.tag);
      if (payload.descripcion       !== undefined) sheet.getRange(i+1,3).setValue(payload.descripcion);
      if (payload.area              !== undefined) sheet.getRange(i+1,4).setValue(payload.area);
      if (payload.subarea           !== undefined) sheet.getRange(i+1,5).setValue(payload.subarea);
      if (payload.p_id              !== undefined) sheet.getRange(i+1,6).setValue(payload.p_id);
      if (payload.tipo              !== undefined) sheet.getRange(i+1,7).setValue(payload.tipo);
      if (payload.proveedor_modelo  !== undefined) sheet.getRange(i+1,8).setValue(payload.proveedor_modelo);
      if (payload.estado            !== undefined) sheet.getRange(i+1,12).setValue(payload.estado);
      sheet.getRange(i+1,13).setValue(archivoUrl);
      if (payload.criticidad            !== undefined) sheet.getRange(i+1,17).setValue(payload.criticidad);
if (payload.criticidad             !== undefined) sheet.getRange(i+1,14).setValue(payload.criticidad);
if (payload.modo_de_falla          !== undefined) sheet.getRange(i+1,15).setValue(payload.modo_de_falla);
if (payload.ultima_inspeccion      !== undefined) sheet.getRange(i+1,16).setValue(payload.ultima_inspeccion);
if (payload.repuestos_criticos     !== undefined) sheet.getRange(i+1,17).setValue(payload.repuestos_criticos);
if (payload.observaciones_tecnicas !== undefined) sheet.getRange(i+1,18).setValue(payload.observaciones_tecnicas);
sheet.getRange(i+1,19).setValue(archivo2Url);
sheet.getRange(i+1,20).setValue(archivo3Url);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

function deleteRowActivo(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja EQUIPOS no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const id = parseInt(payload.id);
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Registro no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

// Sube un único archivo para activos (compatibilidad hacia atrás)
function subirArchivoActivo(archivo, id, tag) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const nombreSubcarpeta = "ACT_"+id+"_"+String(tag).replace(/[^a-zA-Z0-9_-]/g,"_");
    let subcarpeta;
    const iter = carpetaRaiz.getFoldersByName(nombreSubcarpeta);
    subcarpeta = iter.hasNext() ? iter.next() : carpetaRaiz.createFolder(nombreSubcarpeta);
    const blob = Utilities.newBlob(Utilities.base64Decode(archivo.datos), archivo.tipo, archivo.nombre);
    const file = subcarpeta.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch(err) { Logger.log("Error subiendo archivo activo: "+err.message); return ""; }
}

// Sube múltiples archivos para activos — devuelve URL de carpeta
function subirArchivosActivo(archivos, id, tag) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const nombreSubcarpeta = "ACT_"+id+"_"+String(tag).replace(/[^a-zA-Z0-9_-]/g,"_");
    let subcarpeta;
    const iter = carpetaRaiz.getFoldersByName(nombreSubcarpeta);
    subcarpeta = iter.hasNext() ? iter.next() : carpetaRaiz.createFolder(nombreSubcarpeta);
    archivos.forEach(function(archivo) {
      const blob = Utilities.newBlob(Utilities.base64Decode(archivo.datos), archivo.tipo, archivo.nombre);
      const file = subcarpeta.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    });
    subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return subcarpeta.getUrl();
  } catch(err) { Logger.log("Error subirArchivosActivo: "+err.message); return ""; }
}

// ── PANEL OPERADOR ───────────────────────────────────────
function guardarComentarioOperador(payload) {
  try {
    const dept        = String(payload.dept||"electrico").toLowerCase();
    const fecha       = String(payload.fecha||"").trim();
    const equipo      = String(payload.equipo||"").trim();
    const descripcion = String(payload.descripcion||"").trim();
    const comentario  = String(payload.comentario||"").trim();
    const usuario     = String(payload.usuario||"").trim();
    const sheetId = dept.includes("mec") ? SHEET_ID_MECANICO : SHEET_ID_ELECTRICO;
    const ss = SpreadsheetApp.openById(sheetId);
    const partes = fecha.split("-");
    const fechaDate = new Date(parseInt(partes[0]),parseInt(partes[1])-1,parseInt(partes[2]));
    const inicioAnio = new Date(fechaDate.getFullYear(),0,1);
    const semana = Math.ceil((((fechaDate-inicioAnio)/86400000)+inicioAnio.getDay()+1)/7);
    const hojas = ["S"+(semana-1),"S"+semana,"S"+(semana+1)];
    for (const nombreHoja of hojas) {
      const sheet = ss.getSheetByName(nombreHoja);
      if (!sheet) continue;
      const rows = sheet.getDataRange().getValues();
      let ci={fecha:-1,equipo:-1,desc:-1,obs:-1,archivo:-1};
      let headerFound=false, dataStartRow=-1;
      for (let r=0; r<rows.length; r++) {
        const joined = rows[r].map(x=>String(x)).join(" ").toLowerCase();
        if (joined.includes("fecha") && (joined.includes("equipo")||joined.includes("descripcion"))) {
          rows[r].forEach((x,idx)=>{
            const l=String(x).toLowerCase().trim();
            if (l==="fecha") ci.fecha=idx;
            else if (l.includes("equipo")) ci.equipo=idx;
            else if (l.includes("desc")) ci.desc=idx;
            else if (l.includes("observ")) ci.obs=idx;
            else if (l.includes("archivo")||l.includes("doc")||l.includes("adjunto")) ci.archivo=idx;
          });
          headerFound=true; dataStartRow=r+1; break;
        }
      }
      if (!headerFound||ci.fecha===-1) continue;
      for (let i=dataStartRow; i<rows.length; i++) {
        const colB = ci.fecha>=0 ? rows[i][ci.fecha] : "";
        const colC = ci.equipo>=0 ? String(rows[i][ci.equipo]||"").trim() : "";
        const colD = ci.desc>=0 ? String(rows[i][ci.desc]||"").trim() : "";
        let fechaFila="";
        if (colB instanceof Date) { fechaFila=Utilities.formatDate(colB,TZ,"yyyy-MM-dd"); }
        else { const p=String(colB).trim().split("/"); if(p.length===3) fechaFila=p[2]+"-"+p[1].padStart(2,"0")+"-"+p[0].padStart(2,"0"); }
        if (fechaFila===fecha && colC===equipo && colD===descripcion) {
          let archivoUrl="";
          if (payload.archivo && payload.archivo.datos) {
            try {
              const carpetaRaiz=DriveApp.getFolderById(DRIVE_FOLDER_ID);
              const nombreCarpeta="OP_"+equipo.replace(/[^a-zA-Z0-9_-]/g,"_")+"_"+fecha;
              let subcarpeta;
              const iter=carpetaRaiz.getFoldersByName(nombreCarpeta);
              subcarpeta=iter.hasNext()?iter.next():carpetaRaiz.createFolder(nombreCarpeta);
              const blob=Utilities.newBlob(Utilities.base64Decode(payload.archivo.datos),payload.archivo.tipo,payload.archivo.nombre);
              const file=subcarpeta.createFile(blob);
              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
              subcarpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
              archivoUrl=file.getUrl();
            } catch(err) { Logger.log("Error subiendo archivo operador: "+err.message); }
          }
          const obsCol=ci.obs>=0?ci.obs+1:9;
          const archivoCol=ci.archivo>=0?ci.archivo+1:10;
          if (archivoUrl) sheet.getRange(i+1,archivoCol).setValue(archivoUrl);
          if (comentario) {
            const valorActual=String(sheet.getRange(i+1,obsCol).getValue()||"").trim();
            const timestamp=Utilities.formatDate(new Date(),TZ,"dd/MM/yyyy HH:mm");
            const entrada="["+timestamp+" - "+usuario+"]: "+comentario;
            const nuevoComentario=valorActual?valorActual+"\n"+entrada:entrada;
            sheet.getRange(i+1,obsCol).setValue(nuevoComentario);
          }
          return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"No se encontró la tarea en el planificador"})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log("Error guardarComentarioOperador: "+err.message);
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── CAMBIO DE CONTRASEÑA ─────────────────────────────────
function cambiarContrasena(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_USUARIOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja USUARIOS no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const usuario = String(payload.usuario||"").trim().toLowerCase();
  const actual  = String(payload.contrasena_actual||"").trim();
  const nueva   = String(payload.contrasena_nueva||"").trim();
  for (let i = 1; i < rows.length; i++) {
    const u = String(rows[i][0]||"").trim().toLowerCase();
    const c = String(rows[i][1]||"").trim();
    if (u === usuario) {
      if (c !== actual) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"La contraseña actual es incorrecta"})).setMimeType(ContentService.MimeType.JSON);
      sheet.getRange(i+1,2).setValue(nueva);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Usuario no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}

// ── ALERTAS ──────────────────────────────────────────────
function enviarAlertas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length<=1) return;
  const headers = rows[0].map(h=>String(h).trim().toLowerCase().replace(/ /g,"_"));
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  rows.slice(1).forEach(row => {
    let obj={};
    headers.forEach((h,i)=>{obj[h]=row[i];});
    const tiposAlerta=["OPEX","Res 785","Certificacion","Habilitacion","SE","Certificación","Habilitación"];
    if (!obj.email_responsable||!obj.fecha_vencimiento) return;
    if (tiposAlerta.indexOf(String(obj.tipo))===-1) return;
    let fechaVenc;
    if (obj.fecha_vencimiento instanceof Date) fechaVenc=obj.fecha_vencimiento;
    else { const p=String(obj.fecha_vencimiento).split("/"); if(p.length!==3) return; fechaVenc=new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])); }
    fechaVenc.setHours(0,0,0,0);
    const diff=Math.ceil((fechaVenc-hoy)/86400000);
    if (!(diff===30||diff===23||diff===15)) return;
    const fechaStr=Utilities.formatDate(fechaVenc,TZ,"dd/MM/yyyy");
    try { GmailApp.sendEmail(obj.email_responsable,"Vencimiento próximo","Equipo: "+obj.equipo+"\nDescripción: "+obj.descripcion+"\n\nEsta tarea vence el día "+fechaStr); }
    catch(err) { Logger.log("Error email a "+obj.email_responsable+": "+err.message); }
  });
}

function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(t=>{ if(t.getHandlerFunction()==="enviarAlertas") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("enviarAlertas").timeBased().everyDays(1).atHour(8).create();
  Logger.log("Trigger diario creado correctamente.");
}

// ── ST HISTÓRICO ─────────────────────────────────────────
function getDataSTHistorico() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("ST_HISTORICO");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const data = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
      obj[h] = val;
    });
    return obj;
  }).filter(r => r.equipo || r.descripcion);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ── AVISOS ───────────────────────────────────────────────
function getAvisos() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("AVISOS");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const data = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
      obj[h] = val;
    });
    return obj;
  }).filter(r => {
    if (!r.titulo) return false;
    if (String(r.activo).toLowerCase() === 'false' || String(r.activo) === '0') return false;
    const desde = r.fecha_aparicion ? parseDate(r.fecha_aparicion) : null;
    const hasta = r.fecha_desaparicion ? parseDate(r.fecha_desaparicion) : null;
    if (desde && hoy < desde) return false;
    if (hasta && hoy > hasta) return false;
    return true;
  });
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function parseDate(val) {
  if (!val) return null;
  const p = String(val).split('/');
  if (p.length === 3) return new Date(+p[2], +p[1]-1, +p[0]);
  return null;
}

function getProximoNumeroAviso() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("AVISOS_PERM");
  if (!sheet) {
    sheet = ss.insertSheet("AVISOS_PERM");
    sheet.getRange(1, 1).setValue("ULTIMO_NUMERO");
    sheet.getRange(2, 1).setValue(0);
  }
  const ultimo = parseInt(sheet.getRange(2, 1).getValue()) || 0;
  const nuevo = ultimo + 1;
  sheet.getRange(2, 1).setValue(nuevo);
  const numeroFormateado = String(nuevo).padStart(5, '0');
  return ContentService.createTextOutput(JSON.stringify({ ok: true, numero: numeroFormateado })).setMimeType(ContentService.MimeType.JSON);
}

// ── STOCK ─────────────────────────────────────────────────
function getStock() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_STOCK);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
  const data = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
    return obj;
  }).filter(r => r.id || r.codigo || r.descripcion);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function guardarStock(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_STOCK);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_STOCK);
    const hdrs = ['ID','CODIGO','DESCRIPCION','ACTIVO','CANTIDAD','UNIDAD','STOCK_MINIMO','UBICACION','PROVEEDOR','PRECIO','QR_CODE','NOTAS'];
    sheet.appendRow(hdrs);
    sheet.getRange(1,1,1,hdrs.length).setFontWeight('bold').setBackground('#333333').setFontColor('#ffffff');
  }
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).toUpperCase());
  const idCol = headers.indexOf('ID');
  if (!payload.id) return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Sin ID'})).setMimeType(ContentService.MimeType.JSON);
  const fila = [
    payload.id,
    payload.codigo || '',
    payload.descripcion || '',
    payload.activo || '',
    payload.cantidad !== undefined ? payload.cantidad : 0,
    payload.unidad || '',
    payload.stock_minimo !== undefined ? payload.stock_minimo : 0,
    payload.ubicacion || '',
    payload.proveedor || '',
    payload.precio !== undefined ? payload.precio : 0,
    payload.qr_code || ('STOCK-' + (payload.codigo || payload.descripcion || '') + '-' + new Date().getTime()),
    payload.notas || ''
  ];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(payload.id)) {
      sheet.getRange(i+1, 1, 1, fila.length).setValues([fila]);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'ID no encontrado'})).setMimeType(ContentService.MimeType.JSON);
}

function eliminarStock(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_STOCK);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Hoja STOCK no encontrada"})).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).toUpperCase());
  const idCol = headers.indexOf('ID');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][idCol]) === String(payload.id)) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Ítem no encontrado"})).setMimeType(ContentService.MimeType.JSON);
}
function getStockBuscar(params) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_STOCK);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Hoja STOCK no encontrada" })).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify({ ok: true, total: 0, items: [] })).setMimeType(ContentService.MimeType.JSON);

  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g, "_"));
  const busqueda = params && params.q ? params.q.toString().trim() : "";

  function norm(s) {
    return String(s || "").toUpperCase()
      .replace(/["""''\/\\]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function variantes(p) {
    const v = [p];
    if (p.endsWith('S') && p.length > 3)  v.push(p.slice(0, -1));
    if (p.endsWith('ES') && p.length > 4) v.push(p.slice(0, -2));
    if (!p.endsWith('S'))                  v.push(p + 'S');
    return v;
  }

  const palabras = busqueda ? norm(busqueda).split(/\s+/).filter(p => p.length > 0) : [];
  const items = rows.slice(1)
    .map(row => {
      let obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
      return obj;
    })
    .filter(r => r.descripcion || r.codigo)
    .filter(r => {
      if (!palabras.length) return true;
      const todo = norm(r.descripcion) + ' ' + norm(r.codigo) + ' ' +
                   norm(r.activo) + ' ' + norm(r.proveedor) + ' ' + norm(r.notas);
      return palabras.every(p => variantes(p).some(v => todo.includes(v)));
    });

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    busqueda: busqueda,
    total: items.length,
    items: items
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── HISTORIAL UNIFICADO (ST + ST_HISTORICO) por equipo ──
function getHistorialEquipo(params) {
  const equipo = String(params && params.equipo ? params.equipo : "").trim().toUpperCase();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const resultado = [];

  ["ST", "ST_HISTORICO"].forEach(function(nombreHoja) {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return;
    const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
    rows.slice(1).forEach(row => {
      let obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
        obj[h] = val;
      });
      const eqFila = String(obj.equipo || "").trim().toUpperCase().replace(/\s+/g,"");
      const eqBusc = equipo.replace(/\s+/g,"");
      if (!equipo || eqFila.includes(eqBusc) || eqBusc.includes(eqFila)) {
        obj._fuente = nombreHoja;
        resultado.push(obj);
      }
    });
  });

  let archivoUrl = "", archivoUrl2 = "", archivoUrl3 = "", nombreEquipo = "", modoFalla = "";
  const sheetEq = ss.getSheetByName(SHEET_EQUIPOS);
  if (sheetEq) {
    const rowsEq = sheetEq.getDataRange().getValues();
    const headersEq = rowsEq[0].map(h => String(h).trim().toLowerCase().replace(/[\/\. &]+/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,""));
    for (let i = 1; i < rowsEq.length; i++) {
      let objEq = {};
      headersEq.forEach((h, idx) => { objEq[h] = rowsEq[i][idx]; });
      const tagFila = String(objEq.tag || "").trim().toUpperCase().replace(/\s+/g,"");
      const eqBusc  = equipo.replace(/\s+/g,"");
      if (tagFila === eqBusc || tagFila.includes(eqBusc) || eqBusc.includes(tagFila)) {
        archivoUrl   = String(objEq.archivo || "");
        archivoUrl2  = String(objEq.archivo_2 || objEq.archivo2 || "");
        archivoUrl3  = String(objEq.archivo_3 || objEq.archivo3 || "");
        nombreEquipo = String(objEq.descripcion || objEq.nombre || "");
        modoFalla    = String(objEq.modo_de_falla || "");
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    equipo: equipo,
    nombre: nombreEquipo,
    modo_de_falla: modoFalla,
    archivo: archivoUrl,
    archivo_2: archivoUrl2,
    archivo_3: archivoUrl3,
    total: resultado.length,
    registros: resultado
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── HISTORIAL AGENTE (solo ST) ──
function getHistorialAgente(params) {
  const equipo = String(params && params.equipo ? params.equipo : "").trim().toUpperCase();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const resultado = [];

  const sheet = ss.getSheetByName("ST");
  if (sheet) {
    const rows = sheet.getDataRange().getValues();
    if (rows.length > 1) {
      const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
      rows.slice(1).forEach(row => {
        let obj = {};
        headers.forEach((h, i) => {
          let val = row[i];
          if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
          obj[h] = val;
        });
        const eqFila = String(obj.equipo || "").trim().toUpperCase().replace(/\s+/g,"");
        const eqBusc = equipo.replace(/\s+/g,"");
        if (!eqFila) return;
if (!equipo || eqFila === eqBusc || eqFila.includes(eqBusc)) {
          resultado.push(obj);
        }
      });
    }
  }
  // Después del bloque que lee ST, agregar:
const sheetHist = ss.getSheetByName("ST_HISTORICO");
if (sheetHist) {
  const rowsHist = sheetHist.getDataRange().getValues();
  if (rowsHist.length > 1) {
    const headersHist = rowsHist[0].map(h => String(h).trim().toLowerCase().replace(/ /g,"_"));
    rowsHist.slice(1).forEach(row => {
      let obj = {};
      headersHist.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
        obj[h] = val;
      });
      const eqFila = String(obj.equipo || "").trim().toUpperCase().replace(/\s+/g,"");
      const eqBusc = equipo.replace(/\s+/g,"");
      if (!eqFila) return;
if (!equipo || eqFila === eqBusc || eqFila.includes(eqBusc)) {
        obj._fuente = "ST_HISTORICO";
        resultado.push(obj);
      }
    });
  }
}

  let archivoUrl = "", nombreEquipo = "", modoFalla = "", repuestos = "", obsT = "";
  const sheetEq = ss.getSheetByName(SHEET_EQUIPOS);
  if (sheetEq) {
    const rowsEq = sheetEq.getDataRange().getValues();
    const headersEq = rowsEq[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g,"_"));
    for (let i = 1; i < rowsEq.length; i++) {
      let objEq = {};
      headersEq.forEach((h, idx) => { objEq[h] = rowsEq[i][idx]; });
      const tagFila = String(objEq.tag || "").trim().toUpperCase().replace(/\s+/g,"");
      const eqBusc  = equipo.replace(/\s+/g,"");
      if (tagFila === eqBusc || tagFila.includes(eqBusc) || eqBusc.includes(tagFila)) {
        archivoUrl   = String(objEq.archivo || "");
        nombreEquipo = String(objEq.descripcion || objEq.nombre || "");
        modoFalla    = String(objEq.modo_de_falla || "");
        repuestos    = String(objEq.repuestos_criticos || "");
        obsT         = String(objEq.observaciones_tecnicas || "");
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    equipo: equipo,
    nombre: nombreEquipo,
    modo_de_falla: modoFalla,
    repuestos_criticos: repuestos,
    observaciones_tecnicas: obsT,
    archivo: archivoUrl,
    total: resultado.length,
    registros: resultado
  })).setMimeType(ContentService.MimeType.JSON);
}
function getTextoPDF(params) {
  try {
    var fileUrl = String(params.url || "").trim();
    var keywords = String(params.keywords || "").trim().toLowerCase();
    
    if (!fileUrl) return ContentService.createTextOutput(
      JSON.stringify({ok:false, error:"URL no proporcionada"})
    ).setMimeType(ContentService.MimeType.JSON);

    var fileId = "";
    var match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];
    if (!fileId) return ContentService.createTextOutput(
      JSON.stringify({ok:false, error:"No se pudo extraer el ID"})
    ).setMimeType(ContentService.MimeType.JSON);

    // Copiar el archivo como Google Doc para extraer texto
    var file = DriveApp.getFileById(fileId);
    var fileName = file.getName();
    
    var copyFile = Drive.Files.copy(
      { title: "tmp_" + fileId, mimeType: "application/vnd.google-apps.document" },
      fileId,
      { convert: true }
    );
    var docId = copyFile.id;

    // Leer el texto
    var doc = DocumentApp.openById(docId);
    var texto = doc.getBody().getText();
    
    // Eliminar el doc temporal
    DriveApp.getFileById(docId).setTrashed(true);

    // Filtrar párrafos relevantes
    var fragmentos = [];
    if (keywords) {
      var kws = keywords.split(/[\s,]+/).filter(function(k){ return k.length > 2; });
      var parrafos = texto.split(/\n+/);
      parrafos.forEach(function(p) {
        if (p.trim().length < 10) return;
        var pLow = p.toLowerCase();
        if (kws.some(function(k){ return pLow.includes(k); })) {
          fragmentos.push(p.trim());
        }
      });
    }

    var contenido = fragmentos.length > 0
      ? fragmentos.slice(0, 40).join("\n\n")
      : texto.substring(0, 3000);

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      nombre: fileName,
      total_fragmentos: fragmentos.length,
      contenido: contenido
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log("Error getTextoPDF: " + err.message);
    return ContentService.createTextOutput(
      JSON.stringify({ok:false, error: err.message})
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
function testPDF() {
  var result = getTextoPDF({
    url: "https://drive.google.com/file/d/1X3RFdLpFxzm9X55IT1a9zhghSd8wPvGZ/view?usp=drivesdk",
    keywords: "supresion parasita eco calibracion"
  });
  Logger.log(result.getContent());
}
function buscarEquipo(params) {
  const query = String(params.query || "").trim().toUpperCase();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim().toLowerCase()
    .replace(/\//g,"_").replace(/\./g,"").replace(/&/g,"_").replace(/ +/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,""));
  
  const resultado = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) val = Utilities.formatDate(val, TZ, "dd/MM/yyyy");
      obj[h] = val;
    });
    return obj;
  }).filter(r => {
    if (!r.tag && !r.descripcion) return false;
    const texto = [r.tag, r.descripcion, r.area, r.subarea, r.tipo, r.observaciones_tecnicas]
      .map(v => String(v||"").toUpperCase()).join(" ");
    return query.split(/\s+/).every(palabra => texto.includes(palabra));
  });

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    total: resultado.length,
    equipos: resultado
  })).setMimeType(ContentService.MimeType.JSON);
}

