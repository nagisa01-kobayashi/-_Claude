/**
 * マット・跳び箱 技ビデオ（自動録画版）— Google Apps Script 側
 *
 * 撮った映像は、このスクリプトを作った先生のGoogleドライブの
 * 「技ビデオ」フォルダ（カメラごとのサブフォルダ）に保存されます。
 */

// ===== 設定 =====
const ROOT_FOLDER_NAME = '技ビデオ';
// true にすると「技ビデオ」フォルダを学校のドメイン内で閲覧できるよう共有します（別の先生の端末で見るため）
const SHARE_IN_DOMAIN = true;
// 撮影用ページ（GitHub Pages など）から保存するときの合言葉。
// 空のままなら自動で作られます（ふだんは触らなくて大丈夫です）。
const UPLOAD_KEY = '';
// ================

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return json_(handleApi_(p.api, p));
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('技ビデオ 自動録画')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 別のサイトに置いたアプリから使う場合の入口（通常は使いません）
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  return json_(handleApi_(body.api, body));
}

// 撮影用ページからの呼び出し（合言葉が必要）
function handleApi_(api, p) {
  try {
    if (String(p.key || '') !== uploadKey_()) return { ok: false, error: '合言葉が違います。Apps Script のアプリのホームから「撮影する」を開き直してください' };
    if (api === 'config') return { ok: true, data: { url: viewUrl_(), needKey: false, canManage: false } };
    if (api === 'list') return { ok: true, data: listClips(p.camera) };
    if (api === 'upload') return { ok: true, data: uploadClip(p.meta, p.data, p.mimeType) };
    return { ok: false, error: 'unknown_api' };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ----- アプリから呼ばれる関数 -----

function getConfig() {
  const me = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  const canManage = !!me && me === owner;
  const props = PropertiesService.getScriptProperties();
  return {
    url: ScriptApp.getService().getUrl(),
    folderUrl: rootFolder_().getUrl(),
    canManage: canManage,
    needKey: false,
    cameraPageUrl: props.getProperty('CAMERA_PAGE_URL') || '',
    apiUrl: props.getProperty('API_URL') || '',
    key: canManage ? uploadKey_() : ''
  };
}

// 撮影用ページのURLと、保存用（全員アクセス）デプロイのURLを記録する
function setLinks(cameraPageUrl, apiUrl) {
  requireOwner_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CAMERA_PAGE_URL', String(cameraPageUrl || '').trim());
  props.setProperty('API_URL', String(apiUrl || '').trim());
  props.setProperty('VIEW_URL', ScriptApp.getService().getUrl());
  return getConfig();
}

function uploadClip(meta, base64, mimeType) {
  meta = meta || {};
  const camera = Math.max(1, Math.min(99, parseInt(meta.camera, 10) || 1));
  const takenAt = Number(meta.takenAt) || Date.now();
  const type = String(mimeType || 'video/mp4').split(';')[0];
  const ext = type.indexOf('webm') >= 0 ? 'webm' : type.indexOf('quicktime') >= 0 ? 'mov' : 'mp4';
  const stamp = Utilities.formatDate(new Date(takenAt), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\n\r]/g, ' ').trim().slice(0, 40);
  const name = [stamp, clean(meta.skill), clean(meta.group), clean(meta.student)].filter(String).join('_') + '.' + ext;

  const blob = Utilities.newBlob(Utilities.base64Decode(base64), type, name);
  const info = {
    camera: camera,
    event: meta.event === 'vault' ? 'vault' : 'mat',
    skill: clean(meta.skill) || '（技名なし）',
    group: clean(meta.group),
    student: clean(meta.student),
    takenAt: takenAt,
    durationSec: Number(meta.durationSec) || null
  };
  const file = cameraFolder_(camera).createFile(blob);
  file.setDescription(JSON.stringify(info));
  return { id: file.getId(), name: name };
}

function listClips(camera) {
  const cam = parseInt(camera, 10) || 0;
  const root = rootFolder_();
  const folders = [];
  if (cam) {
    const it = root.getFoldersByName('カメラ' + cam);
    if (it.hasNext()) folders.push(it.next());
  } else {
    const it = root.getFolders();
    while (it.hasNext()) folders.push(it.next());
  }
  const out = [];
  folders.forEach(function (f) {
    const files = f.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      let info = {};
      try { info = JSON.parse(file.getDescription() || '{}'); } catch (e) {}
      out.push({
        id: file.getId(),
        name: file.getName(),
        camera: info.camera || parseInt(f.getName().replace(/\D/g, ''), 10) || 0,
        event: info.event || 'mat',
        skill: info.skill || file.getName(),
        group: info.group || '',
        student: info.student || '',
        takenAt: info.takenAt || file.getDateCreated().getTime(),
        durationSec: info.durationSec || null,
        sizeBytes: file.getSize()
      });
    }
  });
  out.sort(function (a, b) { return b.takenAt - a.takenAt; });
  return out.slice(0, 500);
}

function updateClip(id, patch) {
  requireOwner_();
  const file = DriveApp.getFileById(id);
  let info = {};
  try { info = JSON.parse(file.getDescription() || '{}'); } catch (e) {}
  ['skill', 'group', 'student'].forEach(function (k) { if (patch[k] !== undefined) info[k] = String(patch[k]).slice(0, 40); });
  if (patch.event) info.event = patch.event === 'vault' ? 'vault' : 'mat';
  file.setDescription(JSON.stringify(info));
  return true;
}

function deleteClip(id) {
  requireOwner_();
  DriveApp.getFileById(id).setTrashed(true); // ドライブのゴミ箱に移すだけ（30日以内なら戻せます）
  return true;
}

// ----- 内部 -----

function uploadKey_() {
  if (UPLOAD_KEY) return UPLOAD_KEY;
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('AUTO_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); props.setProperty('AUTO_KEY', k); }
  return k;
}

function viewUrl_() {
  return PropertiesService.getScriptProperties().getProperty('VIEW_URL') || ScriptApp.getService().getUrl();
}

function requireOwner_() {
  const me = Session.getActiveUser().getEmail();
  if (!me || me !== Session.getEffectiveUser().getEmail()) throw new Error('直したり削除したりできるのは、このアプリを作った先生だけです');
}

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const f = DriveApp.createFolder(ROOT_FOLDER_NAME);
  if (SHARE_IN_DOMAIN) {
    try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function cameraFolder_(cam) {
  const root = rootFolder_();
  const it = root.getFoldersByName('カメラ' + cam);
  return it.hasNext() ? it.next() : root.createFolder('カメラ' + cam);
}

// 最初に一度だけ実行して、ドライブの許可を出すための関数
function setup() {
  const f = rootFolder_();
  Logger.log('保存先フォルダ: ' + f.getUrl());
}
