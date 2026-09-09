function actualizarDesdeListaInstrumentos() {
  const SHEET_ID_DESTINO = '1FiWvwImJqp4GxT5Xo4E0rA5BARcfH3cY3fyidsM7j4k';
  const SHEET_ID_ORIGEN  = '1pW9Q6E5vSFWrT34O7ejYXG-tVX6OqidWTFclGDXhEWM';
  const GID_ORIGEN = 1360671818;

  // 1. Abrir destino (EQUIPOS)
  const ssDest = SpreadsheetApp.openById(SHEET_ID_DESTINO);
  const sheetDest = ssDest.getSheetByName('EQUIPOS');
  const dataDest = sheetDest.getDataRange().getValues();
  const headersDest = dataDest[0].map(h => String(h).trim().toUpperCase());
  const colTag  = headersDest.indexOf('TAG');
  const colProv = headersDest.indexOf('PROVEEDOR / MODELO');
  const colObs  = headersDest.indexOf('OBSERVACIONES TECNICAS');
  const colDesc = headersDest.indexOf('DESCRIPCION');
  const colTipo = headersDest.indexOf('TIPO');

  if (colTag === -1 || colProv === -1 || colObs === -1) {
    Logger.log('Columnas no encontradas. TAG:' + colTag + ' PROV:' + colProv + ' OBS:' + colObs);
    return;
  }

  // Mapa TAG -> fila real
  var tagMap = {};
  for (var i = 1; i < dataDest.length; i++) {
    var tag = String(dataDest[i][colTag] || '').trim();
    if (tag) tagMap[tag] = i + 1;
  }
  Logger.log('Equipos en destino: ' + Object.keys(tagMap).length);

  // 2. Abrir origen
  var ssOrigen = SpreadsheetApp.openById(SHEET_ID_ORIGEN);
  var sheetOrigen = null;
  var sheets = ssOrigen.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    if (sheets[s].getSheetId() === GID_ORIGEN) {
      sheetOrigen = sheets[s];
      break;
    }
  }
  if (!sheetOrigen) sheetOrigen = ssOrigen.getSheets()[0];

  var dataOrigen = sheetOrigen.getDataRange().getValues();

  // Buscar fila de encabezados
  var headerRow = -1;
  var cTag = -1, cMarca = -1, cModelo = -1, cRango = -1, cTipo = -1, cServ = -1;

  for (var r = 0; r < Math.min(10, dataOrigen.length); r++) {
    var row = dataOrigen[r].map(function(c){ return String(c).trim().toUpperCase(); });
    var tIdx = row.findIndex(function(c){ return c === 'TAG'; });
    var mIdx = row.findIndex(function(c){ return c.includes('MARCA'); });
    var mdIdx = row.findIndex(function(c){ return c.includes('MODELO'); });
    var rIdx  = row.findIndex(function(c){ return c.includes('RANGO'); });
    var tiIdx = row.findIndex(function(c){ return c.includes('TIPO'); });
    var svIdx = row.findIndex(function(c){ return c.includes('SERVICIO'); });
    if (tIdx !== -1 && mIdx !== -1) {
      headerRow = r;
      cTag = tIdx; cMarca = mIdx; cModelo = mdIdx;
      cRango = rIdx; cTipo = tiIdx; cServ = svIdx;
      break;
    }
  }

  if (headerRow === -1) {
    Logger.log('No se encontró fila de encabezados en el archivo origen');
    return;
  }
  Logger.log('Encabezados en fila: ' + (headerRow + 1));

  // 3. Actualizar los que ya existen y guardar los no encontrados
  var actualizados = 0;
  var noEncontrados = [];

  for (var dr = headerRow + 1; dr < dataOrigen.length; dr++) {
    var rowData = dataOrigen[dr];
    var tag = String(rowData[cTag] || '').trim();
    if (!tag) continue;

    var marca  = cMarca  >= 0 ? String(rowData[cMarca]  || '').trim() : '';
    var modelo = cModelo >= 0 ? String(rowData[cModelo] || '').trim() : '';
    var rango  = cRango  >= 0 ? String(rowData[cRango]  || '').trim() : '';
    var tipo   = cTipo   >= 0 ? String(rowData[cTipo]   || '').trim() : '';
    var serv   = cServ   >= 0 ? String(rowData[cServ]   || '').trim() : '';
    var prov   = [marca, modelo].filter(function(p){ return p.length > 0; }).join(' - ');

    if (tagMap[tag] !== undefined) {
      if (prov)  sheetDest.getRange(tagMap[tag], colProv + 1).setValue(prov);
      if (rango) sheetDest.getRange(tagMap[tag], colObs  + 1).setValue(rango);
      actualizados++;
      Logger.log('✓ ' + tag + ' → ' + prov + ' | ' + rango);
    } else {
      noEncontrados.push({tag: tag, marca: marca, modelo: modelo, rango: rango, tipo: tipo, serv: serv, prov: prov});
    }
  }

  // 4. Agregar los no encontrados al final
  var lastRow = sheetDest.getLastRow();
  var agregados = 0;

  for (var n = 0; n < noEncontrados.length; n++) {
    var item = noEncontrados[n];
    lastRow++;
    sheetDest.getRange(lastRow, colTag  + 1).setValue(item.tag);
    if (colDesc >= 0 && item.serv)  sheetDest.getRange(lastRow, colDesc + 1).setValue(item.serv);
    if (colTipo >= 0 && item.tipo)  sheetDest.getRange(lastRow, colTipo + 1).setValue(item.tipo);
    if (item.prov)  sheetDest.getRange(lastRow, colProv + 1).setValue(item.prov);
    if (item.rango) sheetDest.getRange(lastRow, colObs  + 1).setValue(item.rango);
    agregados++;
    Logger.log('+ ' + item.tag + ' agregado');
  }

  Logger.log('=== RESULTADO ===');
  Logger.log('Actualizados: ' + actualizados);
  Logger.log('Agregados nuevos: ' + agregados);
}