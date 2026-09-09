/**********************************************************************
 *  RESUMEN DIARIO DE MANTENIMIENTO  →  Email + Google Chat
 *  VERSIÓN OPTIMIZADA (rápida)
 *  ------------------------------------------------------------------
 *  Cambios vs. versión anterior:
 *   • Descarga los 4 endpoints EN PARALELO (fetchAll).
 *   • Agrupa por equipo en UNA sola pasada (antes recorría toda la
 *     lista una vez por cada equipo → por eso vibraciones tardaba).
 *  El resultado es idéntico, solo que mucho más rápido.
 **********************************************************************/

/* ═══════════════════ 1) CONFIGURACIÓN ═══════════════════ */

const ENVIAR_CHAT  = true;   // Espacio de Google Chat
const ENVIAR_EMAIL = false;  // Correo (poné true cuando cargues EMAILS)

const CHAT_WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAQAoXfRQz4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=zJZcvam7g2al5U6grYBOT8rzasnEcSHzCuUL2nUWhPo";
const EMAILS = "jefe@tuempresa.com, supervisor@tuempresa.com";

const URL_VIB   = "https://script.google.com/macros/s/AKfycbxcdExWNMnv8sXnTuzRpmvOTt01ou4P6AXvjEDfCeBwKJh9mZCwtsJ4yvTBmrE41vl3eQ/exec";
const URL_TERMO = "https://script.google.com/macros/s/AKfycbyYwTE2rwciQTH-zRX1XIr1uY-0jydP-QzScSqypY0zGuNMkxtOyDN2dumJcwxTbVa8/exec";
const URL_DATOS = "https://script.google.com/macros/s/AKfycbxBBiJZexMdWlGFDWKnIaPiOmSACB9RL1G-w03amZYBBwIw4AUWl59WzIdZoyqNrtiXvg/exec";

const ACEL_CRITICO = 5.0;
const ACEL_ALERTA  = 2.5;
const ACEL_INICIO  = 1.5;
const DIAS_VENC     = 7;
const MAX_ITEMS     = 8;

const TZ = "America/Argentina/Buenos_Aires";


/* ═══════════════════ 2) PRINCIPAL ═══════════════════ */

function enviarResumenDiario() {
  const texto = construirMensaje();
  const fechaTxt = Utilities.formatDate(new Date(), TZ, "dd/MM");
  if (ENVIAR_CHAT)  enviarChat(texto);
  if (ENVIAR_EMAIL) enviarEmail("🔧 Novedades Mantenimiento — " + fechaTxt, texto);
}


/* ═══════════════════ 3) DESCARGA EN PARALELO ═══════════════════ */

function obtenerDatos() {
  return {
    vib:   traerConReintento(URL_VIB   + "?action=data"),
    termo: traerConReintento(URL_TERMO + "?action=data"),
    sol:   traerConReintento(URL_DATOS + "?action=getAllST"),
    venc:  traerConReintento(URL_DATOS + "?action=get")
  };
}

// Descarga un endpoint reintentando ante timeouts/errores pasajeros.
// Devuelve el JSON, o null si tras N intentos no respondió.
function traerConReintento(url, intentos) {
  intentos = intentos || 3;
  for (let i = 0; i < intentos; i++) {
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (resp.getResponseCode() === 200) return JSON.parse(resp.getContentText());
      Logger.log("Código " + resp.getResponseCode() + " en intento " + (i + 1));
    } catch (e) {
      Logger.log("Intento " + (i + 1) + " falló: " + e.message);
    }
    if (i < intentos - 1) Utilities.sleep(2000); // espera 2s y reintenta
  }
  return null; // no se pudo leer
}


/* ═══════════════════ 4) ARMADO DEL MENSAJE ═══════════════════ */

function construirMensaje() {
  const d = obtenerDatos();
  const fechaTxt = Utilities.formatDate(new Date(), TZ, "dd/MM");
  let m = "🔧 *NOVEDADES MANTENIMIENTO* — " + fechaTxt + "\n";
  m += bloque(seccionVibraciones(d.vib));
  m += bloque(seccionTermografia(d.termo));
  m += bloque(seccionSolicitudes(d.sol));
  m += bloque(seccionVencimientos(d.venc));
  m += "\n_Resumen automático. Detalle en el portal._";
  return m;
}
function bloque(t) { return t ? "\n" + t + "\n" : ""; }
function recortar(lineas) {
  if (lineas.length <= MAX_ITEMS) return lineas.join("\n");
  const v = lineas.slice(0, MAX_ITEMS);
  v.push("… +" + (lineas.length - MAX_ITEMS) + " más");
  return v.join("\n");
}

// Agrupa filas por un campo, en UNA pasada, y precalcula el timestamp de fecha
function agrupar(data, campoTag, campoFecha) {
  const g = {};
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const t = r[campoTag];
    if (!t) continue;
    r._ts = parseFecha(r[campoFecha]).getTime(); // se calcula una sola vez
    (g[t] || (g[t] = [])).push(r);
  }
  return g;
}


/* ───── VIBRACIONES ───── */
function seccionVibraciones(data) {
  if (data === null) return "〰️ *VIBRACIONES*\n⚠️ No se pudo leer";
  if (!Array.isArray(data) || !data.length) return "";

  const grupos = agrupar(data, "Tag Equipo", "Fecha Medicion");
  const criticos = [], inicio = [], alerta = [];

  Object.keys(grupos).forEach(function (tag) {
    const est = ultimaAceleracion(grupos[tag]);
    if (est.estado === "critico") criticos.push("• " + tag + " · " + est.max.toFixed(1) + "g · " + est.punto);
    else if (est.estado === "inicio") inicio.push(tag);
    else if (est.estado === "alerta") alerta.push(tag);
  });

  if (!criticos.length && !inicio.length && !alerta.length) return "";
  let s = "〰️ *VIBRACIONES*";
  if (criticos.length) s += "\n🔴 Críticas (" + criticos.length + ")\n" + recortar(criticos);
  if (inicio.length)   s += "\n🟠 Inicio de falla (" + inicio.length + "): " + inicio.slice(0, MAX_ITEMS).join(", ") + (inicio.length > MAX_ITEMS ? "…" : "");
  if (alerta.length)   s += "\n🟡 Alerta (" + alerta.length + "): " + alerta.slice(0, MAX_ITEMS).join(", ") + (alerta.length > MAX_ITEMS ? "…" : "");
  return s;
}
function ultimaAceleracion(rows) {
  rows.sort(function (a, b) { return b._ts - a._ts; }); // por timestamp precalculado
  const ultima = rows[0]["Fecha Medicion"];
  const delDia = rows.filter(function (r) { return r["Fecha Medicion"] === ultima; });
  const acels = delDia.filter(function (r) { return String(r["Punto medicion"] || "").indexOf("Acel") !== -1; });
  const vals = acels.map(function (r) { return parseFloat(r["Valor"]); }).filter(function (v) { return !isNaN(v); });
  if (!vals.length) return { estado: "sin-dato", max: null, punto: "—" };
  const max = Math.max.apply(null, vals);
  const fila = acels.find(function (r) { return parseFloat(r["Valor"]) === max; });
  return { estado: estadoAcel(max), max: max, punto: fila ? fila["Punto medicion"] : "—" };
}
function estadoAcel(v) {
  if (v > ACEL_CRITICO) return "critico";
  if (v > ACEL_ALERTA)  return "alerta";
  if (v > ACEL_INICIO)  return "inicio";
  return "ok";
}


/* ───── TERMOGRAFÍA (tableros en AT) ───── */
const ORDEN_TERMO = { AT: 3, MT: 2, BT: 1, PARADO: 0 };

function seccionTermografia(data) {
  if (data === null) return "🌡️ *TERMOGRAFÍA*\n⚠️ No se pudo leer";
  if (!Array.isArray(data)) return "";
  data = data.filter(function (r) { return r && r["FECHA"] && r["TAG"]; });
  if (!data.length) return "";

  const grupos = agrupar(data, "TAG", "FECHA");
  const at = [];
  Object.keys(grupos).forEach(function (tag) {
    const e = ultimoEstadoTermo(grupos[tag]);
    if (e.estado === "AT") {
      const sector = grupos[tag][0]["SECTOR"] || "";
      at.push("• " + tag + (sector ? " · " + sector : "") + " · " + fmtFecha(e.fecha));
    }
  });
  if (!at.length) return "";
  return "🌡️ *TABLEROS EN ALTA TEMP (AT)* (" + at.length + ")\n" + recortar(at);
}
function ultimoEstadoTermo(rows) {
  rows.sort(function (a, b) { return b._ts - a._ts; });
  const ultima = rows[0]["FECHA"];
  const delDia = rows.filter(function (r) { return r["FECHA"] === ultima; });
  const todosParado = delDia.every(function (r) {
    const vals = valoresEstado(r);
    return vals.length > 0 && vals.every(function (v) { return v === "PARADO"; });
  });
  if (todosParado) return { estado: "PARADO", fecha: ultima };
  let peor = null;
  delDia.forEach(function (r) {
    const est = peorEstadoFila(r);
    if (est && (!peor || ORDEN_TERMO[est] > ORDEN_TERMO[peor])) peor = est;
  });
  return { estado: peor || "BT", fecha: ultima };
}
function valoresEstado(row) {
  return Object.keys(row).map(function (k) { return String(row[k] || "").trim().toUpperCase(); })
    .filter(function (v) { return ["AT", "MT", "BT", "PARADO"].indexOf(v) !== -1; });
}
function peorEstadoFila(row) {
  const vals = Object.keys(row).map(function (k) { return String(row[k] || "").trim().toUpperCase(); })
    .filter(function (v) { return ["AT", "MT", "BT"].indexOf(v) !== -1; });
  if (!vals.length) return null;
  vals.sort(function (a, b) { return (ORDEN_TERMO[b] || 0) - (ORDEN_TERMO[a] || 0); });
  return vals[0];
}


/* ───── SOLICITUDES ───── */
function seccionSolicitudes(data) {
  if (data === null) return "⚠️ *SOLICITUDES*\n⚠️ No se pudo leer";
  if (!Array.isArray(data) || !data.length) return "";
  const pendientes = data.filter(function (r) { return String(r.realizado) !== "1"; });
  const urgentes = pendientes.filter(function (r) { return r.prioridad === "Urgente"; });
  const altas    = pendientes.filter(function (r) { return r.prioridad === "Alta"; });
  if (!urgentes.length && !altas.length) return "";
  let s = "⚠️ *SOLICITUDES PENDIENTES*";
  if (urgentes.length) {
    s += "\n🔴 Urgentes (" + urgentes.length + ")\n" +
      recortar(urgentes.map(function (r) {
        let l = "• " + (r.equipo || r.descripcion || "-");
        if (r.equipo && r.descripcion) l += " · " + r.descripcion; // detalle de la tarea
        if (r.sector) l += " — " + r.sector;
        if (r.solicitante) l += " · pidió: " + r.solicitante;
        return l;
      }));
  }
  if (altas.length) {
    s += "\n🟠 Alta prioridad (" + altas.length + "): " +
      altas.slice(0, MAX_ITEMS).map(function (r) { return r.equipo || r.descripcion || "-"; }).join(", ") +
      (altas.length > MAX_ITEMS ? "…" : "");
  }
  return s;
}


/* ───── VENCIMIENTOS ───── */
// Mismos tipos que muestra el dashboard de Vencimientos
const TIPOS_VENC = ["OPEX", "SE", "Res 785", "Habilitación", "Certificación", "Habilitacion", "Certificacion"];

function seccionVencimientos(data) {
  if (data === null) return "📅 *VENCIMIENTOS*\n⚠️ No se pudo leer";
  if (!Array.isArray(data) || !data.length) return "";

  // Solo los tipos relevantes (igual que el dashboard)
  const rows = data.filter(function (r) {
    return (r.equipo || r.descripcion) && TIPOS_VENC.indexOf(String(r.tipo || "").trim()) !== -1;
  });

  const hoy = medianoche(new Date());
  let totalVencidos = 0;
  const vencidosNuevos = [], estaSemana = [];

  rows.forEach(function (r) {
    const dias = diasRestantes(r.fecha_vencimiento, hoy);
    if (dias === null) return;
    const nombre = r.equipo || r.descripcion || "-";
    if (dias < 0) {
      totalVencidos++;
      if (dias >= -7) vencidosNuevos.push("• " + nombre + " (hace " + Math.abs(dias) + "d)"); // venció esta semana
    } else if (dias <= DIAS_VENC) {
      estaSemana.push("• " + nombre + " (" + dias + "d)");
    }
  });

  if (!totalVencidos && !estaSemana.length) return "";
  let s = "📅 *VENCIMIENTOS*";
  if (estaSemana.length) s += "\n🟡 Vencen esta semana (" + estaSemana.length + ")\n" + recortar(estaSemana);
  if (totalVencidos) {
    s += "\n🔴 Vencidos: " + totalVencidos + " en total";
    if (vencidosNuevos.length) s += "  · vencieron esta semana:\n" + recortar(vencidosNuevos);
  }
  return s;
}


/* ═══════════════════ 5) ENVÍO ═══════════════════ */
function enviarChat(texto) {
  if (!CHAT_WEBHOOK_URL || CHAT_WEBHOOK_URL.indexOf("http") !== 0) {
    Logger.log("⚠️ Falta configurar CHAT_WEBHOOK_URL"); return;
  }
  try {
    const resp = UrlFetchApp.fetch(CHAT_WEBHOOK_URL, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({ text: texto }), muteHttpExceptions: true
    });
    Logger.log("Chat → " + resp.getResponseCode());
  } catch (e) { Logger.log("✗ Error Chat: " + e.message); }
}
function enviarEmail(asunto, texto) {
  if (!EMAILS) { Logger.log("⚠️ Falta configurar EMAILS"); return; }
  try {
    MailApp.sendEmail({ to: EMAILS, subject: asunto, htmlBody: aHtml(texto), name: "Mantenimiento — Novedades" });
    Logger.log("Email → " + EMAILS);
  } catch (e) { Logger.log("✗ Error Email: " + e.message); }
}
function aHtml(t) {
  const esc = String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const c = esc.replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>").replace(/\n/g, "<br>");
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">' + c + "</div>";
}


/* ═══════════════════ 6) UTILIDADES ═══════════════════ */
function parseFecha(s) {
  if (!s) return new Date(0);
  const st = String(s).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(st)) { const p = st.split("/"); return new Date(p[2], p[1] - 1, p[0]); }
  const d = new Date(st);
  return isNaN(d) ? new Date(0) : d;
}
function medianoche(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function diasRestantes(fechaStr, hoy) {
  if (!fechaStr) return null;
  const p = String(fechaStr).trim().split("/");
  if (p.length !== 3) return null;
  const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  if (isNaN(d)) return null;
  return Math.ceil((d - hoy) / 86400000);
}
function fmtFecha(s) {
  const d = parseFecha(s);
  return isNaN(d) || d.getTime() === 0 ? String(s || "—") : Utilities.formatDate(d, TZ, "dd/MM/yyyy");
}


/* ═══════════════════ 7) PRUEBA / SETUP ═══════════════════ */
function previsualizar() { Logger.log(construirMensaje()); }
function probarEnvio()   { enviarResumenDiario(); }

function instalarTrigger() {
  borrarTriggers();
  const dias = [
    ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY
  ];
  dias.forEach(function (dia) {
    ScriptApp.newTrigger("enviarResumenDiario").timeBased().onWeekDay(dia).atHour(5).nearMinute(0).create();
  });
  Logger.log("Trigger instalado: L-V ~8:15");
}
function borrarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}