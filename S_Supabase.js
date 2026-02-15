/* =================================================================
   Supabase REST API 공통 레이어 (Google Apps Script)
   Script Properties 에 다음 키 설정 필요:
   - SUPABASE_URL: https://xxxx.supabase.co
   - SUPABASE_ANON_KEY: eyJhbG...
   ================================================================= */

function getSupabaseConfig() {
  var url = (PropertiesService.getScriptProperties().getProperty('SUPABASE_URL') || '').trim();
  var key = PropertiesService.getScriptProperties().getProperty('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL 또는 SUPABASE_ANON_KEY가 Script Properties에 없습니다.');
  // 올바른 Supabase URL이 아니면 보정: 프로젝트 ID만 있거나 http://id 형태 → https://id.supabase.co
  if (!url.includes('.supabase.co')) {
    var projectId = url.replace(/^https?:\/\//, '').split(/[/?#]/)[0].trim();
    url = 'https://' + projectId + '.supabase.co';
  }
  url = url.replace(/\/$/, '').replace(/^http:\/\//, 'https://');
  return { url: url, key: key };
}

function _supabaseHeaders(config) {
  return {
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

/** SELECT: 테이블에서 조건 없이 또는 filter로 조회 */
function supabaseSelect(table, options) {
  var config = getSupabaseConfig();
  var base = config.url + '/rest/v1/' + encodeURIComponent(table);
  var query = [];
  if (options && options.select) query.push('select=' + options.select);
  else query.push('select=*');
  if (options && options.order) query.push('order=' + encodeURIComponent(options.order));
  if (options && options.limit) query.push('limit=' + Number(options.limit));
  if (options && options.offset) query.push('offset=' + Number(options.offset));
  if (options && options.filter) query.push(options.filter);
  var url = base + (query.length ? '?' + query.join('&') : '');
  var headers = { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key };
  // PostgREST 기본 행 제한(일부 환경 100행) 회피 — 최대 2000행까지 요청
  if (!options || options.limit === undefined) headers['Range'] = '0-1999';
  else headers['Range'] = '0-' + (Number(options.limit) - 1);
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: headers });
  return JSON.parse(res.getContentText());
}

/** INSERT: 한 행 추가, 반환값에 id 포함하려면 Prefer 사용 */
function supabaseInsert(table, row) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: _supabaseHeaders(config),
    payload: JSON.stringify(row),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase insert failed: ' + res.getContentText());
  var text = res.getContentText();
  return text ? JSON.parse(text) : [];
}

/** INSERT 여러 행 */
function supabaseInsertMany(table, rows) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: _supabaseHeaders(config),
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase insert many failed: ' + res.getContentText());
  var text = res.getContentText();
  return text ? JSON.parse(text) : [];
}

/** UPSERT 여러 행 (충돌 시 기존 행 갱신). onConflict: UNIQUE 컬럼 문자열 예: "store,code" */
function supabaseUpsertMany(table, rows, onConflict) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);
  if (onConflict) url += '?on_conflict=' + encodeURIComponent(onConflict);
  var headers = _supabaseHeaders(config);
  headers['Prefer'] = 'return=representation, resolution=merge-duplicates';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase upsert many failed: ' + res.getContentText());
  var text = res.getContentText();
  return text ? JSON.parse(text) : [];
}

/** UPDATE: id로 한 행 수정 */
function supabaseUpdate(table, id, patch) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table) + '?id=eq.' + encodeURIComponent(id);
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: _supabaseHeaders(config),
    payload: JSON.stringify(patch),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase update failed: ' + res.getContentText());
  return true;
}

/** UPDATE: filter 조건으로 수정 (예: order_id=eq.123) */
function supabaseUpdateByFilter(table, filter, patch) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table) + '?' + filter;
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key, 'Content-Type': 'application/json' },
    payload: JSON.stringify(patch),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase update failed: ' + res.getContentText());
  return true;
}

/** DELETE: id로 한 행 삭제 */
function supabaseDelete(table, id) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table) + '?id=eq.' + encodeURIComponent(id);
  var res = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase delete failed: ' + res.getContentText());
  return true;
}

/** DELETE: filter 조건으로 삭제 (예: "id=in.(1,2,3)" 또는 "store_name=eq.A") */
function supabaseDeleteByFilter(table, filter) {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table) + '?' + filter;
  var res = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('Supabase delete failed: ' + res.getContentText());
  return true;
}

/** RPC 또는 raw filter 조회 (filter 예: "store_name=eq.StoreA") */
function supabaseSelectFilter(table, filter, options) {
  var config = getSupabaseConfig();
  var base = config.url + '/rest/v1/' + encodeURIComponent(table);
  var query = ['select=*', filter];
  if (options && options.order) query.push('order=' + encodeURIComponent(options.order));
  if (options && options.limit) query.push('limit=' + Number(options.limit));
  var url = base + '?' + query.join('&');
  var headers = { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key };
  var maxEnd = (options && options.limit) ? Number(options.limit) - 1 : 1999;
  headers['Range'] = '0-' + maxEnd;
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: headers });
  return JSON.parse(res.getContentText());
}
