/**
 * マット・跳び箱 技ビデオ — Google Apps Script 側
 *
 * iPadのカメラで撮った映像を、このスクリプトを作った先生のGoogleドライブの
 * 「技ビデオ」フォルダ（クラスごとのサブフォルダ）に保存します。
 */

// ===== 設定 =====
const ROOT_FOLDER_NAME = '技ビデオ';
// true にすると「技ビデオ」フォルダを学校のドメイン内で閲覧できるよう共有します（別の端末で見るため）
const SHARE_IN_DOMAIN = true;
// 技の選択肢の初期値（アプリの「技の選択肢を編集」で変えられます）
const DEFAULT_SKILLS = {
  mat: ['前転', '後転', '開脚前転', '開脚後転', '伸膝後転', '倒立前転', '側方倒立回転', 'ロンダート', '首はねおき', '頭はねおき', 'ハンドスプリング'],
  vault: ['開脚跳び', 'かかえ込み跳び', '屈身跳び', '台上前転', '伸膝台上前転', '首はね跳び', '頭はね跳び', '前方屈腕倒立回転跳び']
};
// ================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('技ビデオ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ----- アプリから呼ばれる関数 -----

function getConfig() {
  return {
    url: ScriptApp.getService().getUrl(),
    folderUrl: rootFolder_().getUrl(),
    canManage: isOwner_(),
    skills: getSkills_()
  };
}

function saveSkills(skills) {
  requireOwner_();
  const clean = function (list) {
    const seen = {};
    return (list || []).map(function (s) { return String(s || '').trim().slice(0, 30); })
      .filter(function (s) { if (!s || seen[s]) return false; seen[s] = true; return true; })
      .slice(0, 60);
  };
  const data = { mat: clean(skills && skills.mat), vault: clean(skills && skills.vault) };
  PropertiesService.getScriptProperties().setProperty('SKILLS', JSON.stringify(data));
  return data;
}

function uploadClip(meta, base64, mimeType) {
  meta = meta || {};
  const clean = function (s) { return String(s || '').replace(/[\\/:*?"<>|\n\r]/g, ' ').trim().slice(0, 40); };
  const cls = clean(meta.cls) || 'クラスなし';
  const takenAt = Number(meta.takenAt) || Date.now();
  const type = String(mimeType || 'video/mp4').split(';')[0];
  const ext = type.indexOf('quicktime') >= 0 ? 'mov' : type.indexOf('webm') >= 0 ? 'webm' : 'mp4';
  const stamp = Utilities.formatDate(new Date(takenAt), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const name = [stamp, cls, clean(meta.skill), clean(meta.student)].filter(String).join('_') + '.' + ext;
  const info = {
    cls: cls,
    camera: parseInt(meta.camera, 10) || 0,
    event: meta.event === 'vault' ? 'vault' : 'mat',
    skill: clean(meta.skill) || '（技名なし）',
    student: clean(meta.student),
    takenAt: takenAt
  };
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), type, name);
  const file = subFolder_(cls).createFile(blob);
  file.setDescription(JSON.stringify(info));
  return { id: file.getId(), name: name };
}

function listClips() {
  const out = [];
  const folders = rootFolder_().getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    const files = f.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      let info = {};
      try { info = JSON.parse(file.getDescription() || '{}'); } catch (e) {}
      out.push({
        id: file.getId(),
        cls: info.cls || f.getName(),
        camera: info.camera || 0,
        event: info.event || 'mat',
        skill: info.skill || file.getName(),
        student: info.student || '',
        takenAt: info.takenAt || file.getDateCreated().getTime(),
        sizeBytes: file.getSize()
      });
    }
  }
  out.sort(function (a, b) { return b.takenAt - a.takenAt; });
  return out.slice(0, 1000);
}

function updateClip(id, patch) {
  requireOwner_();
  const file = DriveApp.getFileById(id);
  let info = {};
  try { info = JSON.parse(file.getDescription() || '{}'); } catch (e) {}
  if (patch.skill !== undefined) info.skill = String(patch.skill).trim().slice(0, 40) || '（技名なし）';
  if (patch.student !== undefined) info.student = String(patch.student).trim().slice(0, 40);
  if (patch.event) info.event = patch.event === 'vault' ? 'vault' : 'mat';
  file.setDescription(JSON.stringify(info));
  return true;
}

function deleteClip(id) {
  requireOwner_();
  DriveApp.getFileById(id).setTrashed(true); // ドライブのゴミ箱へ（30日以内なら戻せます）
  return true;
}

// ----- 内部 -----

function getSkills_() {
  try {
    const s = JSON.parse(PropertiesService.getScriptProperties().getProperty('SKILLS') || 'null');
    if (s && s.mat && s.vault) return s;
  } catch (e) {}
  return DEFAULT_SKILLS;
}

function isOwner_() {
  const me = Session.getActiveUser().getEmail();
  return !!me && me === Session.getEffectiveUser().getEmail();
}

function requireOwner_() {
  if (!isOwner_()) throw new Error('この操作は、アプリを作った先生のアカウントだけができます');
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

function subFolder_(name) {
  const root = rootFolder_();
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// 最初に一度だけ実行して、ドライブの許可を出すための関数
function setup() {
  Logger.log('保存先フォルダ: ' + rootFolder_().getUrl());
}
