/* =================================================================
   시스템 엔진 및 공통 기능
   ================================================================= */

/* 관리자/앱 페이지 접속 분기 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (params.path === 'manifest') {
    try {
      var base = (typeof ScriptApp !== 'undefined' && ScriptApp.getService()) ? ScriptApp.getService().getUrl() : '';
      var iconDataUri = '';
      try {
        var iconB64 = HtmlService.createTemplateFromFile('IconData').evaluate().getContent();
        if (iconB64 && iconB64.trim()) iconDataUri = 'data:image/png;base64,' + iconB64.trim();
      } catch (iconErr) {}
      if (!iconDataUri) iconDataUri = 'https://via.placeholder.com/192x192/E65100/ffffff?text=CM';
      var manifest = {
        name: '충만치킨 ERP',
        short_name: '충만 ERP',
        description: '충만치킨 매장/본사 업무 앱',
        start_url: base,
        scope: base ? base.replace(/\?.*$/, '') : '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#E65100',
        background_color: '#E65100',
        icons: [
          { src: iconDataUri, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: iconDataUri, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: iconDataUri, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: iconDataUri, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      };
      return ContentService.createTextOutput(JSON.stringify(manifest))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ name: '충만치킨 ERP', short_name: '충만 ERP', display: 'standalone', theme_color: '#E65100', background_color: '#E65100' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (params.page == 'admin') {
    return HtmlService.createTemplateFromFile('Logistics').evaluate().setTitle('Choongman HQ Admin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Page').evaluate().setTitle('Choongman Store App').addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no');
}

/* 로그인 시 직원/거래처 목록 로드 (Supabase employees, vendors) */
function getLoginData() {
  try {
    var empList = supabaseSelect('employees', { order: 'id.asc' });
    var userMap = {};
    for (var i = 0; i < empList.length; i++) {
      var store = String(empList[i].store || '').trim();
      var name = String(empList[i].name || '').trim();
      if (store && name) {
        if (!userMap[store]) userMap[store] = [];
        userMap[store].push(name);
      }
    }
    var vendorRows = supabaseSelect('vendors', { order: 'id.asc' });
    var vendorList = [];
    for (var v = 0; v < vendorRows.length; v++) {
      var n = String(vendorRows[v].name || '').trim();
      if (n) vendorList.push(n);
    }
    return { users: userMap, vendors: vendorList };
  } catch (e) {
    Logger.log('getLoginData: ' + e.message);
    return { users: {}, vendors: [] };
  }
}

/** 직원 목록 Supabase에서 조회 (시트 대신 사용하는 곳용). 반환: [{ store, name, ..., email, annual_leave_days, bank_name, account_number, position_allowance, grade, photo }, ...] */
function getEmployeesData() {
  try {
    return supabaseSelect('employees', { order: 'id.asc' }) || [];
  } catch (e) {
    Logger.log('getEmployeesData: ' + e.message);
    return [];
  }
}

/* 권한 확인 및 로그인 승인 (Supabase employees). isAdminPage: true=관리자(오피스/매니저만), false=모바일(전 직원) */
function loginCheck(store, name, pw, isAdminPage) {
  var iStore = String(store || '').trim();
  var iName = String(name || '').trim();
  var iPw = String(pw || '').trim();
  if (!iStore || !iName) return { success: false, message: "Login Failed" };
  try {
    var filter = "store=eq." + encodeURIComponent(iStore) + "&name=eq." + encodeURIComponent(iName);
    var rows = supabaseSelectFilter('employees', filter);
    if (!rows || rows.length === 0) return { success: false, message: "Login Failed" };
    var row = rows[0];
    var sheetPw = String(row.password || '').trim();
    if (sheetPw !== iPw) return { success: false, message: "Login Failed" };
    var rawRole = String(row.role || '').toLowerCase().replace(/\./g, '');
    var finalRole = "staff";
    if (rawRole.includes("director") || rawRole.includes("ceo") || rawRole.includes("대표")) finalRole = "director";
    else if (rawRole.includes("officer") || rawRole.includes("총괄") || rawRole.includes("오피스")) finalRole = "officer";
    else if (rawRole.includes("manager") || rawRole.includes("점장") || rawRole.includes("매니저")) finalRole = "manager";
    var storeCol = String(row.store || '').trim();
    // Director/C.E.O는 매장이 Office여도 director 유지 (Office 직원·급여 조회 가능). 그 외 Office 소속만 officer로 처리
    if ((storeCol === "Office" || storeCol === "본사" || storeCol === "오피스" || storeCol.toLowerCase() === "office") && finalRole !== "director") finalRole = "officer";
    if (isAdminPage !== false && finalRole !== "director" && finalRole !== "officer" && finalRole !== "manager")
      return { success: false, message: "권한 없음" };
    return { success: true, storeName: row.store, userName: row.name, role: finalRole };
  } catch (e) {
    Logger.log('loginCheck: ' + e.message);
    return { success: false, message: "Login Failed" };
  }
}

/** 자기 비밀번호 변경 (Supabase employees). store, name, oldPw 일치 시 새 비밀번호로 갱신 */
function changePassword(store, name, oldPw, newPw) {
  var iStore = String(store || "").trim();
  var iName = String(name || "").trim();
  var iOld = String(oldPw || "").trim();
  var iNew = String(newPw || "").trim();
  if (!iNew) return "새 비밀번호를 입력하세요.";
  try {
    var filter = "store=eq." + encodeURIComponent(iStore) + "&name=eq." + encodeURIComponent(iName);
    var rows = supabaseSelectFilter('employees', filter);
    if (!rows || rows.length === 0) return "일치하는 계정을 찾을 수 없습니다.";
    var row = rows[0];
    if (String(row.password || '').trim() !== iOld) return "현재 비밀번호가 일치하지 않습니다.";
    supabaseUpdate('employees', row.id, { password: iNew });
    return "비밀번호가 변경되었습니다. 다시 로그인해 주세요.";
  } catch (e) {
    Logger.log('changePassword: ' + e.message);
    return "일치하는 계정을 찾을 수 없습니다.";
  }
}

/*앱 초기 구동 시 데이터 묶음 전송 */
function getAppData(storeName) {
  var items = [];
  var stock = {};
  if (typeof getItems === "function") {
    try {
      items = getItems(storeName) || [];
    } catch (e) {
      Logger.log("getAppData getItems(storeName) error: " + e.message + " store=" + storeName);
      try {
        items = getItems("") || getItems(null) || [];
      } catch (e2) {
        Logger.log("getAppData getItems fallback error: " + e2.message);
      }
    }
    // silom 등 특정 매장에서 품목이 비어 오는 경우: 매장 없이 품목만 다시 조회
    if (items.length === 0) {
      try {
        var fallback = getItems("") || getItems(null) || [];
        if (fallback.length > 0) {
          items = fallback;
          Logger.log("getAppData: empty items for store=" + storeName + ", used fallback count=" + fallback.length);
        }
      } catch (e3) { /* no-op */ }
    }
  }
  if (typeof getStoreStock === "function") {
    try {
      stock = getStoreStock(storeName) || {};
    } catch (e) {
      Logger.log("getAppData getStoreStock error: " + e.message + " store=" + storeName);
    }
  }
  return { items: items, stock: stock };
}

/* Supabase vendors 기반 매장 목록 추출 (gps_name 우선, 없으면 name) */
function getStoreListFromK() {
  var list = [];
  var seen = {};
  try {
    var rows = supabaseSelect("vendors", { limit: 2000 });
    for (var i = 0; i < (rows || []).length; i++) {
      var gpsName = String(rows[i].gps_name || "").trim();
      var name = String(rows[i].name || "").trim();
      var val = gpsName || name;
      if (val && !seen[val]) {
        seen[val] = true;
        list.push(val);
      }
    }
  } catch (e) {
    Logger.log("getStoreListFromK: " + e.message);
  }
  return list;
}

/**
 * [공통 도구] 위치 기반 검증용 거리 계산 함수 (Haversine 공식)
 * @param {number} lat1, lon1 - 매장의 좌표 (Supabase vendors lat/lng)
 * @param {number} lat2, lon2 - 직원의 현재 좌표 (GPS)
 * @returns {number} - 두 지점 사이의 거리 (미터 단위)
 */
function calcDistance(lat1, lon1, lat2, lon2) {
  var R = 6371e3; // 지구의 반지름 (미터 단위: 6,371,000m)
  
  // 1. 위도/경도를 라디안(radian) 단위로 변환
  var radLat1 = lat1 * Math.PI / 180;
  var radLat2 = lat2 * Math.PI / 180;
  var diffLat = (lat2 - lat1) * Math.PI / 180;
  var diffLon = (lon2 - lon1) * Math.PI / 180;

  // 2. 하버사인 공식 계산
  var a = Math.sin(diffLat/2) * Math.sin(diffLat/2) +
          Math.cos(radLat1) * Math.cos(radLat2) *
          Math.sin(diffLon/2) * Math.sin(diffLon/2);
          
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // 최종 거리 결과값 (미터 단위)
}

/* [D] 공통 데이터 */
function getNotice() { return PropertiesService.getScriptProperties().getProperty("SYSTEM_NOTICE") || "공지사항 없음"; }

/* =================================================================
   사용자 입력 글 자동 번역 (LanguageApp 내장 - API 키 불필요)
   ================================================================= */
/**
 * 단일 텍스트를 목표 언어로 번역 (원본이 비어있으면 빈 문자열 반환)
 * @param {string} text - 원문
 * @param {string} targetLang - 목표 언어 코드 (ko, en, th, my, lo 등)
 * @returns {string} 번역문 (실패 시 원문)
 */
function getAutoTranslation(text, targetLang) {
  if (!text || !String(text).trim()) return "";
  try {
    return LanguageApp.translate(String(text).trim(), "", targetLang);
  } catch (e) {
    return text;
  }
}

/**
 * 여러 텍스트를 한 번에 목표 언어로 번역 (배치 호출로 효율화)
 * @param {string[]} texts - 원문 배열
 * @param {string} targetLang - 목표 언어 코드 (ko, en, th, my, lo)
 * @returns {string[]} 번역문 배열 (실패한 항목은 원문 유지)
 */
function translateBatch(texts, targetLang) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) return [];
  var lang = (targetLang && String(targetLang).trim()) ? String(targetLang).trim() : "ko";
  var result = [];
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    if (!t || !String(t).trim()) {
      result.push("");
      continue;
    }
    try {
      result.push(LanguageApp.translate(String(t).trim(), "", lang));
    } catch (e) {
      result.push(t);
    }
  }
  return result;
}

/**
 * 대시보드 요약 숫자 (미승인 주문, 입고/출고 건수, 휴가·근태 대기)
 * @param {string} userStore - 로그인 사용자 매장
 * @param {string} userRole - director | officer | manager | staff
 */
function getDashboardSummary(userStore, userRole) {
  var result = { pendingOrders: 0, inboundCount: 0, outboundCount: 0, leavePending: 0, attendancePending: 0 };
  var now = new Date();
  var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  var startStr = Utilities.formatDate(firstDay, "GMT+7", "yyyy-MM-dd");
  var endStr = Utilities.formatDate(lastDay, "GMT+7", "yyyy-MM-dd");
  var isDirector = (userRole && String(userRole).toLowerCase().indexOf("director") !== -1);
  var isOfficer = (userRole && String(userRole).toLowerCase().indexOf("officer") !== -1);
  var showAllStores = isDirector || isOfficer;

  try {
    if (typeof getAdminOrders === "function") {
      var orders = getAdminOrders(startStr, endStr);
      for (var i = 0; i < orders.length; i++) {
        if (orders[i].status === "Pending" || orders[i].status === "대기") {
          if (showAllStores || String(orders[i].store || "") === String(userStore || "")) result.pendingOrders++;
        }
      }
    }
  } catch (e) {}

  try {
    if (typeof getInboundHistory === "function") {
      var inList = getInboundHistory(startStr, endStr, "All");
      result.inboundCount = inList ? inList.length : 0;
    }
  } catch (e) {}

  try {
    if (typeof getOutboundHistory === "function") {
      var outFilter = showAllStores ? "All" : (userStore || "All");
      var outList = getOutboundHistory(startStr, endStr, outFilter);
      result.outboundCount = outList ? outList.length : 0;
    }
  } catch (e) {}

  try {
    if (typeof getLeaveAllData === "function") {
      var leaveData = getLeaveAllData();
      var leaves = (leaveData && leaveData.leaves) ? leaveData.leaves : [];
      for (var j = 0; j < leaves.length; j++) {
        var st = String(leaves[j].status || "").trim();
        if (st === "대기" || st === "Pending" || st === "") {
          if (showAllStores || String(leaves[j].store || "") === String(userStore || "")) result.leavePending++;
        }
      }
    }
  } catch (e) {}

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var attSheet = ss.getSheetByName("근태기록");
    if (attSheet && attSheet.getLastRow() > 1) {
      var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
      var numCols = Math.max(attSheet.getLastColumn(), 14);
      var attData = attSheet.getRange(2, 1, attSheet.getLastRow(), numCols).getValues();
      var attDisplay = attSheet.getRange(2, 1, attSheet.getLastRow(), numCols).getDisplayValues();
      var todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
      for (var k = 0; k < attData.length; k++) {
        var row = attData[k];
        var rowDate = row[0];
        if (rowDate == null) continue;
        var rowDateStr = "";
        try { rowDateStr = Utilities.formatDate(new Date(rowDate), tz, "yyyy-MM-dd"); } catch (err) {}
        if (!rowDateStr && attDisplay[k] && attDisplay[k][0] != null) {
          var disp0 = String(attDisplay[k][0]).trim();
          if (disp0.length >= 8) {
            var dm = disp0.match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
            if (dm) rowDateStr = dm[1] + "-" + ("0" + dm[2]).slice(-2) + "-" + ("0" + dm[3]).slice(-2);
          }
        }
        if (rowDateStr !== todayStr) continue;
        var approval = (row[13] != null && row[13] !== "") ? String(row[13]).trim() : "";
        var status = (row[12] != null) ? String(row[12]).trim() : "";
        var isPending = (approval !== "승인완료" && approval !== "반려") ||
          (status.indexOf("위치미확인") !== -1 || status.indexOf("승인대기") !== -1);
        if (isPending) {
          var rowStore = String(row[1] || "").trim();
          if (showAllStores || rowStore === String(userStore || "")) result.attendancePending++;
        }
      }
    }
  } catch (e) {}

  return result;
}

