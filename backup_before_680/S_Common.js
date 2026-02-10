/* =================================================================
   시스템 엔진 및 공통 기능
   ================================================================= */

/* 관리자/앱 페이지 접속 분기 */
function doGet(e) {
  if (e && e.parameter && e.parameter.page == 'admin') {
    return HtmlService.createTemplateFromFile('Logistics').evaluate().setTitle('Choongman HQ Admin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Page').evaluate().setTitle('Choongman Store App').addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no');
}

/* 로그인 시 직원/거래처 목록 로드 */
function getLoginData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  if (!s) return { users: {}, vendors: [] };
  var d = s.getDataRange().getValues();
  var userMap = {};
  
  // 거래처 목록
  var vSheet = ss.getSheetByName("거래처");
  var vendorList = [];
  if (vSheet && vSheet.getLastRow() > 1) {
    // C열(회사명) 가져오기 (A:구분, B:코드, C:회사명)
    var vData = vSheet.getRange(2, 3, vSheet.getLastRow()-1, 1).getValues().flat();
    vendorList = vData.filter(function(v){ return v && String(v).trim() !== ""; });
  }

  // 직원 목록
  for (var i = 1; i < d.length; i++) {
    var store = String(d[i][0]).trim();
    var name = String(d[i][1]).trim();
    if (store && name) {
      if (!userMap[store]) userMap[store] = [];
      userMap[store].push(name);
    }
  }
  return { users: userMap, vendors: vendorList };
}

/* 권한 확인 및 로그인 승인 */
function loginCheck(store, name, pw) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  var d = s.getDataRange().getValues();
  var iStore = String(store).trim(); var iName = String(name).trim(); var iPw = String(pw).trim();

  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() == iStore && String(d[i][1]).trim() == iName && String(d[i][11]).trim() == iPw) {
      var rawRole = String(d[i][12]).toLowerCase().replace(/\./g, ''); 
      var finalRole = "staff";
      if (rawRole.includes("director") || rawRole.includes("ceo") || rawRole.includes("대표")) finalRole = "director"; 
      else if (rawRole.includes("officer") || rawRole.includes("총괄")) finalRole = "officer"; 
      else if (rawRole.includes("manager") || rawRole.includes("점장")) finalRole = "manager"; 
      return { success: true, storeName: d[i][0], userName: d[i][1], role: finalRole };
    }
  }
  return { success: false, message: "Login Failed" };
}

/*앱 초기 구동 시 데이터 묶음 전송 */
function getAppData(storeName) {
  return {
    items: getItems(storeName),      // 품목 목록 (getItems 함수를 빌려씀)
    stock: getStoreStock(storeName)  // 재고 목록 (getStoreStock 함수를 빌려씀)
  };
}

/* 거래처 시트 기반 매장 목록 추출 */
function getStoreListFromK() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("거래처");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var list = [];
  
  // 2행부터 데이터 확인
  for (var i = 1; i < data.length; i++) {
    // K열은 인덱스 10입니다 (A=0, B=1, ... K=10)
    var kValue = data[i][10]; 
    
    // 값이 있고(빈칸 아님), 리스트에 아직 없는 경우만 추가 (중복제거)
    if (kValue && String(kValue).trim() !== "" && list.indexOf(kValue) === -1) {
      list.push(kValue);
    }
  }
  
  return list;
}

/**
 * [공통 도구] 위치 기반 검증용 거리 계산 함수 (Haversine 공식)
 * @param {number} lat1, lon1 - 매장의 좌표 (거래처 시트 정보)
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
  if (!targetLang || targetLang === "ko") return texts;
  var result = [];
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    if (!t || !String(t).trim()) {
      result.push("");
      continue;
    }
    try {
      result.push(LanguageApp.translate(String(t).trim(), "", targetLang));
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
      var tz = ss.getSpreadsheetTimeZone();
      var attData = attSheet.getDataRange().getValues();
      var todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
      for (var k = 1; k < attData.length; k++) {
        var row = attData[k];
        var rowDate = row[0];
        if (!rowDate) continue;
        var rowDateStr = "";
        try { rowDateStr = Utilities.formatDate(new Date(rowDate), tz, "yyyy-MM-dd"); } catch (err) {}
        if (rowDateStr !== todayStr) continue;
        var approval = (row[13] != null) ? String(row[13]).trim() : "";
        if (approval !== "승인완료" && approval !== "반려") {
          var rowStore = String(row[1] || "").trim();
          if (showAllStores || rowStore === String(userStore || "")) result.attendancePending++;
        }
      }
    }
  } catch (e) {}

  return result;
}

/**
 * 매장별 간단 KPI (대시보드용)
 * @param {string} userStore - 로그인 사용자 매장
 * @param {string} userRole - director | officer | manager | staff
 * @returns {Array<{store:string, pendingOrders:number, outboundCount:number, leavePending:number, attendancePending:number}>}
 */
function getDashboardStoreKPIs(userStore, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  var storeSet = {};
  if (empSheet) {
    var d = empSheet.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var s = String(d[i][0] || "").trim();
      if (s && s !== "매장명" && s !== "Store" && s !== "본사" && s.toLowerCase().indexOf("office") === -1)
        storeSet[s] = true;
    }
  }
  var isDirector = (userRole && String(userRole).toLowerCase().indexOf("director") !== -1);
  var isOfficer = (userRole && String(userRole).toLowerCase().indexOf("officer") !== -1);
  var showAllStores = isDirector || isOfficer;
  var storeList = Object.keys(storeSet).sort();
  if (!showAllStores && userStore) storeList = storeList.filter(function(s) { return s === String(userStore).trim(); });

  var now = new Date();
  var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  var startStr = Utilities.formatDate(firstDay, "GMT+7", "yyyy-MM-dd");
  var endStr = Utilities.formatDate(lastDay, "GMT+7", "yyyy-MM-dd");
  var tz = ss.getSpreadsheetTimeZone();
  var todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");

  var ordersByStore = {};
  var outboundByStore = {};
  var leaveByStore = {};
  var attByStore = {};

  try {
    if (typeof getAdminOrders === "function") {
      var orderRes = getAdminOrders(startStr, endStr);
      var orders = (orderRes && orderRes.list) ? orderRes.list : [];
      for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        if (o.status !== "Pending" && o.status !== "대기") continue;
        var st = String(o.store || "").trim();
        if (!st) continue;
        if (!showAllStores && st !== String(userStore || "")) continue;
        ordersByStore[st] = (ordersByStore[st] || 0) + 1;
      }
    }
  } catch (e) {}

  try {
    if (typeof getOutboundHistory === "function") {
      var outList = getOutboundHistory(startStr, endStr, "All");
      for (var j = 0; j < (outList || []).length; j++) {
        var st = String((outList[j].store || "").trim());
        if (!st) continue;
        if (!showAllStores && st !== String(userStore || "")) continue;
        outboundByStore[st] = (outboundByStore[st] || 0) + 1;
      }
    }
  } catch (e) {}

  try {
    if (typeof getLeaveAllData === "function") {
      var leaveData = getLeaveAllData();
      var leaves = (leaveData && leaveData.leaves) ? leaveData.leaves : [];
      for (var k = 0; k < leaves.length; k++) {
        var st = String(leaves[k].status || "").trim();
        if (st !== "대기" && st !== "Pending" && st !== "") continue;
        var lStore = String(leaves[k].store || "").trim();
        if (!lStore) continue;
        if (!showAllStores && lStore !== String(userStore || "")) continue;
        leaveByStore[lStore] = (leaveByStore[lStore] || 0) + 1;
      }
    }
  } catch (e) {}

  try {
    var attSheet = ss.getSheetByName("근태기록");
    if (attSheet && attSheet.getLastRow() > 1) {
      var attData = attSheet.getDataRange().getValues();
      for (var a = 1; a < attData.length; a++) {
        var row = attData[a];
        var rowDate = row[0];
        if (!rowDate) continue;
        var rowDateStr = "";
        try { rowDateStr = Utilities.formatDate(new Date(rowDate), tz, "yyyy-MM-dd"); } catch (err) {}
        if (rowDateStr !== todayStr) continue;
        var approval = (row[13] != null) ? String(row[13]).trim() : "";
        if (approval === "승인완료" || approval === "반려") continue;
        var rowStore = String(row[1] || "").trim();
        if (!rowStore) continue;
        if (!showAllStores && rowStore !== String(userStore || "")) continue;
        attByStore[rowStore] = (attByStore[rowStore] || 0) + 1;
      }
    }
  } catch (e) {}

  var result = [];
  for (var s = 0; s < storeList.length; s++) {
    var storeName = storeList[s];
    result.push({
      store: storeName,
      pendingOrders: ordersByStore[storeName] || 0,
      outboundCount: outboundByStore[storeName] || 0,
      leavePending: leaveByStore[storeName] || 0,
      attendancePending: attByStore[storeName] || 0
    });
  }
  return result;
}


