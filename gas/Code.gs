// マット運動コーチ（Google Apps Script 版）
// 画面と骨格推定の部品は、下のフォルダに置いたファイルから読み込みます。
const FOLDER_ID = '__ASSET_FOLDER_ID__';

function doGet() {
  const html = getFile_('index.html').getBlob().getDataAsString('UTF-8');
  return HtmlService.createHtmlOutput(html)
    .setTitle('マット運動コーチ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAssetList() {
  const list = {};
  const files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/^([a-z_]+)\.(\d+)\.b64$/);
    if (m) (list[m[1]] = list[m[1]] || []).push({ name: f.getName(), size: f.getSize() });
  }
  for (const k in list) list[k].sort((a, b) => (a.name < b.name ? -1 : 1));
  return list;
}

function getAssetChunk(name) {
  if (!/^[a-z_]+\.\d+\.b64$/.test(name)) throw new Error('bad name');
  return getFile_(name).getBlob().getDataAsString();
}

function getFile_(name) {
  const it = DriveApp.getFolderById(FOLDER_ID).getFilesByName(name);
  if (!it.hasNext()) throw new Error('ファイルが見つかりません: ' + name);
  return it.next();
}
