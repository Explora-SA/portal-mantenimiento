function doGet(e) {
  if(e.parameter.listado){
       return HtmlService.createHtmlOutputFromFile('Listado_Fichas')
              .setTitle('Fichas de Equipos');
     }
  if (e && e.parameter && e.parameter.activo) {
    var activoId = e.parameter.activo;
    var html = HtmlService.createHtmlOutputFromFile('Ficha_Equipo').getContent();
    html = html.replace("'<?= activoId ?>'", "'" + activoId + "'");
    return HtmlService.createHtmlOutput(html)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput('<p>Escaneá el código QR del equipo.</p>');
}