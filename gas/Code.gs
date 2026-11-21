// マット運動コーチ（Google Apps Script 版）
// プログラム本体（server.js）と画面（index.html）は、下のフォルダから読み込みます。
// ※ アプリを新しくするときは、フォルダの中のファイルを差しかえるだけで済みます。
const FOLDER_ID = '__ASSET_FOLDER_ID__';

function doGet(e) { return server_().doGet(e); }
function api(name, args) { return server_().api(name, args); }
function getAssetList() { return server_().getAssetList(); }
function getAssetChunk(name) { return server_().getAssetChunk(name); }

// はじめに一度だけ、エディタでこの関数を選んで「実行」してください（必要な許可を出して、データ用のスプレッドシートを作ります）
function setup() {
  // ↓ 必要な許可（ドライブ・スプレッドシート・メールアドレスの確認）をまとめて出すための行です
  [SpreadsheetApp.openById, SpreadsheetApp.create, DriveApp.getRootFolder, DriveApp.createFile,
   Session.getActiveUser, Session.getEffectiveUser, PropertiesService.getScriptProperties,
   LockService.getScriptLock, Utilities.newBlob, HtmlService.createHtmlOutput];
  Logger.log(server_().setup());
}

function server_() {
  if (!globalThis.__server) {
    const it = DriveApp.getFolderById(FOLDER_ID).getFilesByName('server.js');
    const src = it.next().getBlob().getDataAsString('UTF-8');
    globalThis.__server = new Function('FOLDER_ID', src + '\nreturn { doGet, api, setup, getAssetList, getAssetChunk };')(FOLDER_ID);
  }
  return globalThis.__server;
}
