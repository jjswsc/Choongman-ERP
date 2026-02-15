/* =================================================================
   시트 → Supabase 일괄 임포트
   사용법:
   1. 스프레드시트에 시트 추가 (이름 예: SupabaseImport)
   2. A1에 테이블명 입력 (예: store_visits, employees, vendors)
   3. 1행에 컬럼 헤더 (Supabase 컬럼명과 동일)
   4. 2행부터 데이터 붙여넣기 (CSV에서 복사 후 시트에 Paste)
   5. 확장프로그램 > Supabase 임포트 > 시트에서 Supabase로 넣기
   ================================================================= */

var SHEET_NAME_IMPORT = 'SupabaseImport';  // 기본 시트명 (없으면 현재 시트 사용)
var BATCH_SIZE = 100;  // 한 번에 넣는 행 수

/**
 * 커스텀 메뉴 추가
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Supabase 임포트')
    .addItem('시트에서 Supabase로 넣기', 'runImportFromSheet')
    .addItem('시트 골라서 넣기...', 'runImportChooseSheet')
    .addSeparator()
    .addItem('백업하기 (테이블→시트)', 'runBackupToSheet')
    .addItem('복원하기 (시트→테이블)', 'runRestoreFromSheet')
    .addSeparator()
    .addItem('미리보기 (실행 안 함)', 'previewImport')
    .addToUi();
}

/**
 * 시트를 골라서 Supabase로 일괄 삽입
 */
function runImportChooseSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  if (sheets.length === 0) {
    SpreadsheetApp.getUi().alert('시트가 없습니다.');
    return;
  }
  var options = sheets.map(function(s) { return s.getName(); });
  var ui = SpreadsheetApp.getUi();
  var prompt = '넣을 시트 이름을 입력하세요:\n\n' + options.join('\n');
  var resp = ui.prompt('시트 선택', prompt, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var sheetName = (resp.getResponseText() || '').trim();
  if (!sheetName) return;
  var targetSheet = ss.getSheetByName(sheetName);
  if (!targetSheet) {
    ui.alert('시트를 찾을 수 없습니다: ' + sheetName);
    return;
  }
  _doImport(targetSheet);
}

/**
 * 시트 데이터를 Supabase로 일괄 삽입 (현재 활성 시트 또는 SupabaseImport 시트 사용)
 */
function runImportFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_IMPORT) || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  _doImport(sheet);
}

/**
 * 지정한 시트를 Supabase로 삽입
 */
function _doImport(sheet) {
  var ui = SpreadsheetApp.getUi();
  var result = _readSheetData(sheet);
  if (!result) return;

  var table = result.table;
  var rows = result.rows;
  if (!rows || rows.length === 0) {
    ui.alert('넣을 데이터가 없습니다. 2행 이후에 데이터를 넣어 주세요.');
    return;
  }

  var confirm = ui.alert(
    'Supabase 임포트',
    '테이블 [' + table + ']에 ' + rows.length + '행을 넣습니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var inserted = 0;
  var errors = [];

  for (var i = 0; i < rows.length; i += BATCH_SIZE) {
    var chunk = rows.slice(i, i + BATCH_SIZE);
    try {
      supabaseInsertMany(table, chunk);
      inserted += chunk.length;
      if (rows.length > BATCH_SIZE) {
        SpreadsheetApp.flush();
        Utilities.sleep(200); // API 부하 분산
      }
    } catch (e) {
      errors.push('행 ' + (i + 2) + '~' + Math.min(i + BATCH_SIZE + 1, rows.length + 1) + ': ' + e.message);
    }
  }

  var msg = inserted + '행 삽입 완료.';
  if (errors.length > 0) {
    msg += '\n\n오류:\n' + errors.slice(0, 5).join('\n');
    if (errors.length > 5) msg += '\n... 외 ' + (errors.length - 5) + '건';
  }
  ui.alert(msg);
}

/**
 * 백업하기: Supabase 테이블 → 새 시트로 저장 (업로드 전에 실행 권장)
 */
function runBackupToSheet() {
  var ui = SpreadsheetApp.getUi();
  var table = (ui.prompt('백업할 테이블명을 입력하세요', '예: store_visits, employees, vendors', ui.ButtonSet.OK_CANCEL).getResponseText() || '').trim();
  if (!table) return;

  try {
    var rows = supabaseSelect(table, { limit: 5000 });
    if (!rows || rows.length === 0) {
      ui.alert('테이블 [' + table + ']에 데이터가 없습니다.');
      return;
    }

    var headers = Object.keys(rows[0]);
    var sheetName = 'Backup_' + table + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.insertSheet(sheetName);

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    var data = rows.map(function(r) { return headers.map(function(h) { return r[h] != null ? r[h] : ''; }); });
    if (data.length > 0) sheet.getRange(2, 1, data.length + 1, headers.length).setValues(data);

    sheet.activate();
    ui.alert('백업 완료: 시트 [' + sheetName + ']에 ' + rows.length + '행 저장됨.');
  } catch (e) {
    ui.alert('백업 오류: ' + e.message);
  }
}

/**
 * 복원하기: 백업 시트 선택 → Supabase 테이블 덮어쓰기 (잘못 업로드했을 때)
 */
function runRestoreFromSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var options = sheets.map(function(s) { return s.getName(); }).filter(function(n) { return n.indexOf('Backup_') === 0; });
  if (options.length === 0) {
    SpreadsheetApp.getUi().alert('Backup_ 로 시작하는 시트가 없습니다. 먼저 백업하기를 실행하세요.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var prompt = '복원할 백업 시트 이름을 입력하세요:\n\n' + options.join('\n');
  var resp = ui.prompt('복원 (시트 선택)', prompt, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var sheetName = (resp.getResponseText() || '').trim();
  if (!sheetName) return;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    ui.alert('시트를 찾을 수 없습니다: ' + sheetName);
    return;
  }

  var table = sheetName.replace(/^Backup_/, '').replace(/_\d{8}_\d{4}$/, '');
  var confirm = ui.alert('복원', '[' + table + '] 테이블을 이 백업으로 덮어씁니다. 기존 데이터는 삭제됩니다. 계속할까요?', ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  try {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) {
      ui.alert('백업 시트에 데이터가 없습니다.');
      return;
    }
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
    var raw = sheet.getRange(2, 1, lastRow, lastCol).getValues();
    var rows = raw.map(function(r) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = r[c] != null && r[c] !== '' ? r[c] : '';
      return obj;
    });

    var existing = supabaseSelect(table, { limit: 5000 }) || [];
    var ids = [];
    for (var ei = 0; ei < existing.length; ei++) { if (existing[ei].id !== undefined && existing[ei].id !== null) ids.push(existing[ei].id); }
    if (ids.length > 0) {
      for (var i = 0; i < ids.length; i += 100) {
        var chunk = ids.slice(i, i + 100);
        var inVals = chunk.map(function(id) {
          if (typeof id === 'number') return id;
          var s = String(id);
          if (/^-?\d+$/.test(s)) return s;
          return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        });
        var filter = 'id=in.(' + inVals.join(',') + ')';
        supabaseDeleteByFilter(table, filter);
        Utilities.sleep(100);
      }
    }

    for (var j = 0; j < rows.length; j += BATCH_SIZE) {
      var chunk = rows.slice(j, j + BATCH_SIZE);
      supabaseInsertMany(table, chunk);
      if (rows.length > BATCH_SIZE) Utilities.sleep(200);
    }
    ui.alert('복원 완료: ' + rows.length + '행이 [' + table + ']에 적용되었습니다.');
  } catch (e) {
    ui.alert('복원 오류: ' + e.message);
  }
}

/**
 * 미리보기: 넣을 데이터 확인 (실제 삽입 없음)
 */
function previewImport() {
  var result = _readSheetData();
  if (!result) return;

  var table = result.table;
  var rows = result.rows;
  var headers = result.headers;

  var msg = '테이블: ' + table + '\n컬럼: ' + headers.join(', ') + '\n행 수: ' + (rows ? rows.length : 0);
  if (rows && rows.length > 0) {
    msg += '\n\n첫 행 예시:\n' + JSON.stringify(rows[0], null, 2);
  }
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * 시트에서 테이블명, 헤더, 데이터 읽기
 * @param {GoogleAppsScript.Spreadsheet.Sheet} optSheet - 지정 시트 (없으면 SupabaseImport 또는 활성 시트)
 */
function _readSheetData(optSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = optSheet || ss.getSheetByName(SHEET_NAME_IMPORT) || ss.getActiveSheet();

  var table = (sheet.getRange('A1').getValue() || '').toString().trim();
  if (!table) {
    SpreadsheetApp.getUi().alert('A1 셀에 Supabase 테이블명을 입력해 주세요.\n예: store_visits, employees, vendors');
    return null;
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('1행에 컬럼 헤더, 2행부터 데이터를 넣어 주세요.');
    return null;
  }

  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  var headers = headerRange.getValues()[0].map(function(h) { return String(h || '').trim(); });
  var colsToUse = [];
  for (var c = 0; c < headers.length; c++) {
    if (headers[c]) colsToUse.push(c);
  }
  if (colsToUse.length === 0) {
    SpreadsheetApp.getUi().alert('1행에 컬럼명을 넣어 주세요.');
    return null;
  }

  var dataRange = sheet.getRange(2, 1, lastRow, lastCol);
  var raw = dataRange.getValues();
  var rows = [];

  for (var r = 0; r < raw.length; r++) {
    var row = raw[r];
    var isEmpty = true;
    var obj = {};
    for (var i = 0; i < colsToUse.length; i++) {
      var col = colsToUse[i];
      var key = headers[col];
      var val = row[col];
      if (val !== '' && val !== null && val !== undefined) isEmpty = false;
      obj[key] = _toDbValue(val);
    }
    if (!isEmpty) {
      if (table === 'store_visits' && (!obj.id || obj.id === '')) {
        obj.id = 'V' + Date.now() + '_' + r;
      }
      rows.push(obj);
    }
  }

  return { table: table, headers: headers.filter(function(h, i) { return colsToUse.indexOf(i) >= 0; }), rows: rows };
}

/**
 * 시트 값을 DB에 넣기 적합한 형태로 변환
 */
function _toDbValue(val) {
  if (val === '' || val === null || val === undefined) return '';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val;
  var s = String(val).trim();
  if (s === '') return '';
  // 날짜 형식 보정 (시트에서 2024-01-15 등)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}
