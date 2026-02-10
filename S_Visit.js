/**
 * [Supabase] 매장 방문 데이터 기록 함수
 * 1. 시트 타임존 자동 동기화
 * 2. GPS 검증: Supabase vendors의 gps_name/name + lat/lng 사용
 * 3. 방문종료 시 체류시간 계산 후 store_visits에 기록
 */
function submitStoreVisit(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var storeNameTrim = String(data.storeName || "").trim();
  if (storeNameTrim && data.lat !== "Unknown" && data.lat !== "" && data.lng !== "") {
    var targetLat = 0, targetLng = 0;
    try {
      var vendors = supabaseSelect("vendors", { limit: 2000 });
      for (var i = 0; i < (vendors || []).length; i++) {
        var v = vendors[i];
        var gpsName = String(v.gps_name || "").trim();
        var name = String(v.name || "").trim();
        if (gpsName === storeNameTrim || (gpsName === "" && name === storeNameTrim)) {
          targetLat = Number(v.lat);
          targetLng = Number(v.lng);
          if (targetLat !== 0 || targetLng !== 0) break;
        }
      }
      if (targetLat !== 0 || targetLng !== 0) {
        var distance = calcDistance(targetLat, targetLng, data.lat, data.lng);
        if (distance > 100) {
          return { success: false, msg: "❌ 위치 부적합! 매장 근처(100m 이내)가 아닙니다.\n(현재 거리: " + Math.round(distance) + "m)" };
        }
      }
    } catch (e) {
      Logger.log("submitStoreVisit GPS 검증: " + e.message);
    }
  }

  var now = new Date();
  var dateStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, tz, "HH:mm:ss");
  var durationMin = null;

  if (data.type === '방문종료') {
    var searchName = String(data.userName).trim();
    var searchStore = String(data.storeName).trim();
    var startRow = null;
    try {
      var filters = ["name=eq." + encodeURIComponent(searchName), "store_name=eq." + encodeURIComponent(searchStore), "visit_type=eq.방문시작"];
      var recent = supabaseSelectFilter("store_visits", filters.join("&"), { order: "visit_date.desc,visit_time.desc", limit: 1 });
      if (recent && recent.length > 0) {
        startRow = recent[0];
      }
    } catch (e) {
      Logger.log("방문시작 조회 오류: " + e.message);
    }
    if (startRow) {
      var startDateStr = String(startRow.visit_date || "").substring(0, 10);
      var startTimeStr = String(startRow.visit_time || "").trim();
      var startDateTime = new Date(startDateStr + "T" + (startTimeStr.length >= 8 ? startTimeStr : startTimeStr + "00").substring(0, 8));
      if (isNaN(startDateTime.getTime())) startDateTime = new Date(startDateStr);
      var diffMs = now.getTime() - startDateTime.getTime();
      durationMin = (!isNaN(diffMs) && diffMs > 0) ? Math.floor(diffMs / (1000 * 60)) : 0;
    } else {
      durationMin = 0;
    }
  }

  try {
    var row = {
      id: "V" + now.getTime(),
      visit_date: dateStr,
      name: data.userName,
      store_name: data.storeName,
      visit_type: data.type,
      purpose: data.purpose || "",
      visit_time: timeStr,
      lat: data.lat || "",
      lng: data.lng || "",
      duration_min: durationMin !== null ? durationMin : 0,
      memo: ""
    };
    supabaseInsert("store_visits", row);
    var msg = "✅ " + data.type + " 완료!";
    if (durationMin !== null && durationMin > 0) msg += " (" + durationMin + "분 체류)";
    return { success: true, msg: msg };
  } catch (e) {
    return { success: false, msg: "❌ 서버 저장 오류: " + e.message };
  }
}

// [서버] 관리자용 방문 기록 조회 - 날짜/매장/직원/부서 필터 (Supabase store_visits)
function getStoreVisitHistory(start, end, store, employeeName, department) {
  var startStr = String(start || "").substring(0, 10);
  var endStr = String(end || "").substring(0, 10);
  var storeFilter = (store === "All" || store === "" || store == null) ? "All" : String(store).trim();
  var empFilter = (employeeName === "All" || employeeName === "" || employeeName == null) ? "All" : String(employeeName).trim();
  var deptFilter = (department === "All" || department === "" || department == null) ? null : String(department).trim();
  var namesInDept = (deptFilter && typeof getOfficeNamesByDept === "function") ? getOfficeNamesByDept(deptFilter) : [];

  var filters = ["visit_date=gte." + startStr, "visit_date=lte." + endStr];
  if (storeFilter !== "All") filters.push("store_name=eq." + encodeURIComponent(storeFilter));
  if (empFilter !== "All") filters.push("name=eq." + encodeURIComponent(empFilter));
  var list = [];
  try {
    list = supabaseSelectFilter("store_visits", filters.join("&"), { order: "visit_date.desc,visit_time.desc", limit: 2000 });
  } catch (e) {
    Logger.log("getStoreVisitHistory: " + e.message);
    return [];
  }
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    var rowName = String(d.name || "").trim();
    var matchDept = (!deptFilter || namesInDept.length === 0 || namesInDept.indexOf(rowName) >= 0);
    if (!matchDept) continue;
    var dateDisplay = String(d.visit_date || "").substring(0, 10);
    var timeDisplay = _formatVisitTimeForDisplay(d.visit_time, d.created_at);
    result.push({
      date: dateDisplay,
      time: timeDisplay,
      name: d.name,
      store: d.store_name,
      type: d.visit_type,
      purpose: d.purpose,
      duration: d.duration_min
    });
  }
  return result;
}

/** visit_time 또는 created_at에서 "HH:mm" 형식 시간 문자열 반환 (목록/통계 표시용) */
function _formatVisitTimeForDisplay(visitTime, createdAt) {
  var t = String(visitTime != null ? visitTime : "").trim();
  if (t.length >= 5) {
    if (t.indexOf("T") >= 0) {
      var iso = t.substring(t.indexOf("T") + 1);
      return iso.length >= 5 ? iso.substring(0, 5) : iso.substring(0, 8);
    }
    return t.length >= 8 ? t.substring(0, 5) : t.substring(0, 5);
  }
  if (createdAt) {
    var isoStr = typeof createdAt === "string" ? createdAt : (createdAt.toISOString ? createdAt.toISOString() : "");
    if (isoStr && isoStr.indexOf("T") >= 0) {
      var timePart = isoStr.substring(isoStr.indexOf("T") + 1);
      return timePart.length >= 5 ? timePart.substring(0, 5) : timePart.substring(0, 8);
    }
  }
  return "";
}

/**
 * [서버] 매장 방문 통계 - 검색 기간 내 부서별/직원별/매장별 투입 시간(분) 집계 (Supabase store_visits)
 */
function getStoreVisitStats(startStr, endStr) {
  startStr = String(startStr || "").substring(0, 10);
  endStr = String(endStr || "").substring(0, 10);
  var visitData = [];
  try {
    visitData = supabaseSelectFilter("store_visits", "visit_date=gte." + startStr + "&visit_date=lte." + endStr, { order: "visit_date", limit: 2000 });
  } catch (e) {
    Logger.log("getStoreVisitStats: " + e.message);
    return { byDept: [], byEmployee: [], byStore: [] };
  }

  var nameToDept = {};
  var empList = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  for (var i = 0; i < empList.length; i++) {
    var st = String(empList[i].store || "").toLowerCase();
    if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue;
    var rowDept = String(empList[i].job || "").trim();
    if (rowDept === "") rowDept = "Staff";
    var nameToShow = (String(empList[i].nick || "").trim() !== "") ? String(empList[i].nick).trim() : String(empList[i].name || "").trim();
    if (nameToShow) nameToDept[nameToShow] = rowDept;
  }

  var byDeptMap = {};
  var byEmployeeMap = {};
  var byStoreMap = {};
  for (var i = 0; i < visitData.length; i++) {
    var d = visitData[i];
    var duration = Number(d.duration_min) || 0;
    if (duration <= 0) continue;
    var name = String(d.name || "").trim();
    var store = String(d.store_name || "").trim();
    var dept = nameToDept[name] || "기타";
    byEmployeeMap[name] = (byEmployeeMap[name] || 0) + duration;
    byStoreMap[store] = (byStoreMap[store] || 0) + duration;
    byDeptMap[dept] = (byDeptMap[dept] || 0) + duration;
  }
  var byDept = [];
  for (var k in byDeptMap) byDept.push({ label: k, minutes: byDeptMap[k] });
  byDept.sort(function(a, b) { return b.minutes - a.minutes; });
  var byEmployee = [];
  for (var k in byEmployeeMap) byEmployee.push({ label: k, minutes: byEmployeeMap[k] });
  byEmployee.sort(function(a, b) { return b.minutes - a.minutes; });
  var byStore = [];
  for (var k in byStoreMap) byStore.push({ label: k, minutes: byStoreMap[k] });
  byStore.sort(function(a, b) { return b.minutes - a.minutes; });
  return { byDept: byDept, byEmployee: byEmployee, byStore: byStore };
}

/**
 * 특정 유저의 현재 방문 진행 상태 확인 (Supabase store_visits)
 */
function checkUserVisitStatus(userName) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var list = [];
  try {
    list = supabaseSelectFilter("store_visits", "visit_date=eq." + today + "&name=eq." + encodeURIComponent(String(userName || "").trim()), { order: "visit_time.desc", limit: 50 });
  } catch (e) {
    return { active: false };
  }
  for (var i = 0; i < list.length; i++) {
    if (list[i].visit_type === "방문시작") {
      return { active: true, storeName: list[i].store_name, purpose: list[i].purpose };
    }
    if (list[i].visit_type === "방문종료") {
      return { active: false };
    }
  }
  return { active: false };
}

/**
 * [서버] 오늘 내 방문 기록 가져오기 (Supabase store_visits)
 */
function getTodayMyVisits(userName) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var searchName = String(userName || "").trim();
  var list = [];
  try {
    list = supabaseSelectFilter("store_visits", "visit_date=eq." + todayStr + "&name=eq." + encodeURIComponent(searchName), { order: "visit_time.desc", limit: 20 });
  } catch (e) {
    return [];
  }
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    result.push({
      time: _formatVisitTimeForDisplay(row.visit_time, row.created_at) || String(row.visit_time || ""),
      store: row.store_name,
      type: row.visit_type,
      duration: row.duration_min
    });
  }
  return result;
}