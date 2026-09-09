function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Preventivos Mecánicos')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}